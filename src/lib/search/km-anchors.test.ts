// S3 §1 — the km filter chips: quartiles of km_declared, each rounded up to 10,000, deduplicated, ascending.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kmFilterAnchors, quantile } from "./km-anchors";

describe("kmFilterAnchors", () => {
  it("is [] when no km is given", () => {
    assert.deepEqual(kmFilterAnchors([]), []);
  });

  it("rounds each quartile UP to the next 10,000", () => {
    // P25 = 25,000, P50 = 50,000, P75 = 75,000 over 0..100,000 in steps of 25,000
    assert.deepEqual(kmFilterAnchors([0, 25_000, 50_000, 75_000, 100_000]), [30_000, 50_000, 80_000]);
    // a quartile one km past a round number goes up a whole step
    assert.deepEqual(kmFilterAnchors([40_001]), [50_000]);
  });

  it("keeps a quartile that is already round", () => {
    assert.deepEqual(kmFilterAnchors([60_000, 60_000, 60_000]), [60_000]);
  });

  it("deduplicates quartiles that round to the same number", () => {
    // P25 = 51,000, P50 = 52,000, P75 = 53,000 — all three round to 60,000
    assert.deepEqual(kmFilterAnchors([50_000, 51_000, 52_000, 53_000, 54_000]), [60_000]);
    // two of three collide
    assert.deepEqual(kmFilterAnchors([10_000, 12_000, 14_000, 90_000, 95_000]), [20_000, 90_000]);
  });

  it("is ascending whatever the order of the input", () => {
    assert.deepEqual(kmFilterAnchors([100_000, 0, 75_000, 25_000, 50_000]), [30_000, 50_000, 80_000]);
  });

  it("interpolates between neighbours, as the norms script's quantile does", () => {
    assert.equal(quantile([10, 20], 0.5), 15);
    assert.equal(quantile([10, 20, 30, 40], 0.25), 17.5);
    assert.deepEqual(kmFilterAnchors([10_000, 20_000, 30_000, 40_000]), [20_000, 30_000, 40_000]);
  });
});
