// BRIEF Days 24–25, Run 1 §6.2 (Run 3b §1.5) — THE LIST'S ONE ASSEMBLY, on the same stored-row fixtures §6.1
// uses. No database: list.ts is pure, and the per-row values arrive through the `dataOf` seam that load.ts fills.
//
// Every expectation is the brief's own number, written out: the places on the three cards, the seven table rows,
// the rows each closed box holds back, the two groups, and — Run 3b §1 — the hidden count and the closing-row
// text OF EACH BOX, the cancelled rows counted by neither.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assembleList, LIST_CARDS, LIST_ROWS, NO_PRICE_DEFAULT, type ListRowData } from "./list";
import type { PlaceRow } from "./places";
import { cancelledGroupHead, groupHead } from "@/lib/display/edge-screens";
import { listHeading, moreCarsLink } from "@/lib/display/texts";
import { RULE_TYPE, type RuleTrace } from "@/lib/selection";
import type { Prisma } from "@/generated/prisma/client";

/** A rule record as the JSON column holds it (the shape gate.ts writes — §0.3c). */
function trace(over: Partial<RuleTrace> & Pick<RuleTrace, "rule">): Prisma.JsonValue {
  const record: RuleTrace = { type: RULE_TYPE[over.rule], value: null, threshold: null, triggered: true, effect: "none", context: {}, ...over };
  return record as unknown as Prisma.JsonValue;
}

const cancelledRecord = (): Prisma.JsonValue => trace({ rule: "cancelled", value: "2026-09-10", effect: "ineligible", context: { evaluated: true } });

const idAt = (rank: number): number => rank * 10;
const pidOf = (listing_id: number): string => `p${String(listing_id).padStart(9, "0")}`;

/**
 * The per-row values, standing in for load.ts's one load: what a row prints is not this module's business, so
 * the stub is the same for every row but its identity.
 */
const dataOf = (listing_id: number): ListRowData => ({
  public_id: pidOf(listing_id),
  href: `/listing/${pidOf(listing_id)}?s=q1q2q3q4q5`,
  model: "מאזדה 3",
  year: 2022,
  price: 100000,
  km: 34000,
  hand: 2,
  ownership_word: "פרטית",
  image: null,
  sentence: "",
  tag: "",
});

/** §6.1's fixture: 25 rows at ranks 1–25, rows 1–20 scored, 21–24 unscored, 25 unscored and cancelled. */
function fixture(picks: Readonly<Record<number, string[]>>): PlaceRow[] {
  const rows: PlaceRow[] = [];
  for (let rank = 1; rank <= 25; rank += 1) {
    rows.push({
      listing_id: idAt(rank),
      rank,
      recommendation_categories: picks[rank] ?? [],
      total_score: rank <= 20 ? 100 - rank : null,
      stage_b_trace: rank === 25 ? [cancelledRecord()] : [],
    });
  }
  return rows;
}

const A = fixture({ 1: ["best_value"], 5: ["peace_of_mind"], 12: ["cheapest"] });
const B = fixture({ 1: ["best_value", "cheapest"], 5: ["peace_of_mind"] });
const B2 = fixture({ 1: ["best_value", "peace_of_mind", "cheapest"] });

const placesOf = (rows: { place: number | null }[]): (number | null)[] => rows.map((r) => r.place);

