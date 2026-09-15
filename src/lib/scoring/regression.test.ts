// BRIEF Day 17 run 4 §2.3 — the regression classifier, on the pure module.
//
// No database and no engine: `scoreWith` is a stub, so each test says exactly what a recomputation
// with given norm rows at a given clock returns, and the test is about which label that earns. The
// stored breakdown is a ScoreResult-shaped object, as listings.score_breakdown / listing_scores.breakdown
// really hold one.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ENGINE_VERSION } from "./constants";
import { classify, type NormRows, type ScoreWith, type StoredSide } from "./regression";
import { cell, input as scoringInput, modelNorm, poolNorm, rows } from "./fixtures";
import type { CellNorm, ScoreResult } from "./types";

const SCORED_AT = new Date("2026-09-11T00:23:59.420Z");

// The listing's data, as it is now. The stored breakdown below carries exactly these inputs, so nothing
// is a DATA difference unless a test makes it one.
const INPUT = scoringInput({
  listing: { price: 100_000, km_declared: 60_000 },
  car: { hand: 2, ownership_history: rows("private 2021-01") },
  market: cell({ id: 104, median_price: 92_500, median_km: 50_000, median_history: -6, sample_size: 20, window_days: 90 }),
  model_stats: modelNorm({ id: 5, km_slope: -1.181408, km_slope_n: 134 }),
  pool_stats: poolNorm({ id: 3 }),
});
const CURRENT_NORMS: NormRows = { median: INPUT.market, slope: INPUT.model_stats, anchor: INPUT.pool_stats };

// The cell row and the slope row the stored score used, where a test says they moved.
const STORED_CELL: CellNorm = cell({ id: 88, median_price: 93_150, median_km: 50_000, median_history: -6, sample_size: 20, window_days: 90 });
const STORED_SLOPE = modelNorm({ id: 1, km_slope: -1.18570979569166, km_slope_n: 173 });

/** An invoice. `over` names the few fields a test is about; everything else is a plausible constant. */
function result(over: Partial<ScoreResult> = {}): ScoreResult {
  return {
    engine_version: ENGINE_VERSION,
    unit: "pct_of_value",
    rows: [
      { row: "price", status: "scored", source: "market", value: 5, raw: { price: 100_000, median_price: 92_500, sample_size: 20, window_days: 90 } },
      { row: "history", status: "scored", source: "mot", value: -4, raw: { paper_hand: 2, owners: [{ ym: "2021-01", type: "private" }] } },
      { row: "km", status: "scored", source: "market", value: -1, raw: { km_declared: 60_000, median_km: 50_000, slope_source: "model" } },
    ],
    condition_score: -5,
    condition_by_reality: -5,
    typical_history: -6,
    condition_vs_typical: 1,
    price_advantage: 5,
    deal_score: 6,
    checks: [],
    sold_signal: { strength: null, evidence: [] },
    facts: { dealer_transfers: null, months_since_test: null, km_per_month_since_test: null, test_expiry: null, months_left: null },
    confidence: { level: "high", items: [] },
    ...over,
  };
}

const CURRENT = result(); // deal 6, condition -5, high
const STORED_TRIPLE = { score: 6.5, condition_score: -5, confidence: "high" };

/** The stored invoice: the same inputs, the deal the stored side holds; `over` moves one raw value. */
function storedBreakdown(over: { median_price?: number; sample_size?: number; price?: number } = {}): ScoreResult {
  const r = result({ deal_score: 6.5, price_advantage: 5.5 });
  r.rows[0].raw = {
    price: over.price ?? 100_000,
    median_price: over.median_price ?? 92_500,
    sample_size: over.sample_size ?? 20,
    window_days: 90,
  };
  return r;
}

function stored(over: Partial<StoredSide> = {}): StoredSide {
  return {
    score: STORED_TRIPLE.score,
    condition_score: STORED_TRIPLE.condition_score,
    confidence: STORED_TRIPLE.confidence,
    engine_version: ENGINE_VERSION,
    scored_at: SCORED_AT,
    breakdown: storedBreakdown(),
    norms: CURRENT_NORMS,
    missing: [],
    ...over,
  };
}

/** A recomputation that returns the STORED triple for `when`, and the current one for anything else. */
function reproduces(when: (norms: NormRows) => boolean): ScoreWith {
  return (norms) => (when(norms) ? result({ deal_score: STORED_TRIPLE.score, price_advantage: 5.5 }) : CURRENT);
}
const NEVER: ScoreWith = () => CURRENT;

function run(over: Partial<StoredSide>, scoreWith: ScoreWith, norms: NormRows = CURRENT_NORMS) {
  return classify({
    make: "יונדאי", model: "IONIQ HYBRID",
    result: CURRENT, input: INPUT, norms,
    stored: stored(over),
    engine_version: ENGINE_VERSION,
    scoreWith,
  });
}

const idsOf = (n: NormRows) => `${n.median?.id ?? "-"}/${n.slope?.id ?? "-"}/${n.anchor?.id ?? "-"}`;

