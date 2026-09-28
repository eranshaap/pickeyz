// BRIEF Day 12 part 2, §7 tests 1–11 and 13–15, plus §11.2 test 16 (best_value is rank 1): selectThree() end to end on hand-built inputs.
// Part 3 (rules v2): tests 8, 10, 14, 15 updated for the double-win and floor decisions; test 11 pins double_winner_effect
// 'recategorized' so that the too_similar examination it tests still happens; new: 2c (peace_of_mind floor), 17 (cheapest_runner_up).
// Part 4 (rules v3): peace_of_mind is condition alone — 2c flips (the deal floor records `overpriced`, it does not bar; the
// part-3 behaviour is reachable with { peace_of_mind_floor_effect: 'excluded' }); test 2 "deal_score null" is eligible again.
// Part 5 (rules v4): above_new_price — new block 18; the invariant (16) and determinism (13) pools gain listings with a new price.
// Day 14 run B (rules v5): unverified_history — every eligibility answer gains without_unverified_history and the rule's
// reason; block 16's v4 invariant ("the best_value pick is rank 1") is replaced by §0.5's claim, which the library's
// finishTest() now decides; new block 19 covers §5.10 (a)–(g).
// Day 18 (rules v6): the cancelled rule — new block 20; the two version pins move to 6.
// Days 22–23 (rules v8): the condition floor bars ALL THREE categories, not `cheapest` alone, and the no-deal tail is
// ordered by the registry history reading — new block 21; the cases the two changes flip carry their new outcome
// (blocks 8, 10, 11, 15, 16, 19f and 20), and the version pins move to 8.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectThree } from "./index";
import {
  ABOVE_NEW_PRICE_EFFECT,
  BELOW_THRESHOLD_FLOOR_PCT,
  CONDITION_FLOOR,
  CONDITION_FLOOR_EFFECT,
  PEACE_OF_MIND_DEAL_FLOOR,
  PEACE_OF_MIND_FLOOR_EFFECT,
  PRICE_VS_NEW_CEILING_PCT,
  NO_DEAL_ORDER,
  RULES_VERSION,
  RUNNER_UP_DEAL_GAP,
  RUNNER_UP_PRICE_BAND_PCT,
  SIMILARITY_THRESHOLD,
  UNVERIFIED_HISTORY_EFFECT,
  CANCELLED_EFFECT,
} from "./constants";
import { finishTest } from "./finish";
import { cand } from "./fixtures";
import type { CandidateListing, Eligibility, ListingResult, RuleTrace, SelectionResult } from "./types";

// Day 14 rules v5: every eligibility answer carries the pre-rule flags beside the final ones (§0.2). Days 22–23
// rules v8 (§0a): a second counterfactual beside it, the one with the FLOOR ignored — it equals the final verdicts
// in every pool with nobody below the floor, which is why it defaults to them here.
function elig(
  best_value: boolean,
  peace_of_mind: boolean,
  cheapest: boolean,
  reasons: string[],
  pre?: [boolean, boolean, boolean],
  noFloor?: [boolean, boolean, boolean],
): Eligibility {
  const [b, p, c] = pre ?? [best_value, peace_of_mind, cheapest];
  const [fb, fp, fc] = noFloor ?? [best_value, peace_of_mind, cheapest];
  return {
    best_value,
    peace_of_mind,
    cheapest,
    reasons,
    without_unverified_history: { best_value: b, peace_of_mind: p, cheapest: c },
    without_condition_floor: { best_value: fb, peace_of_mind: fp, cheapest: fc },
  };
}

function unv(r: ListingResult): RuleTrace {
  const e = r.trace.filter((t) => t.rule === "unverified_history");
  assert.equal(e.length, 1); // exactly one entry on every listing that passed the gate
  return e[0];
}

// Days 22–23 rules v8 (§0a): the floor's record, one per listing that passed the gate, like unverified_history's.
function floorEntry(r: ListingResult): RuleTrace {
  const e = r.trace.filter((t) => t.rule === "condition_floor");
  assert.equal(e.length, 1);
  return e[0];
}

function byId(res: SelectionResult, id: number): ListingResult {
  const r = res.results.find((x) => x.listing_id === id);
  if (!r) throw new Error(`no result for listing ${id}`);
  return r;
}

function entries(r: ListingResult, rule: RuleTrace["rule"]): RuleTrace[] {
  return r.trace.filter((t) => t.rule === rule);
}

function shownRanks(res: SelectionResult): number[] {
  return res.results.filter((r) => r.status === "shown").map((r) => r.rank as number);
}

function contiguous(ranks: number[]): boolean {
  const sorted = [...ranks].sort((a, b) => a - b);
  return sorted.every((v, i) => v === i + 1);
}

describe("1. gate (§4.1)", () => {
  it("strong -> excluded, sold_strong, rank and stage_a_place null, empty trace", () => {
    const res = selectThree({ listings: [cand({ id: 1, sold: "strong" }), cand({ id: 2 })] }, { crowningThreshold: 0 });
    const r = byId(res, 1);
    assert.equal(r.status, "excluded");
    assert.equal(r.excluded_by, "sold_strong");
    assert.equal(r.rank, null);
    assert.equal(r.stage_a_place, null);
    assert.deepEqual(r.trace, []);
    assert.deepEqual(r.categories, []);
    assert.equal(byId(res, 2).rank, 1);
  });

  it("medium -> shown with verify_availability", () => {
    const res = selectThree({ listings: [cand({ id: 1, sold: "medium" })] }, { crowningThreshold: 0 });
    const r = byId(res, 1);
    assert.equal(r.status, "shown");
    assert.equal(r.verify_availability, true);
    assert.equal(r.rank, 1);
    assert.equal(byId(selectThree({ listings: [cand({ id: 2 })] }, { crowningThreshold: 0 }), 2).verify_availability, false);
  });
});

describe("2. eligibility (§2)", () => {
  it("deal_score null -> not best_value; peace_of_mind stays (part 4 §1: condition alone), its overpriced entry not evaluated; one no_deal_score reason", () => {
    const l = cand({ id: 1, history: 2 });
    l.breakdown.deal_score = null;
    const r = byId(selectThree({ listings: [l] }, { crowningThreshold: 0 }), 1);
    const e = r.eligibility;
    assert.equal(e.best_value, false);
    assert.equal(e.peace_of_mind, true);
    assert.equal(e.cheapest, true);
    assert.deepEqual(e.reasons, ["no_deal_score"]);
    const op = entries(r, "overpriced");
    assert.equal(op.length, 1);
    assert.deepEqual(op[0], { rule: "overpriced", type: "eligibility", value: null, threshold: PEACE_OF_MIND_DEAL_FLOOR, triggered: false, effect: "none", context: { evaluated: false } });
  });

  it("under { peace_of_mind_floor_effect: 'excluded' } a null deal_score is not eligible for peace_of_mind (part 3 §2c restored), no overpriced entry", () => {
    const l = cand({ id: 1, history: 2 });
    l.breakdown.deal_score = null;
    const r = byId(selectThree({ listings: [l] }, { crowningThreshold: 0, peace_of_mind_floor_effect: "excluded" }), 1);
    assert.equal(r.eligibility.peace_of_mind, false);
    assert.deepEqual(r.eligibility.reasons, ["no_deal_score"]);
    assert.equal(entries(r, "overpriced").length, 0);
  });

  it("condition_by_reality null -> not peace_of_mind", () => {
    const l = cand({ id: 1, history: 2 });
    l.breakdown.condition_by_reality = null;
    const e = byId(selectThree({ listings: [l] }, { crowningThreshold: 0 }), 1).eligibility;
    assert.equal(e.best_value, true);
    assert.equal(e.peace_of_mind, false);
    assert.deepEqual(e.reasons, ["no_condition_by_reality"]);
  });

  it("condition_vs_typical null -> not cheapest", () => {
    const l = cand({ id: 1, history: 2 });
    l.breakdown.condition_vs_typical = null;
    const e = byId(selectThree({ listings: [l] }, { crowningThreshold: 0 }), 1).eligibility;
    assert.equal(e.cheapest, false);
    assert.deepEqual(e.reasons, ["no_condition_vs_typical"]);
  });

  it("history unavailable -> none of the three, all three reasons — and rules v5 adds unverified_history: an unavailable row is not a registry reading", () => {
    const e = byId(selectThree({ listings: [cand({ id: 1, history: null })] }, { crowningThreshold: 0 }), 1).eligibility;
    assert.deepEqual(e, elig(false, false, false, ["no_deal_score", "no_condition_by_reality", "no_condition_vs_typical", "unverified_history"]));
  });

  it("thin cell -> none of the three, reason thin_cell, even with a non-null condition_by_reality", () => {
    const l = cand({ id: 1, thin: true, history: 5 });
    assert.equal(l.breakdown.condition_by_reality, 5);
    const res = selectThree({ listings: [l] }, { crowningThreshold: 0 });
    const r = byId(res, 1);
    assert.deepEqual(r.eligibility, elig(false, false, false, ["thin_cell"]));
    assert.equal(r.status, "shown"); // still ranked, just never picked
    assert.deepEqual(res.picks, { best_value: null, peace_of_mind: null, cheapest: null });
  });
});

