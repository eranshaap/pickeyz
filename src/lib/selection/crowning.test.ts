// BRIEF Days 20–21, Run 2 §1.9 — the crowning gate (rules v7): the eligible-to-win predicate, the gate, its
// record, the finish test's two new claims, and the runner-up rule that no longer names a pick.
//
// The real constant CROWNING_THRESHOLD is used unless a case says otherwise; §1.8's `crowningThreshold` option
// appears only where the case is about the picking rules and not about the gate (the runner-up cases).
//
// The fixture arithmetic (fixtures.ts): with median 100,000, km 0 and typical 0 —
//   price_advantage = -100 * (price - 100,000) / 100,000      deal_score = price_advantage + history
//   condition_by_reality = reality (= history)                condition_vs_typical = history
// so `car(i)` below (price 90,000 + 100i, history 0) has deal 10 - 0.1i: a distinct, descending deal per id,
// which makes rank = id and every row eligible to win (registry history, cheapest floor cleared).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CROWNING_THRESHOLD, RULES_VERSION, finishTest, selectThree } from "./index";
import { cand, type Spec } from "./fixtures";
import type { CandidateListing, ListingResult, RuleTrace, SelectionResult } from "./types";

const byId = (res: SelectionResult, id: number): ListingResult => {
  const r = res.results.find((x) => x.listing_id === id);
  assert.ok(r !== undefined, `no result for listing ${id}`);
  return r;
};

const crowningRecords = (res: SelectionResult): { listing_id: number; entry: RuleTrace }[] =>
  res.results.flatMap((r) => r.trace.filter((t) => t.rule === "crowning_threshold").map((entry) => ({ listing_id: r.listing_id, entry })));

const theRecord = (res: SelectionResult): RuleTrace => {
  const found = crowningRecords(res);
  assert.equal(found.length, 1, `expected one crowning_threshold record, found ${found.length}`);
  return found[0].entry;
};

const shownRanks = (res: SelectionResult): [number, number][] =>
  res.results
    .filter((r) => r.status === "shown")
    .map((r) => [r.listing_id, r.rank as number] as [number, number])
    .sort((a, b) => a[1] - b[1]);

/** One eligible-to-win car: a distinct deal score, a registry history row, above the cheapest floor. */
const car = (i: number, over: Partial<Spec> = {}): CandidateListing => cand({ id: i, car: i, price: 90000 + i * 100, history: 0, ...over });

/** `n` eligible-to-win cars, ids 1..n, rank = id. */
const cars = (n: number): CandidateListing[] => Array.from({ length: n }, (_, k) => car(k + 1));

describe("crowning §1.9(1) — what `eligible` counts", () => {
  // one of each kind the predicate must separate, all in one pool
  const pool = [
    car(1), //                                     scored, registry history  -> eligible
    car(2, { history_source: "typical" }), //       scored, no registry row   -> NOT eligible, but has a comparison
    car(3, { thin: true }), //                     thin cell, no deal score  -> neither
    car(4, { cancelled: "2026-09-10" }), //         cancelled, no deal score  -> neither
    car(5), //                                     scored, registry history  -> eligible
    car(6, { car: 5 }), //                          a SECOND ad of car 5      -> merged away; one car, one row
  ];
  const res = selectThree({ listings: pool });

  it("counts cars, not ads: a scored registry row yes; unverified, thin-cell, cancelled and a merged duplicate no", () => {
    assert.equal(byId(res, 6).status, "merged"); // the dearer ad of car 5
    assert.equal(byId(res, 3).rank !== null, true); // a thin cell is shown, in the tail
    assert.equal(byId(res, 4).rank !== null, true); // a cancelled car is shown, in the tail
    // rules v8 (§0c): three counts. Nobody here is below the floor, so `eligible` equals `verified`.
    assert.deepEqual(res.crowning, { eligible: 2, verified: 2, with_comparison: 3, threshold: CROWNING_THRESHOLD, crowned: false });
  });

  it("the unverified row is barred by its own rule's verdict, not by a second definition of verified", () => {
    const unv = byId(res, 2).trace.find((t) => t.rule === "unverified_history");
    assert.ok(unv !== undefined);
    assert.equal(unv.effect, "ineligible");
  });
});

