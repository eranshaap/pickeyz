// The ownership axis (BRIEF Run 6b §7.6) — "היסטוריית בעלויות".
//
// A DUMB RENDERER: the segments, their widths, the hand numbers, the year ticks, the legend lines, the
// zero-km marker and the no-history wording are all decided by the pure functions of
// src/lib/display/texts.ts (ownershipAxis, legendHead/legendTail, zeroKmExplanation, noHistoryView) and
// tested there. Nothing here computes a duration or reads an invoice.
//
// A horizontal RTL bar, 28px tall, one segment per ownership row, widths proportional to duration:
//   private         a full page-colour fill
//   institutional   the page colour at 40% opacity (leasing / rental / company / government / military)
//   dealer          hollow — white with a 1px dashed border, NO hand number, and a small grey "סוחר" label
//                   with a tick above its segment
// The 0-km deal carries its own label above the leasing segment, and the explanation opens from the label:
// hover or focus on desktop, a tap on the phone — one <details>, which gives both without a line of script.
//
// The scale: desktop a tick per calendar year, phone ONLY THE TWO ENDS.

import type { AxisSegment, NoHistoryView, OwnershipAxis } from "@/lib/display/texts";
import { legendHead, legendTail, ZERO_KM_MARKER } from "@/lib/display/texts";

const HAIRLINE = "#d8d3cb";
const DASHED = "#c9c3b9";
const GREY = "#665f58";
const DARK = "#221f1c";
const DEALER_WORD = "סוחר";

const BAR_HEIGHT = 28;

function segmentStyle(s: AxisSegment, color: string): React.CSSProperties {
  if (s.kind === "dealer") return { background: "#ffffff", border: `1px dashed ${GREY}` };
  return { background: color, opacity: s.kind === "institutional" ? 0.4 : 1 };
}

export default function OwnershipTimeline({
  axis,
  noHistory,
  color,
  zeroKmExplanation,
  phone = false,
}: {
  /** The axis as data; null when the car has no registry history and `noHistory` carries the reason instead. */
  axis: OwnershipAxis | null;
  noHistory: NoHistoryView | null;
  color: string;
  /** The zero-km explanation, when the invoice says there is a zero-km deal. */
  zeroKmExplanation: string | null;
  /** The phone shows only the two ends of the scale — no year ticks. */
  phone?: boolean;
}) {
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
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#d8d3cb] bg-white p-4">
      {/* the labels that sit ABOVE the bar: the dealer tick and the 0-km deal */}
      <div className="relative" style={{ height: 22 }}>
        {axis.segments.map((s, i) => {
          const start = axis.segments.slice(0, i).reduce((a, x) => a + x.share, 0);
          const mid = `${(start + s.share / 2) * 100}%`;
          if (s.zero_km) {
            return (
              <details key={`z${i}`} className="absolute bottom-0 -translate-x-1/2" style={{ insetInlineEnd: mid }}>
                <summary className="cursor-pointer list-none whitespace-nowrap text-[12px] font-bold" style={{ color: DARK }}>
                  {ZERO_KM_MARKER}
                  <span aria-hidden className="mx-auto block h-[6px] w-[2px]" style={{ background: DARK }} />
                </summary>
                {zeroKmExplanation !== null && (
                  <p className="absolute z-10 mt-1 w-64 rounded-lg border border-[#d8d3cb] bg-white p-3 text-[13px] font-normal shadow-lg" style={{ color: DARK }}>
                    {zeroKmExplanation}
                  </p>
                )}
              </details>
            );
          }
          if (s.kind === "dealer") {
            return (
              <span key={`d${i}`} className="absolute bottom-0 -translate-x-1/2 text-center" style={{ insetInlineEnd: mid }}>
                <span className="block whitespace-nowrap text-[11px]" style={{ color: GREY }}>
                  {DEALER_WORD}
                </span>
                <span aria-hidden className="mx-auto block h-[5px] w-[2px]" style={{ background: GREY }} />
              </span>
            );
          }
          return null;
        })}
      </div>

      {/* the bar */}
      <div className="flex gap-[2px]" style={{ height: BAR_HEIGHT }}>
        {axis.segments.map((s, i) => (
          <span
            key={i}
            className="block"
            style={{
              width: `${s.share * 100}%`,
              ...segmentStyle(s, color),
              // RTL: the oldest segment is at the start (right), so the outer ends are the first and the last
              borderStartStartRadius: i === 0 ? 6 : 0,
              borderEndStartRadius: i === 0 ? 6 : 0,
              borderStartEndRadius: i === axis.segments.length - 1 ? 6 : 0,
              borderEndEndRadius: i === axis.segments.length - 1 ? 6 : 0,
            }}
          />
        ))}
      </div>

      {/* the scale */}
      <div className="relative text-[12px]" style={{ color: GREY, height: 18 }}>
        <span className="absolute" style={{ insetInlineStart: 0 }}>
          {axis.end_label}
        </span>
        <span className="absolute" style={{ insetInlineEnd: 0 }}>
          {axis.start_label}
        </span>
        {!phone &&
          axis.ticks.map((t) => (
            <span key={t.year} className="absolute -translate-x-1/2" style={{ insetInlineEnd: `${t.share_from_start * 100}%` }}>
              <span aria-hidden className="mx-auto block h-[4px] w-px" style={{ background: HAIRLINE }} />
              {t.year}
            </span>
          ))}
      </div>

      {/* the legend, one line per ownership */}
      <ul className="flex flex-col gap-1 pt-2">
        {axis.segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-[15px]" style={{ color: s.kind === "dealer" ? GREY : DARK }}>
            <span aria-hidden className="inline-block shrink-0" style={{ width: 14, height: 14, borderRadius: 3, ...segmentStyle(s, color) }} />
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
