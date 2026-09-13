// The `search_results` rows of one search (BRIEF Days 15–16, Run 2b §4). Pure: no database, no clock, no
// randomness — the mapping alone, so it can be tested without a search and read without a schema in hand.
//
// WHAT A ROW IS: one row per listing of the CUT POOL — the pool after the filters, exactly what entered
// selectThree(). `pool_count` rows, no more and no fewer, ranked and unranked alike: a merged duplicate and an
// excluded listing are part of the answer too, and their reason is in the trace.
//
// WHAT A ROW IS NOT: a recomputation. Every value here is a SNAPSHOT of what the listing carried at that
// moment — the stored score, the stored invoice, the price and the km as they read then, and the three norm
// pointers plus the new-price pointer as the listing held them. Nothing is derived a second time, so a result
// stays reconstructable after the listing moves or the next norms run lands.
//
// THE TRACE, §0.3 — the only place this module DROPS anything, and it drops records, never facts:
//   rank <= 10     every rule record selectThree produced for the listing
//   rank > 10      only the records that triggered
//   rank = null    only the records that ACTED (effect !== 'none'), plus any triggered ones
// A row whose trace is truncated is still a row: the rule is about size, not about which listings are kept.

import type { Category, ListingResult, RuleTrace, SelectionResult } from "@/lib/selection";
import type { ScoreResult } from "@/lib/scoring/types";

// rank <= FULL_TRACE_RANK carries the whole trace (§0.3).
//
// §0.3 IS A RANK RULE, NOT A PICK RULE, and the two are not the same set. Only the best_value winner is
// guaranteed rank 1; peace_of_mind and cheapest are won on their own orders and land wherever they land. A
// recommended listing at rank 11 therefore keeps only its TRIGGERED records — and a listing that triggered
// nothing keeps an empty trace, recommended or not. That is what the brief says, so that is what happens
// here; the consequence is reported, not worked around.
export const FULL_TRACE_RANK = 10;

// The per-listing snapshot the caller hands over — the subset of assemble.ts's PoolItem this module reads.
// It is stated as its own type so the mapping can be tested on a literal, with no pool to assemble.
export type ResultSnapshot = {
  listing_id: number;
  price: number;
  km_declared: number | null;
  score: number | null;
  breakdown: ScoreResult;
  market_stats_id: number | null;
  model_stats_id: number | null;
  pool_stats_id: number | null;
  new_car_price_id: number | null;
};

// One `search_results` row, column for column (prisma/schema.prisma, model search_results). `id` is the
// database's. score_breakdown and stage_b_trace are the JSON columns and are handed over as read.
export type SearchResultRow = {
  search_id: number;
  listing_id: number;
  rank: number | null;
  total_score: number | null;
  score_breakdown: ScoreResult | null;
  confidence: string | null;
  market_stats_id: number | null;
  model_stats_id: number | null;
  pool_stats_id: number | null;
  new_car_price_id: number | null;
  was_recommended: boolean;
  recommendation_categories: Category[];
  stage_b_trace: RuleTrace[];
  price_snapshot: number;
  km_snapshot: number | null;
};

/** §0.3 — how much of one listing's trace the row carries. */
export function traceFor(result: ListingResult): RuleTrace[] {
  if (result.rank === null) return result.trace.filter((t) => t.effect !== "none" || t.triggered);
  if (result.rank <= FULL_TRACE_RANK) return result.trace;
  return result.trace.filter((t) => t.triggered);
}

/**
 * The rows of one search.
 *
 * @param searchId       the `searches` row these belong to — written in the same transaction, never before it
 * @param poolListings   the CUT pool, in the order the rows should be written; one row comes out per entry
 * @param selection      selectThree()'s output over exactly that pool
 *
 * Every pool listing must have a result and every result must be a pool listing. A mismatch is a stop, not a
 * skipped row: a `search_results` set that is missing a listing is a silently wrong answer to "what did this
 * search see", and that is the one thing this table exists to make impossible.
 */
export function toSearchResultRows(searchId: number, poolListings: ResultSnapshot[], selection: SelectionResult): SearchResultRow[] {
  const resultOf = new Map(selection.results.map((r) => [r.listing_id, r]));
  if (resultOf.size !== selection.results.length) throw new Error("toSearchResultRows: selectThree returned two results for one listing_id");
  if (poolListings.length !== selection.results.length) {
    throw new Error(`toSearchResultRows: the cut pool has ${poolListings.length} listing(s) but selectThree returned ${selection.results.length} result(s) — they are not the same pool`);
  }

  const rows: SearchResultRow[] = [];
  const seen = new Set<number>();
  for (const p of poolListings) {
    if (seen.has(p.listing_id)) throw new Error(`toSearchResultRows: listing ${p.listing_id} appears twice in the cut pool`);
    seen.add(p.listing_id);
    const r = resultOf.get(p.listing_id);
    if (r === undefined) throw new Error(`toSearchResultRows: listing ${p.listing_id} is in the cut pool but selectThree returned no result for it`);
    rows.push({
      search_id: searchId,
      listing_id: p.listing_id,
      rank: r.rank,
      total_score: p.score,
      score_breakdown: p.breakdown,
      confidence: p.breakdown.confidence.level,
      market_stats_id: p.market_stats_id,
      model_stats_id: p.model_stats_id,
      pool_stats_id: p.pool_stats_id,
      new_car_price_id: p.new_car_price_id,
      was_recommended: r.categories.length > 0,
      recommendation_categories: r.categories,
      stage_b_trace: traceFor(r),
      price_snapshot: p.price,
      km_snapshot: p.km_declared,
    });
  }
  return rows;
}
