// BRIEF Days 22–23, Run 2, §9 — reading one car's invoice (§4). Nothing here is recomputed: every assertion is
// about a value the engine wrote, or a subtraction of two of them.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { carFacts, largestComponent } from "./facts";
import { car } from "./fixtures";
import type { Row } from "@/lib/scoring/types";

describe("carFacts(): a cancelled invoice (§4.2)", () => {
  it("yields the cancellation and nothing else — no row is read", () => {
    const f = carFacts(car({ id: 1, cancelled: "2026-03-15" }));
    assert.equal(f.cancelled, true);
    assert.equal(f.cancelled_at, "2026-03-15");
    assert.equal(f.thin_cell, false);
    assert.equal(f.verified, false);
    assert.equal(f.deal_score, null);
    assert.equal(f.price_advantage, null);
    assert.equal(f.ownership_effect, null);
    assert.equal(f.ownership_effect_reality, null);
    assert.equal(f.km_effect, null);
    assert.equal(f.km_gap, null);
    assert.equal(f.hand, null);
    assert.equal(f.all_private, null);
    assert.deepEqual(f.was_types, []);
    assert.equal(f.zero_km_deal, false);
    assert.deepEqual(f.deductions, []);
  });
});

describe("carFacts(): the history row (§4.2)", () => {
  it("a 'typical' history is not a reading: effect 0 by construction, hand and owners unknown", () => {
    const f = carFacts(car({ id: 2, history_source: "typical", history: -4, typical: -4 }));
    assert.equal(f.verified, false);
    assert.equal(f.ownership_effect, 0);
    assert.equal(f.ownership_effect_reality, 0);
    assert.equal(f.hand, null);
    assert.equal(f.all_private, null);
    assert.deepEqual(f.was_types, []);
    assert.deepEqual(f.deductions, []);
  });

  it("a registry hand-1 all-private record", () => {
    const f = carFacts(car({ id: 3, owners: [{ ym: "2021-03", type: "private" }], paper_hand: 1 }));
    assert.equal(f.verified, true);
    assert.equal(f.hand, 1);
    assert.equal(f.all_private, true);
    assert.deepEqual(f.was_types, []);
  });

  it("dealer rows are never owners: they neither count nor break all_private", () => {
    const f = carFacts(
      car({
        id: 4,
        owners: [
          { ym: "2021-03", type: "private" },
          { ym: "2021-04", type: "dealer" },
          { ym: "2021-05", type: "private" },
        ],
        paper_hand: 2,
      }),
    );
    assert.equal(f.all_private, true);
    assert.equal(f.hand, 2);
    assert.deepEqual(f.was_types, []);
  });

  it("a zero-km deal's leasing row is NOT one of the car's past uses", () => {
    const f = carFacts(
      car({
        id: 5,
        owners: [
          { ym: "2021-03", type: "leasing" },
          { ym: "2021-08", type: "private" },
        ],
        paper_hand: 2,
        zero_km: true,
      }),
    );
    assert.equal(f.zero_km_deal, true);
    assert.deepEqual(f.was_types, []);
    assert.equal(f.hand, 2);
    assert.equal(f.all_private, false);
  });

  it("a rental-then-private record carries the rental", () => {
    const f = carFacts(
      car({
        id: 6,
        owners: [
          { ym: "2019-03", type: "rental" },
          { ym: "2022-06", type: "private" },
        ],
        paper_hand: 2,
      }),
    );
    assert.deepEqual(f.was_types, ["rental"]);
    assert.equal(f.all_private, false);
  });

  it("the deductions come through as applied", () => {
    const f = carFacts(
      car({
        id: 7,
        deductions: [
          { for: "rental", pct: -22, applied: -22, rule: "largest_in_full" },
          { for: "owners:2", pct: -4, applied: -2, rule: "halved" },
        ],
      }),
    );
    assert.deepEqual(f.deductions, [
      { for: "rental", applied: -22 },
      { for: "owners:2", applied: -2 },
    ]);
  });

  it("a history raw missing paper_hand is a BUG, named with the listing id", () => {
    const broken = car({ id: 8 });
    const history = (broken.invoice as { rows: Row[] }).rows.find((r) => r.row === "history");
    assert.ok(history !== undefined);
    delete history.raw.paper_hand;
    assert.throws(() => carFacts(broken), /listing 8 .* 'paper_hand'/);
  });

  it("a history raw whose owners is not an array of { ym, type } is a BUG too", () => {
    const broken = car({ id: 9 });
    const history = (broken.invoice as { rows: Row[] }).rows.find((r) => r.row === "history");
    assert.ok(history !== undefined);
    history.raw.owners = [{ ym: "2021-03" }];
    assert.throws(() => carFacts(broken), /listing 9/);
  });
});

describe("carFacts(): the km row (§4.2)", () => {
  it("km_gap and km_effect are read off the row, not derived from each other", () => {
    const f = carFacts(car({ id: 10, km: 2.4, km_declared: 41_000, median_km: 60_000 }));
    assert.equal(f.km_effect, 2.4);
    assert.equal(f.km_gap, -19_000);
  });

  it("an unavailable km row leaves both null", () => {
    const f = carFacts(car({ id: 11, km: null }));
    assert.equal(f.km_effect, null);
    assert.equal(f.km_gap, null);
  });
});

describe("the three components add up to the deal score (§4.3)", () => {
  it("price_advantage + ownership_effect + km_effect = deal_score", () => {
    const f = carFacts(car({ id: 12, price: 90_000, median: 100_000, history: 3, typical: -2, km: 1 }));
    assert.equal(f.price_advantage, 10);
    assert.equal(f.ownership_effect, 5);
    assert.equal(f.km_effect, 1);
    assert.equal(f.deal_score, 16);
    assert.ok(Math.abs((f.price_advantage ?? 0) + (f.ownership_effect ?? 0) + (f.km_effect ?? 0) - (f.deal_score ?? 0)) < 0.05);
  });

  it("the reality reading is the same subtraction against value_by_reality", () => {
    const f = carFacts(car({ id: 13, history: -10, reality: -2, typical: -4 }));
    assert.equal(f.ownership_effect, -6);
    assert.equal(f.ownership_effect_reality, 2);
  });
});

describe("largestComponent() (§4.3)", () => {
  it("the largest absolute value wins, whatever its sign", () => {
    assert.deepEqual(largestComponent({ price: 1, ownership: -7, km: 3 }), { name: "ownership", value: -7 });
  });

  it("ties break price -> ownership -> km", () => {
    assert.deepEqual(largestComponent({ price: -4, ownership: 4, km: 4 }), { name: "price", value: -4 });
    assert.deepEqual(largestComponent({ price: null, ownership: 4, km: -4 }), { name: "ownership", value: 4 });
    assert.deepEqual(largestComponent({ price: null, ownership: null, km: -4 }), { name: "km", value: -4 });
  });

  it("no component at all -> nothing decided", () => {
    assert.equal(largestComponent({ price: null, ownership: null, km: null }), null);
  });
});

describe("carFacts(): the thin cell (§4.2)", () => {
  it("a thin cell is flagged and has no deal score", () => {
    const f = carFacts(car({ id: 14, thin: true }));
    assert.equal(f.thin_cell, true);
    assert.equal(f.deal_score, null);
    assert.equal(f.price_advantage, null);
  });
});
