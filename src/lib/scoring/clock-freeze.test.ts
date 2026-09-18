// Day 19 (§12) — the clock freeze, tested where it can actually break.
//
// Test 1 is the one that matters most: the auditor's clock replacement sets ALL THREE observation dates to
// one value, so a site wired to the wrong date is invisible to it. Only an input whose three dates are
// DIFFERENT can catch a swapped wire, and that is what this file gives every site.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kmRow } from "./km";
import { priceRow } from "./price";
import { soldSignal } from "./sold";
import { kmFacts } from "./checks";
import { YEAR_MS } from "./age";
import { atRunClock } from "./regression";
import { anchorPoint, cell, input, NOW, poolNorm, rows, scoreScored } from "./fixtures";
import type { ScoringInput } from "./types";

const market = cell({ median_history: null });
const regAt = (age: number) => new Date(NOW.getTime() - age * YEAR_MS);

// Three dates, far enough apart that no two can be confused for one another.
const FIRST_SEEN = new Date("2026-03-01T00:00:00.000Z");
const KM_SEEN = new Date("2026-06-15T00:00:00.000Z");
const PRICE_SEEN = new Date("2026-09-10T00:00:00.000Z");

const threeDates = (over: Parameters<typeof input>[0] = {}) =>
  input({
    ...over,
    listing: { first_seen_at: FIRST_SEEN, km_observed_at: KM_SEEN, price_observed_at: PRICE_SEEN, ...over.listing },
  });

describe("Day 19 §12.1 — each site reads its OWN date", () => {
  const REG = new Date("2021-01-01T00:00:00.000Z");

  it("the km row's age_years follows km_observed_at, not first_seen_at and not price_observed_at", () => {
    const r = kmRow(threeDates({ listing: { km_declared: 60000 }, car: { first_registration: REG }, market }));
    assert.equal(r.status, "scored");
    const expected = (KM_SEEN.getTime() - REG.getTime()) / YEAR_MS;
    assert.equal(r.raw.age_years, expected);
    assert.notEqual(r.raw.age_years, (FIRST_SEEN.getTime() - REG.getTime()) / YEAR_MS);
    assert.notEqual(r.raw.age_years, (PRICE_SEEN.getTime() - REG.getTime()) / YEAR_MS);
  });

  it("the anchor row's age follows price_observed_at — first_registration branch", () => {
    const r = priceRow(
      threeDates({
        listing: { price: 119880, new_price: 200000, new_car_price_id: 900 },
        car: { first_registration: REG },
        market: cell({ sample_size: 3, median_history: null }),
        pool_stats: poolNorm({ anchor_points: [anchorPoint({ year: 2021 })] }),
      }),
    );
    assert.equal(r.status, "scored");
    assert.equal(r.raw.age_source, "first_registration");
    assert.equal(r.raw.age, (PRICE_SEEN.getTime() - REG.getTime()) / YEAR_MS);
    assert.equal(r.raw.price_observed_at, PRICE_SEEN.toISOString());
  });

  it("the anchor row's age follows price_observed_at — the year_jan_1 fallback", () => {
    const r = priceRow(
      threeDates({
        listing: { price: 119880, new_price: 200000, new_car_price_id: 900 },
        car: { first_registration: null, year: 2021 },
        market: cell({ sample_size: 3, median_history: null }),
        pool_stats: poolNorm({ anchor_points: [anchorPoint({ year: 2021 })] }),
      }),
    );
    assert.equal(r.status, "scored");
    assert.equal(r.raw.age_source, "year_jan_1");
    assert.equal(r.raw.age, (PRICE_SEEN.getTime() - Date.UTC(2021, 0, 1)) / YEAR_MS);
  });

  it("the sold window follows first_seen_at", () => {
    // A private seller; a row one month after first_seen_at follows the seller's own private row and is inside
    // the 3-month window measured back from FIRST_SEEN (2026-03). Measured from KM_SEEN or PRICE_SEEN it is not.
    const s = soldSignal(
      threeDates({ listing: { seller_type: "private" }, car: { ownership_history: rows("private 2025-11, dealer 2026-01") } }),
    );
    assert.equal(s.strength, "medium");
    assert.ok(s.evidence[0].includes("2026-03"), `the window should be reported against first_seen_at: ${s.evidence[0]}`);
  });

  it("months_since_test follows km_observed_at", () => {
    const test = new Date("2026-01-15T00:00:00.000Z");
    const f = kmFacts(threeDates({ listing: { km_declared: 50000 }, car: { mivchan_acharon_dt: test, km_at_last_test: 40000 } }));
    // 2026-01-15 -> 2026-06-15 is 5 whole months; to FIRST_SEEN it would be 1, to PRICE_SEEN 7.
    assert.equal(f.months_since_test, 5);
  });
});