describe("crowning §1.9(2) — 7 eligible: the gate triggers and moves nothing", () => {
  const pool = () => cars(7);
  const res = selectThree({ listings: pool() });
  const ungated = selectThree({ listings: pool() }, { crowningThreshold: 0 });

  it("triggered, no pick in any category, and the reason on all three", () => {
    assert.equal(res.crowning.crowned, false);
    assert.deepEqual(res.picks, { best_value: null, peace_of_mind: null, cheapest: null });
    assert.deepEqual(res.missing, {
      best_value: "below_crowning_threshold",
      peace_of_mind: "below_crowning_threshold",
      cheapest: "below_crowning_threshold",
    });
  });

  it("no runner-up, and none of the tracking rules that need a pick", () => {
    assert.equal(res.runner_ups.cheapest, null);
    for (const rule of ["cheapest_runner_up", "double_winner", "too_similar"] as const) {
      assert.equal(res.results.flatMap((r) => r.trace.filter((t) => t.rule === rule)).length, 0, rule);
    }
  });

  it("the ranks and the statuses are exactly the ungated ones — the ranking is not the gate's business", () => {
    assert.deepEqual(shownRanks(res), shownRanks(ungated));
    assert.deepEqual(
      res.results.map((r) => [r.listing_id, r.status, r.rank, r.stage_a_place]),
      ungated.results.map((r) => [r.listing_id, r.status, r.rank, r.stage_a_place]),
    );
    assert.deepEqual(
      res.results.map((r) => r.eligibility),
      ungated.results.map((r) => r.eligibility),
    );
  });
});

describe("crowning §1.9(3) — 8 eligible: the gate does not trigger and the picks are version 6's", () => {
  const pool = () => cars(8);
  const res = selectThree({ listings: pool() });
  const ungated = selectThree({ listings: pool() }, { crowningThreshold: 0 });

  it("not triggered at exactly the threshold", () => {
    assert.equal(CROWNING_THRESHOLD, 8);
    assert.equal(res.crowning.eligible, 8);
    assert.equal(res.crowning.crowned, true);
    assert.equal(theRecord(res).triggered, false);
  });

  it("the picks, the missing reasons and the runner-up are identical to the same pool with the gate off", () => {
    assert.deepEqual(res.picks, ungated.picks);
    assert.deepEqual(res.missing, ungated.missing);
    assert.deepEqual(res.runner_ups, ungated.runner_ups);
  });
});

describe("crowning §1.9(4) — the record, on the rank-1 row and on no other", () => {
  const res = selectThree({ listings: cars(7) });

  it("one record, on the row ranked 1", () => {
    const found = crowningRecords(res);
    assert.equal(found.length, 1);
    assert.equal(found[0].listing_id, 1);
    assert.equal(byId(res, 1).rank, 1);
  });

  it("the fixed shape: value, threshold, triggered, effect none, context", () => {
    assert.deepEqual(theRecord(res), {
      rule: "crowning_threshold",
      type: "portfolio",
      value: 7,
      threshold: CROWNING_THRESHOLD,
      triggered: true,
      effect: "none",
      context: { with_comparison: 7, verified: 7, eligible: 7 },
    });
  });
});

describe("crowning §1.9(5) — 13 with a comparison, 3 of them eligible", () => {
  // ids 4..13 rest on a 'typical' history row: a price comparison each, a registry history row none.
  const pool = cars(13).map((l) => (l.listing_id >= 4 ? car(l.listing_id, { history_source: "typical" }) : l));
  const res = selectThree({ listings: pool });

  it("with_comparison 13, eligible 3, triggered", () => {
    assert.deepEqual(res.crowning, { eligible: 3, verified: 3, with_comparison: 13, threshold: CROWNING_THRESHOLD, crowned: false });
    assert.deepEqual(theRecord(res).context, { with_comparison: 13, verified: 3, eligible: 3 });
    assert.equal(theRecord(res).value, 3);
    assert.equal(theRecord(res).triggered, true);
  });
});

describe("crowning §1.9(6) — a pool with only unscored rows", () => {
  const res = selectThree({ listings: [car(1, { thin: true }), car(2, { thin: true })] });

  it("the record on rank 1 with eligible 0 and with_comparison 0, triggered", () => {
    const found = crowningRecords(res);
    assert.equal(found.length, 1);
    assert.equal(byId(res, found[0].listing_id).rank, 1);
    assert.equal(found[0].entry.value, 0);
    assert.deepEqual(found[0].entry.context, { with_comparison: 0, verified: 0, eligible: 0 });
    assert.equal(found[0].entry.triggered, true);
    assert.deepEqual(res.crowning, { eligible: 0, verified: 0, with_comparison: 0, threshold: CROWNING_THRESHOLD, crowned: false });
  });

  it("zero shown rows -> no record at all: there is nothing to write it on", () => {
    const empty = selectThree({ listings: [] });
    assert.deepEqual(crowningRecords(empty), []);
    assert.deepEqual(empty.crowning, { eligible: 0, verified: 0, with_comparison: 0, threshold: CROWNING_THRESHOLD, crowned: false });
  });
});

