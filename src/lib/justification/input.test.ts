// BRIEF Days 22–23, Run 3, §2.3 — the input builder, over a REAL selectThree() result: the field mapping, a
// hidden (merged) row, the throw on a missing item, and the crowning verdict on a crowned and on a gated result.
//
// Run 5 §5.2 — and the same selection turned into STORED rows: carsFromStoredRows() must answer what
// carsFromSelection() answers for the same cars, with the median read off the run's own market_stats map.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { carsFromSelection, carsFromStoredRows, crownedOf, type StoredRow } from "./input";
import { cand, type Spec } from "@/lib/selection/fixtures";
import { selectThree } from "@/lib/selection";
import type { CandidateListing, SelectionOptions, SelectionResult } from "@/lib/selection";
import type { Invoice } from "@/lib/scoring/types";

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

// --- §5.2 the stored-rows builder ---------------------------------------------------------------------------

// The two pointers a stored row carries, made up here the way the search stored them: one listing_scores row and
// one market_stats row per listing.
const SCORES_ID = (id: number): number => 1000 + id;
const STATS_ID = (id: number): number => 2000 + id;

/** The selection's results, written out as the search_results rows the search would have stored. */
const storedRowsOf = (items: Item[], res: SelectionResult): StoredRow[] => {
  const byId = new Map(items.map((i) => [i.listing_id, i]));
  return res.results.map((r) => {
    const item = byId.get(r.listing_id) as Item;
    return {
      listing_id: r.listing_id,
      rank: r.rank,
      categories: r.categories,
      price: item.price,
      km: item.km_declared,
      listing_scores_id: SCORES_ID(r.listing_id),
      market_stats_id: STATS_ID(r.listing_id),
      trace: r.trace,
    };
  });
};

const invoicesOf = (items: Item[]): Map<number, Invoice> => new Map(items.map((i) => [SCORES_ID(i.listing_id), i.candidate.breakdown]));
const mediansOf = (items: Item[]): Map<number, number | null> => new Map(items.map((i) => [STATS_ID(i.listing_id), i.candidate.median_price]));

describe("§5.1 carsFromStoredRows()", () => {
  it("the same cars carsFromSelection() builds: listing_id, rank, categories, price, km, trace, invoice, median", () => {
    const items = pool();
    const res = resultOf(items);
    const fresh = carsFromSelection(items, res);
    const stored = carsFromStoredRows(storedRowsOf(items, res), invoicesOf(items), mediansOf(items));
    assert.equal(stored.length, fresh.length);
    for (const [i, car] of stored.entries()) {
      assert.equal(car.listing_id, fresh[i].listing_id);
      assert.equal(car.rank, fresh[i].rank);
      assert.deepEqual(car.categories, fresh[i].categories);
      assert.equal(car.price, fresh[i].price);
      assert.equal(car.km, fresh[i].km);
      assert.equal(car.trace, fresh[i].trace);
      assert.equal(car.invoice, fresh[i].invoice);
      assert.equal(car.median_price, fresh[i].median_price);
    }
    // The scored price rows of this pool: the median is the norm behind market_stats_id, not a null.
    assert.equal(stored[0].median_price, 100_000);
  });

  it("a merged listing keeps its rank null and is not dropped", () => {
    const items = pool();
    const res = resultOf(items);
    const stored = carsFromStoredRows(storedRowsOf(items, res), invoicesOf(items), mediansOf(items));
    const merged = res.results.filter((r) => r.status === "merged");
    assert.equal(merged.length, 1);
    const hidden = stored.find((c) => c.listing_id === merged[0].listing_id);
    assert.ok(hidden !== undefined);
    assert.equal(hidden.rank, null);
    assert.equal(stored.filter((c) => c.rank === null).length, 1);
  });

  it("a thin cell -> median_price null: the price row is not scored, so no norm is read", () => {
    const items = [item({ id: 1, price: 90_000 }, 40_000), item({ id: 4, price: 100_000, thin: true }, 60_000)];
    const res = resultOf(items);
    // The thin car's stats pointer is present and its norm is a number: the gate, not the map, decides.
    const medians = new Map(mediansOf(items));
    medians.set(STATS_ID(4), 100_000);
    const stored = carsFromStoredRows(storedRowsOf(items, res), invoicesOf(items), medians);
    const thin = stored.find((c) => c.listing_id === 4);
    assert.ok(thin !== undefined);
    assert.equal(thin.median_price, null);
  });

  it("a cancelled invoice -> median_price null, and its rowless invoice is never asked for a price row", () => {
    const items = [item({ id: 1, price: 90_000 }, 40_000), item({ id: 5, price: 100_000, cancelled: "2026-01-01" }, 60_000)];
    const res = resultOf(items);
    const medians = new Map(mediansOf(items));
    medians.set(STATS_ID(5), 100_000);
    const stored = carsFromStoredRows(storedRowsOf(items, res), invoicesOf(items), medians);
    const cancelled = stored.find((c) => c.listing_id === 5);
    assert.ok(cancelled !== undefined);
    assert.equal(cancelled.median_price, null);
  });

  it("a row with no invoice behind its pointer is a bug, said with the listing id — a null pointer and a missing entry alike", () => {
    const items = pool();
    const res = resultOf(items);
    const rows = storedRowsOf(items, res);
    const invoices = invoicesOf(items);
    const medians = mediansOf(items);
    const nulled = rows.map((r) => (r.listing_id === 3 ? { ...r, listing_scores_id: null } : r));
    assert.throws(() => carsFromStoredRows(nulled, invoices, medians), /carsFromStoredRows: listing 3 — no invoice behind listing_scores_id null/);
    const missing = new Map(invoices);
    missing.delete(SCORES_ID(3));
    assert.throws(() => carsFromStoredRows(rows, missing, medians), /carsFromStoredRows: listing 3 — no invoice behind listing_scores_id 1003/);
  });

  it("a scored price row with no norm behind market_stats_id is a bug, said with the listing id", () => {
    const items = pool();
    const res = resultOf(items);
    const rows = storedRowsOf(items, res);
    const invoices = invoicesOf(items);
    const medians = mediansOf(items);
    const nulled = rows.map((r) => (r.listing_id === 3 ? { ...r, market_stats_id: null } : r));
    assert.throws(() => carsFromStoredRows(nulled, invoices, medians), /carsFromStoredRows: listing 3 — price row scored but no norm behind market_stats_id null/);
    const missing = new Map(medians);
    missing.delete(STATS_ID(3));
    assert.throws(() => carsFromStoredRows(rows, invoices, missing), /carsFromStoredRows: listing 3 — price row scored but no norm behind market_stats_id 2003/);
  });
});
