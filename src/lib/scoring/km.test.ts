// BRIEF §14: km row — under the median is positive; the cap at ±11.
// Day 14 (§3.6 b, c, f): the per-model slope and its floor, and the thin-cell anchor on the price row.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KM_SLOPE_MIN_SAMPLE, KM_SLOPE_PCT_PER_1000_PER_YEAR } from "./constants";
import { kmRow } from "./km";
import { priceRow } from "./price";
import { scoreListing } from "./index";
import { cell, input, modelNorm, NOW, poolNorm, rows } from "./fixtures";

const market = cell({ median_history: null });
const twoYearsAgo = new Date("2024-09-06T12:00:00.000Z");

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
// first_registration that makes the car exactly `age` years old at NOW (both sides are whole milliseconds).
const regAt = (age: number) => new Date(NOW.getTime() - age * YEAR_MS);

describe("km row (§4.3)", () => {
  it("under the median → positive; 10,000 km/year under at the default slope −0.6 → +6", () => {
    const r = kmRow(input({ listing: { km_declared: 20000 }, car: { first_registration: twoYearsAgo }, market }), NOW);
    assert.equal(r.status, "scored");
    assert.equal(r.source, "ad");
    assert.equal(r.value, 6);
    // two calendar years are 731 days, so the age is 2.0016 years and the deviation lands just past −10,000
    assert.ok(Math.abs((r.raw.km_dev_per_year as number) + 10000) < 10, `km_dev_per_year = ${r.raw.km_dev_per_year}`);
    assert.equal(r.raw.based_on_n, 8); // §9.3: this row compares against median_km — same N
  });

  it("over the median → negative", () => {
    const r = kmRow(input({ listing: { km_declared: 60000 }, car: { first_registration: twoYearsAgo }, market }), NOW);
    assert.equal(r.value, -6);
  });

  it("capped at −11", () => {
    const r = kmRow(input({ listing: { km_declared: 200000 }, car: { first_registration: twoYearsAgo }, market }), NOW);
    assert.equal(r.value, -11);
  });

  it("capped at +11", () => {
    const r = kmRow(input({ listing: { km_declared: 0 }, car: { first_registration: twoYearsAgo }, market: cell({ median_km: 100000 }) }), NOW);
    assert.equal(r.value, 11);
  });

  it("age is floored at 0.5 years", () => {
    const r = kmRow(input({ listing: { km_declared: 45000 }, car: { first_registration: new Date("2026-09-01T00:00:00.000Z") }, market }), NOW);
    assert.equal(r.raw.age_years, 0.5);
    assert.equal(r.value, -6);
  });

  it("unavailable reasons: no_km | no_market_row | thin_cell | no_registration_date", () => {
    assert.equal(kmRow(input({ market }), NOW).reason, "no_km");
    assert.equal(kmRow(input({ listing: { km_declared: 1 } }), NOW).reason, "no_market_row");
    assert.equal(kmRow(input({ listing: { km_declared: 1 }, market: cell({ sample_size: 4 }) }), NOW).reason, "thin_cell");
    assert.equal(kmRow(input({ listing: { km_declared: 1 }, market }), NOW).reason, "no_registration_date");
  });

  it("§9.3: an unavailable row that got as far as the cell still carries based_on_n", () => {
    assert.equal(kmRow(input({ listing: { km_declared: 1 }, market }), NOW).raw.based_on_n, 8);
  });
});

