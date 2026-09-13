"use client";

// The search screen (BRIEF Days 15–16, Run 2b §5; Run 2c §6 and §8) — one route, two states, client state only.
//
// §0.4: the opening screen and the results live on the same page and the URL carries no question — no query
// string, no hash. A refresh returns to the opening screen. What the URL does NOT do, the history stack does
// (§8): the first search pushes one `results` entry, every later question replaces it, and an open drawer or
// model editor adds one `overlay` entry that is popped whenever it is closed by something other than back.
// The whole of that lives in ./useHistory.ts; this file only says what each move means on screen.
//
// THE TWO STATES THE WHOLE SCREEN TURNS ON (§5):
//   asked   the question the three shown picks answer. The question line shows THIS, always.
//   draft   what the filter controls currently say.
// Dim ⇔ normalize(draft) ≠ normalize(asked), OR the model editor is open (§6). The entire results area at low
// opacity, non-interactive and not selectable — present, not readable. It is derived from state alone; there
// is no hover behaviour, and nothing updates the picks live. Pressing "עדכן" is the only commit, and it is one
// server call: a new `searches` row, the three swap as one unit, the question line updates, the dim goes off.
//
// THE MODEL IS A RUBRIC (§6). Tapping the model name in the question line opens the bar IN PLACE in the
// header, over the dimmed results. A DIFFERENT model is a new question from zero — ask() at once, filters
// undefined, the draft reset and the shelf reloaded for the new model. The SAME model is a cancel (§0.1), and
// so are Esc, a click outside and browser back.
//
// NO SPINNER AND NO INTERIM SCREEN (§5): the current screen stays until the action returns, then swaps. On
// the first search only, one ~200 ms merge: the bar collapses upward and the question line takes its place,
// and `motion-reduce` turns that off for anyone who asked the system for less motion.
//
// MOBILE FIRST. Desktop is the widening: the drawer becomes a panel that never closes (and therefore has no
// history entry of its own), and the fixed search button moves under the bar. `dir="rtl"` is set in
// layout.tsx, so every inset here is logical (ps/pe, start/end) and nothing is hard-coded to left or right.

import { useCallback, useEffect, useRef, useState } from "react";
import type { FilterCountsView, ShelfView } from "@/lib/search/counts";
import type { SearchFilters } from "@/lib/search/filters";
import type { LiveModel } from "@/lib/search/models";
import { ask, counts as loadCounts, shelf as loadShelf, type AskResult, type FilterName } from "@/app/actions/search";
import FilterPanel, { normalize } from "./FilterPanel";
import ModelBar from "./ModelBar";
import PickCards from "./PickCards";
import QuestionLine from "./QuestionLine";
import { useScreenHistory } from "./useHistory";
import { FILTER_LABEL, num } from "./labels";

const SEARCH = "חפש";
const FILTERS = "פילטרים";
const FAILED = "משהו נפל בדרך. נסו שוב.";

const same = (a: SearchFilters, b: SearchFilters): boolean => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const isEmpty = (f: SearchFilters): boolean => Object.keys(normalize(f)).length === 0;

// §8 — the desktop panel never closes, so it never gets a history entry. Everything else that opens does.
const isDesktop = (): boolean => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

type Asked = { model: LiveModel; filters: SearchFilters };