describe("§6.2 — assembleList() over fixture A: three cards, 17 ranked, 4 no-price, 1 cancelled", () => {
  const list = assembleList(A, dataOf);

  it("the constants are the list's shape (§2.1)", () => {
    assert.equal(LIST_CARDS, 3);
    assert.equal(LIST_ROWS, 7);
    assert.equal(NO_PRICE_DEFAULT, 2);
  });

  it("cardCount = 3 and x = 25 — every non-hidden row", () => {
    assert.equal(list.cardCount, 3);
    assert.equal(list.x, 25);
  });

  it("the heading: from place 4, over 22 more cars", () => {
    assert.deepEqual(list.heading, { firstPlace: 4, more: 22, text: listHeading(4, 22) });
    assert.equal(list.heading.text, "מקום 4 והלאה — עוד 22 רכבים שנבדקו");
  });

  it("the cards are places 4, 5, 6", () => {
    assert.deepEqual(placesOf(list.cards), [4, 5, 6]);
  });

  it("the table is places 7–13, and the rest is 14–20", () => {
    assert.deepEqual(placesOf(list.table), [7, 8, 9, 10, 11, 12, 13]);
    assert.deepEqual(placesOf(list.restRanked), [14, 15, 16, 17, 18, 19, 20]);
    assert.equal(list.restRanked.length, 7);
  });

  it("the no-price group: 4 rows in stored order, placeless, under a heading that counts all four", () => {
    assert.deepEqual(
      list.noPrice.map((r) => r.public_id),
      [21, 22, 23, 24].map((rank) => pidOf(idAt(rank))),
    );
    assert.deepEqual(placesOf(list.noPrice), [null, null, null, null]);
    assert.deepEqual(list.noPriceGroup, groupHead(4));
  });

  it("the cancelled group: the one cancelled row, placeless, under its own heading", () => {
    assert.deepEqual(
      list.cancelled.map((r) => [r.public_id, r.place]),
      [[pidOf(idAt(25)), null]],
    );
    assert.deepEqual(list.cancelledGroup, cancelledGroupHead(1));
  });

  it("Run 3b §1.1 — a count and a link PER BOX: the table 7, the group 4 − 2 = 2, the 1 cancelled in neither", () => {
    assert.equal(list.tableHidden, 7);
    assert.equal(list.tableMoreLink, moreCarsLink(7));
    assert.equal(list.tableMoreLink, "הצג את 7 הרכבים הנוספים");
    assert.equal(list.noPriceHidden, 2);
    assert.equal(list.noPriceMoreLink, moreCarsLink(2));
    assert.equal(list.noPriceMoreLink, "הצג את 2 הרכבים הנוספים");
    // §1.4 — the cancelled row is in neither count, and the sum of the two is the old single link's 10 less it.
    assert.equal(list.cancelled.length, 1);
    assert.equal(list.tableHidden + list.noPriceHidden, 9);
  });

  it("a row carries the ListRow view, with the generator's two fields empty (§3)", () => {
    const row = list.cards[0];
    assert.equal(row.sentence, "");
    assert.equal(row.tag, "");
    assert.equal(row.href, `/listing/${row.public_id}?s=q1q2q3q4q5`);
  });
});

describe("§6.2 — fixture B: two cards, so the list starts at place 3", () => {
  const list = assembleList(B, dataOf);

  it("x is unchanged at 25 and the heading starts one place earlier", () => {
    assert.equal(list.x, 25);
    assert.equal(list.cardCount, 2);
    assert.equal(list.heading.text, "מקום 3 והלאה — עוד 23 רכבים שנבדקו");
  });

  it("the cards are places 3, 4, 5", () => {
    assert.deepEqual(placesOf(list.cards), [3, 4, 5]);
  });
});

describe("§6.2 — fixture B2: one card, so the list starts at place 2", () => {
  it("the heading", () => {
    assert.equal(assembleList(B2, dataOf).heading.text, "מקום 2 והלאה — עוד 24 רכבים שנבדקו");
  });
});

// ---------------------------------------------------------------------------
// §6.2 — the three small fixtures: what the closed list holds back, at the three interesting counts
// ---------------------------------------------------------------------------

/**
 * Three picks at ranks 1–3, then `ranked` scored rows, then `noPrice` unscored ones, then `cancelled` unscored
 * rows carrying the cancellation record (Run 3b §1.5 — the cancelled group needs a fixture of its own).
 */
function small(ranked: number, noPrice: number, cancelled = 0): PlaceRow[] {
  const rows: PlaceRow[] = [];
  let rank = 0;
  for (let i = 0; i < 3; i += 1) {
    rank += 1;
    rows.push({ listing_id: idAt(rank), rank, recommendation_categories: [["best_value"], ["peace_of_mind"], ["cheapest"]][i], total_score: 100 - rank, stage_b_trace: [] });
  }
  for (let i = 0; i < ranked; i += 1) {
    rank += 1;
    rows.push({ listing_id: idAt(rank), rank, recommendation_categories: [], total_score: 100 - rank, stage_b_trace: [] });
  }
  for (let i = 0; i < noPrice; i += 1) {
    rank += 1;
    rows.push({ listing_id: idAt(rank), rank, recommendation_categories: [], total_score: null, stage_b_trace: [] });
  }
  for (let i = 0; i < cancelled; i += 1) {
    rank += 1;
    rows.push({ listing_id: idAt(rank), rank, recommendation_categories: [], total_score: null, stage_b_trace: [cancelledRecord()] });
  }
  return rows;
}

