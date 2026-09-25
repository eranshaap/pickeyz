// Stage B selection library (BRIEF Day 12 part 2): the scored pool of one search -> three picks + a full trace.
//
// Pure: no database, no clock, no randomness. Reads the engine's invoice (listings.score_breakdown, ScoreResult)
// and recomputes none of it; the only arithmetic here is the rule values of §4. Version RULES_VERSION,
// independent of the engine's ENGINE_VERSION.
//
// Pipeline (§4, order fixed):
//   4.1 gate      sold_strong -> excluded, no rules run; sold medium -> verify_availability; eligibility per §2
//                 (part 4 §1: peace_of_mind is condition alone; the deal floor is recorded by the overpriced rule, it does not bar;
//                 Day 14 rules v5 §0.1: unverified_history bars all three categories — the listing stays listed and keeps its rank;
//                 Day 18 rules v6 §8: cancelled bars all three and the runner-up — checked before any invoice row is read)
//   4.2 stage A   order everyone that passed the gate -> stage_a_place
//   4.3 rule      below_threshold (price / median_price); above_new_price (price / new_price, part 5 §3) in the same pass;
//                 overpriced recorded on every peace_of_mind-eligible listing (part 4 §1); unverified_history recorded
//                 on everyone that passed the gate (Day 14 rules v5 §0.1)
//   4.4 rule      dealer_not_visible
//   4.5 merge     duplicate — one representative per car among the survivors
//   4.6 rank      representatives in the Stage A order -> rank 1..n, status shown
//   4.6b gate     THE CROWNING GATE (Days 20–21 rules v7 §1.3): the ranks are final, and the rows eligible to win
//                 are counted. Fewer than CROWNING_THRESHOLD of them -> no pick in any category, no runner-up and
//                 none of the tracking rules that need a pick; every rank and every status stay as they are.
//   4.7 picks     best_value -> peace_of_mind -> cheapest, with double_winner and too_similar traced; a car may win
//                 more than one category (part 3 §1); then blocked_first (§0.2) and cheapest_runner_up recorded on the
//                 cheapest pick (part 3 §2b)
//
// Module split: gate.ts (4.1, the overpriced measurement) · order.ts (the comparators of 4.2, 4.6, §2 and 4.5) · rules.ts (4.3–4.5) · crowning.ts (4.6b) ·
// picks.ts (4.7, runner-up, blocked_first) · similarity.ts (distance, 4.8) · finish.ts (the finish test's claims) ·
// constants.ts (§5) · types.ts (§3) · util.ts (helpers).

import { ABOVE_NEW_PRICE_EFFECT, CATEGORY_PRIORITY, CROWNING_THRESHOLD, DOUBLE_WINNER_EFFECT, PEACE_OF_MIND_FLOOR_EFFECT, RULES_VERSION, TOO_SIMILAR_EFFECT } from "./constants";
import { crowningCounts, crowningOf, isGated } from "./crowning";
import { cancelled, eligibility, isSoldMedium, isSoldStrong, overpriced, unverifiedHistory } from "./gate";
import { stageAOrder } from "./order";
import { pick } from "./picks";
import { aboveNewPrice, belowThreshold, dealerNotVisible, mergeByCar, type Work } from "./rules";
import type { Category, CandidateListing, ListingResult, MissingReason, PeaceOfMindFloorEffect, SelectionInput, SelectionOptions, SelectionResult } from "./types";
import { RULE_TYPE } from "./types";
import { cmpNullsLast } from "./util";

export { crowningCounts, crowningLine, crowningOf, hasComparison, isEligibleToWin, isGated } from "./crowning";
export { distance } from "./similarity";
export { finishTest, type FinishCheck, type FinishTest } from "./finish";
export { hasVerifiedHistory, historySource, isCancelled, isThinCell } from "./gate";
export { categoryOrder } from "./order"; // the three category comparators (§2), for callers that list a category by its own order
export * from "./constants";
export type {
  AboveNewPriceEffect,
  CandidateListing,
  Category,
  Crowning,
  DoubleWinnerEffect,
  Eligibility,
  ExcludedBy,
  ListingResult,
  ListingStatus,
  MissingReason,
  PeaceOfMindFloorEffect,
  RuleEffect,
  RuleName,
  RuleTrace,
  RuleType,
  RunnerUp,
  SelectionInput,
  SelectionOptions,
  SelectionResult,
  TooSimilarEffect,
} from "./types";
export { RULE_TYPE } from "./types";

function emptyResult(l: CandidateListing, floorEffect: PeaceOfMindFloorEffect): ListingResult {
  return {
    listing_id: l.listing_id,
    car_id: l.car_id,
    status: "shown",
    rank: null,
    stage_a_place: null,
    excluded_by: null,
    verify_availability: isSoldMedium(l),
    eligibility: eligibility(l, floorEffect),
    categories: [],
    trace: [],
  };
}

/**
 * §1.3 / §1.4 — what the pick loop returns when the gate triggered: nothing was picked, nothing was evaluated,
 * and every category carries the gate's own reason. No rule record is written by this — the gate's record is
 * the one on the rank-1 row, and `cheapest_runner_up` is not written at all (it has no pick row to live on).
 */
