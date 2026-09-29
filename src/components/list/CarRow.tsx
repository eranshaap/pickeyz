// A row of the list, the white box the rows sit in, the table's header row and the closing row that opens the
// rest (BRIEF Days 20–21, Run 2 §4.2, §4.4; Days 24–25, Run 1 §4.3–§4.6).
//
// ONE PLACE IN THE CODE: the two uncrowned screens draw these rows without a place, and the bottom list of the
// recommendations screen draws the same component WITH one — which is why `place` is part of the row view and
// never an assumption. The header row, the alignment of every column and the closing row are all here, so the
// table has ONE structure wherever it is drawn.
//
// TWO COMPLETE TREES, split by the site's `md` breakpoint (§4.2) — not one tree that reflows:
//   desktop   a table row: a grid of eight cells, 48px high at the least, and only the "לעמוד הרכב" link navigates. The row
//             body has no click and keeps the default cursor (findCar-now.md, "לחיצות במסך התוצאות").
//   phone     the WHOLE row is the link: one stacked data line and no link text, tapped anywhere, dimming whole.
// The visibility classes are Tailwind's because a media query cannot live in a style attribute; everything the
// brief spells as CSS is a style attribute, so each tree has one convention. THE EXCEPTIONS, both forced:
// `display` is always a class — `hidden md:grid` and `flex md:hidden` — because an inline `display` outranks the
// breakpoint class that hides the tree and both trees would draw at once (Run 2b §1); and a :hover cannot live in
// a style attribute either, so the closing row's hover is a class as well (§4.4).
//
// A RENDERER ONLY: every value arrives decided by src/lib/search/list.ts over load.ts (§2) and every word by
// src/lib/display (§5). `row.place` is the DISPLAYED place (§1); no component reads a stored rank.

import { Children } from "react";
import Link from "next/link";
import { num, shekel, TABLE_HEADINGS } from "@/lib/display/texts";
import { placeLabel } from "@/lib/display/edge-screens";
import { RUBRIC_HEADINGS } from "@/lib/display/rubrics";
import { LinkPending } from "@/components/search/PickCards";
import SentenceLine, { hasSentenceLine } from "./SentenceLine";
import type { ListRow } from "@/lib/search/list";

const DARK = "#221f1c";
const GREY = "#665f58";
const HAIRLINE = "#e6e2db";
const BOX_BG = "#ffffff";
const BOX_BORDER = "#d8d3cb";

const TO_CAR_PAGE = "לעמוד הרכב";
/** The page's "—": what a rubric prints when the value behind it is not there (rubrics.ts). */
const EMPTY_VALUE = "—";

const value = (n: number | null): string => (n === null ? EMPTY_VALUE : num(n));

/**
 * §4.3 — THE DESKTOP TABLE'S ONE GEOMETRY, shared by the header row and every data row: eight tracks, a gap of
 * 14, and the min-width that makes the box scroll sideways rather than squeeze the cells (Run 2b §2.3 — the
 * seven fixed tracks, 56+56+110+90+44+90+100 = 546, plus the seven gaps, with the sentence track at 0).
 */
const TRACKS = "56px 56px 110px 90px 44px 90px minmax(0, 1fr) 100px";
const GAP = 14;
const MIN_WIDTH = 644;

/**
 * §4.3 — THE ALIGNMENT RULE (findCar-now.md, "הטבלה"), applied to the header and the cells alike, in the row's
 * order: a header longer than its cells' content is centred ("מקום", "יד", "בעלות נוכחית"); a header shorter than
 * its content is flush with the start side ("שנה", "מחיר", "ק״מ", "למה במקום הזה"); the link column is flush with
 * the end side. The cells already read this way before this run — the rule is now written once and both rows are
 * drawn from it, so they cannot drift.
 */
const ALIGN = ["center", "start", "start", "start", "center", "center", "start", "end"] as const;

export type CarRowProps = {
  row: ListRow;
};

