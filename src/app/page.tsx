// The search screen's route (BRIEF Run 6b §5, §9) — TWO STATES on one path:
//
//   /                       the opening screen (the search screen as today, no results)
//   /?s=<searches.public_id> the results of that question, through loadForAddress()
//
// An unknown or malformed `s` renders the opening screen: nothing exists behind that name, and §5 says do
// not redirect and do not error. A name that does exist is loaded by the ONE loading rule — which may, when
// something has changed since the stored run, re-run the question in place and show the new run (§3.2, §4).
//
// WHAT IS RENDERED FROM WHAT (§9): the ranks, the categories, the price and the km come from the stored
// `search_results` snapshots; the static card facts (year, sub-model, seller kind) come from the DB rows
// those snapshots point at. The pick-cards look is otherwise untouched — the cards' redesign is Days 20–21.
//
// Dynamic, never prerendered: the model bar offers LIVE models, the results are a stored verdict read at
// request time, and the loading rule reads the clock.

import { db } from "@/lib/db";
import SearchScreen, { type OpenOnArrival } from "@/components/search/SearchScreen";
import { reliefFor, type AskResult, type FilterName, type PickCard } from "@/app/actions/search";
import { modelKey } from "@/lib/search/assemble";
import { activeFilterNames } from "@/lib/search/filters";
import { loadForAddress, storedFilters, viewerFromCookies } from "@/lib/search/load";
import { liveModels } from "@/lib/search/models";
import { isPublicId } from "@/lib/public-id";
import { CATEGORY_PRIORITY, type Category } from "@/lib/selection";

export const dynamic = "force-dynamic";

const OPEN_VALUES: readonly string[] = ["price", "years", "kmMax", "regions", "filters"];

/** selectThree answers every category one way or the other, and `no_candidate` is its only missing reason. */
const NO_CANDIDATE = "no_candidate";

export default async function Home(props: PageProps<"/">) {
  const params = await props.searchParams;
  const s = typeof params.s === "string" ? params.s : null;
  const rawOpen = typeof params.open === "string" ? params.open : null;
  const open: OpenOnArrival | null = rawOpen !== null && OPEN_VALUES.includes(rawOpen) ? (rawOpen as OpenOnArrival) : null;

  const models = await liveModels();

  // §5 — no `s`, or one that cannot be a public id, is the opening screen. No redirect, no error.
  if (s === null || !isPublicId(s)) return <SearchScreen models={models} />;

  const loaded = await loadForAddress(s, await viewerFromCookies());
  if (loaded === null) return <SearchScreen models={models} />; // nothing exists behind that name

  const { question, run, results } = loaded;

  // §9 — the picks come from the STORED run: the rows that carry a recommendation, in category order.
  const byCategory = new Map<Category, (typeof results)[number]>();
  for (const r of results) {
    for (const c of r.recommendation_categories) {
      const category = c as Category;
      if (!byCategory.has(category)) byCategory.set(category, r);
    }
  }

  const pickedIds = [...new Set([...byCategory.values()].map((r) => r.listing_id))];
  const listings =
    pickedIds.length === 0
      ? []
      : await db.listings.findMany({
          where: { id: { in: pickedIds } },
          select: {
            id: true,
            public_id: true,
            dealer: { select: { dealer_type: true } },
            car: { select: { year: true, model: { select: { sub_model: true } } } },
          },
        });
  const rowOf = new Map(listings.map((l) => [l.id, l]));

  const picks: PickCard[] = [];
  const empties: AskResult["empties"] = [];
  const seen = new Set<number>();
  for (const c of CATEGORY_PRIORITY) {
    const r = byCategory.get(c);
    if (r === undefined) {
      empties.push({ category: c, reason: NO_CANDIDATE });
      continue;
    }
    if (seen.has(r.listing_id)) continue; // a double winner is ONE card, under the first category it won
    seen.add(r.listing_id);
    const l = rowOf.get(r.listing_id);
    if (l === undefined) throw new Error(`/?s=${s}: search_results points at listing ${r.listing_id}, which is not in listings`);
    if (l.car.year === null) throw new Error(`/?s=${s}: listing ${l.id} (car year null) cannot be shown on a card`);
    picks.push({
      listing_id: r.listing_id,
      public_id: l.public_id,
      categories: r.recommendation_categories as Category[],
      year: l.car.year,
      sub_model: l.car.model.sub_model,
      price: r.price_snapshot, // the snapshot, not today's price (§9)
      km_declared: r.km_snapshot,
      dealer_type: l.dealer.dealer_type,
    });
  }

  const filters = storedFilters(question.filters);
  const answer: AskResult = {
    search_id: run.id,
    public_id: question.public_id, // the ADDRESS is the question's, whatever run is displayed (§4)
    question: {
      model: run.model_searched,
      model_key: modelKey(run.model_searched),
      filters,
      active: activeFilterNames(filters) as FilterName[],
    },
    picks,
    empties,
    pool_count: run.pool_count ?? 0,
    results_count: run.results_count,
    relief: (run.pool_count ?? 0) === 0 ? await reliefFor(run.model_searched, filters) : null,
  };

  // The key is the address: the browser's back and forward land on a different question, and the screen
  // starts from that question's stored answer rather than from the one it happened to be holding.
  return <SearchScreen key={question.public_id} models={models} initial={answer} openOnArrival={open} />;
}
