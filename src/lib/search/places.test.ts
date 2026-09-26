// BRIEF Days 24–25, Run 1 §6.1 — THE DISPLAYED PLACE, on stored-row fixtures. No database: places.ts is pure.
//
// The fixtures are the brief's own (§6.1 A, B, B2, C, D, E) and the expectations are written out rather than
// computed, so a change in the renumbering rule fails a test instead of moving with it.
//
// The `cancelled` record is copied from the shape gate.ts writes and select-three.test.ts pins (§0.3c): the rule
// name, `triggered`, the `ineligible` effect, the cancellation date as the value and `{ evaluated: true }` as the
// context. Nothing here reads `cars.cancelled_at` — the stored record is the fact (§1.1).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cardCount, classifyRow, displayedPlaces, type PlaceRow } from "./places";
import { RULE_TYPE, type RuleTrace } from "@/lib/selection";
import type { Prisma } from "@/generated/prisma/client";

/** A rule record as the JSON column holds it — the cast run.ts makes when it writes these very records. */
function trace(over: Partial<RuleTrace> & Pick<RuleTrace, "rule">): Prisma.JsonValue {
  const record: RuleTrace = {
    type: RULE_TYPE[over.rule],
    value: null,
    threshold: null,
    triggered: true,
    effect: "none",
    context: {},
    ...over,
  };
  return record as unknown as Prisma.JsonValue;
}

/** The `cancelled` record as gate.ts writes it on a car finally cancelled at the registry. */
const cancelledRecord = (): Prisma.JsonValue => trace({ rule: "cancelled", value: "2026-09-10", effect: "ineligible", context: { evaluated: true } });

/** The same record UNTRIGGERED, which gate.ts writes on every other listing that passed the gate. */
const notCancelledRecord = (): Prisma.JsonValue => trace({ rule: "cancelled", triggered: false, context: { evaluated: true } });

/** The listing id of the row at a rank, in every fixture below: the rank times ten. */
const idAt = (rank: number): number => rank * 10;

/**
 * §6.1 A — 25 rows at ranks 1–25: rows 1–20 scored, 21–24 unscored, 25 unscored and CANCELLED. `picks` says
 * which ranks carry which categories, which is the only thing A, B and B2 differ in.
 */
function fixture(picks: Readonly<Record<number, string[]>>): PlaceRow[] {
  const rows: PlaceRow[] = [];
  for (let rank = 1; rank <= 25; rank += 1) {
    rows.push({
      listing_id: idAt(rank),
      rank,
      recommendation_categories: picks[rank] ?? [],
      total_score: rank <= 20 ? 100 - rank : null,
      // the untriggered record rides on every row, as the gate writes it; only row 25's is triggered
      stage_b_trace: [rank === 25 ? cancelledRecord() : notCancelledRecord()],
    });
  }
  return rows;
}

const A = fixture({ 1: ["best_value"], 5: ["peace_of_mind"], 12: ["cheapest"] });
const B = fixture({ 1: ["best_value", "cheapest"], 5: ["peace_of_mind"] });
const B2 = fixture({ 1: ["best_value", "peace_of_mind", "cheapest"] });

/** The place of the row at `rank`, by the map's own key. */
const placeAt = (places: ReadonlyMap<number, number | null>, rank: number): number | null | undefined => places.get(idAt(rank));

describe("classifyRow() — the five kinds, in §1.1's order", () => {
  it("rank null -> hidden, whatever else the row carries", () => {
    assert.equal(classifyRow({ listing_id: 1, rank: null, recommendation_categories: ["best_value"], total_score: 9, stage_b_trace: [] }), "hidden");
  });

  it("a category -> pick, before the score is looked at", () => {
    assert.equal(classifyRow({ listing_id: 1, rank: 1, recommendation_categories: ["cheapest"], total_score: 9, stage_b_trace: [] }), "pick");
  });

  it("the cancelled record, triggered -> cancelled", () => {
    assert.equal(classifyRow({ listing_id: 1, rank: 9, recommendation_categories: [], total_score: null, stage_b_trace: [cancelledRecord()] }), "cancelled");
  });

  it("the cancelled record, UNTRIGGERED, is not a cancellation", () => {
    assert.equal(classifyRow({ listing_id: 1, rank: 9, recommendation_categories: [], total_score: 4, stage_b_trace: [notCancelledRecord()] }), "ranked");
  });

  it("a deal score -> ranked; none -> no_price", () => {
    assert.equal(classifyRow({ listing_id: 1, rank: 9, recommendation_categories: [], total_score: 4, stage_b_trace: [] }), "ranked");
    assert.equal(classifyRow({ listing_id: 1, rank: 9, recommendation_categories: [], total_score: null, stage_b_trace: [] }), "no_price");
  });

  it("a trace that is not an array at all is no record (the column can hold anything)", () => {
    assert.equal(classifyRow({ listing_id: 1, rank: 9, recommendation_categories: [], total_score: 4, stage_b_trace: null }), "ranked");
  });
});

