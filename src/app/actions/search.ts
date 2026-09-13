"use server";

// The screen's server actions (BRIEF Days 15–16, Run 2b §6). Four of them, and nothing else crosses the wire.
//
//   ask()         one question -> one `searches` row (+ its `search_results` rows) -> the three raw picks
//   counts()      the drawer's grey numbers, one call per draft change (§0.8)
//   shelf()       the options of one model — years with stock, regions, km anchors; fixed while the draft moves
//   liveModels()  the model bar's list; called on the SERVER in page.tsx, and available to the client for a retry
//
// NO FILTER LOGIC LIVES HERE. src/lib/search/filters.ts is the single source (§0.8): these actions pass a
// SearchFilters through and never decide what it means. Nor is anything re-scored or re-ranked — every verdict
// comes back from runSearch() already decided.
//
// WHAT THE SCREEN IS ALLOWED TO SEE (§0.6): the raw picks are FACTS ONLY — the category codes, the year, the
// sub-model, the price, the km and the seller kind. No justification sentence, no confidence tag, no
// runner-up, no "מועמד לא מאומת" label, no bottom list, no link to a car page. Those are Days 17 and 19–23,
// and the way to keep them out of the screen is to keep them out of this payload.
//
// FAILURE IS LOUD (§6): nothing here is retried and nothing is swallowed. An action that throws surfaces as
// one plain line under the bar.

import { filterCounts, filterShelf, type FilterCountsView, type ShelfView } from "@/lib/search/counts";
import { activeFilterNames, type SearchFilters } from "@/lib/search/filters";
import { liveModels as loadLiveModels, type LiveModel } from "@/lib/search/models";
import { runSearch } from "@/lib/search/run";
import { searchIdentity } from "@/lib/search/visitor";
import { CATEGORY_PRIORITY, type Category } from "@/lib/selection";

// One raw pick, §0.6. A car that won two categories is ONE card carrying both codes.
export type PickCard = {
  listing_id: number;
  categories: Category[]; // codes; the Hebrew labels live in the component
  year: number;
  sub_model: string | null;
  price: number;
  km_declared: number | null;
  dealer_type: string; // code: private | ... — "פרטי" / "מגרש" is a display decision
};

// A category nobody won, with selectThree's own reason code — raw; the wording is Days 20–23.
export type EmptyCategory = { category: Category; reason: string };

// §0.5 — which single ACTIVE filter, if released, brings cars back. null when no single removal does.
export type Relief = { filter: FilterName; count: number };

// The four filters, in the display order §0.5 breaks ties by.
export type FilterName = "price" | "years" | "kmMax" | "regions";
const FILTER_DISPLAY_ORDER: readonly FilterName[] = ["price", "years", "kmMax", "regions"];

// The question the shown picks answer — never the draft (§5).
export type Question = { model: string; model_key: string; filters: SearchFilters; active: FilterName[] };

export type AskResult = {
  search_id: number;
  question: Question;
  picks: PickCard[]; // distinct listings, in category order; empty when the pool answered nothing
  empties: EmptyCategory[]; // one per category with no pick
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

  // one card per DISTINCT picked listing, in category order: a double winner appears once, under the first
  // category it won
  const cards = new Map<number, PickCard>();
  const empties: EmptyCategory[] = [];
  for (const c of CATEGORY_PRIORITY) {
    const p = search.picks[c];
    if (p === null) {
      empties.push({ category: c, reason: search.missing[c] ?? "no_candidate" });
      continue;
    }
    if (cards.has(p.listing_id)) continue;
    cards.set(p.listing_id, {
      listing_id: p.listing_id,
      categories: p.categories,
      year: p.year,
      sub_model: p.sub_model,
      price: p.price,
      km_declared: p.km_declared,
      dealer_type: p.dealer_type,
    });
  }

  return {
    search_id: search.search_id,
    question: { model: search.model, model_key: search.model_key, filters: search.filters, active: activeFilterNames(search.filters) as FilterName[] },
    picks: [...cards.values()],
    empties,
    pool_count: search.pool_cut,
    results_count: search.results_count,
    relief: search.pool_cut === 0 ? await relief(input.model, search.filters) : null,
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
 * Not exported: it is part of one ask, never a question of its own.
 */
async function relief(model: string, filters: SearchFilters): Promise<Relief | null> {
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

/** §0.8 — the counters. One call per draft change; the price block's number settles, it does not stream. */
export async function counts(input: { model: string; filters?: SearchFilters }): Promise<FilterCountsView> {
  return filterCounts({ model: input.model, draft: input.filters });
}

/** §5 — the shelf of one model. It does not change with the draft, so the screen asks for it once. */
export async function shelf(model: string): Promise<ShelfView> {
  return filterShelf(model);
}

/** §5 — the model bar's list: LIVE models only, never the catalog. */
export async function liveModels(): Promise<LiveModel[]> {
  return loadLiveModels();
}
