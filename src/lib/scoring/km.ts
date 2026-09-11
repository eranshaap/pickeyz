// The km row (BRIEF §4.3): declared km against the cell's median km, per year of age, as % of value.
// Under the median = positive = in the buyer's favor. The median is built on declared km, so both
// sides are declared and the source is 'ad'.
//
// Day 14 (§0.3): the slope is the MODEL's own, signed as measured (more km → negative), and the engine
// multiplies by it as is:
//
//   value = clamp(slope × km_dev_per_year / 1000, ±KM_CAP_PCT)
//
// Floor: the model's slope counts only from KM_SLOPE_MIN_SAMPLE listings in its regression; below that
// (and when the model has no row at all, or its slope could not be measured) the row uses the default
// KM_SLOPE_PCT_PER_1000_PER_YEAR, which is now signed the same way. raw records which was used and why:
// slope_source names the choice, km_slope_n is the number it was made on. §9.3: the row also carries
// based_on_n — it compares against the cell's median_km, so the same "based on N listings" fact applies.

import { AGE_FLOOR_YEARS, KM_CAP_PCT, KM_SLOPE_MIN_SAMPLE, KM_SLOPE_PCT_PER_1000_PER_YEAR, MIN_SAMPLE } from "./constants";
import type { ModelNorm, Row, ScoringInput } from "./types";
import { clamp, round } from "./util";

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export type SlopeChoice = { slope_used: number; slope_source: "model" | "default"; km_slope_n: number | null; model_stats_id: number | null };

// §0.3. The model's slope is written by the norms run whatever its n; the floor decides only whether the
// engine uses it. A model row that carries no slope at all falls back like a missing row.
export function slopeFor(model: ModelNorm | null): SlopeChoice {
  if (model === null) {
    return { slope_used: KM_SLOPE_PCT_PER_1000_PER_YEAR, slope_source: "default", km_slope_n: null, model_stats_id: null };
  }
  const useModel = model.km_slope !== null && model.km_slope_n >= KM_SLOPE_MIN_SAMPLE;
  return {
    slope_used: useModel ? (model.km_slope as number) : KM_SLOPE_PCT_PER_1000_PER_YEAR,
    slope_source: useModel ? "model" : "default",
    km_slope_n: model.km_slope_n,
    model_stats_id: model.id,
  };
}

export function kmRow(input: ScoringInput, now: Date): Row {
  const { listing, car, market } = input;
  const slope = slopeFor(input.model_stats);
  const raw: Record<string, unknown> = { km_declared: listing.km_declared, ...slope };
  if (listing.km_declared === null) return { row: "km", status: "unavailable", reason: "no_km", raw };
  if (market === null) return { row: "km", status: "unavailable", reason: "no_market_row", raw };
  raw.median_km = market.median_km;
  raw.based_on_n = market.sample_size; // §9.3: this row compares against median_km — same N as the price row
  if (market.sample_size < MIN_SAMPLE) return { row: "km", status: "unavailable", reason: "thin_cell", raw };
  // §4.3 lists no reason for a full cell whose pool has no declared km; 'no_median_km' names that case.
  if (market.median_km === null) return { row: "km", status: "unavailable", reason: "no_median_km", raw };
  if (car.first_registration === null) return { row: "km", status: "unavailable", reason: "no_registration_date", raw };

  const age_years = Math.max((now.getTime() - car.first_registration.getTime()) / YEAR_MS, AGE_FLOOR_YEARS);
  const km_dev_per_year = (listing.km_declared - market.median_km) / age_years;
  const value = clamp((slope.slope_used * km_dev_per_year) / 1000, -KM_CAP_PCT, KM_CAP_PCT);
  return {
    row: "km",
    status: "scored",
    source: "ad",
    value: round(value),
    raw: { km_declared: listing.km_declared, median_km: market.median_km, based_on_n: market.sample_size, age_years, km_dev_per_year, ...slope },
  };
}