describe("§6.2 / Run 3b §1.5 — the closing row of each box", () => {
  it("13 ranked + 3 no-price: the table holds 3, the group holds 1 — each link over its OWN count", () => {
    const list = assembleList(small(13, 3), dataOf);
    assert.equal(list.restRanked.length, 3);
    assert.equal(list.tableHidden, 3);
    assert.equal(list.tableMoreLink, "הצג את 3 הרכבים הנוספים");
    assert.equal(list.noPriceHidden, 1);
    assert.equal(list.noPriceMoreLink, "הצג את הרכב הנוסף");
  });

  it("10 ranked + 3 no-price: the table holds nothing, so only the group has a closing row", () => {
    const list = assembleList(small(10, 3), dataOf);
    assert.deepEqual(list.restRanked, []);
    assert.equal(list.tableHidden, 0);
    assert.equal(list.tableMoreLink, null);
    assert.equal(list.noPriceHidden, 1);
    assert.equal(list.noPriceMoreLink, "הצג את הרכב הנוסף");
  });

  it("11 ranked + 3 no-price: one car hidden in EACH box -> the singular text in both", () => {
    const list = assembleList(small(11, 3), dataOf);
    assert.equal(list.tableHidden, 1);
    assert.equal(list.tableMoreLink, "הצג את הרכב הנוסף");
    assert.equal(list.tableMoreLink, moreCarsLink(1));
    assert.equal(list.noPriceHidden, 1);
    assert.equal(list.noPriceMoreLink, "הצג את הרכב הנוסף");
  });

  it("10 ranked + 2 no-price: neither box hides anything -> no closing row at all", () => {
    const list = assembleList(small(10, 2), dataOf);
    assert.equal(list.tableHidden, 0);
    assert.equal(list.tableMoreLink, null);
    assert.equal(list.noPriceHidden, 0);
    assert.equal(list.noPriceMoreLink, null);
    assert.deepEqual(list.cancelled, []);
    assert.equal(list.cancelledGroup, null);
  });
});

describe("Run 3b §1.5 — 44 ranked, 6 no-price, 2 cancelled: 31 and 4, the 2 counted by neither", () => {
  // 44 scored cars, three of them picks -> 41 ranked rows: 3 cards, 7 table rows, 31 held back.
  const list = assembleList(small(41, 6, 2), dataOf);

  it("the table hides 31 and the group hides 4", () => {
    assert.equal(list.restRanked.length, 31);
    assert.equal(list.tableHidden, 31);
    assert.equal(list.tableMoreLink, "הצג את 31 הרכבים הנוספים");
    assert.equal(list.noPrice.length, 6);
    assert.equal(list.noPriceHidden, 4);
    assert.equal(list.noPriceMoreLink, "הצג את 4 הרכבים הנוספים");
  });

  it("§1.4 — the 2 cancelled cars are in the cancelled group and in NEITHER count", () => {
    assert.equal(list.cancelled.length, 2);
    assert.deepEqual(list.cancelledGroup, cancelledGroupHead(2));
    assert.equal(list.tableHidden + list.noPriceHidden, 35); // 31 + 4, the 2 nowhere in it
  });

  it("§1.4 — the cancelled rows belong to that group ALONE, which is what puts them last on the screen", () => {
    const ids = list.cancelled.map((r) => r.public_id);
    // The two last stored rows: three picks and 41 ranked rows take ranks 1–44, the six no-price ones 45–50.
    assert.deepEqual(ids, [idAt(51), idAt(52)].map(pidOf));
    assert.deepEqual(placesOf(list.cancelled), [null, null]);
    for (const box of [list.cards, list.table, list.restRanked, list.noPrice]) {
      assert.equal(box.some((r) => ids.includes(r.public_id)), false);
    }
  });

  it("decision 4 — the no-price heading keeps counting all 6 while the closed group shows two rows", () => {
    assert.deepEqual(list.noPriceGroup, groupHead(6));
    assert.equal(list.noPrice.slice(0, NO_PRICE_DEFAULT).length, 2);
  });
});

describe("§2.1 — a hidden row is in nothing and in no count", () => {
  it("a rank-null row is neither a row nor part of x", () => {
    const rows = [...small(10, 2), { listing_id: 999, rank: null, recommendation_categories: [], total_score: 5, stage_b_trace: [] }];
    const list = assembleList(rows, dataOf);
    assert.equal(list.x, 15); // 3 picks + 10 ranked + 2 no-price
    assert.equal(
      [...list.cards, ...list.table, ...list.restRanked, ...list.noPrice, ...list.cancelled].some((r) => r.public_id === pidOf(999)),
      false,
    );
  });
});
