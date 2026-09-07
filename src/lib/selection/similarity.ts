// distance(a, b) — the similarity value between two candidates, in percent of value (BRIEF §4.8).
//
//   different cell (comparison_group or year differ)          -> null   (never compared)
//   either car's price row or km row not 'scored'              -> null   (unknown side = no comparison)
//   otherwise:  dp = a.price_row.value - b.price_row.value
//               dk = a.km_row.value    - b.km_row.value
//               distance = round(sqrt(dp^2 + dk^2), 2)
//
// It reads the two rows' `value` from the invoices — the deviation from the cell's medians, already in the
// engine's unit — and nothing else.

import { DISTANCE_ROUND_DECIMALS } from "./constants";
import type { CandidateListing } from "./types";
import { invoiceRow, round, scoredValue } from "./util";

export function sameCell(a: CandidateListing, b: CandidateListing): boolean {
  return a.comparison_group === b.comparison_group && a.year === b.year;
}

export function distance(a: CandidateListing, b: CandidateListing): number | null {
  if (!sameCell(a, b)) return null;
  const ap = scoredValue(invoiceRow(a.breakdown, "price", a.listing_id));
  const ak = scoredValue(invoiceRow(a.breakdown, "km", a.listing_id));
  const bp = scoredValue(invoiceRow(b.breakdown, "price", b.listing_id));
  const bk = scoredValue(invoiceRow(b.breakdown, "km", b.listing_id));
  if (ap === null || ak === null || bp === null || bk === null) return null;
  const dp = ap - bp;
  const dk = ak - bk;
  return round(Math.sqrt(dp * dp + dk * dk), DISTANCE_ROUND_DECIMALS);
}
