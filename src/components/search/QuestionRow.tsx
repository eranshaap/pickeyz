"use client";

// The question row (BRIEF Run 6b §6) — ONE component, both screens, replacing QuestionLine.tsx.
//
// It lives inside the white top bar next to the brand name, on the results screen and on the car page, and
// it shows THE QUESTION THAT WAS ASKED, never a draft: while the filters window is open and the draft has moved,
// this row does not move with it.
//
// TWO MODES, AND THE SCREEN PICKS ONE (Run 7c §11.2):
//
//   the results screen   THE ROW IS A CONTROL. The model opens the search bar in place; a chip opens the
//                        screen's own filters window. Everything below about the editor is this mode's.
//   the car page         THE ROW IS TEXT, and nothing in it reacts to a click: no search bar, no sheet, no
//                        "+ פילטרים" chip, no hover underline, no handler of any kind. "חזרה" is the only
//                        way to change the question, and it changes it on the results screen. Same layout,
//                        same sizes, same weights; the colour one step down — the model's and the chips'
//                        text #665f58, the chips' border #c9c3b9.
//
// That reverses Run 7 §1's car-page half, and with it Run 6b's "from the car page a chip → results with the
// filters open". On the car page there is no reason to change the question, so it cannot be changed there:
// the page no longer mounts FilterPanel or the search bar, and the open / apply / cancel plumbing that
// served it is gone. THE TWO MODES ARE TWO COMPONENTS so that the read-only one mounts none of it — no
// state, no history listener, no server action. Nothing on the results screen changed.
//
// THE MODEL IS A CONTROL (§6), on the results screen:
//   desktop  the bar takes the whole row beside the brand name; the filter chips and the back link LEAVE the
//            row until it closes (they are not squeezed), the list opens below the bar, and the rest of the
//            page is dimmed.
//   phone    a full-screen search: "איזה דגם?" + "ביטול", the input pre-selected, the helper line, the list —
//            S3 §4: <FullScreenSearch>, the same component the opening screen opens.
// Picking ANOTHER model is a new question from zero — all filters drop, the search runs at once (no "עדכן"),
// a new `searches` row is written, and the address pushes to it (§5). The same model, "ביטול", Esc, a click
// outside and the browser's back are all CANCEL, and the cancel goes through the Day-15 mechanism
// (useHistory.ts), which is what makes back close the editor and stay on the same address.
//
// S2 §4–§5 — THE LIST AND THE BAR'S BEHAVIOUR ARE THE OPENING SCREEN'S OWN: <CompletionPanel> and
// useFamilyBar() (CompletionPanel.tsx), over the model families, on the computer and on the phone alike. The
// asked model is no longer marked in the list; choosing it again is still a cancel.
//
// §11.3 — THE PUSH IS NOT THIS ROW'S. A model pick is one of the navigations the results screen starts from
// its own controls, so it runs through the screen's shared pending state (`nav`): the screen's cards area
// shows its placeholders and its controls stay busy from the click until the new screen commits.
//
// S4 §4 — AND NEITHER IS THE SEARCH. A pick of another model closes the editor at once and hands the family to
// the screen (`nav.ask`), which runs the load: the row shows the new model from that moment, through the wait
// and through a failure, and a failure is shown in the results area (SearchFailed.tsx) — the editor's own
// error line is gone. S4 §2: during the search moment the screen hides the hairline and "+ פילטרים"
// (`filtersHidden`, which keeps their place so the bar does not change height) and they come in with the
// results; `modelRef` is the name the rising bar lands on.

import { useEffect, useRef, useState } from "react";
import type { FilterName } from "@/app/actions/search";
import { RESULTS_ENTER_MS } from "@/lib/display/timing";
import type { FamilyEntry } from "@/lib/opening/completion";
import type { SearchFilters } from "@/lib/search/filters";
import CompletionPanel, { useFamilyBar } from "./CompletionPanel";
import FullScreenSearch from "./FullScreenSearch";
import { FILTER_LABEL, km, num, shekel } from "./labels";
import { useScreenHistory } from "./useHistory";

const ADD_FILTERS = "+ פילטרים";
const PHONE_TITLE = "איזה דגם?";
const CANCEL = "ביטול";
const PHONE_HELPER = "בחירת דגם אחר מתחילה חיפוש חדש, בלי הפילטרים הנוכחיים.";

/**
 * S4 §2.4 — the hairline and "+ פילטרים" come in with the results, over RESULTS_ENTER_MS. Tailwind reads a class
 * name as a literal, so the duration is spelled here too; the map is indexed BY the constant, so changing it
 * without a class to match stops the compile (FiltersWindow.tsx's rule).
 */
const ENTER_DURATION: Record<typeof RESULTS_ENTER_MS, string> = { 150: "duration-150" };
const ENTER = `transition-opacity ease-out ${ENTER_DURATION[RESULTS_ENTER_MS]} motion-reduce:transition-none`;

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
  /** S4 §4 — another model was picked: the screen asks it, from zero, and shows the wait and its outcome. */
  ask: (familyId: number) => void;
};

type Props =
  | ({ readOnly: true } & RowQuestion)
  | ({
      readOnly?: false;
      /** S2 §5 — barFamilies(), what the editor's list offers. */
      families: FamilyEntry[];
      /** The asked question's family — what makes "the same model" a cancel. */
      familyId: number;
      nav: ScreenNav;
      /**
       * The results screen's own filters opener, and the SAME handler on both devices since Run 2 (Days
       * 24–25) §3.3: the window it opens is the one place a filter is edited.
       */
      onOpenFilters: (focus: FilterName | null) => void;
      /** §6 — while the editor is open the host dims the page and drops the back link from the row. */
      onEditingChange: (editing: boolean) => void;
      /** S4 §2 — the model's name, where the search moment's rising bar lands. */
      modelRef?: React.Ref<HTMLButtonElement>;
      /** S4 §2 — the hairline and "+ פילטרים" are not shown yet (their place is kept). */
      filtersHidden?: boolean;
      /** S4 — false while the screen holds no filter rows for the asked family: "+ פילטרים" is disabled. */
      canAddFilters?: boolean;
    } & RowQuestion);

