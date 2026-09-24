"use client";

// The ownership axis (BRIEF Run 6b §7.6; corrected by Run 7 §2, Run 8 §4, then Run 9 §2) — "היסטוריית בעלויות".
//
// STILL A DUMB RENDERER: the segments, their widths, the hand numbers, the year ticks, the legend lines, the
// 0-km phrase, the dealer-transitions summary and the no-history wording are all decided by the pure
// functions of src/lib/display/texts.ts (ownershipAxis, scaleLayout, legendHeadParts/legendTail,
// dealerTransitionsLine, zeroKmExplanation, noHistoryView) and src/lib/display/shades.ts (shadeFor), and
// tested there. Nothing here computes a duration, reads an invoice or picks a colour.
//
// IT IS A CLIENT COMPONENT FOR ONE REASON (§2.3): the collision rule is "a year label is drawn only if it
// clears every already-drawn label by >= 12px, at any card width", and a width is a measured thing. The row
// measures itself and hands the number to scaleLayout(); the rule itself lives in the display library with
// its tests. The server render passes width 0, which scaleLayout answers with the two end labels and no year
// — the correct answer for a row whose width is not yet known — so the first client render matches the
// server's and the ticks appear on the same frame as hydration.
//
// ONE RIGHT-TO-LEFT GEOMETRY (§2.1). On-the-road is the RIGHT edge, today is the LEFT edge. The bar and the
// scale row are two rows of ONE column template, so they cannot drift apart.
//
// THE RULE FOR THE SCALE ROW (Run 7c §11.1): PHYSICAL INSETS — `right` and `left` — NEVER `insetInline*`.
// The axis is a right-to-left drawing regardless of writing direction. layout.tsx sets `dir="rtl"` on
// <html>, and under `direction: rtl` the logical insets MEAN THE OPPOSITE of what this row wants:
// `insetInlineEnd` resolves to `left` and `insetInlineStart` to `right`. That is why the scale came out
// mirrored against its own bar on the deployed build — "עלייה לכביש" at the left, "היום" at the right —
// while the bar, a CSS grid whose first column is the right one under RTL, was correct all along.
//
// RUN 9 §2.1 — THE LADDER RUNS FROM THE CURRENT OWNERSHIP BACKWARDS, and a dealer is a hollow box:
//
//   private / institutional   shadeFor(indexFromCurrent, ownerCount, pageColor) — the CURRENT ownership
//                             carries the page colour itself and every earlier one is one rung lighter.
//                             Run 7's ramp ran the other way and is gone (see shades.ts's head comment).
//   dealer                    white with a 1px SOLID border in the page colour (it was a dashed grey one),
//                             NO hand number, no shade, no rung of the ladder, and — as before — nothing
//                             above the axis at all.
//
// RUN 9 §2.2 — THE LEGEND IS A COLUMN, ONE ROW PER OWNERSHIP, AND THE DEALERS LEAVE IT. Every dealer row of
// the axis is summed into ONE last grey row — "{N} מעברי סוחר · {משך} · לא נספרים כיד" — whose count, sum
// and wording are dealerTransitionsLine()'s and not this file's. The phrase inside it is a dotted control
// opening the explanation window of §2.3, exactly as "עסקת 0 ק"מ" is in the first hand's own row.
//
// RUN 8c §2 — THE PHRASE AND ITS WINDOW ARE NOT THIS FILE'S. Both live in ExplainPhrase.tsx, which owns
// every way the window opens and closes — the mouse's hover, the finger's tap, the keyboard's Tab and Esc —
// and is generic in its two props, which is why §2.3's second window needed no new behaviour: it is the
// same component with other children. This file keeps no popover state, refs or listeners at all.

import { useEffect, useRef, useState } from "react";
import type { AxisSegment, NoHistoryView, OwnershipAxis } from "@/lib/display/texts";
import { dealerTransitionsLine, legendHeadParts, legendTail, scaleLayout } from "@/lib/display/texts";
import { shadeFor } from "@/lib/display/shades";
import ExplainPhrase from "./ExplainPhrase";

const DASHED = "#c9c3b9";
const GREY = "#665f58";
const DARK = "#221f1c";

// §2.1 — the scale row's own measurements, off the board.
const SCALE_HEIGHT = 30;
const TICK_COLOR = "#c9c3b9";
const TICK_HEIGHT = 8;
const TICK_WIDTH = 1;

// §3 — the bar, off the board. §2.1: the per-segment minimum comes down from 14px to 10px, so a one-month
// dealer transition between two long ownerships takes less of their share than it did.
const BAR_HEIGHT = 28;
const BAR_RADIUS = 6;
const SEGMENT_GAP = 2;
const SEGMENT_MIN_PX = 10;

// §2.2 — the legend's own measurements: a column with 8px between its rows, and the 14×14 swatch.
const LEGEND_GAP = 8;
const SWATCH = 14;
const SWATCH_RADIUS = 3;

/**
 * §2.3 — the dealer-transition explanation, the one piece of Hebrew this file holds: it is MARKUP and not a
 * string (the clause that matters is a <strong>), which is why it cannot sit in texts.ts with the rest. The
 * words are the BRIEF's, verbatim; the phrase that opens it is dealerTransitionsLine()'s.
 */