function DesktopRow({ row }: CarRowProps) {
  return (
    <div
      className="hidden md:grid"
      style={{
        gridTemplateColumns: TRACKS,
        gap: GAP,
        minWidth: MIN_WIDTH,
        alignItems: "center",
        minHeight: 48,
        fontSize: 15,
        color: DARK,
      }}
    >
      {/* §4.2 / §4.5 — the place, the digits alone; empty when the row has none, which is what a group row is. */}
      <span style={{ textAlign: ALIGN[0], fontSize: 14, fontWeight: 600, color: GREY, fontVariantNumeric: "tabular-nums" }}>
        {row.place === null ? "" : num(row.place)}
      </span>
      <span style={{ textAlign: ALIGN[1], fontWeight: 600 }}>{row.year ?? EMPTY_VALUE}</span>
      <span style={{ textAlign: ALIGN[2], fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{shekel(row.price)}</span>
      {/* §4.2 — the km with separators and NO unit: the desktop row has no room for one. */}
      <span style={{ textAlign: ALIGN[3], fontVariantNumeric: "tabular-nums" }}>{value(row.km)}</span>
      <span style={{ textAlign: ALIGN[4] }}>{value(row.hand)}</span>
      <span style={{ textAlign: ALIGN[5] }}>{row.ownership_word ?? EMPTY_VALUE}</span>
      {/* Run 5c §1 — THE ONE CELL THAT WRAPS. It carried `whiteSpace: "nowrap"` with `overflow: "hidden"`, so
          between the phone boundary and the full container width the sentence was cut mid-word with no ellipsis.
          The truncation is gone and the row height above is a MINIMUM, so a two-line cell grows ITS OWN row and
          no other column moves. The other seven cells are numbers and single words and keep their one line. */}
      {/* §4.6 — the generator's cell. Empty while the tag and the sentence are: the cell stays, the text does not. */}
      <span style={{ textAlign: ALIGN[6], fontSize: 14, color: DARK }}>
        <SentenceLine tag={row.tag} sentence={row.sentence} />
      </span>
      <span style={{ textAlign: ALIGN[7] }}>
        <Link href={row.href} style={{ position: "relative", fontSize: 13, fontWeight: 600, color: DARK, textDecoration: "underline" }}>
          {TO_CAR_PAGE}
          <LinkPending compact />
        </Link>
      </span>
    </div>
  );
}

function PhoneRow({ row }: CarRowProps) {
  // Run 2b §1 — `flex` is a CLASS here and never an inline `display`: an inline declaration beats a stylesheet
  // rule whatever media query guards it, so an inline `display: flex` kept this anchor on at ≥900px and drew
  // every desktop row twice. Every other layout value of this tree stays inline, as the file's convention has it.
  return (
    <Link
      href={row.href}
      className="flex md:hidden"
      style={{ position: "relative", padding: "12px 0", flexDirection: "column", gap: 6, textDecoration: "none", color: DARK }}
    >
      <LinkPending />
      {/* §4.2 / §4.5 — the year, the price, the km, the hand and the ownership word, plus "מקום N" when the row
          has a place: there is no header on the phone, so the place carries its own word. The gap is the
          separator, so there is no punctuation to align. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 14, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {row.place !== null && <span style={{ fontWeight: 600, color: GREY }}>{placeLabel(row.place)}</span>}
        <span style={{ fontWeight: 600 }}>{row.year ?? EMPTY_VALUE}</span>
        <span style={{ fontWeight: 700 }}>{shekel(row.price)}</span>
        <span>{`${value(row.km)} ${RUBRIC_HEADINGS.km}`}</span>
        <span>{`יד ${value(row.hand)}`}</span>
        <span>{row.ownership_word ?? EMPTY_VALUE}</span>
      </div>
      {hasSentenceLine(row) && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
          <SentenceLine tag={row.tag} sentence={row.sentence} />
        </p>
      )}
    </Link>
  );
}

/** §4.2 — one component, two complete trees. Exactly one of them is on at any width. */
export default function CarRow(props: CarRowProps) {
  return (
    <>
      <DesktopRow {...props} />
      <PhoneRow {...props} />
    </>
  );
}

/**
 * §4.3 — THE TABLE'S HEADER ROW, desktop only and above a RANKED table only: the list's places 7 and on. The
 * group rows — on the bottom list and on the two uncrowned screens alike — keep no header, as they do today.
 *
 * `sentenceLabel` is decision 6: "למה במקום הזה" is drawn only while at least one row of THAT table carries a
 * line, so until the justification generator lands the header shows six labels, an unlabeled sentence track and
 * the unlabeled link cell.
 *
 * The 32px height is Claude's estimate, 26/09 — the brief pins 12px and the label grey, not the row's height;
 * move by eye on the live site.
 */
function HeaderRow({ sentenceLabel }: { sentenceLabel: boolean }) {
  return (
    <div
      className="hidden md:grid"
      style={{ gridTemplateColumns: TRACKS, gap: GAP, minWidth: MIN_WIDTH, alignItems: "center", height: 32, fontSize: 12, color: GREY }}
    >
      {TABLE_HEADINGS.map((label, i) => (
        <span key={label} style={{ textAlign: ALIGN[i] }}>
          {i === TABLE_HEADINGS.length - 1 && !sentenceLabel ? "" : label}
        </span>
      ))}
      {/* the eighth track — the link column — has no label (§4.3) */}
      <span />
    </div>
  );
}

/**
 * §4.4 — THE CLOSING ROW, the last row of the table while the list is closed: one click and the rest of the list
 * is born where this row stood (§4.1). It is a row of the same table, so it lives beside the row it stands in
 * for; the state it flips belongs to ResultsList.
 *
 * Desktop: a 48px row holding one button styled exactly like the row's "לעמוד הרכב" link — 13px / 600, the site's
 * black, underlined — at the start side, its line thickening on hover (the colour is already the full black, so
 * hover has nothing to darken).
 * Phone: the WHOLE row is the button, at least 44px tall, the text at the start side.
 */
export function MoreRow({ text, onOpen }: { text: string; onOpen: () => void }) {
  return (
    <>
      <div className="hidden md:flex" style={{ minWidth: MIN_WIDTH, alignItems: "center", height: 48 }}>
        <button type="button" onClick={onOpen} className="underline hover:decoration-2" style={{ fontSize: 13, fontWeight: 600, color: DARK }}>
          {text}
        </button>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex underline hover:decoration-2 md:hidden"
        style={{ minHeight: 44, width: "100%", alignItems: "center", justifyContent: "flex-start", textAlign: "start", fontSize: 14, fontWeight: 600, color: DARK }}
      >
        {text}
      </button>
    </>
  );
}

/**
 * §4.4 (Run 2 §4.4) — the white box the rows sit in. Every row but the last gets the hairline, so the last row
 * has no rule under it and the box's own border closes the list. The header row, when there is one, is the first
 * of those rows and carries the hairline under it like any other. Below the phone boundary the header, its
 * wrapper and that hairline all go away together (Run 5c §2), so the phone box opens on its first row.
 */
export function CarRows({ header = false, sentenceLabel = false, children }: { header?: boolean; sentenceLabel?: boolean; children: React.ReactNode }) {
  const rows = [...(header ? [<HeaderRow key="header" sentenceLabel={sentenceLabel} />] : []), ...Children.toArray(children)];
  // Run 2b §2.3 — `md:overflow-x-auto`: the sideways scroll is the DESKTOP box's alone, because it is the
  // desktop row that carries fixed tracks and a min-width. The phone rows have neither and stay as they were.
  return (
    <div
      className="px-3.5 md:overflow-x-auto md:px-5"
      style={{ background: BOX_BG, border: `1px solid ${BOX_BORDER}`, borderRadius: 10, display: "flex", flexDirection: "column", paddingTop: 4, paddingBottom: 4 }}
    >
      {rows.map((child, i) => (
        // The index IS this wrapper's identity: it is the hairline's position in the list, not a row. The row
        // inside it carries its own key (its listing's public_id).
        //
        // Run 5c §2 — THE HEADER'S WRAPPER GOES WHERE THE HEADER GOES. `HeaderRow` is `hidden md:grid`, so below the
        // boundary the header itself drew nothing — but THIS wrapper still drew, and with it the hairline of the
        // row under the header: an empty band with a grey line at the top of the phone box. The whole header
        // element is now one thing that goes away — the wrapper and its border with the row itself — and the first
        // phone row starts at the box's own 4px top padding, exactly like the rows of the no-price group. Above
        // the boundary nothing changed: the wrapper is `md:block` and carries the same hairline it always did.
        <div key={i} className={header && i === 0 ? "hidden md:block" : undefined} style={i === rows.length - 1 ? undefined : { borderBottom: `1px solid ${HAIRLINE}` }}>
          {child}
        </div>
      ))}
    </div>
  );
}
