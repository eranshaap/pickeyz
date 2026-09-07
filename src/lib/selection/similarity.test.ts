// BRIEF §7 test 12: distance() — the worked example of §4.8, and an unavailable km row.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { distance } from "./similarity";
import { cand } from "./fixtures";

describe("distance() (§4.8)", () => {
  const P = cand({ id: 1, price_v: 3.8, km: 0.9 });
  const Q = cand({ id: 2, price_v: 1.0, km: -0.5 });
  const R = cand({ id: 3, price_v: 9.5, km: -6.0 });

  it("worked example: distance(P,Q) = 3.13, distance(P,R) = 8.95", () => {
    assert.equal(distance(P, Q), 3.13);
    assert.equal(distance(P, R), 8.95);
  });

  it("is symmetric and zero against itself", () => {
    assert.equal(distance(Q, P), 3.13);
    assert.equal(distance(P, P), 0);
  });

  it("a car with an unavailable km row -> null", () => {
    const noKm = cand({ id: 4, price_v: 2.0, km: null });
    assert.equal(distance(P, noKm), null);
    assert.equal(distance(noKm, P), null);
  });

  it("a car with an unavailable price row (thin cell) -> null", () => {
    const thin = cand({ id: 5, thin: true, km: 1.0 });
    assert.equal(distance(P, thin), null);
  });

  it("different cell (comparison_group or year) -> null, never compared", () => {
    assert.equal(distance(P, cand({ id: 6, price_v: 3.8, km: 0.9, cell: "H" })), null);
    assert.equal(distance(P, cand({ id: 7, price_v: 3.8, km: 0.9, year: 2022 })), null);
  });
});
