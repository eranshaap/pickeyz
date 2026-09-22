"use client";

// The question row (BRIEF Run 6b §6) — ONE component, both screens, replacing QuestionLine.tsx.
//
// It lives inside the white top bar next to the brand name, on the results screen and on the car page, and
// it shows THE QUESTION THAT WAS ASKED, never a draft: while the drawer is open and the draft has moved,
// this row does not move with it.
//
// The model is a control (§6): tapping it opens the search bar IN PLACE.
//   desktop  the bar takes the whole row beside the brand name; the filter chips and the back link LEAVE the
//            row until it closes (they are not squeezed), the two-level autocomplete opens below the bar with
//            the current model marked "הדגם הנוכחי", and the rest of the page is dimmed.
//   phone    a full-screen search: "איזה דגם?" + "ביטול", the input pre-selected, the helper line, the list.
// Picking ANOTHER model is a new question from zero — all filters drop, the search runs at once (no "עדכן"),
// a new `searches` row is written, and the address pushes to it (§5). The same model, "ביטול", Esc, a click
// outside and the browser's back are all CANCEL, and the cancel goes through the Day-15 mechanism
// (useHistory.ts), which is what makes back close the editor and stay on the same address.
//
// The completion is ModelBar's own (§6: "reuse ModelBar.tsx's completion") — imported, not copied.
//
// THE CAR PAGE NO LONGER NAVIGATES TO CHANGE A FILTER (Run 7 §1.1). Touching a filter chip or "+ פילטרים"
// opens the SAME sheet the results screen uses — the same FilterPanel, the same look, full-screen on the
// phone — IN PLACE, over the car page. The address does not change and nothing is written. Run 6b's `open=`
// parameter and its `openOnArrival` plumbing are gone; an old address carrying `open=` simply ignores it.
//
// The car page has no SearchScreen above it to own that sheet, so this row owns it there: it loads the
// shelf and the counters through the same server actions, and commits through the same ask(). On the results
// screen nothing changed — `onOpenFilters` is passed and the screen's own drawer opens as before.
//
// §1.3, ON BOTH SCREENS: "עדכן" with nothing effectively changed IS A CANCEL. The comparison is the
// canonical one (normalize()), against the filters of the question this row shows — no ask(), no `searches`
// row, no navigation. It is the rule the model already had ("the same model is a cancel"), given to filters.
//
// §1.2 — every cancel path (X, "ביטול", Esc, a click outside, the browser's back) leaves the page exactly as
// it was, through the Day-15 mechanism (useHistory.ts). ONE instance of that hook serves both overlays this
// row can open, because they are mutually exclusive: the chips are not on screen while the search bar is.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FilterName } from "@/app/actions/search";
import { ask, counts as loadCounts, shelf as loadShelf } from "@/app/actions/search";
import type { FilterCountsView, ShelfView } from "@/lib/search/counts";
import type { SearchFilters } from "@/lib/search/filters";
import type { LiveModel } from "@/lib/search/models";
import FilterPanel, { normalize } from "./FilterPanel";
import { FILTER_LABEL, km, num, shekel } from "./labels";
import { completion, CompletionList } from "./ModelBar";
import { useScreenHistory } from "./useHistory";

const ADD_FILTERS = "+ פילטרים";
const PHONE_TITLE = "איזה דגם?";
const CANCEL = "ביטול";
const PHONE_HELPER = "בחירת דגם אחר מתחילה חיפוש חדש, בלי הפילטרים הנוכחיים.";
const FAILED = "משהו נפל בדרך. נסו שוב.";
const LOADING = "רגע…"; // §1.1 — the sheet's shelf is fetched on the first open; one line, no spinner, no skeleton

/**
 * §5's rubric formats, one per filter — moved here whole from QuestionLine.tsx, unchanged. §6: the chips use
 * "the same rubric texts the current question line derives from the filters (labels.tsx)".
 * null = the filter is not active and has no chip.
 */
