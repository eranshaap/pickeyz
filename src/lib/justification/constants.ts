// The justification generator — every number it uses (BRIEF Days 22–23, Run 2, §2): a mirror of the ledger's
// "מחולל ההצדקות" block, each constant with its source line, exactly as src/lib/selection/constants.ts does.
// No other number lives anywhere else in src/lib/justification/.
//
// A CHANGED CONSTANT OR WORDING BUMPS JUSTIFICATION_GENERATOR_VERSION. The version is what Run 4 stores beside
// every sentence, so two searches whose sentences were written by different rules are never compared as one.

export const JUSTIFICATION_GENERATOR_VERSION = 1;
// changelog:
// 1 — Days 22–23: the first generator — the library, the wordings file, the thresholds below; section ב (28/09): the further facts of a "ראש שקט" page judged by the reality reading

// from what effect on the score, in points, an ownership or km fact is worth a sentence; below it the line is
// empty; not applied to a pick's reason.
export const JUSTIFICATION_MIN_EFFECT_PCT = 2;

// Eran, 28/09: ONE job — the price counts in the car's favour (the "הכי חסכוני" reason) only when deal_score is
// above it; it never changes a text — the amount is always written, rounded to SENTENCE_ROUND_ILS, and the third
// form appears only when the rounded amount is 0. In points of the deal score (the score's unit: percent of the
// car's value).
export const PRICE_ABOUT_EQUAL_BAND_PCT = 2;

// up to how many cars the form "אחד מ-…" is still written
export const ONE_OF_MAX_COUNT = 10;

// the largest share of the search's cars the form "אחד מ-…" is still written for
export const ONE_OF_MAX_SHARE_PCT = 10;

// the tag is not counted
export const SENTENCE_MAX_CHARS = 40;

// the amount and the identification are the bar's, not counted
export const RUNNER_UP_FACT_MAX_CHARS = 28;

export const SENTENCE_ROUND_ILS = 100;
export const SENTENCE_ROUND_KM = 1000;

export const WHY_EXTRA_FACTS_MAX = 2;

// Eran, 28/09 — first guess: the share of the search's cars with a sentence that one identical sentence may reach
// before the self-check reports it; joins the ledger at the closing round.
export const SENTENCE_REPEAT_MAX_SHARE_PCT = 25;
