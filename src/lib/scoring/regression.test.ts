// BRIEF Day 17 run 4 §2.3 — the regression classifier, on the pure module.
//
// No database and no engine: `scoreWith` is a stub, so each test says exactly what a recomputation
// with given norm rows at a given clock returns, and the test is about which label that earns. The
// stored breakdown is a ScoreResult-shaped object, as listings.score_breakdown / listing_scores.breakdown
// really hold one.
//
// Day 17 run 5 §3: the composed label names only the rows that BOTH moved and were READ by the stored
// score — the cell row always, the slope row only when that invoice's km row used the model slope, the
// anchor row only when that invoice's price row came from the anchor. storedBreakdown() can set either
// mark, and the cases below pin both halves: named, and printed-but-not-named.

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
    facts: { dealer_transfers: null, months_since_test: null, km_per_month_since_test: null, test_expiry: null, months_left: null, current_owner_registry: null },
    confidence: { level: "high", items: [] },
    ...over,
  };
}

const CURRENT = result(); // deal 6, condition -5, high
const STORED_TRIPLE = { score: 6.5, condition_score: -5, confidence: "high" };

/** The stored invoice: the same inputs, the deal the stored side holds; `over` moves one raw value. */
function storedBreakdown(
  over: { median_price?: number; sample_size?: number; price?: number; price_from_anchor?: boolean; slope_source?: "model" | "default" } = {},
): ScoreResult {
  const r = result({ deal_score: 6.5, price_advantage: 5.5 });
  r.rows[0].raw = {
    price: over.price ?? 100_000,
    median_price: over.median_price ?? 92_500,
    sample_size: over.sample_size ?? 20,
    window_days: 90,
  };
  // §3's two marks, exactly as the engine writes them: price.ts writes source 'anchor' with note
  // 'vs_new_price' on the thin-cell path, km.ts writes raw.slope_source 'model' or 'default'. The price
  // row's raw stays the market one either way, so storedNorm()'s earlier set check never fires — these
  // cases are about which rows the LABEL names, not about the cell's set moving.
  if (over.price_from_anchor) {
    r.rows[0].source = "anchor";
    r.rows[0].note = "vs_new_price";
  }
  if (over.slope_source) (r.rows[2].raw as Record<string, unknown>).slope_source = over.slope_source;
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
    // §3: the anchor row is named only when the stored score read it, so the stored invoice here is a
    // thin-cell one (price row marked vs_new_price). The case and its assertions are otherwise unchanged.
    const c = run(
      { norms: { ...CURRENT_NORMS, anchor: poolNorm({ id: 2, anchor_n: 5 }) }, breakdown: storedBreakdown({ price_from_anchor: true }) },
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

describe("the composed label names only the rows the old score READ (Day 17 run 5 §3)", () => {
  // A second anchor row, so a test can move the anchor without touching anything else.
  const OTHER_ANCHOR = poolNorm({ id: 2, anchor_n: 5 });

  it("cell row only: it moved, the other two did not -> NORM (median)", () => {
    // The stored invoice used the DEFAULT slope and a market price row, so neither of the other two rows
    // was read — and neither moved. The cell row is read by every score, so it is named.
    const c = run(
      {
        norms: { ...CURRENT_NORMS, median: STORED_CELL },
        breakdown: storedBreakdown({ median_price: 93_150, slope_source: "default" }),
      },
      reproduces((n) => idsOf(n) === "88/5/3"),
    );
    assert.equal(c?.label, "NORM (median)");
    assert.ok(c?.detail.some((d) => d.includes("cell row market_stats 88 -> 104")));
    assert.ok(!c?.detail.some((d) => d.includes("not named")));
  });

  it("slope row only, with the model slope in use -> NORM (slope)", () => {
    const c = run(
      { norms: { ...CURRENT_NORMS, slope: STORED_SLOPE }, breakdown: storedBreakdown({ slope_source: "model" }) },
      reproduces((n) => idsOf(n) === "104/1/3"),
    );
    assert.equal(c?.label, "NORM (slope)");
    assert.ok(c?.detail.some((d) => d.includes("model row model_stats 1 -> 5")));
    assert.ok(!c?.detail.some((d) => d.includes("not named")));
  });

  it("the slope row differs but the stored score used the DEFAULT slope -> slope is not named", () => {
    // The cell row moved too, so there is still a label; the slope line is printed with its reason.
    const c = run(
      {
        norms: { median: STORED_CELL, slope: STORED_SLOPE, anchor: INPUT.pool_stats },
        breakdown: storedBreakdown({ median_price: 93_150, slope_source: "default" }),
      },
      reproduces((n) => idsOf(n) === "88/1/3"),
    );
    assert.equal(c?.label, "NORM (median)");
    assert.ok(c?.detail.some((d) => d.includes("model row model_stats 1 -> 5") && d.includes("not named: the stored score's km row used the default slope")));
    // the identity itself is unchanged: still one recomputation with ALL three stored rows
    assert.ok(c?.detail.some((d) => d.includes("recomputed with the STORED norm rows (median 88, slope 1, anchor 3)")));
  });

  it("the anchor row differs but the stored price row came from the cell -> anchor is not named", () => {
    const c = run(
      {
        norms: { median: STORED_CELL, slope: INPUT.model_stats, anchor: OTHER_ANCHOR },
        breakdown: storedBreakdown({ median_price: 93_150 }), // price row source 'market' — the anchor was never read
      },
      reproduces((n) => idsOf(n) === "88/5/2"),
    );
    assert.equal(c?.label, "NORM (median)");
    assert.ok(c?.detail.some((d) => d.includes("pool row pool_stats 2 -> 3") && d.includes("not named: the stored score's price row came from the cell")));
  });

  it("a thin cell (price row marked vs_new_price) with the anchor row differing -> NORM (anchor)", () => {
    const c = run(
      { norms: { ...CURRENT_NORMS, anchor: OTHER_ANCHOR }, breakdown: storedBreakdown({ price_from_anchor: true }) },
      reproduces((n) => idsOf(n) === "104/5/2"),
    );
    assert.equal(c?.label, "NORM (anchor)");
    assert.ok(c?.detail.some((d) => d.includes("pool row pool_stats 2 -> 3")));
    assert.ok(!c?.detail.some((d) => d.includes("not named")));
  });

  it("several read rows differing -> the composed name", () => {
    // A thin-cell invoice on the model slope: all three rows were read, and all three moved.
    const c = run(
      {
        norms: { median: STORED_CELL, slope: STORED_SLOPE, anchor: OTHER_ANCHOR },
        breakdown: storedBreakdown({ median_price: 93_150, price_from_anchor: true, slope_source: "model" }),
      },
      reproduces((n) => idsOf(n) === "88/1/2"),
    );
    assert.equal(c?.label, "NORM (median, slope, anchor)");
    assert.ok(!c?.detail.some((d) => d.includes("not named")));
    assert.ok(c?.detail.some((d) => d.includes("recomputed with the STORED norm rows (median 88, slope 1, anchor 2)")));
  });

  it("every row that moved is one the stored score never read -> no NORM (...) is claimed", () => {
    // The rule names no row, and there is no label for that: the line stays UNEXPLAINED and says so
    // rather than widening back to the rows that moved. (Not reachable on today's data — see REPORT.md.)
    const c = run(
      {
        norms: { median: INPUT.market, slope: STORED_SLOPE, anchor: OTHER_ANCHOR },
        breakdown: storedBreakdown({ slope_source: "default" }), // default slope, market price row
      },
      reproduces((n) => idsOf(n) === "104/1/2"),
    );
    assert.equal(c?.label, "UNEXPLAINED");
    assert.ok(c?.detail.some((d) => d.includes("no row that moved was read by the stored score")));
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

// Day 18 run 3c §13.3: a row with the current cell row's values under another id — what a version write's norms run
// appends for a cell whose market did not move.
const SAME_VALUES_CELL: CellNorm = cell({ id: 88, median_price: 92_500, median_km: 50_000, median_history: -6, sample_size: 20, window_days: 90 });

describe("the auditor at a version write (Day 18 run 3c §13.3)", () => {
  // A stored v3 score against the current engine. The stub stands for the recomputation: the current engine, the norm
  // rows it is handed, the stored clock. The names come from comparing the stored rows' VALUES with the current ones.
  const V3 = { engine_version: 3 };
  const STORED_RESULT = () => result({ deal_score: STORED_TRIPLE.score, price_advantage: 5.5 });
  const ALWAYS: ScoreWith = () => STORED_RESULT();

  /** The invoice with its price row taken from the anchor, as price.ts writes it on the thin-cell path. */
  function anchored(r: ScoreResult): ScoreResult {
    r.rows[0] = { ...r.rows[0], source: "anchor", note: "vs_new_price", raw: { ...r.rows[0].raw, ratio: 0.7, age: 4.2 } };
    return r;
  }
  function runV(over: Partial<StoredSide>, scoreWith: ScoreWith, opts: { norms?: NormRows; current?: ScoreResult } = {}) {
    return classify({
      make: "יונדאי", model: "IONIQ HYBRID",
      result: opts.current ?? CURRENT, input: INPUT, norms: opts.norms ?? CURRENT_NORMS,
      stored: stored({ ...V3, ...over }),
      engine_version: ENGINE_VERSION,
      scoreWith,
    });
  }

  it("reproduced, rows value-identical -> VERSION", () => {
    const c = runV({}, ALWAYS);
    assert.equal(c?.label, "VERSION");
    assert.ok(c?.detail.includes(`stored engine_version 3 -> ${ENGINE_VERSION}`));
    assert.ok(c?.detail.some((d) => d.includes("= the stored values")));
  });

  it("cell values differ -> VERSION (median)", () => {
    const c = runV({ norms: { ...CURRENT_NORMS, median: STORED_CELL } }, ALWAYS);
    assert.equal(c?.label, "VERSION (median)");
    assert.ok(c?.detail.some((d) => d.includes("cell row market_stats 88 -> 104")));
  });

  it("slope in use and its values differ -> VERSION (slope)", () => {
    const c = runV({ norms: { ...CURRENT_NORMS, slope: STORED_SLOPE }, breakdown: storedBreakdown({ slope_source: "model" }) }, ALWAYS);
    assert.equal(c?.label, "VERSION (slope)");
  });

  it("slope values differ but the stored score used the default slope -> not named", () => {
    const c = runV({ norms: { ...CURRENT_NORMS, slope: STORED_SLOPE }, breakdown: storedBreakdown({ slope_source: "default" }) }, ALWAYS);
    assert.equal(c?.label, "VERSION");
    assert.ok(c?.detail.some((d) => d.includes("not named: the stored score's km row used the default slope")));
  });

  it("both differ -> VERSION (median, slope)", () => {
    const c = runV({ norms: { median: STORED_CELL, slope: STORED_SLOPE, anchor: INPUT.pool_stats } }, ALWAYS);
    assert.equal(c?.label, "VERSION (median, slope)");
  });

  it("thin cell, the curve differs, both invoices anchored -> VERSION (anchor)", () => {
    const c = runV(
      { norms: { ...CURRENT_NORMS, anchor: poolNorm({ id: 2, anchor_ratio_intercept: 0.8 }) }, breakdown: anchored(storedBreakdown()) },
      ALWAYS,
      { current: anchored(result()) },
    );
    assert.equal(c?.label, "VERSION (anchor)");
    assert.ok(c?.detail.some((d) => d.includes("pool row pool_stats 2 -> 3")));
  });

  it("a new pointer with identical values -> plain VERSION", () => {
    const sameSlope = modelNorm({ id: 1, km_slope: -1.181408, km_slope_n: 134 });
    const c = runV({ norms: { ...CURRENT_NORMS, median: SAME_VALUES_CELL, slope: sameSlope } }, ALWAYS);
    assert.equal(c?.label, "VERSION");
    assert.ok(!c?.detail.some((d) => d.includes("cell row") || d.includes("model row")));
  });

  it("pre-v4 pool row + a stored vs_new_price row: anchored with the old curve, reproduces; new invoice without it -> VERSION (anchor gate)", () => {
    const pre = poolNorm({ id: 3, anchor_ratio_intercept: 0.804155, anchor_ratio_per_year: -0.036953, anchor_points: null });
    const seen: NormRows[] = [];
    const c = runV(
      { norms: { ...CURRENT_NORMS, anchor: pre }, breakdown: anchored(storedBreakdown()) },
      (n) => {
        seen.push(n);
        const pts = n.anchor?.anchor_points ?? null;
        const own = pts !== null && pts.length === 1 && pts[0].make === INPUT.car.make && pts[0].model === INPUT.car.model && pts[0].year === INPUT.car.year;
        return own ? STORED_RESULT() : CURRENT;
      },
      { norms: { ...CURRENT_NORMS, anchor: pre } }, // as in Run 3c: the current score reads the same pre-v4 row
    );
    assert.equal(c?.label, "VERSION (anchor gate)");
    // the curve is the stored row's own; only the yes / no came from the record
    assert.equal(seen.length, 1);
    assert.equal(seen[0].anchor?.anchor_ratio_intercept, 0.804155);
    assert.equal(seen[0].anchor?.anchor_ratio_per_year, -0.036953);
    assert.ok(c?.detail.some((d) => d.includes("synthetic point MAKE MODEL 2021")));
    assert.ok(c?.detail.some((d) => d.includes("vs_new_price price row in the stored invoice only")));
  });

  it("pre-v4 pool row + no stored anchor row: the recomputation anchors nothing and reproduces", () => {
    const pre = poolNorm({ id: 3, anchor_points: null });
    const c = runV(
      { norms: { ...CURRENT_NORMS, anchor: pre } },
      (n) => (JSON.stringify(n.anchor?.anchor_points) === "[]" ? STORED_RESULT() : CURRENT),
      { norms: { ...CURRENT_NORMS, anchor: pre } },
    );
    assert.equal(c?.label, "VERSION");
    assert.ok(c?.detail.some((d) => d.includes("the recomputation reads no point")));
  });

  it("not reproduced, pair (3, 4) -> UNEXPLAINED with the line", () => {
    const c = runV({}, NEVER);
    assert.equal(c?.label, "UNEXPLAINED");
    assert.ok(c?.detail.includes(`engine moved a listing; no declared identity for v3 → v${ENGINE_VERSION}`));
    assert.ok(c?.detail.some((d) => d.includes("not the stored +6.5 / -5 / high")));
  });

  it("not reproduced, pair (2, 3) -> versionExpectation() as before", () => {
    // The stored deal equals the current one and every row holds: the v2 -> v3 identity passes with constant 0.
    const c = classify({
      make: "יונדאי", model: "IONIQ HYBRID",
      result: CURRENT, input: INPUT, norms: CURRENT_NORMS,
      stored: stored({ engine_version: 2, score: 6 }),
      engine_version: 3,
      scoreWith: () => result({ deal_score: 99 }),
    });
    assert.equal(c?.label, "VERSION");
    assert.ok(c?.detail.some((d) => d.includes("typical -6 -> -6 (cell constant")));
    assert.ok(!c?.detail.some((d) => d.includes("no declared identity")));
  });

  it("not reproduced, pair (2, 3), and that identity fails -> UNEXPLAINED without the undeclared line", () => {
    const c = classify({
      make: "יונדאי", model: "IONIQ HYBRID",
      result: CURRENT, input: INPUT, norms: CURRENT_NORMS,
      stored: stored({ engine_version: 2 }), // stored deal 6.5, current 6: -0.5 against an expected 0
      engine_version: 3,
      scoreWith: NEVER,
    });
    assert.equal(c?.label, "UNEXPLAINED");
    assert.ok(c?.detail.some((d) => d.includes("beyond the ±0.1 rounding allowance")));
    assert.ok(!c?.detail.some((d) => d.includes("no declared identity")));
  });

  it("an input changed -> DATA, ahead of the version rule", () => {
    const c = runV({ breakdown: storedBreakdown({ price: 99_000 }) }, ALWAYS);
    assert.equal(c?.label, "DATA");
    assert.ok(c?.detail.includes("input listing.price: 99000 -> 100000"));
  });

  it("reproduced within the rounding allowance -> VERSION, and the allowance is printed", () => {
    const c = runV({}, () => result({ deal_score: 6.6 }));
    assert.equal(c?.label, "VERSION");
    assert.ok(c?.detail.some((d) => d.includes("within the ±0.1 rounding allowance")));
  });

  it("(f) the only confidence move is color_mismatch -> VERSION (confidence: color)", () => {
    const c = runV({}, () => result({ deal_score: 6.5, confidence: { level: "medium", items: [{ kind: "color_mismatch", ref: "color:mismatch" }] } }));
    assert.equal(c?.label, "VERSION (confidence: color)");
  });

  it("(f) a confidence move by another item is not the version's -> UNEXPLAINED", () => {
    const c = runV({}, () => result({ deal_score: 6.5, confidence: { level: "medium", items: [{ kind: "possibly_sold", ref: "sold_signal:medium" }] } }));
    assert.equal(c?.label, "UNEXPLAINED");
  });
});

describe("the NORM (…) naming compares values (Day 18 run 3c §13.2 b)", () => {
  it("a pointer that moved onto identical values names nothing", () => {
    const c = run(
      { norms: { ...CURRENT_NORMS, median: SAME_VALUES_CELL } },
      (norms) => (norms.median?.id === 88 ? result({ deal_score: STORED_TRIPLE.score, price_advantage: 5.5 }) : CURRENT),
    );
    assert.equal(c?.label, "UNEXPLAINED");
    assert.ok(c?.detail.some((d) => d.includes("not named: a new row with the same values")));
  });
});
