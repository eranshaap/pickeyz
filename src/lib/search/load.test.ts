// BRIEF Run 6b §3.2 — the loading rule's PURE decisions. No database: the DB-facing half of load.ts imports
// the client on use, so nothing here opens a connection.
//
// The day signal is the one that needs both of Israel's clock regimes, because a fixed offset passes a
// summer test and fails in December (or the other way round). Both pairs are here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  drawnListingIds,
  isShownRow,
  isUpdate,
  latestRun,
  resultsCounts,
  resultsState,
  resultsViewFrom,
  storedFilters,
  storedRunnerUpListing,
  updateSignals,
  type CurrentVersions,
  type ListingFacts,
  type ResultRow,
  type SearchRow,
} from "./load";
import { handRubric } from "@/lib/display/rubrics";
import { MULTI_COLOR } from "@/lib/display/cards";
import { cancelledGroupHead, groupHead, noComparisonLine, uncrownedHead, zeroScoredHead } from "@/lib/display/edge-screens";
import { listHeading, OWNERSHIP_WORD } from "@/lib/display/texts";
import { CROWNING_THRESHOLD, RULE_TYPE, type RuleTrace } from "@/lib/selection";
import type { Prisma } from "@/generated/prisma/client";

const CURRENT: CurrentVersions = { engineVersion: 5, rulesVersion: 6 };

function row(over: Partial<SearchRow> = {}): SearchRow {
  return {
    id: 1,
    public_id: "aaaaaaaaaa",
    rerun_of: null,
    created_at: new Date("2026-09-22T09:00:00Z"),
    model_searched: "MAZDA 3",
    family_id: null,
    filters: null,
    priority: null,
    engine_version: CURRENT.engineVersion,
    rules_version: CURRENT.rulesVersion,
    results_count: 10,
    pool_count: 12,
    ...over,
  };
}

describe("latestRun() (§3.2)", () => {
  const question = row({ id: 1, created_at: new Date("2026-09-20T10:00:00Z") });

  it("no re-runs -> the question itself", () => {
    assert.equal(latestRun(question, []), question);
  });

  it("the newest by created_at wins", () => {
    const a = row({ id: 2, rerun_of: 1, created_at: new Date("2026-09-21T10:00:00Z") });
    const b = row({ id: 3, rerun_of: 1, created_at: new Date("2026-09-22T10:00:00Z") });
    assert.equal(latestRun(question, [a, b]).id, 3);
    assert.equal(latestRun(question, [b, a]).id, 3); // order of the input does not matter
  });

  it("a tie goes to the greater id", () => {
    const at = new Date("2026-09-21T10:00:00Z");
    const a = row({ id: 7, rerun_of: 1, created_at: at });
    const b = row({ id: 9, rerun_of: 1, created_at: at });
    assert.equal(latestRun(question, [a, b]).id, 9);
    assert.equal(latestRun(question, [b, a]).id, 9);
  });

  it("a re-run older than the question does not win", () => {
    const old = row({ id: 5, rerun_of: 1, created_at: new Date("2026-09-19T10:00:00Z") });
    assert.equal(latestRun(question, [old]).id, 1);
  });

  it("a tie between the question and a re-run goes to the greater id — the re-run", () => {
    const same = row({ id: 4, rerun_of: 1, created_at: question.created_at });
    assert.equal(latestRun(question, [same]).id, 4);
  });
});

describe("updateSignals() — each signal alone (§3.2)", () => {
  const run = row({ created_at: new Date("2026-09-22T09:00:00Z") });
  const now = new Date("2026-09-22T12:00:00Z"); // the same Israel day
  const before = new Date("2026-09-22T08:00:00Z");
  const after = new Date("2026-09-22T10:00:00Z");

  it("nothing fires: same day, nothing written since, versions equal", () => {
    assert.deepEqual(updateSignals(run, now, CURRENT, before, before), { data: false, day: false, version: false });
    assert.equal(isUpdate(updateSignals(run, now, CURRENT, before, before)), false);
  });

  it("data, from the listings side alone", () => {
    assert.deepEqual(updateSignals(run, now, CURRENT, after, before), { data: true, day: false, version: false });
  });

  it("data, from the dealer_commercial side alone", () => {
    assert.deepEqual(updateSignals(run, now, CURRENT, before, after), { data: true, day: false, version: false });
  });

  it("a null max on either side does not fire that side", () => {
    assert.equal(updateSignals(run, now, CURRENT, null, before).data, false);
    assert.equal(updateSignals(run, now, CURRENT, before, null).data, false);
    assert.equal(updateSignals(run, now, CURRENT, null, null).data, false);
  });

  it("a max EQUAL to created_at is not after it", () => {
    assert.equal(updateSignals(run, now, CURRENT, run.created_at, run.created_at).data, false);
  });

  it("version, from the engine alone", () => {
    assert.deepEqual(updateSignals(row({ engine_version: 4 }), now, CURRENT, before, before), { data: false, day: false, version: true });
  });

  it("version, from the rules alone", () => {
    assert.deepEqual(updateSignals(row({ rules_version: 5 }), now, CURRENT, before, before), { data: false, day: false, version: true });
  });

  it("the same instant fires nothing at all", () => {
    assert.deepEqual(updateSignals(run, run.created_at, CURRENT, null, null), { data: false, day: false, version: false });
  });

  it("an update is ANY of the three", () => {
    assert.equal(isUpdate({ data: true, day: false, version: false }), true);
    assert.equal(isUpdate({ data: false, day: true, version: false }), true);
    assert.equal(isUpdate({ data: false, day: false, version: true }), true);
    assert.equal(isUpdate({ data: false, day: false, version: false }), false);
  });
});

