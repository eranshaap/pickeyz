// Sold signal (BRIEF §6, amended §18.3 and §18.8): does the ownership record say the car changed
// hands after the listing?
//
// Rules, in order; the first strong rule that fires ends the evaluation; if none, the medium rules;
// if none, null. seller_type comes in on the input (§18.3). There is no record_at_listing (§18.8):
// when a rule fires, the checks are skipped; when none fires, they run on the full record.
//
//   1 strong  owners_at_first_seen is set, the record now has more rows, and the newest row's ym
//             >= the month of first_seen_at.
//   2 strong  seller is a fleet company and any row follows the company's row (inert until Day 28's
//             dealer classification — nothing produces seller_type 'fleet_company' yet).
//   3 medium  seller is a dealer, the record has a dealer row, and a private row follows the LAST
//             dealer row with ym within the last SOLD_SIGNAL_RECENT_MONTHS.
//   4 medium  seller is private and any row follows the last private row with ym within the last
//             SOLD_SIGNAL_RECENT_MONTHS.
//
// Day 19 (§3.4) — the clock freeze: "the last SOLD_SIGNAL_RECENT_MONTHS" are measured back from the
// listing's own first_seen_at, not from the run clock. The question the signal asks is whether the record
// moved around the time the ad went up, and that is a fact about the ad, not about the day it is read.
// The rules themselves are untouched; only the month index they count back from is another date.

import { SOLD_SIGNAL_RECENT_MONTHS } from "./constants";
import type { OwnershipRow, ScoringInput, SoldSignal } from "./types";
import { dateToYm, ymIndex } from "./util";

const FLEET_TYPES: readonly string[] = ["leasing", "rental", "company"];

export function soldSignal(input: ScoringInput): SoldSignal {
  const rows = input.car.ownership_history ?? [];
  const none: SoldSignal = { strength: null, evidence: [] };
  if (rows.length === 0) return none;

  const seller = input.listing.seller_type;
  // Day 19 (§3.4): the window is measured back from the listing's first sighting.
  const from = input.listing.first_seen_at;
  const fromIdx = ymIndex(dateToYm(from));
  const recent = (r: OwnershipRow) => fromIdx - ymIndex(r.ym) <= SOLD_SIGNAL_RECENT_MONTHS;
  const newest = rows[rows.length - 1];

  // 1
  const seen = input.listing.owners_at_first_seen;
  if (seen !== null) {
    const firstSeenYm = dateToYm(input.listing.first_seen_at);
    if (rows.length > seen && ymIndex(newest.ym) >= ymIndex(firstSeenYm)) {
      return {
        strength: "strong",
        evidence: [`rule 1: record grew from ${seen} to ${rows.length} rows; newest row ${newest.ym} (${newest.type}) is not before first seen ${firstSeenYm}`],
      };
    }
  }

  // 2 — inert until Day 28: nothing produces seller_type 'fleet_company' today.
  if (seller === "fleet_company") {
    let lastFleet = -1;
    rows.forEach((r, i) => { if (FLEET_TYPES.includes(r.type)) lastFleet = i; });
    if (lastFleet >= 0 && lastFleet < rows.length - 1) {
      return { strength: "strong", evidence: [`rule 2: ${rows.length - 1 - lastFleet} row(s) follow the fleet company's row ${rows[lastFleet].ym}`] };
    }
  }

  // 3
  if (seller === "dealer") {
    let lastDealer = -1;
    rows.forEach((r, i) => { if (r.type === "dealer") lastDealer = i; });
    if (lastDealer >= 0) {
      const hit = rows.slice(lastDealer + 1).find((r) => r.type === "private" && recent(r));
      if (hit) {
        return {
          strength: "medium",
          evidence: [`rule 3: private row ${hit.ym} follows the last dealer row ${rows[lastDealer].ym}, within ${SOLD_SIGNAL_RECENT_MONTHS} months of ${dateToYm(from)}`],
        };
      }
    }
  }

  // 4
  if (seller === "private") {
    let lastPrivate = -1;
    rows.forEach((r, i) => { if (r.type === "private") lastPrivate = i; });
    if (lastPrivate >= 0) {
      const hit = rows.slice(lastPrivate + 1).find(recent);
      if (hit) {
        return {
          strength: "medium",
          evidence: [`rule 4: ${hit.type} row ${hit.ym} follows the seller's private row ${rows[lastPrivate].ym}, within ${SOLD_SIGNAL_RECENT_MONTHS} months of ${dateToYm(from)}`],
        };
      }
    }
  }

  return none;
}
