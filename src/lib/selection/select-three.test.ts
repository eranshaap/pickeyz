// BRIEF Day 12 part 2, §7 tests 1–11 and 13–15, plus §11.2 test 16 (best_value is rank 1): selectThree() end to end on hand-built inputs.
// Part 3 (rules v2): tests 8, 10, 14, 15 updated for the double-win and floor decisions; test 11 pins double_winner_effect
// 'recategorized' so that the too_similar examination it tests still happens; new: 2c (peace_of_mind floor), 17 (cheapest_runner_up).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectThree } from "./index";
import {
  BELOW_THRESHOLD_FLOOR_PCT,
  CHEAPEST_CONDITION_FLOOR,
  PEACE_OF_MIND_DEAL_FLOOR,
  RUNNER_UP_DEAL_GAP,
  RUNNER_UP_PRICE_BAND_PCT,
  SIMILARITY_THRESHOLD,
} from "./constants";
import { cand } from "./fixtures";
import type { CandidateListing, ListingResult, RuleTrace, SelectionResult } from "./types";

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
    const res = selectThree({ listings: [cand({ id: 1, sold: "strong" }), cand({ id: 2 })] });
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
    const res = selectThree({ listings: [cand({ id: 1, sold: "medium" })] });
    const r = byId(res, 1);
    assert.equal(r.status, "shown");
    assert.equal(r.verify_availability, true);
    assert.equal(r.rank, 1);
    assert.equal(byId(selectThree({ listings: [cand({ id: 2 })] }), 2).verify_availability, false);
  });
});

describe("2. eligibility (§2)", () => {
  it("deal_score null -> not best_value, and not peace_of_mind either (part 3 §2c needs a deal_score); one no_deal_score reason", () => {
    const l = cand({ id: 1, history: 2 });
    l.breakdown.deal_score = null;
    const e = byId(selectThree({ listings: [l] }), 1).eligibility;
    assert.equal(e.best_value, false);
    assert.equal(e.peace_of_mind, false);
    assert.equal(e.cheapest, true);
    assert.deepEqual(e.reasons, ["no_deal_score"]);
  });

  it("condition_by_reality null -> not peace_of_mind", () => {
    const l = cand({ id: 1, history: 2 });
    l.breakdown.condition_by_reality = null;
    const e = byId(selectThree({ listings: [l] }), 1).eligibility;
    assert.equal(e.best_value, true);
    assert.equal(e.peace_of_mind, false);
    assert.deepEqual(e.reasons, ["no_condition_by_reality"]);
  });

  it("condition_vs_typical null -> not cheapest", () => {
    const l = cand({ id: 1, history: 2 });
    l.breakdown.condition_vs_typical = null;
    const e = byId(selectThree({ listings: [l] }), 1).eligibility;
    assert.equal(e.cheapest, false);
    assert.deepEqual(e.reasons, ["no_condition_vs_typical"]);
  });

  it("history unavailable -> none of the three, all three reasons", () => {
    const e = byId(selectThree({ listings: [cand({ id: 1, history: null })] }), 1).eligibility;
    assert.deepEqual(e, { best_value: false, peace_of_mind: false, cheapest: false, reasons: ["no_deal_score", "no_condition_by_reality", "no_condition_vs_typical"] });
  });

  it("thin cell -> none of the three, reason thin_cell, even with a non-null condition_by_reality", () => {
    const l = cand({ id: 1, thin: true, history: 5 });
    assert.equal(l.breakdown.condition_by_reality, 5);
    const res = selectThree({ listings: [l] });
    const r = byId(res, 1);
    assert.deepEqual(r.eligibility, { best_value: false, peace_of_mind: false, cheapest: false, reasons: ["thin_cell"] });
    assert.equal(r.status, "shown"); // still ranked, just never picked
    assert.deepEqual(res.picks, { best_value: null, peace_of_mind: null, cheapest: null });
  });
});

