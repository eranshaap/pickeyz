// The "מקום N" card (BRIEF Days 20–21, Run 2 §4.1; Days 24–25, Run 1 §4.2, §4.5, §4.6) — the small card of the
// places under the recommendation cards, and of the below-threshold screen's scored floor.
//
// ONE PLACE IN THE CODE (work.md, "מבנה חוזר = מקום אחד בקוד"): the below-threshold screen and the bottom list of
// the recommendations screen draw THIS component, from THIS grid, over the same row view (`ListRow`). The boards
// draw the card identically on the desktop and on the phone, so there is no breakpoint on the card itself; the
// grid has one, and it lives here too (§4.2).
//
// A RENDERER ONLY. Every value arrives decided by src/lib/search/list.ts over src/lib/search/load.ts (§2) and
// every word by src/lib/display/edge-screens.ts. Nothing here decides what a value means — including the place:
// `row.place` is the DISPLAYED place (§1) and this file never sees a stored rank.
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
import { dataLine, placeLabel } from "@/lib/display/edge-screens";
import { shekel } from "@/lib/display/texts";
import { LinkPending } from "@/components/search/PickCards";
import SentenceLine, { hasSentenceLine } from "./SentenceLine";
import type { ListRow } from "@/lib/search/list";

const DARK = "#221f1c";
const GREY = "#665f58";
const CARD_BG = "#ffffff";
const CARD_BORDER = "#d8d3cb";

/** §4.1 — the photo's frame: 96×72, the same box the placeholder fills. */
const PHOTO = "block h-[72px] w-24 shrink-0 rounded-md object-cover";

/**
 * Run 2b §2.1 — the narrowest width this card is drawn at, and the minimum of the grid track that holds it. It
 * lives here because it is a fact about the card, not about the board.
 *
 * the widest title row in the demo ("IONIQ HYBRID 2021" at 15px/700 beside a five-digit price) plus the photo,
 * the gap and the paddings — Claude's estimate, 26/09; moves by eye if the two-column form still wraps on the
 * live site
 */
export const PLACE_CARD_MIN_WIDTH = 340;

/**
 * Run 2b §2.1, moved here by Days 24–25 §4.2 — THE GRID THE CARDS SIT IN: as many columns as fit at the card's
 * own minimum width, each one sharing the leftover evenly. At the boards' 1184px of content that is three
 * columns; narrower, two; narrower still, one. `auto-fill` and NOT `auto-fit`: a single card takes ONE column of
 * the normal width instead of stretching across the whole row (the one-scored-car edge screen). On the phone the
 * cards stack (`flex-col`).
 *
 * It was UncrownedResults.tsx's own constant and is now an exported component, because the bottom list draws the
 * same three cards in the same grid — one rule, one place, and no visual change on the screen it came from.
 *
 * The minimum is the card's own constant, handed to CSS as a custom property — the convention CarPageView.tsx
 * uses for a number a Tailwind class cannot carry.
 */
const PLACE_GRID: React.CSSProperties & Record<string, string> = {
  "--place-card-min": `${PLACE_CARD_MIN_WIDTH}px`,
  gridTemplateColumns: "repeat(auto-fill, minmax(var(--place-card-min), 1fr))",
};

export function PlaceCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:grid md:gap-5" style={PLACE_GRID}>
      {children}
    </div>
  );
}

export default function PlaceCard({ row }: { row: ListRow }) {
  // A card IS a place. A row with none is a group row and belongs in a table, so this is a bug and not a card
  // without a label.
  if (row.place === null) throw new Error(`PlaceCard: listing ${row.public_id} has no displayed place — a group row is not a card`);
  return (
    <Link
      href={row.href}
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
        <Photo src={row.image} className={PHOTO} />

        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flexGrow: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: GREY }}>{placeLabel(row.place)}</span>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            {/* §4.1 — no comma: the 0.4em spacer comes from CarTitle itself. */}
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              <CarTitle model={row.model} year={row.year} />
            </span>
            {/* Run 2b §2.2 — the price is one word: it never wraps and never gives up width to the title. */}
            <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", flexShrink: 0, whiteSpace: "nowrap" }}>
              {shekel(row.price)}
            </span>
          </div>

          <span style={{ fontSize: 12, color: GREY }}>{dataLine({ km: row.km, hand: row.hand, word: row.ownership_word })}</span>
        </div>
      </div>

      {/* Days 24–25 §4.2 (decision 5) — the generator's row: NOT DRAWN AT ALL while the tag and the sentence are
          both empty, and no height is reserved for it — exactly as the recommendation cards treat their own. */}
      {hasSentenceLine(row) && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4 }}>
          <SentenceLine tag={row.tag} sentence={row.sentence} />
        </p>
      )}
    </Link>
  );
}
