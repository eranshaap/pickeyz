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
import { fairAmount, fairLine } from "@/lib/justification";

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

// Run 9 §4.2 — THE SHORT FORM. "של רכבים כאלה" is gone from all three: the comparison sentence that used
// to name the comparison group went with it (§4.1), and the phrase has to stand on one line under the price.
const THIN_CELL_LINE = "אין השוואת מחיר — פחות מ-5 רכבים דומים הוצעו למכירה";

// Days 22–23 (Run 2 §7) — THE PRICE EXPRESSION MOVED. fairAmount() and fairLine() now live in
// src/lib/justification/price.ts, and the three wordings they used to keep here as module-private constants live
// in that library's wordings file: the line under the price and the generator's price sentence are ONE string,
// produced once. Behaviour is unchanged — the same amount, the same rounding, the same three wordings — so
// priceBlock() below and the car page are untouched, and this re-export is the whole of the change here.
// priceBlock() below calls fairLine(), so the two names are imported at the top of this file and re-exported
// there: a bare `export ... from` would publish them without binding them in this module.
export { fairAmount, fairLine };

// Run 9 §4.1 — comparedToLine() IS GONE. "הושווה ל-{N} רכבים דומים שהוצעו למכירה ב-{D} הימים האחרונים" was
// deleted, not hidden: it is no longer produced anywhere. `sample_size` and `window_days` themselves are
// untouched — priceBlock() still requires both below (a norm row without them is not a scored listing), and
// the invoice and the measurement go on reading them.

/** §8.2 — a thin cell shows this single line INSTEAD of the fair number. */
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
 *   unscored (no invoice / no norm row / no score)   NOTHING — no fair, no thin line
 *   otherwise            the fair number, alone (Run 9 §4.1 — the compared-to line no longer exists)
 *
 * A cancelled car has no invoice at all (§7.1), so it lands on `null` like any other unscored listing.
 */
export type PriceBlock = { fair: string } | { thin: string } | null;

export function priceBlock(input: {
  score: number | null;
  thin_cell: boolean;
  median_price: number | null;
  sample_size: number | null;
  window_days: number | null;
}): PriceBlock {
  if (input.thin_cell) return { thin: thinCellLine() };
  if (input.score === null || input.median_price === null || input.sample_size === null || input.window_days === null) return null;
  return { fair: fairLine(input.score, input.median_price) };
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

/**
 * §7.1 — "מקום {N}" when the listing has a place and no label.
 *
 * Days 24–25 Run 1 §1.3 — the N is the DISPLAYED PLACE (src/lib/search/places.ts) and no longer the stored
 * rank. The word itself did not change; where the number comes from did.
 */
export function placeWord(rank: number): string {
  return `מקום ${num(rank)}`;
}

// ---------------------------------------------------------------------------
// Days 24–25 Run 1 §5.2–§5.4 — the bottom list's own words
// ---------------------------------------------------------------------------

/**
 * §5.2 — the heading of the list under the three cards: where it starts and how many cars are under it.
 *
 * `firstPlace` is c+1 (c = the cards the screen shows) and `more` is x−c (x = every car the screen shows). On
 * a crowned screen `more` is never below 5 — crowning needs eight eligible cars — so there is no form at one.
 */
export function listHeading(firstPlace: number, more: number): string {
  return `מקום ${num(firstPlace)} והלאה — עוד ${num(more)} רכבים שנבדקו`;
}

/** §5.3 — the closing row of the closed table: the N cars the list is still holding back. */
export function moreCarsLink(n: number): string {
  return n === 1 ? "הצג את הרכב הנוסף" : `הצג את ${num(n)} הרכבים הנוספים`;
}

/**
 * §5.4 — the desktop table's header labels, in the ROW's order: place, year, price, km, hand, current
 * ownership, the sentence. The eighth track — the link to the car page — has no label (§4.3).
 *
 * The km label is the car page's own km rubric heading, character for character: the header, the phone row's
 * unit and the place card's data line may not spell it three ways. It is written out here rather than imported
 * because this file is the display library's LEAF module and rubrics.ts imports it — an import back would be a
 * cycle. texts.test.ts pins the two strings equal, so the one spelling cannot drift.
 */
export const TABLE_HEADINGS = ["מקום", "שנה", "מחיר", 'ק"מ', "יד", "בעלות נוכחית", "למה במקום הזה"] as const;

// ---------------------------------------------------------------------------
// Run 9 §1.2 — the car title
// ---------------------------------------------------------------------------

/**
 * §1.2 — the title's parts: the model, then the year. NO COMMA ANYWHERE — the two are separated by a gap the
 * component opens (0.4em), never by punctuation, which is the whole of the change. A car with no year is one
 * part and nothing else.
 *
 * The model string itself is whatever the caller already shows; this function never edits it.
 */
export function titleParts(model: string, year: number | null): string[] {
  return year === null ? [model] : [model, String(year)];
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
// §8.4 — the seller line: GONE (Run 9 §4.4)
// ---------------------------------------------------------------------------

// sellerLine(), SELLER_TYPE_WORD and the PRIVATE_TYPE code are deleted, not hidden: the business name, the
// "מגרש" / "מוכר פרטי" word, the dealer's region and the line that joined them no longer appear on the car
// page on either screen. The DATA is untouched — listings.region, dealers.name, dealers.dealer_type and
// dealers.region are all still read and stored; what the page shows of the region now is the region line
// under the price (CarPageView.tsx §4.3), which reads listings.region and nothing else.
//
// src/components/search/labels.tsx keeps its own sellerKind() for the RESULT CARDS — a different line, on a
// different screen, that §7 leaves alone.

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
  start_label: string; // Run 8 §4.1 — the right end (RTL): "{M.YYYY} · עלייה לכביש", the DATE FIRST
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
    // Run 8 §4.1 — THE DATE FIRST: the date sits next to its own tick (the right edge, RTL) and the caption
    // trails inward. Decision 7 of DECISIONS-day19-fixes.md, 23/09. Anchoring, size, colour and the flush
    // placement do not change — no geometry moved; only the order of the two parts did.
    start_label: input.first_registration === null ? ON_THE_ROAD : `${monthYear(input.first_registration)} · ${ON_THE_ROAD}`,
    end_label: TODAY_WORD,
    total_months: total,
  };
}

