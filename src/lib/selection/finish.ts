// The finish test (BRIEF Day 12 part 3 §3, rewritten to Day 14 rules v5 §0.5). Pure: it reads a finished
// SelectionResult and nothing else, so scripts/select-three.ts prints exactly the claims the tests check.
//
// The claims, in the order they are printed:
//   1. every category is filled, or empty with a recorded reason — empty without a reason is a FAIL
//      (an empty category with a reason is a correct outcome, §0.4, never an error);
//   2. every winner is eligible for the category it won;
//   3. the best_value winner is the first ELIGIBLE listing in the list order, and every listing ranked above it
//      carries a recorded ineligibility with its reason (rules v5: an ineligible listing keeps its rank, §0.1);
//   4. the shown ranks are contiguous 1..n.
// Replaces v4's "three picks exist" and "the winner is at rank 1", both of which rules v5 makes wrong.

import { CATEGORY_PRIORITY } from "./constants";
import type { ListingResult, SelectionResult } from "./types";

export type FinishCheck = { claim: string; ok: boolean; detail?: string };
export type FinishTest = { checks: FinishCheck[]; pass: boolean };

export function finishTest(res: SelectionResult): FinishTest {
  const shown = res.results.filter((r) => r.status === "shown").sort((a, b) => (a.rank as number) - (b.rank as number));
  const byId = new Map(res.results.map((r) => [r.listing_id, r]));
  const at = (id: number): ListingResult => {
    const r = byId.get(id);
    if (r === undefined) throw new Error(`finish test: pick ${id} is not among the results`);
    return r;
  };

  // 1. filled, or empty with a reason
  const unanswered = CATEGORY_PRIORITY.filter((c) => res.picks[c] === null && res.missing[c] === undefined);
  const answered: FinishCheck = {
    claim: "every category is filled, or empty with a recorded reason",
    ok: unanswered.length === 0,
    detail:
      unanswered.length > 0
        ? `empty with no reason: ${unanswered.join(", ")}`
        : CATEGORY_PRIORITY.filter((c) => res.picks[c] === null)
            .map((c) => `${c} empty (${res.missing[c]})`)
            .join("; ") || undefined,
  };

  // 2. a winner that is not eligible is a FAIL
  const badWinners = CATEGORY_PRIORITY.filter((c) => res.picks[c] !== null && !at(res.picks[c] as number).eligibility[c]);
  const winnersEligible: FinishCheck = {
    claim: "every winner is eligible for the category it won",
    ok: badWinners.length === 0,
    detail: badWinners.length > 0 ? badWinners.map((c) => `${c}: listing ${res.picks[c]} is not eligible`).join("; ") : undefined,
  };

  // 3. the best_value winner is the first eligible listing in the list order, and everything above it is
  //    recorded as ineligible with a reason.
  const firstEligible = shown.find((r) => r.eligibility.best_value) ?? null;
  const above = firstEligible === null ? shown : shown.filter((r) => (r.rank as number) < (firstEligible.rank as number));
  const unexplainedAbove = above.filter((r) => r.eligibility.best_value || r.eligibility.reasons.length === 0);
  const isFirst = res.picks.best_value !== null && firstEligible !== null && firstEligible.listing_id === res.picks.best_value;
  const bestValueFirst: FinishCheck = {
    claim: "best_value winner is the first eligible listing in the list order; every listing above it is recorded ineligible with a reason",
    ok: (res.picks.best_value === null ? firstEligible === null : isFirst) && unexplainedAbove.length === 0,
    detail:
      res.picks.best_value === null
        ? firstEligible === null
          ? "no best_value pick and no eligible listing"
          : `no best_value pick, but listing ${firstEligible.listing_id} (rank ${firstEligible.rank}) is eligible`
        : `winner listing ${res.picks.best_value} at rank ${res.picks.best_value === null ? "-" : at(res.picks.best_value).rank}` +
          (above.length > 0 ? `; ${above.length} ineligible listing(s) above it: ${above.map((r) => `${r.listing_id} (${r.eligibility.reasons.join("+") || "no reason"})`).join(", ")}` : "; none above it") +
          (unexplainedAbove.length > 0 ? `; UNEXPLAINED above it: ${unexplainedAbove.map((r) => r.listing_id).join(", ")}` : ""),
  };

  // 4. contiguous ranks
  const ranks = shown.map((r) => r.rank as number);
  const contiguous: FinishCheck = {
    claim: "shown ranks contiguous 1..n",
    ok: ranks.every((v, i) => v === i + 1),
    detail: undefined,
  };

  const checks = [answered, winnersEligible, bestValueFirst, contiguous];
  return { checks, pass: checks.every((c) => c.ok) };
}
