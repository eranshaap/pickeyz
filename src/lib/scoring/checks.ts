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
  // Run 5c2 (§1.4): every reading we hold is later than the day the km was seen -> no comparison.
  const reading = testReadingAt(input);
  if (reading === null) return { check: "km", status: "unavailable", reason: "test_after_observation", declared };
  const official = reading.km;
  const official_date = dateToIso(reading.test_date);
  if (official === 0) return { check: "km", status: "unavailable", reason: "official_is_intake", declared, official, official_date };

  const f = kmFacts(input);
  const diff = f.diff as number;
  const months_since_test = f.months_since_test as number;
  const raw = { diff, months_since_test, km_per_month_since_test: f.km_per_month_since_test };
  const base = { check: "km" as const, declared, official, diff, official_date, raw };

  if (diff < -KM_BELOW_THRESHOLD) {
    return { ...base, status: "mismatch", kind: "km_below", counts: KM_CHECK_KINDS.km_below.counts };
  }
  if (diff > 0 && diff / months_since_test > KM_IMPLAUSIBLE_PER_MONTH) {
    return { ...base, status: "mismatch", kind: "km_implausible_growth", counts: KM_CHECK_KINDS.km_implausible_growth.counts };
  }
  return { ...base, status: "match" };
}