describe("crowning §1.9(7) — the finish test, in both branches", () => {
  const claimOf = (res: SelectionResult, starts: string) => {
    const c = finishTest(res).checks.find((x) => x.claim.startsWith(starts));
    assert.ok(c !== undefined, `no claim starting "${starts}"`);
    return c;
  };

  it("passes when the gate triggered", () => {
    const ft = finishTest(selectThree({ listings: cars(7) }));
    assert.equal(ft.pass, true, JSON.stringify(ft.checks));
  });

  it("passes when the gate did not trigger", () => {
    const ft = finishTest(selectThree({ listings: cars(8) }));
    assert.equal(ft.pass, true, JSON.stringify(ft.checks));
  });

  it("fails on a hand-broken result: a pick present while the gate triggered", () => {
    const res = selectThree({ listings: cars(7) });
    const broken: SelectionResult = { ...res, picks: { ...res.picks, best_value: 1 } };
    assert.equal(finishTest(broken).pass, false);
    assert.equal(claimOf(broken, "nothing is crowned below the threshold").ok, false);
  });

  it("fails on a record whose value disagrees with a recount over the result's own rows", () => {
    const res = selectThree({ listings: cars(7) });
    const broken: SelectionResult = {
      ...res,
      results: res.results.map((r) =>
        r.rank === 1 ? { ...r, trace: r.trace.map((t) => (t.rule === "crowning_threshold" ? { ...t, value: 99 } : t)) } : r,
      ),
    };
    assert.equal(finishTest(broken).pass, false);
    assert.equal(claimOf(broken, "the crowning gate is recorded").ok, false);
  });

  // rules v8 (§0c): the recount counts THREE numbers and compares all three, so breaking any one of them fails.
  it("fails on a record whose verified count disagrees with the recount", () => {
    const res = selectThree({ listings: cars(7) });
    const broken: SelectionResult = {
      ...res,
      results: res.results.map((r) =>
        r.rank === 1
          ? { ...r, trace: r.trace.map((t) => (t.rule === "crowning_threshold" ? { ...t, context: { ...t.context, verified: 99 } } : t)) }
          : r,
      ),
    };
    assert.equal(finishTest(broken).pass, false);
    assert.equal(claimOf(broken, "the crowning gate is recorded").ok, false);
  });

  it("fails on a `crowning` whose verified count disagrees with the recount", () => {
    const res = selectThree({ listings: cars(7) });
    const broken: SelectionResult = { ...res, crowning: { ...res.crowning, verified: 99 } };
    assert.equal(finishTest(broken).pass, false);
    assert.equal(claimOf(broken, "the crowning gate is recorded").ok, false);
  });
});

describe("crowning §1.9(8) — the runner-up is never one of the picks (§1.5)", () => {
  // The gate is off here: these are cases of the RUNNER-UP rule, not of the gate (§1.8).
  const OFF = { crowningThreshold: 0 };
  // C: car 1 at 90,000, price_advantage 10, deal 10, condition_vs_typical 0. The band at 5% ends at 94,500.
  const C = () => cand({ id: 1, car: 1, price: 90000, history: 0 });
  // X: in the band, deal 15 (price_advantage 7 + history 8) and reality 8 -> wins best_value and peace_of_mind.
  const X = () => cand({ id: 2, car: 2, price: 93000, history: 8 });
  // Y: in the band, deal 10 (price_advantage 6 + history 4) and reality 4 -> wins nothing.
  const Y = () => cand({ id: 3, car: 3, price: 94000, history: 4 });

  it("a band holding one pick and one non-pick -> the non-pick, whatever their deal scores", () => {
    const res = selectThree({ listings: [C(), X(), Y()] }, OFF);
    assert.equal(res.picks.cheapest, 1);
    assert.deepEqual(byId(res, 2).categories, ["best_value", "peace_of_mind"]); // the higher deal, and a pick
    assert.deepEqual(byId(res, 3).categories, []);
    assert.deepEqual(res.runner_ups.cheapest, { listing_id: 3, gap: 0, price_over_pct: 4.4, triggered: false });
  });

  it("a band holding only picks -> no runner-up, and the record says no candidate", () => {
    const res = selectThree({ listings: [C(), X()] }, OFF);
    assert.equal(res.picks.cheapest, 1);
    assert.deepEqual(byId(res, 2).categories, ["best_value", "peace_of_mind"]);
    assert.equal(res.runner_ups.cheapest, null);
    const e = res.results.flatMap((r) => r.trace.filter((t) => t.rule === "cheapest_runner_up"));
    assert.equal(e.length, 1);
    assert.deepEqual(e[0].context, { evaluated: false, reason: "no_candidate_in_band", band_pct: 5 });
  });

  it("a band holding only an unverified non-pick -> no runner-up, as before version 7", () => {
    const res = selectThree({ listings: [C(), cand({ id: 2, car: 2, price: 93000, history: 8, history_source: "typical" })] }, OFF);
    assert.equal(res.picks.cheapest, 1);
    assert.equal(byId(res, 2).eligibility.cheapest, false);
    assert.deepEqual(byId(res, 2).categories, []);
    assert.equal(res.runner_ups.cheapest, null);
  });

  it("nothing recorded carries also_won any more", () => {
    const res = selectThree({ listings: [C(), X(), Y()] }, OFF);
    for (const r of res.results) for (const t of r.trace) assert.equal("also_won" in t.context, false, `${r.listing_id} ${t.rule}`);
    assert.equal("also_won" in (res.runner_ups.cheapest as object), false);
  });
});

