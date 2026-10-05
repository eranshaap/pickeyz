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
// THE CALL THAT WAS LEFT (§2.3) — the model's rows on the opening screen's first pick — IS GONE (S2 §5): a
// choice on the opening screen now searches at once, and every question arrives with its own page and its
// own rows.
//
// AND IT DECIDES NOTHING (§1). Every chip's state, every count, the shelf, the release at 0 and the button's
// number come from src/lib/search/chip-state.ts. This file hands the rows and the draft to resolveFilters(),
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
//
// S4 §2–§3 — THE SEARCH MOMENT. A search from the opening screen starts its request at once and puts the results
// frame in place UNDER the opening screen, invisible and inert: the top bar with the question row showing the
// asked model's full name, the hairline and "+ פילטרים" kept in place but not shown. Then, on timers:
//   0 – OPENING_FADE_MS         the opening screen's content fades out (OpeningScreen's `leaving`); <Flight>
//                               draws a copy of the bar (or the phone's field) where it was
//   … + BAR_RISE_MS             the copy rises and shrinks onto the model's name in the invisible frame — the
//                               name's place is measured there with getBoundingClientRect(), so the `--s` scale
//                               is in the numbers; the white, the border and the shadow fade, "חפש" goes, and
//                               the bar's text crosses into the name's own text
//   … + RESULTS_ENTER_MS        the frame is on and in the flow, the opening screen is gone, and "+ פילטרים", the
//                               count line and the cards fade in
// The motion always runs to its end: an answer that comes during it is drawn in the hidden frame and the push
// waits for the end (the push replaces this screen with the address's own, so an early one would cut the
// motion off); an answer that has not come by then leaves the placeholders — the count line's strip and the
// three cards — in the area, with no PLACEHOLDER_DELAY_MS wait. A device that asks for less motion gets none:
// the opening screen is replaced by the frame and its placeholders. "Back" to the opening screen is a plain swap.
//
// S4 §4 — EVERY LOAD OF THE RESULTS SCREEN CAN FAIL, and fails the same way: from the opening screen, from another
// model chosen in the question row (whose search now runs here, `nav.ask`), and from "עדכן". A load that throws,
// or has no answer RESULTS_LOAD_TIMEOUT_MS after it started, puts <SearchFailed> in the results area; the row
// keeps the question that was asked (nothing rolls back), and "נסה שוב" asks it again. Each load has a number
// (`loadSeq`); a timeout, and any newer load, moves the number on, so an answer that comes for an older number is
// ignored.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { applyFilters as sentFilters, draftFromQuestion, isUnchanged, release, resolveFilters, shelfOf, type ModelRows } from "@/lib/search/chip-state";
import { activeFilterNames, noFilters } from "@/lib/search/filters";
import type { SearchFilters } from "@/lib/search/filters";
import { fullName, type FamilyEntry } from "@/lib/opening/completion";
import { OPENING_TEXTS } from "@/lib/opening/texts";
import { ask, type AskResult, type FilterName } from "@/app/actions/search";
import { BRAND } from "@/lib/brand";
import FilterPanel from "./FilterPanel";
import FiltersWindow from "./FiltersWindow";
import OpeningScreen, { boxOf, textMarkOf, type Box, type Origin, type TextMark } from "./OpeningScreen";
import PickCards from "./PickCards";
import PickCardsSkeleton, { CountLineSkeleton } from "./PickCardsSkeleton";
import QuestionRow, { type ScreenNav } from "./QuestionRow";
import ResultsList from "@/components/list/ResultsList";
import SearchFailed from "./SearchFailed";
import UncrownedResults from "./UncrownedResults";
import ZeroResults from "./ZeroResults";
import { recordOpeningFamily, useScreenHistory } from "./useHistory";
import { FILTER_LABEL, num } from "./labels";
import { countLine } from "@/lib/display/cards";
import { RESULTS_CONTAINER_CLASS } from "@/lib/display/layout";
import { BAR_RISE_MS, OPENING_FADE_MS, PLACEHOLDER_DELAY_MS, RESULTS_ENTER_MS, RESULTS_LOAD_TIMEOUT_MS } from "@/lib/display/timing";

