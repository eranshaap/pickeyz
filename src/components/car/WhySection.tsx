// The "למה" section (BRIEF Run 6b §7.7) — one component for every car page and both screens.
//
// It is a DUMB RENDERER. The heading text and the guard that decides whether the section exists at all are
// pure functions in src/lib/display/texts.ts (whyHeading), tested there; this file only paints them.
//
// AN EMPTY LIST RENDERS NOTHING AT ALL — no heading, no box. In THIS RUN THE LIST IS ALWAYS EMPTY: what
// goes in there belongs entirely to the justification generator (Days 22–23), so the live site looks exactly
// like the boards, without the box, and THERE IS NO SAMPLE TEXT ANYWHERE IN THE APP. A page with no label
// and no place (black page, cancelled, unranked) never renders the section regardless — also whyHeading's
// business, not this file's.

import type { Category } from "@/lib/selection";
import { whyHeading } from "@/lib/display/texts";

export default function WhySection({
  labels,
  rank,
  lines,
  color,
}: {
  labels: Category[];
  rank: number | null;
  /** The justification lines. Empty in this run, always. */
  lines: string[];
  /** The page colour — it paints the heading and nothing else here. */
  color: string;
}) {
  const heading = whyHeading({ labels, rank, lines });
  if (heading === null) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[17px] font-extrabold md:text-[18px]" style={{ color }}>
        {heading}
      </h2>
      <div className="flex flex-col gap-2 rounded-xl border border-[#d8d3cb] bg-white p-4">
        {lines.map((line, i) => (
          <p key={i} className="text-[16px] font-semibold text-[#221f1c]">
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}
