// The gate (BRIEF §4.1) and eligibility (§2; part 3 §2a and §2c), read straight from the invoice. Nothing is recomputed.

import { CHEAPEST_CONDITION_FLOOR, PEACE_OF_MIND_DEAL_FLOOR } from "./constants";
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
  // part 3 §2c: peace_of_mind is blind to price, so a car that is a bad deal even after crediting its condition is out —
  // deal_score below PEACE_OF_MIND_DEAL_FLOOR → reason overpriced; deal_score null → reason no_deal_score (the same string
  // best_value pushes; it is pushed once).
  const peace_of_mind = b.condition_by_reality !== null && b.deal_score !== null && b.deal_score >= PEACE_OF_MIND_DEAL_FLOOR;
  // part 3 §2a: a car more than CHEAPEST_CONDITION_FLOOR below its cell's typical condition is not eligible for cheapest
  // (reason below_floor).
  const cheapest = b.condition_vs_typical !== null && b.condition_vs_typical >= CHEAPEST_CONDITION_FLOOR;
  const reasons: string[] = [];
  if (!best_value) reasons.push("no_deal_score");
  if (b.condition_by_reality === null) reasons.push("no_condition_by_reality");
  else if (!peace_of_mind && b.deal_score !== null) reasons.push("overpriced");
  if (b.condition_vs_typical === null) reasons.push("no_condition_vs_typical");
  else if (!cheapest) reasons.push("below_floor");
  return { best_value, peace_of_mind, cheapest, reasons };
}
