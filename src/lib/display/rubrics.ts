// The four rubrics (BRIEF Run 6b §8.1, the rule of §7.5 verbatim) — ק"מ · יד · צבע · רישיון.
//
// THE RULE, in one paragraph, because every branch below is an application of it: in every rubric the BIG
// value is what the seller declared and the SMALL line beneath it is the Ministry's. The seller's
// declaration is never overridden — it is annotated. The small line is grey by default and DARK exactly
// when the Ministry says something the ad does not; nothing else makes it dark. No red anywhere, no "what
// to check", no explanation of a gap.
//
// Nothing here recomputes an engine verdict. The km rubric's darkness is the engine's own cross-check
// result, read from the current invoice; the colour rubric's is the invoice's colour facts. This module has
// no threshold of its own — the one comparison it makes itself is the licence expiry against today in
// Israel, which §7.5 puts here on purpose (the invoice stores the date, the page counts the days).
//
// Degenerate data (none known in the demo pool): a null big value renders "—" and THAT RUBRIC CAN NEVER BE
// DARK — an annotation of a value that is not on screen would annotate nothing.

import type { Check, ColorMismatch } from "@/lib/scoring/types";
import { israelDay, km as kmText, num } from "./texts";

/**
 * One rubric as the strip renders it: a big value over a small line, the small line grey or dark.
 *
 * Run 7 §6 — `small: null` means THERE IS NO SMALL LINE AT ALL: not an empty string, not a blank row. The
 * strip renders nothing in its place. A null small line is never dark; there is nothing there to darken.
 */
export type Rubric = { big: string; small: string | null; dark: boolean };

// Run 7 §6 — the רישיון rubric's header now carries the words its small line used to ("רישיון בתוקף עד"),
// so the big value reads as the date it is and the caption is not repeated under it.
export const RUBRIC_HEADINGS = { km: 'ק"מ', hand: "יד", color: "צבע", licence: "רישיון בתוקף עד" } as const;

const EMPTY = "—";
const NO_TEST_YET = "עוד לא עבר טסט";
const COLOR_CHANGE_REPORTED = "דווח שינוי צבע";
const LICENCE_EXPIRED = "פג תוקף";
const PER_MINISTRY = "במשרד התחבורה:";
const UNVERIFIED_BY_SELLER = "לפי המוכר, לא אומת";

const blank = (small: string | null): Rubric => ({ big: EMPTY, small, dark: false });

/** "{d}.{m}.{yyyy}" — the test-date form of the km rubric's small line. */
export function testDate(d: Date): string {
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}

