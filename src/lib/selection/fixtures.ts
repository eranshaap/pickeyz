// Test fixtures for src/lib/selection/*.test.ts — a CandidateListing with a minimal valid invoice, every field
// overridable. The invoice sums follow the engine's formulas (src/lib/scoring/index.ts header) so that a fixture
// is internally consistent; nothing here is used by the library itself.

import type { Row, ScoreResult } from "../scoring/types";
import type { CandidateListing } from "./types";

export type Spec = {
  id: number;
  car?: number; // default: id
  price?: number; // default 100000
  median?: number | null; // the cell's median price; default 100000; null → price row unavailable (no_market_row)
  new_price?: number | null; // the car's new list price (part 5 §3); default null → above_new_price not evaluated
  thin?: boolean; // price row unavailable with reason thin_cell (median_price passed as null)
  first_seen?: string; // ISO; default 2026-08-01
  year?: number; // default 2021
  cell?: string; // comparison_group; default "G"
  visible?: boolean; // seller_visible; default true
  sold?: "strong" | "medium" | null; // default null
  // invoice rows, in percent of value
  price_v?: number; // default: -100 * (price - median) / median, rounded to 1 decimal
  history?: number | null; // paper history value; null → history row unavailable → condition null. default 0
  reality?: number; // history value_by_reality; default = history
  km?: number | null; // km row value; null → km row unavailable (official_is_intake). default 0
  typical?: number | null; // the cell's median condition; default 0; null → thin-like: typical_condition null
};

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function invoice(s: Spec): ScoreResult {
  const price = s.price ?? 100000;
  const median = s.median === undefined ? 100000 : s.median;
  const history = s.history === undefined ? 0 : s.history;
  const reality = s.reality ?? (history ?? 0);
  const km = s.km === undefined ? 0 : s.km;
  const typical = s.typical === undefined ? 0 : s.typical;

  let priceRow: Row;
  if (s.thin) priceRow = { row: "price", status: "unavailable", reason: "thin_cell", raw: { price, median_price: median, sample_size: 1 } };
  else if (median === null) priceRow = { row: "price", status: "unavailable", reason: "no_market_row", raw: { price } };
  else priceRow = { row: "price", status: "scored", source: "market", value: s.price_v ?? r1((-100 * (price - median)) / median), raw: { price, median_price: median } };

  const historyRow: Row =
    history === null
      ? { row: "history", status: "unavailable", source: "mot", reason: "no_ownership_history", raw: {} }
      : { row: "history", status: "scored", source: "mot", value: history, value_by_reality: reality, raw: {} };
  const kmRow: Row =
    km === null
      ? { row: "km", status: "unavailable", source: "mot", reason: "official_is_intake", raw: {} }
      : { row: "km", status: "scored", source: "mot", value: km, raw: {} };

  const condition_score = history === null ? null : r1(history + (km ?? 0));
  const condition_by_reality = history === null ? null : r1(reality + (km ?? 0));
  const price_advantage = priceRow.status === "scored" ? (priceRow.value as number) : null;
  // Day 14 §9.2: the field is renamed (typical_condition → typical_history) and the version bumped.
  // The fixture's own arithmetic is NOT touched — it builds ScoreResult literals for the selection tests,
  // which read condition_vs_typical and deal_score; how it derives them is not a rule of this brief.
  const typical_history = price_advantage !== null && typical !== null ? typical : null;
  const condition_vs_typical = condition_score !== null && typical_history !== null ? r1(condition_score - typical_history) : null;
  const deal_score = price_advantage !== null && condition_vs_typical !== null ? r1(price_advantage + condition_vs_typical) : null;

  const result: ScoreResult = {
    engine_version: 3,
    unit: "pct_of_value",
    rows: [priceRow, historyRow, kmRow],
    condition_score,
    condition_by_reality,
    typical_history,
    condition_vs_typical,
    price_advantage,
    deal_score,
    checks: [
      { check: "hand", status: "unavailable", reason: "fixture" },
      { check: "km", status: "unavailable", reason: "fixture" },
    ],
    sold_signal: { strength: s.sold ?? null, evidence: s.sold ? ["fixture"] : [] },
    facts: { dealer_transfers: null, months_since_test: null, km_per_month_since_test: null, test_expiry: null, months_left: null },
    confidence: { level: "high", items: [] },
  };
  if (km === null && history !== null) result.partial = ["km"];
  return result;
}

export function cand(s: Spec): CandidateListing {
  const price = s.price ?? 100000;
  const median = s.median === undefined ? 100000 : s.median;
  return {
    listing_id: s.id,
    car_id: s.car ?? s.id,
    price,
    first_seen_at: s.first_seen ?? "2026-08-01T00:00:00.000Z",
    year: s.year ?? 2021,
    comparison_group: s.cell ?? "G",
    median_price: s.thin ? null : median,
    new_price: s.new_price === undefined ? null : s.new_price,
    seller_visible: s.visible ?? true,
    breakdown: invoice(s),
  };
}
