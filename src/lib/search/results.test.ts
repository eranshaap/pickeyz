// BRIEF Days 15–16, Run 2b §4: toSearchResultRows() — the `search_results` mapping, on one hand-built pool.
//
// The pool is built from src/lib/selection/fixtures.ts so that the ranks are PREDICTABLE: with the default
// invoice every condition sum is 0, so deal_score = price_advantage = -100 * (price - median) / median, and
// the Stage A order is price ascending. Prices 90,000 … 101,000 over ids 1…12 therefore give rank = id.
// On top of those twelve sit the two listings that get no rank: a duplicate of car 5 (merged) and a listing
// whose seller is not visible (excluded).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectThree, type Category, type SelectionResult } from "@/lib/selection";
import { cand, type Spec } from "@/lib/selection/fixtures";
import { FULL_TRACE_RANK, toSearchResultRows, traceFor, type ResultSnapshot, type SearchResultRow } from "./results";

const SEARCH_ID = 4242;

const SHOWN = 12; // ids 1..12, rank = id
const MERGED = 13; // a second listing of car 5, dearer than it — merged away
const EXCLUDED = 14; // seller not visible — excluded

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
      ...snap,
    },
  };
}

function pool(): Fixture[] {
  const items: Fixture[] = [];
  for (let id = 1; id <= SHOWN; id++) {
    // id 3 carries a better value_by_reality so that peace_of_mind does not land on the same car as
    // best_value — the mapping is then exercised on two distinct recommended listings, one of them double.
    // ids above FULL_TRACE_RANK rest on a 'typical' history row, which is what makes unverified_history
    // TRIGGER on them: with no triggered record the "triggered only" truncation could not be seen.
    if (id === 3) items.push(fixture(id, { reality: 5 }));
    else if (id > FULL_TRACE_RANK) items.push(fixture(id, { history_source: "typical" }));
    else items.push(fixture(id));
  }
  items.push(fixture(MERGED, { car: 5, price: 300000 })); // dearer than listing 5, so listing 5 represents car 5
  items.push(fixture(EXCLUDED, { visible: false }));
  return items;
}

function run(): { items: Fixture[]; selection: SelectionResult; rows: SearchResultRow[] } {
  const items = pool();
  const selection = selectThree({ listings: items.map((f) => f.candidate) });
  const rows = toSearchResultRows(
    SEARCH_ID,
    items.map((f) => f.snapshot),
    selection,
  );
  return { items, selection, rows };
}

const rowOf = (rows: SearchResultRow[], id: number): SearchResultRow => {
  const r = rows.find((x) => x.listing_id === id);
  assert.ok(r !== undefined, `no row for listing ${id}`);
  return r;
};

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
    assert.deepEqual(toSearchResultRows(SEARCH_ID, [], selectThree({ listings: [] })), []);
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
        ),
      /not the same pool/,
    );
    const swapped = items.map((f) => f.snapshot);
    swapped[0] = { ...swapped[0], listing_id: 999 };
    assert.throws(() => toSearchResultRows(SEARCH_ID, swapped, selection), /no result for it/);
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

