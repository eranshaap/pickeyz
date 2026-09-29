// BRIEF Days 15–16, Run 2b §4 and Run 2c §4–§5: toSearchResultRows() — the `search_results` mapping — plus
// latestScoreIdByListing(), the §0.5 rule that resolves the invoice pointer. Both on hand-built input.
//
// The pool is built from src/lib/selection/fixtures.ts so that the ranks are PREDICTABLE: with the default
// invoice every condition sum is 0, so deal_score = price_advantage = -100 * (price - median) / median, and
// the Stage A order is price ascending. Prices 90,000 … 101,000 over ids 1…12 therefore give rank = id.
// On top of those twelve sit the two listings that get no rank: a duplicate of car 5 (merged) and a listing
// whose seller is not visible (excluded).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectThree, type Category, type RuleTrace, type SelectionResult } from "@/lib/selection";
import { cand, type Spec } from "@/lib/selection/fixtures";
import { TAG_CHEAPER_THAN_CHEAPEST, type CarJustification, type JustificationOutput } from "@/lib/justification";
import {
  TRACE_FULL_RANK,
  latestScoreIdByListing,
  toSearchResultRows,
  traceFor,
  type ResultSnapshot,
  type ScoreRowRef,
  type SearchResultRow,
} from "./results";

const SEARCH_ID = 4242;

const SHOWN = 12; // ids 1..12, rank = id
const MERGED = 13; // a second listing of car 5, dearer than it — merged away
const EXCLUDED = 14; // seller not visible — excluded
const LATE_PICK = 11; // Run 2c §4: the listing the crafted pool makes a WINNER at a rank above TRACE_FULL_RANK

type Fixture = { snapshot: ResultSnapshot; candidate: ReturnType<typeof cand> };

function fixture(id: number, extra: Partial<Spec> = {}, snap: Partial<ResultSnapshot> = {}): Fixture {
  const price = 89000 + id * 1000; // id 1 -> 90,000 … id 12 -> 101,000
  const candidate = cand({ id, price, ...extra });
  return {
    candidate,
    snapshot: {
      listing_id: id,
      price: candidate.price,
      km_declared: 100000 + id,
      score: candidate.breakdown.deal_score,
      breakdown: candidate.breakdown,
      market_stats_id: 100 + id,
      model_stats_id: 4,
      pool_stats_id: 2,
      new_car_price_id: id % 2 === 0 ? 900 + id : null, // half the pool has no new-price row
      listing_scores_id: id % 3 === 0 ? null : 700 + id, // a third of the pool was never scored (§0.5)
      ...snap,
    },
  };
}

function pool(): Fixture[] {
  const items: Fixture[] = [];
  for (let id = 1; id <= SHOWN; id++) {
    // id 3 carries a better value_by_reality so that peace_of_mind does not land on the same car as
    // best_value — the mapping is then exercised on two distinct recommended listings, one of them double.
    // ids above TRACE_FULL_RANK rest on a 'typical' history row, which is what makes unverified_history
    // TRIGGER on them: with no triggered record the "triggered only" truncation could not be seen.
    if (id === 3) items.push(fixture(id, { reality: 5 }));
    else if (id > TRACE_FULL_RANK) items.push(fixture(id, { history_source: "typical" }));
    else items.push(fixture(id));
  }
  items.push(fixture(MERGED, { car: 5, price: 300000 })); // dearer than listing 5, so listing 5 represents car 5
  items.push(fixture(EXCLUDED, { visible: false }));
  return items;
}

// Run 2c §4 — the pool the old rule could not describe. peace_of_mind is won on condition_by_reality, not on
// rank, so a listing can win it from anywhere in the order: LATE_PICK keeps its price (rank 11) and gets both
// the best condition in the pool and a REGISTRY history row, which is what makes it eligible to win at all.
function latePickPool(): Fixture[] {
  const items: Fixture[] = [];
  for (let id = 1; id <= SHOWN; id++) {
    if (id === LATE_PICK) items.push(fixture(id, { reality: 40 }));
    else if (id > TRACE_FULL_RANK) items.push(fixture(id, { history_source: "typical" }));
    else items.push(fixture(id));
  }
  return items;
}

