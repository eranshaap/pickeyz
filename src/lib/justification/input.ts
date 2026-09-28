// The justification generator — the input, built from a fresh selection (BRIEF Days 22–23, Run 3, §2).
//
// The search transaction of Run 5 and scripts/measure-justifications.ts build the generator's input from the same
// thing — a fresh selectThree() result over the pool items the search cut — so the mapping lives HERE, once,
// tested, and not in each caller (work.md: one repeated structure = one place in the code). The car page's
// builder from STORED rows is Run 5's, when it is first used.
//
// No Hebrew in this file either — the language of this library lives in wordings.ts (Run 2 §3).
//
// Pure: no database, no clock, no filesystem. The type imports are the selection's contract and this library's.

import type { CandidateListing, SelectionResult } from "@/lib/selection";
import type { JustificationCar } from "./types";

/** What the builder needs of one pool item — `PoolItem` (src/lib/search/assemble.ts:60-90) satisfies it as it is. */
type Item = { listing_id: number; price: number; km_declared: number | null; candidate: CandidateListing };

/**
 * §2.1 — one JustificationCar per entry of `res.results`, in `res.results` order. A hidden row (merged or
 * excluded) travels with its `rank: null` and the library ignores it (types.ts:18) — it is not dropped here, so
 * that the caller hands the generator the selection's own list and nothing decides twice what is shown.
 *
 * A result whose listing_id has no item is a BUG, said as such: the same pool must have produced both.
 */
export function carsFromSelection(items: readonly Item[], res: SelectionResult): JustificationCar[] {
  const byId = new Map<number, Item>();
  for (const item of items) byId.set(item.listing_id, item);
  return res.results.map((r) => {
    const item = byId.get(r.listing_id);
    if (item === undefined) {
      throw new Error(`justification: listing ${r.listing_id} is in the selection's results but not in the items it was built from`);
    }
    return {
      listing_id: r.listing_id,
      rank: r.rank,
      categories: r.categories,
      price: item.price,
      km: item.km_declared,
      invoice: item.candidate.breakdown,
      trace: r.trace,
      median_price: item.candidate.median_price,
    };
  });
}

/**
 * §2.2 — the selection's crowning verdict: `Crowning.crowned` (src/lib/selection/types.ts:61), the field
 * crowningLine() at src/lib/selection/crowning.ts:103-105 prints as crowned / uncrowned.
 */
export function crownedOf(res: SelectionResult): boolean {
  return res.crowning.crowned;
}