export function rubric(name: FilterName, f: SearchFilters): string | null {
  if (name === "price") {
    const { priceMin: lo, priceMax: hi } = f;
    if (lo !== undefined && hi !== undefined) return `${num(lo)}–${shekel(hi)}`;
    if (hi !== undefined) return `עד ${shekel(hi)}`;
    if (lo !== undefined) return `מ-${shekel(lo)}`;
    return null;
  }
  if (name === "years") return f.years !== undefined && f.years.length > 0 ? [...f.years].sort((a, b) => a - b).join(", ") : null;
  if (name === "kmMax") return f.kmMax !== undefined ? `עד ${km(f.kmMax)}` : null;
  return f.regions !== undefined && f.regions.length > 0 ? f.regions.join(", ") : null;
}

const CHIP = "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] md:text-[14px]";
const FILTER_CHIP = `${CHIP} border-[#d8d3cb] bg-[#eeece8] text-[#221f1c]`;
const ADD_CHIP = `${CHIP} border-dashed border-[#c9c3b9] bg-white font-semibold text-[#221f1c]`;

const same = (a: SearchFilters, b: SearchFilters): boolean => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const isEmpty = (f: SearchFilters): boolean => Object.keys(normalize(f)).length === 0;

export default function QuestionRow({
  models,
  model,
  modelDisplay,
  modelKey,
  filters,
  active,
  onOpenFilters = null,
  onEditingChange,
}: {
  models: LiveModel[];
  /** The asked question's model AS SEARCHED — what the shelf, the counters and ask() all take. */
  model: string;
  modelDisplay: string;
  modelKey: string;
  filters: SearchFilters;
  active: FilterName[];
  /**
   * The results screen passes its own drawer opener, because the drawer is part of that screen's layout.
   * The car page passes null and this row opens the SAME sheet itself, over the page (§1.1).
   */
  onOpenFilters?: ((focus: FilterName | null) => void) | null;
  /** §6 — while the editor is open the host dims the page and drops the back link from the row. */
  onEditingChange?: (editing: boolean) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(modelDisplay);
  const [openMake, setOpenMake] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- the car page's own filters sheet (§1.1); untouched and unused on the results screen ----
  const ownsSheet = onOpenFilters === null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetFocus, setSheetFocus] = useState<FilterName | null>(null);
  const [sheetDraft, setSheetDraft] = useState<SearchFilters>(filters);
  const [shelf, setShelf] = useState<ShelfView | null>(null);
  const [counts, setCounts] = useState<FilterCountsView | null>(null);
  const countsSeq = useRef(0);
  // Two inputs are rendered, one per viewport, and exactly one of them is displayed. focus() on a
  // display:none element does nothing, so both are asked and only the visible one answers.
  const input = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);

  // §6 / §1.2 — the cancel goes through the Day-15 mechanism: an open overlay is one history entry on the
  // SAME address, and the browser's back closes it as cancel and stays where it is. One instance serves both
  // overlays: the sheet's chips are not on screen while the model editor is open, so only one can be out.
  const history = useScreenHistory({
    onCancelOverlay: () => {
      if (sheetOpen) return closeSheet(false);
      close(false);
    },
  });

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  useEffect(() => {
    if (!editing) return;
    // §6 — the current model's text, pre-selected, so typing replaces it
    for (const el of [input.current, phoneInput.current]) {
      el?.focus();
      el?.select();
    }
  }, [editing]);

  function open() {
    setText(modelDisplay);
    setOpenMake(null);
    setError(null);
    setEditing(true);
    history.pushOverlay();
  }

  /** `popEntry` is false only when the browser's own back is what closed it — its entry is already gone. */
  function close(popEntry = true) {
    setEditing(false);
    setOpenMake(null);
    setText(modelDisplay);
    if (popEntry) history.popOverlay();
  }

  async function choose(m: LiveModel) {
    if (m.key === modelKey) return close(); // §6 / §0.1 — the same model is a cancel, not a search
    setBusy(true);
    setError(null);
    try {
      // A new question from ZERO: no filters at all (§6). The address then pushes to the new question as a
      // NEW history entry, which is what makes back return to the question asked before it (§5).
      const answer = await ask({ model: m.model });
      history.popOverlay(() => router.push(`/?s=${answer.public_id}`));
    } catch (e) {
      console.error("[question row]", e);
      setError(e instanceof Error ? e.message : FAILED);
      setBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // §1.1–§1.4 — the sheet, when this row owns it (the car page)
  // -------------------------------------------------------------------------

  function openSheet(on: FilterName | null) {
    setSheetDraft(filters); // the sheet always opens on the QUESTION, never on a leftover draft
    setSheetFocus(on);
    setError(null);
    setSheetOpen(true);
    history.pushOverlay();
  }

  /**
   * §1.2 — every cancel path lands here and the car page is left exactly as it was.
   * `popEntry` is false only when the browser's own back is what closed it — its entry is already gone.
   */
  function closeSheet(popEntry = true) {
    setSheetOpen(false);
    setSheetFocus(null);
    setSheetDraft(filters);
    if (popEntry) history.popOverlay();
  }

  /** §1.3 / §1.4 — an unchanged "עדכן" is a cancel; a real change is a new question, as on the results screen. */
  async function applyFilters(next: SearchFilters) {
    if (same(next, filters)) return closeSheet(); // §1.3 — no ask(), no row, no navigation, no re-render
    setBusy(true);
    setError(null);
    try {
      const answer = await ask({ model, filters: isEmpty(next) ? undefined : next });
      // §1.4 — exactly today's flow: the client pushes the new question as a NEW history entry, which from
      // the car page means leaving to that question's results screen.
      history.popOverlay(() => router.push(`/?s=${answer.public_id}`));
    } catch (e) {
      console.error("[question row]", e);
      setError(e instanceof Error ? e.message : FAILED);
      setBusy(false);
    }
  }

  // The shelf is per model and does not change with the draft (§5), so it is fetched once, and only once the
  // sheet has actually been opened — a car page that is never filtered makes no call at all.
  useEffect(() => {
    if (!ownsSheet || !sheetOpen || shelf !== null) return;
    let live = true;
    loadShelf(model)
      .then((s) => {
        if (live) setShelf(s);
      })
      .catch((e) => {
        console.error("[question row]", e);
        setError(e instanceof Error ? e.message : FAILED);
      });
    return () => {
      live = false;
    };
  }, [ownsSheet, sheetOpen, shelf, model]);

  // §0.8 — every draft change calls the server; no filter logic runs in the client. Only the latest answer
  // may land, exactly as on the results screen.
  useEffect(() => {
    if (!ownsSheet || !sheetOpen) return;
    const seq = ++countsSeq.current;
    loadCounts({ model, filters: isEmpty(sheetDraft) ? undefined : sheetDraft })
      .then((c) => {
        if (seq === countsSeq.current) setCounts(c);
      })
      .catch((e) => {
        console.error("[question row]", e);
        setError(e instanceof Error ? e.message : FAILED);
      });
  }, [ownsSheet, sheetOpen, model, sheetDraft]);

  const { panel, makeHits, modelHits, isChosenText } = completion(models, text, modelDisplay, openMake);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      return close();
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (isChosenText) return close(); // the asked model's own name is a cancel
    if (modelHits.length === 1) return void choose(modelHits[0]);
    if (makeHits.length === 1) return setOpenMake(makeHits[0]); // a manufacturer OPENS its models
  }

  const list = (
    <CompletionList
      panel={panel}
      models={models}
      currentKey={modelKey}
      onChoose={(m) => void choose(m)}
      onOpenMake={(make) => setOpenMake(make)}
    />
  );

  // -------------------------------------------------------------------------
  // the row itself
  // -------------------------------------------------------------------------

  // §1.1 — ONE opener, whoever owns the sheet. On the results screen it is the screen's drawer; on the car
  // page it is this row's own sheet, opened IN PLACE. Neither of them is a link and neither moves the address.
  const openOn = onOpenFilters ?? openSheet;

  // §1.1 — the sheet itself: the SAME FilterPanel, full-screen on the phone, a side panel on the desktop,
  // over the car page. It closes on every cancel path, so unlike the results screen's desktop panel it is
  // never persistent — `persistentOnDesktop` is false and the X is there at every width.
  const sheet = ownsSheet && sheetOpen && (
    <>
      <button type="button" aria-label={CANCEL} tabIndex={-1} className="fixed inset-0 z-40 cursor-default bg-black/40" onClick={() => closeSheet()} />
      <aside className="fixed inset-y-0 start-0 z-50 flex w-full flex-col bg-white md:w-80 md:border-e md:border-[#d8d3cb]">
        {shelf === null ? (
          <p className="p-4 text-[15px] text-[#665f58]">{error ?? LOADING}</p>
        ) : (
          <FilterPanel
            shelf={shelf}
            draft={sheetDraft}
            counts={counts}
            poolNow={counts?.pool_now ?? shelf.pool_total ?? null}
            focus={sheetFocus}
            onDraftChange={setSheetDraft}
            onAsk={(f) => void applyFilters(f)}
            onCancel={() => closeSheet()}
            persistentOnDesktop={false}
            busy={busy}
          />
        )}
        {error !== null && shelf !== null && <p className="px-4 pb-4 text-[13px] text-[#665f58]">{error}</p>}
      </aside>
    </>
  );

  if (!editing) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap md:overflow-visible">
        <button
          type="button"
          onClick={open}
          className="shrink-0 text-[15px] font-extrabold text-[#221f1c] underline decoration-1 underline-offset-4 md:text-[17px] md:no-underline md:hover:underline"
        >
          {modelDisplay}
        </button>

        {/* the thin vertical hairline that separates the model from the filters */}
        <span aria-hidden className="h-5 w-px shrink-0 bg-[#d8d3cb]" />

        {active.map((name) => {
          const value = rubric(name, filters);
          if (value === null) return null;
          return (
            <button key={name} type="button" className={FILTER_CHIP} onClick={() => openOn(name)}>
              <span className="text-[#665f58]">{FILTER_LABEL[name]} </span>
              {value}
            </button>
          );
        })}

        <button type="button" className={ADD_CHIP} onClick={() => openOn(null)}>
          {ADD_FILTERS}
        </button>

        {sheet}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // the editor — desktop in place, phone full screen
  // -------------------------------------------------------------------------

  return (
    <>
      {/* DESKTOP (§6): the bar takes the whole row; the chips and the back link are gone while it is open. */}
      <div className="relative hidden min-w-0 flex-1 md:block">
        <input
          ref={input}
          type="text"
          value={text}
          disabled={busy}
          aria-label={PHONE_TITLE}
          autoComplete="off"
          className="h-[42px] w-full rounded-lg border-2 border-[#221f1c] bg-white px-3 text-[17px] text-[#221f1c] outline-none"
          onChange={(e) => {
            setText(e.target.value);
            setOpenMake(null);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-[#d8d3cb] bg-white py-1 shadow-lg">{list}</div>
        {error !== null && <p className="absolute inset-x-0 top-full mt-1 text-sm text-[#665f58]">{error}</p>}
      </div>

      {/* the dim over the rest of the page; clicking it is one of the cancels */}
      <button type="button" aria-label={CANCEL} tabIndex={-1} className="fixed inset-0 z-30 hidden cursor-default bg-black/25 md:block" onClick={() => close()} />

      {/* PHONE (§6): a full-screen search. */}
      <div className="fixed inset-0 z-50 flex flex-col bg-white md:hidden">
        <div className="flex items-center justify-between border-b border-[#d8d3cb] px-4 py-3">
          <span className="text-[17px] font-extrabold text-[#221f1c]">{PHONE_TITLE}</span>
          <button type="button" className="text-[15px] font-semibold text-[#665f58] underline underline-offset-4" onClick={() => close()}>
            {CANCEL}
          </button>
        </div>
        <div className="px-4 pt-4">
          <input
            ref={phoneInput}
            type="text"
            value={text}
            disabled={busy}
            aria-label={PHONE_TITLE}
            autoComplete="off"
            className="h-[42px] w-full rounded-lg border-2 border-[#221f1c] bg-white px-3 text-[16px] text-[#221f1c] outline-none"
            onChange={(e) => {
              setText(e.target.value);
              setOpenMake(null);
            }}
            onKeyDown={onKeyDown}
          />
          <p className="pt-2 text-[13px] text-[#665f58]">{PHONE_HELPER}</p>
          {error !== null && <p className="pt-2 text-[13px] text-[#665f58]">{error}</p>}
        </div>
        <div className="mt-2 flex-1 overflow-y-auto">{list}</div>
      </div>
    </>
  );
}