describe("2c. peace_of_mind deal floor, tracking only (part 3 §2c, part 4 §1)", () => {
  const pool = () => [
    cand({ id: 1, price: 120000, history: 8 }), // price_v -20, cvt 8 -> deal -12; reality 8: the best condition, under the floor
    cand({ id: 2, price: 115000, history: 5 }), // price_v -15, cvt 5 -> deal -10 exactly; reality 5
    cand({ id: 3, price: 100000, history: 2 }), // deal 2, reality 2
  ];

  it("the best reality condition has deal_score -12 -> eligible, overpriced recorded (triggered, effect none), and it wins peace_of_mind", () => {
    assert.equal(PEACE_OF_MIND_DEAL_FLOOR, -10);
    assert.equal(PEACE_OF_MIND_FLOOR_EFFECT, "none");
    const res = selectThree({ listings: pool() }, { crowningThreshold: 0 });
    const a = byId(res, 1);
    assert.equal(a.eligibility.peace_of_mind, true);
    assert.deepEqual(a.eligibility.reasons, []);
    assert.equal(a.eligibility.best_value, true); // a deal_score of -12 is still a deal_score
    assert.equal(a.eligibility.cheapest, true);
    const op = entries(a, "overpriced");
    assert.equal(op.length, 1);
    assert.deepEqual(op[0], { rule: "overpriced", type: "eligibility", value: -12, threshold: -10, triggered: true, effect: "none", context: { evaluated: true } });
    // exactly the floor is not triggered; every peace_of_mind-eligible listing carries one entry
    const b = entries(byId(res, 2), "overpriced");
    assert.equal(b.length, 1);
    assert.equal(b[0].value, -10);
    assert.equal(b[0].triggered, false);
    assert.equal(entries(byId(res, 3), "overpriced").length, 1);
    assert.deepEqual(res.picks, { best_value: 3, peace_of_mind: 1, cheapest: 3 });
    assert.deepEqual(a.categories, ["peace_of_mind"]);
  });

  it("with { peace_of_mind_floor_effect: 'excluded' } the part-3 behaviour: -12 is not eligible (overpriced), no entry on it, the next wins; exactly -10 is eligible", () => {
    const res = selectThree({ listings: pool() }, { crowningThreshold: 0, peace_of_mind_floor_effect: "excluded" });
    const a = byId(res, 1);
    assert.equal(a.eligibility.peace_of_mind, false);
    assert.deepEqual(a.eligibility.reasons, ["overpriced"]);
    assert.equal(a.eligibility.best_value, true);
    assert.equal(a.eligibility.cheapest, true);
    assert.equal(entries(a, "overpriced").length, 0); // not eligible -> nothing recorded
    const b = byId(res, 2);
    assert.equal(b.eligibility.peace_of_mind, true);
    assert.deepEqual(b.eligibility.reasons, []);
    const op = entries(b, "overpriced");
    assert.equal(op.length, 1);
    assert.deepEqual(op[0], { rule: "overpriced", type: "eligibility", value: -10, threshold: -10, triggered: false, effect: "none", context: { evaluated: true } }); // §8.3: untriggered -> none
    assert.deepEqual(res.picks, { best_value: 3, peace_of_mind: 2, cheapest: 3 });
  });

  it("thin cell: eligible for nothing, so no overpriced entry; sold_strong: no rules run, no entry", () => {
    const res = selectThree({ listings: [cand({ id: 1, thin: true, history: 5 }), cand({ id: 2, sold: "strong", history: 5 }), cand({ id: 3, history: 1 })] }, { crowningThreshold: 0 });
    assert.equal(entries(byId(res, 1), "overpriced").length, 0);
    assert.deepEqual(byId(res, 2).trace, []);
    assert.equal(entries(byId(res, 3), "overpriced").length, 1);
    assert.equal(res.rules_version, RULES_VERSION);
    assert.equal(RULES_VERSION, 8); // §0 — the condition floor, the history-ordered tail and the three crowning counts
  });
});