describe("updateSignals() — the Israel day, in BOTH clock regimes (§3.2)", () => {
  const day = (run: string, now: string) => updateSignals(row({ created_at: new Date(run) }), new Date(now), CURRENT, null, null).day;

  it("SUMMER (UTC+3): 21:00Z is already the next day in Israel", () => {
    // run 20:30Z on 1 July = 23:30 Israel; now 21:30Z = 00:30 on 2 July Israel -> a different day
    assert.equal(day("2026-07-01T20:30:00Z", "2026-07-01T21:30:00Z"), true);
    // both inside the same Israel day
    assert.equal(day("2026-07-01T09:00:00Z", "2026-07-01T20:30:00Z"), false);
  });

  it("WINTER (UTC+2): the boundary is 22:00Z, not 21:00Z", () => {
    // run 21:30Z on 1 December = 23:30 Israel; now 22:30Z = 00:30 on 2 December Israel -> a different day
    assert.equal(day("2026-12-01T21:30:00Z", "2026-12-01T22:30:00Z"), true);
    // 20:00Z and 21:30Z are 22:00 and 23:30 Israel — the SAME day, which a fixed +3 offset would get wrong
    assert.equal(day("2026-12-01T20:00:00Z", "2026-12-01T21:30:00Z"), false);
  });

  it("a whole day later always fires", () => {
    assert.equal(day("2026-09-21T09:00:00Z", "2026-09-22T09:00:00Z"), true);
  });

  it("the day signal fires on its own, with no data and no version change", () => {
    const s = updateSignals(row({ created_at: new Date("2026-09-21T09:00:00Z") }), new Date("2026-09-22T09:00:00Z"), CURRENT, null, null);
    assert.deepEqual(s, { data: false, day: true, version: false });
  });
});

describe("storedFilters() (§3.2)", () => {
  it("null is no filters", () => {
    assert.deepEqual(storedFilters(null), {});
  });

  it("an object comes back as the filters it was stored as", () => {
    assert.deepEqual(storedFilters({ priceMax: 100000, years: [2021, 2022] }), { priceMax: 100000, years: [2021, 2022] });
  });

  it("anything that is not an object is no filters", () => {
    assert.deepEqual(storedFilters([1, 2] as never), {});
    assert.deepEqual(storedFilters("x" as never), {});
  });
});

// ---------------------------------------------------------------------------
// BRIEF Run 1 §2.4 — THE ONE VIEW, over a fixture of stored rows. Still no database: resultsViewFrom() is the
// whole rule and the query that feeds it is the thin half.
// ---------------------------------------------------------------------------

const QUESTION_ID = "q1q2q3q4q5";

/**
 * A rule record of the shape selectThree writes (selection/types.ts), as the JSON COLUMN holds it: the cast is
 * the one run.ts makes when it writes these very records (`stage_b_trace as unknown as object[]`).
 */
function trace(over: Partial<RuleTrace> & Pick<RuleTrace, "rule">): Prisma.JsonValue {
  const record: RuleTrace = {
    type: RULE_TYPE[over.rule],
    value: null,
    threshold: null,
    triggered: true,
    effect: "none",
    context: {},
    ...over,
  };
  return record as unknown as Prisma.JsonValue;
}

/** A recorded runner-up, as picks.ts writes it on the cheapest pick's row. */
const runnerUpRecord = (listing_id: number): Prisma.JsonValue =>
  trace({ rule: "cheapest_runner_up", value: 3.2, threshold: 2, effect: "none", context: { runner_up: listing_id, price_over_pct: 4.1, band_pct: 5 } });

/** The record the rule writes when nothing stood in the band. */
const noCandidateRecord = (): Prisma.JsonValue =>
  trace({ rule: "cheapest_runner_up", triggered: false, context: { evaluated: false, reason: "no_candidate_in_band", band_pct: 5 } });

function resultRow(over: Partial<ResultRow> & Pick<ResultRow, "listing_id">): ResultRow {
  return {
    rank: 1,
    recommendation_categories: [],
    total_score: 12.5,
    confidence: "high",
    price_snapshot: 100000,
    km_snapshot: 34000,
    market_stats_id: 1,
    listing_scores_id: 1,
    new_car_price_id: null,
    stage_b_trace: [],
    ...over,
  };
}

