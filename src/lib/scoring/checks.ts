// Cross-checks (BRIEF §7, amended §18.7 and §18.8): the ad's declarations against the official record.
//
// §18.8 — the sold signal decides whether a check runs at all:
//   strong  -> both checks status 'skipped', reason 'sold'
//   medium  -> both checks status 'skipped', reason 'possibly_sold'
//   null    -> both run on the FULL record (there is no record_at_listing)
// A skipped check is neither an item nor a mismatch.
//
// Day 19 (§3.5, §3.6) — the clock freeze: the months since the last test are counted up to the day the
// ad's km was OBSERVED (listings.km_observed_at), because the pair being judged is that km against that
// test. The run clock is not in it. The floor of 1 month and the implausible-growth rule are unchanged.

// Day 19 (Run 5c2, §1) — WHICH test is read: the ad's km is compared with the last test reading dated on or
// before the day that km was observed. A test that took place after that day is not counted and does not feed
// the km-per-month rate; a car with no reading on or before that day gets no comparison at all. The direction
// is unchanged: an ad below the test by KM_BELOW_THRESHOLD or more is a counted mismatch, an ad above says
// nothing. The check records the CHOSEN reading as official / official_date — that is how the invoice says
// which test was used.

// Day 19 (Run 5c3, §1) — the cross-check also reads the first test AFTER the observation. The question it asks
// is unchanged: was the km in the ad false on the day it was observed? Two readings can answer it —
//   before: the last reading dated on or before the observation day. A contradiction when the ad is below it by
//           more than KM_BELOW_THRESHOLD. Unchanged from Run 5c2.
//   after:  the first reading dated after the observation day. A contradiction only when the ad is below it by
//           more than KM_BELOW_THRESHOLD plus a driving allowance — KM_IMPLAUSIBLE_PER_MONTH per month between
//           the observation and that test, pro-rated by days. What the car drove in between is not held against
//           the ad; what it cannot have driven is.
// One contradiction is enough, and the direction stays single: an ad ABOVE a reading says nothing. A car with no
// reading at all still gets no comparison — so 'test_after_observation' is gone: that case is now judged against
// the after reading. kmFacts is unchanged: it is about the before reading.

import { HAND_CHECK_KINDS, KM_BELOW_THRESHOLD, KM_CHECK_KINDS, KM_IMPLAUSIBLE_PER_MONTH } from "./constants";
import { analyzeHistory } from "./history";
import type { Check, ScoringInput, SoldSignal, TestReading } from "./types";
import { dateToIso, monthsBetween } from "./util";

function skipped(check: Check["check"], sold: SoldSignal): Check | null {
  if (sold.strength === "strong") return { check, status: "skipped", reason: "sold" };
  if (sold.strength === "medium") return { check, status: "skipped", reason: "possibly_sold" };
  return null;
}

export function handCheck(input: ScoringInput, sold: SoldSignal): Check {
  const skip = skipped("hand", sold);
  if (skip) return skip;

  const declared = input.listing.hand_declared;
  const rows = input.car.ownership_history;
  if (declared === null) return { check: "hand", status: "unavailable", reason: "no_declaration" };
  if (declared <= 0) return { check: "hand", status: "unavailable", reason: "invalid_declaration", declared }; // §18.7
  if (rows === null || rows.length === 0) return { check: "hand", status: "unavailable", reason: "no_history", declared };

  const a = analyzeHistory(rows);
  const official = a.non_dealer.length;
  const raw = {
    paper_hand: input.car.hand,
    record_rows: rows.length,
    zero_km_deal: a.zero_km_deal,
    fleet_row: a.has_fleet_row,
    private_pair: a.private_pair,
  };
  const diff = declared - official;
  if (diff === 0) return { check: "hand", status: "match", declared, official, diff, raw };

  let kind: keyof typeof HAND_CHECK_KINDS;
  if (diff === -1) {
    if (a.zero_km_deal) kind = "zero_km_undercount";
    else if (a.has_fleet_row) kind = "fleet_undercount";
    else if (a.private_pair) kind = "private_pair";
    else kind = "other";
  } else {
    kind = "other";
  }
  return { check: "hand", status: "mismatch", kind, counts: HAND_CHECK_KINDS[kind].counts, declared, official, diff, raw };
}

