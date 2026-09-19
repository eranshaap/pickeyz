// Day 19 (Run 5c2, §5.3) — where a pool item's five score fields come from.
//
// The pool assembly reads a listing's score out of the listings row: score_breakdown, score, and the three
// norm pointers market_stats_id / model_stats_id / pool_stats_id. The picks preview (§5.2, §7) has to build
// the same pool out of scores that are NOT in the database — the ones the dry scoring run has just computed —
// so that one decision is this pure function, and `assemblePool` and `assemblePoolPreview` share everything else.
//
// Pure on purpose: no `db` import, so it is tested without a database.

import type { Invoice } from "@/lib/scoring/types";

/** One listing's score, whatever its source: the invoice, the deal score, and the three norm rows it points at. */
export type PoolScore = {
  breakdown: Invoice;
  score: number | null;
  market_stats_id: number | null;
  model_stats_id: number | null;
  pool_stats_id: number | null;
};

/**
 * Which side's scores to assemble: the listings' own columns, or a map keyed by listing id.
 * A listing that the map does not mention has no score on that side — exactly as a null score_breakdown means
 * it has none on the stored side.
 */
export type PoolScoreSource = "stored" | ReadonlyMap<number, PoolScore>;

/** The five columns the stored side reads. `score_breakdown` arrives as Prisma's Json — null when never scored. */
export type StoredScoreColumns = {
  id: number;
  score_breakdown: unknown;
  score: number | null;
  market_stats_id: number | null;
  model_stats_id: number | null;
  pool_stats_id: number | null;
};

/**
 * The listing's five score fields on the requested side, or null when it has no score there.
 *
 * The three norm ids come from the SAME side as the invoice — with a map, from the map's entry, never from the
 * listing's columns. They are what the score points at, and a fresh score points at the rows the run would write.
 */
export function poolScoreOf(l: StoredScoreColumns, scores: PoolScoreSource): PoolScore | null {
  if (scores !== "stored") return scores.get(l.id) ?? null;
  if (l.score_breakdown === null || l.score_breakdown === undefined) return null;
  return {
    breakdown: l.score_breakdown as Invoice,
    score: l.score,
    market_stats_id: l.market_stats_id,
    model_stats_id: l.model_stats_id,
    pool_stats_id: l.pool_stats_id,
  };
}