// §3.6 (b). 35,000 km declared against a 40,000 median on a car of age 730/365.25 = 1.9986 years:
// the deviation is −2,501.7 km per year, so the row is slope × −2.5017.
describe("km row — the model's own slope (Day 14 §0.3)", () => {
  const under = { listing: { km_declared: 35000 }, car: { first_registration: twoYearsAgo }, market };
  const over = { listing: { km_declared: 45000 }, car: { first_registration: twoYearsAgo }, market };

  it("the default constant is signed: −0.6, and the engine multiplies by it as is", () => {
    assert.equal(KM_SLOPE_PCT_PER_1000_PER_YEAR, -0.6);
    assert.equal(KM_SLOPE_MIN_SAMPLE, 100);
  });

  it(`n = ${KM_SLOPE_MIN_SAMPLE} → the model's own slope; raw says so`, () => {
    const r = kmRow(input({ ...under, model_stats: modelNorm({ id: 42, km_slope: -1.19, km_slope_n: KM_SLOPE_MIN_SAMPLE }) }), NOW);
    assert.equal(r.value, 3);
    assert.equal(r.raw.slope_used, -1.19);
    assert.equal(r.raw.slope_source, "model");
    assert.equal(r.raw.km_slope_n, KM_SLOPE_MIN_SAMPLE);
    assert.equal(r.raw.model_stats_id, 42);
  });

  it(`n = ${KM_SLOPE_MIN_SAMPLE - 1} → the default, although the row exists and carries a slope`, () => {
    const r = kmRow(input({ ...under, model_stats: modelNorm({ id: 42, km_slope: -1.19, km_slope_n: KM_SLOPE_MIN_SAMPLE - 1 }) }), NOW);
    assert.equal(r.value, 1.5);
    assert.equal(r.raw.slope_used, -0.6);
    assert.equal(r.raw.slope_source, "default");
    assert.equal(r.raw.km_slope_n, KM_SLOPE_MIN_SAMPLE - 1);
    assert.equal(r.raw.model_stats_id, 42);
  });

  it("no model row at all → the default; km_slope_n and model_stats_id are null", () => {
    const r = kmRow(input(under), NOW);
    assert.equal(r.value, 1.5);
    assert.equal(r.raw.slope_used, -0.6);
    assert.equal(r.raw.slope_source, "default");
    assert.equal(r.raw.km_slope_n, null);
    assert.equal(r.raw.model_stats_id, null);
  });

  it("a model row whose slope could not be measured (km_slope null) → the default", () => {
    const r = kmRow(input({ ...under, model_stats: modelNorm({ id: 42, km_slope: null, km_slope_n: 0 }) }), NOW);
    assert.equal(r.value, 1.5);
    assert.equal(r.raw.slope_source, "default");
  });

  it("the sign is right on both slopes: km above the median is a deduction, below it a bonus", () => {
    const model = modelNorm({ km_slope: -1.19, km_slope_n: KM_SLOPE_MIN_SAMPLE });
    assert.equal(kmRow(input(under), NOW).value, 1.5); // default, below the median → positive
    assert.equal(kmRow(input(over), NOW).value, -1.5); // default, above the median → negative
    assert.equal(kmRow(input({ ...under, model_stats: model }), NOW).value, 3); // model, below → positive
    assert.equal(kmRow(input({ ...over, model_stats: model }), NOW).value, -3); // model, above → negative
  });

  // The row is unavailable long before the slope matters, but the choice is still recorded.
  it("an unavailable row still records the slope it would have used", () => {
    const r = kmRow(input({ market, model_stats: modelNorm({ id: 42, km_slope: -1.19, km_slope_n: 200 }) }), NOW);
    assert.equal(r.reason, "no_km");
    assert.equal(r.raw.slope_source, "model");
    assert.equal(r.raw.model_stats_id, 42);
  });
});

describe("price row (§4.1)", () => {
  it("10% under the median → +10, and the row carries based_on_n (§0.6)", () => {
    const r = priceRow(input({ listing: { price: 90000 }, market }), NOW);
    assert.equal(r.status, "scored");
    assert.equal(r.source, "market");
    assert.equal(r.value, 10);
    assert.deepEqual(r.raw, { price: 90000, median_price: 100000, market_stats_id: 7, sample_size: 8, window_days: 90, based_on_n: 8 });
  });

  it("no market row", () => {
    assert.equal(priceRow(input(), NOW).reason, "no_market_row");
  });
});