/**
 * Day 19 (Run 5c2, §1.1, §1.2) — the readings the engine knows about. `car.test_readings` is what the mapper
 * loaded (production always sets it); when it is absent the car's own latest pair is the one known reading, so
 * a hand-built input keeps the meaning it had before this run.
 */
function knownReadings(input: ScoringInput): TestReading[] {
  const { test_readings, mivchan_acharon_dt, km_at_last_test } = input.car;
  if (test_readings !== undefined) return test_readings;
  if (mivchan_acharon_dt === null || km_at_last_test === null) return [];
  return [{ test_date: mivchan_acharon_dt, km: km_at_last_test }];
}

/**
 * Day 19 (Run 5c2, §1.2) — the reading the km check reads: among the known readings, the latest one whose
 * test_date is on or before the day the ad's km was observed. None -> null.
 *
 * Compared by CALENDAR DAY (UTC), like every other date in the engine: a test on the same day as the
 * observation counts, whatever time of day either value carries.
 */
export function testReadingAt(input: ScoringInput): TestReading | null {
  const observed = dateToIso(input.listing.km_observed_at);
  let chosen: TestReading | null = null;
  for (const r of knownReadings(input)) {
    if (dateToIso(r.test_date) > observed) continue;
    if (chosen === null || r.test_date.getTime() > chosen.test_date.getTime()) chosen = r;
  }
  return chosen;
}

/**
 * Day 19 (Run 5c3, §1.1) — the other reading the km check reads: among the known readings, the EARLIEST one
 * whose test_date is after the day the ad's km was observed. None -> null.
 *
 * The same known-readings helper and the same UTC-calendar-day comparison as testReadingAt, so the two are
 * exact complements: a test on the observation day itself is a BEFORE reading, never an after one.
 */
export function testReadingAfter(input: ScoringInput): TestReading | null {
  const observed = dateToIso(input.listing.km_observed_at);
  let chosen: TestReading | null = null;
  for (const r of knownReadings(input)) {
    if (dateToIso(r.test_date) <= observed) continue;
    if (chosen === null || r.test_date.getTime() < chosen.test_date.getTime()) chosen = r;
  }
  return chosen;
}

// Run 5c3 (§1.2): the driving allowance is pro-rated by days, and a month is 30 days — the unit the ledger row
// of KM_BELOW_THRESHOLD speaks in (KM_IMPLAUSIBLE_PER_MONTH per month, pro-rated by days, a month = 30 days).
export const DAYS_PER_MONTH = 30;

// Whole UTC calendar days from the observation day to a reading's test_date, floored at 1: an after reading is
// at least one day later by construction, and a same-day reading is a before reading, not an after one.
function daysAfterObservation(observed_at: Date, test_date: Date): number {
  const days = (Date.parse(dateToIso(test_date)) - Date.parse(dateToIso(observed_at))) / 86_400_000;
  return Math.max(days, 1);
}

// Run 5c3 (§1.2): what the car may plausibly have driven between the observation and a later test. Not rounded.
function drivingAllowance(days_after: number): number {
  return (KM_IMPLAUSIBLE_PER_MONTH * days_after) / DAYS_PER_MONTH;
}

// The km facts the result reports (§9 facts) — computed once, shared by the km check.
export type KmFacts = { months_since_test: number | null; km_per_month_since_test: number | null; diff: number | null };

export function kmFacts(input: ScoringInput): KmFacts {
  const none = { months_since_test: null, km_per_month_since_test: null, diff: null };
  if (input.car.mivchan_acharon_dt === null) return none;
  // Run 5c2 (§1.3): the facts are measured from the CHOSEN reading, not from the car's latest pair. No reading
  // on or before the observation -> there is no pair to measure, so all three facts are null. (This also makes
  // months_since_test null for a car whose latest test carries no km — intended.)
  const reading = testReadingAt(input);
  if (reading === null) return none;
  const months_since_test = Math.max(monthsBetween(reading.test_date, input.listing.km_observed_at), 1);
  const { km_declared } = input.listing;
  if (km_declared === null) return { months_since_test, km_per_month_since_test: null, diff: null };
  const diff = km_declared - reading.km;
  return { months_since_test, km_per_month_since_test: diff > 0 ? diff / months_since_test : null, diff };
}

