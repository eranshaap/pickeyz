// The gate (BRIEF §4.1) and eligibility (§2; part 3 §2a and §2c; part 4 §1), read straight from the invoice. Nothing is recomputed.

import { isCancelled as isCancelledInvoice } from "../scoring/types";
import { CANCELLED_EFFECT, CHEAPEST_CONDITION_FLOOR, PEACE_OF_MIND_DEAL_FLOOR, UNVERIFIED_HISTORY_EFFECT } from "./constants";
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
    return { ...none, reasons: ["cancelled"], without_unverified_history: { ...none } };
  }
  // The gate (§4.1; Day 14 rules v5 §0.4): a thin cell is eligible for no category — before this rule and after it.
  if (isThinCell(l)) {
    const none: Record<Category, boolean> = { best_value: false, peace_of_mind: false, cheapest: false };
    return { ...none, reasons: ["thin_cell"], without_unverified_history: { ...none } };
  }
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
  // Day 14 rules v5 (§0.1): the rule bars all three categories — and, through them, the runner-up (§5.5). The
  // pre-rule answer is kept beside it: §0.2's blocked_first is the only thing that reads it.
  const verified = hasVerifiedHistory(l);
  if (!verified) reasons.push("unverified_history");
  return {
    best_value: best_value && verified,
    peace_of_mind: peace_of_mind && verified,
    cheapest: cheapest && verified,
    reasons,
    without_unverified_history: { best_value, peace_of_mind, cheapest },
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
