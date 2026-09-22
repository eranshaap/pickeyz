// The display texts (BRIEF Run 6b §8.2, §8.4, §8.5) — every wording and display decision of §6–§7 that is
// not a rubric (§8.1) and not the version line (§8.3), as pure functions with tests. The components only
// render what comes out of here, so `npm test` covers the page without a DOM.
//
// DISPLAY ONLY (§2). Nothing here is ever compared against: the engine, the norms, the cells and the
// selection rules read the STORED values and know nothing about any string in this file. Hebrew appears here
// and in the components, never in a comparison.
//
// The number formats live here too, and src/components/search/labels.tsx re-exports them, so the server
// render and the client render cannot disagree about a separator — there is one implementation, not two.

import type { Category } from "@/lib/selection";
import type { OwnershipType } from "@/lib/scoring/types";

// ---------------------------------------------------------------------------
// numbers
// ---------------------------------------------------------------------------

// Thousands separators, done here rather than through Intl: the same string has to come out of the server
// render and the client render, and a locale lookup is the classic way for those two to disagree.
export function num(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const shekel = (n: number): string => `${num(n)} ₪`;
export const km = (n: number): string => `${num(n)} ק״מ`;

// ---------------------------------------------------------------------------
// the calendar day in Israel
// ---------------------------------------------------------------------------

export const ISRAEL_TIME_ZONE = "Asia/Jerusalem";

const ISRAEL_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: ISRAEL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * The calendar day of an instant IN ISRAEL, as "YYYY-MM-DD" — never a fixed offset, because Israel moves
 * between summer and winter time and a fixed offset is wrong for half the year. Two such strings compare
 * as days, which is what "a different calendar day" and "before today" both mean (§3.2, §7.5).
 *
 * It lives here, in the leaf module of the display library, because both the loader's day signal (§3.2) and
 * the licence rubric's "expired" (§7.5) have to use the SAME definition of a day.
 */
export function israelDay(at: Date): string {
  return ISRAEL_DAY.format(at);
}

// ---------------------------------------------------------------------------
// §7.2 / §7.7 — the category words and the page colour
// ---------------------------------------------------------------------------

// search_results.recommendation_categories (codes) -> the label a buyer reads.
export const CATEGORY_LABEL: Readonly<Record<Category, string>> = {
  best_value: "המשתלם ביותר",
  peace_of_mind: "ראש שקט",
  cheapest: "הכי חסכוני",
};

// The reference palette of the BRIEF's approved boards.
export const CATEGORY_COLOR: Readonly<Record<Category, string>> = {
  best_value: "#6b1f31", // wine
  peace_of_mind: "#1b3f4b", // petrol
  cheapest: "#303577", // indigo
};

export const BRONZE = "#6e5118"; // won more than one category
export const BLACK = "#221f1c"; // no label / no rank / cancelled / no search behind the page

/**
 * §7.2 — one category → that category's colour; more than one → the fixed bronze; nothing → black.
 * The page colour paints the label/place line and its bar, the section headings, the contact button, the
 * ownership-axis fills and the phone bottom-bar button. Nothing else is coloured.
 */
export function pageColor(labels: Category[]): string {
  if (labels.length === 0) return BLACK;
  if (labels.length === 1) return CATEGORY_COLOR[labels[0]];
  return BRONZE;
}

// ---------------------------------------------------------------------------
// §8.2 — the fair number, the compared-to line, the thin-cell line
// ---------------------------------------------------------------------------

const BELOW_MARKET = "מתחת לשווי השוק של רכבים כאלה";
const ABOVE_MARKET = "מעל לשווי השוק של רכבים כאלה";
const AT_MARKET = "במחיר השוק של רכבים כאלה";
const THIN_CELL_LINE = "אין השוואת מחיר — פחות מ-5 רכבים דומים הוצעו למכירה";

/** The deal in shekels, rounded to the nearest 100: `listings.score ÷ 100 × median_price` of the norm row. */
export function fairAmount(score: number, median_price: number): number {
  return Math.round((score / 100) * median_price / 100) * 100;
}

/**
 * §8.2 — the shared expression. Positive = the car is under the market by that much; negative = over it by
 * that much (the sign is carried by the word, never by the digits); rounding to 0 = at the market price.
 */
export function fairLine(score: number, median_price: number): string {
  const amount = fairAmount(score, median_price);
  if (amount === 0) return AT_MARKET;
  return `${shekel(Math.abs(amount))} ${amount > 0 ? BELOW_MARKET : ABOVE_MARKET}`;
}

/** §8.2 — what the fair number rests on: the norm row's sample size and its window. */
export function comparedToLine(sample_size: number, window_days: number): string {
  return `הושווה ל-${num(sample_size)} רכבים דומים שהוצעו למכירה ב-${num(window_days)} הימים האחרונים`;
}

/** §8.2 — a thin cell shows this single line INSTEAD of the fair number and the compared-to line. */
export function thinCellLine(): string {
  return THIN_CELL_LINE;
}

/** §7.3 — the price's share of the car's new list price. Omitted entirely when the join has no row. */
export function percentOfNewLine(price: number, new_price: number): string {
  return `‎${Math.round((price / new_price) * 100)}% ממחיר החדש`;
}

/**
 * §8.2 — what sits under the "% ממחיר החדש" row, decided once for the whole page.
 *
 *   thin cell            the single thin-cell line, no fair number
 *   unscored (no invoice / no norm row / no score)   NOTHING — no fair, no compared, no thin line
 *   otherwise            the fair number and the compared-to line
 *
 * A cancelled car has no invoice at all (§7.1), so it lands on `null` like any other unscored listing.
 */
export type PriceBlock = { fair: string; compared: string } | { thin: string } | null;

export function priceBlock(input: {
  score: number | null;
  thin_cell: boolean;
  median_price: number | null;
  sample_size: number | null;
  window_days: number | null;
}): PriceBlock {
  if (input.thin_cell) return { thin: thinCellLine() };
  if (input.score === null || input.median_price === null || input.sample_size === null || input.window_days === null) return null;
  return { fair: fairLine(input.score, input.median_price), compared: comparedToLine(input.sample_size, input.window_days) };
}

// ---------------------------------------------------------------------------
// §7.1 / §7.3 — the label-or-place line and the back link
// ---------------------------------------------------------------------------

export const CANCELLED_WORD = "ביטול סופי"; // §7.1 — in place of the place, black, no fair number
export const NOT_FOUND = "לא נמצא"; // §3.3 / §7.1 — a listing that is not shown on the site at all

const BACK_TO_PICKS = "חזרה לשלוש ההמלצות";
const BACK_TO_RESULTS = "חזרה לתוצאות";
const TO_SEARCH = "לחיפוש";

/** §7.3 — the back link's word. No question behind the page → "לחיפוש", which targets "/". */
export function backLinkWord(input: { hasQuestion: boolean; labels: Category[] }): string {
  if (!input.hasQuestion) return TO_SEARCH;
  return input.labels.length > 0 ? BACK_TO_PICKS : BACK_TO_RESULTS;
}

/** §7.1 — "מקום {rank}" when the listing has a place and no label. */
export function placeWord(rank: number): string {
  return `מקום ${num(rank)}`;
}

// ---------------------------------------------------------------------------
// §7.7 — the "למה" heading, and the guard that renders nothing
// ---------------------------------------------------------------------------

const WHY_PREFIX = "למה הרכב הזה הוא";
const AND_ALSO = " וגם ";

/**
 * §7.7 — the heading parts of the "למה" section, or NULL when the section must not render at all.
 *
 * null happens for two different reasons and both are the rule:
 *   - the list of lines is empty (in this run it ALWAYS is: what goes in there belongs to the justification
 *     generator, Days 22–23) — "an empty list renders nothing at all: no heading, no box";
 *   - the page carries neither a label nor a place (black page, cancelled, unranked) — the section never
 *     renders there regardless.
 */
export function whyHeading(input: { labels: Category[]; rank: number | null; lines: string[] }): string | null {
  if (input.lines.length === 0) return null;
  if (input.labels.length > 0) return `${WHY_PREFIX} ${input.labels.map((c) => CATEGORY_LABEL[c]).join(AND_ALSO)}`;
  if (input.rank !== null) return `${WHY_PREFIX} ${placeWord(input.rank)}`;
  return null;
}

// ---------------------------------------------------------------------------
// §8.4 — the seller line
// ---------------------------------------------------------------------------

// §2.7 — the only two live dealer types. A type outside this table renders the line WITHOUT a type word
// ("{name} · {region}") — never an invented word and never the raw code; §10's readback surfaces such a row.
export const SELLER_TYPE_WORD: Readonly<Record<string, string>> = {
  lot: "מגרש",
  private: "מוכר פרטי",
};

const PRIVATE_TYPE = "private";

/**
 * §8.4 — `lot` → "{name} · מגרש · {region}"; `private` → "מוכר פרטי · {region}" (NO name); any other type →
 * "{name} · {region}". Region is `listings.region` falling back to `dealers.region`; with both null the line
 * renders without the region segment. No phone number appears on any screen.
 */
export function sellerLine(input: {
  dealer_type: string;
  dealer_name: string;
  listing_region: string | null;
  dealer_region: string | null;
}): string {
  const region = input.listing_region ?? input.dealer_region;
  const parts: string[] = [];
  if (input.dealer_type === PRIVATE_TYPE) {
    parts.push(SELLER_TYPE_WORD[PRIVATE_TYPE]);
  } else {
    parts.push(input.dealer_name);
    if (Object.hasOwn(SELLER_TYPE_WORD, input.dealer_type)) parts.push(SELLER_TYPE_WORD[input.dealer_type]);
  }
  if (region !== null) parts.push(region);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// §8.5 — durations and the ownership-type words
// ---------------------------------------------------------------------------

/**
 * §8.5 — the seven ownership-type words. VERIFIED against the codebase on 22/09 (Run 6b): the codes the
 * codebase produces are src/lib/mot/translator.ts's OwnershipCode — private | company | rental | leasing |
 * dealer — and all five are in this table. `government` and `military` exist in the scoring engine's
 * OWNER_TYPE_DEDUCTION as reserved rows with no live case; they stay here, as §2.8 says. No code the
 * codebase produces is missing from this table, so the verify step has nothing to stop on.
 */
export const OWNERSHIP_WORD: Readonly<Record<string, string>> = {
  private: "פרטית",
  leasing: "ליסינג",
  rental: "השכרה",
  company: "חברה",
  government: "ממשלתי",
  military: "צבאי",
  dealer: "סוחר",
};

export const DEALER_TYPE: OwnershipType = "dealer";

// The three kinds the axis paints differently (§7.6).
export type OwnershipKind = "private" | "institutional" | "dealer";

export function ownershipKind(type: string): OwnershipKind {
  if (type === "dealer") return "dealer";
  if (type === "private") return "private";
  return "institutional"; // leasing | rental | company | government | military
}

const MONTHS_PER_YEAR = 12;

/**
 * §8.5 — the fixed duration forms: "חודש" · "חודשיים" · "{N} חודשים" · "שנה" · "שנתיים" · "{N} שנים",
 * combined as "{years} ו-{months}" ("3 שנים ו-6 חודשים", "שנתיים ו-6 חודשים", "3 שנים וחודש").
 *
 * The connector is "ו-" before a numeral and plain "ו" before a word, which is what §8.5's three worked
 * examples spell out.
 *
 * The grain of the data is the month (`ownership_history[].ym` is "YYYY-MM"), and §8.5's smallest form is
 * "חודש": a span inside one month is therefore shown as "חודש", the smallest word the table has. Nothing is
 * invented for it — see REPORT.md.
 */
export function months(n: number): string {
  if (n === 1) return "חודש";
  if (n === 2) return "חודשיים";
  return `${num(n)} חודשים`;
}

export function years(n: number): string {
  if (n === 1) return "שנה";
  if (n === 2) return "שנתיים";
  return `${num(n)} שנים`;
}

export function duration(totalMonths: number): string {
  const n = Math.max(1, Math.round(totalMonths));
  const y = Math.floor(n / MONTHS_PER_YEAR);
  const m = n % MONTHS_PER_YEAR;
  if (y === 0) return months(m === 0 ? 1 : m);
  if (m === 0) return years(y);
  const tail = months(m);
  return `${years(y)} ${/^\d/.test(tail) ? "ו-" : "ו"}${tail}`;
}

// ---------------------------------------------------------------------------
// §7.6 — the ownership axis, decided here so OwnershipTimeline.tsx only renders
// ---------------------------------------------------------------------------

/** "YYYY-MM" → months since year 0, so two ym values subtract into a month count. */
export function ymIndex(ym: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (m === null) throw new Error(`ownership history: ym ${JSON.stringify(ym)} is not "YYYY-MM"`);
  return Number(m[1]) * MONTHS_PER_YEAR + (Number(m[2]) - 1);
}

export function dateIndex(d: Date): number {
  return d.getUTCFullYear() * MONTHS_PER_YEAR + d.getUTCMonth();
}

export type AxisSegment = {
  type: string; // the stored ownership code
  word: string; // §8.5's word, or the code when it is outside the table (never invented)
  kind: OwnershipKind;
  hand: number | null; // the hand number; null on a dealer row — a dealer is not counted as a hand
  months: number; // duration of this ownership, in months (at least 1, per §8.5's smallest form)
  share: number; // months / the axis's total months — the segment's width
  zero_km: boolean; // §7.6 — the zero-km marker sits above this segment
  current: boolean; // the last row: " · הבעלות הנוכחית"
};

export type AxisScaleTick = { year: number; share_from_start: number };

export type OwnershipAxis = {
  segments: AxisSegment[];
  ticks: AxisScaleTick[]; // one per calendar year inside the axis (desktop only; the phone shows the ends)
  start_label: string; // the right end (RTL): "עלייה לכביש · {M.YYYY}"
  end_label: string; // the left end: "היום"
  total_months: number;
};

const TODAY_WORD = "היום";
const ON_THE_ROAD = "עלייה לכביש";
const CURRENT_OWNERSHIP = "הבעלות הנוכחית";
const NOT_A_HAND = "לא נספר כיד";
const ZERO_KM_LABEL = 'עסקת 0 ק"מ';

/** "{M}.{YYYY}" — the month form the axis end and the licence rubric both use. */
export function monthYear(d: Date): string {
  return `${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}

/**
 * §7.6 — the axis as data. One segment per ownership row, oldest first; widths proportional to duration;
 * hand numbers counted over the non-dealer rows only.
 *
 * `zero_km` comes from the INVOICE's fact and is never recomputed here: the caller passes it in, and the
 * marker is placed on the first row when that row is the leasing one the fact is about (§7.6). No invoice →
 * the caller passes false and there is no marker.
 */
export function ownershipAxis(input: {
  history: { ym: string; type: string }[]; // oldest first, dealer rows included
  first_registration: Date | null;
  now: Date;
  zero_km_deal: boolean;
}): OwnershipAxis {
  if (input.history.length === 0) throw new Error("ownershipAxis: called with an empty history — the caller must use the no-history form instead");

  const nowIdx = dateIndex(input.now);
  const firstYm = ymIndex(input.history[0].ym);
  const startIdx = input.first_registration === null ? firstYm : Math.min(dateIndex(input.first_registration), firstYm);

  // Each row runs until the next row's month; the last one runs until now. The first row is pulled back to
  // the axis start so the bar begins where "עלייה לכביש" says it does.
  const bounds = input.history.map((r, i) => (i === 0 ? startIdx : Math.max(startIdx, ymIndex(r.ym))));
  const raw = bounds.map((from, i) => Math.max(1, (i + 1 < bounds.length ? bounds[i + 1] : Math.max(nowIdx, from + 1)) - from));
  const total = raw.reduce((a, b) => a + b, 0);

  let hand = 0;
  const segments: AxisSegment[] = input.history.map((r, i) => {
    const kind = ownershipKind(r.type);
    if (kind !== "dealer") hand += 1;
    return {
      type: r.type,
      word: OWNERSHIP_WORD[r.type] ?? r.type,
      kind,
      hand: kind === "dealer" ? null : hand,
      months: raw[i],
      share: raw[i] / total,
      zero_km: input.zero_km_deal && i === 0 && r.type === "leasing",
      current: i === input.history.length - 1,
    };
  });

  const ticks: AxisScaleTick[] = [];
  const startYear = Math.floor(startIdx / MONTHS_PER_YEAR);
  const endYear = Math.floor((startIdx + total) / MONTHS_PER_YEAR);
  for (let y = startYear + 1; y <= endYear; y += 1) {
    ticks.push({ year: y, share_from_start: (y * MONTHS_PER_YEAR - startIdx) / total });
  }

  return {
    segments,
    ticks,
    start_label: input.first_registration === null ? ON_THE_ROAD : `${ON_THE_ROAD} · ${monthYear(input.first_registration)}`,
    end_label: TODAY_WORD,
    total_months: total,
  };
}

/** §7.6 — one legend line per ownership. A dealer line is grey and says it is not counted as a hand. */
export function legendLine(s: AxisSegment): string {
  if (s.kind === "dealer") return `${OWNERSHIP_WORD.dealer} · ${duration(s.months)} · ${NOT_A_HAND}`;
  return `יד ${num(s.hand as number)} · ${s.word} · ${duration(s.months)}${s.current ? ` · ${CURRENT_OWNERSHIP}` : ""}`;
}

/** §7.6 — the bold head of a legend line, so the component can weight it without splitting the string itself. */
export function legendHead(s: AxisSegment): string {
  return s.kind === "dealer" ? OWNERSHIP_WORD.dealer : `יד ${num(s.hand as number)} · ${s.word}`;
}

export function legendTail(s: AxisSegment): string {
  if (s.kind === "dealer") return ` · ${duration(s.months)} · ${NOT_A_HAND}`;
  return ` · ${duration(s.months)}${s.current ? ` · ${CURRENT_OWNERSHIP}` : ""}`;
}

export const ZERO_KM_MARKER = ZERO_KM_LABEL;

/** §7.6 — the zero-km explanation, opened from the label. The duration is the invoice's own fact. */
export function zeroKmExplanation(months_to_first_private: number): string {
  return `${ZERO_KM_LABEL} — הרכב נרשם תחילה על שם חברת ליסינג, ועבר לבעלות פרטית אחרי ${duration(months_to_first_private)}. חוזה ליסינג רגיל נמשך שלוש שנים ויותר.`;
}

// §7.6 — no registry history: a dashed empty bar carrying the reason, and one line under it.
const PRE_2017_REASON = "היסטוריית בעלויות לא זמינה לרכבים שנרשמו לפני 2017";
const NO_HISTORY_REASON = "היסטוריית בעלויות לא זמינה במשרד התחבורה לרכב הזה";
const CURRENT_PER_REGISTRY = "הבעלות הנוכחית לפי משרד התחבורה:";
const UNVERIFIED_BY_SELLER = "לפי המוכר, לא אומת";

export type NoHistoryView = {
  reason: string;
  current: string | null; // "הבעלות הנוכחית לפי משרד התחבורה: {word}"; null when the registry holder is unknown too
  current_head: string | null;
  declared: string | null; // grey: "במודעה: יד {hand_declared} — לפי המוכר, לא אומת"
};

/**
 * §7.6 — the no-registry-history form. A car first registered before 2017 gets the pre-2017 reason (the
 * registry's history files start there); every other car gets the general one.
 */
export function noHistoryView(input: {
  first_registration: Date | null;
  current_owner_type: string | null;
  hand_declared: number | null;
}): NoHistoryView {
  const pre2017 = input.first_registration !== null && input.first_registration.getUTCFullYear() < 2017;
  const word = input.current_owner_type === null ? null : (OWNERSHIP_WORD[input.current_owner_type] ?? input.current_owner_type);
  return {
    reason: pre2017 ? PRE_2017_REASON : NO_HISTORY_REASON,
    current: word === null ? null : `${CURRENT_PER_REGISTRY} ${word}`,
    current_head: word === null ? null : CURRENT_PER_REGISTRY,
    declared: input.hand_declared === null ? null : `במודעה: יד ${num(input.hand_declared)} — ${UNVERIFIED_BY_SELLER}`,
  };
}
