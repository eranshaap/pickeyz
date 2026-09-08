// Stage B selection library — every number it uses (BRIEF Day 12 part 2, §5; part 3, §1–§3).
// Each constant carries its source line as a comment. No other number lives anywhere else in src/lib/selection/.

export const RULES_VERSION = 4;
// 1 — Day 12 — first selection rules
// 2 — Day 12 — double_winner tracking only (a car may win more than one category); cheapest bar -5 (was 0); peace_of_mind deal floor -10; cheapest_runner_up recorded (band 5%, gap 2)
// 3 — Day 12 — peace_of_mind deal floor tracking only: the category is condition alone by definition; the absolute price ceiling will come from the new-car price file
// 4 — Day 12 — above_new_price: price as a percent of the car's new list price, out at >= 100 (mechanism); new_price supplied by the caller

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

// cheapest: how far below the cell's typical condition a car may be and still compete — how much quality the category trades for price.
// guess — Day 12. Measured: how often the cheapest car overall is barred by it, and how often cheapest coincides with best_value, per bar value.
export const CHEAPEST_CONDITION_FLOOR = -5;

// peace_of_mind: how bad a deal (deal_score, points below fair) a car may be and still compete for the best condition.
// guess — Day 12. Measured: how often the peace_of_mind winner changes with the floor, per floor value.
export const PEACE_OF_MIND_DEAL_FLOOR = -10;

// Day 12 decision: peace_of_mind is condition alone — the deal floor records, it does not bar. The absolute ceiling comes from the new-car price file.
export const PEACE_OF_MIND_FLOOR_EFFECT: 'none' | 'excluded' = 'none';

// cheapest_runner_up: how much pricier than the cheapest pick a car may be and still count as "a little more money".
// guess — measured from the recorded price_over_pct distribution. Recorded only.
export const RUNNER_UP_PRICE_BAND_PCT = 5;

// cheapest_runner_up: how many deal_score points above the cheapest pick count as "clearly better".
// guess — measured from the recorded gap distribution. Recorded only.
export const RUNNER_UP_DEAL_GAP = 2;

export const CATEGORY_PRIORITY = ['best_value', 'peace_of_mind', 'cheapest'] as const;

// Rounding, as written in the brief: the below_threshold value to 1 decimal (§4.3), the above_new_price value to 1 decimal (part 5 §3), distance to 2 decimals (§4.8),
// the cheapest_runner_up gap and price_over_pct to 1 decimal (part 3, §2b).
export const BELOW_THRESHOLD_ROUND_DECIMALS = 1;
export const ABOVE_NEW_PRICE_ROUND_DECIMALS = 1;
export const DISTANCE_ROUND_DECIMALS = 2;
export const RUNNER_UP_ROUND_DECIMALS = 1;