export default function SearchScreen({ models }: { models: LiveModel[] }) {
  const [chosen, setChosen] = useState<LiveModel | null>(null);
  const [shelf, setShelf] = useState<ShelfView | null>(null);
  const [draft, setDraft] = useState<SearchFilters>({});
  const [asked, setAsked] = useState<Asked | null>(null);
  const [answer, setAnswer] = useState<AskResult | null>(null);
  const [counts, setCounts] = useState<FilterCountsView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(false); // §6 — the model editor is open in the header
  const [focus, setFocus] = useState<FilterName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [openingToken, setOpeningToken] = useState(0); // §8 — a back to the opening screen empties the bar
  const [merged, setMerged] = useState(false); // the ~200 ms transition runs once, on the first answer

  // Every counter call is answered out of order sooner or later; only the latest one may land. The last
  // numbers stay on screen until then, which is what §5 asks for instead of a spinner.
  const countsSeq = useRef(0);

  const fail = useCallback((e: unknown) => {
    console.error("[search screen]", e);
    setError(e instanceof Error ? e.message : FAILED);
  }, []);

  const answered = answer !== null && asked !== null;

  // §8 — back, in one place. An open overlay closes AS CANCEL; nothing open on the results goes back to a
  // FRESH opening screen, never to a stale one (§0.6).
  const history = useScreenHistory({
    onCancelOverlay: () => {
      if (editing) setEditing(false); // §6 cancel: the asked model's name is restored, the dim lifts
      else revertDraft(); // exactly the X behaviour: values back to the asked question, results live
    },
    onBackToOpening: () => toOpening(),
  });

  // Choosing a model (or un-choosing it by typing over the name) resets everything that is per model: the
  // shelf, the draft and the counters all belong to the model that was chosen, not to the next one.
  function chooseModel(m: LiveModel | null) {
    setChosen(m);
    setShelf(null);
    setCounts(null);
    setDraft({});
  }

  // §5 — the shelf is per model and does not change with the draft, so it is fetched once per model.
  useEffect(() => {
    if (chosen === null) return;
    let live = true;
    loadShelf(chosen.model)
      .then((s) => {
        if (live) setShelf(s);
      })
      .catch(fail);
    return () => {
      live = false;
    };
  }, [chosen, fail]);

  // §0.8 — every draft change calls the server. No filter logic runs in the client.
  useEffect(() => {
    if (chosen === null) return;
    const seq = ++countsSeq.current;
    loadCounts({ model: chosen.model, filters: isEmpty(draft) ? undefined : draft })
      .then((c) => {
        if (seq === countsSeq.current) setCounts(c);
      })
      .catch(fail);
  }, [chosen, draft, fail]);

  async function doAsk(filters: SearchFilters, model: LiveModel | null = chosen) {
    if (model === null) return;
    setError(null);
    const first = asked === null;
    try {
      const r = await ask({ model: model.model, filters: isEmpty(filters) ? undefined : filters });
      setAnswer(r);
      setAsked({ model, filters });
      setDraft(filters); // the draft IS the question again; the dim goes off because the two are equal
      setDrawerOpen(false);
      setEditing(false);
      setFocus(null);
      setResetToken((n) => n + 1);
      setMerged(true);
      // §0.4 — one `results` entry, pushed once and replaced ever after. When an overlay entry is on the
      // stack it goes first, and the push lands on the entry below it rather than on top of it.
      history.popOverlay(() => (first ? history.pushResults() : history.replaceResults()));
    } catch (e) {
      fail(e); // §6 — one plain line, nothing retried silently
    }
  }

  // Closing the drawer without "עדכן" is a CANCEL (§5): the draft goes back to the asked question and the
  // results are live again. No diff state survives a close.
  function revertDraft() {
    setDraft(asked?.filters ?? {});
    setResetToken((n) => n + 1);
    setDrawerOpen(false);
    setFocus(null);
  }

  /** The X, the backdrop — a close that is not back, so it pops the overlay entry itself (§8). */
  function closeDrawer() {
    revertDraft();
    history.popOverlay();
  }

  function openFilters(on: FilterName | null) {
    setFocus(on);
    setDrawerOpen(true);
    if (!(answered && isDesktop())) history.pushOverlay(answered ? "results" : "opening");
  }

  // §6 — the model editor. It is an overlay like the drawer, on every viewport.
  function openEditor() {
    setEditing(true);
    history.pushOverlay("results");
  }
  function cancelEditor() {
    setEditing(false);
    history.popOverlay();
  }
  function chooseFromEditor(m: LiveModel | null) {
    if (m === null) return; // the editor never un-chooses: the asked question stands until it is replaced
    if (asked !== null && m.key === asked.model.key) return cancelEditor(); // §0.1
    // A different model is a new question from zero: no filters, a fresh shelf, the three picks swapping as a
    // unit. The editor stays in the header until the answer lands (§5: no interim screen), and doAsk closes it.
    chooseModel(m);
    doAsk({}, m);
  }

  // §8 — back from the results with nothing open: the opening screen, FRESH. Empty bar, no filters, nothing
  // asked. Forward from here shows this same screen and never the stale results (§0.6).
  function toOpening() {
    setChosen(null);
    setShelf(null);
    setCounts(null);
    setDraft({});
    setAsked(null);
    setAnswer(null);
    setDrawerOpen(false);
    setEditing(false);
    setFocus(null);
    setError(null);
    setMerged(false);
    setResetToken((n) => n + 1);
    setOpeningToken((n) => n + 1);
  }

  const dim = answered && (editing || !same(draft, asked.filters));
  const poolNow = counts?.pool_now ?? answer?.pool_count ?? shelf?.pool_total ?? null;

  const panel = shelf === null ? null : (
    <FilterPanel
      key={`${shelf.model_key}-${resetToken}`}
      shelf={shelf}
      draft={draft}
      counts={counts}
      poolNow={poolNow}
      focus={focus}
      onDraftChange={setDraft}
      onAsk={doAsk}
      onCancel={closeDrawer}
      persistentOnDesktop={answered}
    />
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* the backdrop is the mobile drawer's; the desktop panel has none because it never closes */}
      {drawerOpen && <button type="button" aria-label="סגירה" className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={closeDrawer} />}

      <aside
        className={[
          drawerOpen ? "fixed inset-0 z-50 flex" : "hidden",
          "flex-col bg-white",
          answered ? "md:sticky md:inset-auto md:top-0 md:z-auto md:flex md:h-screen md:w-80 md:shrink-0 md:border-e md:border-neutral-200" : "",
        ].join(" ")}
      >
        {panel}
      </aside>

      <main className="flex min-h-screen flex-1 flex-col">
        {/* The opening screen: the bar centred, the collapsed cluster once a model is chosen, "חפש" below.
            Overflow is hidden only while collapsing — the model bar's dropdown hangs out of this box, and a
            permanent overflow-hidden would clip the list instead of the merge. */}
        <div
          className={`transition-all duration-200 ease-out motion-reduce:transition-none ${merged ? "max-h-0 overflow-hidden opacity-0" : "max-h-[80vh] overflow-visible opacity-100"}`}
          aria-hidden={merged}
        >
          <div className="flex flex-col items-center gap-4 px-4 pt-[20vh] pb-6">
            <div className="w-full max-w-md">
              <ModelBar key={`bar-${openingToken}`} models={models} chosen={chosen} onChoose={chooseModel} onSubmit={() => doAsk(draft)} />
            </div>

            {/* §0.7 — before a model is chosen the cluster is not shown at all: its shelf is per model */}
            {chosen !== null && (
              <button type="button" className="rounded-full border border-neutral-300 px-4 py-2 text-neutral-700 hover:border-neutral-400" onClick={() => openFilters(null)}>
                {FILTERS}
              </button>
            )}

            <button
              type="button"
              disabled={chosen === null}
              onClick={() => doAsk(draft)}
              className="fixed inset-x-4 bottom-4 z-10 rounded-2xl bg-neutral-900 px-4 py-3.5 text-lg font-medium text-white disabled:bg-neutral-300 md:static md:inset-auto md:w-full md:max-w-md"
            >
              {SEARCH}
            </button>

            {error !== null && <p className="w-full max-w-md text-sm text-neutral-600">{error}</p>}
          </div>
        </div>

        {answered && (
          <>
            {/* §6 — the editor takes the header's place while it is open; the question line comes back on
                cancel, still showing the question the three cars on screen answer. */}
            {editing ? (
              <div className="sticky top-0 z-30 border-b border-neutral-200 bg-white px-4 py-3">
                <ModelBar models={models} chosen={asked.model} onChoose={chooseFromEditor} onSubmit={() => undefined} edit={{ onCancel: cancelEditor }} />
              </div>
            ) : (
              <QuestionLine modelDisplay={asked.model.display} filters={asked.filters} active={answer.question.active} onOpen={openFilters} onEditModel={openEditor} />
            )}
            {error !== null && <p className="px-4 py-2 text-sm text-neutral-600">{error}</p>}

            <div className={`transition-opacity duration-200 ease-out motion-reduce:transition-none ${dim ? "pointer-events-none select-none opacity-25" : "opacity-100"}`} aria-hidden={dim}>
              <PickCards answer={answer} />

              {/* §0.5 — one relief suggestion, and only when the pool came back empty */}
              {answer.relief !== null && (
                <div className="px-4 pb-8">
                  <button
                    type="button"
                    className="w-full rounded-2xl border border-neutral-900 px-4 py-3 text-neutral-900 hover:bg-neutral-100"
                    onClick={() => {
                      const next: SearchFilters = { ...asked.filters };
                      const name = answer.relief?.filter;
                      if (name === "price") {
                        delete next.priceMin;
                        delete next.priceMax;
                      } else if (name === "years") delete next.years;
                      else if (name === "kmMax") delete next.kmMax;
                      else if (name === "regions") delete next.regions;
                      doAsk(next);
                    }}
                  >
                    {`הסרת ${FILTER_LABEL[answer.relief.filter]} תחזיר ${num(answer.relief.count)} רכבים`}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