/**
 * Run 8 §4.3 — THE 0-KM DEAL IS A WORD IN THE FIRST HAND'S LABEL, not a marker above the bar. When the
 * segment carries the invoice's flag (`zero_km`, set by ownershipAxis above under the existing rule and the
 * existing ZERO_KM_WINDOW_MONTHS — no new rule and no new constant), "עסקת 0 ק"מ" stands IN PLACE OF the
 * ownership-type word: "יד 1 · עסקת 0 ק"מ · {משך}". Without the flag the line is today's, "יד 1 · ליסינג ·
 * {משך}". The duration, the rest of the row and the last row's " · הבעלות הנוכחית" suffix are unchanged.
 */
function ownershipWordOf(s: AxisSegment): string {
  return s.zero_km ? ZERO_KM_LABEL : s.word;
}

/** §7.6 — one legend line per ownership. A dealer line is grey and says it is not counted as a hand. */
export function legendLine(s: AxisSegment): string {
  if (s.kind === "dealer") return `${OWNERSHIP_WORD.dealer} · ${duration(s.months)} · ${NOT_A_HAND}`;
  return `יד ${num(s.hand as number)} · ${ownershipWordOf(s)} · ${duration(s.months)}${s.current ? ` · ${CURRENT_OWNERSHIP}` : ""}`;
}

/** §7.6 — the bold head of a legend line, so the component can weight it without splitting the string itself. */
export function legendHead(s: AxisSegment): string {
  return s.kind === "dealer" ? OWNERSHIP_WORD.dealer : `יד ${num(s.hand as number)} · ${ownershipWordOf(s)}`;
}

export function legendTail(s: AxisSegment): string {
  if (s.kind === "dealer") return ` · ${duration(s.months)} · ${NOT_A_HAND}`;
  return ` · ${duration(s.months)}${s.current ? ` · ${CURRENT_OWNERSHIP}` : ""}`;
}

/**
 * Run 8 §4.3 — the head split so that ONLY the 0-km phrase is a control. `before + (phrase ?? "")` is always
 * exactly legendHead(s); the component makes `phrase` a <button> with the dotted underline and hangs the
 * explanation popover off it, and renders `before` as plain text. The decision of what is clickable is made
 * here, not there.
 */
