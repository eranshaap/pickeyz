// The gate (BRIEF §4.1) and eligibility (§2; part 3 §2a and §2c; part 4 §1), read straight from the invoice. Nothing is recomputed.

import { isCancelled as isCancelledInvoice } from "../scoring/types";
import { CANCELLED_EFFECT, CONDITION_FLOOR, CONDITION_FLOOR_EFFECT, PEACE_OF_MIND_DEAL_FLOOR, UNVERIFIED_HISTORY_EFFECT } from "./constants";
import type { Work } from "./rules";
import type { CandidateListing, Category, Eligibility, PeaceOfMindFloorEffect } from "./types";
import { RULE_TYPE } from "./types";
import { invoiceRow } from "./util";

// Day 18 rules v6 (§8): the engine's cancelled invoice. Every other reader of the invoice below asks this first —
// a cancelled invoice has no rows, no sold signal and no sums to read.
export function isCancelled(l: CandidateListing): boolean {
  return isCancelledInvoice(l.breakdown);
}

// A cancelled invoice carries no sold signal: it is neither strong nor medium.
export function isSoldStrong(l: CandidateListing): boolean {
  return !isCancelledInvoice(l.breakdown) && l.breakdown.sold_signal.strength === "strong";
}

export function isSoldMedium(l: CandidateListing): boolean {
  return !isCancelledInvoice(l.breakdown) && l.breakdown.sold_signal.strength === "medium";
}

// A thin cell: the price row is unavailable with reason thin_cell. Eligible for no category, and — since the
// three flags are what the runner-up filters on — not a runner-up either (Day 14 rules v5, §0.4).
export function isThinCell(l: CandidateListing): boolean {
  const price = invoiceRow(l.breakdown, "price", l.listing_id);
  return price.status === "unavailable" && price.reason === "thin_cell";
}

// Day 14 rules v5 (§0.1) — the history row's `source` exactly as the engine stored it, or null when the row is
// not a scored reading. 'mot' = the registry; 'typical' = the cell's median standing in (engine §0.4).
export function historySource(l: CandidateListing): string | null {
  const row = invoiceRow(l.breakdown, "history", l.listing_id);
  return row.source ?? null;
}

// Eligible for a pick <=> the history row exists as a scored reading AND its source is the registry.
export function hasVerifiedHistory(l: CandidateListing): boolean {
  const row = invoiceRow(l.breakdown, "history", l.listing_id);
  return row.status === "scored" && row.source === "mot";
}

export function eligibility(l: CandidateListing, floorEffect: PeaceOfMindFloorEffect): Eligibility {
  // Day 18 rules v6 (§8): a cancelled car is eligible for nothing — checked before the thin-cell gate, which reads a row.
  if (isCancelled(l)) {
    const none: Record<Category, boolean> = { best_value: false, peace_of_mind: false, cheapest: false };
    return { ...none, reasons: ["cancelled"], without_unverified_history: { ...none }, without_condition_floor: { ...none } };
  }
  // The gate (§4.1; Day 14 rules v5 §0.4): a thin cell is eligible for no category — before this rule and after it.
  if (isThinCell(l)) {
    const none: Record<Category, boolean> = { best_value: false, peace_of_mind: false, cheapest: false };
    return { ...none, reasons: ["thin_cell"], without_unverified_history: { ...none }, without_condition_floor: { ...none } };
  }
  const b = l.breakdown;
  // Days 22–23 rules v8 (§0a): the condition floor. STRICTLY below, so exactly CONDITION_FLOOR passes, as it always
  // has. A null condition_vs_typical is NOT below the floor — the rule is about a condition below it, not an unknown
  // one — so such a car keeps today's verdicts: not `cheapest` (reason no_condition_vs_typical), the other two as before.
  const belowFloor = b.condition_vs_typical !== null && b.condition_vs_typical < CONDITION_FLOOR;
  const best_value = b.deal_score !== null && !belowFloor;
  // part 4 §1: peace_of_mind is condition alone — condition_by_reality !== null. The deal floor (part 3 §2c) is recorded by
  // overpriced() below and does not bar. Under floor effect 'excluded' the part-3 behaviour is restored: deal_score below
  // PEACE_OF_MIND_DEAL_FLOOR → reason overpriced; deal_score null → reason no_deal_score (the same string best_value pushes;
  // it is pushed once).
  // The three verdicts as they stand BEFORE the floor — the values the reasons below are read off, so that a
  // below-floor car keeps exactly today's reasons instead of collecting a no_deal_score it does not deserve.
  const hasDeal = b.deal_score !== null;
  const peaceBase =
    b.condition_by_reality !== null && (floorEffect === "none" || (b.deal_score !== null && b.deal_score >= PEACE_OF_MIND_DEAL_FLOOR));
  // part 3 §2a, as rules v8 (§0a) generalises it: a car more than CONDITION_FLOOR below its cell's typical condition
  // is not eligible for ANY category (reason below_floor) — and, through the three flags, not a runner-up either.
  const cheapestBase = b.condition_vs_typical !== null;
  const peace_of_mind = peaceBase && !belowFloor;
  const cheapest = cheapestBase && !belowFloor; // identical to v7's `condition_vs_typical >= CONDITION_FLOOR`
  const reasons: string[] = [];
  if (!hasDeal) reasons.push("no_deal_score");
  if (b.condition_by_reality === null) reasons.push("no_condition_by_reality");
  else if (!peaceBase && b.deal_score !== null) reasons.push("overpriced");
  if (b.condition_vs_typical === null) reasons.push("no_condition_vs_typical");
  else if (belowFloor) reasons.push("below_floor");
  // Day 14 rules v5 (§0.1): the rule bars all three categories — and, through them, the runner-up (§5.5). The
  // pre-rule answer is kept beside it: §0.2's blocked_first is the only thing that reads it, and rules v8 keeps one
  // such counterfactual per barring rule.
  const verified = hasVerifiedHistory(l);
  if (!verified) reasons.push("unverified_history");
  return {
    best_value: best_value && verified,
    peace_of_mind: peace_of_mind && verified,
    cheapest: cheapest && verified,
    reasons,
    // the base verdicts, the floor included (as it always was for `cheapest`)
    without_unverified_history: { best_value, peace_of_mind, cheapest },
    // the verdicts with the FLOOR ignored and verification applied
    without_condition_floor: { best_value: hasDeal && verified, peace_of_mind: peaceBase && verified, cheapest: cheapestBase && verified },
  };
}

