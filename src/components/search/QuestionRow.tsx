"use client";

// The question row (BRIEF Run 6b §6) — ONE component, both screens, replacing QuestionLine.tsx.
//
// It lives inside the white top bar next to the brand name, on the results screen and on the car page, and
// it shows THE QUESTION THAT WAS ASKED, never a draft: while the drawer is open and the draft has moved,
// this row does not move with it.
//
// TWO MODES, AND THE SCREEN PICKS ONE (Run 7c §11.2):
//
//   the results screen   THE ROW IS A CONTROL. The model opens the search bar in place; a chip opens the
//                        screen's own drawer. Everything below about the editor is this mode's.
//   the car page         THE ROW IS TEXT, and nothing in it reacts to a click: no search bar, no sheet, no
//                        "+ פילטרים" chip, no hover underline, no handler of any kind. "חזרה" is the only
//                        way to change the question, and it changes it on the results screen. Same layout,
//                        same sizes, same weights; the colour one step down — the model's and the chips'
//                        text #665f58, the chips' border #c9c3b9.
//
// That reverses Run 7 §1's car-page half, and with it Run 6b's "from the car page a chip → results with the
// drawer open". On the car page there is no reason to change the question, so it cannot be changed there:
// the page no longer mounts FilterPanel or the search bar, and the open / apply / cancel plumbing that
// served it is gone. THE TWO MODES ARE TWO COMPONENTS so that the read-only one mounts none of it — no
// state, no history listener, no server action. Nothing on the results screen changed.
//
// THE MODEL IS A CONTROL (§6), on the results screen:
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
// §11.3 — THE PUSH IS NOT THIS ROW'S. A model pick is one of the navigations the results screen starts from
// its own controls, so it runs through the screen's shared pending state (`nav`): the screen's cards area
// shows its placeholders and its controls stay busy from the click until the new screen commits.

import { useEffect, useRef, useState } from "react";
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

// ONE look for both modes (§11.2: same layout, same sizes, same weights). Only the colours step down.
const ROW = "flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap md:overflow-visible";
const MODEL = "shrink-0 text-[15px] font-extrabold md:text-[17px]";
const CHIP = "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] md:text-[14px]";
const FILTER_CHIP = `${CHIP} border-[#d8d3cb] bg-[#eeece8] text-[#221f1c]`;
const ADD_CHIP = `${CHIP} border-dashed border-[#c9c3b9] bg-white font-semibold text-[#221f1c]`;
// §11.2 — one step down, in two colours the page already has: the scale labels' grey and the ticks' grey.
const READ_ONLY_MODEL = "text-[#665f58]";
const READ_ONLY_CHIP = `${CHIP} border-[#c9c3b9] bg-[#eeece8] text-[#665f58]`;

/** The thin vertical hairline that separates the model from the filters — the same in both modes. */
function Hairline() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-[#d8d3cb]" />;
}

/** What both modes show: the asked question, as the row spells it. */
type RowQuestion = {
  modelDisplay: string;
  filters: SearchFilters;
  active: FilterName[];
};

/**
 * §11.3 — the results screen's shared pending state, handed to the row so that EVERY navigation the screen
 * starts from its own controls is one unbroken busy state: the cards area's placeholders and the busy
 * controls go on at the click and come off when the new screen is on.
 */
export type ScreenNav = {
  /** The click: the screen goes pending. */
  begin: () => void;
  /** The navigation, run inside the screen's transition so the pending state lasts until it commits. */
  push: (href: string) => void;
  /** Nothing was navigated after all (the call failed): the screen comes back. */
  end: () => void;
};

type Props =
  | ({ readOnly: true } & RowQuestion)
  | ({
      readOnly?: false;
      models: LiveModel[];
      /** The asked question's model key — what makes "the same model" a cancel. */
      modelKey: string;
      nav: ScreenNav;
      /** The results screen's own drawer opener: the drawer is part of that screen's layout. */
      onOpenFilters: (focus: FilterName | null) => void;
      /** §6 — while the editor is open the host dims the page and drops the back link from the row. */
      onEditingChange: (editing: boolean) => void;
    } & RowQuestion);

export default function QuestionRow(props: Props) {
  if (props.readOnly === true) return <ReadOnlyRow modelDisplay={props.modelDisplay} filters={props.filters} active={props.active} />;
  return (
    <EditableRow
      models={props.models}
      modelDisplay={props.modelDisplay}
      modelKey={props.modelKey}
      filters={props.filters}
      active={props.active}
      nav={props.nav}
      onOpenFilters={props.onOpenFilters}
      onEditingChange={props.onEditingChange}
    />
  );
}

// ---------------------------------------------------------------------------
// §11.2 — the car page's row: the question behind the verdict, as text
// ---------------------------------------------------------------------------

/**
 * No button, no anchor, no handler — spans, which is also what gives the whole row the default cursor
 * without asking for it. There is no "+ פילטרים" chip: there is nothing to add a filter to from here.
 */
