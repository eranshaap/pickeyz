// Stage B selection library — the contract (BRIEF Day 12 part 2, §3).
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
  seller_visible: boolean; // the seller has an open commercial agreement — the caller computes it
  breakdown: ScoreResult; // the invoice, engine version 2
};

export type SelectionInput = { listings: CandidateListing[] };

export type TooSimilarEffect = "none" | "excluded";
export type SelectionOptions = { too_similar_effect?: TooSimilarEffect }; // default: TOO_SIMILAR_EFFECT from constants

// output
export type Category = (typeof CATEGORY_PRIORITY)[number];

export type SelectionResult = {
  rules_version: number;
  picks: Record<Category, number | null>; // listing_id of the representative listing, or null
  missing: Partial<Record<Category, "no_candidate">>; // why a pick is null
  results: ListingResult[]; // one per input listing: ranked first (by rank), then the rest
};

export type ListingStatus = "shown" | "merged" | "excluded";
export type ExcludedBy = "sold_strong" | "below_threshold" | "dealer_not_visible";

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
  category: Category | null; // the category this listing won
  trace: RuleTrace[];
};

export type RuleName = "duplicate" | "below_threshold" | "too_similar" | "double_winner" | "dealer_not_visible";
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
  dealer_not_visible: "correctness",
  too_similar: "portfolio",
  double_winner: "portfolio",
};
