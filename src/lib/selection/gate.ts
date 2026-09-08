// The gate (BRIEF §4.1) and eligibility (§2; part 3 §2a and §2c; part 4 §1), read straight from the invoice. Nothing is recomputed.

import { CHEAPEST_CONDITION_FLOOR, PEACE_OF_MIND_DEAL_FLOOR } from "./constants";
import type { Work } from "./rules";
import type { CandidateListing, Eligibility, PeaceOfMindFloorEffect } from "./types";
import { RULE_TYPE } from "./types";
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

export function eligibility(l: CandidateListing, floorEffect: PeaceOfMindFloorEffect): Eligibility {
  if (isThinCell(l)) return { best_value: false, peace_of_mind: false, cheapest: false, reasons: ["thin_cell"] };
  const b = l.breakdown;
  const best_value = b.deal_score !== null;
  // part 4 §1: peace_of_mind is condition alone — condition_by_reality !== null. The deal floor (part 3 §2c) is recorded by
  // overpriced() below and does not bar. Under floor effect 'excluded' the part-3 behaviour is restored: deal_score below
  // PEACE_OF_MIND_DEAL_FLOOR → reason overpriced; deal_score null → reason no_deal_score (the same string best_value pushes;
  // it is pushed once).
  const peace_of_mind =
    b.condition_by_reality !== null && (floorEffect === "none" || (b.deal_score !== null && b.deal_score >= PEACE_OF_MIND_DEAL_FLOOR));
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

// part 4 §1 — the peace_of_mind deal floor as a measurement: on every listing eligible for peace_of_mind, record
// value = deal_score, threshold = PEACE_OF_MIND_DEAL_FLOOR, triggered = deal_score !== null && deal_score < threshold,
// effect = what happened to this listing (part 5 §8.3, one convention for every rule): 'excluded' only when triggered and the
// effect in force is 'excluded', otherwise 'none'. A null deal_score is recorded as not evaluated. Never acts here — under
// 'excluded' the barred listings are already out through eligibility(), so every entry written under 'excluded' is untriggered
// and carries 'none'.
export function overpriced(w: Work, floorEffect: PeaceOfMindFloorEffect): void {
  if (!w.result.eligibility.peace_of_mind) return;
  const deal = w.input.breakdown.deal_score;
  const triggered = deal !== null && deal < PEACE_OF_MIND_DEAL_FLOOR;
  w.result.trace.push({
    rule: "overpriced",
    type: RULE_TYPE.overpriced,
    value: deal,
    threshold: PEACE_OF_MIND_DEAL_FLOOR,
    triggered,
    effect: triggered && floorEffect === "excluded" ? "excluded" : "none",
    context: { evaluated: deal !== null },
  });
}
