// Day 19 (Run 5c2, §5.3) — where a pool item's five score fields come from.
// Pure: no database, no engine. The invoices here are opaque objects — this function never looks inside one.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { poolScoreOf, type PoolScore, type StoredScoreColumns } from "./pool-scores";
import type { Invoice } from "@/lib/scoring/types";

const STORED_INVOICE = { engine_version: 4, deal_score: 6 } as unknown as Invoice;
const FRESH_INVOICE = { engine_version: 5, deal_score: 6.2 } as unknown as Invoice;

const columns = (over: Partial<StoredScoreColumns> = {}): StoredScoreColumns => ({
  id: 22,
  score_breakdown: STORED_INVOICE,
  score: 6,
  market_stats_id: 104,
  model_stats_id: 5,
  pool_stats_id: 3,
  ...over,
});

const freshEntry: PoolScore = {
  breakdown: FRESH_INVOICE,
  score: 6.2,
  market_stats_id: 901,
  model_stats_id: 902,
  pool_stats_id: 903,
};

describe('poolScoreOf() — "stored"', () => {
  it("reads the listing's own columns", () => {
    assert.deepEqual(poolScoreOf(columns(), "stored"), {
      breakdown: STORED_INVOICE,
      score: 6,
      market_stats_id: 104,
      model_stats_id: 5,
      pool_stats_id: 3,
    });
  });

  it("a stored score_breakdown of null -> null: the listing has no score on that side", () => {
    assert.equal(poolScoreOf(columns({ score_breakdown: null }), "stored"), null);
  });

  it("a null deal score and null norm pointers are carried, not turned into 'no score'", () => {
    const s = poolScoreOf(columns({ score: null, market_stats_id: null, model_stats_id: null, pool_stats_id: null }), "stored");
    assert.notEqual(s, null);
    assert.equal(s?.score, null);
    assert.equal(s?.market_stats_id, null);
  });
});

describe("poolScoreOf() — a map", () => {
  const map = new Map<number, PoolScore>([[22, freshEntry]]);

  it("reads the map's entry for that listing id", () => {
    assert.deepEqual(poolScoreOf(columns(), map), freshEntry);
  });

  it("the THREE NORM IDS come from the map, never from the listing's columns", () => {
    const s = poolScoreOf(columns({ market_stats_id: 104, model_stats_id: 5, pool_stats_id: 3 }), map);
    assert.equal(s?.market_stats_id, 901);
    assert.equal(s?.model_stats_id, 902);
    assert.equal(s?.pool_stats_id, 903);
  });

  it("the invoice and the deal score come from the map too", () => {
    const s = poolScoreOf(columns(), map);
    assert.equal(s?.breakdown, FRESH_INVOICE);
    assert.equal(s?.score, 6.2);
  });

  it("no entry for the listing -> null, even when the listing has stored columns", () => {
    assert.equal(poolScoreOf(columns({ id: 999 }), map), null);
  });

  it("a map entry wins over a null score_breakdown — the sides are independent", () => {
    assert.deepEqual(poolScoreOf(columns({ score_breakdown: null }), map), freshEntry);
  });
});
