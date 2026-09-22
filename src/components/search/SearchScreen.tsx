"use client";

// The search screen (BRIEF Days 15–16, Run 2b §5, Run 2c §6 and §8; re-addressed by Run 6b §5 and §9).
//
// TWO STATES, NOW ON TWO ADDRESSES (Run 6b §5):
//   /                      the opening screen — the bar centred, nothing asked
//   /?s=<public_id>        the results of that question, rendered SERVER-SIDE from the stored run and handed
//                          to this component as `initial`
// The URL is no longer a stand-in: every question is a real history entry, so the browser's own back moves
// from a question to the one asked before it, from the first question to the opening screen, and from a car
// page back to the results it was opened from. Day 15's in-page stack (useHistory.ts) keeps ONLY its drawer
// job (§5), and this file no longer pushes "results" entries of its own.
//
// THE TWO STATES THE SCREEN STILL TURNS ON (§5):
//   asked   the question the shown picks answer. The question row shows THIS, always.
//   draft   what the filter controls currently say.
// Dim ⇔ normalize(draft) ≠ normalize(asked), or the question row's search bar is open (§6). The results area
// at low opacity, non-interactive and not selectable — present, not readable. Pressing "עדכן" is the only
// commit: one server call, a new `searches` row, and then the address pushes to the new question (§5).
//
// THE MODEL IS A CONTROL, and it is no longer this file's business: QuestionRow owns the in-place search bar
// and the "another model = a new question from zero" flow on BOTH screens (§6). This screen only dims while
// it is open.
//
// NO SPINNER AND NO INTERIM SCREEN (§5): the current screen stays until the action returns, then swaps.
//
// MOBILE FIRST. Desktop is the widening: the drawer becomes a panel that never closes (and therefore has no
// history entry of its own). `dir="rtl"` is set in layout.tsx, so every inset here is logical.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FilterCountsView, ShelfView } from "@/lib/search/counts";
import type { SearchFilters } from "@/lib/search/filters";
import type { LiveModel } from "@/lib/search/models";
import { ask, counts as loadCounts, shelf as loadShelf, type AskResult, type FilterName } from "@/app/actions/search";
import { BRAND } from "@/lib/brand";
import FilterPanel, { normalize, Spinner } from "./FilterPanel";
import ModelBar from "./ModelBar";
import PickCards from "./PickCards";
import QuestionRow from "./QuestionRow";
import { useScreenHistory } from "./useHistory";
import { FILTER_LABEL, num } from "./labels";

const SEARCH = "חפש";
const FILTERS = "פילטרים";
const FAILED = "משהו נפל בדרך. נסו שוב.";

const same = (a: SearchFilters, b: SearchFilters): boolean => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const isEmpty = (f: SearchFilters): boolean => Object.keys(normalize(f)).length === 0;

// §8 — the desktop panel never closes, so it never gets a history entry. Everything else that opens does.
const isDesktop = (): boolean => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

/** The asked question's model, as the screen needs it: the search string, its key and its display name. */
type AskedModel = { model: string; key: string; display: string };

type Asked = { model: AskedModel; filters: SearchFilters };

