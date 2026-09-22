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
// THE CAR PAGE differs in exactly one thing: touching a filter chip or "+ פילטרים" has no drawer to open
// here, so it navigates to `/?s=<the page's question id>` with the drawer open on arrival; the change itself
// happens there under the existing rules. The model click behaves the same on both screens.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FilterName } from "@/app/actions/search";
import { ask } from "@/app/actions/search";
import type { SearchFilters } from "@/lib/search/filters";
import type { LiveModel } from "@/lib/search/models";
import { FILTER_LABEL, km, num, shekel } from "./labels";
import { completion, CompletionList } from "./ModelBar";
import { useScreenHistory } from "./useHistory";

const ADD_FILTERS = "+ פילטרים";
const PHONE_TITLE = "איזה דגם?";
const CANCEL = "ביטול";
const PHONE_HELPER = "בחירת דגם אחר מתחילה חיפוש חדש, בלי הפילטרים הנוכחיים.";
const FAILED = "משהו נפל בדרך. נסו שוב.";

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

export default function QuestionRow({
  models,
  modelDisplay,
  modelKey,
  filters,
  active,
  questionPublicId,
  onOpenFilters = null,
  onEditingChange,
}: {
  models: LiveModel[];
  modelDisplay: string;
  modelKey: string;
  filters: SearchFilters;
  active: FilterName[];
  /** The address of the question this row shows — the car page's chips navigate to it. */
  questionPublicId: string | null;
  /** The results screen passes its drawer opener; the car page passes null and the chips become links. */
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
  // Two inputs are rendered, one per viewport, and exactly one of them is displayed. focus() on a
  // display:none element does nothing, so both are asked and only the visible one answers.
  const input = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);

  // §6 — the cancel goes through the Day-15 mechanism: the editor is an overlay entry, and the browser's
  // back closes it as cancel and stays on the same address.
  const history = useScreenHistory({ onCancelOverlay: () => close(false) });

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
          const body = (
            <>
              <span className="text-[#665f58]">{FILTER_LABEL[name]} </span>
              {value}
            </>
          );
          return onOpenFilters !== null ? (
            <button key={name} type="button" className={FILTER_CHIP} onClick={() => onOpenFilters(name)}>
              {body}
            </button>
          ) : (
            <Link key={name} href={`/?s=${questionPublicId}&open=${name}`} className={FILTER_CHIP}>
              {body}
            </Link>
          );
        })}

        {onOpenFilters !== null ? (
          <button type="button" className={ADD_CHIP} onClick={() => onOpenFilters(null)}>
            {ADD_FILTERS}
          </button>
        ) : (
          <Link href={`/?s=${questionPublicId}&open=filters`} className={ADD_CHIP}>
            {ADD_FILTERS}
          </Link>
        )}
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