function listingFacts(over: Partial<ListingFacts> & Pick<ListingFacts, "public_id" | "car_id">): ListingFacts {
  return {
    model: "מאזדה 3",
    year: 2022,
    price: 100000,
    km_declared: 34000,
    hand_declared: 2,
    registry_hand: 2,
    ownership_history: [
      { ym: "2022-03", type: "private" },
      { ym: "2024-01", type: "private" },
    ],
    image: null,
    ...over,
  };
}

describe("isShownRow() (§0.3f, §1.7)", () => {
  it("a ranked row is shown", () => {
    assert.equal(isShownRow({ rank: 1 }), true);
    assert.equal(isShownRow({ rank: 57 }), true);
  });

  it("every way Stage B removes a row leaves rank null, and none of them is shown", () => {
    // ExcludedBy's rules plus the merged duplicate (selection/types.ts)
    for (const rule of ["duplicate", "below_threshold", "above_new_price", "dealer_not_visible"] as const) {
      const row = resultRow({ listing_id: 1, rank: null, stage_b_trace: [trace({ rule, effect: rule === "duplicate" ? "merged" : "excluded" })] });
      assert.equal(isShownRow(row), false, rule);
    }
    // sold_signal STRONG: the gate stops before any rule runs, so the row carries NO record at all
    assert.equal(isShownRow(resultRow({ listing_id: 2, rank: null, stage_b_trace: [] })), false);
  });

  it("a shown row may carry an `excluded` record and a triggered one — the trace cannot decide this, rank can", () => {
    // too_similar records `excluded` on a row that is shown and merely lost a category (picks.ts);
    // above_new_price records `triggered` with effect `none` when the rule is not acting (rules.ts)
    const row = resultRow({
      listing_id: 3,
      rank: 4,
      stage_b_trace: [trace({ rule: "too_similar", effect: "excluded" }), trace({ rule: "above_new_price", effect: "none" })],
    });
    assert.equal(isShownRow(row), true);
  });
});

describe("storedRunnerUpListing() (§0.3c)", () => {
  it("reads the record off the cheapest pick's own row", () => {
    const rows = [
      resultRow({ listing_id: 10, rank: 1, recommendation_categories: ["best_value"] }),
      resultRow({ listing_id: 20, rank: 3, recommendation_categories: ["cheapest"], stage_b_trace: [runnerUpRecord(30)] }),
      resultRow({ listing_id: 30, rank: 2 }),
    ];
    assert.equal(storedRunnerUpListing(rows), 30);
  });

  it("also when `cheapest` is one label of a multi-winner row", () => {
    const rows = [resultRow({ listing_id: 10, rank: 1, recommendation_categories: ["best_value", "cheapest"], stage_b_trace: [runnerUpRecord(30)] })];
    assert.equal(storedRunnerUpListing(rows), 30);
  });

  it("no cheapest pick, no record, or a record that was not evaluated -> null", () => {
    assert.equal(storedRunnerUpListing([resultRow({ listing_id: 10, rank: 1, recommendation_categories: ["best_value"] })]), null);
    assert.equal(storedRunnerUpListing([resultRow({ listing_id: 20, rank: 1, recommendation_categories: ["cheapest"] })]), null);
    assert.equal(
      storedRunnerUpListing([resultRow({ listing_id: 20, rank: 1, recommendation_categories: ["cheapest"], stage_b_trace: [noCandidateRecord()] })]),
      null,
    );
  });

  it("two records on one row is a contradiction, not a choice", () => {
    const rows = [resultRow({ listing_id: 20, rank: 1, recommendation_categories: ["cheapest"], stage_b_trace: [runnerUpRecord(30), runnerUpRecord(40)] })];
    assert.throws(() => storedRunnerUpListing(rows), /measured once/);
  });
});

