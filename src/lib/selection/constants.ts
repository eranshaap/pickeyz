// Stage B selection library — every number it uses (BRIEF Day 12 part 2, §5; part 3, §1–§3).
// Each constant carries its source line as a comment. No other number lives anywhere else in src/lib/selection/.

export const RULES_VERSION = 9;
// 1 — Day 12 — first selection rules
// 2 — Day 12 — double_winner tracking only (a car may win more than one category); cheapest bar -5 (was 0); peace_of_mind deal floor -10; cheapest_runner_up recorded (band 5%, gap 2)
// 3 — Day 12 — peace_of_mind deal floor tracking only: the category is condition alone by definition; the absolute price ceiling will come from the new-car price file
// 4 — Day 12 — above_new_price: price as a percent of the car's new list price, out at >= 100 (mechanism); new_price supplied by the caller
// 5 — Day 14 — unverified_history: a pick requires registry ownership history, effect 'ineligible' (the new effect); the thin-cell gate bars all three categories and the runner-up; the no-deal tail is ordered by price
// 6 — Day 18 — cancelled: a car finally cancelled at the registry (engine v4's cancelled invoice) is ineligible for every category and the runner-up; it stays in the tail
// 7 — Days 20-21 — the crowning gate: a cut pool with fewer than CROWNING_THRESHOLD cars eligible to win crowns nothing; the cheapest runner-up is never one of the picks
// 8 — Days 22–23: the condition floor (CONDITION_FLOOR, renamed from CHEAPEST_CONDITION_FLOOR) is an eligibility condition for all three categories and the runner-up, recorded as rule condition_floor with effect ineligible, its sole-barred first candidate carrying blocked_first; NO_DEAL_ORDER = history_desc; CROWNING_THRESHOLD counts eligible = with a comparison, registry history, not below the floor (with_comparison / verified / eligible).
// 9 — Days 22–23 — cheapest_runner_up acts: a runner-up is named only when its deal_score exceeds the cheapest pick's by RUNNER_UP_DEAL_GAP (2) or more; below it (gap 0 and negative included) runner_ups.cheapest is null and the screen draws no strip; the record on the cheapest pick is still written in full; both runner-up constants unchanged

// below_threshold: a listing priced under this share of its cell's median is an error, not a deal.
// mechanism — the sum of the engine's caps (history 40 + km 11 = 51), rounded. In force.
export const BELOW_THRESHOLD_FLOOR_PCT = 50;

// above_new_price: a used listing priced at or above its car's new list price is an error or an anomaly, not a recommendation.
// mechanism — a used car cannot be worth more than new. In force.
export const PRICE_VS_NEW_CEILING_PCT = 100;

// The rule's effect: "excluded" bars the listing; "none" records only.
export const ABOVE_NEW_PRICE_EFFECT: "excluded" | "none" = "excluded";

// too_similar: planar distance between two same-cell cars' price and km rows, in percent of value.
// guess — to be measured from the value distribution once real searches exist. Tracking only.
export const SIMILARITY_THRESHOLD = 4;

// Day 12 decision: measure first. 'none' records the rule without acting on it; 'excluded' skips the candidate.
export const TOO_SIMILAR_EFFECT: 'none' | 'excluded' = 'none';

// Day 12 decision: a label is a promise — a car may win more than one category; the rule records, it does not act.
export const DOUBLE_WINNER_EFFECT: 'none' | 'recategorized' = 'none';

// the condition floor: how far below the cell's typical condition a car may be and still compete at all.
// Day 12 — the bar of `cheapest`; Days 22–23 rules v8 — an eligibility condition for all three categories and the
// runner-up; renamed from CHEAPEST_CONDITION_FLOOR. Measured: how often the cheapest car in a search is barred by it,
// how often `cheapest` coincides with `best_value`, and from v8 in how many searches a category's winner changes.
export const CONDITION_FLOOR = -5;

// peace_of_mind: how bad a deal (deal_score, points below fair) a car may be and still compete for the best condition.
// guess — Day 12. Measured: how often the peace_of_mind winner changes with the floor, per floor value.
export const PEACE_OF_MIND_DEAL_FLOOR = -10;

// Day 12 decision: peace_of_mind is condition alone — the deal floor records, it does not bar. The absolute ceiling comes from the new-car price file.
export const PEACE_OF_MIND_FLOOR_EFFECT: 'none' | 'excluded' = 'none';

// cheapest_runner_up: how much pricier than the cheapest pick a car may be and still count as "a little more money".
// guess — measured from the recorded price_over_pct distribution. Forms the band; whether the band's best car is named is the gap rule (rules v9).
export const RUNNER_UP_PRICE_BAND_PCT = 5;

// cheapest_runner_up: how many deal_score points above the cheapest pick count as "clearly better".
// guess — measured from the recorded gap distribution (still recorded below the gap). Acts from rules v9: below it the search has no runner-up.
export const RUNNER_UP_DEAL_GAP = 2;

// unverified_history: a pick requires registry ownership history — the invoice's history row must be a real
// reading sourced from the registry ('mot'). The cell's typical standing in for a car with no registry record
// ('typical', engine §0.4) is not history the pick can rest on.
// decision — Day 14 (§0.1). In force. 'ineligible' is the effect this rule introduced: the listing stays in the
// results and keeps its rank, wins no category, and cannot be the cheapest runner-up.
export const UNVERIFIED_HISTORY_EFFECT = 'ineligible' as const;

// cancelled: the invoice is the engine's cancelled one (reason 'cancelled', engine v4 §8) — the car is off the road for good.
// decision — Day 18 (§8). In force. The listing stays in the results, in the no-deal tail (it has no deal score), wins no
// category and cannot be the cheapest runner-up. Checked before any rule reads an invoice row: a cancelled invoice has none.
export const CANCELLED_EFFECT = 'ineligible' as const;

// condition_floor: a car whose condition_vs_typical is KNOWN and strictly below CONDITION_FLOOR is eligible for no
// category and cannot be the cheapest runner-up.
// decision — Days 22–23 rules v8 (§0a). In force. Like the two effects above, the listing stays in the results and
// keeps its rank; only the labels are out of its reach. An UNKNOWN condition_vs_typical is not below the floor: the
// rule in the documents is about a condition below the floor, not an unknown one.
export const CONDITION_FLOOR_EFFECT = 'ineligible' as const;

// The order of the listings with no deal score: they come after every ranked listing.
// Day 14 — price ascending; Days 22–23 rules v8 — the history row, best first (the registry reading only), rows
// without one after them by price; ties price, first_seen_at, listing_id.
export const NO_DEAL_ORDER = 'history_desc' as const;

// below this many cars eligible to win in the cut pool, nothing is crowned (Days 20–21, 25/09)
// v8 — counted on cars not below the floor as well.
export const CROWNING_THRESHOLD = 8;

export const CATEGORY_PRIORITY = ['best_value', 'peace_of_mind', 'cheapest'] as const;

// Rounding, as written in the brief: the below_threshold value to 1 decimal (§4.3), the above_new_price value to 1 decimal (part 5 §3), distance to 2 decimals (§4.8),
// the cheapest_runner_up gap and price_over_pct to 1 decimal (part 3, §2b).
export const BELOW_THRESHOLD_ROUND_DECIMALS = 1;
export const ABOVE_NEW_PRICE_ROUND_DECIMALS = 1;
export const DISTANCE_ROUND_DECIMALS = 2;
export const RUNNER_UP_ROUND_DECIMALS = 1;
