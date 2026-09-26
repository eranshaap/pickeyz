// The below-threshold screen and the zero-scored screen (BRIEF Days 20–21, Run 2 §5; Days 24–25, Run 1 §4.2,
// §4.7) — the canonical boards «מסך התוצאות מתחת לסף — בלי הכתרה», «מסך אפס בעלי ציון — גודל מלא» and the first
// two frames of «טלפון — שלושת מסכי הקצה».
//
// ONE COMPONENT FOR BOTH, because the document says the zero-scored screen IS this screen without the scored
// floor. So the below-threshold board's frame governs both (§5.0: the zero-scored board's own 40/48 padding and
// its column gap of 24 lose to the below-threshold board's 36/48/40 and 28), and the two differences are
// exactly the two the document names:
//   places.length === 0    no scored floor at all (the zero-scored screen)
//   group === null         no group object — on the zero-scored screen the HEAD of the screen already says it,
//                          so the rows follow the head directly (§5.1)
//
// WHAT RENDERS (§5.1, as Days 24–25 §4.7 extends it): the two head lines, the scored floor, the no-price group
// object and its rows, and — new — the cancelled group at the very end, when the search has such a car. No count
// line, no cards, no fold cue. THE SCREENS' HEADLINES DO NOT COUNT CANCELLED CARS: "מתחת לסף" counts the cars with
// a price comparison and the eligible ones, "אפס בעלי ציון" counts the no-price cars only (§4.7).
//
// THE CARDS AND THE ROWS ARE THE BOTTOM LIST'S OWN (§4.2): PlaceCardGrid and PlaceCard, CarRows and CarRow, over
// the same `ListRow` view. The grid rule left this file for PlaceCard.tsx, where the card itself lives, and the
// place a card shows is now the DISPLAYED place (§1) — which on these two screens, having no picks above it,
// equals the stored rank this screen has always drawn.
//
// A RENDERER ONLY: the state, the counts, the head, the places, the rows and the group objects all arrive decided
// by src/lib/search/load.ts (§3) over src/lib/display/edge-screens.ts (§2). No Hebrew lives here.

import CarRow, { CarRows } from "@/components/list/CarRow";
import GroupHead from "@/components/list/GroupHead";
import PlaceCard, { PlaceCardGrid } from "@/components/list/PlaceCard";
import type { ResultsView } from "@/lib/search/load";
import { RESULTS_CONTAINER_CLASS } from "@/lib/display/layout";

const GREY = "#665f58";

export default function UncrownedResults({ answer }: { answer: ResultsView }) {
  const { head, places, unscored, cancelled, group } = answer;
  if (head === null) throw new Error(`UncrownedResults: a ${answer.state} search has no head — this screen is not the one to draw it`);
  const cancelledGroup = answer.list.cancelledGroup;

  return (
    // §5.1 / §5.2 — the results screen's container (Days 24–25 §2.2: 1,440 with 48px sides, one class for
    // every state of the screen): `36px 48px 40px` with a column gap of 28 on the desktop, `20px 16px 28px`
    // with a gap of 16 on the phone. Only the width moved — the paddings and the gaps are Run 2's own.
    <div className={`${RESULTS_CONTAINER_CLASS} flex flex-col gap-4 px-4 pt-5 pb-7 md:gap-7 md:pt-9 md:pb-10`}>
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
        <PlaceCardGrid>
          {places.map((row) => (
            <PlaceCard key={row.public_id} row={row} />
          ))}
        </PlaceCardGrid>
      )}

      {/* §5.1 — the unscored group. On the below-threshold screen the group object sits above the rows; on the
          zero-scored screen `group` is null and the rows follow the head directly, as the board draws. */}
      {unscored.length > 0 && (
        <div className="flex flex-col gap-2 md:gap-3">
          {group !== null && <GroupHead title={group.title} line={group.line} />}
          <CarRows>
            {unscored.map((row) => (
              <CarRow key={row.public_id} row={row} />
            ))}
          </CarRows>
        </div>
      )}

      {/* Days 24–25 §4.7 — the cancelled group, last on both screens and placeless, the same object the bottom
          list draws. No such car exists in the data today, so nothing of this is on the live site yet. */}
      {cancelled.length > 0 && cancelledGroup !== null && (
        <div className="flex flex-col gap-2 md:gap-3">
          <GroupHead title={cancelledGroup.title} line={cancelledGroup.line} />
          <CarRows>
            {cancelled.map((row) => (
              <CarRow key={row.public_id} row={row} />
            ))}
          </CarRows>
        </div>
      )}
    </div>
  );
}
