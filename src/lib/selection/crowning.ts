// The crowning gate (BRIEF Days 20–21, Run 2 §1.2–§1.4; rules v7).
//
// THE RULE: a search whose cut pool holds fewer than CROWNING_THRESHOLD cars ELIGIBLE TO WIN crowns nothing.
// No pick in any category, no runner-up, and none of the tracking rules that need a pick. It moves no row:
// every rank, every status and every eligibility verdict stay exactly as the ranking left them — the ranking
// is not the gate's business (§1.3).
//
// ELIGIBLE TO WIN (§1.2), over the ranked rows of a selection — after the merge, so one row per car:
//   · the row is SHOWN (a merge representative), and
//   · it has a deal score, and
//   · neither the `unverified_history` rule nor the `cancelled` rule fired on it with the `ineligible` effect.
//
// There is NO second definition of "verified" here: the predicate reads those two rules' own verdicts off the
// trace they already wrote (gate.ts), so the gate can never disagree with the rule that barred the listing.
//
// Both counts count ROWS, i.e. cars: two ads of one car are one row after the merge.

import type { Work } from "./rules";
import type { Crowning } from "./types";

/** The two rules whose `ineligible` verdict bars a car from winning anything (rules v5 §0.1, v6 §8). */
const INELIGIBLE_RULES = ["unverified_history", "cancelled"] as const;

/** §1.2 — does this row carry a deal score? The invoice's, as stored; nothing is recomputed. */
export function hasComparison(w: Work): boolean {
  return w.input.breakdown.deal_score !== null;
}

/**
 * §1.2 — is this row eligible to WIN a category?
 *
 * It reads the two rules' own records rather than re-deriving them. A row that passed the sold gate always
 * carries both records (index.ts runs them on everyone that passed), so an absent record means the rule never
 * ran on this row — which is only ever true of a `sold_strong` row, and that row is not shown.
 */
export function isEligibleToWin(w: Work): boolean {
  if (w.result.status !== "shown") return false;
  if (!hasComparison(w)) return false;
  return !w.result.trace.some((t) => (INELIGIBLE_RULES as readonly string[]).includes(t.rule) && t.effect === "ineligible");
}

/**
 * §1.2 / §1.4 — the two numbers the gate measures, over the RANKED rows (the representatives, after §4.6).
 *
 * `with_comparison` = the shown rows with a deal score; `eligible` = the eligible-to-win rows among them.
 */
export function crowningCounts(ranked: readonly Work[]): { eligible: number; with_comparison: number } {
  let with_comparison = 0;
  let eligible = 0;
  for (const w of ranked) {
    if (w.result.status !== "shown" || !hasComparison(w)) continue;
    with_comparison += 1;
    if (isEligibleToWin(w)) eligible += 1;
  }
  return { eligible, with_comparison };
}

/** §1.4 — the gate's verdict: triggered when too few cars are eligible to win. */
export function isGated(eligible: number, threshold: number): boolean {
  return eligible < threshold;
}

/** §1.7 — what the result exposes, from the same numbers the record carries. */
export function crowningOf(counts: { eligible: number; with_comparison: number }, threshold: number): Crowning {
  return { ...counts, threshold, crowned: !isGated(counts.eligible, threshold) };
}

/**
 * §7.3 — the one line the two scripts print, in one place (work.md: "מבנה חוזר = מקום אחד בקוד").
 * `scripts/select-three.ts` prints it per model after the picks; `scripts/score-listings.ts` prints it on both
 * sides of its per-model preview. It is a script line, in English, like finishTest()'s claims — no screen text.
 */
export function crowningLine(c: Crowning): string {
  return `crowning: eligible ${c.eligible} of ${c.with_comparison} with a price comparison, threshold ${c.threshold} -> ${c.crowned ? "crowned" : "uncrowned"}`;
}
