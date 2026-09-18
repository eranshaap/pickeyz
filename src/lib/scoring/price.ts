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
// no_new_price | no_anchor_curve | not_an_anchor_point. Confidence therefore counts it once.
//
// Day 18 (§5): the gate is the MODEL-YEAR, not an age range. The anchor applies to a listing if and only if its
// (make, model, year) is one of pool_stats.anchor_points — a point the line was fitted through. Then the curve is
// read at the listing's current age, whatever that age is; otherwise the row is unavailable with
// anchor_unavailable 'not_an_anchor_point'. anchor_age_min_years / anchor_age_max_years describe the fit and are
// no longer read. A pool row written before anchor_points existed (null) has no points, so nothing is anchored.
//
// Age (P2, as Day 19 §3 freezes it): years with decimals from cars.first_registration to the day the
// listing's CURRENT PRICE was observed; when first_registration is null, from 1 January of cars.year, and
// raw.age_source says which was used. The anchor row is the only price path that reads an age at all — the
// cell-median row compares two prices and needs none — so the price's observation date enters here and
// nowhere else. Nothing reads a clock.

import { ageYears } from "./age";
import { MIN_SAMPLE } from "./constants";
import type { Row, ScoringInput } from "./types";
import { round } from "./util";

export type AgeSource = "first_registration" | "year_jan_1";

// P2. Exported because the anchor's age is the one age the engine computes from a date it may not have.
// Day 19 (§3.2, §3.3): `at` is the day the price being scored was observed — the same fallback, the same
// age_source, measured to that day instead of to the run clock.
export function anchorAge(car: ScoringInput["car"], at: Date): { age: number; age_source: AgeSource } {
  if (car.first_registration !== null) {
    return { age: ageYears(car.first_registration, at), age_source: "first_registration" };
  }
  return { age: ageYears(new Date(Date.UTC(car.year, 0, 1)), at), age_source: "year_jan_1" };
}

export function priceRow(input: ScoringInput): Row {
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
    const { age, age_source } = anchorAge(car, listing.price_observed_at);
    Object.assign(raw, {
      new_price: listing.new_price,
      new_car_price_id: listing.new_car_price_id,
      age,
      // Day 19 (§3.2): the anchor row records the date its age was read at, next to the age itself. The
      // cell-median row below gains nothing — it reads no age.
      price_observed_at: listing.price_observed_at.toISOString(),
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
    // P4: the values are null together — one row, no curve anywhere.
    if (intercept === null || perYear === null || errorPct === null) {
      raw.anchor_unavailable = "no_anchor_curve";
      return { row: "price", status: "unavailable", reason: "thin_cell", raw };
    }
    // Day 18 (§5): the model-year gate.
    const point = (pool_stats?.anchor_points ?? []).find((p) => p.make === car.make && p.model === car.model && p.year === car.year);
    if (point === undefined) {
      raw.anchor_unavailable = "not_an_anchor_point";
      return { row: "price", status: "unavailable", reason: "thin_cell", raw };
    }

    const ratio = intercept + perYear * age;
    const anchor = listing.new_price * ratio;
    if (anchor <= 0) throw new Error(`price row: listing ${listing.id} — the anchor curve gives ratio ${ratio} at age ${age}, anchor ${anchor}`);
    Object.assign(raw, { ratio, anchor, anchor_point: { n: point.n, ratio: point.ratio, median_age: point.median_age } });
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