export function kmCheck(input: ScoringInput, sold: SoldSignal): Check {
  const skip = skipped("km", sold);
  if (skip) return skip;

  const declared = input.listing.km_declared;
  const latest_km = input.car.km_at_last_test;
  const latest_date = input.car.mivchan_acharon_dt;
  // Reasons for missing inputs per §18.5; official_is_intake per §7.
  if (declared === null) return { check: "km", status: "unavailable", reason: "no_declaration" };
  // The registry gave nothing to compare — judged on the car's LATEST pair, as before: these two say whether
  // there is an official record at all, not which reading is the right one to read.
  if (latest_km === null) return { check: "km", status: "unavailable", reason: "no_official_km", declared };
  if (latest_date === null) return { check: "km", status: "unavailable", reason: "no_test_date", declared, official: latest_km };
  // Run 5c3 (§1.3): the two readings that can answer the question. At least one of them exists here — the car's
  // latest pair is itself a known reading, and it is either on or before the observation day, or after it.
  const before = testReadingAt(input);
  const after = testReadingAfter(input);
  // A reading of 0 km is the intake record, not a test: it contradicts nothing and is set aside.
  const usable_before = before !== null && before.km !== 0 ? before : null;
  const usable_after = after !== null && after.km !== 0 ? after : null;
  if (usable_before === null && usable_after === null) {
    // Only intake records to judge by — recorded as before: the intake reading itself is the official.
    const intake = (before ?? after) as TestReading;
    return { check: "km", status: "unavailable", reason: "official_is_intake", declared, official: intake.km, official_date: dateToIso(intake.test_date) };
  }
  const primary = (usable_before ?? usable_after) as TestReading;

  // The facts are the before reading's, as they were — null throughout when there is no before reading.
  const f = kmFacts(input);
  const facts = { diff: f.diff, months_since_test: f.months_since_test, km_per_month_since_test: f.km_per_month_since_test };
  const at = (reading: TestReading, which: "before" | "after") => {
    const days_after = which === "after" ? daysAfterObservation(input.listing.km_observed_at, reading.test_date) : null;
    return {
      check: "km" as const,
      declared,
      official: reading.km,
      diff: declared - reading.km,
      official_date: dateToIso(reading.test_date),
      raw: days_after === null
        ? { ...facts, reading: which }
        : { ...facts, reading: which, days_after, allowance_km: drivingAllowance(days_after) },
    };
  };

  // 4. the before reading: the ad below it by more than the threshold is a contradiction, as it always was.
  if (usable_before !== null && declared - usable_before.km < -KM_BELOW_THRESHOLD) {
    return { ...at(usable_before, "before"), status: "mismatch", kind: "km_below", counts: KM_CHECK_KINDS.km_below.counts };
  }
  // 5. the after reading: the threshold grows by what the car may have driven since the observation.
  if (usable_after !== null) {
    const allowance = drivingAllowance(daysAfterObservation(input.listing.km_observed_at, usable_after.test_date));
    if (declared - usable_after.km < -(KM_BELOW_THRESHOLD + allowance)) {
      return { ...at(usable_after, "after"), status: "mismatch", kind: "km_below", counts: KM_CHECK_KINDS.km_below.counts };
    }
  }
  // 6. implausible growth — against the before reading only, on its own facts, unchanged. A before reading that
  //    is the intake record is set aside here too: growth away from 0 km is not a claim about the ad.
  if (usable_before !== null && f.diff !== null && f.diff > 0 && f.months_since_test !== null && f.diff / f.months_since_test > KM_IMPLAUSIBLE_PER_MONTH) {
    return { ...at(usable_before, "before"), status: "mismatch", kind: "km_implausible_growth", counts: KM_CHECK_KINDS.km_implausible_growth.counts };
  }
  // 7. no contradiction: the primary reading is what the invoice records.
  return { ...at(primary, usable_before !== null ? "before" : "after"), status: "match" };
}
