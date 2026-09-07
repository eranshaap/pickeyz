// The history row (BRIEF §4.2): what the ownership record costs, as % of value, by Levi Yitzhak's rules.
//
// Rows of the record: ownership_history, oldest first. 'dealer' rows are never owners — they are
// counted as dealer_transfers and otherwise skipped.
//
// Detectors, in this order:
//   1. Zero-km deal — the first non-dealer row is a qualifying type (leasing) and the first private
//      row after it (skipping dealer rows, but not any other type) is within ZERO_KM_WINDOW_MONTHS.
//      Effect: users -= 1; that leasing row's deduction is ZERO_KM_LEASING_DEDUCTION.
//   2. Private pair — a private owner followed by another private owner within PRIVATE_PAIR_MAX_MONTHS
//      did not use the car (§18.6). Every such row reduces users by one — chained: three private rows
//      in one month -> users -= 2.
//
// Counts: paper_hand = car.hand as stored; users = non-dealer rows - (1 if zero-km) - (pairs).
//
// Combination (LY): sort deductions by magnitude, largest first; the first in full, every other one
// at half; sum; floor at HISTORY_DEDUCTION_CAP; then add the bonus if any. The owner-count entry is a
// deduction when negative, a bonus when positive, and nothing when 0 (first hand, §18.13).

import {
  HISTORY_DEDUCTION_CAP,
  OWNER_COUNT_ADJUSTMENT,
  OWNER_TYPE_DEDUCTION,
  PRIVATE_PAIR_MAX_MONTHS,
  ZERO_KM_LEASING_DEDUCTION,
  ZERO_KM_QUALIFYING_TYPES,
  ZERO_KM_WINDOW_MONTHS,
} from "./constants";
import type { Deduction, OwnershipRow, Row, ScoringInput } from "./types";
import { round, ymIndex } from "./util";

export type HistoryAnalysis = {
  rows: OwnershipRow[];
  non_dealer: OwnershipRow[];
  dealer_transfers: number;
  zero_km_deal: boolean;
  zero_km_row: OwnershipRow | null; // the qualifying leasing row, when zero_km_deal
  months_to_first_private: number | null; // leasing-first records: months from the leasing row to the first private after it
  private_pair: boolean;
  private_pairs: number; // chained: each private row that follows a private row within the window
  has_fleet_row: boolean; // any leasing / rental / company row
  users: number;
};

const FLEET_TYPES: readonly string[] = ["leasing", "rental", "company"];

// Structural facts about a record — the detectors and the counts. Shared with the hand check (§7).
export function analyzeHistory(rows: OwnershipRow[]): HistoryAnalysis {
  // Oldest first is a precondition of every rule below; a record that is not is a data error.
  for (let i = 1; i < rows.length; i++) {
    if (ymIndex(rows[i].ym) < ymIndex(rows[i - 1].ym)) {
      throw new Error(`ownership_history is not oldest-first: ${rows[i - 1].ym} is followed by ${rows[i].ym}`);
    }
  }
  const non_dealer = rows.filter((r) => r.type !== "dealer");
  const dealer_transfers = rows.length - non_dealer.length;

  // 1. zero-km deal
  let zero_km_deal = false;
  let zero_km_row: OwnershipRow | null = null;
  let months_to_first_private: number | null = null;
  const firstIdx = rows.findIndex((r) => r.type !== "dealer");
  if (firstIdx >= 0 && (ZERO_KM_QUALIFYING_TYPES as readonly string[]).includes(rows[firstIdx].type)) {
    const nextIdx = rows.findIndex((r, i) => i > firstIdx && r.type !== "dealer");
    if (nextIdx >= 0 && rows[nextIdx].type === "private") {
      months_to_first_private = ymIndex(rows[nextIdx].ym) - ymIndex(rows[firstIdx].ym);
      if (months_to_first_private <= ZERO_KM_WINDOW_MONTHS) {
        zero_km_deal = true;
        zero_km_row = rows[firstIdx];
      }
    }
  }

  // 2. private pairs — chained (§18.6)
  let private_pairs = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (a.type === "private" && b.type === "private" && ymIndex(b.ym) - ymIndex(a.ym) <= PRIVATE_PAIR_MAX_MONTHS) private_pairs++;
  }

  return {
    rows,
    non_dealer,
    dealer_transfers,
    zero_km_deal,
    zero_km_row,
    months_to_first_private,
    private_pair: private_pairs > 0,
    private_pairs,
    has_fleet_row: rows.some((r) => FLEET_TYPES.includes(r.type)),
    users: non_dealer.length - (zero_km_deal ? 1 : 0) - private_pairs,
  };
}

