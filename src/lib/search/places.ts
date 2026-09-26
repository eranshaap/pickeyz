// The DISPLAYED PLACE (BRIEF Days 24–25, Run 1 §1) — the one function that turns a search's stored rows into
// the "מקום N" a reader sees, on the bottom list and on the car page alike.
//
// WHY IT EXISTS (§8, decision 1): the database's `rank` is the SCORE ORDER of the whole cut pool, and the
// reader never sees that order — the three recommendation cards took the first places for themselves, so the
// list under them starts at the place after the last card. The rank stays in the database, untouched, and is
// shown nowhere; this module is the only place in the code that turns one into a place (§1.3).
//
// IT READS STORED ROWS ONLY. `cars.cancelled_at` is never read here: a car in final cancellation is recognised
// by the `cancelled` gate record the search itself wrote (§1.1), which is the fact AS IT WAS WHEN THE SEARCH
// RAN, like every other fact on the screen. A cancellation that happened after the run reaches the screen
// through load.ts's update rule — a re-run — and never through a live read behind the stored verdict's back.
//
// PURE: no database, no clock, no filesystem. Tested on literal rows (places.test.ts).

import type { Prisma } from "@/generated/prisma/client";
import type { RuleTrace } from "@/lib/selection";

/**
 * §1.1 — the columns this module needs of a stored `search_results` row, and nothing more. Stated
 * structurally so that both readers pass their own row type: the results screen's `ResultRow` (load.ts) and
 * the car page's one query over the same five columns (§4.8).
 */
export type PlaceRow = {
  listing_id: number;
  rank: number | null;
  recommendation_categories: string[];
  total_score: number | null;
  /** The JSON column as it is stored. A row written by results.ts holds an array of rule records. */
  stage_b_trace: Prisma.JsonValue;
};

/**
 * §1.1 — what a stored row is, for the list and for the place:
 *
 *   hidden      `rank` is null — a merged duplicate or a listing Stage B took out of the results. Not shown,
 *               not counted anywhere.
 *   pick        the row carries a recommendation category, so it is one of the three cards. A double winner
 *               is ONE row and therefore one pick.
 *   cancelled   the `cancelled` gate rule triggered on this row: the car's registration was cancelled for
 *               good. It keeps its row and loses its place — the cancelled group at the end of the list.
 *   ranked      the row has a deal score: it has a place.
 *   no_price    everything else — a car with no price comparison (a thin cell), the no-price group.
 */
export type RowKind = "hidden" | "pick" | "cancelled" | "ranked" | "no_price";

/** The rule whose record says the car is in final cancellation (selection/types.ts, RuleName). */
const CANCELLED_RULE = "cancelled";

/** A stored row's rule records, narrowed. The column is JSON; a row written by results.ts holds an array. */
function traceOf(row: PlaceRow): RuleTrace[] {
  return Array.isArray(row.stage_b_trace) ? (row.stage_b_trace as unknown as RuleTrace[]) : [];
}

/**
 * §1.1 — the five kinds, IN THIS ORDER. The order is the rule and not an implementation detail: a cancelled
 * row that also carries a score (not expected in the data — a cancelled invoice has no score — but the order
 * must hold whatever the rows say) is `cancelled` and not `ranked`.
 */
export function classifyRow(row: PlaceRow): RowKind {
  if (row.rank === null) return "hidden";
  if (row.recommendation_categories.length > 0) return "pick";
  if (traceOf(row).some((t) => t.rule === CANCELLED_RULE && t.triggered)) return "cancelled";
  if (row.total_score !== null) return "ranked";
  return "no_price";
}

/**
 * §1.2 — the displayed place of every non-hidden row of ONE search, by listing.
 *
 *   c                    the number of `pick` rows — the cards the screen shows above the list
 *   the `ranked` rows    in `rank` order: c+1, c+2, … — contiguous, no holes, whatever ranks the picks took
 *   pick / cancelled /   null — no place. The pick shows its label instead; the other two are placeless in the
 *   no_price             list and on their car page.
 *   hidden               absent from the map altogether.
 *
 * With no picks — the two uncrowned screens — `c` is 0 and the place of a scored row equals its stored rank,
 * which is what those screens have always drawn.
 */
export function displayedPlaces(rows: readonly PlaceRow[]): Map<number, number | null> {
  const places = new Map<number, number | null>();
  const ranked: PlaceRow[] = [];
  let cards = 0;

  for (const row of rows) {
    const kind = classifyRow(row);
    if (kind === "hidden") continue;
    if (kind === "ranked") {
      ranked.push(row);
      continue;
    }
    if (kind === "pick") cards += 1;
    places.set(row.listing_id, null);
  }

  ranked.sort((a, b) => (a.rank as number) - (b.rank as number));
  ranked.forEach((row, i) => places.set(row.listing_id, cards + 1 + i));
  return places;
}

/** §1.2 — `c`: how many cards the screen shows above the list. The list's first place is `c + 1`. */
export function cardCount(rows: readonly PlaceRow[]): number {
  return rows.filter((r) => classifyRow(r) === "pick").length;
}