// Days 22–23 (Run 5 §2) — the generator's output, hand-made: what is under test here is the MAPPING, not the
// library. One CarJustification per SHOWN listing and none for a hidden one, which is what justify() writes
// (justification/types.ts:17-18).
function carJust(over: Partial<CarJustification> & Pick<CarJustification, "listing_id">): CarJustification {
  return {
    kind: "max_effect",
    fact: "price",
    sentence: `sentence ${over.listing_id}`,
    tag: "",
    values: { ils: 1000 },
    page: { price_line: null, why_lines: [] },
    ...over,
  };
}

function justificationFor(selection: SelectionResult, runner_up_fact: string | null = null): JustificationOutput {
  return {
    generator_version: 1,
    cars: selection.results.filter((r) => r.rank !== null).map((r) => carJust({ listing_id: r.listing_id })),
    runner_up_fact,
  };
}

function rowsOf(items: Fixture[]): { selection: SelectionResult; rows: SearchResultRow[] } {
  const selection = selectThree({ listings: items.map((f) => f.candidate) });
  return {
    selection,
    rows: toSearchResultRows(
      SEARCH_ID,
      items.map((f) => f.snapshot),
      selection,
      justificationFor(selection),
    ),
  };
}

function run(): { items: Fixture[]; selection: SelectionResult; rows: SearchResultRow[] } {
  const items = pool();
  return { items, ...rowsOf(items) };
}

const rowOf = (rows: SearchResultRow[], id: number): SearchResultRow => {
  const r = rows.find((x) => x.listing_id === id);
  assert.ok(r !== undefined, `no row for listing ${id}`);
  return r;
};

const ruleNames = (trace: RuleTrace[]): string[] => [...new Set(trace.map((t) => t.rule))].sort();

describe("toSearchResultRows — the pool (§4)", () => {
  it("one row per listing of the cut pool, in the pool's order, all on the same search", () => {
    const { items, rows } = run();
    assert.equal(rows.length, items.length);
    assert.deepEqual(
      rows.map((r) => r.listing_id),
      items.map((f) => f.snapshot.listing_id),
    );
    for (const r of rows) assert.equal(r.search_id, SEARCH_ID);
  });

  it("an empty cut pool produces no rows at all", () => {
    const empty = selectThree({ listings: [] });
    assert.deepEqual(toSearchResultRows(SEARCH_ID, [], empty, justificationFor(empty)), []);
  });

  it("a pool and a selection that are not the same pool is a stop, not a skipped row", () => {
    const items = pool();
    const selection = selectThree({ listings: items.map((f) => f.candidate) });
    assert.throws(
      () =>
        toSearchResultRows(
          SEARCH_ID,
          items.slice(1).map((f) => f.snapshot),
          selection,
          justificationFor(selection),
        ),
      /not the same pool/,
    );
    const swapped = items.map((f) => f.snapshot);
    swapped[0] = { ...swapped[0], listing_id: 999 };
    assert.throws(() => toSearchResultRows(SEARCH_ID, swapped, selection, justificationFor(selection)), /no result for it/);
  });
});

describe("toSearchResultRows — rank (§4)", () => {
  it("the shown listings keep selectThree's rank, contiguous 1..N", () => {
    const { selection, rows } = run();
    assert.equal(selection.results.filter((r) => r.status === "shown").length, SHOWN);
    for (let id = 1; id <= SHOWN; id++) assert.equal(rowOf(rows, id).rank, id); // the fixture's prices make rank = id
    assert.deepEqual(
      rows
        .map((r) => r.rank)
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b),
      Array.from({ length: SHOWN }, (_, i) => i + 1),
    );
  });

  it("a merged listing and an excluded listing have rank null", () => {
    const { selection, rows } = run();
    assert.equal(selection.results.find((r) => r.listing_id === MERGED)?.status, "merged");
    assert.equal(selection.results.find((r) => r.listing_id === EXCLUDED)?.status, "excluded");
    assert.equal(rowOf(rows, MERGED).rank, null);
    assert.equal(rowOf(rows, EXCLUDED).rank, null);
  });
});

