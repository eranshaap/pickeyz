// The search screen's route (BRIEF Run 6b §5, §9) — TWO STATES on one path:
//
//   /                       the opening screen (the search screen as today, no results)
//   /?s=<searches.public_id> the results of that question, through loadForAddress()
//
// An unknown or malformed `s` renders the opening screen: nothing exists behind that name, and §5 says do
// not redirect and do not error. A name that does exist is loaded by the ONE loading rule — which may, when
// something has changed since the stored run, re-run the question in place and show the new run (§3.2, §4).
//
// RUN 7 §1.1 — `open=` IS GONE. Run 6b's car page navigated here to change a filter, carrying the filters
// window it wanted opened in the address; the car page now opens the same sheet over itself and never
// navigates to do it. There is no redirect and no error for the old form: an address that still carries `open=` is read
// exactly as one that does not, because the parameter is simply not read any more.
//
// RUN 1 (Days 20–21) §7 — THE FILE IS BACK AT THE ROOT. It spent Runs 7–9 inside the route group
// `src/app/(results)/`, which lost its one job (a `loading.tsx` for the results segment) when Run 7c moved the
// placeholders into the screen itself; the group named nothing and the folder held nothing else, so `/` is
// served from `src/app/page.tsx` again. The route itself does not change — a route group never appears in a
// URL — and `PageProps<"/">` is the same type it was.
//
// RUN 1 §2.1 — WHAT IS RENDERED FROM WHAT: nothing about a card is assembled here any more. The stored rows
// go through resultsView() (src/lib/search/load.ts), the ONE builder the fresh search also goes through, and
// what comes back is what the screen draws — the cards with every value the card prints, the cheapest pick's
// runner-up, and X of the count line. This file gathers the question and hands the rows over.
//
// Dynamic, never prerendered: the model bar offers LIVE models, the results are a stored verdict read at
// request time, and the loading rule reads the clock.

import SearchScreen from "@/components/search/SearchScreen";
import { reliefFor, type AskResult, type FilterName } from "@/app/actions/search";
import { modelKey } from "@/lib/search/assemble";
import { activeFilterNames } from "@/lib/search/filters";
import { loadForAddress, resultsView, storedFilters, viewerFromCookies } from "@/lib/search/load";
import { liveModels } from "@/lib/search/models";
import { isPublicId } from "@/lib/public-id";

export const dynamic = "force-dynamic";

export default async function Home(props: PageProps<"/">) {
  const params = await props.searchParams;
  const s = typeof params.s === "string" ? params.s : null;

  const models = await liveModels();

  // §5 — no `s`, or one that cannot be a public id, is the opening screen. No redirect, no error.
  if (s === null || !isPublicId(s)) return <SearchScreen models={models} />;

  // Run 8b §2.1 — THE MODEL'S FILTER ROWS RIDE IN THIS REQUEST, in place of Run 8's resolved window.
  // loadForAddress fetches them concurrently with the stored-results load (the seam sits inside the loader,
  // right after the question row is read, so the response is delayed by the slower of the two and not by
  // their sum). The screen builds the shelf and resolves the window from them IN RENDER — here for the first
  // paint, in the browser for every edit after it (§2.2) — so the window is full from the first frame and a
  // chip click never waits for the network.
  const loaded = await loadForAddress(s, await viewerFromCookies(), { model_rows: true });
  if (loaded === null) return <SearchScreen models={models} />; // nothing exists behind that name

  const { question, run, results, model_rows } = loaded;
  if (model_rows === null) throw new Error(`/?s=${s}: the model's filter rows were asked for and did not come back`);

  // §2.1 — the ADDRESS is the question's, whatever run is displayed (§4), so the view is built under the
  // question's public_id and every link on the screen carries it.
  const view = await resultsView(question.public_id, results);

  const filters = storedFilters(question.filters);
  const answer: AskResult = {
    ...view,
    search_id: run.id,
    question: {
      model: run.model_searched,
      model_key: modelKey(run.model_searched),
      filters,
      active: activeFilterNames(filters) as FilterName[],
    },
    pool_count: run.pool_count ?? 0,
    results_count: run.results_count,
    relief: (run.pool_count ?? 0) === 0 ? await reliefFor(run.model_searched, filters) : null,
  };

  // The key is the address: the browser's back and forward land on a different question, and the screen
  // starts from that question's stored answer rather than from the one it happened to be holding.
  return <SearchScreen key={question.public_id} models={models} initial={answer} modelRows={model_rows} />;
}
