// BRIEF §14: km row — under the median is positive; the cap at ±11.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kmRow } from "./km";
import { priceRow } from "./price";
import { input, NOW } from "./fixtures";

const market = { id: 7, median_price: 100000, median_km: 40000, median_condition: null, sample_size: 8, window_days: 90 };
const twoYearsAgo = new Date("2024-09-06T12:00:00.000Z");

describe("km row (§4.3)", () => {
  it("under the median → positive; 10,000 km/year under at slope 0.6 → +6", () => {
    const r = kmRow(input({ listing: { km_declared: 20000 }, car: { first_registration: twoYearsAgo }, market }), NOW);
    assert.equal(r.status, "scored");
    assert.equal(r.source, "ad");
    assert.equal(r.value, 6);
    // two calendar years are 731 days, so the age is 2.0016 years and the deviation lands just past −10,000
    assert.ok(Math.abs((r.raw.km_dev_per_year as number) + 10000) < 10, `km_dev_per_year = ${r.raw.km_dev_per_year}`);
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
    const r = kmRow(input({ listing: { km_declared: 0 }, car: { first_registration: twoYearsAgo }, market: { ...market, median_km: 100000 } }), NOW);
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
    assert.equal(kmRow(input({ listing: { km_declared: 1 }, market: { ...market, sample_size: 4 } }), NOW).reason, "thin_cell");
    assert.equal(kmRow(input({ listing: { km_declared: 1 }, market }), NOW).reason, "no_registration_date");
  });
});

describe("price row (§4.1)", () => {
  it("10% under the median → +10", () => {
    const r = priceRow(input({ listing: { price: 90000 }, market }));
    assert.equal(r.status, "scored");
    assert.equal(r.source, "market");
    assert.equal(r.value, 10);
    assert.deepEqual(r.raw, { price: 90000, median_price: 100000, market_stats_id: 7, sample_size: 8, window_days: 90 });
  });

  it("thin cell and no market row", () => {
    assert.equal(priceRow(input({ market: { ...market, sample_size: 4 } })).reason, "thin_cell");
    assert.equal(priceRow(input()).reason, "no_market_row");
  });
});