export function legendHeadParts(s: AxisSegment): { before: string; phrase: string | null } {
  if (s.kind === "dealer" || !s.zero_km) return { before: legendHead(s), phrase: null };
  return { before: `יד ${num(s.hand as number)} · `, phrase: ZERO_KM_LABEL };
}

/**
 * The 0-km phrase's exact characters — the quote mark in ק"מ included. Run 7's marker above the bar used
 * this same constant and is gone (§4.3); the phrase in the first hand's label is its one home now, and the
 * explanation text (zeroKmExplanation below) is built from it too, so the three can never drift apart.
 */
export const ZERO_KM_MARKER = ZERO_KM_LABEL;

// ---------------------------------------------------------------------------
// Run 9 §1.4 — the dealer-transitions legend line
// ---------------------------------------------------------------------------

const DEALER_TRANSITION_ONE = "מעבר סוחר";
const DEALER_TRANSITION_MANY = "מעברי סוחר";
const NOT_COUNTED_ONE = "לא נספר כיד";
const NOT_COUNTED_MANY = "לא נספרים כיד";

/**
 * §2.2 — the dealer rows LEAVE the per-row legend list and come back as ONE last row summarising them all.
 * `phrase` is the part the component makes a dotted control (ExplainPhrase); `before + phrase + after` is
 * the whole line and nothing else, so the split can never change what it reads.
 */
export type DealerTransitions = {
  count: number;
  months: number;
  before: string;
  phrase: string;
  after: string;
};

/**
 * §1.4 — null when the axis has no dealer row at all; otherwise the summary of every dealer row on it, with
 * the months summed and the duration written by the axis's own formatter.
 */
export function dealerTransitionsLine(segments: readonly { kind: OwnershipKind; months: number }[]): DealerTransitions | null {
  const dealers = segments.filter((s) => s.kind === "dealer");
  if (dealers.length === 0) return null;
  const count = dealers.length;
  const total = dealers.reduce((a, s) => a + s.months, 0);
  const one = count === 1;
  return {
    count,
    months: total,
    before: one ? "" : `${num(count)} `,
    phrase: one ? DEALER_TRANSITION_ONE : DEALER_TRANSITION_MANY,
    after: ` · ${duration(total)} · ${one ? NOT_COUNTED_ONE : NOT_COUNTED_MANY}`,
  };
}

// ---------------------------------------------------------------------------
// Run 9 §1.5 — the gap after the top block
// ---------------------------------------------------------------------------

/**
 * §1.5 — the distance from the top block to the first section heading under it: one and a half times the
 * page's own section gap, rounded UP to a multiple of 4. It is a function of S and never a second constant,
 * so the day S changes this follows it.
 */
export function gapAfterTopBlock(sectionGapPx: number): number {
  return Math.ceil((sectionGapPx * 1.5) / 4) * 4;
}

// ---------------------------------------------------------------------------
// Run 7 §2.3 — ONE tick layout, with the collision rule
// ---------------------------------------------------------------------------

/**
 * §2.1 — the scale row's geometry is right-to-left and is expressed ONCE, here, as distances from the axis's
 * RIGHT edge (the on-the-road end). The component turns a distance into `insetInlineEnd`; it decides nothing.
 *
 *   start  the rightmost label, "עלייה לכביש · {M.YYYY}" — pinned at 0 and extending LEFTWARD (no transform)
 *   end    "היום" — pinned at the LEFT edge and extending rightward, so it cannot leave the card
 *   year   a tick at its year's boundary with the label CENTRED on it (translateX(50%) in the component)
 */
export type ScaleLabelKind = "start" | "end" | "year";

export type ScaleLabel = {
  kind: ScaleLabelKind;
  /** The tick's distance from the right edge, 0..1 of the axis width. `end` carries 1, `start` carries 0. */
  share_from_start: number;
  text: string;
  /** Year labels only — the component keys and draws a tick for them. */
  year: number | null;
};

/**
 * §2.3 — the clearance every drawn label must keep from every label already drawn.
 * Nothing in the scale row may overlap anything else, at any card width.
 */
export const SCALE_LABEL_GAP_PX = 12;

