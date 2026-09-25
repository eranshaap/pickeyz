// The "מקום N" card (BRIEF Days 20–21, Run 2 §4.1) — the small card of places 4–6.
//
// ONE PLACE IN THE CODE (work.md, "מבנה חוזר = מקום אחד בקוד"): the below-threshold screen draws it today and
// the bottom list of Days 24–25 will draw the same component. The boards draw it identically on the desktop and
// on the phone, so there is no breakpoint here at all.
//
// A RENDERER ONLY. Every value arrives decided by src/lib/search/load.ts (§3.4, one mapping for every drawn
// car) and src/lib/display/edge-screens.ts (§2.4, every word). Nothing here decides what a value means.
//
// THE WHOLE CARD IS THE LINK (findCar-now.md, "לחיצות במסך התוצאות"): one <a> around everything, and no
// "לעמוד הרכב" text anywhere — the card itself is the affordance. `LinkPending` is a CHILD of the anchor, not a
// wrapper around it: the framework's link-status mechanism only works inside a <Link> subtree, which is why the
// anchor carries `position: relative`.
//
// Logical properties throughout — the site is `dir="rtl"` (layout.tsx).

import Link from "next/link";
import CarTitle from "@/components/car/CarTitle";
import Photo from "@/components/car/Photo";
import { ownershipWord } from "@/lib/display/cards";
import { dataLine, placeLabel } from "@/lib/display/edge-screens";
import { shekel } from "@/lib/display/texts";
import { LinkPending } from "@/components/search/PickCards";
import type { ViewPlace } from "@/lib/search/load";

const DARK = "#221f1c";
const GREY = "#665f58";
const CARD_BG = "#ffffff";
const CARD_BORDER = "#d8d3cb";

/** §4.1 — the photo's frame: 96×72, the same box the placeholder fills. */
const PHOTO = "block h-[72px] w-24 shrink-0 rounded-md object-cover";

export default function PlaceCard({ place, questionPublicId }: { place: ViewPlace; questionPublicId: string }) {
  const word = place.ownership_type === null ? null : ownershipWord(place.ownership_type);
  return (
    <Link
      href={`/listing/${place.public_id}?s=${questionPublicId}`}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 10,
        padding: 12,
        textDecoration: "none",
        color: DARK,
      }}
    >
      <LinkPending />

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {/* No photo → the car page's own placeholder box, in the same frame, without the board's caption. */}
        <Photo src={place.image} className={PHOTO} />

        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flexGrow: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: GREY }}>{placeLabel(place.place)}</span>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            {/* §4.1 — no comma: the 0.4em spacer comes from CarTitle itself. */}
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              <CarTitle model={place.model} year={place.year} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{shekel(place.price)}</span>
          </div>

          <span style={{ fontSize: 12, color: GREY }}>{dataLine({ km: place.km, hand: place.hand, word })}</span>
        </div>
      </div>

      {/* Days 22–23 — the justification generator's line. null → NO element and no empty line. */}
      {place.sentence !== null && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4 }}>{place.sentence}</p>}
    </Link>
  );
}
