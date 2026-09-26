"use server";

// The screen's server actions (BRIEF Days 15–16, Run 2b §6). Three of them, and nothing else crosses the wire.
//
//   ask()             one question -> one `searches` row (+ its `search_results` rows) -> the three raw picks
//   modelFilterRows() Run 8b §2.3 — THE MODEL-ROWS CALL, and the filters window's only call left: one model in,
//                     its live filter rows and km anchors out. It replaces Run 8's resolving action, which took
//                     a draft and returned a resolved window — one round trip per settled edit, which is exactly the
//                     delay Run 8b removes. Called ONLY when the active model changes to a model whose rows
//                     are not already in hand; the browser resolves every chip itself, from these rows.
//   liveModels()      the model bar's list; called on the SERVER in page.tsx, and available to the client for a retry
//
// Run 8b §2.3 — THE RESULTS SCREEN NEVER CALLS IT AT ALL: the page's own request carries the rows (load.ts,
// §2.1), and a chip click or a price edit is resolved in the browser. The opening screen's first model pick
// is what this action is for.
//
// NO FILTER LOGIC LIVES HERE. src/lib/search/filters.ts is the single source (§0.8): these actions pass a
// SearchFilters through and never decide what it means. Nor is anything re-scored or re-ranked — every verdict
// comes back from runSearch() already decided.
//
// WHAT THE SCREEN SEES (Run 1 §2.1) — ONE VIEW, BUILT IN ONE PLACE. `ask()` no longer assembles a card
// payload of its own: it writes the search and then reads that search's own stored rows back through
// resultsView() (src/lib/search/load.ts), which is the very function `/?s=` renders from. Before this run the
// fresh answer and the answer at its own address were assembled by two different pieces of code — the way a
// screen comes to change under a person who only pressed back. The picks' own facts are no longer here at
// all; they are the card's, and the card's values are the car page's.
//
// FAILURE IS LOUD (§6): nothing here is retried and nothing is swallowed. An action that throws surfaces as
// one plain line under the bar.

import type { ModelRows } from "@/lib/search/chip-state";
import { filterCounts, modelRows } from "@/lib/search/counts";
import { activeFilterNames, type SearchFilters } from "@/lib/search/filters";
import { resultsOf, resultsView, type ResultsView } from "@/lib/search/load";
import { liveModels as loadLiveModels, type LiveModel } from "@/lib/search/models";
import { runSearch } from "@/lib/search/run";
import { searchIdentity } from "@/lib/search/visitor";

// §0.5 — which single ACTIVE filter, if released, brings cars back. null when no single removal does.
export type Relief = { filter: FilterName; count: number };

// The four filters, in the display order §0.5 breaks ties by.
export type FilterName = "price" | "years" | "kmMax" | "regions";
const FILTER_DISPLAY_ORDER: readonly FilterName[] = ["price", "years", "kmMax", "regions"];

// The question the shown picks answer — never the draft (§5).
export type Question = { model: string; model_key: string; filters: SearchFilters; active: FilterName[] };

/**
 * What the screen renders. `cards`, `runner_up` and `cars_shown` are the §2.1 view, and `public_id` is that
 * view's own — the question's address, which every link on the screen carries as `?s=`.
 *
 * Run 6b §5 — the client pushes `/?s=<public_id>` as a NEW history entry after every question, which is what
 * gives the browser's own back the decided rule.
 */
export type AskResult = ResultsView & {
  search_id: number;
  question: Question;
  pool_count: number; // the cut pool — what entered selectThree
  results_count: number; // what got a rank
  relief: Relief | null; // only ever set when pool_count is 0
};

/**
 * The search itself. Reads/sets the two cookies, runs the search under that identity, and returns the three
 * raw picks.
 *
 * `filters` is stored exactly as received (§6): undefined when the question carries none, which is what makes
 * `searches.filters` null rather than `{}`.
 */
export async function ask(input: { model: string; filters?: SearchFilters }): Promise<AskResult> {
  const filters = input.filters;
  const identity = await searchIdentity();
  const search = await runSearch({ model: input.model, filters, identity });

  // §2.1 — THE SAME ROWS, THE SAME BUILDER. The search has just written its `search_results` rows in one
  // transaction; they are read back and handed to resultsView(), which is the function `/?s=` renders from.
  // A fresh search is never a re-run, so this row IS the question and its public_id is the address.
  const view = await resultsView(search.public_id, await resultsOf(search.search_id));

  return {
    ...view,
    search_id: search.search_id,
    question: { model: search.model, model_key: search.model_key, filters: search.filters, active: activeFilterNames(search.filters) as FilterName[] },
    pool_count: search.pool_cut,
    results_count: search.results_count,
    relief: search.pool_cut === 0 ? await reliefFor(input.model, search.filters) : null,
  };
}

/**
 * §0.5 — the relief suggestion, computed only when the cut pool is empty.
 *
 * Each ACTIVE filter is removed in turn and the remaining question is measured through filterCounts(), which
 * is the same predicate the search itself cuts with. The largest returning pool wins; a tie goes to the
 * display order (מחיר, שנתון, ק"מ, אזור). If no single removal returns more than 0 the answer is null and the
 * screen shows the diagnostic line alone.
 *
 * Run 6b §9: exported so that the stored-run render of `/?s=` can offer the same suggestion the search
 * itself offered. It is a read-only measurement — it writes nothing and runs no search.
 */
export async function reliefFor(model: string, filters: SearchFilters): Promise<Relief | null> {
  const active = activeFilterNames(filters) as FilterName[];
  let best: Relief | null = null;
  for (const name of FILTER_DISPLAY_ORDER) {
    if (!active.includes(name)) continue;
    const without: SearchFilters = { ...filters };
    if (name === "price") {
      delete without.priceMin;
      delete without.priceMax;
    } else if (name === "years") delete without.years;
    else if (name === "kmMax") delete without.kmMax;
    else delete without.regions;
    const { pool_now } = await filterCounts({ model, draft: without });
    if (pool_now > 0 && (best === null || pool_now > best.count)) best = { filter: name, count: pool_now };
  }
  return best;
}

/**
 * Run 8b §2.3 — THE MODEL-ROWS CALL. One model goes out, its live filter rows and km anchors come back; the
 * browser holds them for the page's life and resolves every chip and every number from them, in render, with
 * no further call. NO DRAFT CROSSES THE WIRE and nothing about a chip is decided here.
 *
 * It is the same modelRows() the results page calls (load.ts §2.1), so the rows a model change brings in and
 * the rows an arrival brings in come out of one piece of code.
 */
export async function modelFilterRows(input: { model: string }): Promise<ModelRows> {
  return modelRows(input.model);
}

/** §5 — the model bar's list: LIVE models only, never the catalog. */
export async function liveModels(): Promise<LiveModel[]> {
  return loadLiveModels();
}
