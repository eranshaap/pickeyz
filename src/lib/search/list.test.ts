// BRIEF Days 24–25, Run 1 §6.2 — THE LIST'S ONE ASSEMBLY, on the same stored-row fixtures §6.1 uses. No
// database: list.ts is pure, and the per-row values arrive through the `dataOf` seam that load.ts fills.
//
// Every expectation is the brief's own number, written out: the places on the three cards, the seven table rows,
// the rows the closed list holds back, the two groups, `hiddenCount` and the two texts.

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

  it("hiddenCount = 7 + 2 + 1 = 10, and the closing row says so", () => {
    assert.equal(list.hiddenCount, 10);
    assert.equal(list.moreLink, moreCarsLink(10));
    assert.equal(list.moreLink, "הצג את 10 הרכבים הנוספים");
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

/** Three picks at ranks 1–3, then `ranked` scored rows, then `noPrice` unscored ones. No cancelled car. */
function small(ranked: number, noPrice: number): PlaceRow[] {
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
  return rows;
}

describe("§6.2 — the closing row's three cases", () => {
  it("13 ranked + 3 no-price: 3 held back below, 1 above -> 4", () => {
    const list = assembleList(small(13, 3), dataOf);
    assert.equal(list.restRanked.length, 3);
    assert.equal(list.hiddenCount, 4);
    assert.equal(list.moreLink, "הצג את 4 הרכבים הנוספים");
  });

  it("10 ranked + 3 no-price: one car only -> the singular form", () => {
    const list = assembleList(small(10, 3), dataOf);
    assert.deepEqual(list.restRanked, []);
    assert.equal(list.hiddenCount, 1);
    assert.equal(list.moreLink, "הצג את הרכב הנוסף");
  });

  it("10 ranked + 2 no-price: nothing is held back -> no closing row at all", () => {
    const list = assembleList(small(10, 2), dataOf);
    assert.equal(list.hiddenCount, 0);
    assert.equal(list.moreLink, null);
    assert.deepEqual(list.cancelled, []);
    assert.equal(list.cancelledGroup, null);
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