// Day 14 rules v5 (§0.1) — the rule's record, written on everyone that passed the gate (trace completeness, §3).
// value = the history row's source as stored in the invoice; effect = what happened to this listing (the same
// convention every rule here follows): UNVERIFIED_HISTORY_EFFECT when it triggered, 'none' otherwise.
// §0.2 writes blocked_first into this entry's context afterwards, on at most one listing per category.
export function unverifiedHistory(w: Work): void {
  // Day 18 rules v6: a cancelled invoice has no history row to read. The rule is recorded as not evaluated, so the
  // trace stays complete; the listing is already barred by cancelled.
  if (isCancelled(w.input)) {
    w.result.trace.push({
      rule: "unverified_history",
      type: RULE_TYPE.unverified_history,
      value: null,
      threshold: null,
      triggered: false,
      effect: "none",
      context: { evaluated: false, reason: "cancelled" },
    });
    return;
  }
  const row = invoiceRow(w.input.breakdown, "history", w.input.listing_id);
  const triggered = !hasVerifiedHistory(w.input);
  w.result.trace.push({
    rule: "unverified_history",
    type: RULE_TYPE.unverified_history,
    value: historySource(w.input),
    threshold: null,
    triggered,
    effect: triggered ? UNVERIFIED_HISTORY_EFFECT : "none",
    context: { evaluated: true, history_row_status: row.status, ...(row.status === "unavailable" ? { reason: row.reason ?? null } : {}) },
  });
}

// Days 22–23 rules v8 (§0a) — the condition floor's record, written on exactly the rows and at exactly the place the
// unverified_history record is written (index.ts runs both on everyone that passed the sold gate, for trace
// completeness §3). value = condition_vs_typical as the invoice carries it (null when unknown); threshold =
// CONDITION_FLOOR; effect = CONDITION_FLOOR_EFFECT when it triggered, 'none' otherwise. §0a's blocked_first is
// written into this entry's context afterwards, on at most one listing per category, exactly as for the other rule.
export function conditionFloor(w: Work): void {
  // A cancelled invoice and a thin cell have no condition_vs_typical to judge (the engine leaves it null in both
  // cases): the rule is recorded as not evaluated, so the trace stays complete, and the listing is already barred by
  // its own rule. The cancelled test comes first — isThinCell() reads a row, and a cancelled invoice has none.
  const cvt = isCancelled(w.input) || isThinCell(w.input) ? null : w.input.breakdown.condition_vs_typical;
  const triggered = cvt !== null && cvt < CONDITION_FLOOR;
  w.result.trace.push({
    rule: "condition_floor",
    type: RULE_TYPE.condition_floor,
    value: cvt,
    threshold: CONDITION_FLOOR,
    triggered,
    effect: triggered ? CONDITION_FLOOR_EFFECT : "none",
    context: { evaluated: cvt !== null },
  });
}

// Day 18 rules v6 (§8) — the cancelled rule's record, written on everyone that passed the gate, like unverified_history.
// value = the cancellation date the invoice carries (null when not cancelled); effect = CANCELLED_EFFECT when it triggered.
export function cancelled(w: Work): void {
  const b = w.input.breakdown;
  const triggered = isCancelledInvoice(b);
  w.result.trace.push({
    rule: "cancelled",
    type: RULE_TYPE.cancelled,
    value: triggered ? b.cancelled_at : null,
    threshold: null,
    triggered,
    effect: triggered ? CANCELLED_EFFECT : "none",
    context: { evaluated: true },
  });
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
