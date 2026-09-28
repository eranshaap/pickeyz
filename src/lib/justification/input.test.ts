// BRIEF Days 22–23, Run 3, §2.3 — the input builder, over a REAL selectThree() result: the field mapping, a
// hidden (merged) row, the throw on a missing item, and the crowning verdict on a crowned and on a gated result.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { carsFromSelection, crownedOf } from "./input";
import { cand, type Spec } from "@/lib/selection/fixtures";
import { selectThree } from "@/lib/selection";
import type { CandidateListing, SelectionOptions, SelectionResult } from "@/lib/selection";

type Item = { listing_id: number; price: number; km_declared: number | null; candidate: CandidateListing };

/** One pool item of the shape assemblePool() builds — only the four fields the builder reads. */
const item = (s: Spec, km_declared: number | null): Item => {
  const candidate = cand(s);
  return { listing_id: candidate.listing_id, price: candidate.price, km_declared, candidate };
};

// Listings 1 and 2 are the SAME car (car_id 1), so the merge keeps one representative and hides the other;
// listing 3 is a car of its own. With the gate off all three go through the picks.
const pool = (): Item[] => [
  item({ id: 1, car: 1, price: 90_000 }, 40_000),
  item({ id: 2, car: 1, price: 95_000 }, 50_000),
  item({ id: 3, car: 3, price: 100_000 }, null),
];

const CROWNED: SelectionOptions = { crowningThreshold: 0 };
const resultOf = (items: Item[], options: SelectionOptions = CROWNED): SelectionResult => selectThree({ listings: items.map((p) => p.candidate) }, options);

describe("§2.1 carsFromSelection()", () => {
  it("one car per result, in the results' order, with the selection's rank, categories and trace", () => {
    const items = pool();
    const res = resultOf(items);
    const cars = carsFromSelection(items, res);
    assert.equal(cars.length, res.results.length);
    assert.deepEqual(
      cars.map((c) => c.listing_id),
      res.results.map((r) => r.listing_id),
    );
    for (const [i, car] of cars.entries()) {
      assert.equal(car.rank, res.results[i].rank);
      assert.deepEqual(car.categories, res.results[i].categories);
      assert.equal(car.trace, res.results[i].trace);
    }
  });

  it("the price, the km and the invoice come from the item — the invoice as stored, not a copy", () => {
    const items = pool();
    const cars = carsFromSelection(items, resultOf(items));
    const byId = new Map(cars.map((c) => [c.listing_id, c]));
    const one = byId.get(1);
    assert.ok(one !== undefined);
    assert.equal(one.price, 90_000);
    assert.equal(one.km, 40_000);
    assert.equal(one.invoice, items[0].candidate.breakdown);
    assert.equal(one.median_price, items[0].candidate.median_price);
    assert.equal(one.median_price, 100_000);
    // km_snapshot is the ad's km: null when the ad states none.
    const three = byId.get(3);
    assert.ok(three !== undefined);
    assert.equal(three.km, null);
  });

  it("a merged listing travels with rank null — the library ignores it, the builder does not drop it", () => {
    const items = pool();
    const res = resultOf(items);
    const cars = carsFromSelection(items, res);
    const merged = res.results.filter((r) => r.status === "merged");
    assert.equal(merged.length, 1, "the two listings of car 1 must have merged into one representative");
    const hidden = cars.find((c) => c.listing_id === merged[0].listing_id);
    assert.ok(hidden !== undefined, "the hidden listing is still one of the builder's cars");
    assert.equal(hidden.rank, null);
    assert.equal(cars.filter((c) => c.rank === null).length, 1);
  });

  it("a result with no item is a bug, said with the listing id", () => {
    const items = pool();
    const res = resultOf(items);
    assert.throws(
      () => carsFromSelection(items.slice(1), res),
      /listing 1 is in the selection's results but not in the items it was built from/,
    );
  });
});

describe("§2.2 crownedOf()", () => {
  it("true on a crowned selection, false on a gated one", () => {
    const items = pool();
    assert.equal(crownedOf(resultOf(items)), true);
    // The real CROWNING_THRESHOLD over three listings: the gate empties every category.
    const gated = resultOf(items, {});
    assert.equal(crownedOf(gated), false);
    assert.deepEqual(gated.picks, { best_value: null, peace_of_mind: null, cheapest: null });
  });
});