/**
 * The width of a 12px scale label, estimated rather than measured: this is a pure function and there is no
 * DOM here.
 *
 * RUN 8 §4.2 — PER CHARACTER CLASS, not a flat rate. Run 7's flat 0.6em per character was a deliberate
 * over-estimate, but on the deployed build it cost a tick that had room: at 12px the twenty-character end
 * label "1.2022 · עלייה לכביש" was estimated at 144px while Assistant renders it at roughly 110px, and those
 * ~34px of phantom width ate the gap to the 2023 label — which cleared by about 45px in reality and by under
 * 12px on paper, so the rule skipped it. The classes below are Assistant 400 at the row's 12px; they are
 * still a slight over-estimate and never an under-estimate, which is what §2.3 requires (over-estimating can
 * only drop a tick that would have fitted; under-estimating would let two labels touch).
 *
 * The rule itself is untouched: ≥ 12px clearance, both end labels always, then the years in order, and a
 * skipped year loses its tick and its label together.
 */
export const SCALE_CHAR_EM_HEBREW = 0.5; // a Hebrew letter
export const SCALE_CHAR_EM_ALNUM = 0.58; // a digit or a Latin letter
export const SCALE_CHAR_EM_NARROW = 0.3; // a space, a middle dot, a period
const SCALE_FONT_PX = 12;

/** Which of the three classes one character falls in. Anything unlisted takes the widest, never the narrowest. */
function charEm(ch: string): number {
  if (ch === " " || ch === "·" || ch === ".") return SCALE_CHAR_EM_NARROW;
  if (/[0-9A-Za-z]/.test(ch)) return SCALE_CHAR_EM_ALNUM;
  if (/[\u0590-\u05FF]/.test(ch)) return SCALE_CHAR_EM_HEBREW;
  return SCALE_CHAR_EM_ALNUM;
}

export function scaleLabelWidth(text: string): number {
  let em = 0;
  for (const ch of text) em += charEm(ch);
  return em * SCALE_FONT_PX;
}

/** A label's footprint on the axis, as [near, far] distances from the RIGHT edge, in px. */
function span(label: ScaleLabel, width_px: number): [number, number] {
  const w = scaleLabelWidth(label.text);
  const x = label.share_from_start * width_px;
  if (label.kind === "start") return [x, x + w]; // pinned right, grows leftward
  if (label.kind === "end") return [x - w, x]; // pinned left, grows rightward
  return [x - w / 2, x + w / 2]; // centred on the tick
}

const clears = (a: [number, number], b: [number, number]): boolean => a[0] - b[1] >= SCALE_LABEL_GAP_PX || b[0] - a[1] >= SCALE_LABEL_GAP_PX;

/**
 * §2.3 — all the scale labels in ONE pass, in priority order: the two end labels are always drawn, then each
 * year in turn is drawn only if it clears every label already drawn by at least SCALE_LABEL_GAP_PX; a year
 * that does not clear is skipped ENTIRELY — its tick goes with its label, never one without the other.
 *
 * `width_px` is the scale row's measured width. 0 (the server render, before anything has been measured)
 * yields the two ends and no year at all, which is the correct answer for a row of unknown width.
 */
export function scaleLayout(axis: OwnershipAxis, width_px: number): ScaleLabel[] {
  const start: ScaleLabel = { kind: "start", share_from_start: 0, text: axis.start_label, year: null };
  const end: ScaleLabel = { kind: "end", share_from_start: 1, text: axis.end_label, year: null };
  const drawn: ScaleLabel[] = [start, end];
  if (width_px <= 0) return drawn;

  const spans: [number, number][] = drawn.map((l) => span(l, width_px));
  for (const t of axis.ticks) {
    const label: ScaleLabel = { kind: "year", share_from_start: t.share_from_start, text: String(t.year), year: t.year };
    const s = span(label, width_px);
    if (s[0] < 0 || s[1] > width_px) continue; // a label that would leave the card is not drawn at all
    if (!spans.every((other) => clears(s, other))) continue;
    drawn.push(label);
    spans.push(s);
  }
  return drawn;
}

// ---------------------------------------------------------------------------
// §2.5 — the shade ramp: GONE (Run 9 §1.1)
// ---------------------------------------------------------------------------

// Run 7's shadeRamp(), with hexToHsl(), hslToHex(), RAMP_STEPS and the HSL lightness bounds it interpolated
// between, is deleted. Its replacement is shadeFor() in src/lib/display/shades.ts — ONE implementation, never
// two — which runs the ladder from the page colour itself down to a light end read off the board, in OKLCH,
// and counts it from the CURRENT ownership backwards rather than from the oldest one forwards.

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