describe("§6.1 A — three cards, three picks scattered through the ranks", () => {
  const places = displayedPlaces(A);

  it("c = 3", () => {
    assert.equal(cardCount(A), 3);
  });

  it("the ranked rows take places 4 … 20, contiguous, with no hole where a pick sat", () => {
    assert.equal(placeAt(places, 2), 4);
    assert.equal(placeAt(places, 3), 5);
    assert.equal(placeAt(places, 4), 6);
    assert.equal(placeAt(places, 6), 7); // the pick at rank 5 is skipped
    assert.equal(placeAt(places, 11), 12);
    assert.equal(placeAt(places, 13), 13); // the pick at rank 12 is skipped
    assert.equal(placeAt(places, 20), 20);
    // 17 ranked rows, and their places are exactly 4…20
    const numbers = [...places.values()].filter((p): p is number => p !== null).sort((a, b) => a - b);
    assert.equal(numbers.length, 17);
    assert.deepEqual(numbers, Array.from({ length: 17 }, (_, i) => i + 4));
  });

  it("the picks, the no-price rows and the cancelled row have no place", () => {
    for (const rank of [1, 5, 12, 21, 22, 23, 24, 25]) assert.equal(placeAt(places, rank), null, `rank ${rank}`);
  });

  it("every one of the 25 rows is in the map — none is hidden", () => {
    assert.equal(places.size, 25);
  });
});

describe("§6.1 B — a double winner is ONE pick row, so the list starts one place earlier", () => {
  const places = displayedPlaces(B);

  it("c = 2", () => {
    assert.equal(cardCount(B), 2);
  });

  it("places 3 … 20, the pick at rank 5 skipped", () => {
    assert.equal(placeAt(places, 2), 3);
    assert.equal(placeAt(places, 3), 4);
    assert.equal(placeAt(places, 4), 5);
    assert.equal(placeAt(places, 6), 6);
    assert.equal(placeAt(places, 20), 20);
    assert.equal(placeAt(places, 1), null);
    assert.equal(placeAt(places, 5), null);
  });
});

describe("§6.1 B2 — a triple winner: one card, and the places equal the ranks", () => {
  const places = displayedPlaces(B2);

  it("c = 1", () => {
    assert.equal(cardCount(B2), 1);
  });

  it("rank 2 -> 2, … rank 20 -> 20: the only pick is rank 1, so nothing is pushed", () => {
    for (let rank = 2; rank <= 20; rank += 1) assert.equal(placeAt(places, rank), rank, `rank ${rank}`);
    assert.equal(placeAt(places, 1), null);
  });
});

describe("§6.1 C — an uncrowned search: no picks, so the place IS the stored rank", () => {
  const rows: PlaceRow[] = [];
  for (let rank = 1; rank <= 8; rank += 1) {
    rows.push({ listing_id: idAt(rank), rank, recommendation_categories: [], total_score: rank <= 6 ? 50 - rank : null, stage_b_trace: [] });
  }
  const places = displayedPlaces(rows);

  it("c = 0 and the six scored rows hold places 1–6", () => {
    assert.equal(cardCount(rows), 0);
    for (let rank = 1; rank <= 6; rank += 1) assert.equal(placeAt(places, rank), rank, `rank ${rank}`);
  });

  it("the two unscored rows have no place", () => {
    assert.equal(placeAt(places, 7), null);
    assert.equal(placeAt(places, 8), null);
  });
});

describe("§6.1 D — a row with rank null is hidden and is ABSENT from the map", () => {
  const rows: PlaceRow[] = [
    { listing_id: 10, rank: 1, recommendation_categories: [], total_score: 9, stage_b_trace: [] },
    { listing_id: 20, rank: null, recommendation_categories: [], total_score: 8, stage_b_trace: [] },
  ];
  const places = displayedPlaces(rows);

  it("not in the map at all — not shown, not counted anywhere", () => {
    assert.equal(places.has(20), false);
    assert.equal(places.size, 1);
    assert.equal(places.get(10), 1);
  });
});

describe("§6.1 E — the order of §1.1 holds: a cancelled row with a score is cancelled, not ranked", () => {
  const rows: PlaceRow[] = [
    { listing_id: 10, rank: 1, recommendation_categories: [], total_score: 9, stage_b_trace: [] },
    { listing_id: 20, rank: 2, recommendation_categories: [], total_score: 8, stage_b_trace: [cancelledRecord()] },
    { listing_id: 30, rank: 3, recommendation_categories: [], total_score: 7, stage_b_trace: [] },
  ];

  it("cancelled, no place — and the rows after it close the gap", () => {
    assert.equal(classifyRow(rows[1]), "cancelled");
    const places = displayedPlaces(rows);
    assert.equal(places.get(20), null);
    assert.equal(places.get(10), 1);
    assert.equal(places.get(30), 2); // contiguous: the cancelled row takes no place
  });

  it("a pick that also carries the record is a pick — the order puts pick first", () => {
    assert.equal(
      classifyRow({ listing_id: 40, rank: 1, recommendation_categories: ["best_value"], total_score: 9, stage_b_trace: [cancelledRecord()] }),
      "pick",
    );
  });
});

describe("§1.2 — the input's order does not decide the places; the rank does", () => {
  it("the same rows shuffled give the same map", () => {
    const shuffled = [...A].reverse();
    assert.deepEqual([...displayedPlaces(shuffled).entries()].sort((a, b) => a[0] - b[0]), [...displayedPlaces(A).entries()].sort((a, b) => a[0] - b[0]));
  });
});
