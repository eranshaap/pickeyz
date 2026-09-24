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
// THE PENDING STATE IS THE SCREEN'S OWN, IN THE BROWSER (Run 7c §11.3). Run 7 §7.2 gave the route a
// `loading.tsx`; that boundary wrapped the WHOLE results segment, so every navigation into the route —
// "עדכן" included — replaced the entire screen with a skeleton and rebuilt it. It is gone, and the results
// route has no streaming boundary of any kind. Instead: from the click on one of THIS screen's own controls
// ("עדכן", or a model picked from the question row's search bar) until the new screen is on, the white bar,
// the question row and the drawer stay exactly where they are and ONLY the cards area shows the three grey
// placeholders. The span is one unbroken state — `submitting` from the click through the server call, then
// `useTransition` around the `router.push`, which stays pending until the navigation commits — and the two
// change over in one batch, so it never blinks off between them.
//
// A COLD ARRIVAL (a link, a refresh) GETS NO PLACEHOLDER: the browser's own loading indication, as before
// Run 7. That is the ruled behaviour, not a gap.
//
// THE DRAWER ARRIVES WITH THE PAGE (Run 8 §3). Until now the shelf and the counters were fetched from the
// browser after mount, so the drawer was blank until the shelf returned and then numberless until the counts
// returned — on EVERY arrival, "עדכן" included, because the route keys this component by the question's
// public_id. Now the results page resolves the whole drawer server-side and hands it over as `drawer`: this
// screen SEEDS ITS STATE FROM THE PROPS AND FETCHES NOTHING ON MOUNT. The frame stays and the counters switch
// in one step with the cards; a link or a refresh shows the drawer full from the first paint.
//
// AND IT DECIDES NOTHING (§1). Every chip's state, every count, the effective filters and the button's number
// come from src/lib/search/chip-state.ts — on the server in the page and in the resolve action alike. This
// file forwards a click to toggleChip() and renders what comes back.
//
// MOBILE FIRST. Desktop is the widening: the drawer becomes a panel that never closes (and therefore has no
// history entry of its own). `dir="rtl"` is set in layout.tsx, so every inset here is logical.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { applyFilters as effectiveFilters, isUnchanged } from "@/lib/search/chip-state";
import { noFilters, normalizeFilters, sameFilters } from "@/lib/search/filters";
import type { SearchFilters } from "@/lib/search/filters";
import type { DrawerPayload } from "@/lib/search/load";
import type { LiveModel } from "@/lib/search/models";
import { ask, drawer as loadDrawer, type AskResult, type FilterName } from "@/app/actions/search";
import { BRAND } from "@/lib/brand";
import FilterPanel, { Spinner } from "./FilterPanel";
import ModelBar from "./ModelBar";
import PickCards from "./PickCards";
import PickCardsSkeleton from "./PickCardsSkeleton";
import QuestionRow, { type ScreenNav } from "./QuestionRow";
import { useScreenHistory } from "./useHistory";
import { FILTER_LABEL, num } from "./labels";

const SEARCH = "חפש";
const FILTERS = "פילטרים";
const FAILED = "משהו נפל בדרך. נסו שוב.";

// §1.3 — the canonical comparison, now in filters.ts beside the predicate that reads the same fields.
const same = sameFilters;
const isEmpty = noFilters;

/** Which (model, draft) pair a held drawer answers. Two equal questions produce one key (§1.3's canon). */
const drawerKey = (model: string, draft: SearchFilters): string => JSON.stringify([model, normalizeFilters(draft)]);

// §8 — the desktop panel never closes, so it never gets a history entry. Everything else that opens does.
const isDesktop = (): boolean => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

/** The asked question's model, as the screen needs it: the search string, its key and its display name. */
type AskedModel = { model: string; key: string; display: string };

type Asked = { model: AskedModel; filters: SearchFilters };

