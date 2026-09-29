// BRIEF Days 22–23, Run 5, §6.3 — the PURE half of why.ts, over stored-row fixtures of load.test.ts's shape.
// No database: storedWhyLines() is the half that reads, and it is not tested here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { storedJustificationSearch } from "./why";
import type { ResultRow } from "./load";
import type { SearchFilters } from "./filters";
import { invoice } from "@/lib/selection/fixtures";
import { RULE_TYPE, type RuleTrace } from "@/lib/selection";
import type { Invoice } from "@/lib/scoring/types";
import type { Prisma } from "@/generated/prisma/client";

/** A rule record as the JSON column holds it — load.test.ts's helper, the same cast run.ts makes. */
function trace(over: Partial<RuleTrace> & Pick<RuleTrace, "rule">): Prisma.JsonValue {
  const record: RuleTrace = { type: RULE_TYPE[over.rule], value: null, threshold: null, triggered: true, effect: "none", context: {}, ...over };
  return record as unknown as Prisma.JsonValue;
}

/** A recorded runner-up, as picks.ts writes it on the cheapest pick's row. */
const runnerUpRecord = (listing_id: number): Prisma.JsonValue =>
  trace({ rule: "cheapest_runner_up", value: 3.2, threshold: 2, effect: "none", context: { runner_up: listing_id, price_over_pct: 4.1, band_pct: 5 } });

/** The record the rule writes when nothing stood in the band. */
const noCandidateRecord = (): Prisma.JsonValue => trace({ rule: "cheapest_runner_up", triggered: false, context: { evaluated: false, reason: "no_candidate_in_band", band_pct: 5 } });

function resultRow(over: Partial<ResultRow> & Pick<ResultRow, "listing_id">): ResultRow {
  return {
    rank: 1,
    recommendation_categories: [],
    total_score: 12.5,
    confidence: "high",
    price_snapshot: 100000,
    km_snapshot: 34000,
    market_stats_id: 200 + over.listing_id,
    listing_scores_id: 100 + over.listing_id,
    new_car_price_id: null,
    stage_b_trace: [],
    sentence_text: null,
    cheaper_than_cheapest: false,
    runner_up_fact: null,
    ...over,
  };
}

// The run's own two maps, as storedWhyLines() reads them from the database: one invoice per listing_scores_id,
// one median per market_stats_id.
const invoicesFor = (rows: readonly ResultRow[]): Map<number, Invoice> =>
  new Map(rows.map((r) => [r.listing_scores_id as number, invoice({ id: r.listing_id, price: r.price_snapshot }) as Invoice]));
const mediansFor = (rows: readonly ResultRow[]): Map<number, number | null> => new Map(rows.map((r) => [r.market_stats_id as number, 100000]));

const NO_FILTERS: SearchFilters = {};
const searchOf = (rows: readonly ResultRow[], filters: SearchFilters = NO_FILTERS) =>
  storedJustificationSearch({ rows, filters, invoices: invoicesFor(rows), medians: mediansFor(rows) });

describe("§6.1 storedJustificationSearch() — the generator's input from stored rows", () => {
  it("crowned: true when the rows carry picks, false when they carry none", () => {
    const crowned = [resultRow({ listing_id: 11, recommendation_categories: ["best_value"] }), resultRow({ listing_id: 12, rank: 2 })];
    assert.equal(searchOf(crowned).crowned, true);
    const uncrowned = [resultRow({ listing_id: 11 }), resultRow({ listing_id: 12, rank: 2 })];
    assert.equal(searchOf(uncrowned).crowned, false);
  });

  it("crowned: false when the gate's own record says it triggered", () => {
    const gated = [
      resultRow({
        listing_id: 11,
        recommendation_categories: ["best_value"],
        stage_b_trace: [trace({ rule: "crowning_threshold", triggered: true, context: { eligible: 2, verified: 2, with_comparison: 2 } })] as unknown as Prisma.JsonValue,
      }),
      resultRow({ listing_id: 12, rank: 2 }),
    ];
    assert.equal(searchOf(gated).crowned, false);
  });

  it("runner_up: the listing the cheapest pick's record names, and null when nothing stood in the band", () => {
    const named = [
      resultRow({ listing_id: 11, recommendation_categories: ["cheapest"], stage_b_trace: [runnerUpRecord(12)] as unknown as Prisma.JsonValue }),
      resultRow({ listing_id: 12, rank: 2 }),
    ];
    assert.equal(searchOf(named).runner_up, 12);
    const none = [
      resultRow({ listing_id: 11, recommendation_categories: ["cheapest"], stage_b_trace: [noCandidateRecord()] as unknown as Prisma.JsonValue }),
      resultRow({ listing_id: 12, rank: 2 }),
    ];
    assert.equal(searchOf(none).runner_up, null);
    // No cheapest pick at all: no record to read.
    assert.equal(searchOf([resultRow({ listing_id: 11 })]).runner_up, null);
  });

  it("has_price_ceiling: the stored filters' priceMax, present or absent", () => {
    const rows = [resultRow({ listing_id: 11 })];
    assert.equal(searchOf(rows, { priceMax: 120000 }).has_price_ceiling, true);
    assert.equal(searchOf(rows, { priceMin: 80000 }).has_price_ceiling, false);
    assert.equal(searchOf(rows, {}).has_price_ceiling, false);
  });

  it("the cars: one per row, in the rows' order, hidden rows included with their rank null", () => {
    const rows = [
      resultRow({ listing_id: 11, recommendation_categories: ["best_value"] }),
      resultRow({ listing_id: 12, rank: null }),
      resultRow({ listing_id: 13, rank: 2 }),
    ];
    const search = searchOf(rows);
    assert.equal(search.cars.length, 3);
    assert.deepEqual(
      search.cars.map((c) => c.listing_id),
      [11, 12, 13],
    );
    assert.deepEqual(
      search.cars.map((c) => c.rank),
      [1, null, 2],
    );
    // The fields the translator carries over, on the first car: the row's own snapshots and its invoice.
    assert.equal(search.cars[0].price, 100000);
    assert.equal(search.cars[0].km, 34000);
    assert.deepEqual(search.cars[0].categories, ["best_value"]);
    assert.equal(search.cars[0].median_price, 100000);
  });
});
