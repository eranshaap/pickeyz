// Cross-checks (BRIEF §7, amended §18.7 and §18.8): the ad's declarations against the official record.
//
// §18.8 — the sold signal decides whether a check runs at all:
//   strong  -> both checks status 'skipped', reason 'sold'
//   medium  -> both checks status 'skipped', reason 'possibly_sold'
//   null    -> both run on the FULL record (there is no record_at_listing)
// A skipped check is neither an item nor a mismatch.

import { HAND_CHECK_KINDS, KM_BELOW_THRESHOLD, KM_CHECK_KINDS, KM_IMPLAUSIBLE_PER_MONTH } from "./constants";
import { analyzeHistory } from "./history";
import type { Check, ScoringInput, SoldSignal } from "./types";
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

// The km facts the result reports (§9 facts) — computed once, shared by the km check.
export type KmFacts = { months_since_test: number | null; km_per_month_since_test: number | null; diff: number | null };

export function kmFacts(input: ScoringInput, now: Date): KmFacts {
  const test = input.car.mivchan_acharon_dt;
  if (test === null) return { months_since_test: null, km_per_month_since_test: null, diff: null };
  const months_since_test = Math.max(monthsBetween(test, now), 1);
  const { km_declared } = input.listing;
  const { km_at_last_test } = input.car;
  if (km_declared === null || km_at_last_test === null) return { months_since_test, km_per_month_since_test: null, diff: null };
  const diff = km_declared - km_at_last_test;
  return { months_since_test, km_per_month_since_test: diff > 0 ? diff / months_since_test : null, diff };
}

export function kmCheck(input: ScoringInput, now: Date, sold: SoldSignal): Check {
  const skip = skipped("km", sold);
  if (skip) return skip;

  const declared = input.listing.km_declared;
  const official = input.car.km_at_last_test;
  const test = input.car.mivchan_acharon_dt;
  // Reasons for missing inputs per §18.5; official_is_intake per §7.
  if (declared === null) return { check: "km", status: "unavailable", reason: "no_declaration" };
  if (official === null) return { check: "km", status: "unavailable", reason: "no_official_km", declared };
  if (test === null) return { check: "km", status: "unavailable", reason: "no_test_date", declared, official };
  const official_date = dateToIso(test);
  if (official === 0) return { check: "km", status: "unavailable", reason: "official_is_intake", declared, official, official_date };

  const f = kmFacts(input, now);
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
