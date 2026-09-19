// Day 19 (Run 5c2, §8.2) — the km cross-check reads the test that PRECEDED the km observation.
//
// The rule: the ad's km is compared with the last test reading dated on or before the day that km was
// observed. A test that happened after that day cannot contradict a number that was written down before it,
// so it is not read, does not count in confidence, and does not feed the km-per-month rate.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kmCheck, kmFacts, testReadingAt } from "./checks";
import { input } from "./fixtures";
import { KM_BELOW_THRESHOLD } from "./constants";
import type { SoldSignal } from "./types";

const NO_SOLD: SoldSignal = { strength: null, evidence: [] };
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const SEEN = new Date("2026-06-15T09:30:00.000Z"); // the day the ad's km was observed

// A car whose registry latest pair is the LAST reading in the list, unless the test overrides it.
const car = (readings: { test_date: Date; km: number }[], latest?: { test_date: Date | null; km: number | null }) => {
  const last = readings[readings.length - 1];
  return {
    test_readings: readings,
    mivchan_acharon_dt: latest === undefined ? last.test_date : latest.test_date,
    km_at_last_test: latest === undefined ? last.km : latest.km,
  };
};

describe("testReadingAt (§1.2) — which reading the check reads", () => {
  it("the latest reading dated on or before km_observed_at wins", () => {
    const r = testReadingAt(
      input({
        listing: { km_observed_at: SEEN },
        car: car([
          { test_date: d("2024-01-10"), km: 20000 },
          { test_date: d("2025-05-20"), km: 45000 },
          { test_date: d("2026-02-02"), km: 60000 },
          { test_date: d("2026-08-30"), km: 79000 },
        ]),
      }),
    );
    assert.deepEqual(r, { test_date: d("2026-02-02"), km: 60000 });
  });

  it("a test on the SAME calendar day as the observation counts", () => {
    const r = testReadingAt(
      input({
        listing: { km_observed_at: SEEN },
        car: car([
          { test_date: d("2025-01-01"), km: 30000 },
          { test_date: d("2026-06-15"), km: 58000 },
        ]),
      }),
    );
    assert.deepEqual(r, { test_date: d("2026-06-15"), km: 58000 });
  });

  it("every reading later than the observation -> null", () => {
    const r = testReadingAt(
      input({
        listing: { km_observed_at: SEEN },
        car: car([
          { test_date: d("2026-07-01"), km: 70000 },
          { test_date: d("2026-08-30"), km: 79000 },
        ]),
      }),
    );
    assert.equal(r, null);
  });

  it("test_readings absent -> the car's own latest pair is the one known reading", () => {
    const r = testReadingAt(
      input({ listing: { km_observed_at: SEEN }, car: { mivchan_acharon_dt: d("2026-02-02"), km_at_last_test: 60000 } }),
    );
    assert.deepEqual(r, { test_date: d("2026-02-02"), km: 60000 });
  });

  it("test_readings absent and the latest pair incomplete -> null", () => {
    const noKm = testReadingAt(input({ listing: { km_observed_at: SEEN }, car: { mivchan_acharon_dt: d("2026-02-02"), km_at_last_test: null } }));
    assert.equal(noKm, null);
    const noDate = testReadingAt(input({ listing: { km_observed_at: SEEN }, car: { mivchan_acharon_dt: null, km_at_last_test: 60000 } }));
    assert.equal(noDate, null);
  });
});