export default function QuestionRow(props: Props) {
  if (props.readOnly === true) return <ReadOnlyRow modelDisplay={props.modelDisplay} filters={props.filters} active={props.active} />;
  return (
    <EditableRow
      families={props.families}
      modelDisplay={props.modelDisplay}
      familyId={props.familyId}
      filters={props.filters}
      active={props.active}
      nav={props.nav}
      onOpenFilters={props.onOpenFilters}
      onEditingChange={props.onEditingChange}
      modelRef={props.modelRef}
      filtersHidden={props.filtersHidden ?? false}
      canAddFilters={props.canAddFilters ?? true}
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
// the results screen's row: the model opens the search bar, a chip opens the filters window
// ---------------------------------------------------------------------------

function EditableRow({
  families,
  modelDisplay,
  familyId,
  filters,
  active,
  nav,
  onOpenFilters,
  onEditingChange,
  modelRef,
  filtersHidden,
  canAddFilters,
}: {
  families: FamilyEntry[];
  familyId: number;
  nav: ScreenNav;
  onOpenFilters: (focus: FilterName | null) => void;
  onEditingChange: (editing: boolean) => void;
  modelRef?: React.Ref<HTMLButtonElement>;
  filtersHidden: boolean;
  canAddFilters: boolean;
} & RowQuestion) {
  const [editing, setEditing] = useState(false);

  // Two inputs are rendered, one per viewport, and exactly one of them is displayed. focus() on a
  // display:none element does nothing, so both are asked and only the visible one answers.
  const input = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);

  // S2 §5 — the bar's text, its list and its mark: the opening screen's behaviour, shared. Run 8c §1 holds
  // inside it: a choice closes the list AT ONCE while the editor itself stays where it is, and only typing or
  // a click into the bar opens it again. Esc closes the list; Esc on a closed list is the editor's cancel.
  const bar = useFamilyBar(families, {
    initialText: modelDisplay,
    onChoose: (id) => void choose(id),
    onEscape: () => close(),
    focus: () => {
      for (const el of [input.current, phoneInput.current]) el?.focus();
    },
  });

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
    setEditing(true);
    bar.reset(modelDisplay);
    bar.openList(); // §6 — the editor arrives with its list already down: the click on the model is the click into the bar
    history.pushOverlay();
  }

  /** `popEntry` is false only when the browser's own back is what closed it — its entry is already gone. */
  function close(popEntry = true) {
    setEditing(false);
    bar.reset(modelDisplay);
    if (popEntry) history.popOverlay();
  }

  // The bar has already closed the list and filled itself with the chosen name, in the same event (§1).
  function choose(id: number) {
    if (id === familyId) return close(); // §6 / §0.1 — the same model is a cancel, not a search
    // S4 §4 — the editor closes at once and its entry is popped first, so the new question's address is pushed
    // onto the results' own entry; then the screen asks the new model from ZERO (§6) and pushes a NEW history
    // entry when the answer lands, which is what makes back return to the question asked before it (§5).
    setEditing(false);
    history.popOverlay(() => nav.ask(id));
  }

  // S2 §4 — the one list; each bar gives it its own frame.
  const list = (frame: string) => <CompletionPanel panel={bar.panel} marked={bar.marked} onChoose={bar.choose} className={frame} />;

  if (!editing) {
    return (
      <div className={ROW}>
        {/* RUN 2 (Days 24–25) §5 — NO PERMANENT UNDERLINE ON THE PHONE. It was there to say "this is a
            control", and on a screen where every other control says so by being a chip it said "this is a
            link" instead. The desktop's hover underline is untouched, and so is the car page's caption row,
            which has never had either. */}
        <button ref={modelRef} type="button" onClick={open} className={`${MODEL} text-[#221f1c] decoration-1 underline-offset-4 md:hover:underline`}>
          {modelDisplay}
        </button>

        <span className={`${ENTER} flex shrink-0 ${filtersHidden ? "invisible opacity-0" : "opacity-100"}`}>
          <Hairline />
        </span>

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

        <button
          type="button"
          disabled={!canAddFilters}
          className={`${ADD_CHIP} ${ENTER} disabled:cursor-default disabled:opacity-50 ${filtersHidden ? "invisible opacity-0" : "opacity-100"}`}
          onClick={() => onOpenFilters(null)}
        >
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
          aria-label={PHONE_TITLE}
          autoComplete="off"
          className="h-[42px] w-full rounded-lg border-2 border-[#221f1c] bg-white px-3 text-[17px] text-[#221f1c] outline-none"
          {...bar.input}
        />
        {list("absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-[#d8d3cb] bg-white py-1 shadow-lg")}
      </div>

      {/* the dim over the rest of the page; clicking it is one of the cancels */}
      <button type="button" aria-label={CANCEL} tabIndex={-1} className="fixed inset-0 z-30 hidden cursor-default bg-black/25 md:block" onClick={() => close()} />

      {/* PHONE (§6): a full-screen search — S3 §4: the one component the opening screen uses too. */}
      <FullScreenSearch bar={bar} inputRef={phoneInput} helper={PHONE_HELPER} onCancel={() => close()} />
    </>
  );
}