function ReadOnlyRow({ modelDisplay, filters, active }: RowQuestion) {
  return (
    <div className={ROW}>
      <span className={`${MODEL} ${READ_ONLY_MODEL}`}>{modelDisplay}</span>

      <Hairline />

      {active.map((name) => {
        const value = rubric(name, filters);
        if (value === null) return null;
        return (
          <span key={name} className={READ_ONLY_CHIP}>
            {FILTER_LABEL[name]} {value}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// the results screen's row: the model opens the search bar, a chip opens the drawer
// ---------------------------------------------------------------------------

function EditableRow({
  models,
  modelDisplay,
  modelKey,
  filters,
  active,
  nav,
  onOpenFilters,
  onEditingChange,
}: {
  models: LiveModel[];
  modelKey: string;
  nav: ScreenNav;
  onOpenFilters: (focus: FilterName | null) => void;
  onEditingChange: (editing: boolean) => void;
} & RowQuestion) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(modelDisplay);
  const [openMake, setOpenMake] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Run 8c §1 — THE LIST IS ITS OWN STATE NOW, because a choice must close it AT ONCE while the editor
  // itself stays where it is. Until now the list was down for exactly as long as `editing`, so a chosen
  // model left it standing over the dim through the whole round trip to the new question. It opens with the
  // editor (§6: the editor arrives with its list already down) and closes with it; between the two it closes
  // on a choice and opens again only on a fresh act of the user in the bar — typing, or a click into it.
  const [listOpen, setListOpen] = useState(false);

  // Two inputs are rendered, one per viewport, and exactly one of them is displayed. focus() on a
  // display:none element does nothing, so both are asked and only the visible one answers.
  const input = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);

  // §6 — the cancel goes through the Day-15 mechanism: an open overlay is one history entry on the SAME
  // address, and the browser's back closes it as cancel and stays where it is.
  const history = useScreenHistory({ onCancelOverlay: () => close(false) });

  useEffect(() => {
    onEditingChange(editing);
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
    setListOpen(true);
    history.pushOverlay();
  }

  /** `popEntry` is false only when the browser's own back is what closed it — its entry is already gone. */
  function close(popEntry = true) {
    setEditing(false);
    setOpenMake(null);
    setListOpen(false);
    setText(modelDisplay);
    if (popEntry) history.popOverlay();
  }

  async function choose(m: LiveModel) {
    if (m.key === modelKey) return close(); // §6 / §0.1 — the same model is a cancel, not a search
    setListOpen(false); // §1 — the list goes AT ONCE, in the same event; the new question below is unchanged
    setBusy(true);
    nav.begin(); // §11.3 — the screen goes pending on the click, not on the push
    setError(null);
    try {
      // A new question from ZERO: no filters at all (§6). The address then pushes to the new question as a
      // NEW history entry, which is what makes back return to the question asked before it (§5).
      const answer = await ask({ model: m.model });
      history.popOverlay(() => nav.push(`/?s=${answer.public_id}`));
    } catch (e) {
      console.error("[question row]", e);
      setError(e instanceof Error ? e.message : FAILED);
      setBusy(false);
      nav.end();
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
    if (modelHits.length === 1) return void choose(modelHits[0]); // §1 — Enter on a suggestion closes the list
    if (makeHits.length === 1) {
      setOpenMake(makeHits[0]); // a manufacturer OPENS its models; it is not a choice
      setListOpen(true);
    }
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

  if (!editing) {
    return (
      <div className={ROW}>
        <button type="button" onClick={open} className={`${MODEL} text-[#221f1c] underline decoration-1 underline-offset-4 md:no-underline md:hover:underline`}>
          {modelDisplay}
        </button>

        <Hairline />

        {active.map((name) => {
          const value = rubric(name, filters);
          if (value === null) return null;
          return (
            <button key={name} type="button" className={FILTER_CHIP} onClick={() => onOpenFilters(name)}>
              <span className="text-[#665f58]">{FILTER_LABEL[name]} </span>
              {value}
            </button>
          );
        })}

        <button type="button" className={ADD_CHIP} onClick={() => onOpenFilters(null)}>
          {ADD_FILTERS}
        </button>
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
            setListOpen(true); // §1 — typing is one of the two acts that open the list again
          }}
          onPointerDown={() => setListOpen(true)} // §1 — and a click or tap into the bar is the other
          onKeyDown={onKeyDown}
        />
        {listOpen && (
          <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-[#d8d3cb] bg-white py-1 shadow-lg">{list}</div>
        )}
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
              setListOpen(true); // §1 — as on the desktop bar: typing opens the list again
            }}
            onPointerDown={() => setListOpen(true)}
            onKeyDown={onKeyDown}
          />
          <p className="pt-2 text-[13px] text-[#665f58]">{PHONE_HELPER}</p>
          {error !== null && <p className="pt-2 text-[13px] text-[#665f58]">{error}</p>}
        </div>
        {listOpen && <div className="mt-2 flex-1 overflow-y-auto">{list}</div>}
      </div>
    </>
  );
}