describe("toSearchResultRows — the trace (Run 2c §4)", () => {
  it(`rank <= ${TRACE_FULL_RANK} carries every record selectThree produced`, () => {
    const { selection, rows } = run();
    for (let id = 1; id <= TRACE_FULL_RANK; id++) {
      assert.deepEqual(rowOf(rows, id).stage_b_trace, selection.results.find((x) => x.listing_id === id)?.trace);
    }
    // and the full trace really does hold records the other two rules would have dropped
    assert.ok(selection.results.find((x) => x.rank === TRACE_FULL_RANK)?.trace.some((t) => !t.triggered && t.effect === "none"));
  });

  it("a rank above that, with nothing recommended, carries only the records that triggered — and that is fewer", () => {
    const { selection, rows } = run();
    for (let id = TRACE_FULL_RANK + 1; id <= SHOWN; id++) {
      const r = selection.results.find((x) => x.listing_id === id);
      assert.ok(r !== undefined);
      assert.equal(r.categories.length, 0, `listing ${id} is recommended — the truncation does not apply to it`);
      const kept = rowOf(rows, id).stage_b_trace;
      assert.deepEqual(
        kept,
        r.trace.filter((t) => t.triggered),
      );
      assert.ok(kept.length > 0, `listing ${id} triggered nothing — the truncation is untested`);
      assert.ok(kept.length < r.trace.length, `listing ${id} lost nothing — the truncation is untested`);
      for (const t of kept) assert.equal(t.triggered, true);
    }
  });

  it("rank null carries the records that ACTED, plus any triggered one — and that is fewer", () => {
    const { selection, rows } = run();
    for (const id of [MERGED, EXCLUDED]) {
      const r = selection.results.find((x) => x.listing_id === id);
      assert.ok(r !== undefined);
      const kept = rowOf(rows, id).stage_b_trace;
      assert.deepEqual(
        kept,
        r.trace.filter((t) => t.effect !== "none" || t.triggered),
      );
      assert.ok(kept.length > 0, `listing ${id} has rank null and an empty trace — its reason would be unrecorded`);
      assert.ok(kept.length < r.trace.length, `listing ${id} lost nothing — the truncation is untested`);
      for (const t of kept) assert.ok(t.effect !== "none" || t.triggered);
    }
    // the reason each of the two lost its rank is among the kept records, which is what the rule is for
    assert.ok(rowOf(rows, MERGED).stage_b_trace.some((t) => t.rule === "duplicate" && t.effect === "merged"));
    assert.ok(rowOf(rows, EXCLUDED).stage_b_trace.some((t) => t.rule === "dealer_not_visible" && t.effect === "excluded"));
  });

  it(`a RECOMMENDED row beyond rank ${TRACE_FULL_RANK} carries the full record set, not the triggered ones alone`, () => {
    const items = latePickPool();
    const { selection, rows } = rowsOf(items);
    const late = selection.results.find((r) => r.listing_id === LATE_PICK);
    assert.ok(late !== undefined);
    assert.ok(late.rank !== null && late.rank > TRACE_FULL_RANK, `listing ${LATE_PICK} sits at rank ${late.rank} — the case is untested`);
    assert.ok(late.categories.length > 0, `listing ${LATE_PICK} won no category — the case is untested`);

    // nothing is dropped …
    assert.deepEqual(rowOf(rows, LATE_PICK).stage_b_trace, late.trace);
    // … and the rank rule alone WOULD have dropped something: this is the Run 2b finding, made a test
    const triggeredOnly = late.trace.filter((t) => t.triggered);
    assert.ok(triggeredOnly.length < late.trace.length, "the recommended row has nothing untriggered — the case is untested");

    // the same set a rank <= TRACE_FULL_RANK row of the same kind carries, plus its pick-only records
    const peer = selection.results.find((r) => r.rank === TRACE_FULL_RANK);
    assert.ok(peer !== undefined && peer.categories.length === 0);
    const peerRules = ruleNames(rowOf(rows, peer.listing_id).stage_b_trace);
    const lateRules = ruleNames(rowOf(rows, LATE_PICK).stage_b_trace);
    for (const rule of peerRules) assert.ok(lateRules.includes(rule), `the recommended row is missing the ${rule} record the rank-${TRACE_FULL_RANK} row carries`);
    const PICK_ONLY = ["too_similar", "double_winner", "cheapest_runner_up"];
    for (const rule of lateRules.filter((r) => !peerRules.includes(r))) assert.ok(PICK_ONLY.includes(rule), `${rule} is not a pick-only record`);
    assert.ok(lateRules.length > peerRules.length, "the recommended row carries no pick-only record — the case is untested");
  });

  it("traceFor() is the whole rule and nothing else decides it", () => {
    for (const { selection } of [run(), rowsOf(latePickPool())]) {
      for (const r of selection.results) {
        const expected =
          r.rank === null
            ? r.trace.filter((t) => t.effect !== "none" || t.triggered)
            : r.rank <= TRACE_FULL_RANK || r.categories.length > 0
              ? r.trace
              : r.trace.filter((t) => t.triggered);
        assert.deepEqual(traceFor(r), expected);
      }
    }
  });
});