describe("kmCheck (§1.4) — a later test cannot contradict an earlier km", () => {
  // The case the rule was written for: the ad says 73,000, the test we held said 79,000 — but that test
  // happened AFTER the ad's km was seen. The test that preceded it said 60,000, which the ad is above.
  it("73,000 seen before a later test of 79,000, earlier test 60,000 -> match, not km_below", () => {
    const c = kmCheck(
      input({
        listing: { km_declared: 73000, km_observed_at: SEEN },
        car: car([
          { test_date: d("2026-02-02"), km: 60000 },
          { test_date: d("2026-08-30"), km: 79000 },
        ]),
      }),
      NO_SOLD,
    );
    assert.equal(c.status, "match");
    assert.equal(c.official, 60000);
    assert.equal(c.official_date, "2026-02-02");
    assert.equal(c.diff, 13000);
  });

  it("a real contradiction still counts: earlier test 80,000, ad 73,000 -> km_below, counts true", () => {
    const c = kmCheck(
      input({
        listing: { km_declared: 73000, km_observed_at: SEEN },
        car: car([
          { test_date: d("2026-02-02"), km: 80000 },
          { test_date: d("2026-08-30"), km: 90000 },
        ]),
      }),
      NO_SOLD,
    );
    assert.equal(c.status, "mismatch");
    assert.equal(c.kind, "km_below");
    assert.equal(c.counts, true);
    assert.equal(c.official, 80000);
    assert.equal(c.official_date, "2026-02-02");
    assert.equal(c.diff, -7000);
    assert.ok(-c.diff! > KM_BELOW_THRESHOLD);
  });

  it("only a later reading -> unavailable, test_after_observation, with declared and no official", () => {
    const c = kmCheck(
      input({
        listing: { km_declared: 73000, km_observed_at: SEEN },
        car: car([{ test_date: d("2026-08-30"), km: 79000 }]),
      }),
      NO_SOLD,
    );
    assert.equal(c.status, "unavailable");
    assert.equal(c.reason, "test_after_observation");
    assert.equal(c.declared, 73000);
    assert.equal(c.official, undefined);
    assert.equal(c.official_date, undefined);
  });

  it("official / official_date are the CHOSEN reading's, not the car's latest pair", () => {
    const c = kmCheck(
      input({
        listing: { km_declared: 62000, km_observed_at: SEEN },
        car: car([
          { test_date: d("2025-05-20"), km: 45000 },
          { test_date: d("2026-02-02"), km: 60000 },
          { test_date: d("2026-08-30"), km: 79000 },
        ]),
      }),
      NO_SOLD,
    );
    assert.equal(c.official, 60000);
    assert.equal(c.official_date, "2026-02-02");
    assert.notEqual(c.official, 79000);
  });

  it("the registry gates come first and are judged on the LATEST pair (§1.4 steps 3 and 4)", () => {
    const noKm = kmCheck(
      input({
        listing: { km_declared: 73000, km_observed_at: SEEN },
        car: car([{ test_date: d("2026-02-02"), km: 60000 }], { test_date: d("2026-08-30"), km: null }),
      }),
      NO_SOLD,
    );
    assert.equal(noKm.reason, "no_official_km");
    const noDate = kmCheck(
      input({
        listing: { km_declared: 73000, km_observed_at: SEEN },
        car: car([{ test_date: d("2026-02-02"), km: 60000 }], { test_date: null, km: 79000 }),
      }),
      NO_SOLD,
    );
    assert.equal(noDate.reason, "no_test_date");
  });

  it("official_is_intake is decided on the chosen reading", () => {
    const c = kmCheck(
      input({
        listing: { km_declared: 73000, km_observed_at: SEEN },
        car: car([
          { test_date: d("2026-02-02"), km: 0 },
          { test_date: d("2026-08-30"), km: 79000 },
        ]),
      }),
      NO_SOLD,
    );
    assert.equal(c.reason, "official_is_intake");
    assert.equal(c.official, 0);
    assert.equal(c.official_date, "2026-02-02");
  });
});

describe("kmFacts (§1.3) — the rate runs from the chosen reading to km_observed_at", () => {
  it("the months and the rate are measured from the chosen reading, not from the latest test", () => {
    const f = kmFacts(
      input({
        listing: { km_declared: 73000, km_observed_at: SEEN },
        car: car([
          { test_date: d("2026-02-02"), km: 60000 },
          { test_date: d("2026-08-30"), km: 79000 },
        ]),
      }),
    );
    // February -> June = 4 whole calendar months; 13,000 km over them.
    assert.equal(f.months_since_test, 4);
    assert.equal(f.diff, 13000);
    assert.equal(f.km_per_month_since_test, 13000 / 4);
  });

  it("no reading on or before the observation -> all three facts null", () => {
    const f = kmFacts(
      input({
        listing: { km_declared: 73000, km_observed_at: SEEN },
        car: car([{ test_date: d("2026-08-30"), km: 79000 }]),
      }),
    );
    assert.deepEqual(f, { months_since_test: null, km_per_month_since_test: null, diff: null });
  });

  it("the months floor of 1 still holds when the chosen reading is in the observation's own month", () => {
    const f = kmFacts(
      input({
        listing: { km_declared: 61000, km_observed_at: SEEN },
        car: car([{ test_date: d("2026-06-01"), km: 60000 }]),
      }),
    );
    assert.equal(f.months_since_test, 1);
    assert.equal(f.km_per_month_since_test, 1000);
  });
});