const DEALER_EXPLANATION = (
  <>
    {"מעבר סוחר — בדרך מבעלים אחד לבא אחריו הרכב היה אצל סוחר רכב, שקנה אותו כדי למכור אותו הלאה. התקופה הזאת רשומה במשרד התחבורה, אבל "}
    <strong className="font-bold">היא לא נספרת כיד ולא משפיעה על מחיר הרכב</strong>
    {"."}
  </>
);

/** §2.1 — a dealer is HOLLOW, in the page colour; every ownership segment takes its rung of the ladder. */
function segmentStyle(s: AxisSegment, fill: string | null, color: string): React.CSSProperties {
  if (s.kind === "dealer") return { background: "#ffffff", border: `1px solid ${color}`, boxSizing: "border-box" };
  return { background: fill ?? undefined };
}

export default function OwnershipTimeline({
  axis,
  noHistory,
  color,
  zeroKmExplanation,
}: {
  /** The axis as data; null when the car has no registry history and `noHistory` carries the reason instead. */
  axis: OwnershipAxis | null;
  noHistory: NoHistoryView | null;
  color: string;
  /** The zero-km explanation, when the invoice says there is a zero-km deal. */
  zeroKmExplanation: string | null;
}) {
  // §2.3 — the scale row's measured width. 0 until it has been measured, which is also the server's answer.
  const scaleRef = useRef<HTMLDivElement>(null);
  const [scaleWidth, setScaleWidth] = useState(0);

  // Run 8c §2 — the popover's state, its two refs and Run 8b's two listeners are gone from here: they are
  // ExplainPhrase's, one set per phrase per copy of the axis, which is what they always were in effect.

  // useEffect, not useLayoutEffect: this component is server-rendered too, and useLayoutEffect does nothing
  // there but warn. The server HTML has already painted its two end labels by then, so measuring one paint
  // later costs nothing visible — the ticks arrive with hydration either way.
  useEffect(() => {
    const el = scaleRef.current;
    if (el === null) return;
    const measure = () => setScaleWidth(el.getBoundingClientRect().width);
    measure();
    // The card is fluid and this component is rendered twice (phone and desktop), so the width changes with
    // the viewport and with which copy is displayed. A hidden copy measures 0 and draws no year — correct.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---------------------------------------------------------------- no history
  if (axis === null) {
    if (noHistory === null) return null;
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-[#d8d3cb] bg-white p-4">
        <div
          className="flex items-center justify-center rounded-md px-3 text-center text-[13px]"
          style={{ height: BAR_HEIGHT, border: `1px dashed ${DASHED}`, color: GREY }}
        >
          {noHistory.reason}
        </div>
        {noHistory.current !== null && (
          <p className="text-[15px]" style={{ color: DARK }}>
            <strong className="font-bold">{noHistory.current_head}</strong>
            {noHistory.current.slice((noHistory.current_head ?? "").length)}
          </p>
        )}
        {noHistory.declared !== null && (
          <p className="text-[15px]" style={{ color: GREY }}>
            {noHistory.declared}
          </p>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- the axis

  // §2.1 — the ladder is counted over the OWNERSHIP rows only and from the CURRENT one backwards: `hand` is
  // 1 on the oldest ownership and `ownerCount` on the current one, so `ownerCount - hand` is 0 on the
  // current ownership and grows into the past. Dealer rows carry no hand, take no rung and take no fill.
  const ownerCount = axis.segments.filter((s) => s.kind !== "dealer").length;
  const fills = axis.segments.map((s) => (s.kind === "dealer" ? null : shadeFor(ownerCount - (s.hand as number), ownerCount, color)));

  // §2.4 — the bar and the scale row are the SAME column template, so they cannot drift apart. §2.1 — every
  // track is minmax(10px, {share}fr): a segment can be squeezed to a sliver but never to nothing.
  const template = axis.segments.map((s) => `minmax(${SEGMENT_MIN_PX}px, ${s.share}fr)`).join(" ");

  const labels = scaleLayout(axis, scaleWidth);

  // §2.2 — the per-row legend list is the OWNERSHIPS; the dealers are summed into the one last row under it.
  const ownerRows = axis.segments.map((s, i) => ({ s, fill: fills[i] })).filter((r) => r.s.kind !== "dealer");
  const dealers = dealerTransitionsLine(axis.segments);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#d8d3cb] bg-white p-4 md:px-6 md:py-5">
      {/* ------------------------------------------------------------------ the bar */}
      {/* §4.3 — the bar is the FIRST row of the card now: the 0-km row that used to sit above it is gone,
          and no height is reserved for it. */}
      {/* A grid, not a flex row of percentages: with `fr` the 2px gaps come out of the track sizes instead of
          being added to a width that already totalled 100%, so the bar is exactly as wide as its card and
          every segment keeps the share ownershipAxis() gave it. */}
      <div className="grid" style={{ gridTemplateColumns: template, columnGap: SEGMENT_GAP, height: BAR_HEIGHT }}>
        {axis.segments.map((s, i) => (
          <span
            key={i}
            className="block h-full min-w-0"
            style={{
              ...segmentStyle(s, fills[i], color),
              // RTL: the oldest segment is at the start (right), so the outer ends are the first and the last
              borderStartStartRadius: i === 0 ? BAR_RADIUS : 0,
              borderEndStartRadius: i === 0 ? BAR_RADIUS : 0,
              borderStartEndRadius: i === axis.segments.length - 1 ? BAR_RADIUS : 0,
              borderEndEndRadius: i === axis.segments.length - 1 ? BAR_RADIUS : 0,
            }}
          />
        ))}
      </div>

      {/* ------------------------------------------------------------ the scale (§2.1, §2.3) */}
      <div ref={scaleRef} className="relative text-[12px]" style={{ color: GREY, height: SCALE_HEIGHT }}>
        {labels.map((l) => {
          // "היום" — the LAST cell's PHYSICAL LEFT edge (§11.1), pinned there so it can never leave the card.
          // Run 7b §10.2: the board gives this end a tick as well, the same 1px × 8px mark the year ticks
          // carry, and it belongs under the LEFT end of the word — the very edge `left: 0` pins. `block`
          // alone would put it at the box's inline start, which under RTL is the word's RIGHT end, so the
          // tick is pushed left by a physical `marginRight: auto`. It also replaces the padding that used to
          // stand in for the missing tick, so the word still lands on the labels' baseline.
          if (l.kind === "end") {
            return (
              <span key="end" className="absolute top-0 whitespace-nowrap" style={{ left: 0 }}>
                <span
                  aria-hidden
                  className="block"
                  style={{ width: TICK_WIDTH, height: TICK_HEIGHT, background: TICK_COLOR, marginRight: "auto" }}
                />
                {l.text}
              </span>
            );
          }
          // The first (rightmost) tick carries "עלייה לכביש · {M.YYYY}" extending LEFTWARD with no transform;
          // every year tick is anchored at its cell's right edge with its label CENTRED on it. §11.1: the
          // anchor is the PHYSICAL right edge — `right`, not `insetInlineEnd`. `translateX(50%)` is unchanged:
          // it was written for right-edge anchoring and is correct now that the anchoring is physical.
          const isStart = l.kind === "start";
          return (
            <span
              key={isStart ? "start" : `y${l.year}`}
              className="absolute top-0 whitespace-nowrap text-center"
              style={{ right: `${l.share_from_start * 100}%`, transform: isStart ? undefined : "translateX(50%)" }}
            >
              <span
                aria-hidden
                className={isStart ? "block" : "mx-auto block"}
                style={{ width: TICK_WIDTH, height: TICK_HEIGHT, background: TICK_COLOR }}
              />
              {l.text}
            </span>
          );
        })}
      </div>

      {/* --------------------------------------------- the legend (§2.2): a COLUMN, never wrapping */}
      {/* Run 8 §4.3 — the 0-km deal lives HERE, as the first hand's own word, with the phrase alone
          clickable. Run 9 §2.2 — the dealer rows are not in this list; their one summary row follows it. */}
      <ul className="pt-2" style={{ display: "flex", flexDirection: "column", gap: LEGEND_GAP }}>
        {ownerRows.map(({ s, fill }, i) => {
          const head = legendHeadParts(s);
          return (
            <li key={i} className="flex items-center gap-2 text-[15px]" style={{ color: DARK }}>
              {/* §2.5 — the swatch is the segment's own fill, so the legend and the bar can never disagree */}
              <span
                aria-hidden
                className="inline-block shrink-0"
                style={{ width: SWATCH, height: SWATCH, borderRadius: SWATCH_RADIUS, ...segmentStyle(s, fill, color) }}
              />
              <span>
                <strong className="font-bold">
                  {head.before}
                  {/* Run 8c §2.1 — the phrase and its window, with today's text, from the one component
                      that owns them. The window is rendered only when there is an explanation to put in
                      it, exactly as before: the phrase itself does not depend on it. */}
                  {head.phrase !== null && <ExplainPhrase phrase={head.phrase}>{zeroKmExplanation}</ExplainPhrase>}
                </strong>
                {legendTail(s)}
              </span>
            </li>
          );
        })}

        {/* §2.2 — the one dealer row: a hollow swatch in the page colour and the summary line, grey. The
            phrase is the same ExplainPhrase control, so it inherits this row's colour and carries its own
            dotted underline, and it opens §2.3's window on hover, on a tap and on Tab. */}
        {dealers !== null && (
          <li className="flex items-center gap-2 text-[15px]" style={{ color: GREY }}>
            <span
              aria-hidden
              className="inline-block shrink-0"
              style={{
                width: SWATCH,
                height: SWATCH,
                borderRadius: SWATCH_RADIUS,
                background: "#ffffff",
                border: `1px solid ${color}`,
                boxSizing: "border-box",
              }}
            />
            <span>
              {dealers.before}
              <ExplainPhrase phrase={dealers.phrase}>{DEALER_EXPLANATION}</ExplainPhrase>
              {dealers.after}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
