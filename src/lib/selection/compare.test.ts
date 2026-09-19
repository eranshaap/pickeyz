// Day 19 (Run 5c2, §6) — the comparison of two finished selections of the same pool.
//
// Pure data in, pure data out: these are hand-built SelectionResults, not the output of selectThree(). The
// point is what the comparison REPORTS, not how a selection is reached — the rules are tested next door in
// select-three.test.ts and are not this file's business.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareSelections, readRunnerUp } from "./compare";
import type { Category, Eligibility, ListingResult, RuleTrace, SelectionResult } from "./types";

const ALL_TRUE: Eligibility = {
  best_value: true,
  peace_of_mind: true,
  cheapest: true,
  reasons: [],
  without_unverified_history: { best_value: true, peace_of_mind: true, cheapest: true },
};

const eligibility = (over: Partial<Record<Category, boolean>> = {}): Eligibility => ({
  ...ALL_TRUE,
  ...over,
  without_unverified_history: { ...ALL_TRUE.without_unverified_history, ...over },
});

const runnerUpTrace = (runner_up: number, gap: number, triggered = true): RuleTrace => ({
  rule: "cheapest_runner_up",
  type: "portfolio",
  value: gap,
  threshold: 2,
  triggered,
  effect: "none",
  context: { evaluated: true, runner_up, price_over_pct: 3, band_pct: 5 },
});

const listing = (over: Partial<ListingResult> & { listing_id: number }): ListingResult => ({
  car_id: over.listing_id * 10,
  status: "shown",
  rank: null,
  stage_a_place: null,
  excluded_by: null,
  verify_availability: false,
  eligibility: ALL_TRUE,
  categories: [],
  trace: [],
  ...over,
});

/** Three shown listings ranked 1..3; best_value 1, peace_of_mind 2, cheapest 3, runner-up recorded on 3. */
function side(over: { picks?: Partial<SelectionResult["picks"]>; results?: ListingResult[]; runnerUp?: number } = {}): SelectionResult {
  const ru = over.runnerUp ?? 1;
  const results = over.results ?? [
    listing({ listing_id: 1, rank: 1, stage_a_place: 1, categories: ["best_value"] }),
    listing({ listing_id: 2, rank: 2, stage_a_place: 2, categories: ["peace_of_mind"] }),
    listing({ listing_id: 3, rank: 3, stage_a_place: 3, categories: ["cheapest"], trace: [runnerUpTrace(ru, 4)] }),
  ];
  return {
    rules_version: 6,
    picks: { best_value: 1, peace_of_mind: 2, cheapest: 3, ...over.picks },
    missing: {},
    runner_ups: { cheapest: { listing_id: ru, gap: 4, price_over_pct: 3, triggered: true } },
    results,
  };
}

describe("compareSelections — identical inputs", () => {
  it("nothing changed", () => {
    const c = compareSelections(side(), side());
    assert.equal(c.changed, false);
    assert.deepEqual(c.picks.map((p) => p.changed), [false, false, false]);
    assert.equal(c.runner_up.changed, false);
    assert.equal(c.ranks.changed, 0);
    assert.equal(c.ranks.compared, 3);
    assert.equal(c.ranks.largest, null);
    assert.deepEqual(c.statuses, []);
    assert.ok(c.eligibility.every((e) => e.gained.length === 0 && e.lost.length === 0));
    assert.deepEqual(c.only_before, []);
    assert.deepEqual(c.only_after, []);
  });

  it("the top list is the after ranks, in order, with the before rank beside each", () => {
    const c = compareSelections(side(), side());
    assert.deepEqual(c.ranks.top.map((m) => [m.after, m.listing_id, m.before]), [[1, 1, 1], [2, 2, 2], [3, 3, 3]]);
    assert.deepEqual(c.ranks.left_top, []);
  });
});

