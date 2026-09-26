"use client";

// The search screen (BRIEF Days 15–16, Run 2b §5, Run 2c §6 and §8; re-addressed by Run 6b §5 and §9).
//
// TWO STATES, NOW ON TWO ADDRESSES (Run 6b §5):
//   /                      the opening screen — the bar centred, nothing asked
//   /?s=<public_id>        the results of that question, rendered SERVER-SIDE from the stored run and handed
//                          to this component as `initial`
// The URL is no longer a stand-in: every question is a real history entry, so the browser's own back moves
// from a question to the one asked before it, from the first question to the opening screen, and from a car
// page back to the results it was opened from. Day 15's in-page stack (useHistory.ts) keeps ONLY its overlay
// job (§5), and this file no longer pushes "results" entries of its own.
//
// THE TWO STATES THE SCREEN STILL TURNS ON (§5):
//   asked   the question the shown picks answer. The question row shows THIS, always.
//   draft   what the filter controls currently say.
// Pressing "עדכן" is the only commit: one server call, a new `searches` row, and then the address pushes to the
// new question (§5).
//
// RUN 2 (Days 24–25) §3, §4 — FOUR THINGS MOVED HERE, AND THEY ARE ALL ABOUT WHERE A QUESTION IS EDITED:
//
//   the window     FiltersWindow.tsx holds FilterPanel on BOTH devices (§3). The desktop's 320 px side panel
//                  and the phone's sliding sheet are gone, and with them the two-column layout that reserved room
//                  beside the results: the results now take the container's full width (§3.11).
//   the dim        ONLY behind the window — its own backdrop — and, unchanged, while the question row's model
//                  bar is open. A draft no longer dims anything, because a draft is no longer on the screen
//                  behind: it is inside the window (§3.9).
//   the container  every results-screen container is RESULTS_CONTAINER_CLASS: 1,440 with 48px sides, the white
//                  bar's content included, so the bar's items line up with the cards' edges (§2).
//   "עדכן"         the window closes, the row shows the new chips AT ONCE, the page goes to the top, and the
//                  OLD results stay until the answer arrives. The three grey placeholders come only if the
//                  answer takes longer than PLACEHOLDER_DELAY_MS (§4).
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
// ("עדכן", or a model picked from the question row's search bar) until the new screen is on, the white bar and
// the question row stay exactly where they are. The span is one unbroken state — `submitting` from the click
// through the server call, then `useTransition` around the `router.push`, which stays pending until the
// navigation commits — and the two change over in one batch, so it never blinks off between them.
//
// WHAT THAT SPAN NOW SHOWS (Run 2, Days 24–25, §4.2 / §4.3) IS THE OLD RESULTS, not a skeleton. Until this run
// the three grey placeholders went on at the click, so every update — including one answered in 200 ms — flashed
// a grey screen between two real ones. The placeholders are now on a timer: they appear only if the answer has
// not arrived within PLACEHOLDER_DELAY_MS, and the answer replaces whatever is on screen with no transition.
//
// A COLD ARRIVAL (a link, a refresh) GETS NO PLACEHOLDER: the browser's own loading indication, as before
// Run 7. That is the ruled behaviour, not a gap.
//
// THE FILTER GROUPS ARRIVE WITH THE PAGE AND ARE RESOLVED WHERE THIS COMPONENT RENDERS (Run 8b §2). Run 8 had
// the page hand over a RESOLVED set of groups and every edit ask the server for the next one, so each chip
// click waited for a round trip before anything moved — "an unbearable delay that wasn't there before". Now the
// page carries the model's FILTER ROWS (`modelRows`) and this component resolves the groups from them with the
// same pure library: on the server for the first paint, in the browser for every edit after it, memoised on
// its inputs. A chip click and a price edit make NO SERVER CALL at all.
//
// THE ONE CALL LEFT (§2.3) is the model's rows, and only when the active model changes to a model whose rows
// are not in hand — the opening screen's first pick, in practice, since a model chosen on the results screen
// is a new question and arrives with its own page. Every model's rows are then held for the page's life, so
// switching back to one asks nothing.
//
// AND IT DECIDES NOTHING (§1). Every chip's state, every count, the shelf, the release at 0 and the button's
// number come from src/lib/search/chip-state.ts. This file hands the rows and the draft to resolveDrawer(),
// forwards a click to toggleChip(), and commits exactly what the library returns.
//
// RUN 1 (Days 20–21) §4 — the region below the white bar is the site's results container with the boards'
// padding, and its first row is one small grey line, "נבחרו מתוך X רכבים." (§4.1). The headline and the
// institute sentence are GONE — deleted, not hidden (§4.3). Run 2 (Days 24–25) §2 widens that container from
// 1,280 to 1,440 and gives the white bar's content the same class, so the bar's items line up with the cards.
//
// RUN 1 (Days 24–25) §4.1 — THE BOTTOM LIST IS BORN, and it is the only change here: <ResultsList> under the
// three cards, on the phone as on the desktop, drawing the view's `list`. The count line's X now comes from
// that same `list` (§2.2), which is the one place the cars the screen shows are counted.
//
// MOBILE FIRST. Desktop is the widening, and since Run 2 (Days 24–25) §1 the boundary between the two is 900 px
// of window width, declared once in globals.css. `dir="rtl"` is set in layout.tsx, so every inset here is logical.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { applyFilters as sentFilters, draftFromQuestion, isUnchanged, release, resolveDrawer, shelfOf, type ModelRows } from "@/lib/search/chip-state";
import { activeFilterNames, noFilters } from "@/lib/search/filters";
import type { SearchFilters } from "@/lib/search/filters";
import type { LiveModel } from "@/lib/search/models";
import { ask, modelFilterRows, type AskResult, type FilterName } from "@/app/actions/search";
import { BRAND } from "@/lib/brand";
import FilterPanel, { Spinner } from "./FilterPanel";
import FiltersWindow from "./FiltersWindow";
import ModelBar from "./ModelBar";
import PickCards from "./PickCards";
import PickCardsSkeleton from "./PickCardsSkeleton";
import QuestionRow, { type ScreenNav } from "./QuestionRow";
import ResultsList from "@/components/list/ResultsList";
import UncrownedResults from "./UncrownedResults";
import ZeroResults from "./ZeroResults";
import { useScreenHistory } from "./useHistory";
import { FILTER_LABEL, num } from "./labels";
import { countLine } from "@/lib/display/cards";
import { RESULTS_CONTAINER_CLASS } from "@/lib/display/layout";
import { PLACEHOLDER_DELAY_MS } from "@/lib/display/timing";

