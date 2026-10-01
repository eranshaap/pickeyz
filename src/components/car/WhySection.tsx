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
import CarSection from "./CarSection";

export default function WhySection({
  labels,
  place,
  lines,
  color,
}: {
  labels: Category[];
  /**
   * Days 24–25 Run 1 §4.8 — the DISPLAYED place (src/lib/search/places.ts), the same number the list and the
   * page's own verdict line show. It was the stored rank until this run.
   */
  place: number | null;
  /** The justification lines. Empty in this run, always. */
  lines: string[];
  /** The page colour — it paints the heading and nothing else here. */
  color: string;
}) {
  // `rank` is the name whyHeading()'s input has carried since Run 6b (src/lib/display/texts.ts) and this run
  // does not rename it — what changed is the number handed to it, not the text it returns.
  const heading = whyHeading({ labels, rank: place, lines });
  if (heading === null) return null;

  return (
    // Day 19b Run 18 §5.2 — the frame and the heading are CarSection's now; this section's own white box,
    // which has a padding of its own, is unchanged and is simply the children.
    <CarSection heading={heading} color={color}>
      <div className="flex flex-col gap-2 rounded-xl border border-[#d8d3cb] bg-white p-4">
        {lines.map((line, i) => (
          <p key={i} className="text-[16px] font-semibold text-[#221f1c]">
            {line}
          </p>
        ))}
      </div>
    </CarSection>
  );
}
