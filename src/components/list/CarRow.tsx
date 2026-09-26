// A row of a car with no price comparison, and the white box the rows sit in (BRIEF Days 20–21, Run 2 §4.2,
// §4.4).
//
// ONE PLACE IN THE CODE: the two edge screens draw these rows without a place today; places 7 and on in the
// bottom list of Days 24–25 will draw the same component WITH one, which is why `place` is a prop and not an
// assumption.
//
// TWO COMPLETE TREES, split by the site's `md` breakpoint (§4.2) — not one tree that reflows:
//   desktop   a table row: a grid of eight cells, 48px high, and only the "לעמוד הרכב" link navigates. The row
//             body has no click and keeps the default cursor (findCar-now.md, "לחיצות במסך התוצאות").
//   phone     the WHOLE row is the link: one stacked data line and no link text, tapped anywhere, dimming whole.
// The visibility classes are Tailwind's because a media query cannot live in a style attribute; everything the
// brief spells as CSS is a style attribute, so each tree has one convention. THE ONE EXCEPTION (Run 2b §1):
// `display` is always a class — `hidden md:grid` and `flex md:hidden` — because an inline `display` outranks the
// breakpoint class that hides the tree and both trees would draw at once.
//
// A RENDERER ONLY: every value arrives decided by load.ts (§3.4) and edge-screens.ts (§2.4).

import { Children } from "react";
import Link from "next/link";
import { ownershipWord } from "@/lib/display/cards";
import { num, shekel } from "@/lib/display/texts";
import { RUBRIC_HEADINGS } from "@/lib/display/rubrics";
import { LinkPending } from "@/components/search/PickCards";
import type { DrawnCar } from "@/lib/search/load";

const DARK = "#221f1c";
const GREY = "#665f58";
const HAIRLINE = "#e6e2db";
const BOX_BG = "#ffffff";
const BOX_BORDER = "#d8d3cb";

const TO_CAR_PAGE = "לעמוד הרכב";
/** The page's "—": what a rubric prints when the value behind it is not there (rubrics.ts). */
const EMPTY_VALUE = "—";

const value = (n: number | null): string => (n === null ? EMPTY_VALUE : num(n));

export type CarRowProps = {
  car: DrawnCar;
  /** The place this row holds in the full list, or null — it is null on both edge screens (§4.2). */
  place: number | null;
  questionPublicId: string;
};

function DesktopRow({ car, place, questionPublicId }: CarRowProps) {
  const word = car.ownership_type === null ? EMPTY_VALUE : ownershipWord(car.ownership_type);
  return (
    <div
      className="hidden md:grid"
      style={{
        gridTemplateColumns: "56px 56px 110px 90px 44px 90px minmax(0, 1fr) 100px",
        gap: 14,
        // Run 2b §2.3 — the seven fixed tracks (56+56+110+90+44+90+100 = 546) plus the seven 14px gaps, with
        // the sentence track at 0: below 644px the row does not squeeze its cells, the box scrolls sideways.
        minWidth: 644,
        alignItems: "center",
        height: 48,
        fontSize: 15,
        color: DARK,
      }}
    >
      {/* §4.2 — the place, the digits alone; empty when null, which is what it is on both edge screens. */}
      <span style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: GREY, fontVariantNumeric: "tabular-nums" }}>
        {place === null ? "" : num(place)}
      </span>
      <span style={{ fontWeight: 600 }}>{car.year ?? EMPTY_VALUE}</span>
      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{shekel(car.price)}</span>
      {/* §4.2 — the km with separators and NO unit: the desktop row has no room for one. */}
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value(car.km)}</span>
      <span style={{ textAlign: "center" }}>{value(car.hand)}</span>
      <span style={{ textAlign: "center" }}>{word}</span>
      {/* Days 22–23 — the generator's line. Empty when null: the cell stays, the text does not. */}
      <span style={{ fontSize: 14, color: DARK, whiteSpace: "nowrap", overflow: "hidden" }}>{car.sentence ?? ""}</span>
      <span style={{ textAlign: "end" }}>
        <Link
          href={`/listing/${car.public_id}?s=${questionPublicId}`}
          style={{ position: "relative", fontSize: 13, fontWeight: 600, color: DARK, textDecoration: "underline" }}
        >
          {TO_CAR_PAGE}
          <LinkPending compact />
        </Link>
      </span>
    </div>
  );
}

function PhoneRow({ car, questionPublicId }: CarRowProps) {
  const word = car.ownership_type === null ? EMPTY_VALUE : ownershipWord(car.ownership_type);
  // Run 2b §1 — `flex` is a CLASS here and never an inline `display`: an inline declaration beats a stylesheet
  // rule whatever media query guards it, so an inline `display: flex` kept this anchor on at ≥768px and drew
  // every desktop row twice. Every other layout value of this tree stays inline, as the file's convention has it.
  return (
    <Link
      href={`/listing/${car.public_id}?s=${questionPublicId}`}
      className="flex md:hidden"
      style={{ position: "relative", padding: "12px 0", flexDirection: "column", gap: 6, textDecoration: "none", color: DARK }}
    >
      <LinkPending />
      {/* §4.2 — FIVE spans, and no place: the phone board's row is the year, the price, the km, the hand and
          the ownership word. The gap is the separator, so there is no punctuation to align. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 14, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontWeight: 600 }}>{car.year ?? EMPTY_VALUE}</span>
        <span style={{ fontWeight: 700 }}>{shekel(car.price)}</span>
        <span>{`${value(car.km)} ${RUBRIC_HEADINGS.km}`}</span>
        <span>{`יד ${value(car.hand)}`}</span>
        <span>{word}</span>
      </div>
      {car.sentence !== null && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{car.sentence}</p>}
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
 * §4.4 — the white box the rows sit in. Every row but the last gets the hairline, so the last row has no rule
 * under it and the box's own border closes the list. NO HEADER ROW: the table header belongs to the bottom list
 * (Days 24–25) and is drawn on neither of this run's boards.
 */
export function CarRows({ children }: { children: React.ReactNode }) {
  const rows = Children.toArray(children);
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
        <div key={i} style={i === rows.length - 1 ? undefined : { borderBottom: `1px solid ${HAIRLINE}` }}>
          {child}
        </div>
      ))}
    </div>
  );
}