export default function SearchScreen({
  models,
  initial = null,
  drawer = null,
}: {
  models: LiveModel[];
  /** The stored run of `/?s=<public_id>`, rendered on the server. null = the opening screen. */
  initial?: AskResult | null;
  /**
   * Run 8 §3.1 — the drawer of that question, resolved in the page's own request. Present on every `/?s=`
   * arrival and null on the opening screen, which has no question and therefore no drawer to seed.
   */
  drawer?: DrawerPayload | null;
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
  const [draft, setDraft] = useState<SearchFilters>(initial?.question.filters ?? {});
  const [asked, setAsked] = useState<Asked | null>(askedModel === null || initial === null ? null : { model: askedModel, filters: initial.question.filters });
  const [answer, setAnswer] = useState<AskResult | null>(initial);
  // §3.1 — SEEDED FROM THE PROPS. On a `/?s=` arrival this is already the whole drawer, so the first render
  // draws it complete; on the opening screen it is null until a model is chosen.
  const [resolved, setResolved] = useState<DrawerPayload | null>(drawer);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingModel, setEditingModel] = useState(false); // §6 — the question row's search bar is open
  const [focus, setFocus] = useState<FilterName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);

  // Run 7 §7.3, as Run 7c §11.3 re-cut it — A COMMIT IS IN FLIGHT, from the click until the NEW SCREEN IS
  // ON (not merely until the push). Two halves of one state, because the two halves are measured by
  // different things: `submitting` covers the click and the server call, and the transition covers the
  // navigation the push starts — `navPending` is true exactly until the router commits the new screen.
  // `navPush` swaps one for the other in a single batch, so `pending` never flickers off between them.
  const [submitting, setSubmitting] = useState(false);
  const [navPending, startNav] = useTransition();
  const pending = submitting || navPending;

  // Every resolve call is answered out of order sooner or later; only the latest one may land. The last
  // drawer stays on screen until then, which is what §5 asks for instead of a spinner.
  const countsSeq = useRef(0);

  // §3.1 — the drawer in hand and WHICH (model, draft) it answers. It starts as the page's own payload, so
  // the effect below has nothing to ask for on mount; every landed answer moves it on. A draft that comes
  // back to a pair already answered (a cancel, a chip toggled twice) asks nothing again. It is a ref as well
  // as state because "עדכן" must read the LATEST one from inside an async handler, not the render's copy.
  const held = useRef<{ key: string; payload: DrawerPayload } | null>(
    drawer === null || initial === null ? null : { key: drawerKey(initial.question.model, initial.question.filters), payload: drawer },
  );

  const fail = useCallback((e: unknown) => {
    console.error("[search screen]", e);
    setError(e instanceof Error ? e.message : FAILED);
  }, []);

  const answered = answer !== null && asked !== null;

  // §5 — the drawer, and only the drawer: an open one closes AS CANCEL on back and the address does not move.
  const history = useScreenHistory({ onCancelOverlay: () => revertDraft() });

  // The model whose drawer is in force: the asked question's, or the one being chosen on the opening screen.
  const activeModel = asked?.model.model ?? chosen?.model ?? null;

  // Choosing a model (or un-choosing it by typing over the name) resets everything that is per model.
  function chooseModel(m: LiveModel | null) {
    setChosen(m);
    setResolved(null);
    held.current = null;
    setDraft({});
  }

  // §2.4 / §3.3 — every settled edit sends the DRAFT to the server and takes back the resolved drawer: the
  // chips' states, their counts, the effective filters and the button's number. No state is derived here.
  //
  // §3.2 — and this effect ASKS FOR NOTHING ON MOUNT of a results screen: the page's payload already answers
  // the (model, draft) it opens with, so `held` matches on the first pass and the effect returns. The shelf
  // has no call of its own any more — it comes back with the chips, in this one round trip.
  useEffect(() => {
    if (activeModel === null) return;
    const key = drawerKey(activeModel, draft);
    if (held.current?.key === key) return;
    const seq = ++countsSeq.current;
    loadDrawer({ model: activeModel, draft: isEmpty(draft) ? undefined : draft })
      .then((d) => {
        if (seq !== countsSeq.current) return; // latest wins; a stale answer is dropped
        held.current = { key, payload: d };
        setResolved(d);
      })
      .catch(fail);
  }, [activeModel, draft, fail]);

  /**
   * §11.3 — the push, and the only one this screen makes. It runs inside a transition, so React holds the
   * pending state until the navigation has actually committed; `submitting` is dropped in the SAME batch,
   * which is what makes the click → action → push → new screen span one unbroken busy state.
   */
  function navPush(href: string) {
    setSubmitting(false);
    startNav(() => router.push(href));
  }

  /** §11.3 — what the question row's model pick drives, so both of this screen's controls share one state. */
  const nav: ScreenNav = { begin: () => setSubmitting(true), push: navPush, end: () => setSubmitting(false) };

  async function doAsk(filters: SearchFilters, model: string | null = activeModel) {
    if (model === null) return;
    setError(null);
    setSubmitting(true); // §11.3 — the cards area goes to placeholders on the click itself
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
      history.popOverlay(() => navPush(`/?s=${r.public_id}`));
    } catch (e) {
      fail(e); // §6 — one plain line, nothing retried silently
      setSubmitting(false); // the push never happened, so the controls come back
    }
  }

  /**
   * §2.5 — the effective filters of a draft, which is what "עדכן" sends: never a dormant chip.
   *
   * The drawer in hand answers the draft in every case but one — a price settled by the very click that
   * pressed the button, whose resolve is still in flight — and there it is resolved first. The screen never
   * works out an effective filter itself; it asks the same action the drawer asks.
   */
  async function effectiveOf(model: string, next: SearchFilters): Promise<SearchFilters> {
    const key = drawerKey(model, next);
    const payload = held.current?.key === key ? held.current.payload : await loadDrawer({ model, draft: isEmpty(next) ? undefined : next });
    return effectiveFilters(payload.resolved);
  }

  /**
   * Run 7 §1.3 — "עדכן" WITH NO EFFECTIVE CHANGE IS A CANCEL, on this screen as on the car page. Run 8 §1.3
   * gives that test and the greyed button ONE predicate: isUnchanged() compares the CHOSEN SET — awake and
   * dormant together — plus the typed values against the question the shown picks answer. The model cannot
   * change from this sheet, so it is unchanged by construction. On a match nothing is asked: no ask() call,
   * no new `searches` row, no navigation, and no re-render of the results — it goes down exactly the path
   * the X and the backdrop go down. The button is already `disabled` in that state (§2.3); this is the belt
   * behind that braces.
   */
  function applyFilters(next: SearchFilters) {
    if (asked !== null && isUnchanged(next, asked.filters)) return closeDrawer();
    if (activeModel === null) return;
    setSubmitting(true); // §11.3 — the busy state starts on the click, before anything is awaited
    effectiveOf(activeModel, next)
      .then((effective) => doAsk(effective))
      .catch((e) => {
        fail(e);
        setSubmitting(false);
      });
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
  // §1.2 — the button's number is the pool under the EFFECTIVE filters. Before the first resolve of the
  // opening screen there is none, and the button carries no number at all, exactly as it did before.
  const poolNow = resolved?.resolved.total ?? answer?.pool_count ?? null;

  const panel =
    resolved === null ? null : (
      <FilterPanel
        key={`${resolved.shelf.model_key}-${resetToken}`}
        resolved={resolved.resolved}
        draft={draft}
        poolNow={poolNow}
        stored={asked?.filters ?? null}
        focus={focus}
        onDraftChange={setDraft}
        onAsk={applyFilters}
        onCancel={closeDrawer}
        persistentOnDesktop={answered}
        busy={pending}
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
              disabled={chosen === null || pending}
              aria-busy={pending}
              onClick={() => doAsk(draft)}
              className="fixed inset-x-4 bottom-4 z-10 flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3.5 text-lg font-medium text-white disabled:bg-neutral-300 md:static md:inset-auto md:w-full md:max-w-md"
            >
              {pending && <Spinner />}
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
                modelDisplay={asked.model.display}
                modelKey={asked.model.key}
                filters={asked.filters}
                active={answer.question.active}
                nav={nav}
                onOpenFilters={openFilters}
                onEditingChange={setEditingModel}
              />
            </div>
            {error !== null && <p className="px-4 py-2 text-sm text-neutral-600">{error}</p>}

            <div className={`transition-opacity duration-200 ease-out motion-reduce:transition-none ${dim ? "pointer-events-none select-none opacity-25" : "opacity-100"}`} aria-hidden={dim}>
              {/* §11.3 — the recommendations area, and ONLY it, goes to the placeholders while a navigation
                  this screen started is in flight. The relief button goes with the cards: it belongs to the
                  answer being replaced, and it is a second navigation waiting to be clicked. */}
              {pending ? (
                <PickCardsSkeleton />
              ) : (
                <>
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
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
