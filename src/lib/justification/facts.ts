// The justification generator — reading ONE car's invoice (BRIEF Days 22–23, Run 2, §4).
//
// Nothing here is computed: every field is a value the engine wrote, or a subtraction of two such values. The
// three components of the deal score (§4.3) are the engine's own decomposition —
//
//   deal_score = price_advantage + (history.value - typical_history) + km.value      (scoring/index.ts:120-123)
//
// — so `price_advantage`, `ownership_effect` and `km_effect` are the three numbers that made the score, each in
// points (percent of the car's value), positive = in the buyer's favour.
//
// A broken invoice is a BUG, said as such: every raw field the engine always writes is read through a narrowing
// that throws with the listing id when it is missing or of the wrong type. Never a silent empty sentence.
//
// No Hebrew in this file — the language lives in wordings.ts (§3).

import { ROUND_DECIMALS } from "@/lib/scoring/constants";
import { isCancelled } from "@/lib/scoring/types";
import type { Deduction, OwnershipRow, Row } from "@/lib/scoring/types";
import type { OwnershipCode } from "@/lib/mot/translator";
import { hasVerifiedHistory, isThinCell } from "@/lib/selection";
import { invoiceRow } from "@/lib/selection/util";
import type { JustificationCar } from "./types";

/** The types the ledger deducts for and the generator has a word for (wordings.ts OWNER_WORD). */
export const DEDUCTED_OWNER_TYPES: readonly OwnershipCode[] = ["rental", "leasing", "company"];

export type CarFacts = {
  cancelled: boolean;
  cancelled_at: string | null; // the invoice's reason and date
  thin_cell: boolean; // isThinCell
  verified: boolean; // hasVerifiedHistory — the history row is a scored registry reading
  deal_score: number | null;
  price_advantage: number | null; // ScoreResult.deal_score / .price_advantage
  ownership_effect: number | null; // history.value − typical_history (paper); null when either is missing
  ownership_effect_reality: number | null; // history.value_by_reality − typical_history; null likewise
  km_effect: number | null; // the km row's value (already a deviation, capped); null when the row is unavailable
  km_gap: number | null; // raw.km_declared − raw.median_km, in km; null when the km row is unavailable
  hand: number | null; // raw.paper_hand — the registry's hand (cars.hand); null without a registry reading
  all_private: boolean | null; // every non-dealer owner is 'private' (at least one); null without a registry reading
  was_types: OwnershipCode[]; // the non-dealer owners of the deducted types, EXCLUDING the zero-km deal's row
  zero_km_deal: boolean;
  deductions: { for: string; applied: number }[]; // raw.deductions as applied
};

const round1 = (v: number): number => {
  const f = Math.pow(10, ROUND_DECIMALS);
  return Math.round(v * f) / f;
};

// --- the narrowings: a field the engine always writes, or a named bug --------------------------------------

function rawNumberOrNull(raw: Record<string, unknown>, key: string, listing_id: number): number | null {
  if (!Object.hasOwn(raw, key)) throw new Error(`justification: listing ${listing_id} — the history row's raw has no '${key}'`);
  const v = raw[key];
  if (v === null || typeof v === "number") return v;
  throw new Error(`justification: listing ${listing_id} — the history row's raw.${key} is ${JSON.stringify(v)}, not a number`);
}

function rawKmNumber(raw: Record<string, unknown>, key: string, listing_id: number): number {
  if (!Object.hasOwn(raw, key)) throw new Error(`justification: listing ${listing_id} — the km row's raw has no '${key}'`);
  const v = raw[key];
  if (typeof v !== "number") throw new Error(`justification: listing ${listing_id} — the km row's raw.${key} is ${JSON.stringify(v)}, not a number`);
  return v;
}

function rawOwners(raw: Record<string, unknown>, listing_id: number): OwnershipRow[] {
  if (!Object.hasOwn(raw, "owners")) throw new Error(`justification: listing ${listing_id} — the history row's raw has no 'owners'`);
  const v = raw.owners;
  if (!Array.isArray(v)) throw new Error(`justification: listing ${listing_id} — the history row's raw.owners is not an array`);
  for (const o of v) {
    if (typeof o !== "object" || o === null || typeof (o as OwnershipRow).ym !== "string" || typeof (o as OwnershipRow).type !== "string") {
      throw new Error(`justification: listing ${listing_id} — the history row's raw.owners has a row that is not { ym, type }`);
    }
  }
  return v as OwnershipRow[];
}

function rawDeductions(raw: Record<string, unknown>, listing_id: number): Deduction[] {
  if (!Object.hasOwn(raw, "deductions")) throw new Error(`justification: listing ${listing_id} — the history row's raw has no 'deductions'`);
  const v = raw.deductions;
  if (!Array.isArray(v)) throw new Error(`justification: listing ${listing_id} — the history row's raw.deductions is not an array`);
  for (const d of v) {
    if (typeof d !== "object" || d === null || typeof (d as Deduction).for !== "string" || typeof (d as Deduction).applied !== "number") {
      throw new Error(`justification: listing ${listing_id} — the history row's raw.deductions has an entry that is not { for, applied }`);
    }
  }
  return v as Deduction[];
}

