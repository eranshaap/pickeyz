// The below-threshold screen and the zero-scored screen (BRIEF Days 20–21, Run 2 §5) — the canonical boards
// «מסך התוצאות מתחת לסף — בלי הכתרה», «מסך אפס בעלי ציון — גודל מלא» and the first two frames of
// «טלפון — שלושת מסכי הקצה».
//
// ONE COMPONENT FOR BOTH, because the document says the zero-scored screen IS this screen without the scored
// floor. So the below-threshold board's frame governs both (§5.0: the zero-scored board's own 40/48 padding and
// its column gap of 24 lose to the below-threshold board's 36/48/40 and 28), and the two differences are
// exactly the two the document names:
//   places.length === 0    no scored floor at all (the zero-scored screen)
//   group === null         no group object — on the zero-scored screen the HEAD of the screen already says it,
//                          so the rows follow the head directly (§5.1)
//
// WHAT RENDERS, AND NOTHING ELSE (§5.1): the two head lines, the scored floor, the group object, the rows. No
// count line, no cards, no fold cue, nothing under the rows — the bottom list is Days 24–25.
//
// A RENDERER ONLY: the state, the counts, the head, the places, the rows and the group object all arrive
// decided by src/lib/search/load.ts (§3) over src/lib/display/edge-screens.ts (§2). No Hebrew lives here.

import CarRow, { CarRows } from "@/components/list/CarRow";
import GroupHead from "@/components/list/GroupHead";
import PlaceCard, { PLACE_CARD_MIN_WIDTH } from "@/components/list/PlaceCard";
import type { ResultsView } from "@/lib/search/load";

const GREY = "#665f58";

/**
 * Run 2b §2.1 — the scored floor's desktop track: as many columns as fit at the card's own minimum width, each
 * one sharing the leftover evenly. At the board's 1184px of content that is three columns, exactly as before;
 * narrower, two; narrower still, one. `auto-fill` and NOT `auto-fit`: a single card takes ONE column of the
 * normal width instead of stretching across the whole row (the one-scored-car edge screen).
 *
 * The minimum is PlaceCard's own constant, handed to CSS as a custom property — the convention CarPageView.tsx
 * uses for a number a Tailwind class cannot carry.
 */
const PLACE_GRID: React.CSSProperties & Record<string, string> = {
  "--place-card-min": `${PLACE_CARD_MIN_WIDTH}px`,
  gridTemplateColumns: "repeat(auto-fill, minmax(var(--place-card-min), 1fr))",
};

export default function UncrownedResults({ answer }: { answer: ResultsView }) {
  const { head, places, unscored, group } = answer;
  if (head === null) throw new Error(`UncrownedResults: a ${answer.state} search has no head — this screen is not the one to draw it`);

  return (
    // §5.1 / §5.2 — the site's 1280 container: `36px 48px 40px` with a column gap of 28 on the desktop,
    // `20px 16px 28px` with a gap of 16 on the phone.
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 pt-5 pb-7 md:gap-7 md:px-12 md:pt-9 md:pb-10">
      {/* the head — the same gap of 8 on both, the sizes stepping down on the phone */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="text-[22px] leading-[1.3] md:text-[28px] md:leading-[1.25]" style={{ margin: 0, fontWeight: 800 }}>
          {head.title}
        </h1>
        <p className="text-[14px] md:text-[15px]" style={{ margin: 0, lineHeight: 1.5, color: GREY }}>
          {head.line}
        </p>
      </div>

      {/* §5.1 — the scored floor: as many columns as fit on the desktop (§2.1 — three at the board's width),
          stacked full width on the phone. No crowns, no colours, no category labels. Never present on the
          zero-scored screen, which has no scored car. */}
      {places.length > 0 && (
        <div className="flex flex-col gap-3 md:grid md:gap-5" style={PLACE_GRID}>
          {places.map((place) => (
            <PlaceCard key={place.public_id} place={place} questionPublicId={answer.public_id} />
          ))}
        </div>
      )}

      {/* §5.1 — the unscored group. On the below-threshold screen the group object sits above the rows; on the
          zero-scored screen `group` is null and the rows follow the head directly, as the board draws. */}
      {unscored.length > 0 && (
        <div className="flex flex-col gap-2 md:gap-3">
          {group !== null && <GroupHead title={group.title} line={group.line} />}
          <CarRows>
            {unscored.map((car) => (
              <CarRow key={car.public_id} car={car} place={null} questionPublicId={answer.public_id} />
            ))}
          </CarRows>
        </div>
      )}
    </div>
  );
}
