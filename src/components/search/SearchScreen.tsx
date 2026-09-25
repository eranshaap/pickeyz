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
// THE DRAWER ARRIVES WITH THE PAGE AND IS RESOLVED WHERE THIS COMPONENT RENDERS (Run 8b §2). Run 8 had the
// page hand over a RESOLVED drawer and every edit ask the server for the next one, so each chip click waited
// for a round trip before anything moved — "an unbearable delay that wasn't there before". Now the page
// carries the model's FILTER ROWS (`modelRows`) and this component resolves the drawer from them with the
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
// RUN 1 (Days 20–21) §4 — WHAT CHANGED HERE, AND IT IS THE RESULTS REGION ONLY: the region below the white
// bar is now the site's 1280 container with the boards' padding (§4.2 — content 1184, as on the car page),
// and its first row is one small grey line, "נבחרו מתוך X רכבים." (§4.1). The headline and the institute
// sentence are GONE — deleted, not hidden (§4.3) — and NOTHING renders under the row of cards: the bottom
// list is Days 24–25. The question row, the drawer, the filters, the dimming rule and the whole "עדכן"
// machinery are untouched (§4.4); the white bar still runs the full width of this column.
//
// MOBILE FIRST. Desktop is the widening: the drawer becomes a panel that never closes (and therefore has no
// history entry of its own). `dir="rtl"` is set in layout.tsx, so every inset here is logical.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { applyFilters as sentFilters, draftFromQuestion, isUnchanged, release, resolveDrawer, shelfOf, type ModelRows } from "@/lib/search/chip-state";
import { noFilters, sameFilters } from "@/lib/search/filters";
import type { SearchFilters } from "@/lib/search/filters";
import type { LiveModel } from "@/lib/search/models";
import { ask, modelFilterRows, type AskResult, type FilterName } from "@/app/actions/search";
import { BRAND } from "@/lib/brand";
import FilterPanel, { Spinner } from "./FilterPanel";
import ModelBar from "./ModelBar";
import PickCards from "./PickCards";
import PickCardsSkeleton from "./PickCardsSkeleton";
import QuestionRow, { type ScreenNav } from "./QuestionRow";
import { useScreenHistory } from "./useHistory";
import { FILTER_LABEL, num } from "./labels";
import { countLine } from "@/lib/display/cards";

const SEARCH = "חפש";
const FILTERS = "פילטרים";
const FAILED = "משהו נפל בדרך. נסו שוב.";

// §1.3 — the canonical comparison, now in filters.ts beside the predicate that reads the same fields.
const same = sameFilters;
const isEmpty = noFilters;