describe("resultsViewFrom() — the cards (§2.1, §2.4)", () => {
  const rows: ResultRow[] = [
    resultRow({ listing_id: 10, rank: 1, recommendation_categories: ["best_value"], price_snapshot: 121000, new_car_price_id: 7 }),
    resultRow({ listing_id: 20, rank: 2, recommendation_categories: ["peace_of_mind"], price_snapshot: 133000 }),
    resultRow({ listing_id: 30, rank: 5, recommendation_categories: ["cheapest"], price_snapshot: 96600, stage_b_trace: [runnerUpRecord(40)] }),
    resultRow({ listing_id: 40, rank: 4, price_snapshot: 100000 }),
    resultRow({ listing_id: 50, rank: 3 }),
    resultRow({ listing_id: 60, rank: null, stage_b_trace: [trace({ rule: "duplicate", effect: "merged" })] }),
  ];
  const facts = new Map<number, ListingFacts>([
    [10, listingFacts({ public_id: "aaaaaaaaaa", car_id: 1, price: 121000 })],
    [20, listingFacts({ public_id: "bbbbbbbbbb", car_id: 2, price: 133000, year: 2023 })],
    [30, listingFacts({ public_id: "cccccccccc", car_id: 3, price: 96600, year: 2021 })],
    [40, listingFacts({ public_id: "dddddddddd", car_id: 4, price: 100000 })],
    // Days 24–25 §2.2 — row 50 is shown, so the ONE load reads its facts too: the bottom list draws every car
    // the search shows, and not the picks and the runner-up alone.
    [50, listingFacts({ public_id: "eeeeeeeeee", car_id: 4, price: 100000 })],
  ]);
  const car_id_of = new Map([
    [10, 1],
    [20, 2],
    [30, 3],
    [40, 4],
    [50, 4], // a SECOND surviving ad of car 4
    [60, 5], // the merged duplicate — its car is not on the screen
  ]);
  const new_price_of = new Map([[7, 175000]]);

  const view = resultsViewFrom({ question_public_id: QUESTION_ID, rows, facts, car_id_of, new_price_of });

  it("the address on the view is the question's, for every `?s=` on the screen", () => {
    assert.equal(view.public_id, QUESTION_ID);
  });

  it("three winners -> three cards in slot order, each with its own colour", () => {
    assert.deepEqual(
      view.cards.map((c) => [c.public_id, c.categories, c.color]),
      [
        ["aaaaaaaaaa", ["best_value"], "#6b1f31"],
        ["bbbbbbbbbb", ["peace_of_mind"], "#1b3f4b"],
        ["cccccccccc", ["cheapest"], "#303577"],
      ],
    );
  });

  it("every field of a card", () => {
    assert.deepEqual(view.cards[0], {
      public_id: "aaaaaaaaaa",
      model: "מאזדה 3",
      year: 2022,
      price: 121000,
      new_price_pct: "‎69% ממחיר החדש",
      km: 34000,
      hand: 2,
      ownership_type: "private",
      image: null,
      categories: ["best_value"],
      color: "#6b1f31",
      sentence: null, // Days 22–23 — the one seam, and it is null here
    });
  });

  it("no new-price row -> new_price_pct is null and the card draws no element", () => {
    assert.equal(view.cards[1].new_price_pct, null);
  });

  it("the hand is the יד rubric's own big value — pinned against the rubric itself", () => {
    const check = (hand_declared: number | null, registry_hand: number | null) => {
      const f = listingFacts({ public_id: "x", car_id: 9, hand_declared, registry_hand });
      const v = resultsViewFrom({
        question_public_id: QUESTION_ID,
        rows: [resultRow({ listing_id: 1, rank: 1, recommendation_categories: ["best_value"] })],
        facts: new Map([[1, f]]),
        car_id_of: new Map([[1, 9]]),
        new_price_of: new Map(),
      });
      const rubric = handRubric({ hand_declared, registry_hand, has_registry_history: f.ownership_history.length > 0 });
      const card = v.cards[0];
      assert.equal(card.hand === null ? "—" : String(card.hand), rubric.big, `${hand_declared} / ${registry_hand}`);
    };
    check(2, 2); // they agree
    check(3, 2); // the AD's hand is the big value
    check(null, 4); // no declaration -> the registry's
    check(null, null); // neither -> the page's "—"
  });

  it("the current ownership is the last non-dealer row, as the legend marks it", () => {
    const f = listingFacts({
      public_id: "x",
      car_id: 9,
      ownership_history: [
        { ym: "2019-03", type: "leasing" },
        { ym: "2022-01", type: "company" },
        { ym: "2026-08", type: "dealer" },
      ],
    });
    const v = resultsViewFrom({
      question_public_id: QUESTION_ID,
      rows: [resultRow({ listing_id: 1, rank: 1, recommendation_categories: ["best_value"] })],
      facts: new Map([[1, f]]),
      car_id_of: new Map([[1, 9]]),
      new_price_of: new Map(),
    });
    assert.equal(v.cards[0].ownership_type, "company");
  });

  it("a double winner -> ONE bronze card with both labels, and two cards in the row", () => {
    const double: ResultRow[] = [
      resultRow({ listing_id: 10, rank: 1, recommendation_categories: ["best_value", "cheapest"], price_snapshot: 96600, stage_b_trace: [runnerUpRecord(40)] }),
      resultRow({ listing_id: 20, rank: 2, recommendation_categories: ["peace_of_mind"] }),
      resultRow({ listing_id: 40, rank: 3, price_snapshot: 100000 }),
    ];
    const v = resultsViewFrom({ question_public_id: QUESTION_ID, rows: double, facts, car_id_of, new_price_of });
    assert.equal(v.cards.length, 2);
    assert.deepEqual(v.cards[0].categories, ["best_value", "cheapest"]);
    assert.equal(v.cards[0].color, MULTI_COLOR);
    assert.deepEqual(v.cards[1].categories, ["peace_of_mind"]);
    // the strip is still there: the record sits on that pick's row whatever else it won
    assert.equal(v.runner_up?.public_id, "dddddddddd");
  });

  it("an empty category yields no card at all — no fourth slot and no placeholder", () => {
    const v = resultsViewFrom({
      question_public_id: QUESTION_ID,
      rows: [resultRow({ listing_id: 10, rank: 1, recommendation_categories: ["best_value"] }), resultRow({ listing_id: 50, rank: 2 })],
      facts,
      car_id_of,
      new_price_of,
    });
    assert.equal(v.cards.length, 1);
    assert.equal(v.runner_up, null);
  });

  it("a search with no recommendation at all -> no cards, no runner-up, and the count still counts", () => {
    const v = resultsViewFrom({
      question_public_id: QUESTION_ID,
      rows: [resultRow({ listing_id: 50, rank: 1 }), resultRow({ listing_id: 60, rank: null })],
      // Run 2 §3.1: rows with no crowning record and no category read as `uncrowned`, so the shown row is
      // DRAWN — as a place card — and its facts are needed. Before version 7 nothing was drawn here.
      facts: new Map([[50, listingFacts({ public_id: "eeeeeeeeee", car_id: 4 })]]),
      car_id_of,
      new_price_of,
    });
    assert.deepEqual(v.cards, []);
    assert.equal(v.runner_up, null);
    assert.equal(v.cars_shown, 1);
    assert.equal(v.state, "uncrowned");
    assert.deepEqual(
      v.places.map((p) => [p.place, p.public_id]),
      [[1, "eeeeeeeeee"]],
    );
  });

  it("a row pointing at a listing that is not in `listings` is a stop, not a skipped card", () => {
    assert.throws(
      () =>
        resultsViewFrom({
          question_public_id: QUESTION_ID,
          rows: [resultRow({ listing_id: 99, rank: 1, recommendation_categories: ["best_value"] })],
          facts: new Map(),
          car_id_of: new Map([[99, 9]]),
          new_price_of,
        }),
      /picked listing 99 has no listings row/,
    );
  });

  describe("the runner-up strip's data", () => {
    it("present, with the amount as the two SNAPSHOT prices' difference", () => {
      assert.deepEqual(view.runner_up, { public_id: "dddddddddd", model: "מאזדה 3", year: 2022, amount: 3400, fact: null });
    });

    it("absent when the record says nothing stood in the band", () => {
      const v = resultsViewFrom({
        question_public_id: QUESTION_ID,
        rows: [resultRow({ listing_id: 30, rank: 1, recommendation_categories: ["cheapest"], stage_b_trace: [noCandidateRecord()] })],
        facts,
        car_id_of,
        new_price_of,
      });
      assert.equal(v.runner_up, null);
    });

    it("a runner-up with no row in this search is a stop — a runner-up is always in the same cut pool", () => {
      assert.throws(
        () =>
          resultsViewFrom({
            question_public_id: QUESTION_ID,
            rows: [resultRow({ listing_id: 30, rank: 1, recommendation_categories: ["cheapest"], stage_b_trace: [runnerUpRecord(777)] })],
            facts,
            car_id_of,
            new_price_of,
          }),
        /has no row in this search/,
      );
    });
  });

  describe("cars_shown — X of the count line (§1.7, decision 4 of 25/09; Days 24–25 §2.2)", () => {
    // Days 24–25 §2.2 — X IS NOW READ FROM ONE SOURCE, `list.x`: every non-hidden row of the search. A removed
    // row (rank null) is not one of them, so row 60, merged away, is not counted — which is the rule that
    // matters on the site, because Stage B gives the merged ad of a car rank null and a car therefore has
    // exactly ONE shown row. The read-back (§6.5, assertion 3) proves the two readings agree on every stored
    // search; this fixture is the one they cannot agree on, and it cannot occur: it has two SHOWN ads of car 4.
    it("a removed row does not count: five shown rows -> X is 5", () => {
      assert.equal(view.list.x, 5);
      assert.equal(view.cars_shown, view.list.x);
    });

    it("the per-car count is untouched and still counts two ads of one car once", () => {
      // §1.7's rule itself — shownCarsCount over the rows — is unchanged and still on the view.
      assert.equal(view.counts.cars, 4);
    });
  });
});