describe("toSearchResultRows — the recommendation (§4)", () => {
  it("recommendation_categories is selectThree's own answer, and it is the whole of 'recommended'", () => {
    const { selection, rows } = run();
    for (const r of selection.results) {
      assert.deepEqual(rowOf(rows, r.listing_id).recommendation_categories, r.categories);
    }
  });

  it("the recommended rows are exactly the distinct picked listings, and a double winner is one row with two codes", () => {
    const { selection, rows } = run();
    const picked = [...new Set(Object.values(selection.picks).filter((v): v is number => v !== null))].sort((a, b) => a - b);
    assert.deepEqual(
      rows
        .filter((r) => r.recommendation_categories.length > 0)
        .map((r) => r.listing_id)
        .sort((a, b) => a - b),
      picked,
    );
    assert.equal(picked.length, 2, "the fixture is built so that the three categories land on two listings");
    const doubles = rows.filter((r) => r.recommendation_categories.length > 1);
    assert.equal(doubles.length, 1);
    assert.deepEqual(doubles[0].recommendation_categories, ["best_value", "cheapest"] as Category[]);
    // §4's invariant: the best_value winner is rank 1, and nothing without a rank is ever recommended
    assert.equal(rowOf(rows, selection.picks.best_value as number).rank, 1);
    for (const r of rows.filter((x) => x.recommendation_categories.length > 0)) assert.notEqual(r.rank, null);
  });
});

describe("toSearchResultRows — the snapshot (§4, Run 2c §5)", () => {
  it("every snapshot column is the listing's value at that moment, copied and not recomputed", () => {
    const { items, rows } = run();
    for (const f of items) {
      const s = f.snapshot;
      const row = rowOf(rows, s.listing_id);
      assert.equal(row.total_score, s.score);
      assert.equal(row.confidence, s.breakdown.confidence?.level ?? null); // read from the invoice, which is no longer copied
      assert.equal(row.market_stats_id, s.market_stats_id);
      assert.equal(row.model_stats_id, s.model_stats_id);
      assert.equal(row.pool_stats_id, s.pool_stats_id);
      assert.equal(row.new_car_price_id, s.new_car_price_id);
      assert.equal(row.listing_scores_id, s.listing_scores_id);
      assert.equal(row.price_snapshot, s.price);
      assert.equal(row.km_snapshot, s.km_declared);
    }
    assert.ok(
      rows.some((r) => r.new_car_price_id === null),
      "the fixture must cover a listing whose key has no new-price row",
    );
    assert.ok(
      rows.some((r) => r.listing_scores_id === null) && rows.some((r) => r.listing_scores_id !== null),
      "the fixture must cover both a scored and a never-scored listing",
    );
  });

  it("the invoice is a POINTER, not a copy: no row carries a score_breakdown of its own (§5)", () => {
    const { rows } = run();
    for (const r of rows) assert.ok(!("score_breakdown" in r), `listing ${r.listing_id} still carries a copied invoice`);
  });

  it("a listing with no deal score keeps total_score null and still gets a row", () => {
    const items = [fixture(1), fixture(2, { thin: true }, { score: null })];
    const selection = selectThree({ listings: items.map((f) => f.candidate) });
    const rows = toSearchResultRows(
      SEARCH_ID,
      items.map((f) => f.snapshot),
      selection,
      justificationFor(selection),
    );
    assert.equal(rows.length, 2);
    assert.equal(rowOf(rows, 2).total_score, null);
    assert.equal(rowOf(rows, 2).confidence, items[1].snapshot.breakdown.confidence?.level ?? null); // still read, still stored
    assert.notEqual(rowOf(rows, 2).rank, null); // a thin cell is shown; it is simply not ranked by a deal score
  });

  it("Day 18: a cancelled car's invoice has no confidence — the row stores null and is still written", () => {
    const items = [fixture(1), fixture(2, { cancelled: "2026-09-10" }, { score: null })];
    const selection = selectThree({ listings: items.map((f) => f.candidate) });
    const rows = toSearchResultRows(SEARCH_ID, items.map((f) => f.snapshot), selection, justificationFor(selection));
    assert.equal(rows.length, 2);
    assert.equal(rowOf(rows, 2).confidence, null);
    assert.equal(rowOf(rows, 2).total_score, null);
    assert.notEqual(rowOf(rows, 2).rank, null); // in the tail, not hidden
  });

  it("km_declared null is stored as null, not as a zero", () => {
    const items = [fixture(1, {}, { km_declared: null })];
    const selection = selectThree({ listings: items.map((f) => f.candidate) });
    const rows = toSearchResultRows(
      SEARCH_ID,
      items.map((f) => f.snapshot),
      selection,
      justificationFor(selection),
    );
    assert.equal(rows[0].km_snapshot, null);
  });
});

