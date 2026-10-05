"use client";

// The phone's full-screen search (S3 §4) — ONE component, two hosts: the opening screen (a touch on its field,
// or "חפש" with nothing chosen) and the question row's model editor (QuestionRow.tsx). Until S3 it lived inside
// QuestionRow; it moved here whole, its look unchanged.
//
// Top to bottom: the strip with "איזה דגם?" and "ביטול", the field, the helper line when the host has one (the
// question row's "a new search" line; the opening screen has none), and the list (<CompletionPanel>). S4 §4:
// the error line is gone — a failed search is shown in the results area (SearchFailed.tsx), not here. The host owns the bar's behaviour (useFamilyBar) and whether this is open; the
// component is phone-only (`md:hidden`) and draws nothing else.
//
// S6 — THE SEARCH MOMENT STARTS HERE ON THE PHONE. When the opening screen's search moment starts from this
// field (`leaving`), the component stays on view over the hidden opening screen: the strip, the helper, the
// list and the white fade out over OPENING_FADE_MS, and so does the field's border and its white; the field's
// text is drawn from then on by the moment's own copy (SearchScreen's <Flight>), in the same place, so here it
// goes at once. The list shown at the choice is kept while it fades — the choice itself closes the bar's list.
// It stays visible even though its host hides itself (`visible` overrides the inherited `invisible`).

import { useState } from "react";
import { OPENING_FADE_MS } from "@/lib/display/timing";
import { OPENING_TEXTS } from "@/lib/opening/texts";
import CompletionPanel, { type FamilyBar } from "./CompletionPanel";

/** S6 — spelled twice of necessity (FiltersWindow.tsx's rule): the map is indexed BY OPENING_FADE_MS. */
const FADE_DURATION: Record<typeof OPENING_FADE_MS, string> = { 150: "duration-150" };
const FADE = `transition-[opacity,background-color,border-color] ease-out ${FADE_DURATION[OPENING_FADE_MS]} motion-reduce:transition-none`;

export default function FullScreenSearch({
  bar,
  inputRef,
  disabled = false,
  helper = null,
  leaving = false,
  onCancel,
}: {
  /** The host's bar: its text, list and handlers. */
  bar: FamilyBar;
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  /** The line under the field; null = none. */
  helper?: string | null;
  /** S6 — the opening screen's search moment started from this field: everything fades out but the text. */
  leaving?: boolean;
  onCancel: () => void;
}) {
  // S6 — the list as it was at the choice, kept while it fades (stored during render: React's "adjusting state
  // when a prop changes" pattern; `bar.panel` is memoised, so it changes only when the list does).
  const [kept, setKept] = useState<{ panel: FamilyBar["panel"]; marked: FamilyBar["marked"] }>({ panel: bar.panel, marked: bar.marked });
  if (!leaving && (kept.panel !== bar.panel || kept.marked !== bar.marked)) setKept({ panel: bar.panel, marked: bar.marked });
  const list = leaving ? kept : { panel: bar.panel, marked: bar.marked };
  const out = leaving ? "opacity-0" : "opacity-100";

  return (
    <div className={`${FADE} fixed inset-0 z-50 flex flex-col md:hidden ${leaving ? "visible bg-transparent" : "bg-white"}`}>
      <div className={`${FADE} ${out} flex items-center justify-between border-b border-[#d8d3cb] px-4 py-3`}>
        <span className="text-[17px] font-extrabold text-[#221f1c]">{OPENING_TEXTS.phoneBar}</span>
        <button type="button" className="text-[15px] font-semibold text-[#665f58] underline underline-offset-4" onClick={onCancel}>
          {OPENING_TEXTS.phoneCancel}
        </button>
      </div>
      <div className="px-4 pt-4">
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          aria-label={OPENING_TEXTS.phoneBar}
          autoComplete="off"
          className={`${FADE} h-[42px] w-full rounded-lg border-2 px-3 text-[16px] outline-none ${leaving ? "border-transparent bg-transparent text-transparent" : "border-[#221f1c] bg-white text-[#221f1c]"}`}
          {...bar.input}
        />
        {helper !== null && <p className={`${FADE} ${out} pt-2 text-[13px] text-[#665f58]`}>{helper}</p>}      </div>
      <CompletionPanel panel={list.panel} marked={list.marked} onChoose={bar.choose} className={`${FADE} ${out} mt-2 flex-1 overflow-y-auto`} />
    </div>
  );
}
