// The km row (BRIEF §4.3): declared km against the cell's median km, per year of age, as % of value.
// Under the median = positive = in the buyer's favor. The median is built on declared km, so both
// sides are declared and the source is 'ad'.

import { AGE_FLOOR_YEARS, KM_CAP_PCT, KM_SLOPE_PCT_PER_1000_PER_YEAR, MIN_SAMPLE } from "./constants";
import type { Row, ScoringInput } from "./types";
import { clamp, round } from "./util";

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export function kmRow(input: ScoringInput, now: Date): Row {
  const { listing, car, market } = input;
  const raw: Record<string, unknown> = { km_declared: listing.km_declared };
  if (listing.km_declared === null) return { row: "km", status: "unavailable", reason: "no_km", raw };
  if (market === null) return { row: "km", status: "unavailable", reason: "no_market_row", raw };
  raw.median_km = market.median_km;
  if (market.sample_size < MIN_SAMPLE) return { row: "km", status: "unavailable", reason: "thin_cell", raw };
  // §4.3 lists no reason for a full cell whose pool has no declared km; 'no_median_km' names that case.
  if (market.median_km === null) return { row: "km", status: "unavailable", reason: "no_median_km", raw };
  if (car.first_registration === null) return { row: "km", status: "unavailable", reason: "no_registration_date", raw };

  const age_years = Math.max((now.getTime() - car.first_registration.getTime()) / YEAR_MS, AGE_FLOOR_YEARS);
  const km_dev_per_year = (listing.km_declared - market.median_km) / age_years;
  const value = clamp((-KM_SLOPE_PCT_PER_1000_PER_YEAR * km_dev_per_year) / 1000, -KM_CAP_PCT, KM_CAP_PCT);
  return {
    row: "km",
    status: "scored",
    source: "ad",
    value: round(value),
    raw: { km_declared: listing.km_declared, median_km: market.median_km, age_years, km_dev_per_year },
  };
}
