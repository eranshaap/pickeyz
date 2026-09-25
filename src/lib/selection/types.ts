// Stage B selection library — the contract (BRIEF Day 12 part 2, §3; part 3, §1–§2).
// From the engine: the invoice shape only. No engine functions, no engine constants.

import type { Invoice } from "../scoring/types";
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
  breakdown: Invoice; // the invoice as stored — a scored one, or (Day 18, engine v4 §8) the cancelled one
};

export type SelectionInput = { listings: CandidateListing[] };

export type TooSimilarEffect = "none" | "excluded";
export type DoubleWinnerEffect = "none" | "recategorized";
export type PeaceOfMindFloorEffect = "none" | "excluded";
export type AboveNewPriceEffect = "excluded" | "none";
export type SelectionOptions = {
  /**
   * Days 20–21 rules v7 (§1.8) — TEST-ONLY. The crowning gate's threshold, in place of CROWNING_THRESHOLD.
   * Undefined → the constant. Nothing in src/ or scripts/ outside src/lib/selection/ passes it: the existing
   * selection tests build small pools and are tests of the picking rules, not of the gate.
   */
  crowningThreshold?: number;
  too_similar_effect?: TooSimilarEffect; // default: TOO_SIMILAR_EFFECT from constants
  double_winner_effect?: DoubleWinnerEffect; // default: DOUBLE_WINNER_EFFECT from constants
  peace_of_mind_floor_effect?: PeaceOfMindFloorEffect; // default: PEACE_OF_MIND_FLOOR_EFFECT from constants (part 4 §1)
  above_new_price_effect?: AboveNewPriceEffect; // default: ABOVE_NEW_PRICE_EFFECT from constants (part 5 §3)
};

// output
export type Category = (typeof CATEGORY_PRIORITY)[number];

// The recorded runner-up of the cheapest pick (part 3, §2b): a little pricier, clearly better deal. null when none was recorded.
// Days 20–21 rules v7 (§1.5): a listing that won a category is never a candidate, so P1's also_won is gone — the
// case it recorded cannot occur.
export type RunnerUp = { listing_id: number; gap: number; price_over_pct: number; triggered: boolean };

// Why a category is empty. Days 20–21 rules v7 (§1.4): below_crowning_threshold joins no_candidate — the gate
// emptied every category at once, and no candidate was ever walked.
export type MissingReason = "no_candidate" | "below_crowning_threshold";

/**
 * Days 20–21 rules v7 (§1.7) — what the crowning gate saw, read off the same numbers its record carries.
 *   with_comparison  the shown rows (one per car, after the merge) that have a deal score
 *   eligible         of those, the rows ELIGIBLE TO WIN (§1.2)
 *   threshold        CROWNING_THRESHOLD, or the test-only override
 *   crowned          eligible >= threshold — the picks were made
 */
export type Crowning = { eligible: number; with_comparison: number; threshold: number; crowned: boolean };

export type SelectionResult = {
  rules_version: number;
  picks: Record<Category, number | null>; // listing_id of the representative listing, or null; the same listing may win more than one category
  missing: Partial<Record<Category, MissingReason>>; // why a pick is null
  crowning: Crowning; // §1.7 — the gate's own numbers, for the scripts and the read-back
  runner_ups: { cheapest: RunnerUp | null };
  results: ListingResult[]; // one per input listing: ranked first (by rank), then the rest
};

export type ListingStatus = "shown" | "merged" | "excluded";
export type ExcludedBy = "sold_strong" | "below_threshold" | "above_new_price" | "dealer_not_visible";

export type Eligibility = {
  best_value: boolean;
  peace_of_mind: boolean;
  cheapest: boolean;
  reasons: string[];
  // Day 14 rules v5 (§0.2): the same three flags with the unverified_history rule ignored and nothing else changed (a cancelled
  // car stays barred here too — rules v6) —
  // the counterfactual blocked_first reads, and the only place the pre-rule answer is kept.
  without_unverified_history: Record<Category, boolean>;
};

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

export type RuleName =
  | "duplicate"
  | "below_threshold"
  | "above_new_price"
  | "overpriced"
  | "too_similar"
  | "double_winner"
  | "dealer_not_visible"
  | "cheapest_runner_up"
  | "unverified_history" // Day 14 rules v5 (§0.1)
  | "cancelled" // Day 18 rules v6 (§8)
  | "crowning_threshold"; // Days 20–21 rules v7 (§1.4)
export type RuleType = "correctness" | "eligibility" | "portfolio";
// Day 14 rules v5 (§0.1): 'ineligible' joins the vocabulary — the listing stays listed and ranked, wins no
// category, and cannot be the runner-up. It is not 'excluded': nothing is hidden and no rank moves.
export type RuleEffect = "excluded" | "merged" | "recategorized" | "none" | "ineligible";

export type RuleTrace = {
  rule: RuleName;
  type: RuleType;
  // A number for every rule that measures one. unverified_history records the history row's `source` as stored in
  // the invoice ('mot' | 'typical'), which is a string — Day 14 rules v5 (§0.1).
  value: number | string | null;
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
  unverified_history: "eligibility",
  cancelled: "eligibility",
  // The gate is a rule about the SET of picks, like the other three portfolio rules — it moves no listing and
  // decides no listing's eligibility; it decides whether the search crowns anything at all.
  crowning_threshold: "portfolio",
};
