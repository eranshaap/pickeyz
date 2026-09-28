// The three edge screens' display library (BRIEF Days 20–21, Run 2 §2) — every text of the below-threshold
// screen, the zero-scored screen and the shared structures, in ONE place. The components only render what
// comes out of here, so `npm test` covers the words without a DOM.
//
// DISPLAY ONLY. Hebrew appears in the strings and never in a test of a value (CLAUDE.md). Every impossible
// input throws rather than rendering something plausible: an uncrowned head for a search that IS crowned, a
// zero-scored head for a search with no cars, a group object with no rows.
//
// NUMBERS carry the site's thousands separators — `num()` from texts.ts, the km value's own formatter (§2).
//
// SINGULAR FORMS (§2.5, Eran 25/09): the documents' templates read with a plural for a count of one, so each
// head and each line has its own form at one. No other count gets a special form.

import { num } from "./texts";
import { RUBRIC_HEADINGS } from "./rubrics";

/** A screen's head: the bold line, then the grey one under it. */
export type Head = { title: string; line: string };

/**
 * §6.0 — THE DAY 15 LINE, the zero-results screen's one headline: the string the code renders today, carried
 * over character for character from `PickCards.tsx` (where Run 1 left it, and from where §7.1 deletes it). Not
 * re-worded and not re-punctuated — the board's form ends in a period and this one does not, and the document's
 * rule is that the code's own string governs.
 */
export const NO_CARS_AT_ALL = "אין רכבים שעונים על ההגבלות";

// ---------------------------------------------------------------------------
// §2.3 — the one grey sentence about a missing price comparison
// ---------------------------------------------------------------------------

/**
 * §2.3 — the sentence the group object and the zero-scored head both carry. `n` is how many cars it is about,
 * and it changes the sentence only at one (§2.5).
 */
export function noComparisonLine(n: number): string {
  return n === 1
    ? "אין מספיק רכבים דומים כדי להשוות את המחיר שלו, ולכן אין לו ציון."
    : "אין מספיק רכבים דומים כדי להשוות את המחיר שלהם, ולכן אין להם ציון.";
}

// ---------------------------------------------------------------------------
// §2.1 — the below-threshold screen's head, on its two reasons
// ---------------------------------------------------------------------------

/** The grey line of reason A: too few cars with a price comparison at all. */
const FEW_CARS_LINE = "כשנשארים מעט רכבים לא בוחרים מהם שלושה.";
/** The grey line of reason B: enough cars with a comparison, too few with registry ownership history. */
const FEW_VERIFIED_LINE = "ממליצים רק על רכב עם היסטוריית בעלויות, וכשיש מעט כאלה לא בוחרים מהם שלושה.";
/** Days 22–23 rules v8 (§0d) — the grey line of reason C: enough of both, too many below the condition floor. */
const BELOW_FLOOR_LINE = "רכב כזה לא מקבל תווית, וכשנשארים מעט רכבים לא בוחרים מהם שלושה.";

/**
 * §2.1, as Days 22–23 rules v8 (§0d) adds its third case — the uncrowned head, chosen by the REASON the search
 * crowned nothing. The three counts nest: with_comparison (N) ⊇ verified ⊇ eligible.
 *
 *   reason A   with_comparison < threshold        too few cars have a price comparison
 *   reason B   with_comparison >= threshold and   enough have one, too few have registry ownership history
 *              verified < threshold
 *   reason C   verified >= threshold and          enough have both, and K = verified − eligible of them are so far
 *              eligible < threshold               below their year's typical condition that they win nothing
 *
 * `eligible >= threshold` throws: the screen is not uncrowned — and `eligible` is the count the gate decides on.
 * `with_comparison === 0` throws: that is the zero-scored screen, whose head is zeroScoredHead().
 */
