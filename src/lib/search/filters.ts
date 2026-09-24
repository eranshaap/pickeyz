// The search's filters (BRIEF Days 15–16, §3.2). Pure: one type and one predicate, no database, no clock.
//
// The filters CUT THE POOL BEFORE selectThree(). They define the question; they never touch a score and they
// are not an input to any rule. A category that empties because of a cut is empty-with-a-reason, which is a
// correct outcome, not an error.
//
// Both callers share this predicate on purpose: src/lib/search/run.ts cuts the pool with it, and
// src/lib/search/counts.ts counts with it. A counter that counted by its own rule would promise a pool size
// the search would not deliver.
//
// TWO DECISIONS TAKEN HERE, FLAGGED FOR REVIEW IN REPORT.md (§3.2):
//   km_declared = null does NOT pass an active km ceiling. The user asked for a constraint; an unknown value
//   does not satisfy it. The alternative — letting unknowns through — would put a car whose km nobody knows
//   inside an answer to "up to 90,000 km".
//   region = null does NOT pass an active region filter, for the same reason.
// Both are only reachable while a filter is ACTIVE: with no km ceiling and no region chosen, a null passes,
// because nothing was asked.

export type SearchFilters = {
  priceMin?: number;
  priceMax?: number;
  years?: number[];
  kmMax?: number;
  regions?: string[];
};

// The per-listing fields a filter reads. Both the assembled pool item and the counters' lighter row satisfy it.
export type Filterable = {
  price: number;
  year: number;
  km_declared: number | null;
  region: string | null;
};

// An empty list is not a filter: "no year chosen" and "every year chosen" are the same question.
export const yearsActive = (f: SearchFilters): boolean => f.years !== undefined && f.years.length > 0;
export const regionsActive = (f: SearchFilters): boolean => f.regions !== undefined && f.regions.length > 0;
export const kmActive = (f: SearchFilters): boolean => f.kmMax !== undefined;
export const priceActive = (f: SearchFilters): boolean => f.priceMin !== undefined || f.priceMax !== undefined;

export function passes(item: Filterable, f: SearchFilters): boolean {
  if (f.priceMin !== undefined && item.price < f.priceMin) return false;
  if (f.priceMax !== undefined && item.price > f.priceMax) return false;
  if (yearsActive(f) && !(f.years as number[]).includes(item.year)) return false;
  if (kmActive(f)) {
    if (item.km_declared === null) return false; // the decision above
    if (item.km_declared > (f.kmMax as number)) return false;
  }
  if (regionsActive(f)) {
    if (item.region === null) return false; // the decision above
    if (!(f.regions as string[]).includes(item.region)) return false;
  }
  return true;
}

export function countPassing(items: Filterable[], f: SearchFilters): number {
  let n = 0;
  for (const item of items) if (passes(item, f)) n++;
  return n;
}

// Which filters the question actually carries — the question row shows a chip per ACTIVE filter and nothing
// for the rest (the plan's "לא-פעיל = אין רובריקה").
export function activeFilterNames(f: SearchFilters): string[] {
  const names: string[] = [];
  if (priceActive(f)) names.push("price");
  if (yearsActive(f)) names.push("years");
  if (kmActive(f)) names.push("kmMax");
  if (regionsActive(f)) names.push("regions");
  return names;
}

// ---------------------------------------------------------------------------
// Run 8 §1.3 — THE CANONICAL SHAPE, and the one deep-equal built on it
// ---------------------------------------------------------------------------
//
// It lived in FilterPanel.tsx (`normalize`) and was compared by JSON.stringify in two client files. It is a
// rule about what a filters object MEANS — "no year chosen" and "every year chosen" are the same question,
// and the order chips were tapped in is not part of it — so it belongs beside the predicate that reads the
// same fields. isUnchanged() (chip-state.ts), the screen's dim test and Run 7 §1.3's "apply with no change
// = cancel" now all compare through this ONE function, which is what §2.3's belt and braces means.

/** Arrays sorted, empty groups dropped, keys in a fixed order — two equal questions normalise identically. */
export function normalizeFilters(f: SearchFilters): SearchFilters {
  const out: SearchFilters = {};
  if (f.priceMin !== undefined) out.priceMin = f.priceMin;
  if (f.priceMax !== undefined) out.priceMax = f.priceMax;
  if (yearsActive(f)) out.years = [...(f.years as number[])].sort((a, b) => a - b);
  if (f.kmMax !== undefined) out.kmMax = f.kmMax;
  if (regionsActive(f)) out.regions = [...(f.regions as string[])].sort((a, b) => a.localeCompare(b));
  return out;
}

/** The deep-equal of two questions. JSON.stringify is exact here because normalizeFilters fixes key order. */
export function sameFilters(a: SearchFilters, b: SearchFilters): boolean {
  return JSON.stringify(normalizeFilters(a)) === JSON.stringify(normalizeFilters(b));
}

/** No filter at all — what the actions turn into `undefined` so `searches.filters` is null, not `{}`. */
export function noFilters(f: SearchFilters): boolean {
  return Object.keys(normalizeFilters(f)).length === 0;
}