// §8 — the desktop panel never closes, so it never gets a history entry. Everything else that opens does.
const isDesktop = (): boolean => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

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
  // §1.3 — the drawer opens on the stored question AS IT IS: draftFromQuestion() is the library's one way in,
  // and it releases nothing — a stored chip that is 0 now is drawn chosen, and the button stays greyed.
  const [draft, setDraft] = useState<SearchFilters>(initial === null ? {} : draftFromQuestion(initial.question.filters));
  const [asked, setAsked] = useState<Asked | null>(askedModel === null || initial === null ? null : { model: askedModel, filters: initial.question.filters });
  const [answer, setAnswer] = useState<AskResult | null>(initial);
  // §2.1 — SEEDED FROM THE PROPS: the active model's rows, which is everything the drawer is resolved from.
  // On a `/?s=` arrival they are already here, so the first render draws the drawer complete; on the opening
  // screen they are null until a model is chosen.
  const [rows, setRows] = useState<ModelRows | null>(modelRows);
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

  // §5 — the drawer, and only the drawer: an open one closes AS CANCEL on back and the address does not move.
  const history = useScreenHistory({ onCancelOverlay: () => revertDraft() });

  // The model whose drawer is in force: the asked question's, or the one being chosen on the opening screen.
  // The key travels with it because the rows are held by key and `modelKey()` cannot be imported here (it
  // sits beside a Prisma client).
  const activeModel = asked?.model.model ?? chosen?.model ?? null;
  const activeKey = asked?.model.key ?? chosen?.key ?? null;

  // Choosing a model (or un-choosing it by typing over the name) resets everything that is per model. Rows
  // already in hand are put back at once — that model's drawer needs no call and shows no wait (§2.3).
  function chooseModel(m: LiveModel | null) {
    setChosen(m);
    setDraft({});
    setRows(m === null ? null : (rowsByKey.current.get(m.key) ?? null));
  }

  // §2.3 — THE DRAWER'S ONE SERVER CALL: the active model's rows, and only when they are not in hand. There
  // is nothing here for a chip click or a price edit — those are resolved in render, in the browser — and
  // nothing to ask for on mount of a results screen, whose rows arrive with the page.
  //
  // While a new model's rows are on their way the drawer shows what it showed during Run 8's call: `rows` is
  // null, so no panel is rendered at all until they land, and then it is complete (§2.3 / §0.4 d).
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
  // value never vanishes from the drawer. Built by the same pure library, from the rows in hand.
  const shelf = useMemo(() => (rows === null ? null : shelfOf(rows, asked?.filters ?? null)), [rows, asked]);

  // §2.2 — THE RESOLVE, WHERE THE COMPONENT RENDERS: on the server for the first paint and in the browser
  // for every edit after it, one pure function, memoised on its inputs. This is what makes a chip click
  // instant — it changes the draft, and the next render has the whole drawer.
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
   * Run 7 §1.3 — "עדכן" WITH NO CHANGE IS A CANCEL, on this screen as on the car page. Run 8b §1.4 keeps
   * isUnchanged() as the ONE predicate behind that test and the greyed button: the chosen set plus the typed
   * values against the question the shown picks answer. The model cannot change from this sheet, so it is
   * unchanged by construction. On a match nothing is asked: no ask() call, no new `searches` row, no
   * navigation, and no re-render of the results — it goes down exactly the path the X and the backdrop go
   * down. The button is already `disabled` in that state; this is the belt behind those braces.
   *
   * §2.3 — the one case Run 8 needed a round trip for is now local: a price settled by the very click that
   * pressed the button arrives here unreleased, and `release` over the rows in hand answers it synchronously.
   * There is no call, so there is no race to handle.
   */
  function applyFilters(next: SearchFilters) {
    if (asked !== null && isUnchanged(next, asked.filters)) return closeDrawer();
    if (activeModel === null || rows === null) return;
    void doAsk(sentFilters(release(rows.rows, next)), activeModel);
  }

  // Closing the drawer without "עדכן" is a CANCEL (§5): the draft goes back to the asked question and the
  // results are live again. No diff state survives a close.
  function revertDraft() {
    // §1.3 — a cancel is not an edit: the stored question comes back as it is, through the same one way in.
    setDraft(asked === null ? {} : draftFromQuestion(asked.filters));
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
              {/* Run 1 (Days 20–21) §4.2 — THE RESULTS REGION: the site's 1280 container, centred, with the
                  48px sides and `padding: 32px 48px 40px`; the content is therefore 1184 wide, as on the car
                  page. The phone's is `24px 16px` (§5). The white bar above stays OUTSIDE it and keeps running
                  the full width of the column, exactly as it does today (§4.4).
                  §4.1 — the count line, then 20px, then the row. NOTHING ELSE, and nothing at all under the
                  row: the headline and the institute sentence are gone (§4.3) and the bottom list is
                  Days 24–25. */}
              <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 pt-6 pb-10 md:px-12 md:pt-8">
                {/* §4.1 / §5 — "נבחרו מתוך X רכבים." and no headline above it. */}
                <p className="m-0 text-[14px] md:text-[16px]" style={{ color: "#665f58" }}>
                  {countLine(answer.cars_shown)}
                </p>

                {/* §11.3 — the recommendations area, and ONLY it, goes to the placeholders while a navigation
                    this screen started is in flight. The relief button goes with the cards: it belongs to the
                    answer being replaced, and it is a second navigation waiting to be clicked. */}
                {pending ? (
                  <PickCardsSkeleton />
                ) : (
                  <>
                    <PickCards answer={answer} />

                    {/* §0.5 — one relief suggestion, and only when the pool came back empty. §8 — the
                        zero-results screen is Run 2's and stays exactly as it is; `relief` is never set when
                        the cut pool is not empty, so nothing renders under the row of a search with cards. */}
                    {answer.relief !== null && (
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
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
