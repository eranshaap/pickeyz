// The price row (BRIEF §4.1): the asking price against the cell's median, as % of value.
// Positive = cheaper than the median = in the buyer's favor.
//
// Day 14 (§0.5): a THIN cell (sample_size < MIN_SAMPLE) has no median worth comparing against, so the row
// falls back to the ANCHOR — the listing's own new-car price walked down the pool's depreciation curve:
//
//   ratio  = pool.anchor_ratio_intercept + pool.anchor_ratio_per_year × age
//   anchor = listing.new_price × ratio
//
// and the row scores the asking price against that anchor by the same formula it uses against a median.
// The anchor fills the PRICE ROW ONLY. The km row and the history typical do not exist in a thin cell,
// so a thin-cell listing still ends with no deal score — it is listed with the reason, never a pick.
//
// §9.7: the thin cell is one root cause, so when the anchor cannot be built the row's reason stays
// 'thin_cell' (the km row's reason too) and raw.anchor_unavailable names which piece was missing —
// no_new_price | no_anchor_curve | age_outside_anchor_range. Confidence therefore counts it once.
//
// Age (P2): years with decimals from cars.first_registration to the run's `now`; when first_registration
// is null, from 1 January of cars.year, and raw.age_source says which was used. Nothing reads a clock.

import { MIN_SAMPLE } from "./constants";
import type { Row, ScoringInput } from "./types";
import { round } from "./util";

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export type AgeSource = "first_registration" | "year_jan_1";

// P2. Exported because the anchor's age is the one age the engine computes from a date it may not have.
export function anchorAge(car: ScoringInput["car"], now: Date): { age: number; age_source: AgeSource } {
  if (car.first_registration !== null) {
    return { age: (now.getTime() - car.first_registration.getTime()) / YEAR_MS, age_source: "first_registration" };
  }
  return { age: (now.getTime() - Date.UTC(car.year, 0, 1)) / YEAR_MS, age_source: "year_jan_1" };
}

export function priceRow(input: ScoringInput, now: Date): Row {
  const { listing, car, market, pool_stats } = input;
  if (market === null) {
    return { row: "price", status: "unavailable", reason: "no_market_row", raw: { price: listing.price } };
  }
  const raw: Record<string, unknown> = {
    price: listing.price,
    median_price: market.median_price,
    market_stats_id: market.id,
    sample_size: market.sample_size,
    window_days: market.window_days,
  };

  // ---- thin cell: the anchor (§0.5) ----
  if (market.sample_size < MIN_SAMPLE) {
    // §9.6: a thin cell cannot have a typical (P1 needs MIN_SAMPLE listings WITH a record inside a cell
    // that has fewer than MIN_SAMPLE listings in total). A row that carries both is an invariant violation,
    // not a case to handle — same precedent as median_price <= 0. The norms run asserts it before writing
    // (§9.10), so this throw is unreachable from our own data.
    if (market.median_history !== null) {
      throw new Error(
        `price row: market_stats ${market.id} is thin (sample_size ${market.sample_size} < ${MIN_SAMPLE}) but carries median_history ${market.median_history}`,
      );
    }
    const { age, age_source } = anchorAge(car, now);
    Object.assign(raw, {
      new_price: listing.new_price,
      new_car_price_id: listing.new_car_price_id,
      age,
      age_source,
      ratio: null,
      anchor: null,
      error_pct: pool_stats === null ? null : pool_stats.anchor_error_pct,
      pool_stats_id: pool_stats === null ? null : pool_stats.id,
    });
    // §9.7: a thin cell is ONE root cause. When the anchor cannot be built the row's reason stays
    // 'thin_cell' — the same reason the km row carries — and the sub-reason goes to raw.anchor_unavailable,
    // so confidence counts the thin cell once and the listing stays 'medium', never 'low' for being thin.
    if (listing.new_price === null) {
      raw.anchor_unavailable = "no_new_price";
      return { row: "price", status: "unavailable", reason: "thin_cell", raw };
    }
    if (listing.new_price <= 0) throw new Error(`price row: listing ${listing.id} has new_price ${listing.new_price}`);

    const intercept = pool_stats?.anchor_ratio_intercept ?? null;
    const perYear = pool_stats?.anchor_ratio_per_year ?? null;
    const errorPct = pool_stats?.anchor_error_pct ?? null;
    const ageMin = pool_stats?.anchor_age_min_years ?? null;
    const ageMax = pool_stats?.anchor_age_max_years ?? null;
    // P4: the five values are null together — one row, no curve anywhere.
    if (intercept === null || perYear === null || errorPct === null || ageMin === null || ageMax === null) {
      raw.anchor_unavailable = "no_anchor_curve";
      return { row: "price", status: "unavailable", reason: "thin_cell", raw };
    }
    if (age < ageMin || age > ageMax) {
      Object.assign(raw, { age_min: ageMin, age_max: ageMax, anchor_unavailable: "age_outside_anchor_range" });
      return { row: "price", status: "unavailable", reason: "thin_cell", raw };
    }

    const ratio = intercept + perYear * age;
    const anchor = listing.new_price * ratio;
    if (anchor <= 0) throw new Error(`price row: listing ${listing.id} — the anchor curve gives ratio ${ratio} at age ${age}, anchor ${anchor}`);
    Object.assign(raw, { ratio, anchor, age_min: ageMin, age_max: ageMax });
    const value = (-100 * (listing.price - anchor)) / anchor;
    // §9.9: note is a CODE, not prose — the display layer maps it to text (Hebrew labels, Day 18).
    // The error percentage the label needs is raw.error_pct.
    return { row: "price", status: "scored", source: "anchor", value: round(value), note: "vs_new_price", raw };
  }

  // ---- the cell's own median ----
  if (market.median_price <= 0) throw new Error(`price row: market_stats ${market.id} has median_price ${market.median_price}`);
  raw.based_on_n = market.sample_size; // §0.6 "based on N listings"
  const value = (-100 * (listing.price - market.median_price)) / market.median_price;
  return { row: "price", status: "scored", source: "market", value: round(value), raw };
}
