// Small helpers shared by the selection modules. No numbers here (§5).

import { isCancelled, type Invoice, type Row, type RowName } from "../scoring/types";

export function round(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

// The invoice always carries all three rows (engine contract); a missing row is a broken invoice — fail loudly.
// Day 18 rules v6: a cancelled invoice has no rows by definition, and every caller asks isCancelled() first — reaching
// here with one is a bug in the library, said as such.
export function invoiceRow(breakdown: Invoice, name: RowName, listingId: number): Row {
  if (isCancelled(breakdown)) throw new Error(`selection: listing ${listingId} — a cancelled invoice has no '${name}' row; the cancelled check must come first`);
  const row = breakdown.rows.find((r) => r.row === name);
  if (!row) throw new Error(`selection: listing ${listingId} — invoice has no '${name}' row`);
  return row;
}

// The scored value of a row, or null when the row is unavailable.
export function scoredValue(row: Row): number | null {
  return row.status === "scored" && typeof row.value === "number" ? row.value : null;
}

export function parseIso(iso: string, listingId: number): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`selection: listing ${listingId} — first_seen_at '${iso}' is not a valid ISO date`);
  return t;
}

// Compare two nullable numbers; null sorts last in both directions.
export function cmpNullsLast(a: number | null, b: number | null, direction: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
}