export function uncrownedHead(counts: { with_comparison: number; verified: number; eligible: number; threshold: number }): Head {
  const { with_comparison: N, verified, eligible, threshold } = counts;
  if (eligible >= threshold) {
    throw new Error(`uncrownedHead: ${eligible} cars are eligible to win against a threshold of ${threshold} — this search is crowned`);
  }
  if (N === 0) throw new Error("uncrownedHead: no car has a price comparison — that is the zero-scored screen (zeroScoredHead)");

  if (N < threshold) {
    return {
      title: N === 1 ? "רק רכב אחד עם השוואת מחיר עונה על מה שביקשת. הנה הוא." : `רק ${num(N)} רכבים עם השוואת מחיר עונים על מה שביקשת. הנה כולם.`,
      line: FEW_CARS_LINE,
    };
  }
  if (verified < threshold) {
    const M = verified;
    const middle =
      M === 0 ? "ולאף אחד מהם אין היסטוריית בעלויות במשרד התחבורה" : M === 1 ? "ורק לאחד מהם יש היסטוריית בעלויות במשרד התחבורה" : `ורק ל-${num(M)} מהם יש היסטוריית בעלויות במשרד התחבורה`;
    return { title: `${num(N)} רכבים עונים על מה שביקשת, ${middle}. הנה כולם.`, line: FEW_VERIFIED_LINE };
  }
  // reason C — K >= 1 here: verified >= threshold > eligible. N >= threshold too, so N is never 1 and has no
  // singular form; K does. The km unit is the car page's own rubric heading, never a glyph chosen here.
  const K = verified - eligible;
  const many = `${num(N)} רכבים עונים על מה שביקשת, אבל ל-${num(K)} מהם בעלויות או ${RUBRIC_HEADINGS.km} נמוכים בהרבה מהממוצע לשנתון. הנה כולם.`;
  const one = `${num(N)} רכבים עונים על מה שביקשת, אבל לאחד מהם בעלויות או ${RUBRIC_HEADINGS.km} נמוכים בהרבה מהממוצע לשנתון. הנה כולם.`;
  return { title: K === 1 ? one : many, line: BELOW_FLOOR_LINE };
}

// ---------------------------------------------------------------------------
// §2.2 — the zero-scored screen's head
// ---------------------------------------------------------------------------

/**
 * §2.2 — the head of a search that found cars and no price comparison at all. `n` is how many cars it found;
 * `n === 0` throws — that is the zero-results screen, which has no head of its own (§6).
 */
export function zeroScoredHead(n: number): Head {
  if (n === 0) throw new Error("zeroScoredHead: no car at all — that is the zero-results screen");
  return {
    title: n === 1 ? "נמצא רכב אחד. עוד אין לו השוואת מחיר." : `נמצאו ${num(n)} רכבים. לאף אחד מהם עוד אין השוואת מחיר.`,
    line: noComparisonLine(n),
  };
}

// ---------------------------------------------------------------------------
// §2.4 — the shared structures' texts
// ---------------------------------------------------------------------------

/**
 * §2.4 — the group object above the rows of cars with no price comparison. `n === 0` throws: there is no group
 * object without rows.
 */
export function groupHead(n: number): Head {
  if (n === 0) throw new Error("groupHead: no row — a group object is never drawn empty");
  return { title: n === 1 ? "רכב אחד בלי השוואת מחיר" : `${num(n)} רכבים בלי השוואת מחיר`, line: noComparisonLine(n) };
}

/**
 * Days 24–25 Run 1 §5.1 — the group object at the very end of the list: the cars whose registration at the
 * Ministry of Transport was cancelled for good. `n === 0` throws, like groupHead(): a group object is never
 * drawn empty.
 *
 * ledger: the two wordings are a FIRST GUESS (decision 2, 26/09), like every wording on these screens.
 */
export function cancelledGroupHead(n: number): Head {
  if (n === 0) throw new Error("cancelledGroupHead: no row — a group object is never drawn empty");
  return n === 1
    ? { title: "רכב אחד בביטול סופי", line: "הרישום שלו במשרד התחבורה בוטל לצמיתות — הוא ירד מהכביש." }
    : { title: `${num(n)} רכבים בביטול סופי`, line: "הרישום שלהם במשרד התחבורה בוטל לצמיתות — הם ירדו מהכביש." };
}

/** §2.4 — the place card's label. */
export function placeLabel(n: number): string {
  return `מקום ${num(n)}`;
}

/** The page's "—": what a rubric prints when the value behind it is not there (rubrics.ts). */
const EMPTY_VALUE = "—";

/**
 * §2.4 — the place card's one data line, and the phone row's. The km unit is the CAR PAGE's own km rubric
 * heading (RUBRIC_HEADINGS.km), so the card, the row and the page cannot spell it differently. A null value is
 * printed as the rubric's "—" in its own slot, the unit staying where it is.
 */
export function dataLine(input: { km: number | null; hand: number | null; word: string | null }): string {
  const km = input.km === null ? EMPTY_VALUE : num(input.km);
  const hand = input.hand === null ? EMPTY_VALUE : num(input.hand);
  return `${km} ${RUBRIC_HEADINGS.km} · יד ${hand} · ${input.word ?? EMPTY_VALUE}`;
}