const INK = "#221f1c"; // BLACK in src/lib/display/texts.ts — the site's ink

/**
 * S4 §2.4 — the results come in over RESULTS_ENTER_MS. The duration is spelled twice of necessity (FiltersWindow.tsx's
 * rule): the map is indexed BY the constant, so changing it without a class to match stops the compile.
 */
const ENTER_DURATION: Record<typeof RESULTS_ENTER_MS, string> = { 150: "duration-150" };
const ENTER = `transition-opacity ease-out ${ENTER_DURATION[RESULTS_ENTER_MS]} motion-reduce:transition-none`;

/** S4 §2 — the rise's curve: a quick start that settles onto the name. */
const RISE_EASING = "cubic-bezier(0.2, 0, 0, 1)";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// §1.3 — the canonical comparison, now in filters.ts beside the predicate that reads the same fields.
const isEmpty = noFilters;

/** S2 — the asked question's model, as the screen needs it: its family and the name the row shows. */
type AskedModel = { familyId: number; display: string };

type Asked = { model: AskedModel; filters: SearchFilters };

/** S4 §2 — the search moment: where the rise starts, and how far the timers have taken it. */
type Moment = { origin: Origin; stage: "fade" | "rise" | "land" };

export default function SearchScreen({
  families,
  initial = null,
  modelRows = null,
}: {
  /** S2 §5 — barFamilies(), loaded once in page.tsx: what both bars offer. */
  families: FamilyEntry[];
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

  // S2 §3 — the asked family and its full Hebrew name, as the page or the action resolved them.
  const askedModel: AskedModel | null = initial === null ? null : { familyId: initial.question.family_id, display: initial.question.display };

  // §1.3 — the window opens on the stored question AS IT IS: draftFromQuestion() is the library's one way in,
  // and it releases nothing — a stored chip that is 0 now is drawn chosen, and the button stays greyed.
  const [draft, setDraft] = useState<SearchFilters>(initial === null ? {} : draftFromQuestion(initial.question.filters));
  const [asked, setAsked] = useState<Asked | null>(askedModel === null || initial === null ? null : { model: askedModel, filters: initial.question.filters });
  const [answer, setAnswer] = useState<AskResult | null>(initial);
  // §2.1 — FROM THE PROPS: the asked family's rows, which is everything the groups are resolved from. On a
  // `/?s=` arrival they are already here, so the first render draws the groups complete. S2 §5: the opening
  // screen has none and asks for none — a choice there searches at once, and the rows come with the results.
  const rows: ModelRows | null = modelRows;
  // §3 — the filters window is open. One state for both devices now: there is no panel that never closes.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingModel, setEditingModel] = useState(false); // §6 — the question row's search bar is open
  const [focus, setFocus] = useState<FilterName | null>(null);
  const [resetToken, setResetToken] = useState(0);

  // S4 §4 — the last load failed (threw, or timed out): the results area shows <SearchFailed> until a load lands.
  const [failed, setFailed] = useState(false);
  // S4 §4 — every load's number; an answer for an older number is ignored. A timeout moves it on too.
  const loadSeq = useRef(0);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  // S4 §4 — what "נסה שוב" asks again: the last load's family and filters.
  const lastAsk = useRef<Asked | null>(null);

  // S4 §2 — the search moment, its timers, and what resolves once it has run to its end.
  const [moment, setMoment] = useState<Moment | null>(null);
  const motionTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const motionDone = useRef<(() => void) | null>(null);
  // S4 §2 — the model's name in the question row: where the rise lands.
  const modelName = useRef<HTMLButtonElement>(null);

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
    const limit = deadline;
    const motion = motionTimers;
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (limit.current !== null) clearTimeout(limit.current);
      for (const t of motion.current) clearTimeout(t);
    };
  }, []);

  /** S4 §4 — the load's timeout is off: it answered, failed, or was left. */
  const dropDeadline = useCallback(() => {
    if (deadline.current !== null) {
      clearTimeout(deadline.current);
      deadline.current = null;
    }
  }, []);

  /** S4 §4 — the load failed: the area shows <SearchFailed>, the controls come back, and the row stays as asked. */
  const failLoad = useCallback(
    (e: unknown) => {
      console.error("[search screen]", e);
      dropDeadline();
      setFailed(true);
      setSubmitting(false);
      stopWaiting();
    },
    [dropDeadline, stopWaiting],
  );

  // §3.6 — the filters window, and only it: an open one closes AS CANCEL on the browser's back and on the
  // phone's back gesture, and the address does not move.
  const history = useScreenHistory({ onCancelOverlay: () => revertDraft() });

  // S4 — the rows in hand are the page's, for the family it was rendered for. Until the next page arrives (after
  // the opening screen's search, or after another model was picked — failed or still on its way) they are not
  // the asked family's, and the filters window may not be opened on them: "+ פילטרים" is disabled.
  const rowsFit = rows !== null && initial !== null && asked !== null && initial.question.family_id === asked.model.familyId;

  // S2 §5 — the opening screen's bar: S3 §3 moved its state into OpeningScreen, which now holds "חפש" too.

  // §3 — THE SHELF: the options with stock in the rows plus the ON-SCREEN question's own values, so a stored
  // value never vanishes from the window. Built by the same pure library, from the rows in hand.
  const shelf = useMemo(() => (rows === null ? null : shelfOf(rows, asked?.filters ?? null)), [rows, asked]);

  // §2.2 — THE RESOLVE, WHERE THE COMPONENT RENDERS: on the server for the first paint and in the browser
  // for every edit after it, one pure function, memoised on its inputs. This is what makes a chip click
  // instant — it changes the draft, and the next render has every chip and every count.
  const resolved = useMemo(() => (rows === null || shelf === null ? null : resolveFilters(rows.rows, shelf, draft)), [rows, shelf, draft]);

  /**
   * §11.3 — the push, and the only one this screen makes. It runs inside a transition, so React holds the
   * pending state until the navigation has actually committed; `submitting` is dropped in the SAME batch,
   * which is what makes the click → action → push → new screen span one unbroken busy state.
   */
  function navPush(href: string) {
    setSubmitting(false);
    startNav(() => router.push(href));
  }

  /** S2 / S4 §4 — a family chosen in a bar, as the row shows it before the answer names it: its full name. */
  function modelOf(familyId: number): AskedModel {
    const f = families.find((x) => x.id === familyId);
    if (f === undefined) throw new Error(`[search screen] family ${familyId} was chosen and is not among the bar's families`);
    return { familyId, display: fullName(f) };
  }

  /** §11.3 / S4 §4 — the question row's model pick: a new question from zero, asked by this screen. */
  const nav: ScreenNav = { ask: (familyId) => void doAsk({}, modelOf(familyId)) };

  /**
   * THE ONE COMMIT PATH, and Run 2 (Days 24–25) §4.1 puts four things on the click itself, all at once: the
   * window closes with its fade, the question row shows the new chips, the page goes to the top, and the
   * placeholders' timer starts. The results on screen are the OLD ones until the answer lands (§4.2).
   *
   * S4 — every load goes through here: the opening screen's (with `motion`, the search moment's end), the
   * question row's model pick, "עדכן", the relief control and "נסה שוב". With `motion` there is no
   * PLACEHOLDER_DELAY_MS timer: the placeholders are what the area holds at the motion's end if nothing came.
   */
  async function doAsk(filters: SearchFilters, model: AskedModel, motion: Promise<void> | null = null) {
    const id = ++loadSeq.current;
    lastAsk.current = { model, filters };
    setSubmitting(true);
    if (motion === null) startWaiting();

    // S4 §4 — the load's limit. When it passes with no answer this load's number is moved on, so an answer
    // that still comes for it is ignored, and the area shows the failure.
    dropDeadline();
    deadline.current = setTimeout(() => {
      deadline.current = null;
      if (loadSeq.current !== id) return;
      loadSeq.current++;
      failLoad(new Error(`no answer ${RESULTS_LOAD_TIMEOUT_MS} ms after the request started (family ${model.familyId})`));
    }, RESULTS_LOAD_TIMEOUT_MS);

    // §4.1 — the window goes at the click, not when the answer comes back. Its history entry is popped further
    // down, once there is an address to push in its place.
    setFiltersOpen(false);
    setFocus(null);

    // §4.1 — THE QUESTION IS ASKED FROM THIS MOMENT, so the row shows it from this moment: it may not show the
    // previous question while the new picks are being fetched. S4 §4: and it keeps showing it if the load
    // fails — nothing rolls back; the failure is in the results area.
    setAsked({ model, filters });
    setDraft(filters);

    // §4.1 — and the page returns to the top, instantly: the old results are still under the bar and the reader
    // has to be at the head of them, not two screens down inside a list that is about to be replaced.
    window.scrollTo(0, 0);

    try {
      const r = await ask({ familyId: model.familyId, filters: isEmpty(filters) ? undefined : filters });
      if (loadSeq.current !== id) return; // S4 §4 — it timed out, or a newer load replaced it: ignored
      dropDeadline();
      // The answer lands first so nothing blinks (§5: no interim screen), and THEN the address pushes as a
      // NEW history entry — never a replace, because every question is one entry of its own (§5). The
      // pushed route renders through loadForAddress(): the run has just written and nothing has changed
      // since, so its stored rows are what comes back and nothing extra is written.
      setAnswer(r);
      setFailed(false);
      stopWaiting(); // §4.3 — the answer is on screen; the grey cards are off the table for this commit
      // The row is already showing this question; this is the family and its full name as the answer gives them.
      setAsked({ model: { familyId: r.question.family_id, display: r.question.display }, filters });
      setResetToken((n) => n + 1);
      // S4 §2.5 — an answer that came during the search moment waits for its end: the push replaces this screen.
      if (motion !== null) await motion;
      if (loadSeq.current !== id) return;
      // S3 §5 — a question asked while the address is still the opening screen's: its entry remembers the
      // family before the address moves, so the browser's back returns to a bar that shows it.
      if (initial === null) recordOpeningFamily(r.question.family_id);
      history.popOverlay(() => navPush(`/?s=${r.public_id}`));
    } catch (e) {
      if (loadSeq.current !== id) {
        console.error("[search screen] a load that had timed out or been replaced failed afterwards — ignored:", e);
        return;
      }
      failLoad(e); // S4 §4 — the failure is shown in the results area, nothing retried silently
    }
  }

  /** S4 §4 — "נסה שוב": the same family and filters again; placeholders after PLACEHOLDER_DELAY_MS, no motion. */
  function retry() {
    const last = lastAsk.current;
    if (last === null) throw new Error("[search screen] נסה שוב with no load behind it");
    void doAsk(last.filters, last.model);
  }

  /** S4 §2 — the search moment's timers; resolves when the motion has run to its end. */
  function runMotion(): Promise<void> {
    return new Promise((resolve) => {
      motionDone.current = resolve;
      const at = (ms: number, then: () => void) => motionTimers.current.push(setTimeout(then, ms));
      at(OPENING_FADE_MS, () => setMoment((m) => (m === null ? null : { ...m, stage: "rise" })));
      at(OPENING_FADE_MS + BAR_RISE_MS, () => setMoment((m) => (m === null ? null : { ...m, stage: "land" })));
      at(OPENING_FADE_MS + BAR_RISE_MS + RESULTS_ENTER_MS, () => {
        motionTimers.current = [];
        setMoment(null);
        const done = motionDone.current;
        motionDone.current = null;
        done?.();
      });
    });
  }

  /**
   * S4 §2 / §3 — a model chosen on the opening screen. The request starts at once; the motion runs beside it,
   * unless the device asks for less motion (§2.7), when the opening screen simply gives way to the frame.
   */
  function askFromOpening(familyId: number, origin: Origin) {
    const model = modelOf(familyId);
    if (window.matchMedia(REDUCED_MOTION).matches) {
      void doAsk({}, model);
      return;
    }
    setMoment({ origin, stage: "fade" });
    void doAsk({}, model, runMotion());
  }

  /**
   * S4 — the brand link while the address is still the opening screen's (a search from it failed, or is on its
   * way): the link leads to the same address, so the screen goes back to the opening screen itself, a plain
   * swap. Whatever load was out is left, and its answer ignored.
   */
  function backToOpening() {
    loadSeq.current++;
    dropDeadline();
    stopWaiting();
    setSubmitting(false);
    setFailed(false);
    setAnswer(null);
    setAsked(null);
    setDraft({});
    lastAsk.current = null;
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
    if (asked === null || rows === null) return;
    void doAsk(sentFilters(release(rows.rows, next)), asked.model);
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
   * §3.3 — a filter chip and "+ פילטרים": ONE opener, both devices (S2 §5: the opening screen has no button).
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
  const dim = asked !== null && editingModel;

  /**
   * §6.1 — THE RELIEF CONTROL, unchanged. It was rendered under the row of cards and it is now handed to
   * <ZeroResults>, which centres it under the Day 15 headline: the same markup, the same handler, the same
   * look. `relief` is never set when the cut pool is not empty, so it only ever reaches the zero-results
   * screen; when the action computed no relief the headline stands alone.
   */
  const reliefControl =
    answer !== null && asked !== null && answer.relief !== null ? (
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
            void doAsk(next, asked.model);
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
    resolved === null || rows === null || !rowsFit ? null : (
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

  // S4 §2 — until the motion lands, the results frame is under the opening screen, invisible and inert.
  const cloaked = moment !== null && moment.stage !== "land";

  return (
    <main className="relative flex min-h-screen flex-col">
      {/* §3 / §3.11 — THE FILTERS, IN ONE PLACE AND IN FRONT OF THE SCREEN, on both devices. There is no
          column reserved beside the results any more and no sheet sliding over them: the window is a modal
          <dialog> in the top layer, so it sits here at the end of the screen and nothing about the order of
          this tree can put anything in front of it. */}
      <FiltersWindow open={filtersOpen} onCancel={closeFilters}>
        {panel}
      </FiltersWindow>

        {/* S3 §3 — THE OPENING SCREEN, while there is no question, and NOT RENDERED AT ALL after one: Run 2b's
            collapsed block (invisible + inert, so its pinned "חפש" could not be tapped under the results) is
            gone with it — nothing of the opening screen is left in the page to click, focus, or sit fixed over
            the results. A choice there asks at once, from zero (S2 §5). S4 §2: it stays over the hidden results
            frame while the search moment runs, and is removed when the motion lands. */}
        {(asked === null || cloaked) && <OpeningScreen families={families} pending={pending} leaving={moment !== null} onAsk={askFromOpening} />}

        {asked !== null && (
          <div inert={cloaked} aria-hidden={cloaked || undefined} className={cloaked ? "pointer-events-none absolute inset-x-0 top-0 opacity-0" : "contents"}>
            {/* §6 — the question row, inside the white top bar beside the brand name.
                RUN 2 (Days 24–25) §2.2 — the white and its bottom border run the full width of the window, as
                they always have; the CONTENT is now the results screen's own container, so the brand, the
                model and the chips line up with the cards' outer edges at every width. This is the car page's
                rule (CarPageView.tsx), which the results screen did not have. */}
            <div className="sticky top-0 z-30 border-b border-[#d8d3cb] bg-white">
              <div className={`${RESULTS_CONTAINER_CLASS} flex items-center gap-4 px-4 py-3`}>
                {/* §6 — the brand name never moves and never wraps; the row scrolls sideways beside it. */}
                <Link href="/" onClick={initial === null ? backToOpening : undefined} className="shrink-0 whitespace-nowrap text-[17px] font-extrabold text-[#221f1c]">
                  {BRAND.name}
                </Link>
                {/* §4.1 — `active` is derived from the ASKED question and no longer read off the answer, so
                    that a click on "עדכן" moves the chips at once instead of when the new picks come back. It
                    is the same one function the action and the page build it with (filters.ts). */}
                <QuestionRow
                  families={families}
                  modelDisplay={asked.model.display}
                  familyId={asked.model.familyId}
                  filters={asked.filters}
                  active={activeFilterNames(asked.filters) as FilterName[]}
                  nav={nav}
                  onOpenFilters={openFilters}
                  onEditingChange={setEditingModel}
                  modelRef={modelName}
                  filtersHidden={cloaked}
                  canAddFilters={rowsFit}
                />
              </div>
            </div>

            {/* S4 §2.4 — the results area comes in when the motion lands. */}
            <div className={`${ENTER} ${cloaked ? "opacity-0" : "opacity-100"}`}>
            <div className={`transition-opacity duration-200 ease-out motion-reduce:transition-none ${dim ? "pointer-events-none select-none opacity-25" : "opacity-100"}`} aria-hidden={dim}>
              {/* RUN 2 (Days 20–21) §7.1 — THE RESULTS REGION RENDERS BY `answer.state`:
                    crowned                  the count line and <PickCards>, exactly as Run 1 left them, in
                                             the results container (Days 24–25 §2: 1,440, 48px sides, 1,344)
                    uncrowned / zero_scored  <UncrownedResults>, which brings its own padding and gap (§5)
                    zero_results             <ZeroResults>, centred in the window's remaining height (§6)
                  RUN 2 (Days 24–25) §4.2 / §4.3 — AND THE FORK IS ENTERED ON EVERY WAIT TOO. The placeholders
                  no longer stand above it on `pending`: while a commit is in flight the OLD results are on
                  screen, and only a wait longer than PLACEHOLDER_DELAY_MS puts the three grey cards there.
                  S4 §4 — a failed load shows <SearchFailed> in their place, until the next load's placeholders
                  or its answer; and S4 §2.5 — a frame with no answer yet (the opening screen's search) holds the
                  placeholders from the start. */}
              {placeholders ? (
                <Placeholders />
              ) : failed ? (
                <SearchFailed onRetry={retry} busy={pending} />
              ) : answer === null ? (
                <Placeholders />
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
            </div>
          </div>
        )}

        {/* S4 §2 / §3 — the rising bar, over everything until the motion lands. After the frame in the tree, so
            the name it lands on is mounted and measurable when it is placed. */}
        {cloaked && asked !== null && <Flight origin={moment.origin} display={asked.model.display} rising={moment.stage === "rise"} landOn={modelName} />}
    </main>
  );
}

/** S4 §2.5 — the results area's placeholders: the count line's strip and the three grey cards. */
function Placeholders() {
  return (
    <div className={`${RESULTS_CONTAINER_CLASS} flex flex-col gap-5 px-4 pt-6 pb-10 md:pt-8`}>
      <CountLineSkeleton />
      <PickCardsSkeleton />
    </div>
  );
}

const px = (b: Box) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });

/** Where the bar's text starts, as a transform of the name's text placed on the name. */
const fromBar = (bar: TextMark, name: TextMark) => `translate(${bar.right - name.right}px, ${bar.midY - name.midY}px) scale(${bar.fontSize / name.fontSize})`;

/**
 * S4 §2 / §3 — THE RISE. A copy of the bar (the computer's pill with "חפש", the phone's pill or full-screen field)
 * drawn where the bar was, and its text. On mount the name it lands on is measured in the hidden frame and the
 * text is PLACED THERE, in the name's own size, weight and line height, then transformed back onto the bar's text
 * (translate + scale, from the text's start edge): so the end of the rise is the name exactly, with no transform
 * at all. The text is two layers in one box — the bar's weight and the name's — that cross-fade on the way. The
 * pill shrinks onto the name's box and fades out; "חפש" goes in the first third. Web Animations, not state: the
 * rise is BAR_RISE_MS of compositor work, and the screen's timers decide when it starts and when it is removed.
 */
function Flight({ origin, display, rising, landOn }: { origin: Origin; display: string; rising: boolean; landOn: React.RefObject<HTMLButtonElement | null> }) {
  const pill = useRef<HTMLDivElement>(null);
  const go = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLDivElement>(null);
  const asName = useRef<HTMLSpanElement>(null);
  const asBar = useRef<HTMLSpanElement>(null);
  const target = useRef<{ box: Box; text: TextMark } | null>(null);

  // Before the first paint: measure the landing and put the text on the bar's.
  useLayoutEffect(() => {
    const el = landOn.current;
    const w = word.current;
    const n = asName.current;
    if (el === null || w === null || n === null) throw new Error("[search moment] the results frame has no model name to land on");
    const t = { box: boxOf(el), text: textMarkOf(el) };
    target.current = t;
    Object.assign(w.style, { left: `${t.text.right}px`, top: `${t.text.midY}px`, fontSize: `${t.text.fontSize}px`, lineHeight: t.text.lineHeight, transform: fromBar(origin.text, t.text), visibility: "visible" });
    n.style.fontWeight = t.text.fontWeight;
  }, [origin, landOn]);

  useLayoutEffect(() => {
    if (!rising) return;
    const t = target.current;
    if (t === null) throw new Error("[search moment] the rise started before its landing was measured");
    const timing: KeyframeAnimationOptions = { duration: BAR_RISE_MS, easing: RISE_EASING, fill: "forwards" };
    const runs: Animation[] = [];
    const run = (el: HTMLElement | null, frames: Keyframe[]) => {
      if (el !== null) runs.push(el.animate(frames, timing));
    };
    run(pill.current, [{ ...px(origin.box), opacity: 1 }, { ...px(t.box), opacity: 0 }]);
    run(go.current, [{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }]);
    run(word.current, [{ transform: fromBar(origin.text, t.text) }, { transform: "translate(0px, 0px) scale(1)" }]);
    run(asBar.current, [{ opacity: 1 }, { opacity: 0 }]);
    run(asName.current, [{ opacity: 0 }, { opacity: 1 }]);
    return () => runs.forEach((a) => a.cancel());
  }, [rising, origin]);

  const look =
    origin.look === "pill"
      ? "rounded-full bg-white shadow-[0_6px_28px_rgba(34,31,28,0.12),0_1px_3px_rgba(34,31,28,0.08)]"
      : "rounded-lg border-2 border-[#221f1c] bg-white";

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
      <div ref={pill} className={`absolute ${look}`} style={px(origin.box)} />
      {origin.button !== null && (
        <div ref={go} className="absolute flex items-center justify-center rounded-full font-bold text-white" style={{ ...px(origin.button.box), fontSize: `${origin.button.fontSize}px`, background: INK }}>
          {OPENING_TEXTS.search}
        </div>
      )}
      <div ref={word} className="absolute whitespace-nowrap" style={{ visibility: "hidden", transformOrigin: "0 0", color: INK }}>
        <div className="relative" style={{ transform: "translate(-100%, -50%)" }}>
          <span ref={asName} style={{ opacity: 0 }}>
            {display}
          </span>
          <span ref={asBar} className="absolute top-0 right-0" style={{ fontWeight: origin.text.fontWeight }}>
            {display}
          </span>
        </div>
      </div>
    </div>
  );
}