export default function SearchScreen({
  models,
  initial = null,
}: {
  models: LiveModel[];
  /** The stored run of `/?s=<public_id>`, rendered on the server. null = the opening screen. */
  initial?: AskResult | null;
}) {
  const router = useRouter();

  // The asked model as the LIVE list spells it, when it is still live; a question whose model has since left
  // the pool keeps its own stored spelling rather than losing its name.
  const askedModel: AskedModel | null =
    initial === null
      ? null
      : (() => {
          const live = models.find((m) => m.key === initial.question.model_key);
          return { model: initial.question.model, key: initial.question.model_key, display: live?.display ?? initial.question.model };
        })();

  const [chosen, setChosen] = useState<LiveModel | null>(initial === null ? null : (models.find((m) => m.key === initial.question.model_key) ?? null));
  const [shelf, setShelf] = useState<ShelfView | null>(null);
  const [draft, setDraft] = useState<SearchFilters>(initial?.question.filters ?? {});
  const [asked, setAsked] = useState<Asked | null>(askedModel === null || initial === null ? null : { model: askedModel, filters: initial.question.filters });
  const [answer, setAnswer] = useState<AskResult | null>(initial);
  const [counts, setCounts] = useState<FilterCountsView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingModel, setEditingModel] = useState(false); // §6 — the question row's search bar is open
  const [focus, setFocus] = useState<FilterName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  // Run 7 §7.3 — a commit is in flight: the action buttons are disabled and carry a spinner until the push.
  const [busy, setBusy] = useState(false);

  // Every counter call is answered out of order sooner or later; only the latest one may land. The last
  // numbers stay on screen until then, which is what §5 asks for instead of a spinner.
  const countsSeq = useRef(0);

  const fail = useCallback((e: unknown) => {
    console.error("[search screen]", e);
    setError(e instanceof Error ? e.message : FAILED);
  }, []);

  const answered = answer !== null && asked !== null;

  // §5 — the drawer, and only the drawer: an open one closes AS CANCEL on back and the address does not move.
  const history = useScreenHistory({ onCancelOverlay: () => revertDraft() });

  // The model whose shelf and counters are in force: the asked question's, or the one being chosen on the
  // opening screen.
  const activeModel = asked?.model.model ?? chosen?.model ?? null;

  // Choosing a model (or un-choosing it by typing over the name) resets everything that is per model.
  function chooseModel(m: LiveModel | null) {
    setChosen(m);
    setShelf(null);
    setCounts(null);
    setDraft({});
  }

  // §5 — the shelf is per model and does not change with the draft, so it is fetched once per model.
  useEffect(() => {
    if (activeModel === null) return;
    let live = true;
    loadShelf(activeModel)
      .then((s) => {
        if (live) setShelf(s);
      })
      .catch(fail);
    return () => {
      live = false;
    };
  }, [activeModel, fail]);

  // §0.8 — every draft change calls the server. No filter logic runs in the client.
  useEffect(() => {
    if (activeModel === null) return;
    const seq = ++countsSeq.current;
    loadCounts({ model: activeModel, filters: isEmpty(draft) ? undefined : draft })
      .then((c) => {
        if (seq === countsSeq.current) setCounts(c);
      })
      .catch(fail);
  }, [activeModel, draft, fail]);

  async function doAsk(filters: SearchFilters, model: string | null = activeModel) {
    if (model === null) return;
    setError(null);
    setBusy(true);
    try {
      const r = await ask({ model, filters: isEmpty(filters) ? undefined : filters });
      // The answer lands first so nothing blinks (§5: no interim screen), and THEN the address pushes as a
      // NEW history entry — never a replace, because every question is one entry of its own (§5). The
      // pushed route renders through loadForAddress(): the run has just written and nothing has changed
      // since, so its stored rows are what comes back and nothing extra is written.
      setAnswer(r);
      // The question row must show the question the shown picks answer, from the same instant they appear —
      // it may not keep the previous question until the navigation lands.
      const live = models.find((m) => m.key === r.question.model_key);
      setAsked({ model: { model: r.question.model, key: r.question.model_key, display: live?.display ?? r.question.model }, filters });
      setDraft(filters);
      setDrawerOpen(false);
      setFocus(null);
      setResetToken((n) => n + 1);
      history.popOverlay(() => router.push(`/?s=${r.public_id}`));
    } catch (e) {
      fail(e); // §6 — one plain line, nothing retried silently
      setBusy(false); // the push never happened, so the controls come back
    }
  }

  /**
   * Run 7 §1.3 — "עדכן" WITH NO EFFECTIVE CHANGE IS A CANCEL, on this screen as on the car page. The
   * comparison is the canonical one (normalize(), the same shape the dim test uses) against the filters of
   * the question the shown picks answer; the model cannot change from this sheet, so it is unchanged by
   * construction. On a match nothing is asked: no ask() call, no new `searches` row, no navigation, and no
   * re-render of the results — it goes down exactly the path the X and the backdrop go down.
   */
  function applyFilters(next: SearchFilters) {
    if (asked !== null && same(next, asked.filters)) return closeDrawer();
    void doAsk(next);
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
    if (!(answered && isDesktop())) history.pushOverlay();
  }

  const dim = answered && (editingModel || !same(draft, asked.filters));
  const poolNow = counts?.pool_now ?? answer?.pool_count ?? shelf?.pool_total ?? null;

  const panel =
    shelf === null ? null : (
      <FilterPanel
        key={`${shelf.model_key}-${resetToken}`}
        shelf={shelf}
        draft={draft}
        counts={counts}
        poolNow={poolNow}
        focus={focus}
        onDraftChange={setDraft}
        onAsk={applyFilters}
        onCancel={closeDrawer}
        persistentOnDesktop={answered}
        busy={busy}
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
          answered ? "md:sticky md:inset-auto md:top-0 md:z-auto md:flex md:h-screen md:w-80 md:shrink-0 md:border-e md:border-[#d8d3cb]" : "",
        ].join(" ")}
      >
        {panel}
      </aside>

      <main className="flex min-h-screen flex-1 flex-col">
        {/* The opening screen: the bar centred, the collapsed cluster once a model is chosen, "חפש" below.
            The ~200 ms merge of Run 2b is kept: the bar collapses upward and the question row takes its
            place, and `motion-reduce` turns that off for anyone who asked the system for less motion.
            Overflow is hidden only while collapsing — the model bar's dropdown hangs out of this box. */}
        <div
          className={`transition-all duration-200 ease-out motion-reduce:transition-none ${answered ? "max-h-0 overflow-hidden opacity-0" : "max-h-[80vh] overflow-visible opacity-100"}`}
          aria-hidden={answered}
        >
          <div className="flex flex-col items-center gap-4 px-4 pt-[20vh] pb-6">
            <div className="w-full max-w-md">
              <ModelBar models={models} chosen={chosen} onChoose={chooseModel} onSubmit={() => doAsk(draft)} />
            </div>

            {/* §0.7 — before a model is chosen the cluster is not shown at all: its shelf is per model */}
            {chosen !== null && (
              <button type="button" className="rounded-full border border-neutral-300 px-4 py-2 text-neutral-700 hover:border-neutral-400" onClick={() => openFilters(null)}>
                {FILTERS}
              </button>
            )}

            {/* Run 7 §7.3 — disabled with a spinner from the click until the push. */}
            <button
              type="button"
              disabled={chosen === null || busy}
              aria-busy={busy}
              onClick={() => doAsk(draft)}
              className="fixed inset-x-4 bottom-4 z-10 flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3.5 text-lg font-medium text-white disabled:bg-neutral-300 md:static md:inset-auto md:w-full md:max-w-md"
            >
              {busy && <Spinner />}
              <span>{SEARCH}</span>
            </button>

            {error !== null && <p className="w-full max-w-md text-sm text-neutral-600">{error}</p>}
          </div>
        </div>

        {answered && (
          <>
            {/* §6 — the question row, inside the white top bar beside the brand name. */}
            <div className="sticky top-0 z-30 flex items-center gap-4 border-b border-[#d8d3cb] bg-white px-4 py-3">
              {/* §6 — the brand name never moves and never wraps; the row scrolls sideways beside it. */}
              <Link href="/" className="shrink-0 whitespace-nowrap text-[17px] font-extrabold text-[#221f1c]">
                {BRAND.name}
              </Link>
              <QuestionRow
                models={models}
                model={asked.model.model}
                modelDisplay={asked.model.display}
                modelKey={asked.model.key}
                filters={asked.filters}
                active={answer.question.active}
                onOpenFilters={openFilters}
                onEditingChange={setEditingModel}
              />
            </div>
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
