// Day 18 §5 — the anchor points: a point below the bar is not fitted; the stored shape reads back; the skip
// comparison at 6 dp.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ANCHOR_POINT_MIN_SAMPLE } from "@/lib/scoring/constants";
import { buildAnchorPoints, parseAnchorPoints, sameAnchorPoints, type AnchorObservation } from "./anchor-points";

const obs = (model: string, year: number, n: number, ratio = 0.7, age = 4): AnchorObservation[] =>
  Array.from({ length: n }, (_, i) => ({ make: "HYUNDAI", model, year, ratio: ratio + i * 0.001, age: age + i * 0.01 }));

describe("buildAnchorPoints (§5)", () => {
  it("the bar is ANCHOR_POINT_MIN_SAMPLE = 10", () => {
    assert.equal(ANCHOR_POINT_MIN_SAMPLE, 10);
  });

  it("a model-year with fewer than the bar is not a point, and is reported as thin", () => {
    const { points, thin } = buildAnchorPoints([...obs("IONIQ", 2021, ANCHOR_POINT_MIN_SAMPLE - 1), ...obs("IONIQ", 2022, ANCHOR_POINT_MIN_SAMPLE)], 6);
    assert.deepEqual(points.map((p) => [p.year, p.n]), [[2022, 10]]);
    assert.deepEqual(thin, [{ make: "HYUNDAI", model: "IONIQ", year: 2021, n: 9 }]);
  });

  it("a point is the median ratio and the median age of its observations, rounded", () => {
    const { points } = buildAnchorPoints(obs("IONIQ", 2022, 11, 0.6, 3), 6);
    assert.deepEqual(points, [{ make: "HYUNDAI", model: "IONIQ", year: 2022, n: 11, ratio: 0.605, median_age: 3.05 }]);
  });

  it("the key is (make, model, year): the same model name under two makes is two points", () => {
    const other = obs("X", 2022, 10).map((o) => ({ ...o, make: "KIA" }));
    const { points } = buildAnchorPoints([...obs("X", 2022, 10), ...other], 6);
    assert.deepEqual(points.map((p) => p.make), ["HYUNDAI", "KIA"]);
  });
});

describe("parseAnchorPoints", () => {
  it("null stays null (a row from before the column); a valid array reads back", () => {
    assert.equal(parseAnchorPoints(null, "pool_stats 1"), null);
    const p = [{ make: "M", model: "X", year: 2021, n: 10, ratio: 0.7, median_age: 4 }];
    assert.deepEqual(parseAnchorPoints(p, "pool_stats 1"), p);
  });

  it("anything else is a stop, with the field named", () => {
    assert.throws(() => parseAnchorPoints({}, "pool_stats 1"), /not an array/);
    assert.throws(() => parseAnchorPoints([{ make: "M", model: "X", year: "2021", n: 10, ratio: 0.7, median_age: 4 }], "pool_stats 1"), /anchor_points\[0\]\.year/);
  });
});

describe("sameAnchorPoints (§3.5)", () => {
  const a = [{ make: "M", model: "X", year: 2021, n: 10, ratio: 0.7, median_age: 4 }];
  it("equal at 6 dp → same; a 7th-place difference is not a difference", () => {
    assert.equal(sameAnchorPoints(a, [{ ...a[0], ratio: 0.70000004 }]), true);
  });
  it("a different n, point or 6th-place value → differs; a previous null → differs", () => {
    assert.equal(sameAnchorPoints(a, [{ ...a[0], n: 11 }]), false);
    assert.equal(sameAnchorPoints(a, [{ ...a[0], ratio: 0.700001 }]), false);
    assert.equal(sameAnchorPoints(a, []), false);
    assert.equal(sameAnchorPoints(null, a), false);
  });
});
