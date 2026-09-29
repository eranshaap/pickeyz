// The justification generator — the input, built from a fresh selection (BRIEF Days 22–23, Run 3, §2).
//
// The search transaction of Run 5 and scripts/measure-justifications.ts build the generator's input from the same
// thing — a fresh selectThree() result over the pool items the search cut — so the mapping lives HERE, once,
// tested, and not in each caller (work.md: one repeated structure = one place in the code). The car page's
// builder from STORED rows is carsFromStoredRows() below (Run 5 §5): the same JustificationCar, read off the
// stored search_results row plus the invoice behind listing_scores_id and the norm behind market_stats_id.
//
// No Hebrew in this file either — the language of this library lives in wordings.ts (Run 2 §3).
//
// Pure: no database, no clock, no filesystem. The type imports are the selection's contract and this library's.

import { isCancelled } from "@/lib/scoring/types";
import type { Invoice } from "@/lib/scoring/types";
import type { CandidateListing, Category, RuleTrace, SelectionResult } from "@/lib/selection";
import { invoiceRow } from "@/lib/selection/util";
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

/** One stored search_results row, narrowed by the caller: the codes as Category[], the trace as RuleTrace[]. */
export type StoredRow = {
  listing_id: number;
  rank: number | null;
  categories: readonly Category[];
  price: number;            // price_snapshot
  km: number | null;        // km_snapshot
  listing_scores_id: number | null;
  market_stats_id: number | null;
  trace: readonly RuleTrace[];
};

/**
 * §5.1 — one JustificationCar per stored row, in input order. Hidden rows keep their `rank: null` and travel
 * with the rest, exactly as carsFromSelection() leaves them: the library ignores them itself (types.ts:18).
 *
 * The two maps are the run's own reads: `invoices` by listing_scores.id, `medians` by market_stats.id. A row
 * whose invoice is missing is a BUG of the run, said as such — the caller decides what a broken run does
 * (src/lib/search/why.ts logs it and draws no section).
 *
 * median_price follows the same gate as the fresh side (assemble.ts:247-261): the norm behind the row's
 * market_stats_id when the invoice's price row is `scored`, and null otherwise — a cancelled invoice has no
 * rows at all, so it is answered first.
 */
export function carsFromStoredRows(
  rows: readonly StoredRow[],
  invoices: ReadonlyMap<number, Invoice>,        // by listing_scores.id
  medians: ReadonlyMap<number, number | null>,   // by market_stats.id -> median_price
): JustificationCar[] {
  return rows.map((row) => {
    const invoice = row.listing_scores_id === null ? undefined : invoices.get(row.listing_scores_id);
    if (invoice === undefined) {
      throw new Error(`carsFromStoredRows: listing ${row.listing_id} — no invoice behind listing_scores_id ${row.listing_scores_id}`);
    }
    let median_price: number | null = null;
    if (!isCancelled(invoice) && invoiceRow(invoice, "price", row.listing_id).status === "scored") {
      const id = row.market_stats_id;
      if (id === null || !medians.has(id)) {
        throw new Error(`carsFromStoredRows: listing ${row.listing_id} — price row scored but no norm behind market_stats_id ${id}`);
      }
      median_price = medians.get(id) as number | null;
    }
    return {
      listing_id: row.listing_id,
      rank: row.rank,
      categories: row.categories,
      price: row.price,
      km: row.km,
      invoice,
      trace: row.trace,
      median_price,
    };
  });
}