describe("the composed norm identity (§2.2)", () => {
  it("the cell row moved and reproduces the stored score -> NORM (median)", () => {
    const c = run(
      { norms: { ...CURRENT_NORMS, median: STORED_CELL }, breakdown: storedBreakdown({ median_price: 93_150 }) },
      reproduces((n) => idsOf(n) === "88/5/3"),
    );
    assert.equal(c?.label, "NORM (median)");
    assert.ok(c?.detail.some((d) => d.includes("cell row market_stats 88 -> 104")));
    assert.ok(c?.detail.some((d) => d.includes("the same set, different medians")));
    assert.ok(c?.detail.some((d) => d.includes("= the stored values")));
  });

  it("the slope row moved and reproduces the stored score -> NORM (slope)", () => {
    const c = run(
      { norms: { ...CURRENT_NORMS, slope: STORED_SLOPE } },
      reproduces((n) => idsOf(n) === "104/1/3"),
    );
    assert.equal(c?.label, "NORM (slope)");
    assert.ok(c?.detail.some((d) => d.includes("model row model_stats 1 -> 5 (יונדאי IONIQ HYBRID)")));
  });

  it("both moved and only the two together reproduce it -> NORM (median, slope)", () => {
    const c = run(
      { norms: { median: STORED_CELL, slope: STORED_SLOPE, anchor: INPUT.pool_stats }, breakdown: storedBreakdown({ median_price: 93_150 }) },
      // Neither row alone would do it — the stub answers only for both at once, as 128 and 141 need.
      reproduces((n) => idsOf(n) === "88/1/3"),
    );
    assert.equal(c?.label, "NORM (median, slope)");
    assert.ok(c?.detail.some((d) => d.includes("cell row market_stats 88 -> 104")));
    assert.ok(c?.detail.some((d) => d.includes("model row model_stats 1 -> 5")));
    assert.ok(c?.detail.some((d) => d.includes("recomputed with the STORED norm rows (median 88, slope 1, anchor 3)")));
  });

  it("the anchor row moved and reproduces the stored score -> NORM (anchor)", () => {
    const c = run(
      { norms: { ...CURRENT_NORMS, anchor: poolNorm({ id: 2, anchor_n: 5 }) } },
      reproduces((n) => idsOf(n) === "104/5/2"),
    );
    assert.equal(c?.label, "NORM (anchor)");
    assert.ok(c?.detail.some((d) => d.includes("pool row pool_stats 2 -> 3")));
  });

  it("a stored row that does not reproduce the stored score -> UNEXPLAINED, with the attempt printed", () => {
    const c = run({ norms: { ...CURRENT_NORMS, slope: STORED_SLOPE } }, NEVER);
    assert.equal(c?.label, "UNEXPLAINED");
    assert.ok(c?.detail.some((d) => d.includes("the identity does not hold")));
    assert.ok(c?.detail.some((d) => d.includes("not the stored +6.5 / -5 / high")));
  });

  it("a stored norm row that is gone from its table is not read as 'there was no row'", () => {
    const c = run({ norms: { ...CURRENT_NORMS, slope: null }, missing: ["slope"] }, NEVER);
    assert.equal(c?.label, "UNEXPLAINED");
    assert.ok(c?.detail.some((d) => d.includes("no longer in their table")));
  });
});

describe("the labels that were already there (§2.1)", () => {
  it("no stored score at all -> NEW", () => {
    const c = run({ score: null, condition_score: null, confidence: null, engine_version: null, scored_at: null, breakdown: null }, NEVER);
    assert.equal(c?.label, "NEW");
    assert.ok(c?.detail.some((d) => d.includes("first scoring")));
  });

  it("--against: a listing with no listing_scores row of that day or earlier -> NEW", () => {
    // The script hands the module its NO_STORED: every field null, exactly as an unscored listing.
    const c = run(
      { score: null, condition_score: null, confidence: null, engine_version: null, scored_at: null, breakdown: null, norms: { median: null, slope: null, anchor: null } },
      NEVER,
    );
    assert.equal(c?.label, "NEW");
  });

  it("the same inputs and norm rows, only the clock moved back -> CLOCK", () => {
    const c = run({}, (_norms, at) => (at.getTime() === SCORED_AT.getTime() ? result({ deal_score: STORED_TRIPLE.score, price_advantage: 5.5 }) : CURRENT));
    assert.equal(c?.label, "CLOCK");
    assert.ok(c?.detail.some((d) => d.includes("recomputed with now = stored scored_at")));
  });

  it("an input the stored breakdown carries has changed -> DATA", () => {
    const c = run({ breakdown: storedBreakdown({ price: 99_000 }) }, NEVER);
    assert.equal(c?.label, "DATA");
    assert.deepEqual(c?.detail, ["input listing.price: 99000 -> 100000"]);
  });

  it("the cell's SET moved (sample_size) -> NORM, ahead of the composed identity", () => {
    const c = run(
      { norms: { ...CURRENT_NORMS, median: STORED_CELL }, breakdown: storedBreakdown({ sample_size: 14 }) },
      // The composed identity would verify here; NORM is still the label, because the SET moved.
      reproduces((n) => idsOf(n) === "88/5/3"),
    );
    assert.equal(c?.label, "NORM");
    assert.ok(c?.detail.some((d) => d.includes("norm sample_size: 14 -> 20")));
  });

  it("stored and recomputed agree -> no line at all", () => {
    const c = classify({
      make: "יונדאי", model: "IONIQ HYBRID",
      result: CURRENT, input: INPUT, norms: CURRENT_NORMS,
      stored: stored({ score: CURRENT.deal_score, condition_score: CURRENT.condition_score, confidence: "high" }),
      engine_version: ENGINE_VERSION,
      scoreWith: NEVER,
    });
    assert.equal(c, null);
  });
});
