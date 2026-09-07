// The gate (BRIEF §4.1) and eligibility (§2), read straight from the invoice. Nothing is recomputed.

import type { CandidateListing, Eligibility } from "./types";
import { invoiceRow } from "./util";

export function isSoldStrong(l: CandidateListing): boolean {
  return l.breakdown.sold_signal.strength === "strong";
}

export function isSoldMedium(l: CandidateListing): boolean {
  return l.breakdown.sold_signal.strength === "medium";
}

// A thin cell: the price row is unavailable with reason thin_cell. Eligible for no category.
export function isThinCell(l: CandidateListing): boolean {
  const price = invoiceRow(l.breakdown, "price", l.listing_id);
  return price.status === "unavailable" && price.reason === "thin_cell";
}

export function eligibility(l: CandidateListing): Eligibility {
  if (isThinCell(l)) return { best_value: false, peace_of_mind: false, cheapest: false, reasons: ["thin_cell"] };
  const b = l.breakdown;
  const best_value = b.deal_score !== null;
  const peace_of_mind = b.condition_by_reality !== null;
  // §11.3: the `>= 0` of the cheapest definition lives in eligibility — a car below its cell's typical condition is not
  // eligible for cheapest (reason below_typical). `0` here is the definition, not a threshold (§11.6).
  const cheapest = b.condition_vs_typical !== null && b.condition_vs_typical >= 0;
  const reasons: string[] = [];
  if (!best_value) reasons.push("no_deal_score");
  if (!peace_of_mind) reasons.push("no_condition_by_reality");
  if (b.condition_vs_typical === null) reasons.push("no_condition_vs_typical");
  else if (!cheapest) reasons.push("below_typical");
  return { best_value, peace_of_mind, cheapest, reasons };
}