/** "{M}.{YYYY}" — the licence rubric's big value. */
export function expiryMonth(d: Date): string {
  return `${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}

/** A date as the day it is in UTC ("YYYY-MM-DD"). A @db.Date column arrives at UTC midnight. */
function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// ק"מ
// ---------------------------------------------------------------------------

export type KmInput = {
  km_declared: number | null;
  /** Every test reading known for the car. The rubric uses the LAST by test_date. */
  test_readings: { test_date: Date; km: number }[];
  /** The km cross-check of the CURRENT invoice, exactly as the engine wrote it. null = no invoice. */
  km_check: Check | null;
};

/**
 * §7.5 — big: the declared km. Small, always: the last test reading by `test_date`, EVEN WHEN that test is
 * later than the km observation; no reading at all → "עוד לא עבר טסט".
 *
 * Dark exactly per the engine's cross-check verdict (`status === "mismatch"`), read from the invoice and
 * never recomputed. When the contradiction was counted against a reading that is NOT the last one, the
 * small line shows the reading that was counted — otherwise the line would annotate a number the verdict
 * was never about.
 */
export function kmRubric(input: KmInput): Rubric {
  const sorted = [...input.test_readings].sort((a, b) => a.test_date.getTime() - b.test_date.getTime());
  const last = sorted.length === 0 ? null : sorted[sorted.length - 1];
  const dark = input.km_check !== null && input.km_check.status === "mismatch";

  // The reading the verdict was counted against, when the engine named one and it is not the last test.
  let shown = last;
  if (dark && input.km_check?.official_date !== undefined) {
    const counted = sorted.find((r) => dayOf(r.test_date) === input.km_check?.official_date);
    if (counted !== undefined) shown = counted;
  }

  const small = shown === null ? NO_TEST_YET : `בטסט ${testDate(shown.test_date)}: ${num(shown.km)}`;
  if (input.km_declared === null) return blank(small);
  return { big: kmText(input.km_declared), small, dark };
}

// ---------------------------------------------------------------------------
// יד
// ---------------------------------------------------------------------------

export type HandInput = {
  hand_declared: number | null; // listings.hand_declared — what THIS ad says
  registry_hand: number | null; // cars.hand — the non-dealer rows of the registry's history
  has_registry_history: boolean; // cars.ownership_history is a record, not null
};

/**
 * §7.5 + Run 7 §6 — big: "יד {hand_declared}"; an ad with no hand declaration shows the registry's hand.
 *
 * Small, per §6's table: AGREEMENT → NO SMALL LINE AT ALL (the "{N} בעלויות" caption is gone — it only ever
 * restated the big value); declared ≠ registry → the existing dark "במשרד התחבורה: יד {N}".
 *
 * A car with NO REGISTRY HISTORY is neither of those two rows: there is nothing to agree with and nothing to
 * contradict. Its dark "לפי המוכר, לא אומת" is kept unchanged — §6's title is "only when there is something
 * to say", and that line says the one thing there is to say about such a car. §6 names only the grey caption
 * as gone. See REPORT.md, which flags this as the one reading §6's table does not spell out.
 */
export function handRubric(input: HandInput): Rubric {
  const shown = input.hand_declared ?? input.registry_hand;

  if (!input.has_registry_history) {
    // Nothing of the Ministry's to put in the small line but the fact that there is nothing.
    if (shown === null) return blank(UNVERIFIED_BY_SELLER);
    return { big: `יד ${num(shown)}`, small: UNVERIFIED_BY_SELLER, dark: true };
  }

  const registry = input.registry_hand;
  if (registry === null) {
    // History rows exist but the registry hand itself is unknown: nothing of the Ministry's to annotate with.
    if (shown === null) return blank(UNVERIFIED_BY_SELLER);
    return { big: `יד ${num(shown)}`, small: UNVERIFIED_BY_SELLER, dark: true };
  }
  if (shown === null) return blank(null);
  const mismatch = input.hand_declared !== null && input.hand_declared !== registry;
  if (mismatch) return { big: `יד ${num(shown)}`, small: `${PER_MINISTRY} יד ${num(registry)}`, dark: true };
  return { big: `יד ${num(shown)}`, small: null, dark: false }; // agreement — nothing to say
}

// ---------------------------------------------------------------------------
// צבע
// ---------------------------------------------------------------------------

export type ColorInput = {
  color: string | null; // cars.color — the ad's word
  registry_color: string | null; // cars.registry_color
  color_mismatch: ColorMismatch | undefined; // the invoice's fact: both families known and different
  color_changed_reported: boolean; // the invoice's fact: history 1 says the colour was changed
};

/**
 * §7.5 + Run 7 §6 — big: the ad's colour.
 *
 * Small, per §6's table: AGREEMENT → NO SMALL LINE AT ALL (the "צבע" caption is gone — it only ever repeated
 * the rubric's own heading); a colour-FAMILY contradiction (the invoice's fact) → dark
 * "במשרד התחבורה: {registry_color}".
 *
 * A REPORTED COLOUR CHANGE with no contradiction is neither row of §6's table. Its dark "דווח שינוי צבע" is
 * kept unchanged, for §6's own reason: it is a thing the Ministry says that the ad does not, so there IS
 * something to say. §6 names only the grey caption as gone. Flagged in REPORT.md.
 */
export function colorRubric(input: ColorInput): Rubric {
  const mismatch = input.color_mismatch !== undefined;
  const registry = input.color_mismatch?.registry ?? input.registry_color;
  const contradiction = mismatch && registry !== null;
  const small = contradiction ? `${PER_MINISTRY} ${registry}` : input.color_changed_reported ? COLOR_CHANGE_REPORTED : null;
  const dark = contradiction || (!mismatch && input.color_changed_reported);
  if (input.color === null) return blank(small);
  return { big: input.color, small, dark };
}

// ---------------------------------------------------------------------------
// רישיון
// ---------------------------------------------------------------------------

export type LicenceInput = {
  test_expiry: Date | null; // cars.test_expiry
  now: Date; // the moment of viewing; the day is taken in Israel time
};

/**
 * §7.5 + Run 7 §6 — the header now reads "רישיון בתוקף עד" and the big value is the date it names.
 *
 * Small, per §6's table: VALID → NO SMALL LINE; expired (before TODAY in Israel time, computed at display per
 * the invoice rule that the invoice stores the date and the page computes) → dark "פג תוקף".
 */
export function licenceRubric(input: LicenceInput): Rubric {
  if (input.test_expiry === null) return blank(null);
  const expired = dayOf(input.test_expiry) < israelDay(input.now);
  return { big: expiryMonth(input.test_expiry), small: expired ? LICENCE_EXPIRED : null, dark: expired };
}

// ---------------------------------------------------------------------------
// the strip
// ---------------------------------------------------------------------------

export type RubricStrip = { heading: string; rubric: Rubric }[];

/** The four rubrics in the fixed board order: ק"מ · יד · צבע · רישיון. */
export function rubricStrip(input: { km: KmInput; hand: HandInput; color: ColorInput; licence: LicenceInput }): RubricStrip {
  return [
    { heading: RUBRIC_HEADINGS.km, rubric: kmRubric(input.km) },
    { heading: RUBRIC_HEADINGS.hand, rubric: handRubric(input.hand) },
    { heading: RUBRIC_HEADINGS.color, rubric: colorRubric(input.color) },
    { heading: RUBRIC_HEADINGS.licence, rubric: licenceRubric(input.licence) },
  ];
}