describe("toSearchResultRows — the recording columns (Days 22–23, Run 5 §2)", () => {
  // The runner-up is the selection's own field; a literal RunnerUp is enough to place the fact on one row.
  const withRunnerUp = (selection: SelectionResult, listing_id: number): SelectionResult => ({
    ...selection,
    runner_ups: { cheapest: { listing_id, gap: 3.2, price_over_pct: 4.1, triggered: true } },
  });
  const withoutRunnerUp = (selection: SelectionResult): SelectionResult => ({ ...selection, runner_ups: { cheapest: null } });

  const mapped = (items: Fixture[], selection: SelectionResult, out: JustificationOutput): SearchResultRow[] =>
    toSearchResultRows(
      SEARCH_ID,
      items.map((f) => f.snapshot),
      selection,
      out,
    );

  it("the six columns are copied field by field from the generator's output", () => {
    const { items, selection } = run();
    const out = justificationFor(selection);
    out.cars[0] = carJust({
      listing_id: out.cars[0].listing_id,
      kind: "pick_reason",
      fact: "ownership",
      sentence: "אחת מ-2 מ-5 שעברו רק בבעלות פרטית",
      tag: TAG_CHEAPER_THAN_CHEAPEST,
      values: { one_of: 2, of: 5 },
    });
    const row = rowOf(mapped(items, selection, out), out.cars[0].listing_id);
    assert.equal(row.sentence_kind, "pick_reason");
    assert.equal(row.sentence_fact, "ownership");
    assert.equal(row.sentence_text, "אחת מ-2 מ-5 שעברו רק בבעלות פרטית");
    assert.deepEqual(row.sentence_values, { one_of: 2, of: 5 });
    assert.equal(row.cheaper_than_cheapest, true); // the tag is stored as the boolean, never as its text
  });

  it("an empty sentence -> sentence_text null, kind 'empty', fact null, values null", () => {
    const { items, selection } = run();
    const out = justificationFor(selection);
    const id = out.cars[0].listing_id;
    out.cars[0] = carJust({ listing_id: id, kind: "empty", fact: null, sentence: "", values: {} });
    const row = rowOf(mapped(items, selection, out), id);
    assert.equal(row.sentence_kind, "empty");
    assert.equal(row.sentence_fact, null);
    assert.equal(row.sentence_text, null);
    assert.equal(row.sentence_values, null); // the library's `values` is {} there — the column stores null
    assert.equal(row.cheaper_than_cheapest, false);
  });

  it("a hidden row is absent from the output and gets the six defaults", () => {
    const { items, selection } = run();
    const rows = mapped(items, selection, justificationFor(selection));
    for (const id of [MERGED, EXCLUDED]) {
      const row = rowOf(rows, id);
      assert.equal(row.rank, null);
      assert.deepEqual(
        [row.sentence_kind, row.sentence_fact, row.sentence_text, row.sentence_values, row.cheaper_than_cheapest, row.runner_up_fact],
        [null, null, null, null, false, null],
      );
    }
  });

  it("runner_up_fact lands on the runner-up's OWN row and on no other", () => {
    const items = pool();
    const selection = withRunnerUp(selectThree({ listings: items.map((f) => f.candidate) }), 4);
    const rows = mapped(items, selection, justificationFor(selection, "יד ראשונה"));
    assert.equal(rowOf(rows, 4).runner_up_fact, "יד ראשונה");
    for (const r of rows.filter((x) => x.listing_id !== 4)) assert.equal(r.runner_up_fact, null);
  });

  it("no runner-up -> every row's runner_up_fact is null", () => {
    const items = pool();
    const selection = withoutRunnerUp(selectThree({ listings: items.map((f) => f.candidate) }));
    const rows = mapped(items, selection, justificationFor(selection, "יד ראשונה"));
    for (const r of rows) assert.equal(r.runner_up_fact, null);
  });

  it("a shown listing missing from the output is a stop", () => {
    const { items, selection } = run();
    const out = justificationFor(selection);
    out.cars = out.cars.filter((c) => c.listing_id !== 1);
    assert.throws(() => mapped(items, selection, out), /listing 1 is shown but the generator wrote no row for it/);
  });

  it("a hidden listing present in the output is a stop", () => {
    const { items, selection } = run();
    const out = justificationFor(selection);
    out.cars.push(carJust({ listing_id: MERGED }));
    assert.throws(() => mapped(items, selection, out), new RegExp(`listing ${MERGED} is hidden but the generator wrote a sentence for it`));
  });
});

