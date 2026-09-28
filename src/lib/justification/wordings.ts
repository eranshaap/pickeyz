// The justification generator — EVERY HEBREW STRING IT WRITES (BRIEF Days 22–23, Run 2, §3).
//
// This file is the one home of the generator's language. The logic files (facts.ts, claims.ts, price.ts,
// index.ts) contain no Hebrew letter at all — wordings.test.ts reads them and asserts it — so a wording is
// changed here and nowhere else, and changing one bumps JUSTIFICATION_GENERATOR_VERSION (constants.ts).
//
// Templates are small functions so that a wording is still one line to edit.
//
// Characters: the km unit is ק"מ with the ASCII double quote U+0022 — the same characters as RUBRIC_HEADINGS.km
// (src/lib/display/rubrics.ts:30); the tag's quotes are ASCII too. rubrics.ts is deliberately NOT imported here:
// it imports texts.ts, which re-exports this library's price expression (§7) — a cycle. wordings.test.ts asserts
// the equality instead.

import { num } from "@/lib/display/texts";

// ---------------------------------------------------------------------------
// the price expression — the line under the price, and the price sentence
// ---------------------------------------------------------------------------

export const PRICE = {
  /** `ils` is already formatted (num()); the shekel sign and the direction word are the wording's. */
  below: (ils: string) => `${ils} ₪ מתחת לשווי השוק`,
  above: (ils: string) => `${ils} ₪ מעל לשווי השוק`,
  /** The site's current wording, kept by Eran 28/09 (the plan's table says "המחיר בשווי השוק"; the table is
   *  updated at the closing round). Written only when the amount rounds to 0. */
  at: "במחיר השוק",
} as const;

// ---------------------------------------------------------------------------
// the km sentence
// ---------------------------------------------------------------------------

// `n` is the gap in thousands of km, already rounded and unsigned. When it is 1 the digit is dropped: "אלף ק"מ",
// not "1 אלף ק"מ" — both forms are the wording's business, which is why the number arrives unformatted.
const thousands = (n: number): string => (n === 1 ? 'אלף ק"מ' : `${num(n)} אלף ק"מ`);

export const KM = {
  above: (n: number) => `${thousands(n)} מעל הממוצע לשנתון`,
  below: (n: number) => `${thousands(n)} מתחת לממוצע לשנתון`,
} as const;

/** The thin cell's km tag — the only fact a car with no price comparison can be given about its km. */
export const LOWEST_KM = (scope: string): string => `הק"מ הנמוך ביותר מבין הרכבים ${scope}`;

// ---------------------------------------------------------------------------
// the scope word — what the count is counted over
// ---------------------------------------------------------------------------

export const SCOPE = { budget: "בתקציב", search: "בחיפוש" } as const;

// ---------------------------------------------------------------------------
// the ownership forms — "the only one" and "one of n"
// ---------------------------------------------------------------------------

export const OWNERSHIP = {
  only_hand1: (scope: string) => `היחיד ${scope} ביד 1`,
  one_of_hand1: (n: number, scope: string) => `אחד מ-${num(n)} ${scope} ביד 1`,
  only_all_private: (scope: string) => `היחיד ${scope} שכל בעליו פרטיים`,
  one_of_all_private: (n: number, scope: string) => `אחד מ-${num(n)} ${scope} שכל בעליהם פרטיים`,
  only_was_type: (scope: string, word: string) => `היחיד ${scope} שהיה רכב ${word}`,
  one_of_was_type: (n: number, scope: string, word: string) => `אחד מ-${num(n)} ${scope} שהיו רכבי ${word}`,
  only_hand_up: (scope: string, h: number) => `היחיד ${scope} ביד ${num(h)} ומעלה`,
  one_of_hand_up: (n: number, scope: string, h: number) => `אחד מ-${num(n)} ${scope} ביד ${num(h)} ומעלה`,
} as const;

// The three the ledger deducts for. 'government' / 'military' have no live case and are not in this table — a
// code outside it yields no sentence.
export const OWNER_WORD: Readonly<Record<string, string>> = {
  rental: "השכרה",
  leasing: "ליסינג",
  company: "חברה",
};

// ---------------------------------------------------------------------------
// the rule sentences — what stopped the car, in its own words
// ---------------------------------------------------------------------------

export const RULE = {
  no_history: "אין היסטוריית בעלויות ממשרד התחבורה",
  /** month without a leading zero, from the invoice's cancelled_at 'YYYY-MM-DD'. */
  cancelled: (month: number, year: number) => `בוטל ב-${month}/${year}`,
} as const;

// ---------------------------------------------------------------------------
// the recognition tag
// ---------------------------------------------------------------------------

/** ASCII double quotes, exactly as the plan's table has it. */
export const TAG_CHEAPER_THAN_CHEAPEST = 'זול מ"הכי חסכוני"';

// ---------------------------------------------------------------------------
// what the generator never says (§8, check `forbidden_word`)
// ---------------------------------------------------------------------------

export const FORBIDDEN_WORDS: readonly string[] = ["רגיל", "מצב", "%", "אחוז", "מחירון", "מציאה", "רכבים כמוהו", "גם עם", "בהתחשב ב", "לא נבחר:"];

// ---------------------------------------------------------------------------
// the orders — data, not logic: which rule speaks first, which fact speaks first
// ---------------------------------------------------------------------------

/** The order the rule sentences are tried in (§6 case 1). */
export const RULE_ORDER: readonly string[] = ["cancelled", "unverified_history", "condition_floor"];

/** The facts in the buyer's favour, in the order the ladder tries them (§6.4). */
export const FAVOURABLE_OWNERSHIP_ORDER: readonly string[] = ["hand1", "all_private"];

/** Ties in deduction size break in this order (§6.4). */
export const UNFAVOURABLE_TIE_ORDER: readonly string[] = ["rental", "leasing", "company", "hand_up"];
