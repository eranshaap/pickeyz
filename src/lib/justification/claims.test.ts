// BRIEF Days 22–23, Run 2, §9 — the relative claims (§5). Every one of them is a promise about the search's own
// cars, so every one of them is counted here against a pool that is built car by car.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildContext, cheaperThanCheapest, countOwnership, form, holds, lowestKm } from "./claims";
import { carFacts } from "./facts";
import { car, fillers, search } from "./fixtures";
import { ONE_OF_MAX_COUNT, ONE_OF_MAX_SHARE_PCT, SENTENCE_MAX_CHARS } from "./constants";

describe("form() — which form a count may be written in (§5)", () => {
  it("n = 1 is always 'the only one', whatever the pool", () => {
    assert.deepEqual(form(1, 1), { kind: "only" });
    assert.deepEqual(form(1, 9), { kind: "only" });
    assert.deepEqual(form(1, 100), { kind: "only" });
  });

  it("in a 100-car search n = 10 is writable and n = 11 is not", () => {
    assert.deepEqual(form(10, 100), { kind: "one_of", n: 10 });
    assert.equal(form(11, 100), null); // over ONE_OF_MAX_COUNT
    assert.equal(ONE_OF_MAX_COUNT, 10);
  });

  it("in a 32-car search n = 3 is writable and n = 4 is not — the share, not the count", () => {
    assert.deepEqual(form(3, 32), { kind: "one_of", n: 3 });
    assert.equal(form(4, 32), null);
    assert.equal(ONE_OF_MAX_SHARE_PCT, 10);
  });

  it("under 10 cars only 'the only one' can be written at all", () => {
    assert.equal(form(2, 9), null);
    assert.equal(form(2, 10), null); // floor(10 * 10 / 100) = 1
    assert.deepEqual(form(2, 20), { kind: "one_of", n: 2 });
  });
});

describe("the ownership predicates (§5)", () => {
  const hand1 = () => car({ id: 1, owners: [{ ym: "2021-03", type: "private" }], paper_hand: 1 });
  // No registry reading at all: the history row is the cell's typical standing in.
  const unverified = (id: number) => car({ id, history_source: "typical" });

  it("a car without a registry reading is counted on NEITHER side", () => {
    const ctx = buildContext(search([hand1(), unverified(2), unverified(3)]));
    assert.equal(ctx.x, 3);
    assert.equal(countOwnership(ctx, { kind: "hand1" }), 1);
    assert.equal(countOwnership(ctx, { kind: "all_private" }), 1);
    assert.equal(holds(carFacts(unverified(2)), { kind: "hand1" }), false);
    assert.equal(holds(carFacts(unverified(2)), { kind: "all_private" }), false);
  });

  it("hand_up is read against the sentence's own hand", () => {
    const three = car({ id: 4, owners: [{ ym: "2019-01", type: "private" }], paper_hand: 3 });
    const two = car({ id: 5, owners: [{ ym: "2019-01", type: "private" }], paper_hand: 2 });
    const ctx = buildContext(search([three, two, hand1()]));
    assert.equal(countOwnership(ctx, { kind: "hand_up", h: 3 }), 1);
    assert.equal(countOwnership(ctx, { kind: "hand_up", h: 2 }), 2);
    assert.equal(countOwnership(ctx, { kind: "hand_up", h: 1 }), 3);
  });

  it("was_type counts the cars that carried that type", () => {
    const rental = car({ id: 6, owners: [{ ym: "2019-03", type: "rental" }, { ym: "2022-06", type: "private" }], paper_hand: 2 });
    const ctx = buildContext(search([rental, hand1()]));
    assert.equal(countOwnership(ctx, { kind: "was_type", type: "rental" }), 1);
    assert.equal(countOwnership(ctx, { kind: "was_type", type: "leasing" }), 0);
  });

  it("the share test divides by the WHOLE search, unverified cars included", () => {
    // 20 cars, 2 of which are hand 1 and verified; the other 18 have no reading at all. form(2, 20) is writable
    // because 2 <= floor(20 * 10 / 100) — the claim is about the search, not about the part we have records for.
    const pool = [car({ id: 1, owners: [{ ym: "2021-03", type: "private" }], paper_hand: 1 }), car({ id: 2, owners: [{ ym: "2021-03", type: "private" }], paper_hand: 1 })];
    const ctx = buildContext(search([...pool, ...fillers(18, 100, { history_source: "typical" })]));
    assert.equal(ctx.x, 20);
    assert.equal(countOwnership(ctx, { kind: "hand1" }), 2);
    assert.deepEqual(form(2, ctx.x), { kind: "one_of", n: 2 });
  });
});

