// BRIEF Run 6b §3.3 — the visibility decision, every reason and "shown". Pure: no database.
//
// poolVerdicts() is tested on real ListingResult shapes, because the point of it is that it reads the
// selection library's own verdicts instead of restating any rule.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ListingResult, RuleTrace } from "@/lib/selection";
import { RULE_TYPE } from "@/lib/selection";
import { decideVisibility, poolVerdicts, type VisibilityFacts } from "./visibility";

const NOTHING: VisibilityFacts = {
  exists: true,
  delisted: false,
  dealer_not_visible: false,
  sold_strong: false,
  below_threshold: false,
  above_new_price: false,
};

describe("decideVisibility() (§3.3)", () => {
  it("nothing against it -> shown", () => {
    assert.deepEqual(decideVisibility(NOTHING), { shown: true });
  });

  it("no listing with that public_id", () => {
    assert.deepEqual(decideVisibility({ ...NOTHING, exists: false }), { shown: false, reason: "no_listing" });
  });

  it("delisted", () => {
    assert.deepEqual(decideVisibility({ ...NOTHING, delisted: true }), { shown: false, reason: "delisted" });
  });

  it("the dealer has no open agreement", () => {
    assert.deepEqual(decideVisibility({ ...NOTHING, dealer_not_visible: true }), { shown: false, reason: "dealer_not_visible" });
  });

  it("sold signal strong", () => {
    assert.deepEqual(decideVisibility({ ...NOTHING, sold_strong: true }), { shown: false, reason: "sold_strong" });
  });

  it("below_threshold", () => {
    assert.deepEqual(decideVisibility({ ...NOTHING, below_threshold: true }), { shown: false, reason: "below_threshold" });
  });

  it("above_new_price", () => {
    assert.deepEqual(decideVisibility({ ...NOTHING, above_new_price: true }), { shown: false, reason: "above_new_price" });
  });

  it("a listing that does not exist is not_found before anything else is asked", () => {
    assert.deepEqual(decideVisibility({ ...NOTHING, exists: false, delisted: true, sold_strong: true }), { shown: false, reason: "no_listing" });
  });
});

// ---------------------------------------------------------------------------

function trace(over: Partial<RuleTrace> & Pick<RuleTrace, "rule" | "type">): RuleTrace {
  return { value: null, threshold: null, triggered: false, effect: "none", context: {}, ...over };
}

function result(over: Partial<ListingResult> = {}): ListingResult {
  return {
    listing_id: 1,
    car_id: 1,
    status: "shown",
    rank: 1,
    stage_a_place: 1,
    excluded_by: null,
    verify_availability: false,
    eligibility: { best_value: true, peace_of_mind: true, cheapest: true, reasons: [], without_unverified_history: { best_value: true, peace_of_mind: true, cheapest: true } },
    categories: [],
    trace: [],
    ...over,
  };
}

describe("poolVerdicts() — the library's own verdicts, never restated (§3.3)", () => {
  it("a clean result fires nothing", () => {
    assert.deepEqual(poolVerdicts(result()), { sold_strong: false, dealer_not_visible: false, below_threshold: false, above_new_price: false });
  });

  it("sold_strong is read from excluded_by — the gate writes no trace entry for it", () => {
    const r = result({ status: "excluded", excluded_by: "sold_strong", rank: null, trace: [] });
    assert.equal(poolVerdicts(r).sold_strong, true);
  });

  it("below_threshold fires on the rule's own entry", () => {
    const r = result({ trace: [trace({ rule: "below_threshold", type: RULE_TYPE.below_threshold, triggered: true, effect: "excluded" })] });
    assert.equal(poolVerdicts(r).below_threshold, true);
  });

  it("dealer_not_visible fires on the rule's own entry", () => {
    const r = result({ trace: [trace({ rule: "dealer_not_visible", type: RULE_TYPE.dealer_not_visible, triggered: true, effect: "excluded" })] });
    assert.equal(poolVerdicts(r).dealer_not_visible, true);
  });

  it("above_new_price counts only when it ACTS — a recorded-only trigger does not hide a page", () => {
    const acting = result({ trace: [trace({ rule: "above_new_price", type: RULE_TYPE.above_new_price, triggered: true, effect: "excluded" })] });
    const recorded = result({ trace: [trace({ rule: "above_new_price", type: RULE_TYPE.above_new_price, triggered: true, effect: "none" })] });
    assert.equal(poolVerdicts(acting).above_new_price, true);
    assert.equal(poolVerdicts(recorded).above_new_price, false);
  });

  it("an untriggered entry fires nothing", () => {
    const r = result({
      trace: [
        trace({ rule: "below_threshold", type: RULE_TYPE.below_threshold, triggered: false }),
        trace({ rule: "dealer_not_visible", type: RULE_TYPE.dealer_not_visible, triggered: false }),
      ],
    });
    assert.deepEqual(poolVerdicts(r), { sold_strong: false, dealer_not_visible: false, below_threshold: false, above_new_price: false });
  });

  it("THE RULES THAT DO NOT HIDE A PAGE: duplicate, thin cell, unverified_history and cancelled", () => {
    const r = result({
      status: "merged",
      rank: null,
      trace: [
        trace({ rule: "duplicate", type: RULE_TYPE.duplicate, triggered: true, effect: "merged" }),
        trace({ rule: "unverified_history", type: RULE_TYPE.unverified_history, triggered: true, effect: "ineligible" }),
        trace({ rule: "cancelled", type: RULE_TYPE.cancelled, triggered: true, effect: "ineligible" }),
      ],
      eligibility: { best_value: false, peace_of_mind: false, cheapest: false, reasons: ["cancelled", "thin_cell"], without_unverified_history: { best_value: false, peace_of_mind: false, cheapest: false } },
    });
    assert.deepEqual(poolVerdicts(r), { sold_strong: false, dealer_not_visible: false, below_threshold: false, above_new_price: false });
    assert.deepEqual(decideVisibility({ exists: true, delisted: false, ...poolVerdicts(r) }), { shown: true });
  });
});
