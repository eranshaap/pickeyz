"use client";

// The bottom list of the recommendations screen (BRIEF Days 24–25, Run 1 §4.1, §4.4) — everything below the
// three cards: the heading, the three "מקום N" cards, the table, the closing row that opens the rest, and the two
// groups at the end.
//
// A CLIENT COMPONENT FOR ONE REASON: it holds open/closed. Nothing else about the list is dynamic — the WHOLE
// list is in the page from the first render (§2.3, decision 7), so the click of §4.4 reveals what is already
// here: no URL change, no server call, no "הצג פחות". The state lives in this component and dies with the page;
// a new question is a new page.
//
// A RENDERER ONLY, and it builds nothing of its own: the rows, their places, the counts, the heading, the two
// group objects and the closing row's text all arrive decided in `ListView` (src/lib/search/list.ts), and every
// structure it draws is the one the rest of the site draws — PlaceCardGrid and PlaceCard, CarRows and CarRow,
// GroupHead. Nothing is rebuilt per screen (work.md, "מבנה חוזר = מקום אחד בקוד").
//
// THE ORDER, CLOSED (§4.1): the heading · the three cards · the table (with its header row) · the closing row ·
// the no-price group, its heading counting the WHOLE group while two rows show (decision 4).
// OPEN: the same, with the rest of the ranked rows continuing INSIDE THE SAME BOX where the closing row stood —
// row 14 exactly where the link was, so the page does not jump — the closing row gone, the no-price group
// complete, and the cancelled group last.
//
// THE LIST IS NEVER A SCROLL CONTAINER: the page is the only scroller (the desktop box's own sideways scroll at
// narrow widths is CarRows' and predates this run).

import { useState } from "react";
import CarRow, { CarRows, MoreRow } from "./CarRow";
import GroupHead from "./GroupHead";
import PlaceCard, { PlaceCardGrid } from "./PlaceCard";
import { hasSentenceLine } from "./SentenceLine";
import type { ListView } from "@/lib/search/list";
import { NO_PRICE_DEFAULT } from "@/lib/search/list";

const DARK = "#221f1c";

export default function ResultsList({ list }: { list: ListView }) {
  const [open, setOpen] = useState(false);

  const ranked = open ? [...list.table, ...list.restRanked] : list.table;
  const noPrice = open ? list.noPrice : list.noPrice.slice(0, NO_PRICE_DEFAULT);
  const cancelled = open ? list.cancelled : [];

  return (
    // §4.1 — the stack's one gap is 16, which is the distance the brief pins between the heading and the first
    // card; the 4px on top is what turns the results region's own 20px flex gap into the 24 below the cards.
    // Claude's estimates, 26/09 — move by eye on the live site.
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: DARK }}>{list.heading.text}</h2>

      {list.cards.length > 0 && (
        <PlaceCardGrid>
          {list.cards.map((row) => (
            <PlaceCard key={row.public_id} row={row} />
          ))}
        </PlaceCardGrid>
      )}

      {/* §4.3 — the ranked table, the one table on the site that carries a header row. §4.4 — while the list is
          closed and something is held back, the closing row is its last row; on the click the rows continue in
          this very box, where it stood. */}
      {(ranked.length > 0 || list.moreLink !== null) && (
        <CarRows header sentenceLabel={ranked.some(hasSentenceLine)}>
          {ranked.map((row) => (
            <CarRow key={row.public_id} row={row} />
          ))}
          {!open && list.moreLink !== null && <MoreRow text={list.moreLink} onOpen={() => setOpen(true)} />}
        </CarRows>
      )}

      {/* §4.1 — the no-price group. Its heading counts the whole group even while only the first rows show. */}
      {noPrice.length > 0 && list.noPriceGroup !== null && (
        <div className="flex flex-col gap-2 md:gap-3">
          <GroupHead title={list.noPriceGroup.title} line={list.noPriceGroup.line} />
          <CarRows>
            {noPrice.map((row) => (
              <CarRow key={row.public_id} row={row} />
            ))}
          </CarRows>
        </div>
      )}

      {/* §4.1 / §5.1 — the cancelled group, last, and only once the list is open. */}
      {cancelled.length > 0 && list.cancelledGroup !== null && (
        <div className="flex flex-col gap-2 md:gap-3">
          <GroupHead title={list.cancelledGroup.title} line={list.cancelledGroup.line} />
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