// ---------------------------------------------------------------------------
// BRIEF Days 20–21, Run 2 §3.7 — THE SEARCH ANSWER'S STATE, COUNTS, HEAD, PLACES AND ROWS.
// Still no database: resultsViewFrom() is the whole rule, on literal rows.
// ---------------------------------------------------------------------------

/** rules v7 §1.4 — the crowning gate's record, as index.ts writes it on the rank-1 row. */
const crowningRecord = (eligible: number, with_comparison: number, threshold = CROWNING_THRESHOLD): Prisma.JsonValue =>
  trace({
    rule: "crowning_threshold",
    value: eligible,
    threshold,
    triggered: eligible < threshold,
    effect: "none",
    context: { eligible, with_comparison },
  });

/** The `unverified_history` record as gate.ts writes it when the rule bars a listing. */
const unverifiedRecord = (): Prisma.JsonValue =>
  trace({ rule: "unverified_history", value: "typical", effect: "ineligible", context: { evaluated: true, history_row_status: "scored" } });

/** The `cancelled` record as gate.ts writes it on a car finally cancelled at the registry. */
const cancelledRecord = (): Prisma.JsonValue => trace({ rule: "cancelled", value: "2026-09-10", effect: "ineligible", context: { evaluated: true } });

/** A scored, eligible shown row at `rank`. */
const scoredRow = (listing_id: number, rank: number, over: Partial<ResultRow> = {}): ResultRow =>
  resultRow({ listing_id, rank, total_score: 10 - rank, ...over });

