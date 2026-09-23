"use client";

// The ownership axis (BRIEF Run 6b §7.6; corrected by Run 7 §2) — "היסטוריית בעלויות".
//
// STILL A DUMB RENDERER: the segments, their widths, the hand numbers, the year ticks, the legend lines, the
// zero-km marker and the no-history wording are all decided by the pure functions of
// src/lib/display/texts.ts (ownershipAxis, scaleLayout, shadeRamp, legendHead/legendTail, zeroKmExplanation,
// noHistoryView) and tested there. Nothing here computes a duration, reads an invoice or picks a colour.
//
// IT IS A CLIENT COMPONENT FOR ONE REASON (§2.3): the collision rule is "a year label is drawn only if it
// clears every already-drawn label by >= 12px, at any card width", and a width is a measured thing. The row
// measures itself and hands the number to scaleLayout(); the rule itself lives in the display library with
// its tests. The server render passes width 0, which scaleLayout answers with the two end labels and no year
// — the correct answer for a row whose width is not yet known — so the first client render matches the
// server's and the ticks appear on the same frame as hydration.
//
// ONE RIGHT-TO-LEFT GEOMETRY (§2.1). On-the-road is the RIGHT edge, today is the LEFT edge. The bar, the
// 0-km row and the scale row are three rows of ONE column template, so they cannot drift apart.
//
// THE RULE FOR THE SCALE ROW (Run 7c §11.1): PHYSICAL INSETS — `right` and `left` — NEVER `insetInline*`.
// The axis is a right-to-left drawing regardless of writing direction. layout.tsx sets `dir="rtl"` on
// <html>, and under `direction: rtl` the logical insets MEAN THE OPPOSITE of what this row wants:
// `insetInlineEnd` resolves to `left` and `insetInlineStart` to `right`. That is why the scale came out
// mirrored against its own bar on the deployed build — "עלייה לכביש" at the left, "היום" at the right —
// while the bar, a CSS grid whose first column is the right one under RTL, was correct all along.
// The 0-km row is the one place logical properties are right and they stay: its inline start IS the right
// side, which is the side its marker line belongs on.
//
//   private / institutional   a fill from the page colour's ramp, in ownership order (§2.5)
//   dealer                    hollow — white with a 1px dashed border, NO hand number, and (§2.2) NO label
//                             above the axis at all: a dealer is its segment and its legend row, nothing else
//
// The 0-km deal carries its own row above the bar, anchored to its segment's start, and the explanation opens
// from the label: hover or focus on desktop, a tap on the phone — one <details>, which gives both without a
// line of script. That mechanism and its text are Run 6b's and are unchanged.

import { useEffect, useRef, useState } from "react";
import type { AxisSegment, NoHistoryView, OwnershipAxis } from "@/lib/display/texts";
import { legendHead, legendTail, scaleLayout, shadeRamp, ZERO_KM_MARKER } from "@/lib/display/texts";

const DASHED = "#c9c3b9";
const GREY = "#665f58";
const DARK = "#221f1c";

// §2.1 — the scale row's own measurements, off the board.
const SCALE_HEIGHT = 30;
const TICK_COLOR = "#c9c3b9";
const TICK_HEIGHT = 8;
const TICK_WIDTH = 1;

// §3 — the bar, off the board.
const BAR_HEIGHT = 28;
const BAR_RADIUS = 6;
const SEGMENT_GAP = 2;

/** §2.5 — a dealer keeps its hollow treatment; every owner segment takes its ramp fill. */
function segmentStyle(s: AxisSegment, fill: string | null): React.CSSProperties {
  if (s.kind === "dealer") return { background: "#ffffff", border: `1px dashed ${GREY}` };
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

  // §2.5 — one ramp per axis, over the OWNER segments only, taken in ownership order. Dealers are skipped:
  // they are hollow and take no fill, so they also take no place in the ramp.
  const ramp = shadeRamp(color, axis.segments.filter((s) => s.kind !== "dealer").length);
  let owner = 0;
  const fills = axis.segments.map((s) => (s.kind === "dealer" ? null : (ramp[owner++] ?? null)));

  // §2.4 — the bar and the 0-km row are the SAME column template, so the marker cannot drift off its segment.
  const template = axis.segments.map((s) => `${s.share}fr`).join(" ");
  const zeroIndex = axis.segments.findIndex((s) => s.zero_km);

  const labels = scaleLayout(axis, scaleWidth);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#d8d3cb] bg-white p-4 md:px-6 md:py-5">
      {/* ------------------------------------------------------- the 0-km row (§2.4) */}
      {/* ONE element on ONE row, in the leasing segment's own column, anchored to that segment's START (the
          right edge, RTL): a 2px line as the label's inline-start border and the words immediately to its
          LEFT on the same row. The row exists only when there is a 0-km deal — §2.2 removed the only other
          thing that ever sat above the bar. */}
      {zeroIndex !== -1 && (
        <div className="grid" style={{ gridTemplateColumns: template, columnGap: SEGMENT_GAP }}>
          <details
            className="relative min-w-0"
            // Spanning to the end of the row leaves the label the whole card to grow leftward into, and
            // max-width clamps it inside the card's padding if it ever ran out (§2.4). It cannot in
            // practice: ownershipAxis() only ever marks the FIRST segment, which starts at the card's edge.
            style={{ gridColumn: `${zeroIndex + 1} / -1`, justifySelf: "start", maxWidth: "100%" }}
          >
            <summary
              className="cursor-pointer list-none whitespace-nowrap text-[12px] font-bold"
              style={{ color: DARK, borderInlineStart: `2px solid ${DARK}`, paddingInlineStart: 6 }}
            >
              {ZERO_KM_MARKER}
            </summary>
            {zeroKmExplanation !== null && (
              <p className="absolute z-10 mt-1 w-64 rounded-lg border border-[#d8d3cb] bg-white p-3 text-[13px] font-normal shadow-lg" style={{ color: DARK }}>
                {zeroKmExplanation}
              </p>
            )}
          </details>
        </div>
      )}

      {/* ------------------------------------------------------------------ the bar */}
      {/* A grid, not a flex row of percentages: with `fr` the 2px gaps come out of the track sizes instead of
          being added to a width that already totalled 100%, so the bar is exactly as wide as its card and
          every column lines up with the same column in the 0-km row above it. */}
      <div className="grid" style={{ gridTemplateColumns: template, columnGap: SEGMENT_GAP, height: BAR_HEIGHT }}>
        {axis.segments.map((s, i) => (
          <span
            key={i}
            className="block h-full min-w-0"
            style={{
              ...segmentStyle(s, fills[i]),
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

      {/* --------------------------------------------- the legend, one line per ownership (§2.6) */}
      <ul className="flex flex-col gap-1 pt-2">
        {axis.segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-[15px]" style={{ color: s.kind === "dealer" ? GREY : DARK }}>
            {/* §2.5 — the swatch is the segment's own fill, so the legend and the bar can never disagree */}
            <span aria-hidden className="inline-block shrink-0" style={{ width: 14, height: 14, borderRadius: 3, ...segmentStyle(s, fills[i]) }} />
            <span>
              <strong className="font-bold">{legendHead(s)}</strong>
              {legendTail(s)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