// §3.6 (c). The curve of poolNorm(): ratio = 0.83 − 0.041 × age, fitted on ages 3 … 6.
//   age 3 → 0.707   age 4 → 0.666   age 6 → 0.584
describe("price row — the thin-cell anchor (Day 14 §0.5)", () => {
  const thin = cell({ sample_size: 3 });
  const listing = { price: 119880, new_price: 200000, new_car_price_id: 900 };

  it("inside the range: price against new_price × (0.83 − 0.041 × 4) = 133,200 → +10", () => {
    const r = priceRow(input({ listing, car: { first_registration: regAt(4) }, market: thin, pool_stats: poolNorm() }), NOW);
    assert.equal(r.status, "scored");
    assert.equal(r.source, "anchor");
    assert.equal(r.value, 10);
    assert.equal(r.note, "vs_new_price"); // §9.9: a code; the ± percentage is raw.error_pct
    assert.equal(r.raw.new_price, 200000);
    assert.equal(r.raw.new_car_price_id, 900);
    assert.equal(r.raw.age, 4);
    assert.equal(r.raw.age_source, "first_registration");
    assert.equal(r.raw.ratio, 0.83 - 0.041 * 4);
    assert.equal(r.raw.anchor, 200000 * (0.83 - 0.041 * 4));
    assert.equal(r.raw.error_pct, 6.5);
    assert.equal(r.raw.pool_stats_id, 5);
  });

  it("at the young edge (age = age_min) and at the old edge (age = age_max): both score", () => {
    const young = priceRow(input({ listing: { ...listing, price: 141400 }, car: { first_registration: regAt(3) }, market: thin, pool_stats: poolNorm() }), NOW);
    assert.equal(young.status, "scored");
    assert.equal(young.raw.anchor, 200000 * 0.707);
    assert.equal(young.value, 0);

    const old = priceRow(input({ listing: { ...listing, price: 116800 }, car: { first_registration: regAt(6) }, market: thin, pool_stats: poolNorm() }), NOW);
    assert.equal(old.status, "scored");
    assert.equal(old.raw.anchor, 200000 * 0.584);
    assert.equal(old.value, 0);
  });

  // §9.7: every unavailable anchor keeps the reason 'thin_cell' — one root cause, one confidence item —
  // and names the missing piece in raw.anchor_unavailable.
  it("outside the range on either side → thin_cell / age_outside_anchor_range", () => {
    for (const age of [2.9, 6.1]) {
      const r = priceRow(input({ listing, car: { first_registration: regAt(age) }, market: thin, pool_stats: poolNorm() }), NOW);
      assert.equal(r.status, "unavailable");
      assert.equal(r.reason, "thin_cell");
      assert.equal(r.raw.anchor_unavailable, "age_outside_anchor_range");
      assert.equal(r.raw.age, age);
      assert.equal(r.raw.ratio, null);
    }
  });

  it("no new price → thin_cell / no_new_price", () => {
    const r = priceRow(input({ listing: { ...listing, new_price: null, new_car_price_id: null }, car: { first_registration: regAt(4) }, market: thin, pool_stats: poolNorm() }), NOW);
    assert.equal(r.reason, "thin_cell");
    assert.equal(r.raw.anchor_unavailable, "no_new_price");
  });

  it("no pool row, and a pool row with no curve (P4) → thin_cell / no_anchor_curve", () => {
    const noRow = priceRow(input({ listing, car: { first_registration: regAt(4) }, market: thin }), NOW);
    assert.equal(noRow.reason, "thin_cell");
    assert.equal(noRow.raw.anchor_unavailable, "no_anchor_curve");
    assert.equal(noRow.raw.pool_stats_id, null);

    const empty = poolNorm({
      anchor_ratio_intercept: null,
      anchor_ratio_per_year: null,
      anchor_error_pct: null,
      anchor_age_min_years: null,
      anchor_age_max_years: null,
      anchor_n: 0,
    });
    const noCurve = priceRow(input({ listing, car: { first_registration: regAt(4) }, market: thin, pool_stats: empty }), NOW);
    assert.equal(noCurve.reason, "thin_cell");
    assert.equal(noCurve.raw.anchor_unavailable, "no_anchor_curve");
    assert.equal(noCurve.raw.pool_stats_id, 5);
  });

  // §9.6: P1 cannot produce a thin cell with a typical; a row that carries one is an invariant violation.
  it("a thin cell that carries a median_history → throw", () => {
    assert.throws(
      () => priceRow(input({ listing, car: { first_registration: regAt(4) }, market: cell({ sample_size: 3, median_history: -4 }), pool_stats: poolNorm() }), NOW),
      /is thin[\s\S]*median_history/,
    );
  });

  it("P2: no first_registration → the age runs from 1 January of cars.year, flagged in raw", () => {
    const r = priceRow(input({ listing, car: { year: 2021, first_registration: null }, market: thin, pool_stats: poolNorm() }), NOW);
    assert.equal(r.raw.age_source, "year_jan_1");
    assert.ok(Math.abs((r.raw.age as number) - 5.68) < 0.01, `age = ${r.raw.age}`);
    assert.equal(r.status, "scored");
  });
});

// §3.6 (f).
describe("a thin-cell listing with an anchor (Day 14 §0.5)", () => {
  it("has a price row and no deal score", () => {
    const r = scoreListing(
      input({
        listing: { price: 119880, km_declared: 20000, new_price: 200000, new_car_price_id: 900 },
        car: { hand: 1, ownership_history: rows("private 2022-09"), first_registration: regAt(4) },
        market: cell({ sample_size: 3 }),
        pool_stats: poolNorm(),
      }),
      NOW,
    );
    assert.equal(r.rows[0].status, "scored");
    assert.equal(r.rows[0].source, "anchor");
    assert.equal(r.price_advantage, 10);
    // the km row and the history typical do not exist in a thin cell
    assert.equal(r.rows[2].reason, "thin_cell");
    assert.equal(r.typical_history, null);
    assert.equal(r.condition_vs_typical, null);
    assert.equal(r.deal_score, null);
  });
});