describe("latestScoreIdByListing — the invoice pointer (§0.5)", () => {
  const NOW = new Date("2026-09-13T12:00:00.000Z");
  const at = (id: number, listing_id: number, iso: string): ScoreRowRef => ({ id, listing_id, scored_at: new Date(iso) });

  it("picks the row with the latest scored_at", () => {
    const map = latestScoreIdByListing(
      [at(1, 7, "2026-09-01T00:00:00.000Z"), at(2, 7, "2026-09-11T00:00:00.000Z"), at(3, 7, "2026-09-05T00:00:00.000Z")],
      NOW,
    );
    assert.equal(map.get(7), 2);
  });

  it("honours <= now: a row scored after the search's moment is not the row the search saw", () => {
    const rows = [at(1, 7, "2026-09-01T00:00:00.000Z"), at(2, 7, "2026-09-13T18:00:00.000Z")];
    assert.equal(latestScoreIdByListing(rows, NOW).get(7), 1);
    // a row scored exactly AT now is the row the search saw — the bound is inclusive
    assert.equal(latestScoreIdByListing([...rows, at(3, 7, NOW.toISOString())], NOW).get(7), 3);
  });

  it("ties on scored_at go to the highest id", () => {
    const same = "2026-09-10T00:00:00.000Z";
    assert.equal(latestScoreIdByListing([at(4, 7, same), at(9, 7, same), at(6, 7, same)], NOW).get(7), 9);
  });

  it("a listing with no row at or before now is absent from the map — the row stores null", () => {
    const map = latestScoreIdByListing([at(1, 7, "2026-09-01T00:00:00.000Z"), at(2, 8, "2026-09-20T00:00:00.000Z")], NOW);
    assert.equal(map.get(7), 1);
    assert.equal(map.get(8), undefined);
    assert.equal(map.get(9), undefined);
    assert.equal(map.size, 1);
  });

  it("each listing is resolved on its own rows", () => {
    const map = latestScoreIdByListing(
      [at(1, 7, "2026-09-01T00:00:00.000Z"), at(2, 8, "2026-09-02T00:00:00.000Z"), at(3, 7, "2026-09-03T00:00:00.000Z"), at(4, 8, "2026-09-11T00:00:00.000Z")],
      NOW,
    );
    assert.deepEqual([...map.entries()].sort((a, b) => a[0] - b[0]), [
      [7, 3],
      [8, 4],
    ]);
  });

  it("no rows at all is an empty map, not a throw", () => {
    assert.equal(latestScoreIdByListing([], NOW).size, 0);
  });
});
