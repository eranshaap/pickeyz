// Stage B selection library — every number it uses (BRIEF Day 12 part 2, §5).
// Each constant carries its source line as a comment. No other number lives anywhere else in src/lib/selection/.

export const RULES_VERSION = 1;
// 1 — Day 12 — first selection rules

// below_threshold: a listing priced under this share of its cell's median is an error, not a deal.
// mechanism — the sum of the engine's caps (history 40 + km 11 = 51), rounded. In force.
export const BELOW_THRESHOLD_FLOOR_PCT = 50;

// too_similar: planar distance between two same-cell cars' price and km rows, in percent of value.
// guess — to be measured from the value distribution once real searches exist. Tracking only.
export const SIMILARITY_THRESHOLD = 4;

// Day 12 decision: measure first. 'none' records the rule without acting on it; 'excluded' skips the candidate.
export const TOO_SIMILAR_EFFECT: 'none' | 'excluded' = 'none';

export const CATEGORY_PRIORITY = ['best_value', 'peace_of_mind', 'cheapest'] as const;

// Rounding, as written in the brief: the below_threshold value to 1 decimal (§4.3), distance to 2 decimals (§4.8).
export const BELOW_THRESHOLD_ROUND_DECIMALS = 1;
export const DISTANCE_ROUND_DECIMALS = 2;