describe("2c. peace_of_mind deal floor (part 3 §2c)", () => {
  it("the best reality condition has deal_score -12 -> not eligible (overpriced), the next best condition wins; exactly -10 is eligible", () => {
    assert.equal(PEACE_OF_MIND_DEAL_FLOOR, -10);
    const res = selectThree({
      listings: [
        cand({ id: 1, price: 120000, history: 8 }), // price_v -20, cvt 8 -> deal -12; reality 8: the best condition, overpriced
        cand({ id: 2, price: 115000, history: 5 }), // price_v -15, cvt 5 -> deal -10 exactly; reality 5
        cand({ id: 3, price: 100000, history: 2 }), // deal 2, reality 2
      ],
    });
    const a = byId(res, 1).eligibility;
    assert.equal(a.peace_of_mind, false);
    assert.deepEqual(a.reasons, ["overpriced"]);
    assert.equal(a.best_value, true); // a deal_score of -12 is still a deal_score
    assert.equal(a.cheapest, true);
    const b = byId(res, 2).eligibility;
    assert.equal(b.peace_of_mind, true);
    assert.deepEqual(b.reasons, []);
    assert.deepEqual(res.picks, { best_value: 3, peace_of_mind: 2, cheapest: 3 });
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
    const res = selectThree({ listings });
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
    const res = selectThree({ listings });
    assert.deepEqual(res.results.map((r) => r.listing_id), [4, 1, 2, 3]);
  });
});

describe("16. invariant (§11.2): the best_value pick is rank 1 among shown, always", () => {
  function bestValueIsRankOne(res: SelectionResult): void {
    const id = res.picks.best_value;
    if (id === null) {
      assert.equal(res.missing.best_value, "no_candidate");
      return;
    }
    const r = byId(res, id);
    assert.equal(r.rank, 1);
    assert.equal(res.results[0].listing_id, id);
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
    ];
    for (const listings of pools) bestValueIsRankOne(selectThree({ listings }));
    for (const listings of pools) bestValueIsRankOne(selectThree({ listings }, { too_similar_effect: "excluded" }));
  });

  it("no deal_score anywhere -> best_value null and rank 1 is still defined", () => {
    const res = selectThree({ listings: [cand({ id: 1, median: null, history: 3 }), cand({ id: 2, median: null, history: 5 })] });
    bestValueIsRankOne(res);
    assert.equal(byId(res, 2).rank, 1);
  });
});

describe("4. below_threshold (§4.3)", () => {
  it("median 100,000: 49,900 -> 49.9, triggered, excluded; 50,000 -> 50.0, not triggered; median null -> not evaluated", () => {
    const res = selectThree({
      listings: [cand({ id: 1, price: 49900, median: 100000 }), cand({ id: 2, price: 50000, median: 100000 }), cand({ id: 3, median: null })],
    });
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
    });
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
    });
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
    });
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
    const res = selectThree({ listings });
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

  it("the best deal is also the best reality condition -> wins both; the entry is recorded with effect none", () => {
    const res = selectThree({ listings: pool() });
    assert.deepEqual(res.picks, { best_value: 1, peace_of_mind: 1, cheapest: 2 });
    assert.equal(res.picks.best_value, res.picks.peace_of_mind);
    const w = byId(res, 1);
    assert.deepEqual(w.categories, ["best_value", "peace_of_mind"]);
    const dw = entries(w, "double_winner");
    assert.equal(dw.length, 1); // considered again for peace_of_mind only: not eligible for cheapest
    assert.deepEqual(dw[0], {
      rule: "double_winner",
      type: "portfolio",
      value: null,
      threshold: null,
      triggered: true,
      effect: "none",
      context: { won: ["best_value"], considered_for: "peace_of_mind", place_in_category: 1 },
    });
    assert.equal(entries(w, "too_similar").length, 0); // compared against itself as self: no distance recorded
    assert.deepEqual(byId(res, 2).categories, ["cheapest"]);
    // car 2 was examined for cheapest against both picks of car 1 (one listing, two categories)
    assert.deepEqual(
      entries(byId(res, 2), "too_similar").map((t) => t.context.vs_category),
      ["best_value", "peace_of_mind"],
    );
  });

  it("with { double_winner_effect: 'recategorized' } the next candidate wins peace_of_mind", () => {
    const res = selectThree({ listings: pool() }, { double_winner_effect: "recategorized" });
    assert.deepEqual(res.picks, { best_value: 1, peace_of_mind: 2, cheapest: 3 });
    const w = byId(res, 1);
    assert.deepEqual(w.categories, ["best_value"]);
    const dw = entries(w, "double_winner");
    assert.equal(dw.length, 1);
    assert.equal(dw[0].effect, "recategorized");
    assert.deepEqual(dw[0].context, { won: ["best_value"], considered_for: "peace_of_mind", place_in_category: 1 });
    assert.deepEqual(entries(byId(res, 2), "double_winner")[0].context, { won: ["peace_of_mind"], considered_for: "cheapest", place_in_category: 1 });
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
    const res = selectThree({ listings: [zeroKm, priv] });
    assert.equal(res.picks.peace_of_mind, 1);
    assert.equal(res.picks.best_value, 2);
  });
});