function ownerTypeDeduction(type: string): number {
  if (!Object.hasOwn(OWNER_TYPE_DEDUCTION, type)) {
    throw new Error(`history row: ownership type ${JSON.stringify(type)} has no row in OWNER_TYPE_DEDUCTION`);
  }
  return OWNER_TYPE_DEDUCTION[type];
}

function ownerCountAdjustment(users: number): number {
  if (!Number.isInteger(users) || users < 1) {
    throw new Error(`history row: users = ${users}; OWNER_COUNT_ADJUSTMENT has no row below 1`);
  }
  const key = Math.min(users, 4); // 5+ uses the 4 row
  return OWNER_COUNT_ADJUSTMENT[key];
}

// LY's combination rule over a list of { for, pct } entries plus an optional bonus. Returns the
// combined value and the deductions as recorded.
export function combineDeductions(entries: { for: string; pct: number }[], bonus: { for: string; pct: number } | null): { value: number; deductions: Deduction[]; sum_before_cap: number } {
  const sorted = [...entries].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)); // stable: ties keep record order
  const deductions: Deduction[] = sorted.map((e, i) =>
    i === 0 ? { for: e.for, pct: e.pct, applied: e.pct, rule: "largest_in_full" } : { for: e.for, pct: e.pct, applied: e.pct / 2, rule: "halved" },
  );
  const sum_before_cap = deductions.reduce((s, d) => s + d.applied, 0);
  let value = Math.max(sum_before_cap, HISTORY_DEDUCTION_CAP);
  if (bonus) {
    deductions.push({ for: bonus.for, pct: bonus.pct, applied: bonus.pct, rule: "bonus" });
    value += bonus.pct;
  }
  return { value, deductions, sum_before_cap };
}

// The owner-count entry joins the deductions when negative, is the bonus when positive, and is
// omitted when 0 (§18.13: first hand = 0 — no entry to record).
function combineWithCount(entries: { for: string; pct: number }[], users: number) {
  const adj = ownerCountAdjustment(users);
  const entry = { for: `owners:${users}`, pct: adj };
  if (adj < 0) return combineDeductions([...entries, entry], null);
  if (adj > 0) return combineDeductions(entries, entry);
  return combineDeductions(entries, null);
}

export function historyRow(input: ScoringInput): Row {
  const { listing, car } = input;
  const history = car.ownership_history;

  if (history === null) {
    if (listing.hand_declared === null) {
      return { row: "history", status: "unavailable", reason: "no_history", raw: { owners: null, paper_hand: car.hand } };
    }
    // hand_declared <= 0 is an invalid declaration (§18.7): unavailable, never a throw.
    if (listing.hand_declared <= 0) {
      return { row: "history", status: "unavailable", reason: "invalid_declaration", raw: { owners: null, paper_hand: car.hand, hand_declared: listing.hand_declared } };
    }
    // Source 'ad': the count from the ad, owner types unknown — no type deductions, no detectors.
    const users = listing.hand_declared;
    const { value, deductions, sum_before_cap } = combineWithCount([], users);
    return {
      row: "history",
      status: "scored",
      source: "ad",
      value: round(value),
      partial: ["owner_types"],
      raw: {
        owners: null,
        users,
        paper_hand: car.hand,
        zero_km_deal: false,
        months_to_first_private: null,
        private_pair: false,
        dealer_transfers: null,
        deductions,
        sum_before_cap,
      },
    };
  }
  if (history.length === 0) throw new Error("history row: ownership_history is [] — an empty record is stored as null, never []");

  const a = analyzeHistory(history);

  const entries: { for: string; pct: number }[] = [];
  for (const r of a.non_dealer) {
    if (r.type === "private") continue;
    if (r === a.zero_km_row) entries.push({ for: "zero_km_leasing", pct: ZERO_KM_LEASING_DEDUCTION });
    else entries.push({ for: r.type, pct: ownerTypeDeduction(r.type) });
  }
  const { value, deductions, sum_before_cap } = combineWithCount(entries, a.users);

  return {
    row: "history",
    status: "scored",
    source: "mot",
    value: round(value),
    raw: {
      owners: history,
      users: a.users,
      paper_hand: car.hand,
      zero_km_deal: a.zero_km_deal,
      months_to_first_private: a.months_to_first_private,
      private_pair: a.private_pair,
      dealer_transfers: a.dealer_transfers,
      deductions,
      sum_before_cap,
    },
  };
}
