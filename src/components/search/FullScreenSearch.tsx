"use client";

// The phone's full-screen search (S3 §4) — ONE component, two hosts: the opening screen (a touch on its field,
// or "חפש" with nothing chosen) and the question row's model editor (QuestionRow.tsx). Until S3 it lived inside
// QuestionRow; it moved here whole, its look unchanged.
//
// Top to bottom: the strip with "איזה דגם?" and "ביטול", the field, the helper line when the host has one (the
// question row's "a new search" line; the opening screen has none), and the list (<CompletionPanel>). S4 §4:
// the error line is gone — a failed search is shown in the results area (SearchFailed.tsx), not here. The host owns the bar's behaviour (useFamilyBar) and whether this is open; the
// component is phone-only (`md:hidden`) and draws nothing else.

import { OPENING_TEXTS } from "@/lib/opening/texts";
import CompletionPanel, { type FamilyBar } from "./CompletionPanel";

export default function FullScreenSearch({
  bar,
  inputRef,
  disabled = false,
  helper = null,
  onCancel,
}: {
  /** The host's bar: its text, list and handlers. */
  bar: FamilyBar;
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  /** The line under the field; null = none. */
  helper?: string | null;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white md:hidden">
      <div className="flex items-center justify-between border-b border-[#d8d3cb] px-4 py-3">
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
          className="h-[42px] w-full rounded-lg border-2 border-[#221f1c] bg-white px-3 text-[16px] text-[#221f1c] outline-none"
          {...bar.input}
        />
        {helper !== null && <p className="pt-2 text-[13px] text-[#665f58]">{helper}</p>}      </div>
      <CompletionPanel panel={bar.panel} marked={bar.marked} onChoose={bar.choose} className="mt-2 flex-1 overflow-y-auto" />
    </div>
  );
}