describe("compareSelections — a swapped pick", () => {
  it("reports the category that changed and leaves the others alone", () => {
    const c = compareSelections(side(), side({ picks: { peace_of_mind: 3 } }));
    assert.equal(c.changed, true);
    const pom = c.picks.find((p) => p.category === "peace_of_mind");
    assert.equal(pom?.before, 2);
    assert.equal(pom?.after, 3);
    assert.equal(pom?.changed, true);
    assert.equal(c.picks.find((p) => p.category === "best_value")?.changed, false);
  });

  it("a pick that goes missing carries the recorded reason on that side", () => {
    const after = side({ picks: { cheapest: null } });
    after.missing = { cheapest: "no_candidate" };
    const c = compareSelections(side(), after);
    const cheapest = c.picks.find((p) => p.category === "cheapest");
    assert.equal(cheapest?.after, null);
    assert.equal(cheapest?.after_missing, "no_candidate");
    assert.equal(cheapest?.before_missing, null);
    assert.equal(cheapest?.changed, true);
  });
});

describe("compareSelections — ranks", () => {
  const moved = side({
    results: [
      listing({ listing_id: 1, rank: 3, stage_a_place: 3, categories: ["best_value"] }),
      listing({ listing_id: 2, rank: 1, stage_a_place: 1, categories: ["peace_of_mind"] }),
      listing({ listing_id: 3, rank: 2, stage_a_place: 2, categories: ["cheapest"], trace: [runnerUpTrace(1, 4)] }),
    ],
  });

  it("counts the listings that changed rank and names the largest move", () => {
    const c = compareSelections(side(), moved);
    assert.equal(c.ranks.compared, 3);
    assert.equal(c.ranks.changed, 3);
    assert.equal(c.ranks.largest?.listing_id, 1);
    assert.equal(c.ranks.largest?.before, 1);
    assert.equal(c.ranks.largest?.after, 3);
    assert.equal(c.ranks.largest?.move, 2);
  });

  it("a listing not shown on both sides is out of the rank comparison", () => {
    const excluded = side({
      results: [
        listing({ listing_id: 1, rank: null, status: "excluded", excluded_by: "sold_strong" }),
        listing({ listing_id: 2, rank: 1, stage_a_place: 2, categories: ["peace_of_mind"] }),
        listing({ listing_id: 3, rank: 2, stage_a_place: 3, categories: ["cheapest"], trace: [runnerUpTrace(1, 4)] }),
      ],
      picks: { best_value: 2 },
    });
    const c = compareSelections(side(), excluded);
    assert.equal(c.ranks.compared, 2);
    assert.deepEqual(c.statuses, [{ listing_id: 1, before: "shown", after: "excluded" }]);
  });
});

describe("compareSelections — eligibility", () => {
  it("one listing gains a category and another loses one", () => {
    const before = side({
      results: [
        listing({ listing_id: 1, rank: 1, categories: ["best_value"] }),
        listing({ listing_id: 2, rank: 2, eligibility: eligibility({ cheapest: false }) }),
        listing({ listing_id: 3, rank: 3, categories: ["cheapest"], trace: [runnerUpTrace(1, 4)] }),
      ],
      picks: { peace_of_mind: 2 },
    });
    const after = side({
      results: [
        listing({ listing_id: 1, rank: 1, categories: ["best_value"] }),
        listing({ listing_id: 2, rank: 2, eligibility: eligibility() }), // gained cheapest
        listing({ listing_id: 3, rank: 3, categories: ["cheapest"], eligibility: eligibility({ peace_of_mind: false }), trace: [runnerUpTrace(1, 4)] }), // lost peace_of_mind
      ],
      picks: { peace_of_mind: 2 },
    });
    const c = compareSelections(before, after);
    assert.deepEqual(c.eligibility.find((e) => e.category === "cheapest")?.gained, [2]);
    assert.deepEqual(c.eligibility.find((e) => e.category === "cheapest")?.lost, []);
    assert.deepEqual(c.eligibility.find((e) => e.category === "peace_of_mind")?.lost, [3]);
    assert.equal(c.changed, true);
  });
});

describe("compareSelections — a listing on one side only", () => {
  it("is reported, not thrown on", () => {
    const after = side({
      results: [
        listing({ listing_id: 1, rank: 1, categories: ["best_value"] }),
        listing({ listing_id: 2, rank: 2, categories: ["peace_of_mind"] }),
        listing({ listing_id: 3, rank: 3, categories: ["cheapest"], trace: [runnerUpTrace(1, 4)] }),
        listing({ listing_id: 4, rank: 4 }),
      ],
    });
    const c = compareSelections(side(), after);
    assert.deepEqual(c.only_after, [4]);
    assert.deepEqual(c.only_before, []);
    assert.deepEqual(c.statuses, [{ listing_id: 4, before: "absent", after: "shown" }]);
    assert.equal(c.ranks.compared, 3); // listing 4 has nothing to be compared with
    assert.equal(c.changed, true);
  });
});