const SEARCH = "חפש";
const FILTERS = "פילטרים";
const FAILED = "משהו נפל בדרך. נסו שוב.";

// §1.3 — the canonical comparison, now in filters.ts beside the predicate that reads the same fields.
const isEmpty = noFilters;

/** The asked question's model, as the screen needs it: the search string, its key and its display name. */
type AskedModel = { model: string; key: string; display: string };

type Asked = { model: AskedModel; filters: SearchFilters };

export default function SearchScreen({
  models,
  initial = null,
  modelRows = null,
}: {
  models: LiveModel[];
  /** The stored run of `/?s=<public_id>`, rendered on the server. null = the opening screen. */
  initial?: AskResult | null;
  /**
   * Run 8b §2.1 — the asked question's model's live filter rows and km anchors, fetched in the page's own
   * request. Present on every `/?s=` arrival and null on the opening screen, which has no question and
   * therefore no model until one is picked.
   */
  modelRows?: ModelRows | null;
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
  // §1.3 — the window opens on the stored question AS IT IS: draftFromQuestion() is the library's one way in,
  // and it releases nothing — a stored chip that is 0 now is drawn chosen, and the button stays greyed.
  const [draft, setDraft] = useState<SearchFilters>(initial === null ? {} : draftFromQuestion(initial.question.filters));
  const [asked, setAsked] = useState<Asked | null>(askedModel === null || initial === null ? null : { model: askedModel, filters: initial.question.filters });
  const [answer, setAnswer] = useState<AskResult | null>(initial);
  // §2.1 — SEEDED FROM THE PROPS: the active model's rows, which is everything the groups are resolved from.
  // On a `/?s=` arrival they are already here, so the first render draws the groups complete; on the opening
  // screen they are null until a model is chosen.
  const [rows, setRows] = useState<ModelRows | null>(modelRows);
  // §3 — the filters window is open. One state for both devices now: there is no panel that never closes.
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  // §4.3 — THE PLACEHOLDERS ARE ON A TIMER, and the timer is the whole of the rule: it starts on the click, and
  // if it fires before the answer has arrived the three grey cards take the results region. The old results are
  // what is on screen until then (§4.2), and the answer replaces whatever is there.
  //
  // `due` is only half the condition: the grey cards show while a commit is in flight AND the wait has run long.
  // Deriving the second half from `pending` is what makes the state impossible to leave behind — a navigation
  // that commits, whichever control started it, takes the placeholders off without anything having to notice.
  const [due, setDue] = useState(false);
  const waiting = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeholders = pending && due;

  /** The answer arrived, or nothing is on its way after all: the timer is dropped and the grey cards with it. */
  const stopWaiting = useCallback(() => {
    if (waiting.current !== null) {
      clearTimeout(waiting.current);
      waiting.current = null;
    }
    setDue(false);
  }, []);

  /** The click. One timer at a time, and it never restarts once the answer is in (which is why stop is explicit). */
  const startWaiting = useCallback(() => {
    stopWaiting();
    waiting.current = setTimeout(() => {
      waiting.current = null;
      setDue(true);
    }, PLACEHOLDER_DELAY_MS);
  }, [stopWaiting]);

  // The screen is replaced by the new question's own (page.tsx keys it by the address), so a timer still out
  // when that happens has to go with it.
  useEffect(() => {
    const timer = waiting;
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  // §2.3 — two model-rows calls can be in flight if the model is switched twice; only the latest may land.
  const rowsSeq = useRef(0);

  // §2.3 — EVERY MODEL'S ROWS, HELD FOR THE PAGE'S LIFE: a second switch to a model already in hand does not
  // call again. Seeded with the page's own payload, so a `/?s=` arrival starts with nothing to ask for.
  const rowsByKey = useRef<Map<string, ModelRows>>(new Map(modelRows === null ? [] : [[modelRows.model_key, modelRows]]));

  const fail = useCallback((e: unknown) => {
    console.error("[search screen]", e);
    setError(e instanceof Error ? e.message : FAILED);
  }, []);

  const answered = answer !== null && asked !== null;

  // §3.6 — the filters window, and only it: an open one closes AS CANCEL on the browser's back and on the
  // phone's back gesture, and the address does not move.
  const history = useScreenHistory({ onCancelOverlay: () => revertDraft() });

  // The model whose filters are in force: the asked question's, or the one being chosen on the opening screen.
  // The key travels with it because the rows are held by key and `modelKey()` cannot be imported here (it
  // sits beside a Prisma client).
  const activeModel = asked?.model.model ?? chosen?.model ?? null;
  const activeKey = asked?.model.key ?? chosen?.key ?? null;

  // Choosing a model (or un-choosing it by typing over the name) resets everything that is per model. Rows
  // already in hand are put back at once — that model's groups need no call and show no wait (§2.3).
  function chooseModel(m: LiveModel | null) {
    setChosen(m);
    setDraft({});
    setRows(m === null ? null : (rowsByKey.current.get(m.key) ?? null));
  }

  // §2.3 — THE FILTERS' ONE SERVER CALL: the active model's rows, and only when they are not in hand. There
  // is nothing here for a chip click or a price edit — those are resolved in render, in the browser — and
  // nothing to ask for on mount of a results screen, whose rows arrive with the page.
  //
  // While a new model's rows are on their way nothing of the groups is rendered: `rows` is null, so no panel
  // exists until they land, and then it is complete (§2.3 / §0.4 d).
  useEffect(() => {
    if (activeModel === null || activeKey === null) return;
    if (rows?.model_key === activeKey) return;
    const inHand = rowsByKey.current.get(activeKey);
    if (inHand !== undefined) {
      setRows(inHand);
      return;
    }
    const seq = ++rowsSeq.current;
    modelFilterRows({ model: activeModel })
      .then((r) => {
        rowsByKey.current.set(r.model_key, r); // held for the page's life, whether or not it is still wanted
        if (seq !== rowsSeq.current) return; // latest wins; a stale answer is dropped
        setRows(r);
        // §1.2 — A CHANGE OF THE ACTIVE MODEL IS AN EDIT: the library returns the draft after the release,
        // and this commits exactly that. It returns the same object when nothing is released.
        setDraft((d) => release(r.rows, d));
      })
      .catch(fail);
  }, [activeModel, activeKey, rows, fail]);

  // §3 — THE SHELF: the options with stock in the rows plus the ON-SCREEN question's own values, so a stored
  // value never vanishes from the window. Built by the same pure library, from the rows in hand.
  const shelf = useMemo(() => (rows === null ? null : shelfOf(rows, asked?.filters ?? null)), [rows, asked]);

  // §2.2 — THE RESOLVE, WHERE THE COMPONENT RENDERS: on the server for the first paint and in the browser
  // for every edit after it, one pure function, memoised on its inputs. This is what makes a chip click
  // instant — it changes the draft, and the next render has every chip and every count.
  const resolved = useMemo(() => (rows === null || shelf === null ? null : resolveDrawer(rows.rows, shelf, draft)), [rows, shelf, draft]);

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
  const nav: ScreenNav = {
    begin: () => {
      setSubmitting(true);
      startWaiting(); // §4.3 — the same timer for both of this screen's controls
    },
    push: navPush,
    end: () => {
      setSubmitting(false);
      stopWaiting();
    },
  };

  /**
   * THE ONE COMMIT PATH, and Run 2 (Days 24–25) §4.1 puts four things on the click itself, all at once: the
   * window closes with its fade, the question row shows the new chips, the page goes to the top, and the
   * placeholders' timer starts. The results on screen are the OLD ones until the answer lands (§4.2).
   */
  async function doAsk(filters: SearchFilters, model: string | null = activeModel) {
    if (model === null) return;
    setError(null);
    setSubmitting(true);
    startWaiting();

    // §4.1 — the window goes at the click, not when the answer comes back. Its history entry is popped further
    // down, once there is an address to push in its place.
    setFiltersOpen(false);
    setFocus(null);

    // §4.1 — THE QUESTION IS ASKED FROM THIS MOMENT, so the row's chips are the new ones from this moment: it
    // may not show the previous question while the new picks are being fetched. The model cannot change from
    // the filters window, so only the filters move here; a model pick is the question row's own path and
    // arrives with its own page. `before` is what the row goes back to if the call fails — nothing was asked.
    const before = asked;
    if (asked !== null) setAsked({ model: asked.model, filters });
    setDraft(filters);

    // §4.1 — and the page returns to the top, instantly: the old results are still under the bar and the reader
    // has to be at the head of them, not two screens down inside a list that is about to be replaced.
    window.scrollTo(0, 0);

    try {
      const r = await ask({ model, filters: isEmpty(filters) ? undefined : filters });
      // The answer lands first so nothing blinks (§5: no interim screen), and THEN the address pushes as a
      // NEW history entry — never a replace, because every question is one entry of its own (§5). The
      // pushed route renders through loadForAddress(): the run has just written and nothing has changed
      // since, so its stored rows are what comes back and nothing extra is written.
      setAnswer(r);
      stopWaiting(); // §4.3 — the answer is on screen; the grey cards are off the table for this commit
      // The row is already showing this question; this is the model as the LIVE list spells it, which only the
      // answer can give (and the only thing the opening screen's first search has to fill in at all).
      const live = models.find((m) => m.key === r.question.model_key);
      setAsked({ model: { model: r.question.model, key: r.question.model_key, display: live?.display ?? r.question.model }, filters });
      setResetToken((n) => n + 1);
      history.popOverlay(() => navPush(`/?s=${r.public_id}`));
    } catch (e) {
      fail(e); // §6 — one plain line, nothing retried silently
      setSubmitting(false); // the push never happened, so the controls come back
      stopWaiting();
      // Nothing was asked, so the row must not claim it was: the question goes back to the one on screen.
      setAsked(before);
      setDraft(before === null ? {} : draftFromQuestion(before.filters));
    }
  }

  /**
   * Run 7 §1.3 — "עדכן" WITH NO CHANGE IS A CANCEL, on this screen as on the car page. Run 8b §1.4 keeps
   * isUnchanged() as the ONE predicate behind that test and the greyed button: the chosen set plus the typed
   * values against the question the shown picks answer. The model cannot change from this sheet, so it is
   * unchanged by construction. On a match nothing is asked: no ask() call, no new `searches` row, no
   * navigation, and no re-render of the results — it goes down exactly the path the close button goes down.
   * The button is already `disabled` in that state (§3.10, and it was before this run too); this is the belt
   * behind those braces.
   *
   * §2.3 — the one case Run 8 needed a round trip for is now local: a price settled by the very click that
   * pressed the button arrives here unreleased, and `release` over the rows in hand answers it synchronously.
   * There is no call, so there is no race to handle.
   */
  function applyFilters(next: SearchFilters) {
    if (asked !== null && isUnchanged(next, asked.filters)) return closeFilters();
    if (activeModel === null || rows === null) return;
    void doAsk(sentFilters(release(rows.rows, next)), activeModel);
  }

  // §3.6 — CLOSING THE WINDOW WITHOUT "עדכן" IS A CANCEL: the question does not change, nothing is written,
  // there is no navigation, and the draft goes back to the asked question. No diff state survives a close.
  function revertDraft() {
    // §1.3 — a cancel is not an edit: the stored question comes back as it is, through the same one way in.
    setDraft(asked === null ? {} : draftFromQuestion(asked.filters));
    setResetToken((n) => n + 1);
    setFiltersOpen(false);
    setFocus(null);
  }

  /**
   * §3.6 — the close button and the Escape key: a close that is not the browser's back, so it pops the
   * window's own history entry itself. The browser's back arrives at revertDraft() instead, through the hook,
   * because its entry is gone by then.
   */
  function closeFilters() {
    revertDraft();
    history.popOverlay();
  }

  /**
   * §3.3 — a filter chip, "+ פילטרים", and the opening screen's "פילטרים" button: ONE opener, both devices.
   * The window always pushes its history entry now — the desktop panel that never closed, and therefore never
   * needed one, is gone (§3.11).
   */
  function openFilters(on: FilterName | null) {
    setFocus(on);
    setFiltersOpen(true);
    history.pushOverlay("filters");
  }

  // §3.9 — THE DIM RULE, and it is one line shorter than it was: the results dim behind the question row's
  // model bar, as they always have, and behind the filters window — but that dim is the window's own backdrop
  // and not this class. A DRAFT DIMS NOTHING: a draft now lives inside the window, over the backdrop.
  const dim = answered && editingModel;

  /**
   * §6.1 — THE RELIEF CONTROL, unchanged. It was rendered under the row of cards and it is now handed to
   * <ZeroResults>, which centres it under the Day 15 headline: the same markup, the same handler, the same
   * look. `relief` is never set when the cut pool is not empty, so it only ever reaches the zero-results
   * screen; when the action computed no relief the headline stands alone.
   */
  const reliefControl =
    answered && answer.relief !== null ? (
      <div>
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
    ) : null;
  // §1.4 — the button's number is the pool under the draft as it stands. Before a model is chosen on the
  // opening screen there is none, and the button carries no number at all, exactly as it did before.
  const poolNow = resolved?.total ?? answer?.pool_count ?? null;

  const panel =
    resolved === null || rows === null ? null : (
      <FilterPanel
        key={`${rows.model_key}-${resetToken}`}
        pool={rows.rows}
        resolved={resolved}
        draft={draft}
        poolNow={poolNow}
        stored={asked?.filters ?? null}
        focus={focus}
        onDraftChange={setDraft}
        onAsk={applyFilters}
        busy={pending}
      />
    );

  return (
    <main className="flex min-h-screen flex-col">
      {/* §3 / §3.11 — THE FILTERS, IN ONE PLACE AND IN FRONT OF THE SCREEN, on both devices. There is no
          column reserved beside the results any more and no sheet sliding over them: the window is a modal
          <dialog> in the top layer, so it sits here at the end of the screen and nothing about the order of
          this tree can put anything in front of it. */}
      <FiltersWindow open={filtersOpen} onCancel={closeFilters}>
        {panel}
      </FiltersWindow>

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
            {/* §6 — the question row, inside the white top bar beside the brand name.
                RUN 2 (Days 24–25) §2.2 — the white and its bottom border run the full width of the window, as
                they always have; the CONTENT is now the results screen's own container, so the brand, the
                model and the chips line up with the cards' outer edges at every width. This is the car page's
                rule (CarPageView.tsx), which the results screen did not have. */}
            <div className="sticky top-0 z-30 border-b border-[#d8d3cb] bg-white">
              <div className={`${RESULTS_CONTAINER_CLASS} flex items-center gap-4 px-4 py-3`}>
                {/* §6 — the brand name never moves and never wraps; the row scrolls sideways beside it. */}
                <Link href="/" className="shrink-0 whitespace-nowrap text-[17px] font-extrabold text-[#221f1c]">
                  {BRAND.name}
                </Link>
                {/* §4.1 — `active` is derived from the ASKED question and no longer read off the answer, so
                    that a click on "עדכן" moves the chips at once instead of when the new picks come back. It
                    is the same one function the action and the page build it with (filters.ts). */}
                <QuestionRow
                  models={models}
                  modelDisplay={asked.model.display}
                  modelKey={asked.model.key}
                  filters={asked.filters}
                  active={activeFilterNames(asked.filters) as FilterName[]}
                  nav={nav}
                  onOpenFilters={openFilters}
                  onEditingChange={setEditingModel}
                />
              </div>
            </div>
            {error !== null && <p className="px-4 py-2 text-sm text-neutral-600">{error}</p>}

            <div className={`transition-opacity duration-200 ease-out motion-reduce:transition-none ${dim ? "pointer-events-none select-none opacity-25" : "opacity-100"}`} aria-hidden={dim}>
              {/* RUN 2 (Days 20–21) §7.1 — THE RESULTS REGION RENDERS BY `answer.state`:
                    crowned                  the count line and <PickCards>, exactly as Run 1 left them, in
                                             the results container (Days 24–25 §2: 1,440, 48px sides, 1,344)
                    uncrowned / zero_scored  <UncrownedResults>, which brings its own padding and gap (§5)
                    zero_results             <ZeroResults>, centred in the window's remaining height (§6)
                  RUN 2 (Days 24–25) §4.2 / §4.3 — AND THE FORK IS ENTERED ON EVERY WAIT TOO. The placeholders
                  no longer stand above it on `pending`: while a commit is in flight the OLD results are on
                  screen, and only a wait longer than PLACEHOLDER_DELAY_MS puts the three grey cards there. */}
              {placeholders ? (
                <div className={`${RESULTS_CONTAINER_CLASS} flex flex-col gap-5 px-4 pt-6 pb-10 md:pt-8`}>
                  <PickCardsSkeleton />
                </div>
              ) : answer.state === "zero_results" ? (
                // §6.1 — the relief control exactly as it exists today: its markup, its handler and its look
                // untouched, only moved into the centred block. Nothing else is in the region — no count line.
                <ZeroResults relief={reliefControl} />
              ) : answer.state === "crowned" ? (
                <div className={`${RESULTS_CONTAINER_CLASS} flex flex-col gap-5 px-4 pt-6 pb-10 md:pt-8`}>
                  {/* §3.3 — the count line belongs to the crowned screen alone. Days 24–25 §2.2 — its X is
                      `list.x`, the one place the cars the screen shows are counted. */}
                  <p className="m-0 text-[14px] md:text-[16px]" style={{ color: "#665f58" }}>
                    {countLine(answer.list.x)}
                  </p>
                  <PickCards answer={answer} />
                  {/* Days 24–25 §4.1 — THE BOTTOM LIST, directly below the three cards, on the phone as on the
                      desktop. It was empty here until this run. */}
                  <ResultsList list={answer.list} />
                </div>
              ) : (
                <UncrownedResults answer={answer} />
              )}
            </div>
          </>
        )}
    </main>
  );
}