describe("toSearchResultRows — the trace (§0.3)", () => {
  it(`rank <= ${FULL_TRACE_RANK} carries every record selectThree produced`, () => {
    const { selection, rows } = run();
    for (let id = 1; id <= FULL_TRACE_RANK; id++) {
      assert.deepEqual(rowOf(rows, id).stage_b_trace, selection.results.find((x) => x.listing_id === id)?.trace);
    }
    // and the full trace really does hold records the other two rules would have dropped
    assert.ok(selection.results.find((x) => x.rank === FULL_TRACE_RANK)?.trace.some((t) => !t.triggered && t.effect === "none"));
  });

  it("a rank above that carries only the records that triggered — and that is fewer", () => {
    const { selection, rows } = run();
    for (let id = FULL_TRACE_RANK + 1; id <= SHOWN; id++) {
      const r = selection.results.find((x) => x.listing_id === id);
      assert.ok(r !== undefined);
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
    // the reason each of the two lost its rank is among the kept records, which is what §0.3 is for
    assert.ok(rowOf(rows, MERGED).stage_b_trace.some((t) => t.rule === "duplicate" && t.effect === "merged"));
    assert.ok(rowOf(rows, EXCLUDED).stage_b_trace.some((t) => t.rule === "dealer_not_visible" && t.effect === "excluded"));
  });

  it("traceFor() is the whole rule and nothing else decides it", () => {
    const { selection } = run();
    for (const r of selection.results) {
      const expected =
        r.rank === null
          ? r.trace.filter((t) => t.effect !== "none" || t.triggered)
          : r.rank <= FULL_TRACE_RANK
            ? r.trace
            : r.trace.filter((t) => t.triggered);
      assert.deepEqual(traceFor(r), expected);
    }
  });
});

describe("toSearchResultRows — the recommendation (§4)", () => {
  it("was_recommended and recommendation_categories are selectThree's own answer", () => {
    const { selection, rows } = run();
    for (const r of selection.results) {
      const row = rowOf(rows, r.listing_id);
      assert.deepEqual(row.recommendation_categories, r.categories);
      assert.equal(row.was_recommended, r.categories.length > 0);
    }
  });

  it("the recommended rows are exactly the distinct picked listings, and a double winner is one row with two codes", () => {
    const { selection, rows } = run();
    const picked = [...new Set(Object.values(selection.picks).filter((v): v is number => v !== null))].sort((a, b) => a - b);
    assert.deepEqual(
      rows
        .filter((r) => r.was_recommended)
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
    for (const r of rows.filter((x) => x.was_recommended)) assert.notEqual(r.rank, null);
  });
});

describe("toSearchResultRows — the snapshot (§4)", () => {
  it("every snapshot column is the listing's value at that moment, copied and not recomputed", () => {
    const { items, rows } = run();
    for (const f of items) {
      const s = f.snapshot;
      const row = rowOf(rows, s.listing_id);
      assert.equal(row.total_score, s.score);
      assert.equal(row.score_breakdown, s.breakdown); // the stored invoice itself, not a rebuild of it
      assert.equal(row.confidence, s.breakdown.confidence.level);
      assert.equal(row.market_stats_id, s.market_stats_id);
      assert.equal(row.model_stats_id, s.model_stats_id);
      assert.equal(row.pool_stats_id, s.pool_stats_id);
      assert.equal(row.new_car_price_id, s.new_car_price_id);
      assert.equal(row.price_snapshot, s.price);
      assert.equal(row.km_snapshot, s.km_declared);
    }
    assert.ok(
      rows.some((r) => r.new_car_price_id === null),
      "the fixture must cover a listing whose key has no new-price row",
    );
  });

  it("a listing with no deal score keeps total_score null and still gets a row", () => {
    const items = [fixture(1), fixture(2, { thin: true }, { score: null })];
    const selection = selectThree({ listings: items.map((f) => f.candidate) });
    const rows = toSearchResultRows(
      SEARCH_ID,
      items.map((f) => f.snapshot),
      selection,
    );
    assert.equal(rows.length, 2);
    assert.equal(rowOf(rows, 2).total_score, null);
    assert.equal(rowOf(rows, 2).score_breakdown?.deal_score, null);
    assert.notEqual(rowOf(rows, 2).rank, null); // a thin cell is shown; it is simply not ranked by a deal score
  });

  it("km_declared null is stored as null, not as a zero", () => {
    const items = [fixture(1, {}, { km_declared: null })];
    const selection = selectThree({ listings: items.map((f) => f.candidate) });
    const rows = toSearchResultRows(
      SEARCH_ID,
      items.map((f) => f.snapshot),
      selection,
    );
    assert.equal(rows[0].km_snapshot, null);
  });
});
