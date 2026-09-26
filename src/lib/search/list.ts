// The bottom list of the recommendations screen (BRIEF Days 24–25, Run 1 §2) — ONE pure assembly, from the
// stored rows of one search to everything the list draws: how many cards, how many cars, the heading, the three
// "מקום N" cards, the table's rows, the rows the closed list holds back, the two groups at the end, and the
// closing row's text.
//
// IT DECIDES NOTHING ABOUT A CAR. Which kind a row is and what place it shows are places.ts's (§1); every value
// a row prints is load.ts's ONE mapping, the very one the three big cards use (§2.2) — this module only puts the
// rows in their lists, in their order, and counts.
//
// THE WHOLE LIST IS IN THE PAGE FROM THE FIRST RENDER (§2.3, decision 7): `restRanked`, the rest of the no-price
// group and the cancelled group are all here, closed or open. The click of §4.4 reveals them; it fetches
// nothing.
//
// PURE and SERIALIZABLE: the object below crosses the server/client boundary as the view's `list` field, so it
// holds plain data only — no functions, no class instances, no Date.

import { cancelledGroupHead, groupHead, type Head } from "@/lib/display/edge-screens";
import { listHeading, moreCarsLink } from "@/lib/display/texts";
import { classifyRow, displayedPlaces, type PlaceRow } from "./places";

// ---------------------------------------------------------------------------
// §2.1 — the three counts of the list's shape (findCar-now.md)
// ---------------------------------------------------------------------------

/** The "מקום N" cards under the three recommendation cards — places c+1 … c+3. */
export const LIST_CARDS = 3;
/** The table rows shown while the list is closed — under three cards, places 7–13. */
export const LIST_ROWS = 7;
/** The rows of the no-price group shown while the list is closed; its heading counts the whole group (§4.1). */
export const NO_PRICE_DEFAULT = 2;

// ---------------------------------------------------------------------------
// §2.1 — one row of the list
// ---------------------------------------------------------------------------

/**
 * One drawn row of the list — a "מקום N" card, a table row or a group row, all three from this one view.
 *
 * Every value is the CAR PAGE's, through the same functions the three big cards go through (load.ts §3.4): the
 * ad's km, the ad's hand or the registry's when the ad declares none, the ownership word the page's legend
 * marks `הבעלות הנוכחית`. A missing value draws the page's "—", as the cards do.
 */
export type ListRow = {
  /** §1.2 — the DISPLAYED place, never the stored rank; null on a group row, which has no place. */
  place: number | null;
  public_id: string;
  /** The car page's address, carrying the question: `/listing/{public_id}?s={the question's public_id}`. */
  href: string;
  /** Exactly the string CarTitle receives on this listing's page: `models.model`. */
  model: string;
  year: number | null;
  price: number;
  km: number | null;
  hand: number | null;
  /** The WORD, not the code — ownershipWord() over the current ownership. null → the page's "—". */
  ownership_word: string | null;
  /** The page's photo source. null → the page's placeholder. */
  image: string | null;
  /** §3 — the generator's field. "" until the justification generator fills it; nothing else fills it. */
  sentence: string;
  /** §3 — the generator's field: the recognition tag, drawn before the sentence. "" until the generator. */
  tag: string;
};

/** What load.ts's one load supplies per row; the place is this module's. */
export type ListRowData = Omit<ListRow, "place">;

/** §2.1 — the heading's two numbers and its text (§5.2). */
export type ListHeading = { firstPlace: number; more: number; text: string };

export type ListView = {
  /** `c` — the cards the screen shows above the list (§1.2). */
  cardCount: number;
  /** `x` — every car the screen shows: the cards plus the ranked, the no-price and the cancelled rows. */
  x: number;
  heading: ListHeading;
  /** The first LIST_CARDS ranked rows, by place. */
  cards: ListRow[];
  /** The next LIST_ROWS ranked rows — the table while the list is closed. */
  table: ListRow[];
  /** The ranked rows after those — born where the closing row stood, on the one click (§4.4). */
  restRanked: ListRow[];
  /** The cars with no price comparison, in the tail's stored order. */
  noPrice: ListRow[];
  /**
   * §4.1 — the group object above `noPrice`: bold heading + grey line, the heading counting the WHOLE group
   * even while the closed list shows only the first NO_PRICE_DEFAULT rows (decision 4). null when there are
   * none — a group object is never drawn empty.
   */
  noPriceGroup: Head | null;
  /** The cars in final cancellation, in the tail's stored order — the last group of the open list. */
  cancelled: ListRow[];
  /** §5.1 — the group object above `cancelled`; null when there are none. */
  cancelledGroup: Head | null;
  /** How many rows the CLOSED list is holding back. 0 → no closing row. */
  hiddenCount: number;
  /** The closing row's text (§5.3), or null when the closed list holds nothing back. */
  moreLink: string | null;
};

/**
 * §2.1 — the whole list, from one search's stored rows.
 *
 * @param rows    the search's stored rows, in their stored order (`rank` asc, then `listing_id`) — which is the
 *                order the two groups at the end are drawn in
 * @param dataOf  the per-row values, by listing: load.ts's one load, over every non-hidden row (§2.2)
 */
export function assembleList(rows: readonly PlaceRow[], dataOf: (listing_id: number) => ListRowData): ListView {
  const places = displayedPlaces(rows);
  const ranked: ListRow[] = [];
  const noPrice: ListRow[] = [];
  const cancelled: ListRow[] = [];
  let cardCount = 0;
  let x = 0;

  for (const row of rows) {
    const kind = classifyRow(row);
    if (kind === "hidden") continue; // not shown, not counted anywhere (§1.1)
    x += 1;
    if (kind === "pick") {
      cardCount += 1; // a pick is on a card above the list and has no row in it
      continue;
    }
    const listRow: ListRow = { place: places.get(row.listing_id) ?? null, ...dataOf(row.listing_id) };
    if (kind === "ranked") ranked.push(listRow);
    else if (kind === "no_price") noPrice.push(listRow);
    else cancelled.push(listRow);
  }

  // The places are contiguous from c+1 (§1.2), so sorting by them is sorting by rank — and it is the PLACE the
  // list is ordered by, because the place is what the reader sees.
  ranked.sort((a, b) => (a.place as number) - (b.place as number));

  const cards = ranked.slice(0, LIST_CARDS);
  const table = ranked.slice(LIST_CARDS, LIST_CARDS + LIST_ROWS);
  const restRanked = ranked.slice(LIST_CARDS + LIST_ROWS);

  const hiddenCount = restRanked.length + Math.max(0, noPrice.length - NO_PRICE_DEFAULT) + cancelled.length;
  const more = x - cardCount;

  return {
    cardCount,
    x,
    heading: { firstPlace: cardCount + 1, more, text: listHeading(cardCount + 1, more) },
    cards,
    table,
    restRanked,
    noPrice,
    noPriceGroup: noPrice.length === 0 ? null : groupHead(noPrice.length),
    cancelled,
    cancelledGroup: cancelled.length === 0 ? null : cancelledGroupHead(cancelled.length),
    hiddenCount,
    moreLink: hiddenCount > 0 ? moreCarsLink(hiddenCount) : null,
  };
}
