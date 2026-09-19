// Day 19 (Run 5c2, §8.2) — the km cross-check reads the test that PRECEDED the km observation.
//
// The rule: the ad's km is compared with the last test reading dated on or before the day that km was
// observed. A test that happened after that day cannot contradict a number that was written down before it,
// so it is not read, does not count in confidence, and does not feed the km-per-month rate.
//
// Day 19 (Run 5c3, §5) — and the FIRST test after the observation, with a driving allowance: it contradicts
// the ad only by the km the car cannot have driven since the day the ad's km was seen
// (KM_BELOW_THRESHOLD + KM_IMPLAUSIBLE_PER_MONTH per month, pro-rated by days, a month = 30 days).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DAYS_PER_MONTH, kmCheck, kmFacts, testReadingAfter, testReadingAt } from "./checks";
import { input } from "./fixtures";
import { KM_BELOW_THRESHOLD, KM_IMPLAUSIBLE_PER_MONTH } from "./constants";
import type { SoldSignal } from "./types";

const NO_SOLD: SoldSignal = { strength: null, evidence: [] };
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const SEEN = new Date("2026-06-15T09:30:00.000Z"); // the day the ad's km was observed
const allowanceFor = (days: number) => (KM_IMPLAUSIBLE_PER_MONTH * days) / DAYS_PER_MONTH;

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

  // Run 5c3 (§1.3): the case that used to be 'test_after_observation' is now judged against the after
  // reading — 73,000 seen on 15/06 against 79,000 on 30/08 is 6,000 below, well inside 76 days of driving.
  it("only a later reading -> judged against it, with the driving allowance", () => {
    const c = kmCheck(
      input({
        listing: { km_declared: 73000, km_observed_at: SEEN },
        car: car([{ test_date: d("2026-08-30"), km: 79000 }]),
      }),
      NO_SOLD,
    );
    assert.equal(c.status, "match");
    assert.equal(c.reason, undefined);
    assert.equal(c.declared, 73000);
    assert.equal(c.official, 79000);
    assert.equal(c.official_date, "2026-08-30");
    assert.equal((c.raw as { reading: string }).reading, "after");
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

  it("official_is_intake: the intake reading alone leaves nothing to judge by", () => {
    const c = kmCheck(
      input({
        listing: { km_declared: 73000, km_observed_at: SEEN },
        car: car([{ test_date: d("2026-02-02"), km: 0 }]),
      }),
      NO_SOLD,
    );
    assert.equal(c.status, "unavailable");
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

  it("only an after reading -> the facts stay null; they are about the before reading", () => {
    const f = kmFacts(
      input({
        listing: { km_declared: 73000, km_observed_at: SEEN },
        car: car([{ test_date: d("2026-06-16"), km: 100000 }]),
      }),
    );
    assert.deepEqual(f, { months_since_test: null, km_per_month_since_test: null, diff: null });
  });
});

// ---------------------------------------------------------------------------------------------------
// Day 19 (Run 5c3, §5) — the first reading AFTER the observation, and the driving allowance.
// ---------------------------------------------------------------------------------------------------

describe("testReadingAfter (§1.1) — the earliest reading after the observation day", () => {
  it("the earliest of the later readings wins", () => {
    const r = testReadingAfter(
      input({
        listing: { km_observed_at: SEEN },
        car: car([
          { test_date: d("2026-02-02"), km: 60000 },
          { test_date: d("2026-07-01"), km: 70000 },
          { test_date: d("2026-08-30"), km: 79000 },
        ]),
      }),
    );
    assert.deepEqual(r, { test_date: d("2026-07-01"), km: 70000 });
  });

  it("a test on the observation day itself is a BEFORE reading, never an after one", () => {
    const i = input({
      listing: { km_observed_at: SEEN },
      car: car([{ test_date: d("2026-06-15"), km: 58000 }]),
    });
    assert.deepEqual(testReadingAt(i), { test_date: d("2026-06-15"), km: 58000 });
    assert.equal(testReadingAfter(i), null);
  });

  it("no reading after the observation -> null", () => {
    const r = testReadingAfter(
      input({ listing: { km_observed_at: SEEN }, car: car([{ test_date: d("2026-02-02"), km: 60000 }]) }),
    );
    assert.equal(r, null);
  });
});

describe("kmCheck (§1.3) — the after reading, with the driving allowance", () => {
  const afterOnly = (test_date: string, km: number, km_declared = 73000) =>
    kmCheck(
      input({ listing: { km_declared, km_observed_at: SEEN }, car: car([{ test_date: d(test_date), km }]) }),
      NO_SOLD,
    );

  it("a test the NEXT day reading 100,000 against an ad of 73,000 -> km_below; nobody drives 27,000 km in a day", () => {
    const c = afterOnly("2026-06-16", 100000);
    assert.equal(c.status, "mismatch");
    assert.equal(c.kind, "km_below");
    assert.equal(c.counts, true);
    assert.equal(c.official, 100000);
    assert.equal(c.official_date, "2026-06-16");
    assert.equal(c.diff, -27000);
    const raw = c.raw as { reading: string; days_after: number; allowance_km: number };
    assert.equal(raw.reading, "after");
    assert.equal(raw.days_after, 1);
    assert.equal(raw.allowance_km, allowanceFor(1));
  });

  it("a test the next day, only 4,000 above the ad -> match: inside the plain threshold", () => {
    const c = afterOnly("2026-06-16", 77000);
    assert.equal(c.status, "match");
    assert.equal(c.official, 77000);
    assert.equal((c.raw as { reading: string }).reading, "after");
  });

  // The brief's second example: 49 days later the threshold is 5,000 + 5,000 x 49/30 = 13,166.67.
  it("49 days later: 6,000 below -> match, 20,000 below -> km_below", () => {
    const ok = afterOnly("2026-08-03", 79000);
    assert.equal(ok.status, "match");
    const raw = ok.raw as { days_after: number; allowance_km: number };
    assert.equal(raw.days_after, 49);
    assert.equal(raw.allowance_km, allowanceFor(49));
    assert.ok(Math.abs(KM_BELOW_THRESHOLD + raw.allowance_km - 13166.67) < 0.01);

    const bad = afterOnly("2026-08-03", 93000);
    assert.equal(bad.status, "mismatch");
    assert.equal(bad.kind, "km_below");
    assert.equal(bad.official, 93000);
  });

  it("a gap exactly equal to the threshold plus the allowance -> match; the comparison is strict", () => {
    // 30 days after the observation: allowance 5,000, threshold 10,000. 73,000 against 83,000 is exactly that.
    const exact = afterOnly("2026-07-15", 83000);
    assert.equal((exact.raw as { allowance_km: number }).allowance_km, KM_IMPLAUSIBLE_PER_MONTH);
    assert.equal(exact.diff, -10000);
    assert.equal(exact.status, "match");
    // One km more and it is a contradiction.
    assert.equal(afterOnly("2026-07-15", 83001).status, "mismatch");
  });

  it("the allowance is pro-rated by days: 15 days -> 2,500", () => {
    const c = afterOnly("2026-06-30", 77000);
    const raw = c.raw as { days_after: number; allowance_km: number };
    assert.equal(raw.days_after, 15);
    assert.equal(raw.allowance_km, 2500);
    assert.equal(c.status, "match");
  });

  it("only an after reading -> the three kmFacts keys are null in raw, and there is no growth verdict", () => {
    const c = afterOnly("2026-08-03", 40000, 73000); // the ad is far ABOVE the later test — says nothing
    assert.equal(c.status, "match");
    assert.deepEqual(
      { ...(c.raw as Record<string, unknown>), reading: undefined, days_after: undefined, allowance_km: undefined },
      { diff: null, months_since_test: null, km_per_month_since_test: null, reading: undefined, days_after: undefined, allowance_km: undefined },
    );
  });
});

describe("kmCheck (§1.3) — both readings: one contradiction is enough", () => {
  const both = (km_declared: number, before_km: number, after_km: number) =>
    kmCheck(
      input({
        listing: { km_declared, km_observed_at: SEEN },
        car: car([
          { test_date: d("2026-02-02"), km: before_km },
          { test_date: d("2026-08-03"), km: after_km }, // 49 days after the observation
        ]),
      }),
      NO_SOLD,
    );

  it("before contradicts, after does not -> km_below recording the BEFORE reading", () => {
    const c = both(73000, 80000, 79000); // before: -7,000 (> 5,000); after: -6,000 (< 13,166.67)
    assert.equal(c.status, "mismatch");
    assert.equal(c.kind, "km_below");
    assert.equal(c.official, 80000);
    assert.equal(c.official_date, "2026-02-02");
    assert.equal((c.raw as { reading: string }).reading, "before");
    assert.equal((c.raw as { days_after?: number }).days_after, undefined);
  });

  it("before is fine, after contradicts -> km_below recording the AFTER reading", () => {
    const c = both(73000, 60000, 93000); // before: +13,000; after: -20,000 (> 13,166.67)
    assert.equal(c.status, "mismatch");
    assert.equal(c.kind, "km_below");
    assert.equal(c.official, 93000);
    assert.equal(c.official_date, "2026-08-03");
    assert.equal(c.diff, -20000);
    const raw = c.raw as { reading: string; days_after: number; diff: number };
    assert.equal(raw.reading, "after");
    assert.equal(raw.days_after, 49);
    assert.equal(raw.diff, 13000); // the FACTS stay the before reading's
  });

  it("both fine -> match recording the BEFORE reading", () => {
    const c = both(73000, 60000, 79000);
    assert.equal(c.status, "match");
    assert.equal(c.official, 60000);
    assert.equal(c.official_date, "2026-02-02");
    assert.equal((c.raw as { reading: string }).reading, "before");
  });

  it("an intake before reading (0 km) is set aside: the after reading judges the ad", () => {
    const c = both(73000, 0, 79000);
    assert.equal(c.status, "match");
    assert.equal(c.reason, undefined);
    assert.equal(c.official, 79000);
    assert.equal(c.official_date, "2026-08-03");
    assert.equal((c.raw as { reading: string }).reading, "after");
    // ...and it still contradicts when the after reading is beyond the allowance.
    const bad = both(73000, 0, 93000);
    assert.equal(bad.kind, "km_below");
    assert.equal(bad.official, 93000);
  });

  it("km_implausible_growth is judged against the before reading only, and records it", () => {
    // before 60,000 on 02/02, ad 100,000 on 15/06 = 40,000 over 4 months = 10,000/month.
    // The after reading (110,000, 49 days later) is 10,000 above the ad — inside its 13,166.67 threshold.
    const c = both(100000, 60000, 110000);
    assert.equal(c.status, "mismatch");
    assert.equal(c.kind, "km_implausible_growth");
    assert.equal(c.counts, false);
    assert.equal(c.official, 60000);
    assert.equal((c.raw as { reading: string }).reading, "before");
  });
});
