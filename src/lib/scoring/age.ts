// Day 19 (§2) — one age, one place.
//
// Every age in the engine is the span between two moments the caller names: the car's first registration
// (or 1 January of its year, where the anchor falls back) and the day the number being scored was
// OBSERVED. No function here reads a clock — the run's `now` is not an age, and a site that wants one
// must say which observation it means.
//
// This replaces the three local YEAR_MS declarations (price.ts, km.ts, compute-market-stats.ts) and is
// the only age arithmetic in the engine, in the norms script and in measure-constants.ts.
//
// The span is signed as measured: `at` before `from` gives a negative number. Flooring is a scoring
// decision and belongs to the row that makes it (km.ts's AGE_FLOOR_YEARS), never to this helper.

export const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Years with decimals from `from` to `at`. Negative when `at` is the earlier of the two. */
export function ageYears(from: Date, at: Date): number {
  return (at.getTime() - from.getTime()) / YEAR_MS;
}