function rawBoolean(raw: Record<string, unknown>, key: string, listing_id: number): boolean {
  if (!Object.hasOwn(raw, key)) throw new Error(`justification: listing ${listing_id} — the history row's raw has no '${key}'`);
  const v = raw[key];
  if (typeof v !== "boolean") throw new Error(`justification: listing ${listing_id} — the history row's raw.${key} is ${JSON.stringify(v)}, not a boolean`);
  return v;
}

const scoredValue = (row: Row): number | null => (row.status === "scored" && typeof row.value === "number" ? row.value : null);

/**
 * §4.2 — one car's invoice, read. A cancelled invoice yields the cancellation and NOTHING else: it carries no
 * rows at all (invoiceRow() throws on it), so no row is read.
 */
export function carFacts(car: JustificationCar): CarFacts {
  const invoice = car.invoice;
  const empty: CarFacts = {
    cancelled: false,
    cancelled_at: null,
    thin_cell: false,
    verified: false,
    deal_score: null,
    price_advantage: null,
    ownership_effect: null,
    ownership_effect_reality: null,
    km_effect: null,
    km_gap: null,
    hand: null,
    all_private: null,
    was_types: [],
    zero_km_deal: false,
    deductions: [],
  };
  if (isCancelled(invoice)) return { ...empty, cancelled: true, cancelled_at: invoice.cancelled_at };

  const ref = { breakdown: invoice, listing_id: car.listing_id };
  const history = invoiceRow(invoice, "history", car.listing_id);
  const km = invoiceRow(invoice, "km", car.listing_id);

  const typical = invoice.typical_history;
  const historyValue = scoredValue(history);
  const historyReality = history.status === "scored" && typeof history.value_by_reality === "number" ? history.value_by_reality : null;
  const km_effect = scoredValue(km);

  const verified = hasVerifiedHistory(ref);
  // A 'typical'-source history row is the cell's median standing in for a record we do not have: its value IS
  // typical_history (effect 0 by construction) and its raw carries no owners and no hand. Nothing below is read
  // off such a row — an unknown hand is null, not 1, and an unknown record is no record.
  let hand: number | null = null;
  let all_private: boolean | null = null;
  let was_types: OwnershipCode[] = [];
  let zero_km_deal = false;
  let deductions: { for: string; applied: number }[] = [];
  if (verified) {
    const raw = history.raw;
    hand = rawNumberOrNull(raw, "paper_hand", car.listing_id);
    zero_km_deal = rawBoolean(raw, "zero_km_deal", car.listing_id);
    deductions = rawDeductions(raw, car.listing_id).map((d) => ({ for: d.for, applied: d.applied }));
    const owners = rawOwners(raw, car.listing_id);
    const nonDealer = owners.filter((o) => o.type !== "dealer");
    all_private = nonDealer.length > 0 && nonDealer.every((o) => o.type === "private");
    // A zero-km deal is never a tag against a car: the qualifying leasing row is the first non-dealer row
    // (scoring/history.ts:72-82 — zero_km_row = rows[firstIdx]), and it was a holder, not a user.
    const skip = zero_km_deal ? nonDealer[0] : undefined;
    was_types = nonDealer
      .filter((o) => o !== skip && (DEDUCTED_OWNER_TYPES as readonly string[]).includes(o.type))
      .map((o) => o.type as OwnershipCode);
  }

  return {
    cancelled: false,
    cancelled_at: null,
    thin_cell: isThinCell(ref),
    verified,
    deal_score: invoice.deal_score,
    price_advantage: invoice.price_advantage,
    ownership_effect: historyValue !== null && typical !== null ? round1(historyValue - typical) : null,
    ownership_effect_reality: historyReality !== null && typical !== null ? round1(historyReality - typical) : null,
    km_effect,
    km_gap: km.status === "scored" ? rawKmNumber(km.raw, "km_declared", car.listing_id) - rawKmNumber(km.raw, "median_km", car.listing_id) : null,
    hand,
    all_private,
    was_types,
    zero_km_deal,
    deductions,
  };
}

/** §4.3 — the three components, in the tie order price → ownership → km. */
export type ComponentName = "price" | "ownership" | "km";
export const COMPONENT_ORDER: readonly ComponentName[] = ["price", "ownership", "km"];

/**
 * §4.3 — what decided the score the most: the largest ABSOLUTE value among the three, ties broken by
 * COMPONENT_ORDER. A component the invoice does not carry is not a candidate; null when none is available.
 */
export function largestComponent(values: Readonly<Record<ComponentName, number | null>>): { name: ComponentName; value: number } | null {
  let best: { name: ComponentName; value: number } | null = null;
  for (const name of COMPONENT_ORDER) {
    const v = values[name];
    if (v === null) continue;
    if (best === null || Math.abs(v) > Math.abs(best.value)) best = { name, value: v };
  }
  return best;
}
