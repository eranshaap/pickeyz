// The `search_results` rows of one search (BRIEF Days 15–16, Run 2b §4; Run 2c §4–§5). Pure: no database, no
// clock, no randomness — the mapping alone, so it can be tested without a search and read without a schema in
// hand.
//
// WHAT A ROW IS: one row per listing of the CUT POOL — the pool after the filters, exactly what entered
// selectThree(). `pool_count` rows, no more and no fewer, ranked and unranked alike: a merged duplicate and an
// excluded listing are part of the answer too, and their reason is in the trace.
//
// WHAT A ROW IS NOT: a recomputation, and — since Run 2c §5 — not a copy of the invoice either. Every value
// here is a SNAPSHOT of what the listing carried at that moment: the stored score, the confidence, the price
// and the km as they read then, plus POINTERS to the three norm rows, the new-car price row and the
// `listing_scores` row the invoice lives in. Those tables are append-only, so a pointer never dangles and a
// result stays reconstructable after the listing moves or the next norms run lands.
//
// THE TRACE, Run 2c §4 — the only place this module DROPS anything, and it drops records, never facts:
//   rank <= TRACE_FULL_RANK, or the row is RECOMMENDED   every rule record selectThree produced
//   any other ranked row                                 only the records that triggered
//   rank = null                                          only the records that ACTED (effect !== 'none'),
//                                                        plus any triggered ones
// A row whose trace is truncated is still a row: the rule is about size, not about which listings are kept.
// "Recommended" is a non-empty `recommendation_categories` and nothing else — Run 2c §1 dropped the
// `was_recommended` column as redundant with it.

import type { Category, ListingResult, RuleTrace, SelectionResult } from "@/lib/selection";
import type { Invoice } from "@/lib/scoring/types";

// ledger: Stage B rules block, TRACE_FULL_RANK — a guess
//
// Run 2b's §0.3 was a RANK RULE ONLY, and that is what Run 2c §4 changes: only the best_value winner is
// guaranteed rank 1, so a peace_of_mind or cheapest winner could sit at rank 11 and keep its triggered
// records alone — listing 192 read `trace 0` in Run 2b's read-back. A recommended row now carries the full
// set whatever its rank, because the row the screen will one day explain is exactly that row.
export const TRACE_FULL_RANK = 10;

// The per-listing snapshot the caller hands over — the subset of assemble.ts's PoolItem this module reads,
// plus the `listing_scores` pointer run.ts resolves (§5). It is stated as its own type so the mapping can be
// tested on a literal, with no pool to assemble.
export type ResultSnapshot = {
  listing_id: number;
  price: number;
  km_declared: number | null;
  score: number | null;
  breakdown: Invoice; // NOT copied into the row (§5) — `confidence` is read from it, nothing else
  market_stats_id: number | null;
  model_stats_id: number | null;
  pool_stats_id: number | null;
  new_car_price_id: number | null;
  listing_scores_id: number | null; // §0.5, resolved by latestScoreIdByListing(); null when never scored
};

// One `search_results` row, column for column (prisma/schema.prisma, model search_results). `id` is the
// database's. stage_b_trace is the JSON column and is handed over as read.
export type SearchResultRow = {
  search_id: number;
  listing_id: number;
  rank: number | null;
  total_score: number | null;
  confidence: string | null;
  market_stats_id: number | null;
  model_stats_id: number | null;
  pool_stats_id: number | null;
  new_car_price_id: number | null;
  listing_scores_id: number | null;
  recommendation_categories: Category[];
  stage_b_trace: RuleTrace[];
  price_snapshot: number;
  km_snapshot: number | null;
};

/** §4 — how much of one listing's trace the row carries. */
export function traceFor(result: ListingResult): RuleTrace[] {
  if (result.rank === null) return result.trace.filter((t) => t.effect !== "none" || t.triggered);
  if (result.rank <= TRACE_FULL_RANK || result.categories.length > 0) return result.trace;
  return result.trace.filter((t) => t.triggered);
}

// One `listing_scores` row as §0.5 reads it: which row, for which listing, scored when.
export type ScoreRowRef = { id: number; listing_id: number; scored_at: Date };

/**
 * §0.5 — the `listing_scores` row current at the search's moment, per listing.
 *
 * The latest `scored_at` that is <= `now`; ties go to the highest id; a listing with no such row is simply
 * absent from the map, and the row that quotes it stores null. A row scored AFTER the search's `now` is not
 * the row the search saw, so it is skipped — the table is append-only and a re-score can land at any time.
 *
 * Pure on purpose: run.ts fetches, this decides, and the decision is tested without a database.
 */
export function latestScoreIdByListing(rows: ScoreRowRef[], now: Date): Map<number, number> {
  const best = new Map<number, ScoreRowRef>();
  for (const r of rows) {
    if (r.scored_at.getTime() > now.getTime()) continue;
    const seen = best.get(r.listing_id);
    if (seen === undefined || r.scored_at.getTime() > seen.scored_at.getTime() || (r.scored_at.getTime() === seen.scored_at.getTime() && r.id > seen.id)) {
      best.set(r.listing_id, r);
    }
  }
  const out = new Map<number, number>();
  for (const [listing_id, r] of best) out.set(listing_id, r.id);
  return out;
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
      confidence: p.breakdown.confidence?.level ?? null, // Day 18: a cancelled invoice has no confidence
      market_stats_id: p.market_stats_id,
      model_stats_id: p.model_stats_id,
      pool_stats_id: p.pool_stats_id,
      new_car_price_id: p.new_car_price_id,
      listing_scores_id: p.listing_scores_id,
      recommendation_categories: r.categories,
      stage_b_trace: traceFor(r),
      price_snapshot: p.price,
      km_snapshot: p.km_declared,
    });
  }
  return rows;
}