/** A shown row with no price comparison: the no-deal tail. */
const tailRow = (listing_id: number, rank: number, over: Partial<ResultRow> = {}): ResultRow =>
  resultRow({ listing_id, rank, total_score: null, ...over });

const factsFor = (ids: number[]): Map<number, ListingFacts> =>
  new Map(ids.map((id) => [id, listingFacts({ public_id: `p${String(id).padStart(9, "0")}`, car_id: id })]));

const carsFor = (ids: number[]): Map<number, number> => new Map(ids.map((id) => [id, id]));

function viewOf(rows: ResultRow[], over: { facts?: Map<number, ListingFacts> } = {}) {
  const ids = rows.map((r) => r.listing_id);
  return resultsViewFrom({
    question_public_id: QUESTION_ID,
    rows,
    facts: over.facts ?? factsFor(ids),
    car_id_of: carsFor(ids),
    new_price_of: new Map(),
  });
}

describe("resultsState() — the four screens, in §3.1's order", () => {
  it("no shown row -> zero_results", () => {
    const rows = [resultRow({ listing_id: 1, rank: null }), resultRow({ listing_id: 2, rank: null })];
    assert.equal(resultsState(rows, { with_comparison: 0 }), "zero_results");
    assert.equal(viewOf(rows).state, "zero_results");
  });

  it("shown rows, none with a price comparison -> zero_scored", () => {
    const rows = [tailRow(1, 1), tailRow(2, 2)];
    assert.equal(viewOf(rows).state, "zero_scored");
  });

  it("the rank-1 row's crowning record, triggered -> uncrowned", () => {
    const rows = [scoredRow(1, 1, { stage_b_trace: [crowningRecord(6, 6)] }), scoredRow(2, 2)];
    assert.equal(viewOf(rows).state, "uncrowned");
  });

  it("the rank-1 row's crowning record, not triggered -> crowned", () => {
    const rows = [scoredRow(1, 1, { recommendation_categories: ["best_value"], stage_b_trace: [crowningRecord(9, 9)] }), scoredRow(2, 2)];
    assert.equal(viewOf(rows).state, "crowned");
  });

  it("rows written before version 7 (no record): with categories -> crowned, without -> uncrowned", () => {
    assert.equal(viewOf([scoredRow(1, 1, { recommendation_categories: ["best_value"] }), scoredRow(2, 2)]).state, "crowned");
    assert.equal(viewOf([scoredRow(1, 1), scoredRow(2, 2)]).state, "uncrowned");
  });

  it("two crowning records on one row is a contradiction, not a choice", () => {
    assert.throws(() => viewOf([scoredRow(1, 1, { stage_b_trace: [crowningRecord(6, 6), crowningRecord(7, 7)] })]), /measured once/);
  });
});

describe("resultsCounts() — the record and the recount agree (§3.2)", () => {
  // 4 shown rows with a comparison, of which 2 are barred from winning; one tail row; one removed row.
  const rows = [
    scoredRow(1, 1),
    scoredRow(2, 2, { stage_b_trace: [unverifiedRecord()] }),
    scoredRow(3, 3, { stage_b_trace: [unverifiedRecord()] }),
    scoredRow(4, 4),
    tailRow(5, 5),
    resultRow({ listing_id: 6, rank: null }),
  ];
  const cars = carsFor([1, 2, 3, 4, 5, 6]);

  it("from a recount when no row carries the record", () => {
    assert.deepEqual(resultsCounts(rows, cars), { cars: 5, with_comparison: 4, eligible: 2, threshold: CROWNING_THRESHOLD, source: "recount" });
  });

  it("from the record when the rank-1 row carries it — the same numbers, on the same fixture", () => {
    const withRecord = rows.map((r) => (r.rank === 1 ? { ...r, stage_b_trace: [crowningRecord(2, 4)] } : r));
    const fromRecord = resultsCounts(withRecord, cars);
    assert.deepEqual(fromRecord, { cars: 5, with_comparison: 4, eligible: 2, threshold: CROWNING_THRESHOLD, source: "record" });
    const fromRecount = resultsCounts(rows, cars);
    assert.equal(fromRecord.with_comparison, fromRecount.with_comparison);
    assert.equal(fromRecord.eligible, fromRecount.eligible);
  });

  it("a cancelled row has no comparison and is counted as a car all the same", () => {
    const withCancelled = [...rows, tailRow(7, 6, { stage_b_trace: [cancelledRecord()] })];
    const c = resultsCounts(withCancelled, carsFor([1, 2, 3, 4, 5, 6, 7]));
    assert.equal(c.cars, 6);
    assert.equal(c.with_comparison, 4);
  });
});

