// Opening screen, F1 — the distribution over a fixture of 10 catalog rows and 3 makes: the fold of
// spellings into one key, the unmatched row, the sort order, the cumulative share, the buckets.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bucketCounts, distribution, quantityKey, type CatalogRow } from "./distribution";

const row = (make: string, model: string, tozeretCd: string, degemCd: string, year: number): CatalogRow => ({
  make,
  model,
  vehicleClass: "P",
  tozeretCd,
  degemCd,
  year,
});

const ROWS: CatalogRow[] = [
  // TOYOTA: COROLLA in two spellings (case and double space), plus YARIS.
  row("TOYOTA", "COROLLA", "100", "1", 2018),
  row("TOYOTA", "corolla", "100", "2", 2019),
  row("TOYOTA", "COROLLA ", "100", "3", 2020),
  row("TOYOTA", "YARIS", "100", "4", 2020),
  // MAZDA: MAZDA 3 and MAZDA3 stay two keys (no merge rule here); MAZDA  3 folds into MAZDA 3.
  row("MAZDA", "MAZDA 3", "200", "1", 2016),
  row("MAZDA", "MAZDA  3", "200", "2", 2021),
  row("MAZDA", "MAZDA3", "200", "3", 2017),
  row("MAZDA", "CX-5", "200", "4", 2022),
  // KIA: one key, one row without a quantity.
  row("KIA", "PICANTO", "300", "1", 2019),
  row("KIA", "PICANTO", "300", "2", 2020),
];

const QUANTITIES = new Map<string, number>([
  [quantityKey("100", "1", 2018), 4000],
  [quantityKey("100", "2", 2019), 3000],
  [quantityKey("100", "3", 2020), 1000],
  [quantityKey("100", "4", 2020), 600],
  [quantityKey("200", "1", 2016), 2500],
  [quantityKey("200", "2", 2021), 500],
  [quantityKey("200", "3", 2017), 150],
  [quantityKey("200", "4", 2022), 1200],
  [quantityKey("300", "1", 2019), 1050],
  // 300|2|2020 is missing on purpose.
  [quantityKey("999", "9", 2020), 77777], // no catalog row: never counted
]);

describe("distribution", () => {
  const d = distribution(ROWS, QUANTITIES);

  it("counts matched and unmatched rows; a row without a quantity adds 0", () => {
    assert.equal(d.matchedRows, 9);
    assert.equal(d.unmatchedRows, 1);
    const picanto = d.makes.find((m) => m.make === "KIA")!.keys[0];
    assert.equal(picanto.rows, 2);
    assert.equal(picanto.active, 1050);
  });

  it("folds spellings that differ only in case or whitespace into one key, keeping each raw spelling", () => {
    const toyota = d.makes.find((m) => m.make === "TOYOTA")!;
    const corolla = toyota.keys.find((k) => k.key === "COROLLA")!;
    assert.deepEqual(corolla.spellings, [
      { raw: "COROLLA", rows: 1 },
      { raw: "corolla", rows: 1 },
      { raw: "COROLLA ", rows: 1 },
    ]);
    assert.equal(corolla.rows, 3);
    assert.equal(corolla.active, 8000);
    assert.deepEqual(corolla.years, [2018, 2020]);

    const mazda = d.makes.find((m) => m.make === "MAZDA")!;
    const mazda3 = mazda.keys.find((k) => k.key === "MAZDA 3")!;
    assert.deepEqual(mazda3.spellings, [
      { raw: "MAZDA 3", rows: 1 },
      { raw: "MAZDA  3", rows: 1 },
    ]);
    assert.deepEqual(mazda3.years, [2016, 2021]);
    assert.ok(mazda.keys.some((k) => k.key === "MAZDA3"), "MAZDA3 stays its own key");
  });

  it("sorts makes by active desc and keys inside a make by active desc", () => {
    assert.deepEqual(
      d.makes.map((m) => [m.make, m.active]),
      [
        ["TOYOTA", 8600],
        ["MAZDA", 4350],
        ["KIA", 1050],
      ],
    );
    assert.deepEqual(
      d.makes[1].keys.map((k) => [k.key, k.active]),
      [
        ["MAZDA 3", 3000],
        ["CX-5", 1200],
        ["MAZDA3", 150],
      ],
    );
  });

  it("computes the total, the shares and the cumulative share in sorted order", () => {
    assert.equal(d.totalActive, 14000);
    const eps = 1e-12;
    const shares = d.makes.map((m) => m.share);
    const cumulative = d.makes.map((m) => m.cumulativeShare);
    [8600 / 14000, 4350 / 14000, 1050 / 14000].forEach((s, i) => assert.ok(Math.abs(shares[i] - s) < eps));
    [8600 / 14000, 12950 / 14000, 1].forEach((c, i) => assert.ok(Math.abs(cumulative[i] - c) < eps));
  });

  it("keeps the make exactly as given", () => {
    const d2 = distribution([row("Toyota ", "YARIS", "1", "1", 2020)], new Map());
    assert.equal(d2.makes[0].make, "Toyota ");
  });

  it("gives share 0 when nothing matched", () => {
    const d2 = distribution([row("KIA", "RIO", "1", "1", 2020)], new Map());
    assert.equal(d2.totalActive, 0);
    assert.equal(d2.unmatchedRows, 1);
    assert.equal(d2.makes[0].share, 0);
    assert.equal(d2.makes[0].cumulativeShare, 0);
  });
});

describe("bucketCounts", () => {
  const d = distribution(ROWS, QUANTITIES);
  // Keys: COROLLA 8000 · YARIS 600 · MAZDA 3 3000 · CX-5 1200 · MAZDA3 150 · PICANTO 1050.

  it("counts the keys at or above each default threshold", () => {
    assert.deepEqual(bucketCounts(d.makes), [
      { threshold: 100, keys: 6 },
      { threshold: 500, keys: 5 },
      { threshold: 1000, keys: 4 },
      { threshold: 2000, keys: 2 },
      { threshold: 5000, keys: 1 },
      { threshold: 10000, keys: 0 },
    ]);
  });

  it("takes custom thresholds, inclusive", () => {
    assert.deepEqual(bucketCounts(d.makes, [1050, 1051]), [
      { threshold: 1050, keys: 4 },
      { threshold: 1051, keys: 3 },
    ]);
  });
});
