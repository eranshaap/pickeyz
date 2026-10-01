// The "מפרט ואבזור" section (BRIEF Day 19b Run 18 §6) — A RENDERER ONLY.
//
// Every word it draws arrives in `rows`, already decided and already tested by src/lib/display/spec.ts, and
// the heading comes from texts.ts: there is no Hebrew in this file and nothing here knows what a row means.
// An empty list renders NOTHING AT ALL — no heading, no box — exactly like an empty "למה".
//
// RENDERED ONCE: one tree for both screens, with `md:` modifiers. The page draws the ownership axis twice
// because each copy measures its own card; nothing here measures anything, so there are no phone and desktop
// copies to disagree.

import type { SpecRow } from "@/lib/display/spec";
import { SPEC_HEADING } from "@/lib/display/texts";
import CarSection from "./CarSection";
import ExplainPhrase from "./ExplainPhrase";

// As CarPageView.tsx defines its own near its top — the page's text colour, not an export of another file.
const DARK = "#221f1c";

export default function SpecSection({ rows, color }: { rows: SpecRow[]; color: string }) {
  if (rows.length === 0) return null;

  return (
    <CarSection heading={SPEC_HEADING} color={color}>
      {/* The plan's block: the box — border 1px #d8d3cb, radius 12, padding 4px 16px on the phone and
          6px 24px on the computer; the 1px #eeece8 line between rows and NOT after the last one is
          `divide-y`'s own definition. A row is a column on the phone (label above value, 4px apart, padding
          10px 0) and `160px 1fr` on the computer, which RTL puts the label on the right of (gap 16, padding
          12px 0). Nothing here is coloured but the heading: the page colour reaches this section through
          CarSection and nowhere else. */}
      <div className="divide-y divide-[#eeece8] rounded-xl border border-[#d8d3cb] bg-white px-4 py-1 md:px-6 md:py-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-1 py-2.5 md:grid md:grid-cols-[160px_1fr] md:gap-4 md:py-3">
            <div className="text-[15px] font-bold leading-[1.5]" style={{ color: DARK }}>
              {/* A row that carries an explanation (the fuel row, the safety row) gets the dotted phrase and its window; the phrase
                  inherits this cell's font, size, weight and colour from ExplainPhrase's own button. */}
              {r.explanation === null ? r.label : <ExplainPhrase phrase={r.label}>{r.explanation}</ExplainPhrase>}
            </div>
            <div className="text-[14px] leading-[1.5] tabular-nums md:text-[15px]" style={{ color: DARK }}>
              {r.value}
            </div>
          </div>
        ))}
      </div>
    </CarSection>
  );
}
