// Small pure helpers shared by the engine's modules.

import { ROUND_DECIMALS } from "./constants";

// 'YYYY-MM' -> months since year 0. Throws on any other shape: a bad ym is a data error, not a zero.
export function ymIndex(ym: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) throw new Error(`ym: expected 'YYYY-MM', got ${JSON.stringify(ym)}`);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`ym: month out of range in ${JSON.stringify(ym)}`);
  return Number(m[1]) * 12 + month;
}

// A Date -> its calendar month as 'YYYY-MM' (UTC).
export function dateToYm(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Whole calendar months from `from` to `to` (to - from), by year and month only, UTC.
export function monthsBetween(from: Date, to: Date): number {
  return ymIndex(dateToYm(to)) - ymIndex(dateToYm(from));
}

// A Date -> 'YYYY-MM-DD' (UTC).
export function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function round(x: number, decimals: number = ROUND_DECIMALS): number {
  const f = 10 ** decimals;
  const r = Math.round(x * f) / f;
  return r === 0 ? 0 : r; // never -0
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