describe("resultsViewFrom() — the places, the rows and the group (§3.5)", () => {
  const rows = [
    scoredRow(10, 1, { stage_b_trace: [crowningRecord(3, 3)] }),
    scoredRow(20, 2),
    scoredRow(30, 3),
    tailRow(40, 4),
    tailRow(50, 5),
    tailRow(60, 6, { stage_b_trace: [cancelledRecord()] }), // §3.5 — drawn on neither edge screen
    resultRow({ listing_id: 70, rank: null }), // removed by Stage B
  ];
  const view = viewOf(rows);

  it("uncrowned, with the head of §2.1's reason A", () => {
    assert.equal(view.state, "uncrowned");
    assert.deepEqual(view.head, uncrownedHead({ with_comparison: 3, eligible: 3, threshold: CROWNING_THRESHOLD }));
  });

  it("places: the shown rows with a comparison, in rank order, each labelled by its rank", () => {
    assert.deepEqual(
      view.places.map((p) => [p.place, p.public_id]),
      [
        [1, "p000000010"],
        [2, "p000000020"],
        [3, "p000000030"],
      ],
    );
  });

  // Days 24–25 §2.1 — a place card and a table row are now ONE row view (ListRow), and its values still come out
  // of the same mapping the pick cards come out of (§3.4): the ad's km, the ad's hand or the registry's, the
  // current ownership — as a WORD here, because that is what a row prints. `sentence` and `tag` are the
  // generator's two fields and are empty strings until it lands (§3).
  it("a list row carries the ListRow view, from the pick cards' own mapping (§2.1)", () => {
    const p = view.places[0];
    assert.deepEqual(Object.keys(p).sort(), [
      "hand",
      "href",
      "image",
      "km",
      "model",
      "ownership_word",
      "place",
      "price",
      "public_id",
      "sentence",
      "tag",
      "year",
    ]);
    assert.equal(p.km, 34000);
    assert.equal(p.hand, 2);
    assert.equal(p.ownership_word, OWNERSHIP_WORD.private);
    assert.equal(p.sentence, "");
    assert.equal(p.tag, "");
    assert.equal(p.href, `/listing/${p.public_id}?s=${QUESTION_ID}`);
  });

  it("unscored: the shown rows with no comparison, in their stored order, the cancelled one left out", () => {
    assert.deepEqual(
      view.unscored.map((r) => r.public_id),
      ["p000000040", "p000000050"],
    );
    assert.equal(view.counts.cars, 6); // the cancelled car IS a car the screen displays
  });

  it("the group object is groupHead() over the drawn rows", () => {
    assert.deepEqual(view.group, groupHead(2));
    assert.equal(view.group?.line, noComparisonLine(2));
  });

  it("no unscored row -> no group object", () => {
    const v = viewOf([scoredRow(10, 1, { stage_b_trace: [crowningRecord(2, 2)] }), scoredRow(20, 2)]);
    assert.equal(v.unscored.length, 0);
    assert.equal(v.group, null);
  });

  it("zero_scored: the head says it, so there is no group object and no place", () => {
    const v = viewOf([tailRow(10, 1), tailRow(20, 2), tailRow(30, 3, { stage_b_trace: [cancelledRecord()] })]);
    assert.equal(v.state, "zero_scored");
    assert.deepEqual(v.head, zeroScoredHead(2)); // the cancelled row is not drawn and not named in the head
    assert.equal(v.group, null);
    assert.deepEqual(v.places, []);
    assert.equal(v.unscored.length, 2);
  });

  it("zero_results: no head, no place, no row, and the count is nought", () => {
    const v = viewOf([resultRow({ listing_id: 10, rank: null })]);
    assert.deepEqual(v, {
      public_id: QUESTION_ID,
      state: "zero_results",
      counts: { cars: 0, with_comparison: 0, eligible: 0, threshold: CROWNING_THRESHOLD, source: "recount" },
      head: null,
      cards: [],
      runner_up: null,
      // Days 24–25 §2.2 — the list is assembled in every state and is empty in this one; `x` is 0, which is
      // what the count line would say if this screen had one.
      list: {
        cardCount: 0,
        x: 0,
        heading: { firstPlace: 1, more: 0, text: listHeading(1, 0) },
        cards: [],
        table: [],
        restRanked: [],
        noPrice: [],
        noPriceGroup: null,
        cancelled: [],
        cancelledGroup: null,
        tableHidden: 0,
        tableMoreLink: null,
        noPriceHidden: 0,
        noPriceMoreLink: null,
      },
      places: [],
      unscored: [],
      cancelled: [],
      group: null,
      cars_shown: 0,
    });
  });

  it("crowned: no head, no place and no row — those belong to the two edge screens", () => {
    const v = viewOf([
      scoredRow(10, 1, { recommendation_categories: ["best_value"], stage_b_trace: [crowningRecord(9, 9)] }),
      scoredRow(20, 2),
      tailRow(30, 3),
    ]);
    assert.equal(v.state, "crowned");
    assert.equal(v.head, null);
    assert.deepEqual(v.places, []);
    assert.deepEqual(v.unscored, []);
    assert.equal(v.group, null);
    assert.equal(v.cards.length, 1);
  });
});