// ---------------------------------------------------------------------------
// Days 22–23 rules v8 (§0c) — THE FLOOR JOINS THE COUNT. `car(i)` has history 0 and condition_vs_typical 0, so a
// below-floor car is one built with a history below CONDITION_FLOOR: `floored(i)` has cvt -6.
// ---------------------------------------------------------------------------

describe("crowning v8 §0c — the crowning count excludes the cars below the floor", () => {
  /** An otherwise eligible car whose condition_vs_typical is -6: a price comparison, registry history, below the floor. */
  const floored = (i: number): CandidateListing => car(i, { history: -6 });

  it("8 verified of which 3 are below the floor -> eligible 5, uncrowned, and no runner-up", () => {
    const pool = cars(8).map((l) => (l.listing_id >= 6 ? floored(l.listing_id) : l));
    const res = selectThree({ listings: pool });
    assert.deepEqual(res.crowning, { eligible: 5, verified: 8, with_comparison: 8, threshold: CROWNING_THRESHOLD, crowned: false });
    assert.deepEqual(res.picks, { best_value: null, peace_of_mind: null, cheapest: null });
    assert.deepEqual(res.missing, {
      best_value: "below_crowning_threshold",
      peace_of_mind: "below_crowning_threshold",
      cheapest: "below_crowning_threshold",
    });
    assert.equal(res.runner_ups.cheapest, null);
    assert.equal(theRecord(res).value, 5);
    assert.deepEqual(theRecord(res).context, { with_comparison: 8, verified: 8, eligible: 5 });
    assert.equal(finishTest(res).pass, true, JSON.stringify(finishTest(res).checks));
  });

  it("8 verified, none below the floor -> crowned, exactly as before version 8", () => {
    const res = selectThree({ listings: cars(8) });
    assert.deepEqual(res.crowning, { eligible: 8, verified: 8, with_comparison: 8, threshold: CROWNING_THRESHOLD, crowned: true });
    assert.equal(res.picks.best_value !== null, true);
    assert.equal(finishTest(res).pass, true, JSON.stringify(finishTest(res).checks));
  });

  it("the finish test fails on a hand-broken `verified` in either of the two pools", () => {
    for (const pool of [cars(8).map((l) => (l.listing_id >= 6 ? floored(l.listing_id) : l)), cars(8)]) {
      const res = selectThree({ listings: pool });
      const broken: SelectionResult = { ...res, crowning: { ...res.crowning, verified: res.crowning.verified + 1 } };
      assert.equal(finishTest(broken).pass, false);
    }
  });
});

describe("crowning §1.9(9) — `crowning` on the result equals the record", () => {
  for (const [name, pool] of [
    ["uncrowned", () => cars(7)],
    ["crowned", () => cars(8)],
    ["no comparison at all", () => [car(1, { thin: true })]],
  ] as const) {
    it(`the two agree: ${name}`, () => {
      const res = selectThree({ listings: pool() });
      const entry = theRecord(res);
      assert.equal(res.crowning.eligible, entry.value);
      assert.equal(res.crowning.with_comparison, entry.context.with_comparison);
      assert.equal(res.crowning.verified, entry.context.verified); // §0c — the third count travels too
      assert.equal(res.crowning.eligible, entry.context.eligible);
      assert.equal(res.crowning.threshold, entry.threshold);
      assert.equal(res.crowning.crowned, !entry.triggered);
      assert.equal(res.rules_version, RULES_VERSION);
    });
  }
});