describe("lowestKm() (§5)", () => {
  it("strictly the lowest", () => {
    const low = car({ id: 1, km_snapshot: 40_000 });
    const high = car({ id: 2, km_snapshot: 90_000 });
    const ctx = buildContext(search([low, high]));
    assert.equal(lowestKm(ctx, low), true);
    assert.equal(lowestKm(ctx, high), false);
  });

  it("a tie is not 'the lowest'", () => {
    const a = car({ id: 1, km_snapshot: 40_000 });
    const b = car({ id: 2, km_snapshot: 40_000 });
    const ctx = buildContext(search([a, b]));
    assert.equal(lowestKm(ctx, a), false);
    assert.equal(lowestKm(ctx, b), false);
  });

  it("a car with no km is on neither side", () => {
    const low = car({ id: 1, km_snapshot: 40_000 });
    const none = car({ id: 2, km_snapshot: null });
    const ctx = buildContext(search([low, none]));
    assert.equal(lowestKm(ctx, low), true);
    assert.equal(lowestKm(ctx, none), false);
  });

  it("a hidden car is not part of the comparison", () => {
    const low = car({ id: 1, km_snapshot: 40_000 });
    const hiddenLower = car({ id: 2, km_snapshot: 10_000, rank: null });
    const ctx = buildContext(search([low, hiddenLower]));
    assert.equal(ctx.x, 1);
    assert.equal(lowestKm(ctx, low), true);
  });
});

describe("cheaperThanCheapest() (§5)", () => {
  const cheapest = () => car({ id: 1, price: 100_000, categories: ["cheapest"] });
  const under = () => car({ id: 2, price: 90_000 });
  const over = () => car({ id: 3, price: 110_000 });

  it("a non-pick under the cheapest pick's price", () => {
    const ctx = buildContext(search([cheapest(), under(), over()]));
    assert.equal(cheaperThanCheapest(ctx, ctx.cars[1]), true);
    assert.equal(cheaperThanCheapest(ctx, ctx.cars[2]), false);
  });

  it("never a pick — not even one that is cheaper than the cheapest pick", () => {
    const cheaperPick = car({ id: 4, price: 80_000, categories: ["best_value"] });
    const ctx = buildContext(search([cheapest(), cheaperPick]));
    assert.equal(cheaperThanCheapest(ctx, ctx.cars[1]), false);
  });

  it("never on an uncrowned search", () => {
    const ctx = buildContext(search([cheapest(), under()], { crowned: false }));
    assert.equal(cheaperThanCheapest(ctx, ctx.cars[1]), false);
  });

  it("with no cheapest pick, nothing is cheaper than it", () => {
    const ctx = buildContext(search([car({ id: 1, price: 100_000, categories: ["best_value"] }), under()]));
    assert.equal(ctx.cheapest, null);
    assert.equal(cheaperThanCheapest(ctx, ctx.cars[1]), false);
  });

  it("the price compared is the ranked price_snapshot, equal prices excluded", () => {
    const same = car({ id: 5, price: 100_000 });
    const ctx = buildContext(search([cheapest(), same]));
    assert.equal(cheaperThanCheapest(ctx, ctx.cars[1]), false);
  });
});

describe("the context (§5)", () => {
  it("x counts the shown cars only, and each invoice is read once", () => {
    const ctx = buildContext(search([car({ id: 1 }), car({ id: 2, rank: null }), car({ id: 3 })]));
    assert.equal(ctx.x, 2);
    assert.deepEqual(
      ctx.cars.map((c) => c.listing_id),
      [1, 3],
    );
    assert.equal(ctx.facts.size, 2);
  });

  it("the scope word follows the price ceiling", () => {
    assert.equal(buildContext(search([car({ id: 1 })], { has_price_ceiling: true })).scope, "בתקציב");
    assert.equal(buildContext(search([car({ id: 1 })])).scope, "בחיפוש");
    assert.ok(SENTENCE_MAX_CHARS > 0);
  });
});
