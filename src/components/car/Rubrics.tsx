// The four-rubric strip (BRIEF Run 6b §7.3 point 4, §7.4, §7.5) — ק"מ · יד · צבע · רישיון.
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
    // Run 7 §3 — the desktop strip: a 4-column grid between 1px top/bottom borders with padding `12px 0`,
    // its columns separated by 1px lines and each column padded `0 12px`. The phone strip (2 columns) is
    // untouched by §3 and keeps its own 12px on all four sides, which is why the vertical padding moves from
    // the cells to the strip at `md` and not before.
    <div className="grid grid-cols-2 border-y border-[#d8d3cb] md:grid-cols-4 md:py-3">
      {strip.map((s, i) => (
        // A hairline BETWEEN the cells and never outside the strip. Phone (2 columns): the second cell of
        // each row opens one, and the second row opens a top one. Desktop (4 columns): every cell but the
        // first opens one, and no cell has a top hairline — the strip's own border-y is the frame.
        <div
          key={s.heading}
          className={[
            "flex flex-col gap-1 border-[#d8d3cb] px-3 py-3 md:py-0",
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
          {s.rubric.small !== null && (
            <span
              className="flex items-baseline gap-1 text-[12px]"
              style={{ color: s.rubric.dark ? DARK : GREY, fontWeight: s.rubric.dark ? 700 : 400 }}
            >
              {s.rubric.dark && <InfoMark />}
              <span>{s.rubric.small}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