describe("Day 19 §12.2 — km", () => {
  const REG = new Date("2021-01-01T00:00:00.000Z");

  it("two inputs identical but for km_observed_at give different age_years", () => {
    const base = { listing: { km_declared: 60000 }, car: { first_registration: REG }, market };
    const early = kmRow(input({ ...base, listing: { ...base.listing, km_observed_at: new Date("2025-01-01T00:00:00.000Z") } }));
    const late = kmRow(input({ ...base, listing: { ...base.listing, km_observed_at: new Date("2026-01-01T00:00:00.000Z") } }));
    assert.equal(early.status, "scored");
    assert.equal(late.status, "scored");
    assert.notEqual(early.raw.age_years, late.raw.age_years);
    // exactly one calendar year of milliseconds apart, to floating-point tolerance
    const gap = (late.raw.age_years as number) - (early.raw.age_years as number);
    assert.ok(Math.abs(gap - (365 * 24 * 60 * 60 * 1000) / YEAR_MS) < 1e-12, `gap ${gap}`);
  });

  it("the AGE_FLOOR_YEARS floor still holds when the km was observed days after registration", () => {
    const reg = new Date("2026-06-01T00:00:00.000Z"); // 14 days before KM_SEEN
    const r = kmRow(threeDates({ listing: { km_declared: 60000 }, car: { first_registration: reg }, market }));
    assert.equal(r.status, "scored");
    assert.equal(r.raw.age_years, 0.5);
  });

  it("raw.km_observed_at is present on the scored row AND on the unavailable one", () => {
    const scored = kmRow(threeDates({ listing: { km_declared: 60000 }, car: { first_registration: regAt(4) }, market }));
    assert.equal(scored.status, "scored");
    assert.equal(scored.raw.km_observed_at, KM_SEEN.toISOString());

    const unavailable = kmRow(threeDates({ listing: { km_declared: null }, market }));
    assert.equal(unavailable.status, "unavailable");
    assert.equal(unavailable.reason, "no_km");
    assert.equal(unavailable.raw.km_observed_at, KM_SEEN.toISOString());

    const noReg = kmRow(threeDates({ listing: { km_declared: 60000 }, car: { first_registration: null }, market }));
    assert.equal(noReg.reason, "no_registration_date");
    assert.equal(noReg.raw.km_observed_at, KM_SEEN.toISOString());
  });
});

describe("Day 19 §12.3 — the sold window is measured back from first_seen_at", () => {
  const history = rows("private 2025-11, dealer 2026-01");

  it("a transfer inside the window -> medium", () => {
    const s = soldSignal(
      input({ listing: { seller_type: "private", first_seen_at: new Date("2026-03-01T00:00:00.000Z") }, car: { ownership_history: history } }),
    );
    assert.equal(s.strength, "medium");
  });

  it("the SAME history, first_seen_at moved so the transfer falls outside -> none", () => {
    const s = soldSignal(
      input({ listing: { seller_type: "private", first_seen_at: new Date("2026-09-01T00:00:00.000Z") }, car: { ownership_history: history } }),
    );
    assert.equal(s.strength, null);
  });
});

describe("Day 19 §12.4 — facts", () => {
  it("no months_left key; test_expiry present", () => {
    const r = scoreScored(input({ car: { test_expiry: new Date("2027-01-27T00:00:00.000Z") }, market }));
    assert.equal(r.facts.test_expiry, "2027-01-27");
    assert.ok(!("months_left" in r.facts), "months_left must be gone from the invoice");
  });

  it("no test_expiry -> null, and still no months_left", () => {
    const r = scoreScored(input({ car: { test_expiry: null }, market }));
    assert.equal(r.facts.test_expiry, null);
    assert.ok(!("months_left" in r.facts));
  });
});

describe("Day 19 §12.6 — atRunClock()", () => {
  const base: ScoringInput = threeDates({ listing: { km_declared: 60000 }, car: { first_registration: regAt(4) }, market });
  const CLOCK = new Date("2026-09-17T09:00:00.000Z");

  it("replaces exactly the three dates", () => {
    const out = atRunClock(base, CLOCK);
    assert.equal(out.listing.first_seen_at, CLOCK);
    assert.equal(out.listing.km_observed_at, CLOCK);
    assert.equal(out.listing.price_observed_at, CLOCK);
  });

  it("changes nothing else", () => {
    const out = atRunClock(base, CLOCK);
    const strip = (i: ScoringInput) => {
      const { first_seen_at, km_observed_at, price_observed_at, ...rest } = i.listing;
      void first_seen_at; void km_observed_at; void price_observed_at;
      return { ...i, listing: rest };
    };
    assert.deepEqual(strip(out), strip(base));
    assert.equal(out.car, base.car);
    assert.equal(out.market, base.market);
  });

  it("does not mutate its argument", () => {
    const before = {
      first_seen_at: base.listing.first_seen_at,
      km_observed_at: base.listing.km_observed_at,
      price_observed_at: base.listing.price_observed_at,
    };
    atRunClock(base, CLOCK);
    assert.equal(base.listing.first_seen_at, before.first_seen_at);
    assert.equal(base.listing.km_observed_at, before.km_observed_at);
    assert.equal(base.listing.price_observed_at, before.price_observed_at);
  });

  it("an engine <= 4 read the car this way: the clocked copy scores as one date reached every site", () => {
    const clocked = scoreScored(atRunClock(base, CLOCK));
    const km = clocked.rows.find((r) => r.row === "km");
    assert.equal(km?.raw.km_observed_at, CLOCK.toISOString());
  });
});