describe("readRunnerUp — select-three.ts's reading", () => {
  it("the recorded entry: the runner-up listing, its gap and whether it triggered", () => {
    assert.deepEqual(readRunnerUp(side({ runnerUp: 2 })), {
      state: "recorded", listing_id: 2, gap: 4, triggered: true, price_over_pct: 3, also_won: [],
    });
  });

  it("an entry marked not evaluated carries its reason", () => {
    const s = side();
    (s.results[2].trace[0].context as Record<string, unknown>).evaluated = false;
    (s.results[2].trace[0].context as Record<string, unknown>).reason = "no_listing_in_band";
    const r = readRunnerUp(s);
    assert.equal(r.state, "not_evaluated");
    assert.equal(r.state === "not_evaluated" && r.reason, "no_listing_in_band");
  });

  it("no cheapest pick -> the rule was never evaluated, and the recorded reason is carried", () => {
    const s = side({ picks: { cheapest: null } });
    s.missing = { cheapest: "no_candidate" };
    assert.deepEqual(readRunnerUp(s), { state: "no_pick", reason: "no_candidate" });
  });

  it("a runner-up change is reported as a change", () => {
    const c = compareSelections(side({ runnerUp: 1 }), side({ runnerUp: 2 }));
    assert.equal(c.runner_up.changed, true);
    assert.equal(c.changed, true);
  });

  it("more than one recorded entry on the cheapest pick is a stop, as select-three.ts treats it", () => {
    const s = side();
    s.results[2].trace = [runnerUpTrace(1, 4), runnerUpTrace(2, 5)];
    assert.throws(() => readRunnerUp(s), /expected exactly one cheapest_runner_up entry, found 2/);
  });
});

// Run 5e (§3): the verdict word on the preview's runner-up line compares the RUNNER-UP, like the pick lines.
// The gap is printed before -> after on that same line, so a move in it alone is not a change.
describe("compareSelections — runner_up.changed leaves the gap out (Run 5e §3)", () => {
  /** The standard side with the cheapest pick's recorded entry rebuilt: only the gap and `triggered` vary. */
  function sideWith(ru: number, gap: number, triggered = true): SelectionResult {
    const s = side({ runnerUp: ru });
    s.results[2].trace = [runnerUpTrace(ru, gap, triggered)];
    return s;
  }

  it("R1: the same runner-up, the same triggered, only the gap differs -> not a change", () => {
    const c = compareSelections(sideWith(2, 4), sideWith(2, 6.3));
    assert.equal(c.runner_up.changed, false);
    // both gaps are still carried, so the preview can print them before -> after
    assert.equal(c.runner_up.before.state === "recorded" && c.runner_up.before.gap, 4);
    assert.equal(c.runner_up.after.state === "recorded" && c.runner_up.after.gap, 6.3);
  });

  it("R2: the gap differs AND triggered differs -> a change (the gap never hides `triggered`)", () => {
    const c = compareSelections(sideWith(2, 4, true), sideWith(2, 6.3, false));
    assert.equal(c.runner_up.changed, true);
  });

  it("R4: a recorded runner-up on one side, no cheapest pick on the other -> a change", () => {
    const gone = side({ picks: { cheapest: null } });
    gone.missing = { cheapest: "no_candidate" };
    const c = compareSelections(sideWith(2, 4), gone);
    assert.equal(c.runner_up.after.state, "no_pick");
    assert.equal(c.runner_up.changed, true);
  });

  // R3 (a different runner-up listing -> true) and R5 (both sides identical -> false) are already asserted:
  // "a runner-up change is reported as a change" above, and "nothing changed" in the first describe.
});

describe("compareSelections — the finish test on each side", () => {
  it("runs finishTest() on both and reports a side that fails", () => {
    const broken = side({ picks: { peace_of_mind: null } }); // null with no recorded reason = claim 1 fails
    const c = compareSelections(side(), broken);
    assert.equal(c.finish.before.pass, true);
    assert.equal(c.finish.after.pass, false);
    assert.equal(c.changed, true);
  });
});
