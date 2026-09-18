// Day 18 (engine v4): the cancelled invoice (§8), the colour facts and their confidence item (§9), and the
// registry's current holder recorded as a fact (§3.3).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ENGINE_VERSION } from "./constants";
import { confidence } from "./confidence";
import { isCancelled, scoreListing } from "./index";
import { cell, input, rows, scoreScored } from "./fixtures";
import type { Check, Row, SoldSignal } from "./types";

const market = cell({ median_history: -12 });
const recorded = { hand: 1, ownership_history: rows("private 2022-01"), first_registration: new Date("2022-01-15T00:00:00.000Z") };

describe("a cancelled car (§8)", () => {
  it("the invoice is the cancelled one: the date, no rows, no sums, no confidence", () => {
    const r = scoreListing(input({ listing: { price: 90000, km_declared: 20000 }, car: { ...recorded, cancelled_at: new Date("2026-09-10T00:00:00.000Z") }, market }));
    assert.equal(isCancelled(r), true);
    assert.deepEqual(r, {
      engine_version: ENGINE_VERSION,
      reason: "cancelled",
      cancelled_at: "2026-09-10",
      rows: [],
      condition_score: null,
      condition_by_reality: null,
      typical_history: null,
      condition_vs_typical: null,
      price_advantage: null,
      deal_score: null,
      confidence: null,
    });
  });

  it("the same car without cancelled_at is scored as always", () => {
    const r = scoreListing(input({ listing: { price: 90000, km_declared: 20000 }, car: recorded, market }));
    assert.equal(isCancelled(r), false);
    assert.equal(r.rows.length, 3);
    assert.notEqual(r.deal_score, null);
  });
});

describe("the registry's current holder (§3.3)", () => {
  it("is recorded as a fact, as received — and changes nothing else", () => {
    const base = input({ listing: { price: 90000, km_declared: 20000 }, car: recorded, market });
    const none = scoreScored(base);
    const dealer = scoreScored({ ...base, car: { ...base.car, current_owner_type: "dealer" } });
    assert.equal(none.facts.current_owner_registry, null);
    assert.equal(dealer.facts.current_owner_registry, "dealer");
    const { facts: fa, ...restNone } = none;
    const { facts: fb, ...restDealer } = dealer;
    assert.deepEqual(restNone, restDealer);
    assert.deepEqual({ ...fa, current_owner_registry: "dealer" }, fb);
  });
});

describe("colour (§9)", () => {
  const score = (car: Partial<ReturnType<typeof input>["car"]>) =>
    scoreScored(input({ listing: { price: 90000, km_declared: 20000 }, car: { ...recorded, ...car }, market }));

  it("history 1 says the colour changed → color_changed_reported; false or null → no such fact", () => {
    assert.equal(score({ color_changed: true }).facts.color_changed_reported, true);
    assert.equal("color_changed_reported" in score({ color_changed: false }).facts, false);
    assert.equal("color_changed_reported" in score({ color_changed: null }).facts, false);
  });

  it("color_changed_reported is a fact, not a confidence item", () => {
    assert.deepEqual(score({ color_changed: true }).confidence, score({ color_changed: false }).confidence);
  });

  it("both families known and different → color_mismatch fact + one confidence item", () => {
    const r = score({ color: "לבן", registry_color: "שחור מטלי" });
    assert.deepEqual(r.facts.color_mismatch, { ad: "לבן", registry: "שחור מטלי", ad_family: "white", registry_family: "black" });
    assert.deepEqual(r.confidence.items.filter((i) => i.kind === "color_mismatch"), [{ kind: "color_mismatch", ref: "color:mismatch" }]);
    assert.equal(r.confidence.level, "medium");
  });

  it("the same family in two spellings is no mismatch", () => {
    const r = score({ color: "כסוף מטאלי", registry_color: "כסוף כהה" });
    assert.equal("color_mismatch" in r.facts, false);
    assert.equal(r.confidence.level, "high");
  });

  it("an unknown side — null, or a word not in the dictionary — is no comparison and no item", () => {
    for (const car of [
      { color: null, registry_color: "שחור" },
      { color: "לבן", registry_color: null },
      { color: "סגול", registry_color: "שחור" },
      { color: "לבן", registry_color: "טורקיז" },
    ]) {
      const r = score(car);
      assert.equal("color_mismatch" in r.facts, false, JSON.stringify(car));
      assert.equal(r.confidence.items.length, 0, JSON.stringify(car));
    }
  });
});

describe("confidence counts color_mismatch like the other items (§9)", () => {
  const scored = (row: Row["row"]): Row => ({ row, status: "scored", source: "mot", value: 0, raw: {} });
  const match: Check[] = [{ check: "hand", status: "match" }, { check: "km", status: "match" }];
  const NONE: SoldSignal = { strength: null, evidence: [] };
  const MEDIUM: SoldSignal = { strength: "medium", evidence: ["rule 3"] };

  it("alone → one item, medium; with another item → two, low; without it → as before", () => {
    const three = [scored("price"), scored("history"), scored("km")];
    assert.deepEqual(confidence(three, match, NONE, true), { level: "medium", items: [{ kind: "color_mismatch", ref: "color:mismatch" }] });
    assert.equal(confidence(three, match, MEDIUM, true).level, "low");
    assert.deepEqual(confidence(three, match, NONE), { level: "high", items: [] });
  });
});
