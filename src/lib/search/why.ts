// The car page's "why" lines, from the stored rows of the displayed run (BRIEF Days 22–23, Run 5, §6).
//
// The split is the file's whole point:
//
//   storedJustificationSearch()  PURE — stored search_results rows in, the generator's JustificationSearch out.
//                                No database, no clock: it is tested on its own, over row fixtures.
//   storedWhyLines()             THE DATABASE — the two reads the pure builder needs (the invoice behind each
//                                row's listing_scores_id, the norm behind each row's market_stats_id), then the
//                                generator, then this car's lines.
//
// NO PAGE LINE IS STORED (Eran, 29/09, decision 4 and his ז3 ruling): the car page RECOMPUTES its "why" lines
// from the stored rows, exactly as the library's contract states (justification/types.ts:8-9). The sentence, the
// tag and the runner-up's fact — the three the RESULTS screen draws — are the ones that were written with the
// rows at search time (results.ts) and read back by resultsViewFrom(); this file writes nothing.
//
// The generator needs the WHOLE search, not this car: the ownership forms are counted over every car of the run
// ("one of 12 in the search"), so every row's invoice is read, not the page's own.
//
// `db` is imported dynamically, the way load.ts imports it, so that this module stays importable by tests that
// never touch the database.

import { carsFromStoredRows, justify, type JustificationSearch, type StoredRow } from "@/lib/justification";
import type { Invoice } from "@/lib/scoring/types";
import type { Category } from "@/lib/selection";
import type { SearchFilters } from "./filters";
import { storedCrowned, storedFilters, storedRunnerUpListing, traceOf, type LoadedAddress, type ResultRow } from "./load";

/** One stored row, narrowed to what the library reads — the codes as Category[], the trace as RuleTrace[]. */
function toStoredRow(row: ResultRow): StoredRow {
  return {
    listing_id: row.listing_id,
    rank: row.rank,
    categories: row.recommendation_categories as Category[],
    price: row.price_snapshot,
    km: row.km_snapshot,
    listing_scores_id: row.listing_scores_id,
    market_stats_id: row.market_stats_id,
    trace: traceOf(row),
  };
}

/**
 * §6.1 — the generator's input, built from a displayed run's stored rows. Pure.
 *
 * `crowned` is the screen's own verdict over these rows (storedCrowned, load.ts): the library's crownedOf()
 * needs a fresh SelectionResult and there is none here. `runner_up` is the stored reading of the rule's record
 * (storedRunnerUpListing, load.ts:351) — the same listing the results screen puts on the "הכי חסכוני" bar.
 * Hidden rows are handed over with their `rank: null`, as on the fresh side; the library ignores them.
 */
export function storedJustificationSearch(input: {
  rows: readonly ResultRow[];
  filters: SearchFilters;
  invoices: ReadonlyMap<number, Invoice>;
  medians: ReadonlyMap<number, number | null>;
}): JustificationSearch {
  return {
    crowned: storedCrowned(input.rows),
    runner_up: storedRunnerUpListing(input.rows),
    has_price_ceiling: input.filters.priceMax !== undefined,
    cars: carsFromStoredRows(input.rows.map(toStoredRow), input.invoices, input.medians),
  };
}

/**
 * §6.1 — this car's "why" lines in the displayed run, or [] when it has none: a hidden row gets no output row
 * from the library, and neither does a listing_id that is not in the run at all.
 *
 * §6.2 — a BROKEN RUN is a log line, not a broken car page: the translator throws when a row's invoice is gone
 * or a scored price row has no norm behind its pointer (justification/input.ts), and that throw is caught HERE
 * and only here — the section is simply not drawn and the rest of the page renders as always. The throw itself
 * stays in the library, so the anomaly is never silent.
 */
export async function storedWhyLines(loaded: LoadedAddress, listing_id: number): Promise<string[]> {
  const rows = loaded.results;
  const scoreIds = [...new Set(rows.map((r) => r.listing_scores_id).filter((id): id is number => id !== null))];
  const statsIds = [...new Set(rows.map((r) => r.market_stats_id).filter((id): id is number => id !== null))];

  const { db } = await import("@/lib/db");
  const [scores, norms] = await Promise.all([
    db.listing_scores.findMany({ where: { id: { in: scoreIds } }, select: { id: true, breakdown: true } }),
    db.market_stats.findMany({ where: { id: { in: statsIds } }, select: { id: true, median_price: true } }),
  ]);
  // The same bare cast pool-scores.ts:48 uses: the column is the engine's own invoice, as the engine wrote it.
  const invoices = new Map<number, Invoice>(scores.map((s) => [s.id, s.breakdown as Invoice]));
  const medians = new Map<number, number | null>(norms.map((n) => [n.id, n.median_price]));

  try {
    const out = justify(
      storedJustificationSearch({ rows, filters: storedFilters(loaded.question.filters), invoices, medians }),
    );
    return out.cars.find((c) => c.listing_id === listing_id)?.page.why_lines ?? [];
  } catch (e) {
    console.error(`[why] search ${loaded.run.id} — ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