function gatedPicks(): Pick<SelectionResult, "picks" | "missing" | "runner_ups"> {
  const picks: Record<Category, number | null> = { best_value: null, peace_of_mind: null, cheapest: null };
  const missing: Partial<Record<Category, MissingReason>> = {};
  for (const c of CATEGORY_PRIORITY) missing[c] = "below_crowning_threshold";
  return { picks, missing, runner_ups: { cheapest: null } };
}

export function selectThree(input: SelectionInput, options: SelectionOptions = {}): SelectionResult {
  const tooSimilarEffect = options.too_similar_effect ?? TOO_SIMILAR_EFFECT;
  const doubleWinnerEffect = options.double_winner_effect ?? DOUBLE_WINNER_EFFECT;
  const floorEffect = options.peace_of_mind_floor_effect ?? PEACE_OF_MIND_FLOOR_EFFECT;
  const aboveNewPriceEffect = options.above_new_price_effect ?? ABOVE_NEW_PRICE_EFFECT;
  // §1.8 — test-only; undefined is the constant.
  const crowningThreshold = options.crowningThreshold ?? CROWNING_THRESHOLD;

  const seen = new Set<number>();
  for (const l of input.listings) {
    if (seen.has(l.listing_id)) throw new Error(`selectThree: listing_id ${l.listing_id} appears twice in the input`);
    seen.add(l.listing_id);
  }

  const all: Work[] = input.listings.map((l) => ({ input: l, result: emptyResult(l, floorEffect) }));

  // 4.1 gate
  const passed: Work[] = [];
  for (const w of all) {
    if (isSoldStrong(w.input)) {
      w.result.status = "excluded";
      w.result.excluded_by = "sold_strong";
      continue;
    }
    passed.push(w);
  }

  // 4.2 Stage A order
  passed.sort((a, b) => stageAOrder(a.input, b.input));
  passed.forEach((w, i) => (w.result.stage_a_place = i + 1));

  // 4.3 + 4.4 per-listing rules, on everyone that passed the gate (trace completeness, §3): below_threshold and above_new_price
  // (part 5 §3) in one pass; the overpriced measurement (part 4 §1) on everyone that passed the gate and is eligible for peace_of_mind
  for (const w of passed) {
    belowThreshold(w);
    aboveNewPrice(w, aboveNewPriceEffect);
  }
  for (const w of passed) overpriced(w, floorEffect);
  for (const w of passed) cancelled(w); // Day 18 rules v6 (§8): recorded on everyone, acting through eligibility
  for (const w of passed) unverifiedHistory(w); // Day 14 rules v5 (§0.1): recorded on everyone, acting through eligibility
  for (const w of passed) dealerNotVisible(w);

  // 4.5 merge by car, over the survivors
  const survivors = passed.filter((w) => w.result.status !== "excluded");
  const representatives = mergeByCar(survivors);

  // 4.6 final rank
  representatives.sort((a, b) => stageAOrder(a.input, b.input));
  representatives.forEach((w, i) => {
    w.result.status = "shown";
    w.result.rank = i + 1;
  });

  // 4.6b THE CROWNING GATE (Days 20–21 rules v7, §1.3–§1.4) — the ranks are final and nothing below moves a row.
  const counts = crowningCounts(representatives);
  const gated = isGated(counts.eligible, crowningThreshold);

  // §1.4 — the record, on the rank-1 row and on no other. There is always one when any row is shown (the tail
  // is ranked too); zero shown rows → no record, because there is nothing to write it on.
  const rankOne = representatives.find((w) => w.result.rank === 1);
  if (rankOne !== undefined) {
    rankOne.result.trace.push({
      rule: "crowning_threshold",
      type: RULE_TYPE.crowning_threshold,
      value: counts.eligible,
      threshold: crowningThreshold,
      triggered: gated,
      effect: "none", // the rule moves no row
      context: { eligible: counts.eligible, with_comparison: counts.with_comparison },
    });
  }

  // 4.7 picks, then the cheapest runner-up (part 3 §2b) — skipped whole when the gate triggered: no pick, no
  // runner-up record (it has no pick row to live on) and none of the tracking rules that need a pick.
  const { picks, missing, runner_ups } = gated ? gatedPicks() : pick(representatives, tooSimilarEffect, doubleWinnerEffect);

  // results: ranked first (by rank), then the rest (by stage_a_place, nulls last, then listing_id)
  const results = all
    .map((w) => w.result)
    .sort((a, b) => cmpNullsLast(a.rank, b.rank, "asc") || cmpNullsLast(a.stage_a_place, b.stage_a_place, "asc") || a.listing_id - b.listing_id);

  // every category answered, one way or the other
  for (const c of CATEGORY_PRIORITY) {
    if (picks[c] === null && missing[c] === undefined) throw new Error(`selectThree: category ${c} has no pick and no missing reason`);
  }

  return { rules_version: RULES_VERSION, picks, missing, crowning: crowningOf(counts, crowningThreshold), runner_ups, results };
}
