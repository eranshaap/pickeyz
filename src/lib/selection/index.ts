// Stage B selection library (BRIEF Day 12 part 2): the scored pool of one search -> three picks + a full trace.
//
// Pure: no database, no clock, no randomness. Reads the engine's invoice (listings.score_breakdown, ScoreResult)
// and recomputes none of it; the only arithmetic here is the rule values of §4. Version RULES_VERSION,
// independent of the engine's ENGINE_VERSION.
//
// Pipeline (§4, order fixed):
//   4.1 gate      sold_strong -> excluded, no rules run; sold medium -> verify_availability; eligibility per §2
//   4.2 stage A   order everyone that passed the gate -> stage_a_place
//   4.3 rule      below_threshold  (price / median_price)
//   4.4 rule      dealer_not_visible
//   4.5 merge     duplicate — one representative per car among the survivors
//   4.6 rank      representatives in the Stage A order -> rank 1..n, status shown
//   4.7 picks     best_value -> peace_of_mind -> cheapest, with double_winner and too_similar traced; a car may win
//                 more than one category (part 3 §1); then cheapest_runner_up recorded on the cheapest pick (part 3 §2b)
//
// Module split: gate.ts (4.1) · order.ts (the comparators of 4.2, 4.6, §2 and 4.5) · rules.ts (4.3–4.5) ·
// picks.ts (4.7, runner-up) · similarity.ts (distance, 4.8) · constants.ts (§5) · types.ts (§3) · util.ts (helpers).

import { CATEGORY_PRIORITY, DOUBLE_WINNER_EFFECT, RULES_VERSION, TOO_SIMILAR_EFFECT } from "./constants";
import { eligibility, isSoldMedium, isSoldStrong } from "./gate";
import { stageAOrder } from "./order";
import { pick } from "./picks";
import { belowThreshold, dealerNotVisible, mergeByCar, type Work } from "./rules";
import type { CandidateListing, ListingResult, SelectionInput, SelectionOptions, SelectionResult } from "./types";
import { cmpNullsLast } from "./util";

export { distance } from "./similarity";
export { categoryOrder } from "./order"; // the three category comparators (§2), for callers that list a category by its own order
export * from "./constants";
export type {
  CandidateListing,
  Category,
  DoubleWinnerEffect,
  Eligibility,
  ExcludedBy,
  ListingResult,
  ListingStatus,
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

function emptyResult(l: CandidateListing): ListingResult {
  return {
    listing_id: l.listing_id,
    car_id: l.car_id,
    status: "shown",
    rank: null,
    stage_a_place: null,
    excluded_by: null,
    verify_availability: isSoldMedium(l),
    eligibility: eligibility(l),
    categories: [],
    trace: [],
  };
}

export function selectThree(input: SelectionInput, options: SelectionOptions = {}): SelectionResult {
  const tooSimilarEffect = options.too_similar_effect ?? TOO_SIMILAR_EFFECT;
  const doubleWinnerEffect = options.double_winner_effect ?? DOUBLE_WINNER_EFFECT;

  const seen = new Set<number>();
  for (const l of input.listings) {
    if (seen.has(l.listing_id)) throw new Error(`selectThree: listing_id ${l.listing_id} appears twice in the input`);
    seen.add(l.listing_id);
  }

  const all: Work[] = input.listings.map((l) => ({ input: l, result: emptyResult(l) }));

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

  // 4.3 + 4.4 per-listing rules, on everyone that passed the gate (trace completeness, §3)
  for (const w of passed) belowThreshold(w);
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

  // 4.7 picks, then the cheapest runner-up (part 3 §2b)
  const { picks, missing, runner_ups } = pick(representatives, tooSimilarEffect, doubleWinnerEffect);

  // results: ranked first (by rank), then the rest (by stage_a_place, nulls last, then listing_id)
  const results = all
    .map((w) => w.result)
    .sort((a, b) => cmpNullsLast(a.rank, b.rank, "asc") || cmpNullsLast(a.stage_a_place, b.stage_a_place, "asc") || a.listing_id - b.listing_id);

  // every category answered, one way or the other
  for (const c of CATEGORY_PRIORITY) {
    if (picks[c] === null && missing[c] !== "no_candidate") throw new Error(`selectThree: category ${c} has no pick and no missing reason`);
  }

  return { rules_version: RULES_VERSION, picks, missing, runner_ups, results };
}
