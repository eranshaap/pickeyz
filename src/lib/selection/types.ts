// Stage B selection library — the contract (BRIEF Day 12 part 2, §3; part 3, §1–§2).
// From the engine: the invoice shape only. No engine functions, no engine constants.

import type { ScoreResult } from "../scoring/types";
import type { CATEGORY_PRIORITY } from "./constants";

// input — built by the caller; the pool AFTER the search's filters (model, years, budget)
export type CandidateListing = {
  listing_id: number;
  car_id: number; // one car = one plate; same car_id = same car
  price: number;
  first_seen_at: string; // ISO
  year: number;
  comparison_group: string; // cell = (comparison_group, year)
  median_price: number | null; // the cell's median price from the norm row the listing points at; null when the price row is unavailable
  new_price: number | null; // the car's new list price (part 5 §3): the latest published_at row for the car's four-column key, supplied by the caller; null when no row matches
  seller_visible: boolean; // the seller has an open commercial agreement — the caller computes it
  breakdown: ScoreResult; // the invoice, engine version 2
};

export type SelectionInput = { listings: CandidateListing[] };

export type TooSimilarEffect = "none" | "excluded";
export type DoubleWinnerEffect = "none" | "recategorized";
export type PeaceOfMindFloorEffect = "none" | "excluded";
export type AboveNewPriceEffect = "excluded" | "none";
export type SelectionOptions = {
  too_similar_effect?: TooSimilarEffect; // default: TOO_SIMILAR_EFFECT from constants
  double_winner_effect?: DoubleWinnerEffect; // default: DOUBLE_WINNER_EFFECT from constants
  peace_of_mind_floor_effect?: PeaceOfMindFloorEffect; // default: PEACE_OF_MIND_FLOOR_EFFECT from constants (part 4 §1)
  above_new_price_effect?: AboveNewPriceEffect; // default: ABOVE_NEW_PRICE_EFFECT from constants (part 5 §3)
};

// output
export type Category = (typeof CATEGORY_PRIORITY)[number];

// The recorded runner-up of the cheapest pick (part 3, §2b): a little pricier, clearly better deal. null when none was recorded.
export type RunnerUp = { listing_id: number; gap: number; price_over_pct: number; triggered: boolean };

export type SelectionResult = {
  rules_version: number;
  picks: Record<Category, number | null>; // listing_id of the representative listing, or null; the same listing may win more than one category
  missing: Partial<Record<Category, "no_candidate">>; // why a pick is null
  runner_ups: { cheapest: RunnerUp | null };
  results: ListingResult[]; // one per input listing: ranked first (by rank), then the rest
};

export type ListingStatus = "shown" | "merged" | "excluded";
export type ExcludedBy = "sold_strong" | "below_threshold" | "above_new_price" | "dealer_not_visible";

export type Eligibility = { best_value: boolean; peace_of_mind: boolean; cheapest: boolean; reasons: string[] };

export type ListingResult = {
  listing_id: number;
  car_id: number;
  status: ListingStatus;
  rank: number | null; // final place among shown listings, 1..n contiguous; null when not shown
  stage_a_place: number | null; // place in the Stage A order before any exclusion; null only for sold_strong
  excluded_by: ExcludedBy | null;
  verify_availability: boolean; // sold_signal medium
  eligibility: Eligibility;
  categories: Category[]; // the categories this listing won, in category order; empty when none
  trace: RuleTrace[];
};

export type RuleName = "duplicate" | "below_threshold" | "above_new_price" | "overpriced" | "too_similar" | "double_winner" | "dealer_not_visible" | "cheapest_runner_up";
export type RuleType = "correctness" | "eligibility" | "portfolio";
export type RuleEffect = "excluded" | "merged" | "recategorized" | "none";

export type RuleTrace = {
  rule: RuleName;
  type: RuleType;
  value: number | null;
  threshold: number | null;
  triggered: boolean;
  effect: RuleEffect;
  context: Record<string, unknown>;
};

// Rule types are fixed (§3).
export const RULE_TYPE: Readonly<Record<RuleName, RuleType>> = {
  duplicate: "correctness",
  below_threshold: "eligibility",
  above_new_price: "correctness",
  overpriced: "eligibility",
  dealer_not_visible: "correctness",
  too_similar: "portfolio",
  double_winner: "portfolio",
  cheapest_runner_up: "portfolio",
};