// Days 24–25 §2.2 — ONE LOAD: the details of every NON-HIDDEN row, in every state. The crowned path read the
// picks and the runner-up alone until this run, because nothing was drawn under the cards; the bottom list draws
// every car the search shows, the cancelled ones included.
describe("drawnListingIds() — one query for every drawn row (§3.5, §2.2)", () => {
  it("crowned: every shown row, not only the picks and the runner-up", () => {
    const rows = [
      scoredRow(10, 1, { recommendation_categories: ["best_value"], stage_b_trace: [crowningRecord(9, 9)] }),
      scoredRow(20, 2, { recommendation_categories: ["cheapest"], stage_b_trace: [runnerUpRecord(30)] }),
      scoredRow(30, 3),
      tailRow(40, 4),
    ];
    assert.deepEqual(
      drawnListingIds(rows).sort((a, b) => a - b),
      [10, 20, 30, 40],
    );
  });

  it("uncrowned: every shown row, the cancelled one included and the removed one left out", () => {
    const rows = [
      scoredRow(10, 1, { stage_b_trace: [crowningRecord(2, 2)] }),
      scoredRow(20, 2),
      tailRow(30, 3),
      tailRow(40, 4, { stage_b_trace: [cancelledRecord()] }),
      resultRow({ listing_id: 50, rank: null }),
    ];
    assert.deepEqual(
      drawnListingIds(rows).sort((a, b) => a - b),
      [10, 20, 30, 40],
    );
  });

  it("zero_results: nothing at all", () => {
    assert.deepEqual(drawnListingIds([resultRow({ listing_id: 10, rank: null })]), []);
  });
});

// ---------------------------------------------------------------------------
// BRIEF Days 24–25, Run 1 §4.7 / §6.4 — THE UNCROWNED HEADLINES DO NOT COUNT CANCELLED CARS, and the cancelled
// row sits in its own group at the end of the screen. The headline's two numbers are computed here
// (resultsCounts + uncrownedHead / zeroScoredHead), which is why the fixture is here.
// ---------------------------------------------------------------------------

describe("§6.4 — the uncrowned headlines with a cancelled car on the screen", () => {
  it("below threshold: 5 scored eligible + 1 no-price + 1 cancelled -> the headline says 5", () => {
    const rows = [
      scoredRow(10, 1, { stage_b_trace: [crowningRecord(5, 5)] }),
      scoredRow(20, 2),
      scoredRow(30, 3),
      scoredRow(40, 4),
      scoredRow(50, 5),
      tailRow(60, 6),
      tailRow(70, 7, { stage_b_trace: [cancelledRecord()] }),
    ];
    const v = viewOf(rows);
    assert.equal(v.state, "uncrowned");
    assert.equal(v.counts.with_comparison, 5);
    assert.equal(v.counts.eligible, 5);
    assert.deepEqual(v.head, uncrownedHead({ with_comparison: 5, eligible: 5, threshold: CROWNING_THRESHOLD }));
    // the floor, the no-price group and the cancelled group, each with its own rows
    assert.deepEqual(
      v.places.map((r) => r.place),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(
      v.unscored.map((r) => r.public_id),
      ["p000000060"],
    );
    assert.deepEqual(
      v.cancelled.map((r) => [r.public_id, r.place]),
      [["p000000070", null]],
    );
    assert.deepEqual(v.group, groupHead(1));
    assert.deepEqual(v.list.cancelledGroup, cancelledGroupHead(1));
  });

  it("zero scored: 0 scored + 3 no-price + 1 cancelled -> the headline says 3", () => {
    const rows = [tailRow(10, 1), tailRow(20, 2), tailRow(30, 3), tailRow(40, 4, { stage_b_trace: [cancelledRecord()] })];
    const v = viewOf(rows);
    assert.equal(v.state, "zero_scored");
    assert.deepEqual(v.head, zeroScoredHead(3));
    assert.equal(v.unscored.length, 3);
    assert.equal(v.cancelled.length, 1);
    assert.equal(v.group, null); // the zero-scored screen's own head already says it
    assert.deepEqual(v.list.cancelledGroup, cancelledGroupHead(1));
  });
});