describe("10. cheapest (§2, §11.3, part 3 §2a)", () => {
  it("the cheapest car has condition_vs_typical -6 -> not eligible (below_floor); a car at exactly -5 is, and wins as the cheapest eligible", () => {
    assert.equal(CHEAPEST_CONDITION_FLOOR, -5);
    const res = selectThree({
      listings: [
        cand({ id: 1, price: 80000, history: -6 }), // cvt -6, deal 14, reality -6
        cand({ id: 2, price: 90000, history: -5 }), // cvt -5 exactly, deal 5, reality -5
        cand({ id: 3, price: 100000, history: 6 }), // cvt +6, deal 6, reality 6
      ],
    });
    assert.deepEqual(res.picks, { best_value: 1, peace_of_mind: 3, cheapest: 2 });
    const e = byId(res, 1).eligibility;
    assert.equal(e.cheapest, false);
    assert.deepEqual(e.reasons, ["below_floor"]);
    assert.equal(e.best_value, true);
    assert.equal(e.peace_of_mind, true);
    assert.equal(byId(res, 2).eligibility.cheapest, true);
    assert.deepEqual(byId(res, 2).eligibility.reasons, []);
    // the candidates are exactly the eligible ones: car 1 was never examined for cheapest
    assert.equal(entries(byId(res, 1), "double_winner").filter((t) => t.context.considered_for === "cheapest").length, 0);
  });

  it("condition_vs_typical exactly 0 -> eligible for cheapest; alone in the pool it wins all three", () => {
    const res = selectThree({ listings: [cand({ id: 1, price: 100000, history: 0 })] });
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
    const res = selectThree({ listings: [P(), Q(), R()] }, RECAT);
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

  it("with { too_similar_effect: 'excluded' } the same input skips it and the next candidate wins", () => {
    const res = selectThree({ listings: [P(), Q(), R()] }, { ...RECAT, too_similar_effect: "excluded" });
    assert.equal(res.picks.best_value, 1);
    assert.equal(res.picks.peace_of_mind, 3);
    const [tq] = entries(byId(res, 2), "too_similar");
    assert.equal(tq.value, 3.13);
    assert.equal(tq.triggered, true);
    assert.equal(tq.effect, "excluded");
    const [tr] = entries(byId(res, 3), "too_similar");
    assert.equal(tr.value, 8.95);
    assert.equal(tr.triggered, false);
    assert.deepEqual(byId(res, 3).categories, ["peace_of_mind"]);
  });

  it("cross-cell pair -> value null, triggered false, same_cell false", () => {
    const q = Q();
    q.comparison_group = "H";
    const res = selectThree({ listings: [P(), q, R()] }, { ...RECAT, too_similar_effect: "excluded" });
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
    const base = selectThree({ listings: finishPool() });
    const reversed = selectThree({ listings: finishPool().reverse() });
    const rotated = (() => {
      const p = finishPool();
      return selectThree({ listings: [...p.slice(4), ...p.slice(0, 4)] });
    })();
    const sorted = (r: SelectionResult) => [...r.results].sort((a, b) => a.listing_id - b.listing_id);
    for (const other of [reversed, rotated]) {
      assert.deepEqual(other.picks, base.picks);
      assert.deepEqual(other.missing, base.missing);
      assert.deepEqual(sorted(other), sorted(base));
    }
  });
});

describe("14. finish test, synthetic (part 3 §3: a double win is reported, not a failure)", () => {
  it("three picks, the cheapest is also the best deal (two distinct cars), ranks contiguous, rank 1 is best_value, invisible and thin never picked", () => {
    const res = selectThree({ listings: finishPool() });
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
  it("no car with condition_vs_typical >= -5 -> cheapest null, no_candidate, the other two picks unaffected", () => {
    const res = selectThree({
      listings: [cand({ id: 1, price: 90000, history: -6 }), cand({ id: 2, price: 100000, history: -7 }), cand({ id: 3, price: 95000, history: -8 })],
    });
    assert.equal(res.picks.cheapest, null);
    assert.deepEqual(res.missing, { cheapest: "no_candidate" });
    assert.equal(res.picks.best_value, 1); // deal 4
    assert.equal(res.picks.peace_of_mind, 1); // reality -6 is the best; the car wins both (part 3 §1)
    assert.equal(entries(byId(res, 1), "double_winner").length, 1);
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
    });
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

  it("(b) gap 1.4 -> recorded, not triggered", () => {
    const res = selectThree({ listings: [C(), ru(2, 93000, 4.4)] }); // deal 11.4
    assert.equal(res.picks.cheapest, 1);
    const e = ruEntry(res);
    assert.equal(e.value, 1.4);
    assert.equal(e.triggered, false);
    assert.deepEqual(res.runner_ups.cheapest, { listing_id: 2, gap: 1.4, price_over_pct: 3.3, triggered: false });
  });

  it("(c) the only pricier eligible car is 6% above C -> evaluated false, no_candidate_in_band, runner_ups.cheapest null", () => {
    const res = selectThree({ listings: [C(), ru(2, 95400, 5)] }); // 6.0% over
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
    const res = selectThree({ listings: [cand({ id: 1, price: 90000, history: -6 }), cand({ id: 2, price: 93000, history: -7 })] });
    assert.equal(res.picks.cheapest, null);
    assert.equal(res.runner_ups.cheapest, null);
    assert.equal(res.results.flatMap((r) => entries(r, "cheapest_runner_up")).length, 0);
  });

  it("(e) two candidates in the band -> the higher deal_score; equal -> the lower price", () => {
    const higher = selectThree({ listings: [C(), ru(2, 93000, 5), ru(3, 94000, 7)] }); // deals 12 and 13
    assert.equal(higher.picks.cheapest, 1);
    assert.deepEqual(higher.runner_ups.cheapest, { listing_id: 3, gap: 3, price_over_pct: 4.4, triggered: true });
    const tie = selectThree({ listings: [C(), ru(2, 93000, 5), ru(3, 94000, 6)] }); // deals 12 and 12
    assert.deepEqual(tie.runner_ups.cheapest, { listing_id: 2, gap: 2, price_over_pct: 3.3, triggered: true });
    assert.equal(ruEntry(tie).context.runner_up, 2);
  });

  it("(f) the runner-up may be the best_value / peace_of_mind pick -> recorded as is", () => {
    const res = selectThree({ listings: [C(), ru(2, 93000, 8)] }); // deal 15, reality 8: wins both other categories
    assert.deepEqual(res.picks, { best_value: 2, peace_of_mind: 2, cheapest: 1 });
    assert.deepEqual(res.runner_ups.cheapest, { listing_id: 2, gap: 5, price_over_pct: 3.3, triggered: true });
    assert.equal(res.runner_ups.cheapest?.listing_id, res.picks.best_value);
  });

  it("C's own car is never its runner-up: a second, pricier listing of C's car (merged into C) is not a candidate", () => {
    const res = selectThree({ listings: [C(), cand({ id: 5, car: 1, price: 92000, history: 9 }), ru(2, 93000, 5)] });
    assert.equal(byId(res, 5).status, "merged");
    assert.equal(res.picks.cheapest, 1);
    assert.equal(res.runner_ups.cheapest?.listing_id, 2);
  });
});
