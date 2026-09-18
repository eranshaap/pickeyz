// Test fixtures for src/lib/selection/*.test.ts — a CandidateListing with a minimal valid invoice, every field
// overridable. The invoice sums follow the engine's formulas (src/lib/scoring/index.ts header) so that a fixture
// is internally consistent; nothing here is used by the library itself.

import type { CancelledResult, ConfidenceItem, ConfidenceLevel, Row, RowSource, ScoreResult } from "../scoring/types";
import type { CandidateListing } from "./types";
import { ENGINE_VERSION } from "../scoring/constants";

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
  history_source?: RowSource; // Day 14: how the history row was sourced — 'mot' (the registry) or 'typical' (the cell's median, engine §0.4). default 'mot'
  reality?: number; // history value_by_reality; default = history
  km?: number | null; // km row value; null → km row unavailable (official_is_intake). default 0
  typical?: number | null; // Day 14: the cell's typical history (median_history); default 0; null → typical_history null
  confidence?: ConfidenceLevel; // the invoice's confidence level; default "high"
  confidence_items?: ConfidenceItem[]; // the items behind the level; default []
  cancelled?: string; // Day 18: 'YYYY-MM-DD' → the engine's cancelled invoice instead of a scored one (every invoice field above is ignored)
};

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

// Day 18 (engine v4 §8): the cancelled invoice, exactly the engine's shape.
export function cancelledInvoice(cancelled_at: string): CancelledResult {
  return {
    engine_version: ENGINE_VERSION,
    reason: "cancelled",
    cancelled_at,
    rows: [],
    condition_score: null,
    condition_by_reality: null,
    typical_history: null,
    condition_vs_typical: null,
    price_advantage: null,
    deal_score: null,
    confidence: null,
  };
}

export function invoice(s: Spec): ScoreResult {
  const price = s.price ?? 100000;
  const median = s.median === undefined ? 100000 : s.median;
  const history = s.history === undefined ? 0 : s.history;
  const reality = s.reality ?? (history ?? 0);
  const km = s.km === undefined ? 0 : s.km;
  const typical = s.typical === undefined ? 0 : s.typical;
  const historySource: RowSource = s.history_source ?? "mot";

  let priceRow: Row;
  if (s.thin) priceRow = { row: "price", status: "unavailable", reason: "thin_cell", raw: { price, median_price: median, sample_size: 1 } };
  else if (median === null) priceRow = { row: "price", status: "unavailable", reason: "no_market_row", raw: { price } };
  else priceRow = { row: "price", status: "scored", source: "market", value: s.price_v ?? r1((-100 * (price - median)) / median), raw: { price, median_price: median } };

  // Day 14: the history row's `source` is what the unverified_history rule reads (rules v5 §0.1). An unavailable row
  // carries no source: there is no reading to have sourced.
  const historyRow: Row =
    history === null
      ? { row: "history", status: "unavailable", reason: "no_ownership_history", raw: {} }
      : {
          row: "history",
          status: "scored",
          source: historySource,
          value: history,
          value_by_reality: reality,
          ...(historySource === "typical" ? { note: "assumed_typical" } : {}),
          raw: {},
        };
  const kmRow: Row =
    km === null
      ? { row: "km", status: "unavailable", source: "mot", reason: "official_is_intake", raw: {} }
      : { row: "km", status: "scored", source: "mot", value: km, raw: {} };

  // Day 14 run B (§5.9): the sums, on v3 arithmetic — the four the library reads, each derived the way the engine
  // derives it (src/lib/scoring/types.ts), so a fixture invoice is internally consistent:
  //   condition_score      = history + km
  //   condition_by_reality = value_by_reality + km
  //   condition_vs_typical = (history − typical_history) + km   ← the km row is a deviation, not centred again
  //   deal_score           = price_advantage + condition_vs_typical
  const condition_score = history === null ? null : r1(history + (km ?? 0));
  const condition_by_reality = history === null ? null : r1(reality + (km ?? 0));
  const price_advantage = priceRow.status === "scored" ? (priceRow.value as number) : null;
  const typical_history = price_advantage !== null && typical !== null ? typical : null;
  const condition_vs_typical = history !== null && typical_history !== null ? r1(history - typical_history + (km ?? 0)) : null;
  const deal_score = price_advantage !== null && condition_vs_typical !== null ? r1(price_advantage + condition_vs_typical) : null;

  const result: ScoreResult = {
    engine_version: ENGINE_VERSION,
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
    facts: { dealer_transfers: null, months_since_test: null, km_per_month_since_test: null, test_expiry: null, current_owner_registry: null },
    confidence: { level: s.confidence ?? "high", items: s.confidence_items ?? [] },
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
    median_price: s.thin || s.cancelled !== undefined ? null : median,
    new_price: s.new_price === undefined ? null : s.new_price,
    seller_visible: s.visible ?? true,
    breakdown: s.cancelled !== undefined ? cancelledInvoice(s.cancelled) : invoice(s),
  };
}