describe("3. Stage A order (§4.2, §11.2)", () => {
  it("five listings with known values -> the exact order and stage_a_place, nulls last", () => {
    const listings = [
      cand({ id: 1, price: 100000, history: 5 }), // deal 5, condition 5
      cand({ id: 2, price: 100000, history: 8 }), // deal 8
      cand({ id: 3, median: null, history: 3 }), // deal null, condition 3
      cand({ id: 4, median: null, history: null }), // deal null, condition null
      cand({ id: 5, price: 99000, history: 4 }), // price_v 1.0 + cvt 4 = deal 5, condition 4: behind 1 on condition although cheaper
    ];
    assert.equal(listings[4].breakdown.deal_score, 5);
    const res = selectThree({ listings }, { crowningThreshold: 0 });
    const order = res.results.map((r) => r.listing_id);
    assert.deepEqual(order, [2, 1, 5, 3, 4]);
    assert.deepEqual(
      res.results.map((r) => r.stage_a_place),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(res.results.map((r) => r.rank), [1, 2, 3, 4, 5]);
  });

  it("equal deal_score and equal condition_score -> the cheaper first, then the earlier first_seen_at, then the lower listing_id", () => {
    const listings = [
      cand({ id: 3, price: 100000, history: 5, first_seen: "2026-08-03T00:00:00.000Z" }),
      cand({ id: 2, price: 100000, history: 5, first_seen: "2026-08-02T00:00:00.000Z" }),
      cand({ id: 1, price: 100000, history: 5, first_seen: "2026-08-02T00:00:00.000Z" }),
      cand({ id: 4, price: 99000, price_v: 0, history: 5 }), // same deal and condition, lower price
    ];
    const res = selectThree({ listings }, { crowningThreshold: 0 });
    assert.deepEqual(res.results.map((r) => r.listing_id), [4, 1, 2, 3]);
  });
});

// Day 14 rules v5 (§0.5) replaces v4's "the best_value pick is rank 1": an ineligible listing keeps its rank, so the
// winner is the first ELIGIBLE listing in the list order, and everything above it is recorded ineligible with a reason.
describe("16. invariant (§0.5): the best_value pick is the first eligible listing in the list order", () => {
  function bestValueIsFirstEligible(res: SelectionResult): void {
    const ft = finishTest(res);
    const claim = ft.checks.find((c) => c.claim.startsWith("best_value winner"));
    assert.ok(claim !== undefined);
    assert.equal(claim.ok, true, claim.detail);
    const id = res.picks.best_value;
    if (id === null) {
      assert.equal(res.missing.best_value, "no_candidate");
      return;
    }
    const shown = res.results.filter((r) => r.status === "shown").sort((a, b) => (a.rank as number) - (b.rank as number));
    assert.equal(shown.find((r) => r.eligibility.best_value)?.listing_id, id);
  }

  it("holds on the finish pool, its permutations, and pools with nulls, a thin cell, an invisible top and a merged car", () => {
    const pools: CandidateListing[][] = [
      finishPool(),
      finishPool().reverse(),
      [cand({ id: 1, median: null, history: 3 }), cand({ id: 2, price: 100000, history: 1 }), cand({ id: 3, median: null, history: 9 })],
      [cand({ id: 1, thin: true, history: 9 }), cand({ id: 2, price: 100000, history: -2 })],
      [cand({ id: 1, price: 80000, history: 9, visible: false }), cand({ id: 2, price: 90000, history: 1 }), cand({ id: 3, price: 100000, history: 1 })],
      [cand({ id: 1, car: 1, price: 95000, history: 2 }), cand({ id: 2, car: 1, price: 90000, history: 2 }), cand({ id: 3, car: 2, price: 92000, history: 2 })],
      [cand({ id: 1, price: 1, history: 9 }), cand({ id: 2, price: 100000, history: 0 })], // the top of Stage A is excluded by the floor
      [cand({ id: 1, price: 100000, new_price: 100000, history: 9 }), cand({ id: 2, price: 99000, new_price: 100000, history: 0 })], // the top of Stage A is excluded by the ceiling (part 5)
      [cand({ id: 1, car: 1, price: 100000, new_price: 100000, history: 9 }), cand({ id: 2, car: 1, price: 95000, new_price: 100000, history: 9 }), cand({ id: 3, car: 2, price: 97000, new_price: null, history: 0 })], // a car shown through its listing under the ceiling
    ];
    for (const listings of pools) bestValueIsFirstEligible(selectThree({ listings }, { crowningThreshold: 0 }));
    for (const listings of pools) bestValueIsFirstEligible(selectThree({ listings }, { crowningThreshold: 0, too_similar_effect: "excluded" }));
    for (const listings of pools) bestValueIsFirstEligible(selectThree({ listings }, { crowningThreshold: 0, above_new_price_effect: "none" }));
  });

  it("no deal_score anywhere -> best_value null and rank 1 is still defined; rules v8 orders the tail by the history row", () => {
    const res = selectThree({ listings: [cand({ id: 1, median: null, history: 3 }), cand({ id: 2, median: null, history: 5 })] }, { crowningThreshold: 0 });
    bestValueIsFirstEligible(res);
    // Both are price 100,000 and first_seen 2026-08-01, so price and first_seen_at decide nothing. Both rest on a
    // REGISTRY reading, so the key is the reading itself: listing 2 (history 5) is ahead of listing 1 (history 3).
    assert.equal(byId(res, 2).rank, 1);
    assert.equal(byId(res, 1).rank, 2);
  });
});

describe("4. below_threshold (§4.3)", () => {
  it("median 100,000: 49,900 -> 49.9, triggered, excluded; 50,000 -> 50.0, not triggered; median null -> not evaluated", () => {
    const res = selectThree({
      listings: [cand({ id: 1, price: 49900, median: 100000 }), cand({ id: 2, price: 50000, median: 100000 }), cand({ id: 3, median: null })],
    }, { crowningThreshold: 0 });
    const a = byId(res, 1);
    const [ta] = entries(a, "below_threshold");
    assert.equal(ta.value, 49.9);
    assert.equal(ta.threshold, BELOW_THRESHOLD_FLOOR_PCT);
    assert.equal(ta.triggered, true);
    assert.equal(ta.effect, "excluded");
    assert.equal(ta.type, "eligibility");
    assert.equal(a.status, "excluded");
    assert.equal(a.excluded_by, "below_threshold");
    assert.equal(a.rank, null);
    assert.equal(a.stage_a_place, 1); // it had a place before the exclusion

    const b = byId(res, 2);
    const [tb] = entries(b, "below_threshold");
    assert.equal(tb.value, 50.0);
    assert.equal(tb.triggered, false);
    assert.equal(tb.effect, "none");
    assert.equal(b.status, "shown");

    const c = byId(res, 3);
    const [tc] = entries(c, "below_threshold");
    assert.equal(tc.value, null);
    assert.equal(tc.triggered, false);
    assert.equal(tc.context.evaluated, false);
    assert.equal(typeof tc.context.reason, "string");
    assert.equal(c.status, "shown");
  });
});

describe("5. dealer_not_visible (§4.4)", () => {
  it("the invisible listing at stage_a_place 2 -> excluded with value 2; shown ranks contiguous", () => {
    const res = selectThree({
      listings: [cand({ id: 1, history: 10 }), cand({ id: 2, history: 8, visible: false }), cand({ id: 3, history: 6 })],
    }, { crowningThreshold: 0 });
    const r = byId(res, 2);
    assert.equal(r.stage_a_place, 2);
    assert.equal(r.status, "excluded");
    assert.equal(r.excluded_by, "dealer_not_visible");
    assert.equal(r.rank, null);
    const [t] = entries(r, "dealer_not_visible");
    assert.equal(t.value, 2);
    assert.equal(t.threshold, null);
    assert.equal(t.triggered, true);
    assert.equal(t.effect, "excluded");
    assert.equal(t.type, "correctness");
    assert.deepEqual(shownRanks(res), [1, 2]);
    assert.equal(byId(res, 1).rank, 1);
    assert.equal(byId(res, 3).rank, 2);
    // the visible listings carry the entry too, not triggered
    const [tv] = entries(byId(res, 1), "dealer_not_visible");
    assert.equal(tv.triggered, false);
    assert.equal(tv.effect, "none");
  });
});

describe("6. duplicate (§4.5)", () => {
  it("one car, three listings at 1 / 96,000 / 97,000, median 100,000", () => {
    const res = selectThree({
      listings: [
        cand({ id: 1, car: 7, price: 1, median: 100000 }),
        cand({ id: 2, car: 7, price: 96000, median: 100000 }),
        cand({ id: 3, car: 7, price: 97000, median: 100000 }),
      ],
    }, { crowningThreshold: 0 });
    const a = byId(res, 1);
    assert.equal(a.status, "excluded");
    assert.equal(a.excluded_by, "below_threshold");
    assert.equal(entries(a, "duplicate").length, 0);

    const rep = byId(res, 2);
    assert.equal(rep.status, "shown");
    assert.equal(rep.rank, 1);
    const [tr] = entries(rep, "duplicate");
    assert.equal(tr.triggered, false);
    assert.equal(tr.effect, "none");
    assert.equal(tr.type, "correctness");
    assert.deepEqual(tr.context, { absorbed: [3] });

    const m = byId(res, 3);
    assert.equal(m.status, "merged");
    assert.equal(m.rank, null);
    assert.equal(typeof m.stage_a_place, "number");
    const [tm] = entries(m, "duplicate");
    assert.equal(tm.triggered, true);
    assert.equal(tm.effect, "merged");
    assert.deepEqual(tm.context, { merged_into: 2 });

    assert.deepEqual(shownRanks(res), [1]);
    assert.equal(res.picks.best_value, 2);
  });

  it("equal prices -> the earlier first_seen_at represents", () => {
    const res = selectThree({
      listings: [
        cand({ id: 10, car: 7, price: 90000, first_seen: "2026-08-05T00:00:00.000Z" }),
        cand({ id: 11, car: 7, price: 90000, first_seen: "2026-08-02T00:00:00.000Z" }),
      ],
    }, { crowningThreshold: 0 });
    assert.equal(byId(res, 11).status, "shown");
    assert.equal(byId(res, 10).status, "merged");
    assert.deepEqual(entries(byId(res, 10), "duplicate")[0].context, { merged_into: 11 });
  });
});

describe("7. picks, basic (§4.7)", () => {
  it("four distinct cars -> three picks, three different car_ids, categories from the keys", () => {
    const listings = [
      cand({ id: 1, price: 90000, history: 0 }), // deal 10, reality 0
      cand({ id: 2, price: 100000, history: 8 }), // deal 8, reality 8
      cand({ id: 3, price: 85000, history: -10 }), // deal 5, cvt -10 -> not eligible for cheapest (below_floor, part 3 §2a)
      cand({ id: 4, price: 89000, history: -4 }), // deal 7, reality -4, cvt -4: within the -5 floor, and cheaper than car 1
    ];
    const res = selectThree({ listings }, { crowningThreshold: 0 });
    assert.deepEqual(res.picks, { best_value: 1, peace_of_mind: 2, cheapest: 4 });
    assert.deepEqual(res.missing, {});
    const cars = new Set(Object.values(res.picks).map((id) => byId(res, id as number).car_id));
    assert.equal(cars.size, 3);
    assert.deepEqual(byId(res, 1).categories, ["best_value"]);
    assert.deepEqual(byId(res, 2).categories, ["peace_of_mind"]);
    assert.deepEqual(byId(res, 4).categories, ["cheapest"]);
    assert.deepEqual(byId(res, 3).categories, []);
  });
});

describe("8. double_winner (§4.7, part 3 §1)", () => {
  // car 1: history -6 on paper but reality 5 -> deal 4 (the best), reality 5 (the best), cvt -6 (out of cheapest)
  const pool = () => [
    cand({ id: 1, price: 90000, history: -6, reality: 5 }), // deal 4, reality 5, cvt -6 -> not eligible for cheapest
    cand({ id: 2, price: 100000, history: 3 }), // deal 3, reality 3, cvt 3
    cand({ id: 3, price: 110000, history: 0 }), // deal -10 (exactly the peace_of_mind floor), reality 0, cvt 0
  ];

  // Days 22–23 rules v8 (§0a): car 1's condition_vs_typical is -6, below the floor, so it is eligible for NOTHING —
  // not only out of `cheapest`, as it was under v7. Car 2 is first in all three orders among the eligible and wins
  // all three; car 3 is never examined.
  it("the best deal is below the condition floor -> it wins nothing and the next car wins all three", () => {
    const res = selectThree({ listings: pool() }, { crowningThreshold: 0 });
    assert.deepEqual(res.picks, { best_value: 2, peace_of_mind: 2, cheapest: 2 });
    const loser = byId(res, 1);
    assert.deepEqual(loser.categories, []);
    assert.equal(entries(loser, "double_winner").length, 0); // never a candidate in any category
    assert.equal(floorEntry(loser).triggered, true);
    assert.equal(floorEntry(loser).effect, CONDITION_FLOOR_EFFECT);
    assert.equal(CONDITION_FLOOR_EFFECT, "ineligible");

    const w = byId(res, 2);
    assert.deepEqual(w.categories, ["best_value", "peace_of_mind", "cheapest"]);
    const dw = entries(w, "double_winner");
    assert.equal(dw.length, 2); // considered again for peace_of_mind and for cheapest, first in both
    assert.deepEqual(dw[0], {
      rule: "double_winner",
      type: "portfolio",
      value: null,
      threshold: null,
      triggered: true,
      effect: "none",
      context: { won: ["best_value"], considered_for: "peace_of_mind", place_in_category: 1 },
    });
    assert.deepEqual(dw[1].context, { won: ["best_value", "peace_of_mind"], considered_for: "cheapest", place_in_category: 1 });
    // every pick is the same listing, so every comparison is against itself as self: no distance is recorded at all
    assert.equal(res.results.flatMap((r) => entries(r, "too_similar")).length, 0);
    assert.deepEqual(byId(res, 3).categories, []);
  });

  it("with { double_winner_effect: 'recategorized' } the cascade starts from car 2, and cheapest runs out of candidates", () => {
    const res = selectThree({ listings: pool() }, { crowningThreshold: 0, double_winner_effect: "recategorized" });
    assert.deepEqual(res.picks, { best_value: 2, peace_of_mind: 3, cheapest: null });
    assert.deepEqual(res.missing, { cheapest: "no_candidate" });
    assert.deepEqual(byId(res, 1).categories, []); // below the floor: out of the cascade entirely
    const w = byId(res, 2);
    assert.deepEqual(w.categories, ["best_value"]);
    const dw = entries(w, "double_winner");
    assert.equal(dw.length, 2); // recategorized out of peace_of_mind, then out of cheapest
    assert.equal(dw[0].effect, "recategorized");
    assert.deepEqual(dw[0].context, { won: ["best_value"], considered_for: "peace_of_mind", place_in_category: 1 });
    assert.deepEqual(dw[1].context, { won: ["best_value"], considered_for: "cheapest", place_in_category: 1 });
    assert.deepEqual(entries(byId(res, 3), "double_winner")[0].context, { won: ["peace_of_mind"], considered_for: "cheapest", place_in_category: 2 });
  });
});

describe("9. reality reading (§2)", () => {
  it("zero-km car: paper -10 / reality 0, km +6 -> peace_of_mind, although by condition_score the private car would win", () => {
    const zeroKm = cand({ id: 1, price: 100000, history: -10, reality: 0, km: 6 });
    const priv = cand({ id: 2, price: 100000, history: 3, km: 0 });
    assert.equal(zeroKm.breakdown.condition_score, -4);
    assert.equal(zeroKm.breakdown.condition_by_reality, 6);
    assert.equal(priv.breakdown.condition_score, 3);
    assert.equal(priv.breakdown.condition_by_reality, 3);
    // the point of the field: by paper condition the private car is ahead
    assert.ok((priv.breakdown.condition_score as number) > (zeroKm.breakdown.condition_score as number));
    const res = selectThree({ listings: [zeroKm, priv] }, { crowningThreshold: 0 });
    assert.equal(res.picks.peace_of_mind, 1);
    assert.equal(res.picks.best_value, 2);
  });
});

describe("10. cheapest (§2, §11.3, part 3 §2a)", () => {
  it("the cheapest car has condition_vs_typical -6 -> not eligible for any category (below_floor); a car at exactly -5 is, and wins as the cheapest eligible", () => {
    assert.equal(CONDITION_FLOOR, -5);
    const res = selectThree({
      listings: [
        cand({ id: 1, price: 80000, history: -6 }), // cvt -6, deal 14, reality -6
        cand({ id: 2, price: 90000, history: -5 }), // cvt -5 exactly, deal 5, reality -5
        cand({ id: 3, price: 100000, history: 6 }), // cvt +6, deal 6, reality 6
      ],
    }, { crowningThreshold: 0 });
    // rules v8 (§0a): the floor bars all three, so car 1 wins nothing at all and car 3 takes best_value too
    assert.deepEqual(res.picks, { best_value: 3, peace_of_mind: 3, cheapest: 2 });
    const e = byId(res, 1).eligibility;
    assert.equal(e.cheapest, false);
    assert.deepEqual(e.reasons, ["below_floor"]);
    assert.equal(e.best_value, false);
    assert.equal(e.peace_of_mind, false);
    assert.equal(byId(res, 2).eligibility.cheapest, true);
    assert.deepEqual(byId(res, 2).eligibility.reasons, []);
    // the candidates are exactly the eligible ones: car 1 was never examined for cheapest
    assert.equal(entries(byId(res, 1), "double_winner").filter((t) => t.context.considered_for === "cheapest").length, 0);
  });

  it("condition_vs_typical exactly 0 -> eligible for cheapest; alone in the pool it wins all three", () => {
    const res = selectThree({ listings: [cand({ id: 1, price: 100000, history: 0 })] }, { crowningThreshold: 0 });
    assert.equal(byId(res, 1).eligibility.cheapest, true);
    assert.deepEqual(res.picks, { best_value: 1, peace_of_mind: 1, cheapest: 1 }); // part 3 §1: a car may win more than one category
    assert.deepEqual(byId(res, 1).categories, ["best_value", "peace_of_mind", "cheapest"]);
    assert.deepEqual(
      entries(byId(res, 1), "double_winner").map((t) => t.context.won),
      [["best_value"], ["best_value", "peace_of_mind"]],
    );
  });
});

describe("11. too_similar, tracking (§4.7, §4.8)", () => {
  const P = () => cand({ id: 1, price: 96200, price_v: 3.8, km: 0.9, history: 0 }); // deal 4.7, reality 0.9
  const Q = () => cand({ id: 2, price: 99000, price_v: 1.0, km: -0.5, history: 0 }); // deal 0.5, reality -0.5
  const R = () => cand({ id: 3, price: 90500, price_v: 9.5, km: -6.0, history: 0 }); // deal 3.5, reality -6
  // P is also the best reality condition; under the v2 default it would win peace_of_mind too and Q would never be examined.
  // The examination of Q against P is what this suite tests, so double_winner is pinned to 'recategorized' here.
  const RECAT = { double_winner_effect: "recategorized" } as const;

  it("same cell at distance 3.13: the entry is recorded, triggered, effect none — and the candidate is still picked", () => {
    const res = selectThree({ listings: [P(), Q(), R()] }, { ...RECAT, crowningThreshold: 0 });
    assert.equal(res.picks.best_value, 1);
    assert.equal(res.picks.peace_of_mind, 2);
    const [t] = entries(byId(res, 2), "too_similar");
    assert.deepEqual(t, {
      rule: "too_similar",
      type: "portfolio",
      value: 3.13,
      threshold: SIMILARITY_THRESHOLD,
      triggered: true,
      effect: "none",
      context: { vs_listing_id: 1, vs_category: "best_value", same_cell: true },
    });
  });

  // Days 22–23 rules v8 (§0a): R's condition_vs_typical is -6 (history 0, km -6.0), below the floor, so R is not a
  // candidate in any category any more. Q is still skipped as too similar to P, and with R gone there is nobody left:
  // peace_of_mind comes out empty with a reason, which §0.4 has always called a correct outcome.
  it("with { too_similar_effect: 'excluded' } the same input skips Q, and the car behind it is below the floor -> peace_of_mind is empty", () => {
    const res = selectThree({ listings: [P(), Q(), R()] }, { crowningThreshold: 0, ...RECAT, too_similar_effect: "excluded" });
    assert.equal(res.picks.best_value, 1);
    assert.equal(res.picks.peace_of_mind, null);
    assert.equal(res.missing.peace_of_mind, "no_candidate");
    const [tq] = entries(byId(res, 2), "too_similar");
    assert.equal(tq.value, 3.13);
    assert.equal(tq.triggered, true);
    assert.equal(tq.effect, "excluded");
    // R was never examined: the floor keeps it out of the candidate set, so it records no distance at all
    assert.equal(entries(byId(res, 3), "too_similar").length, 0);
    assert.deepEqual(byId(res, 3).categories, []);
    assert.deepEqual(byId(res, 3).eligibility.reasons, ["below_floor"]);
    assert.equal(floorEntry(byId(res, 3)).value, -6);
    assert.equal(floorEntry(byId(res, 3)).triggered, true);
  });

  it("cross-cell pair -> value null, triggered false, same_cell false", () => {
    const q = Q();
    q.comparison_group = "H";
    const res = selectThree({ listings: [P(), q, R()] }, { crowningThreshold: 0, ...RECAT, too_similar_effect: "excluded" });
    assert.equal(res.picks.peace_of_mind, 2);
    const [t] = entries(byId(res, 2), "too_similar");
    assert.equal(t.value, null);
    assert.equal(t.triggered, false);
    assert.equal(t.context.same_cell, false);
  });
});

// the pool of test 14, reused by 13
function finishPool(): CandidateListing[] {
  return [
    cand({ id: 1, car: 1, price: 90000, history: 4 }), // deal 14, reality 4
    cand({ id: 2, car: 2, price: 95000, history: 6 }), // deal 11, reality 6
    cand({ id: 3, car: 2, price: 97000, history: 6 }), // duplicate of car 2 -> merged into 2
    cand({ id: 4, car: 3, price: 87000, history: 2, visible: false }), // deal 15 but the seller is not visible
    cand({ id: 5, car: 4, thin: true, history: 9 }), // thin cell: reality 9 but eligible for nothing
    cand({ id: 6, car: 5, price: 100000, history: 1, sold: "medium" }), // deal 1, verify_availability
    cand({ id: 7, car: 6, price: 92000, history: -3 }), // deal 5, cvt -3
    cand({ id: 8, car: 7, price: 98000, history: 3 }), // deal 5, reality 3
    cand({ id: 9, car: 8, price: 105000, history: 7 }), // deal 2, reality 7
  ];
}

describe("13. determinism", () => {
  it("shuffled input order -> identical picks and identical results", () => {
    const base = selectThree({ listings: finishPool() }, { crowningThreshold: 0 });
    const reversed = selectThree({ listings: finishPool().reverse() }, { crowningThreshold: 0 });
    const rotated = (() => {
      const p = finishPool();
      return selectThree({ listings: [...p.slice(4), ...p.slice(0, 4)] }, { crowningThreshold: 0 });
    })();
    // part 5: the same three orders over a pool with new prices (one listing at the ceiling, one without a price)
    const priced = () => finishPool().map((l, i) => ({ ...l, new_price: i === 8 ? l.price : i === 4 ? null : 200000 }));
    const pBase = selectThree({ listings: priced() }, { crowningThreshold: 0 });
    const pReversed = selectThree({ listings: priced().reverse() }, { crowningThreshold: 0 });
    const pRotated = (() => {
      const p = priced();
      return selectThree({ listings: [...p.slice(4), ...p.slice(0, 4)] }, { crowningThreshold: 0 });
    })();
    const sorted = (r: SelectionResult) => [...r.results].sort((a, b) => a.listing_id - b.listing_id);
    for (const other of [reversed, rotated]) {
      assert.deepEqual(other.picks, base.picks);
      assert.deepEqual(other.missing, base.missing);
      assert.deepEqual(sorted(other), sorted(base));
    }
    assert.equal(byId(pBase, 9).excluded_by, "above_new_price"); // listing 9 (car 8, the peace_of_mind winner of the base pool) is at its new price
    assert.notDeepEqual(pBase.picks, base.picks); // the ceiling changed the picks, so this is a different pool
    for (const other of [pReversed, pRotated]) {
      assert.deepEqual(other.picks, pBase.picks);
      assert.deepEqual(other.missing, pBase.missing);
      assert.deepEqual(sorted(other), sorted(pBase));
    }
  });
});

describe("14. finish test, synthetic (part 3 §3: a double win is reported, not a failure)", () => {
  it("three picks, the cheapest is also the best deal (two distinct cars), ranks contiguous, rank 1 is best_value, invisible and thin never picked", () => {
    const res = selectThree({ listings: finishPool() }, { crowningThreshold: 0 });
    assert.deepEqual(res.picks, { best_value: 1, peace_of_mind: 9, cheapest: 1 });
    assert.deepEqual(res.missing, {});
    const pickedIds = Object.values(res.picks) as number[];
    assert.equal(pickedIds.every((id) => typeof id === "number"), true);
    const cars = pickedIds.map((id) => byId(res, id).car_id);
    assert.equal(new Set(cars).size, 2); // reported: distinct cars among the picks
    assert.deepEqual(byId(res, 1).categories, ["best_value", "cheapest"]); // reported: the double win
    assert.equal(res.results.filter((r) => r.categories.length > 0).length, 2);
    assert.equal(byId(res, 1).rank, 1);
    assert.ok(contiguous(shownRanks(res)));
    assert.ok(!pickedIds.includes(4) && !pickedIds.includes(5));
    assert.equal(byId(res, 4).status, "excluded");
    assert.equal(byId(res, 3).status, "merged");
    assert.equal(byId(res, 5).status, "shown");
    assert.deepEqual(byId(res, 5).categories, []);
    assert.equal(byId(res, 6).verify_availability, true);
    // the runner-up of the cheapest pick: car 6 at 92,000 (2.2% over), deal 5 vs 14 -> recorded, not triggered
    assert.deepEqual(res.runner_ups.cheapest, { listing_id: 7, gap: -9, price_over_pct: 2.2, triggered: false });
    // ranked first, then the rest
    const ranks = res.results.map((r) => r.rank);
    const firstNull = ranks.indexOf(null);
    assert.ok(ranks.slice(0, firstNull).every((r) => r !== null) && ranks.slice(firstNull).every((r) => r === null));
  });
});

describe("15. missing category", () => {
  // rules v8 (§0a): every car in this pool is below the floor, so every category is empty — not `cheapest` alone.
  it("no car with condition_vs_typical >= -5 -> all three categories null with no_candidate", () => {
    const res = selectThree({
      listings: [cand({ id: 1, price: 90000, history: -6 }), cand({ id: 2, price: 100000, history: -7 }), cand({ id: 3, price: 95000, history: -8 })],
    }, { crowningThreshold: 0 });
    assert.deepEqual(res.picks, { best_value: null, peace_of_mind: null, cheapest: null });
    assert.deepEqual(res.missing, { best_value: "no_candidate", peace_of_mind: "no_candidate", cheapest: "no_candidate" });
    for (const r of res.results) assert.deepEqual(r.eligibility.reasons, ["below_floor"]);
    assert.equal(res.results.flatMap((r) => entries(r, "double_winner")).length, 0); // nobody was ever a candidate
    assert.equal(res.runner_ups.cheapest, null); // no cheapest pick -> the runner-up rule is not evaluated
    assert.equal(res.results.flatMap((r) => entries(r, "cheapest_runner_up")).length, 0);
  });
});

describe("17. cheapest_runner_up (part 3 §2b)", () => {
  // C = car 1 at 90,000, deal 10, cvt 0. The band at 5% ends at 94,500.
  const C = () => cand({ id: 1, price: 90000, history: 0 }); // deal 10, reality 0
  const ru = (id: number, price: number, history: number) => cand({ id, price, history });

  function ruEntry(res: SelectionResult): RuleTrace {
    const e = entries(byId(res, res.picks.cheapest as number), "cheapest_runner_up");
    assert.equal(e.length, 1);
    return e[0];
  }

  it("(a) a candidate in the band with gap >= 2 -> entry on C, triggered, runner_ups.cheapest set", () => {
    assert.equal(RUNNER_UP_PRICE_BAND_PCT, 5);
    assert.equal(RUNNER_UP_DEAL_GAP, 2);
    const res = selectThree({
      listings: [
        C(),
        ru(2, 93000, 5), // price_v 7 + cvt 5 = deal 12: 3.3% over C, gap 2
        ru(3, 96000, 15), // deal 19, reality 15: best_value and peace_of_mind; 6.7% over C, outside the band
      ],
    }, { crowningThreshold: 0 });
    assert.deepEqual(res.picks, { best_value: 3, peace_of_mind: 3, cheapest: 1 });
    assert.deepEqual(ruEntry(res), {
      rule: "cheapest_runner_up",
      type: "portfolio",
      value: 2,
      threshold: RUNNER_UP_DEAL_GAP,
      triggered: true,
      effect: "none",
      context: { runner_up: 2, price_over_pct: 3.3, band_pct: RUNNER_UP_PRICE_BAND_PCT },
    });
    assert.deepEqual(res.runner_ups.cheapest, { listing_id: 2, gap: 2, price_over_pct: 3.3, triggered: true });
    assert.deepEqual(byId(res, 2).categories, []); // recorded, never acted on
    assert.equal(entries(byId(res, 2), "cheapest_runner_up").length, 0); // recorded on C only
  });

  // rules v7 (§1.5): listing 2's deal 11.4 beats C's 10 and its reality 4.4 beats C's 0, so it wins best_value
  // and peace_of_mind — and a pick is no longer a candidate. The band then holds nobody.
  it("(b) the only candidate in the band is itself a pick -> no runner-up at all (rules v7)", () => {
    const res = selectThree({ listings: [C(), ru(2, 93000, 4.4)] }, { crowningThreshold: 0 }); // deal 11.4
    assert.equal(res.picks.cheapest, 1);
    assert.deepEqual(byId(res, 2).categories, ["best_value", "peace_of_mind"]);
    const e = ruEntry(res);
    assert.equal(e.value, null);
    assert.equal(e.triggered, false);
    assert.equal(e.context.reason, "no_candidate_in_band");
    assert.equal(res.runner_ups.cheapest, null);
  });

  it("(c) the only pricier eligible car is 6% above C -> evaluated false, no_candidate_in_band, runner_ups.cheapest null", () => {
    const res = selectThree({ listings: [C(), ru(2, 95400, 5)] }, { crowningThreshold: 0 }); // 6.0% over
    assert.equal(res.picks.cheapest, 1);
    assert.deepEqual(ruEntry(res), {
      rule: "cheapest_runner_up",
      type: "portfolio",
      value: null,
      threshold: RUNNER_UP_DEAL_GAP,
      triggered: false,
      effect: "none",
      context: { evaluated: false, reason: "no_candidate_in_band", band_pct: RUNNER_UP_PRICE_BAND_PCT },
    });
    assert.equal(res.runner_ups.cheapest, null);
  });

  it("(d) no cheapest pick -> no entry anywhere", () => {
    const res = selectThree({ listings: [cand({ id: 1, price: 90000, history: -6 }), cand({ id: 2, price: 93000, history: -7 })] }, { crowningThreshold: 0 });
    assert.equal(res.picks.cheapest, null);
    assert.equal(res.runner_ups.cheapest, null);
    assert.equal(res.results.flatMap((r) => entries(r, "cheapest_runner_up")).length, 0);
  });

  it("(e) two candidates in the band -> the higher deal_score of those that are NOT picks; equal -> the lower price", () => {
    const higher = selectThree({ listings: [C(), ru(2, 93000, 5), ru(3, 94000, 7)] }, { crowningThreshold: 0 }); // deals 12 and 13
    assert.equal(higher.picks.cheapest, 1);
    // rules v7 (§1.5): listing 3 has the higher deal and wins best_value + peace_of_mind, so it is out of the
    // candidate set; the band's best candidate outside the picks is listing 2.
    assert.deepEqual(byId(higher, 3).categories, ["best_value", "peace_of_mind"]);
    assert.deepEqual(higher.runner_ups.cheapest, { listing_id: 2, gap: 2, price_over_pct: 3.3, triggered: true });
    const tie = selectThree({ listings: [C(), ru(2, 93000, 5), ru(3, 94000, 6)] }, { crowningThreshold: 0 }); // deals 12 and 12
    // the deal tie breaks on condition_score, so listing 3 wins the other two categories and listing 2 wins nothing
    assert.deepEqual(tie.runner_ups.cheapest, { listing_id: 2, gap: 2, price_over_pct: 3.3, triggered: true });
    assert.equal(ruEntry(tie).context.runner_up, 2);
  });

  // rules v7 (§1.5) replaces P1: the runner-up is never one of the picks. A band holding only picks records no
  // runner-up, and nothing on the screen is named twice.
  it("(f) the runner-up is NEVER the best_value / peace_of_mind pick -> no runner-up when the band holds only picks", () => {
    const res = selectThree({ listings: [C(), ru(2, 93000, 8)] }, { crowningThreshold: 0 }); // deal 15, reality 8: wins both other categories
    assert.deepEqual(res.picks, { best_value: 2, peace_of_mind: 2, cheapest: 1 });
    assert.equal(res.runner_ups.cheapest, null);
    // the rule is still recorded on C, as "not evaluated": the band had no candidate outside the picks
    const e = res.results.flatMap((r) => entries(r, "cheapest_runner_up"));
    assert.equal(e.length, 1);
    assert.equal(e[0].context.evaluated, false);
    assert.equal(e[0].context.reason, "no_candidate_in_band");
  });

  it("C's own car is never its runner-up: a second, pricier listing of C's car (merged into C) is not a candidate", () => {
    const res = selectThree({ listings: [C(), cand({ id: 5, car: 1, price: 92000, history: 9 }), ru(2, 93000, 5)] }, { crowningThreshold: 0 });
    assert.equal(byId(res, 5).status, "merged");
    assert.equal(res.picks.cheapest, 1);
    // rules v7 (§1.5): listing 2 (deal 12, reality 5) wins best_value and peace_of_mind, so it is no candidate
    // either — the band is empty of non-picks and nothing is recorded as a runner-up. Listing 5 was never a
    // candidate (it is C's own car, and merged), and no record names it.
    assert.deepEqual(byId(res, 2).categories, ["best_value", "peace_of_mind"]);
    assert.equal(res.runner_ups.cheapest, null);
    const e = res.results.flatMap((r) => entries(r, "cheapest_runner_up"));
    assert.equal(e.length, 1);
    assert.equal(e[0].context.evaluated, false);
  });
});

describe("18. above_new_price (part 5 §3)", () => {
  const ABOVE = (r: ListingResult) => {
    const e = entries(r, "above_new_price");
    assert.equal(e.length, 1); // exactly one entry on every listing that passed the gate
    return e[0];
  };

  it("100.0 -> triggered, excluded by above_new_price, rank null; stage_a_place kept; the rest still ranked contiguously", () => {
    assert.equal(PRICE_VS_NEW_CEILING_PCT, 100);
    assert.equal(ABOVE_NEW_PRICE_EFFECT, "excluded");
    const res = selectThree({ listings: [cand({ id: 1, price: 100000, new_price: 100000, history: 20 }), cand({ id: 2, price: 90000, new_price: 100000, history: 0 })] }, { crowningThreshold: 0 });
    const a = byId(res, 1);
    assert.deepEqual(ABOVE(a), {
      rule: "above_new_price",
      type: "correctness",
      value: 100,
      threshold: PRICE_VS_NEW_CEILING_PCT,
      triggered: true,
      effect: "excluded",
      context: { new_price: 100000, evaluated: true },
    });
    assert.equal(a.status, "excluded");
    assert.equal(a.excluded_by, "above_new_price");
    assert.equal(a.rank, null);
    assert.equal(a.stage_a_place, 1); // it was the best deal before the exclusion
    assert.deepEqual(a.categories, []);
    const b = byId(res, 2);
    assert.equal(ABOVE(b).value, 90);
    assert.equal(ABOVE(b).triggered, false);
    assert.equal(b.status, "shown");
    assert.equal(b.rank, 1);
    assert.deepEqual(shownRanks(res), [1]);
    assert.deepEqual(res.picks, { best_value: 2, peace_of_mind: 2, cheapest: 2 });
    assert.equal(res.rules_version, 8); // §0
  });

  it("99.9 -> recorded, not triggered, shown; 120.0 -> triggered", () => {
    const res = selectThree({ listings: [cand({ id: 1, price: 99900, new_price: 100000 }), cand({ id: 2, price: 120000, new_price: 100000 })] }, { crowningThreshold: 0 });
    const a = byId(res, 1);
    assert.equal(ABOVE(a).value, 99.9);
    assert.equal(ABOVE(a).triggered, false);
    assert.equal(ABOVE(a).effect, "none"); // §8.3: effect records what happened to this listing — untriggered -> none
    assert.equal(a.status, "shown");
    assert.equal(a.excluded_by, null);
    const b = byId(res, 2);
    assert.equal(ABOVE(b).value, 120);
    assert.equal(ABOVE(b).triggered, true);
    assert.equal(b.status, "excluded");
  });

  it("new_price null -> not evaluated (no_new_price), value null, not triggered, shown", () => {
    const res = selectThree({ listings: [cand({ id: 1, price: 500000, new_price: null })] }, { crowningThreshold: 0 });
    const a = byId(res, 1);
    assert.deepEqual(ABOVE(a), {
      rule: "above_new_price",
      type: "correctness",
      value: null,
      threshold: PRICE_VS_NEW_CEILING_PCT,
      triggered: false,
      effect: "none", // §8.3: not evaluated -> nothing happened -> none
      context: { evaluated: false, reason: "no_new_price" },
    });
    assert.equal(a.status, "shown");
    assert.equal(a.rank, 1);
    // the fixture default is null: the existing pools are unaffected by the rule
    assert.equal(cand({ id: 9 }).new_price, null);
  });

  it("with { above_new_price_effect: 'none' } the entry is recorded (triggered, effect none) and the listing stays in, wins even", () => {
    const res = selectThree(
      { listings: [cand({ id: 1, price: 100000, new_price: 100000, history: 20 }), cand({ id: 2, price: 90000, new_price: 100000, history: 0 })] },
      { crowningThreshold: 0, above_new_price_effect: "none" },
    );
    const a = byId(res, 1);
    assert.equal(ABOVE(a).value, 100);
    assert.equal(ABOVE(a).triggered, true);
    assert.equal(ABOVE(a).effect, "none");
    assert.equal(a.status, "shown");
    assert.equal(a.excluded_by, null);
    assert.equal(a.rank, 1);
    assert.deepEqual(res.picks, { best_value: 1, peace_of_mind: 1, cheapest: 2 });
  });

  it("an excluded listing's car is still shown through another listing under the ceiling (§4.5 unchanged): no duplicate entry on either", () => {
    const res = selectThree({
      listings: [
        cand({ id: 1, car: 7, price: 100000, new_price: 100000 }), // at the ceiling -> out
        cand({ id: 2, car: 7, price: 96000, new_price: 100000 }), // 96.0 -> the car's only surviving listing
        cand({ id: 3, car: 8, price: 97000, new_price: 100000 }),
      ],
    }, { crowningThreshold: 0 });
    const a = byId(res, 1);
    assert.equal(a.status, "excluded");
    assert.equal(a.excluded_by, "above_new_price");
    assert.equal(entries(a, "duplicate").length, 0);
    const rep = byId(res, 2);
    assert.equal(rep.status, "shown");
    assert.equal(rep.car_id, 7);
    assert.equal(entries(rep, "duplicate").length, 0); // a single surviving listing: no duplicate entry
    assert.deepEqual(shownRanks(res), [1, 2]);
    assert.equal(res.picks.cheapest, 2);
  });

  it("a listing excluded by below_threshold keeps that reason and still carries its above_new_price entry (both rules run on everyone)", () => {
    const res = selectThree({ listings: [cand({ id: 1, price: 40000, median: 100000, new_price: 30000 }), cand({ id: 2, price: 100000, median: 100000, new_price: 200000 })] }, { crowningThreshold: 0 });
    const a = byId(res, 1);
    assert.equal(a.excluded_by, "below_threshold"); // the first rule of the pass decides excluded_by
    assert.equal(ABOVE(a).value, 133.3);
    assert.equal(ABOVE(a).triggered, true);
    assert.equal(a.status, "excluded");
    assert.equal(byId(res, 2).rank, 1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Day 14 run B — rules v5 (BRIEF §5.10 a–g)
// ---------------------------------------------------------------------------------------------------------------

describe("19a. unverified_history: the rule (§0.1)", () => {
  it("history source 'typical' -> ineligible for all three, the record carries the value and the effect", () => {
    const res = selectThree({ listings: [cand({ id: 1, price: 90000, history: 4, history_source: "typical" })] }, { crowningThreshold: 0 });
    const r = byId(res, 1);
    assert.deepEqual(r.eligibility, elig(false, false, false, ["unverified_history"], [true, true, true]));
    assert.deepEqual(unv(r), {
      rule: "unverified_history",
      type: "eligibility",
      value: "typical",
      threshold: null,
      triggered: true,
      effect: UNVERIFIED_HISTORY_EFFECT,
      // §0.2: it is the counterfactual winner of all three categories, and all three came out empty instead
      context: { evaluated: true, history_row_status: "scored", blocked_first: ["best_value", "peace_of_mind", "cheapest"] },
    });
    assert.equal(UNVERIFIED_HISTORY_EFFECT, "ineligible");
    // §0.1: it stays in the results and keeps its rank; it just wins nothing.
    assert.equal(r.status, "shown");
    assert.equal(r.rank, 1);
    assert.deepEqual(r.categories, []);
    assert.deepEqual(res.picks, { best_value: null, peace_of_mind: null, cheapest: null });
    assert.deepEqual(res.missing, { best_value: "no_candidate", peace_of_mind: "no_candidate", cheapest: "no_candidate" });
  });

  it("history source 'mot' -> eligible; the record is untriggered and its effect is none", () => {
    const res = selectThree({ listings: [cand({ id: 1, price: 90000, history: 4 })] }, { crowningThreshold: 0 });
    const r = byId(res, 1);
    assert.deepEqual(r.eligibility, elig(true, true, true, []));
    assert.equal(unv(r).value, "mot");
    assert.equal(unv(r).triggered, false);
    assert.equal(unv(r).effect, "none");
    assert.deepEqual(res.picks, { best_value: 1, peace_of_mind: 1, cheapest: 1 });
  });
});

describe("19b. blocked_first (§0.2)", () => {
  // Four cars, deals 14 / 11 / 8 / 5; car 1 is the one with no registry history.
  const pool = (unverifiedId: number): CandidateListing[] =>
    [
      cand({ id: 1, car: 1, price: 90000, history: 4 }), // deal 14
      cand({ id: 2, car: 2, price: 93000, history: 4 }), // deal 11
      cand({ id: 3, car: 3, price: 96000, history: 4 }), // deal 8
      cand({ id: 4, car: 4, price: 99000, history: 4 }), // deal 5
    ].map((l) => (l.listing_id === unverifiedId ? cand({ id: l.listing_id, car: l.car_id, price: l.price, history: 4, history_source: "typical" }) : l));

  it("unverified at the top of the deal order -> the winner is the next eligible, at rank 2, and the unverified carries blocked_first", () => {
    const res = selectThree({ listings: pool(1) }, { crowningThreshold: 0 });
    assert.equal(res.picks.best_value, 2);
    assert.equal(byId(res, 1).rank, 1); // it keeps its rank
    assert.equal(byId(res, 2).rank, 2); // the winner sits at rank 2
    // it tops all three orders, so it blocks all three
    assert.deepEqual(unv(byId(res, 1)).context.blocked_first, ["best_value", "peace_of_mind", "cheapest"]);
    assert.equal(unv(byId(res, 2)).context.blocked_first, undefined);
    // §0.5's claim still passes: the listing above the winner is recorded ineligible, with its reason
    const ft = finishTest(res);
    assert.equal(ft.pass, true, JSON.stringify(ft.checks));
  });

  it("unverified below the winner -> no blocked_first anywhere", () => {
    const res = selectThree({ listings: [...pool(4)] }, { crowningThreshold: 0 });
    assert.equal(res.picks.best_value, 1);
    assert.equal(byId(res, 4).rank, 4);
    assert.equal(unv(byId(res, 4)).triggered, true);
    for (const r of res.results) assert.equal(unv(r).context.blocked_first, undefined);
    assert.equal(finishTest(res).pass, true);
  });
});

describe("19c. the gate bars all three and the runner-up (§0.4)", () => {
  it("a thin cell at the top of the peace_of_mind order is not picked, and the reason is recorded", () => {
    const res = selectThree({ listings: [cand({ id: 1, car: 1, thin: true, history: 20 }), cand({ id: 2, car: 2, price: 95000, history: 3 })] }, { crowningThreshold: 0 });
    assert.equal(byId(res, 1).eligibility.peace_of_mind, false);
    assert.deepEqual(byId(res, 1).eligibility.reasons, ["thin_cell"]);
    assert.equal(res.picks.peace_of_mind, 2); // although reality 20 > 3
    assert.deepEqual(byId(res, 1).categories, []);
  });

  it("an all-thin pool -> three empty categories, each with a reason, and the finish test passes", () => {
    const res = selectThree({ listings: [cand({ id: 1, thin: true, history: 5 }), cand({ id: 2, thin: true, history: 9 })] }, { crowningThreshold: 0 });
    assert.deepEqual(res.picks, { best_value: null, peace_of_mind: null, cheapest: null });
    assert.deepEqual(res.missing, { best_value: "no_candidate", peace_of_mind: "no_candidate", cheapest: "no_candidate" });
    for (const r of res.results) assert.deepEqual(r.eligibility.reasons, ["thin_cell"]);
    const ft = finishTest(res);
    assert.equal(ft.pass, true, JSON.stringify(ft.checks)); // §0.4: empty WITH a reason is a correct outcome
    assert.equal(res.runner_ups.cheapest, null);
  });
});

describe("19d. cheapest with every candidate below the floor (§5.10d)", () => {
  it("empty, with the reason recorded on every listing and on the search result", () => {
    const res = selectThree({ listings: [cand({ id: 1, price: 90000, history: -6 }), cand({ id: 2, price: 95000, history: -9 })] }, { crowningThreshold: 0 });
    assert.equal(res.picks.cheapest, null);
    assert.equal(res.missing.cheapest, "no_candidate");
    for (const r of res.results) assert.ok(r.eligibility.reasons.includes("below_floor"));
    assert.ok(CONDITION_FLOOR === -5);
    assert.equal(finishTest(res).pass, true);
  });
});

describe("19e. the runner-up is filtered by full pick eligibility (§5.5, P1)", () => {
  // C = car 1 at 90,000, deal 10. The band at 5% ends at 94,500.
  const C = () => cand({ id: 1, car: 1, price: 90000, price_v: 10, history: 0 });

  it("an unverified listing inside the band with the gap is skipped; the next eligible one is taken", () => {
    const res = selectThree({
      listings: [C(), cand({ id: 2, car: 2, price: 93000, price_v: 10, history: 8, history_source: "typical" }), cand({ id: 3, car: 3, price: 94000, price_v: 10, history: 5 })],
    }, { crowningThreshold: 0 });
    assert.equal(res.picks.cheapest, 1);
    assert.equal(byId(res, 2).eligibility.cheapest, false); // unverified: never a candidate
    // rules v7 (§1.5): listing 3, the next eligible one, wins best_value and peace_of_mind — so it is no
    // candidate either, and the band is left with nobody outside the picks.
    assert.deepEqual(byId(res, 3).categories, ["best_value", "peace_of_mind"]);
    assert.equal(res.runner_ups.cheapest, null);
  });

  it("the only candidate in the band is unverified -> no runner-up at all", () => {
    const res = selectThree({ listings: [C(), cand({ id: 2, car: 2, price: 93000, price_v: 10, history: 8, history_source: "typical" })] }, { crowningThreshold: 0 });
    assert.equal(res.picks.cheapest, 1);
    assert.equal(res.runner_ups.cheapest, null);
    const e = res.results.flatMap((r) => entries(r, "cheapest_runner_up"));
    assert.equal(e.length, 1);
    assert.equal(e[0].context.reason, "no_candidate_in_band");
  });

  // rules v7 (§1.5): the case P1 recorded cannot occur any more — a category winner is no candidate at all.
  it("a category winner is NOT the runner-up: the band holds only the pick -> no runner-up", () => {
    const res = selectThree({ listings: [C(), cand({ id: 2, car: 2, price: 93000, price_v: 10, history: 8 })] }, { crowningThreshold: 0 });
    assert.equal(res.picks.best_value, 2);
    assert.equal(res.runner_ups.cheapest, null);
    const e = res.results.flatMap((r) => entries(r, "cheapest_runner_up"));
    assert.equal(e.length, 1);
    assert.equal(e[0].context.reason, "no_candidate_in_band");
  });
});

describe("19f. the no-deal tail (§0.3, as rules v8 §0b re-orders it: NO_DEAL_ORDER = history_desc)", () => {
  it("the tail comes after every ranked listing, the best registry reading first", () => {
    const res = selectThree({
      listings: [
        cand({ id: 1, price: 100000, history: 5 }), // deal 5 — the only ranked listing
        cand({ id: 2, median: null, price: 95000, history: 9, first_seen: "2026-08-05T00:00:00.000Z" }), // no deal, reading 9 — the best of the tail
        cand({ id: 3, median: null, price: 90000, history: 1, first_seen: "2026-08-04T00:00:00.000Z" }), // no deal, reading 1 — the worst, although the cheapest
        cand({ id: 5, median: null, price: 95000, history: 2, first_seen: "2026-08-02T00:00:00.000Z" }), // reading 2
        cand({ id: 4, median: null, price: 95000, history: 3, first_seen: "2026-08-02T00:00:00.000Z" }), // reading 3
      ],
    }, { crowningThreshold: 0 });
    // the reading decides outright: 9, 3, 2, 1 — price and first_seen_at never come into it here
    assert.deepEqual(
      res.results.filter((r) => r.status === "shown").map((r) => r.listing_id),
      [1, 2, 4, 5, 3],
    );
    assert.deepEqual(shownRanks(res), [1, 2, 3, 4, 5]);
    assert.equal(NO_DEAL_ORDER, "history_desc");
    assert.equal(byId(res, 1).rank, 1); // every ranked listing comes before every tail listing
    for (const id of [2, 3, 4, 5]) assert.equal(byId(res, id).rank !== null && (byId(res, id).rank as number) > 1, true);
  });
});

describe("19g. the finish test's claims (§0.5)", () => {
  const base = (): SelectionResult => selectThree({ listings: [cand({ id: 1, price: 90000, history: 4 })] }, { crowningThreshold: 0 });

  it("negative: an empty category without a recorded reason fails", () => {
    const res = base();
    res.picks.cheapest = null; // an empty category...
    delete res.missing.cheapest; // ...and nothing saying why
    const ft = finishTest(res);
    assert.equal(ft.pass, false);
    const claim = ft.checks.find((c) => c.claim.startsWith("every category is filled"));
    assert.equal(claim?.ok, false);
    assert.match(claim?.detail ?? "", /cheapest/);
  });

  it("negative: a winner that is not eligible for the category it won fails", () => {
    const res = base();
    res.results[0].eligibility.cheapest = false;
    const ft = finishTest(res);
    assert.equal(ft.pass, false);
    assert.equal(ft.checks.find((c) => c.claim.startsWith("every winner is eligible"))?.ok, false);
  });

  it("negative: a listing ranked above the winner with no recorded ineligibility fails", () => {
    const res = selectThree({ listings: [cand({ id: 1, car: 1, price: 90000, history: 4, history_source: "typical" }), cand({ id: 2, car: 2, price: 93000, history: 4 })] }, { crowningThreshold: 0 });
    assert.equal(finishTest(res).pass, true); // as selected: rank 1 is ineligible, with its reason
    // rules v8 (§0c): the claim reads the ineligibility off the row's reasons OR off one of INELIGIBLE_RULES' own
    // records, so BOTH have to disappear for the row above the winner to be unexplained.
    res.results[0].eligibility.reasons = [];
    res.results[0].trace = res.results[0].trace.map((t) => (t.effect === "ineligible" ? { ...t, effect: "none", triggered: false } : t));
    const ft = finishTest(res);
    assert.equal(ft.pass, false);
    assert.equal(ft.checks.find((c) => c.claim.startsWith("best_value winner"))?.ok, false);
  });

  it("positive: the synthetic finish pool passes all six claims", () => {
    const ft = finishTest(selectThree({ listings: finishPool() }, { crowningThreshold: 0 }));
    assert.equal(ft.pass, true, JSON.stringify(ft.checks));
    assert.deepEqual(
      ft.checks.map((c) => c.claim),
      [
        // §1.6 — the crowning gate's two claims, first, before the four of rules v5
        "the crowning gate is recorded on the rank-1 row, once, and its counts survive a recount",
        "nothing is crowned below the threshold: no pick, no runner-up, no pick-loop record",
        "every category is filled, or empty with a recorded reason",
        "every winner is eligible for the category it won",
        "best_value winner is the first eligible listing in the list order; every listing above it is recorded ineligible with a reason",
        "shown ranks contiguous 1..n",
      ],
    );
  });
});

describe("20. cancelled (Day 18, rules v6 §8)", () => {
  const CANCEL = "2026-09-10";
  const cancelledEntry = (r: ListingResult): RuleTrace => {
    const e = r.trace.filter((t) => t.rule === "cancelled");
    assert.equal(e.length, 1); // exactly one entry on every listing that passed the gate
    return e[0];
  };

  it("a cancelled invoice -> ineligible for all three, reason cancelled, the record carries the date and the effect", () => {
    const res = selectThree({ listings: [cand({ id: 1, price: 80000, cancelled: CANCEL }), cand({ id: 2, price: 95000, history: 2 })] }, { crowningThreshold: 0 });
    const r = byId(res, 1);
    assert.deepEqual(r.eligibility, elig(false, false, false, ["cancelled"], [false, false, false]));
    assert.deepEqual(cancelledEntry(r), {
      rule: "cancelled",
      type: "eligibility",
      value: CANCEL,
      threshold: null,
      triggered: true,
      effect: CANCELLED_EFFECT,
      context: { evaluated: true },
    });
    assert.equal(CANCELLED_EFFECT, "ineligible");
    // logged like unverified_history: on the other listing the record is there, untriggered, effect none
    assert.deepEqual(cancelledEntry(byId(res, 2)), { rule: "cancelled", type: "eligibility", value: null, threshold: null, triggered: false, effect: "none", context: { evaluated: true } });
    // the rules that read an invoice row are recorded as not evaluated, never thrown on
    assert.deepEqual(unv(r).context, { evaluated: false, reason: "cancelled" });
    assert.deepEqual(res.picks, { best_value: 2, peace_of_mind: 2, cheapest: 2 });
    assert.deepEqual(r.categories, []);
  });

  // rules v8 (§0b): a cancelled invoice has no history reading at all, so it goes AFTER every tail row that has
  // one — its price no longer buys it a place ahead of them.
  it("stays in the results, in the no-deal tail: after every ranked listing, and last among the tail for want of a reading", () => {
    const res = selectThree({
      listings: [
        cand({ id: 1, price: 70000, cancelled: CANCEL }), // the cheapest listing of all, and cancelled
        cand({ id: 2, price: 100000, history: 5 }), // ranked
        cand({ id: 3, median: null, price: 90000, history: 1 }), // no deal, but a registry reading of 1
      ],
    }, { crowningThreshold: 0 });
    const r = byId(res, 1);
    assert.equal(r.status, "shown");
    assert.deepEqual(res.results.filter((x) => x.status === "shown").map((x) => x.listing_id), [2, 3, 1]);
    assert.deepEqual(shownRanks(res), [1, 2, 3]);
  });

  it("cannot be the cheapest runner-up, even inside the band with the biggest gap", () => {
    const res = selectThree({
      listings: [cand({ id: 1, car: 1, price: 90000, price_v: 10, history: 0 }), cand({ id: 2, car: 2, price: 93000, cancelled: CANCEL })],
    }, { crowningThreshold: 0 });
    assert.equal(res.picks.cheapest, 1);
    assert.equal(res.runner_ups.cheapest, null);
  });

  it("an all-cancelled pool -> three empty categories with a reason; the finish test passes", () => {
    const res = selectThree({ listings: [cand({ id: 1, cancelled: CANCEL }), cand({ id: 2, cancelled: CANCEL })] }, { crowningThreshold: 0 });
    assert.deepEqual(res.picks, { best_value: null, peace_of_mind: null, cheapest: null });
    for (const r of res.results) assert.deepEqual(r.eligibility.reasons, ["cancelled"]);
    const ft = finishTest(res);
    assert.equal(ft.pass, true, JSON.stringify(ft.checks));
  });

  it("a cancelled listing in the synthetic finish pool leaves the finish test passing", () => {
    const ft = finishTest(selectThree({ listings: [...finishPool(), cand({ id: 999, car: 999, price: 50000, cancelled: CANCEL })] }, { crowningThreshold: 0 }));
    assert.equal(ft.pass, true, JSON.stringify(ft.checks));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Days 22–23 — rules v8 (BRIEF §0a the floor, §0b the tail). The gate is off in every case here: these are cases
// of the eligibility rules and of the order, not of the crowning gate (§1.8) — the gate's own cases live next door
// in crowning.test.ts.
// ---------------------------------------------------------------------------------------------------------------

describe("21a. condition_floor: the rule and its record (§0a)", () => {
  it("cvt -5.1 -> eligible for NOTHING, one below_floor reason, the record triggered and evaluated", () => {
    const res = selectThree({ listings: [cand({ id: 1, history: -5.1 })] }, { crowningThreshold: 0 });
    const r = byId(res, 1);
    assert.equal(r.eligibility.best_value, false);
    assert.equal(r.eligibility.peace_of_mind, false);
    assert.equal(r.eligibility.cheapest, false);
    assert.deepEqual(r.eligibility.reasons, ["below_floor"]); // pushed once, and nothing else is claimed about it
    assert.deepEqual(floorEntry(r), {
      rule: "condition_floor",
      type: "eligibility",
      value: -5.1,
      threshold: CONDITION_FLOOR,
      triggered: true,
      effect: CONDITION_FLOOR_EFFECT,
      // §0a: it is the counterfactual winner of all three categories — it is the only car in the pool — and all
      // three came out empty instead, exactly as 19a records for the other barring rule.
      context: { evaluated: true, blocked_first: ["best_value", "peace_of_mind", "cheapest"] },
    });
    // §0a: it stays in the results and keeps its rank — like unverified_history, the rule moves no row
    assert.equal(r.status, "shown");
    assert.equal(r.rank, 1);
    assert.deepEqual(r.categories, []);
  });

  it("cvt exactly -5 -> eligible for all three, the record untriggered with effect none (strictly below)", () => {
    const res = selectThree({ listings: [cand({ id: 1, history: -5 })] }, { crowningThreshold: 0 });
    const r = byId(res, 1);
    assert.deepEqual(r.eligibility, elig(true, true, true, []));
    assert.equal(floorEntry(r).value, -5);
    assert.equal(floorEntry(r).triggered, false);
    assert.equal(floorEntry(r).effect, "none");
    assert.deepEqual(res.picks, { best_value: 1, peace_of_mind: 1, cheapest: 1 });
  });

  it("a null cvt is NOT below the floor: the other two verdicts stand, and the record is not evaluated", () => {
    const l = cand({ id: 1, history: 2 });
    l.breakdown.condition_vs_typical = null;
    const r = byId(selectThree({ listings: [l] }, { crowningThreshold: 0 }), 1);
    assert.equal(r.eligibility.best_value, true); // exactly as before version 8
    assert.equal(r.eligibility.peace_of_mind, true);
    assert.equal(r.eligibility.cheapest, false);
    assert.deepEqual(r.eligibility.reasons, ["no_condition_vs_typical"]);
    assert.equal(floorEntry(r).value, null);
    assert.equal(floorEntry(r).triggered, false);
    assert.equal(floorEntry(r).effect, "none");
    assert.deepEqual(floorEntry(r).context, { evaluated: false });
  });

  it("a cancelled row and a thin-cell row carry the record, not evaluated — the trace stays complete", () => {
    const res = selectThree({ listings: [cand({ id: 1, thin: true, history: 5 }), cand({ id: 2, price: 80000, cancelled: "2026-09-10" })] }, { crowningThreshold: 0 });
    for (const id of [1, 2]) {
      const e = floorEntry(byId(res, id));
      assert.equal(e.value, null, `listing ${id}`);
      assert.equal(e.triggered, false, `listing ${id}`);
      assert.equal(e.effect, "none", `listing ${id}`);
      assert.deepEqual(e.context, { evaluated: false }, `listing ${id}`);
    }
    // and neither row's reasons gained below_floor: the floor said nothing about either
    assert.deepEqual(byId(res, 1).eligibility.reasons, ["thin_cell"]);
    assert.deepEqual(byId(res, 2).eligibility.reasons, ["cancelled"]);
  });
});

describe("21b. condition_floor: blocked_first, one counterfactual per barring rule (§0a)", () => {
  // car 1 is the best deal AND the cheapest, and it is below the floor; car 2 is the next eligible, at rank 2.
  const soleBarred = () => [
    cand({ id: 1, car: 1, price: 80000, history: -6 }), // price_v +20, cvt -6, deal 14, reality -6
    cand({ id: 2, car: 2, price: 95000, history: 4 }), // price_v +5, cvt 4, deal 9, reality 4
  ];

  it("the floor alone barred it -> its condition_floor record names every category it led, its unverified_history record none", () => {
    const res = selectThree({ listings: soleBarred() }, { crowningThreshold: 0 });
    assert.deepEqual(res.picks, { best_value: 2, peace_of_mind: 2, cheapest: 2 });
    const loser = byId(res, 1);
    assert.equal(loser.rank, 1); // it keeps its rank
    assert.equal(byId(res, 2).rank, 2); // the winner sits at rank 2
    // it topped the deal order and the price order; car 2 topped the reality order, so peace_of_mind is not there
    assert.deepEqual(floorEntry(loser).context.blocked_first, ["best_value", "cheapest"]);
    assert.equal(unv(loser).context.blocked_first, undefined);
    assert.equal(floorEntry(byId(res, 2)).context.blocked_first, undefined);
    // §0.5's claim still passes: the listing above the winner carries a recorded ineligibility with its reason
    const ft = finishTest(res);
    assert.equal(ft.pass, true, JSON.stringify(ft.checks));
  });

  it("unverified AND below the floor at the top -> NEITHER record carries blocked_first", () => {
    const res = selectThree(
      { listings: [cand({ id: 1, car: 1, price: 80000, history: -6, history_source: "typical" }), cand({ id: 2, car: 2, price: 95000, history: 4 })] },
      { crowningThreshold: 0 },
    );
    assert.deepEqual(res.picks, { best_value: 2, peace_of_mind: 2, cheapest: 2 });
    const loser = byId(res, 1);
    assert.equal(unv(loser).triggered, true);
    assert.equal(floorEntry(loser).triggered, true);
    // it is first in neither counterfactual set, so no rule can claim it alone kept the car out
    assert.equal(unv(loser).context.blocked_first, undefined);
    assert.equal(floorEntry(loser).context.blocked_first, undefined);
    for (const r of res.results) {
      assert.equal(unv(r).context.blocked_first, undefined);
      assert.equal(floorEntry(r).context.blocked_first, undefined);
    }
    assert.equal(finishTest(res).pass, true);
  });

  it("under the crowning gate nothing is picked, so no blocked_first is written at all", () => {
    const res = selectThree({ listings: soleBarred() }, { crowningThreshold: 99 });
    assert.equal(res.crowning.crowned, false);
    for (const r of res.results) {
      assert.equal(unv(r).context.blocked_first, undefined);
      assert.equal(floorEntry(r).context.blocked_first, undefined);
    }
  });
});

describe("21c. the no-deal tail's order (§0b)", () => {
  it("readings first, best first; then the rows without one, by price", () => {
    const res = selectThree({
      listings: [
        cand({ id: 1, median: null, price: 100000, history: 0 }), // reading 0 — the best
        cand({ id: 2, median: null, price: 100000, history: -4 }), // reading -4
        cand({ id: 3, median: null, price: 100000, history: -12 }), // reading -12 — the worst
        cand({ id: 4, median: null, price: 91000, history: 5, history_source: "typical" }), // no reading: the cell's typical
        cand({ id: 5, price: 92000, cancelled: "2026-09-10" }), // no reading: a cancelled invoice has no rows
      ],
    }, { crowningThreshold: 0 });
    assert.deepEqual(
      res.results.filter((r) => r.status === "shown").map((r) => r.listing_id),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(shownRanks(res), [1, 2, 3, 4, 5]);
  });

  it("two equal readings -> the cheaper first, then the earlier first_seen_at, then the lower listing_id", () => {
    const res = selectThree({
      listings: [
        cand({ id: 1, median: null, price: 95000, history: 3, first_seen: "2026-08-05T00:00:00.000Z" }),
        cand({ id: 2, median: null, price: 90000, history: 3 }), // the cheapest of the four
        cand({ id: 3, median: null, price: 95000, history: 3, first_seen: "2026-08-02T00:00:00.000Z" }),
        cand({ id: 4, median: null, price: 95000, history: 3, first_seen: "2026-08-02T00:00:00.000Z" }), // ties 3 on both -> higher id last
      ],
    }, { crowningThreshold: 0 });
    assert.deepEqual(
      res.results.filter((r) => r.status === "shown").map((r) => r.listing_id),
      [2, 3, 4, 1],
    );
  });
});
