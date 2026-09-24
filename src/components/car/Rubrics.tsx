// The four-rubric strip (BRIEF Run 6b §7.3 point 4, §7.4, §7.5; Run 9 §6) — ק"מ · יד · צבע · רישיון.
//
// A DUMB RENDERER. Every decision — the big value, the small line, and whether that line is dark — is made
// by the pure functions of src/lib/display/rubrics.ts and tested there. This file receives them already
// decided and paints them: desktop a 4-column grid between top and bottom hairlines with a hairline between
// columns, phone the same four TWO BY TWO.
//
// The small line is grey by default and DARK (with the small circled-i mark) exactly when the Ministry says
// something the ad does not. No red anywhere, no "what to check", no explanation of a gap (§7.5).
//
// Run 7 §6 — "only when there is something to say": `rubric.small === null` means the line is NOT RENDERED.
// Not an empty span, not a non-breaking space, nothing — the cell simply ends after its big value. The
// agreement captions ("{N} בעלויות", "צבע", "רישיון בתוקף עד") were exactly that and are gone from
// rubrics.ts; this file needed only to stop drawing a row that is not there.
//
// RUN 9 §6 — THE VALUES DO NOT REPEAT THEIR HEADERS (that is rubrics.ts's doing: "81,000" and "3", not
// "81,000 ק״מ" and "יד 3"), and THE ק"מ CELL'S SMALL LINE IS DIFFERENT FROM THE OTHER THREE: it is always
// there, it is the test line ("בטסט לפני {משך}: {קריאה}"), and §6.3 gives it its own size and colour — 14px
// dark, line-height 1.4, 2px above it, tabular figures — because it is a reading to be read, not a caption.
// Its dark form (a counted km contradiction) keeps today's rule: the same circled-i mark and the same
// weight the other three carry. The other three small lines are untouched, at 12px.

import type { RubricStrip } from "@/lib/display/rubrics";

const GREY = "#665f58";
const DARK = "#221f1c";

/** The circled-i that marks a dark line. Decorative: the darkness itself is the signal. */
function InfoMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="inline-block h-[12px] w-[12px] shrink-0 align-[-1px]" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function Rubrics({ strip }: { strip: RubricStrip }) {
  return (
    // Run 9 §6.1 — the desktop strip: a 4-column grid between 1px top/bottom borders with padding `8px 0`
    // (it was 12px), its columns separated by 1px lines. The phone strip (2 columns) keeps its own padding
    // on all four sides, which is why the vertical padding moves from the cells to the strip at `md` and not
    // before, and why `md:py-2` is the only thing §6.1 changes here.
    <div className="grid grid-cols-2 border-y border-[#d8d3cb] md:grid-cols-4 md:py-2">
      {strip.map((s, i) => {
        // The board order is fixed by rubricStrip(): ק"מ first. §6.3's own size and colour are that cell's.
        const isKm = i === 0;
        return (
          // A hairline BETWEEN the cells and never outside the strip. Phone (2 columns): the second cell of
          // each row opens one, and the second row opens a top one. Desktop (4 columns): every cell but the
          // first opens one, and no cell has a top hairline — the strip's own border-y is the frame.
          // §6.1 — on the desktop the FIRST cell is padded `0 4px` and the others `0 12px`.
          <div
            key={s.heading}
            className={[
              "flex flex-col gap-[2px] border-[#d8d3cb] px-3 py-3 md:py-0",
              i === 0 ? "md:px-1" : "",
              i % 2 === 1 ? "border-s" : "",
              i > 0 ? "md:border-s" : "",
              i >= 2 ? "border-t md:border-t-0" : "",
            ].join(" ")}
          >
            <span className="text-[12px]" style={{ color: GREY }}>
              {s.heading}
            </span>
            <span className="text-[16px] font-semibold tabular-nums" style={{ color: DARK }}>
              {s.rubric.big}
            </span>
            {s.rubric.small !== null &&
              (isKm ? (
                // §6.3 — the test line: 14px dark, line-height 1.4, 2px above it, tabular figures. The mark
                // and the weight of a dark line are today's rule, unchanged.
                <span
                  className="flex items-baseline gap-1 text-[14px] tabular-nums"
                  style={{ color: DARK, lineHeight: 1.4, paddingTop: 2, fontWeight: s.rubric.dark ? 700 : 400 }}
                >
                  {s.rubric.dark && <InfoMark />}
                  <span>{s.rubric.small}</span>
                </span>
              ) : (
                <span
                  className="flex items-baseline gap-1 text-[12px]"
                  style={{ color: s.rubric.dark ? DARK : GREY, fontWeight: s.rubric.dark ? 700 : 400 }}
                >
                  {s.rubric.dark && <InfoMark />}
                  <span>{s.rubric.small}</span>
                </span>
              ))}
          </div>
        );
      })}
    </div>
  );
}
