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
import { slopeFor } from "./km";
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
    facts: { dealer_transfers: null, months_since_test: null, km_per_month_since_test: null, test_expiry: null, current_owner_registry: null },
    confidence: { level: "high", items: [] },
    ...over,
  };
}

const CURRENT = result(); // deal 6, condition -5, high
const STORED_TRIPLE = { score: 6.5, condition_score: -5, confidence: "high" };

/** The stored invoice: the same inputs, the deal the stored side holds; `over` moves one raw value. */
function storedBreakdown(
  over: {
    median_price?: number; sample_size?: number; price?: number; price_from_anchor?: boolean;
    slope_source?: "model" | "default";
    /** Run 5e (§2.3): the km row as km.ts writes it for a cell with no km median of its own — a thin cell. */
    km_unavailable?: boolean;
  } = {},
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
  // Run 5e (§2.3): the thin-cell km row, in the exact shape km.ts's kmRow() returns at its `thin_cell`
  // branch — no `source`, no `value`, and a `raw` that already carries the slope choice (slopeFor() is
  // called before the first unavailable return) as well as km_declared, km_observed_at, median_km and
  // based_on_n. The mark is there; the row carries no value, so the score never used the slope.
  if (over.km_unavailable) {
    r.rows[2] = {
      row: "km",
      status: "unavailable",
      reason: "thin_cell",
      raw: {
        km_declared: INPUT.listing.km_declared,
        km_observed_at: INPUT.listing.km_observed_at.toISOString(),
        ...slopeFor(INPUT.model_stats),
        median_km: INPUT.market?.median_km ?? null,
        based_on_n: INPUT.market?.sample_size ?? null,
      },
    };
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

  // Run 5e (§2): a thin-cell invoice — price row from the anchor, km row UNAVAILABLE — whose km row still
  // carries slope_source 'model' (km.ts writes the mark on an unavailable row too). That score multiplied
  // nothing by the slope, so the slope row is not one it read, and the name never carries `slope`.
  it("an unavailable km row marked slope_source 'model': the slope row moved but is not named -> NORM (anchor)", () => {
    const c = run(
      {
        norms: { median: INPUT.market, slope: STORED_SLOPE, anchor: OTHER_ANCHOR },
        breakdown: storedBreakdown({ price_from_anchor: true, km_unavailable: true, slope_source: "model" }),
      },
      reproduces((n) => idsOf(n) === "104/1/2"),
    );
    assert.equal(c?.label, "NORM (anchor)");
    assert.ok(c?.detail.some((d) => d.includes("pool row pool_stats 2 -> 3")));
    assert.ok(c?.detail.some((d) => d.includes("model row model_stats 1 -> 5") && d.includes("not named")));
  });

  it("the alarm: an unavailable km row, only the slope row moved -> UNEXPLAINED", () => {
    const c = run(
      {
        norms: { median: INPUT.market, slope: STORED_SLOPE, anchor: INPUT.pool_stats },
        breakdown: storedBreakdown({ price_from_anchor: true, km_unavailable: true, slope_source: "model" }),
      },
      reproduces((n) => idsOf(n) === "104/1/3"),
    );
    assert.equal(c?.label, "UNEXPLAINED");
    assert.ok(c?.detail.some((d) => d.includes("no row that moved was read by the stored score")));
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

  // Day 19 (5.1): the run-clock label is retired. The stored score is engine 5 here - the same engine, the same
  // recorded inputs, no read norm row changed - so a triple that still differs has no name left: UNEXPLAINED.
  it("a stored engine-5 score, nothing changed, a different triple -> UNEXPLAINED (the run-clock label is gone)", () => {
    const c = run({}, () => CURRENT);
    assert.equal(c?.label, "UNEXPLAINED");
    assert.ok(c?.detail.some((d) => d.includes("not the stored values")));
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

// Day 19 (§5.4): every stored side in this block is a clock-reading engine, so the version rule reproduces it
// by replacing its three observation dates with its own scored_at - and the label therefore leads with `age`.
// Only that name was added below; no other expectation of these tests moved.
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
    assert.equal(c?.label, "VERSION (age)");
    assert.ok(c?.detail.includes(`stored engine_version 3 -> ${ENGINE_VERSION}`));
    assert.ok(c?.detail.some((d) => d.includes("= the stored values")));
  });

  it("cell values differ -> VERSION (median)", () => {
    const c = runV({ norms: { ...CURRENT_NORMS, median: STORED_CELL } }, ALWAYS);
    assert.equal(c?.label, "VERSION (age, median)");
    assert.ok(c?.detail.some((d) => d.includes("cell row market_stats 88 -> 104")));
  });

  it("slope in use and its values differ -> VERSION (slope)", () => {
    const c = runV({ norms: { ...CURRENT_NORMS, slope: STORED_SLOPE }, breakdown: storedBreakdown({ slope_source: "model" }) }, ALWAYS);
    assert.equal(c?.label, "VERSION (age, slope)");
  });

  it("slope values differ but the stored score used the default slope -> not named", () => {
    const c = runV({ norms: { ...CURRENT_NORMS, slope: STORED_SLOPE }, breakdown: storedBreakdown({ slope_source: "default" }) }, ALWAYS);
    assert.equal(c?.label, "VERSION (age)");
    assert.ok(c?.detail.some((d) => d.includes("not named: the stored score's km row used the default slope")));
  });

  // Run 5e (§2): the same thin-cell breakdown as the NORM case above, under the version rule. The slope row
  // moved and the km row carries slope_source 'model', but that row is unavailable — the name keeps `anchor`
  // and drops `slope`.
  it("an unavailable km row marked slope_source 'model', slope and anchor moved -> VERSION (age, anchor)", () => {
    const c = runV(
      {
        norms: { median: INPUT.market, slope: STORED_SLOPE, anchor: poolNorm({ id: 2, anchor_ratio_intercept: 0.8 }) },
        breakdown: storedBreakdown({ price_from_anchor: true, km_unavailable: true, slope_source: "model" }),
      },
      ALWAYS,
      // both invoices anchored, like the thin-cell case above — so no `anchor gate` rider joins the name
      // and the case stays about the one thing it tests: which rows the name lists.
      { current: anchored(result()) },
    );
    assert.equal(c?.label, "VERSION (age, anchor)");
    assert.ok(c?.detail.some((d) => d.includes("model row model_stats 1 -> 5") && d.includes("not named")));
  });

  it("both differ -> VERSION (median, slope)", () => {
    const c = runV({ norms: { median: STORED_CELL, slope: STORED_SLOPE, anchor: INPUT.pool_stats } }, ALWAYS);
    assert.equal(c?.label, "VERSION (age, median, slope)");
  });

  it("thin cell, the curve differs, both invoices anchored -> VERSION (anchor)", () => {
    const c = runV(
      { norms: { ...CURRENT_NORMS, anchor: poolNorm({ id: 2, anchor_ratio_intercept: 0.8 }) }, breakdown: anchored(storedBreakdown()) },
      ALWAYS,
      { current: anchored(result()) },
    );
    assert.equal(c?.label, "VERSION (age, anchor)");
    assert.ok(c?.detail.some((d) => d.includes("pool row pool_stats 2 -> 3")));
  });

  it("a new pointer with identical values -> plain VERSION", () => {
    const sameSlope = modelNorm({ id: 1, km_slope: -1.181408, km_slope_n: 134 });
    const c = runV({ norms: { ...CURRENT_NORMS, median: SAME_VALUES_CELL, slope: sameSlope } }, ALWAYS);
    assert.equal(c?.label, "VERSION (age)");
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
    assert.equal(c?.label, "VERSION (age, anchor gate)");
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
    assert.equal(c?.label, "VERSION (age)");
    assert.ok(c?.detail.some((d) => d.includes("the recomputation reads no point")));
  });

  it("not reproduced, pair (3, 4) -> UNEXPLAINED with the line", () => {
    const c = runV({}, NEVER);
    assert.equal(c?.label, "UNEXPLAINED");
    assert.ok(c?.detail.includes(`engine moved a listing; no declared identity for v3 → v${ENGINE_VERSION}`));
    assert.ok(c?.detail.some((d) => d.includes("not the stored +6.5 / -5 / high")));
  });

  it("not reproduced, pair (2, 3) -> versionExpectation() as before", () => {
    // Day 19: NOT reproduced by recomputation, so this takes the DECLARED (2, 3) identity, which carries no
    // names - `age` belongs to the reproduced path only. The label stays plain VERSION.
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
    assert.equal(c?.label, "VERSION (age)");
    assert.ok(c?.detail.some((d) => d.includes("within the ±0.1 rounding allowance")));
  });

  it("(f) the only confidence move is color_mismatch -> VERSION (confidence: color)", () => {
    const c = runV({}, () => result({ deal_score: 6.5, confidence: { level: "medium", items: [{ kind: "color_mismatch", ref: "color:mismatch" }] } }));
    assert.equal(c?.label, "VERSION (age, confidence: color)");
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

// ---------------------------------------------------------------------------------------------------
// Day 19 (§12.7) — the version rule with the clock replacement.
//
// The declared 4 -> 5 move is that ONLY THE AGE MOVED: the new engine, at the age the old score read,
// reproduces the old score. The replacement IS the identity, so `age` is on the label exactly when the
// stored engine read a run clock — and never on a stored score of engine 5 or later.
describe("Day 19 §5 — the version rule, the clock replacement and the `age` name", () => {
  const V4 = { engine_version: 4 as number };
  // Reproduces the stored triple only when it is asked for a non-null clock at the stored scored_at.
  const reproducesAtClock: ScoreWith = (_norms, clock) =>
    clock !== null && clock.getTime() === SCORED_AT.getTime()
      ? result({ deal_score: STORED_TRIPLE.score, price_advantage: 5.5 })
      : CURRENT;

  it("a stored engine-4 score reproduced at its scored_at -> VERSION (age)", () => {
    const c = run({ ...V4 }, reproducesAtClock);
    assert.equal(c?.label, "VERSION (age)");
    assert.ok(c?.detail.some((d) => d.includes("stored engine_version 4 -> 5")));
    assert.ok(c?.detail.some((d) => d.includes("three observation dates replaced by the stored run clock")));
  });

  it("the SAME input recomputed with clock = null does NOT reproduce it — so the clock is what matters", () => {
    // Same stored side, a callback that reproduces only on its own observation dates: the version rule
    // passes a clock for an engine-4 row, gets the current triple, and finds no declared identity for 4 -> 5.
    const onlyWithoutClock: ScoreWith = (_norms, clock) =>
      clock === null ? result({ deal_score: STORED_TRIPLE.score, price_advantage: 5.5 }) : CURRENT;
    const c = run({ ...V4 }, onlyWithoutClock);
    assert.equal(c?.label, "UNEXPLAINED");
    assert.ok(c?.detail.some((d) => d.includes("no declared identity for v4 → v5")));
  });

  it("a read norm row changed as well -> VERSION (age, slope), age first", () => {
    const c = run(
      { ...V4, norms: { ...CURRENT_NORMS, slope: STORED_SLOPE }, breakdown: storedBreakdown({ slope_source: "model" }) },
      reproducesAtClock,
    );
    assert.equal(c?.label, "VERSION (age, slope)");
    assert.ok(c?.detail.some((d) => d.includes("model row model_stats 1 -> 5")));
  });

  it("a stored engine-5 score never carries `age` — it is recomputed on its own dates", () => {
    // Engine 5 == ENGINE_VERSION, so this does not even reach the version rule; it is the UNEXPLAINED
    // path above. The point here is the callback: it is called with clock = null, never with a date.
    const clocks: (Date | null)[] = [];
    run({}, (_n, clock) => { clocks.push(clock); return CURRENT; });
    assert.ok(clocks.length > 0, "the classifier must have recomputed at least once");
    assert.ok(clocks.every((c) => c === null), `a stored engine-5 score must be recomputed with clock = null, got ${clocks}`);
  });

  it("an engine-3 row is covered too — every clock-reading engine, not only the adjacent pair", () => {
    const c = run({ engine_version: 3 }, reproducesAtClock);
    assert.equal(c?.label, "VERSION (age)");
  });
});

describe("Day 19 §5.5 — the two observation dates in the DATA check", () => {
  // A v5 invoice records km_observed_at on the km row and price_observed_at on an anchor price row.
  const withDates = (over: { km?: string; price?: string } = {}): ScoreResult => {
    const bd = storedBreakdown();
    bd.rows[2].raw = { ...bd.rows[2].raw, km_observed_at: over.km ?? INPUT.listing.km_observed_at.toISOString() };
    if (over.price !== undefined) {
      bd.rows[0].source = "anchor";
      bd.rows[0].note = "vs_new_price";
      bd.rows[0].raw = { ...bd.rows[0].raw, price_observed_at: over.price };
    }
    return bd;
  };

  it("a stored v5 invoice whose km_observed_at differs from the input -> DATA naming the field", () => {
    const c = run({ breakdown: withDates({ km: "2026-01-01T00:00:00.000Z" }) }, NEVER);
    assert.equal(c?.label, "DATA");
    assert.ok(
      c?.detail.some((d) => d.startsWith("input listing.km_observed_at: 2026-01-01T00:00:00.000Z ->")),
      `expected a km_observed_at line, got ${JSON.stringify(c?.detail)}`,
    );
  });

  it("the same date as the input -> not DATA", () => {
    const c = run({ breakdown: withDates() }, NEVER);
    assert.notEqual(c?.label, "DATA");
  });

  it("price_observed_at is compared on an anchor price row", () => {
    const c = run({ breakdown: withDates({ price: "2026-02-02T00:00:00.000Z" }) }, NEVER);
    assert.equal(c?.label, "DATA");
    assert.ok(c?.detail.some((d) => d.startsWith("input listing.price_observed_at: 2026-02-02T00:00:00.000Z ->")));
  });

  it("a stored engine-4 invoice lacks both keys -> it is not compared on them, so not DATA", () => {
    // storedBreakdown() carries neither key: the same null-over-value treatment the v4 fields get.
    const c = run({ engine_version: 4, breakdown: storedBreakdown() }, reproducesAtClockForData);
    assert.ok(c?.label.startsWith("VERSION"), `expected a VERSION label, got ${c?.label}`);
    assert.ok(!c?.detail.some((d) => d.includes("km_observed_at:")));
    assert.ok(!c?.detail.some((d) => d.includes("price_observed_at:")));
  });
});

const reproducesAtClockForData: ScoreWith = (_norms, clock) =>
  clock !== null && clock.getTime() === SCORED_AT.getTime()
    ? result({ deal_score: STORED_TRIPLE.score, price_advantage: 5.5 })
    : CURRENT;

// Day 19 (Run 5c2, §8.2) — the DATA check reads each stored invoice against what ITS OWN engine recorded as
// the km check's official reading. Up to engine 4 that was the car's latest pair, whatever its date; from
// engine 5 it is the last reading dated on or before km_observed_at. A car whose latest test is NEWER than the
// km observation is the case where the two answers differ, so that is the car these tests use.
describe("the km check's official reading, per stored engine (Run 5c2 §4.2)", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const CHOSEN = { test_date: d("2026-02-02"), km: 60_000 }; // the last test before the km was seen
  const LATEST = { test_date: d("2026-08-30"), km: 79_000 }; // the car's latest pair — AFTER the observation

  const KM_INPUT = scoringInput({
    listing: { price: 100_000, km_declared: 73_000, km_observed_at: d("2026-06-15") },
    car: {
      hand: 2,
      ownership_history: rows("private 2021-01"),
      test_readings: [CHOSEN, LATEST],
      mivchan_acharon_dt: LATEST.test_date,
      km_at_last_test: LATEST.km,
    },
    market: INPUT.market,
    model_stats: INPUT.model_stats,
    pool_stats: INPUT.pool_stats,
  });

  /** A stored invoice carrying this run's km_declared and the km check the given engine would have written. */
  function kmStored(official: number, official_date: string): ScoreResult {
    const r = storedBreakdown();
    (r.rows[2].raw as Record<string, unknown>).km_declared = 73_000;
    r.checks = [{ check: "km", status: "match", declared: 73_000, official, official_date }];
    return r;
  }

  const classifyKm = (engine_version: number, breakdown: ScoreResult) =>
    classify({
      make: "יונדאי", model: "IONIQ HYBRID",
      result: CURRENT, input: KM_INPUT, norms: CURRENT_NORMS,
      stored: stored({ engine_version, breakdown }),
      engine_version: ENGINE_VERSION,
      scoreWith: NEVER,
    });

  it("a stored engine-5 invoice recording the CHOSEN reading is not DATA, though the latest pair is a newer test", () => {
    const c = classifyKm(ENGINE_VERSION, kmStored(CHOSEN.km, "2026-02-02"));
    assert.notEqual(c?.label, "DATA");
    assert.equal(c?.label, "UNEXPLAINED"); // nothing else moved: the DATA check found no difference at all
    assert.ok(!(c?.detail ?? []).some((l) => l.startsWith("input car.km_at_last_test") || l.startsWith("input car.mivchan_acharon_dt")));
  });

  it("a stored engine-4 invoice is compared with the car's LATEST pair, as today", () => {
    const c = classifyKm(4, kmStored(LATEST.km, "2026-08-30"));
    assert.notEqual(c?.label, "DATA");
  });

  it("an engine-4 invoice recording the chosen reading IS a data difference — that engine read the latest pair", () => {
    const c = classifyKm(4, kmStored(CHOSEN.km, "2026-02-02"));
    assert.equal(c?.label, "DATA");
  });

  it("an engine-5 invoice recording the latest pair IS a data difference — that engine read the chosen reading", () => {
    const c = classifyKm(ENGINE_VERSION, kmStored(LATEST.km, "2026-08-30"));
    assert.equal(c?.label, "DATA");
    assert.ok((c?.detail ?? []).some((l) => l.includes("car.km_at_last_test: 79000 -> 60000")));
  });
});

// Day 19 (Run 5c3, §3) — the after reading moves what the km check RECORDS, so it moves what the DATA check
// compares. The current side is read straight off the current check (regression.ts, currentKmOfficial), so it
// follows the new rule by itself: these two tests are what proves it. The stored invoice is the same in both —
// an engine-5 score that recorded the before reading; only the later reading in the current input differs.
describe("a later reading and the DATA check (Run 5c3 §3)", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const OBSERVED = d("2026-06-15");
  const BEFORE = { test_date: d("2026-02-02"), km: 60_000 }; // the last test before the km was seen
  const LATER = d("2026-08-03"); // 49 days after the observation: allowance 8,166.67, threshold 13,166.67

  const withLater = (km: number) =>
    scoringInput({
      listing: { price: 100_000, km_declared: 73_000, km_observed_at: OBSERVED },
      car: {
        hand: 2,
        ownership_history: rows("private 2021-01"),
        test_readings: [BEFORE, { test_date: LATER, km }],
        mivchan_acharon_dt: LATER,
        km_at_last_test: km,
      },
      market: INPUT.market,
      model_stats: INPUT.model_stats,
      pool_stats: INPUT.pool_stats,
    });

  /** The stored engine-5 invoice: a match against the BEFORE reading, which is what 5c2 would have written. */
  function storedAgainstBefore(): ScoreResult {
    const r = storedBreakdown();
    (r.rows[2].raw as Record<string, unknown>).km_declared = 73_000;
    r.checks = [{ check: "km", status: "match", declared: 73_000, official: BEFORE.km, official_date: "2026-02-02" }];
    return r;
  }

  const classifyLater = (km: number) =>
    classify({
      make: "יונדאי", model: "IONIQ HYBRID",
      result: CURRENT, input: withLater(km), norms: CURRENT_NORMS,
      stored: stored({ engine_version: ENGINE_VERSION, breakdown: storedAgainstBefore() }),
      engine_version: ENGINE_VERSION,
      scoreWith: NEVER,
    });

  it("the later reading is WITHIN the allowance -> not DATA: the check still records the before reading", () => {
    // 73,000 against 79,000 seven weeks later is 6,000 below — inside 13,166.67.
    const c = classifyLater(79_000);
    assert.notEqual(c?.label, "DATA");
    assert.ok(!(c?.detail ?? []).some((l) => l.startsWith("input car.km_at_last_test") || l.startsWith("input car.mivchan_acharon_dt")));
  });

  it("the later reading is BEYOND the allowance -> DATA on the km official: the check records the after reading", () => {
    // 73,000 against 93,000 seven weeks later is 20,000 below — beyond 13,166.67, so km_below on that reading.
    const c = classifyLater(93_000);
    assert.equal(c?.label, "DATA");
    assert.ok((c?.detail ?? []).some((l) => l.includes("car.km_at_last_test: 60000 -> 93000")));
    assert.ok((c?.detail ?? []).some((l) => l.includes("car.mivchan_acharon_dt: 2026-02-02 -> 2026-08-03")));
  });
});
