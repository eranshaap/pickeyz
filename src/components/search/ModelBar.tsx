"use client";

// The opening screen's model bar on the computer (BRIEF Days 15–16, Run 2b §5; S2 §5; restyled by S3 §3).
//
// S2 — THE BAR READS THE MODEL FAMILIES. What it offers, how it is typed into and what a choice does are not
// this file's: the list is <CompletionPanel> and the behaviour is useFamilyBar(), the same two the question
// row's editor uses (CompletionPanel.tsx). The opening screen (OpeningScreen.tsx) holds the bar's state,
// because the phone's field and its full-screen search share it; this file draws the computer's bar and
// nothing else.
//
// S3 §3 — THE LOOK: a white pill 720 × 68 with a soft shadow, the field inside it and "חפש" dark inside at its
// left end (the inline end in RTL). "חפש" keeps S2's colour states: black while the bar is not in use, grey
// while the person is in the bar and the text is not a model, black again once it is; disabled with a spinner
// from the click until the push. The list opens under the pill, at its width. Every size is multiplied by the
// opening screen's `--s` (src/lib/opening/layout.ts), so the bar grows with a large screen.
//
// THE HINT is not picked here any more: the opening screen picks it once on mount and puts it on both its
// fields (this one and the phone's), so the two never disagree.

import { useEffect, useRef } from "react";
import { OPENING_TEXTS } from "@/lib/opening/texts";
import CompletionPanel, { type FamilyBar } from "./CompletionPanel";
import { Spinner } from "./FilterPanel";

export default function ModelBar({
  bar,
  input,
  inputRef,
  pending,
}: {
  bar: FamilyBar;
  /** What is spread on the input — the bar's own handlers, as the opening screen wraps them (S3 §5). */
  input: FamilyBar["input"];
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** A question is on its way: "חפש" is disabled and carries a spinner. */
  pending: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);

  // A press anywhere outside the bar and its list closes the list (the text stays). It is a listener and not
  // a backdrop, so the press that closes it still reaches what it was aimed at. S3 §4: on the phone this bar
  // is not displayed and the list is the full-screen search's, so a hidden bar never closes it.
  const listOpen = bar.panel.kind !== "closed";
  const { closeList } = bar;
  useEffect(() => {
    if (!listOpen) return;
    const away = (e: PointerEvent) => {
      const el = root.current;
      if (el === null || el.getClientRects().length === 0) return; // not displayed
      if (!el.contains(e.target as Node)) closeList();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [listOpen, closeList]);

  const dark = !(bar.inUse && bar.exact === null);

  return (
    <div ref={root} className="relative w-[calc(720px*var(--s))]">
      <div className="flex h-[calc(68px*var(--s))] items-center gap-[calc(8px*var(--s))] rounded-full bg-white ps-[calc(28px*var(--s))] pe-[calc(8px*var(--s))] shadow-[0_6px_28px_rgba(34,31,28,0.12),0_1px_3px_rgba(34,31,28,0.08)]">
        <input
          ref={inputRef}
          type="text"
          placeholder={OPENING_TEXTS.hintAlone}
          autoComplete="off"
          aria-label={OPENING_TEXTS.hintAlone}
          className="h-full min-w-0 flex-1 bg-transparent text-[calc(20px*var(--s))] text-[#221f1c] outline-none placeholder:text-[#8a837b] focus:placeholder:text-transparent"
          {...input}
        />
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={bar.submit}
          className={`flex h-[calc(52px*var(--s))] shrink-0 items-center justify-center gap-2 rounded-full px-[calc(32px*var(--s))] text-[calc(18px*var(--s))] font-bold text-white disabled:bg-neutral-300 ${dark ? "bg-[#221f1c]" : "bg-neutral-300"}`}
        >
          {pending && <Spinner />}
          <span>{OPENING_TEXTS.search}</span>
        </button>
      </div>

      <CompletionPanel
        panel={bar.panel}
        marked={bar.marked}
        onChoose={bar.choose}
        className="absolute inset-x-0 top-full z-30 mt-[calc(8px*var(--s))] max-h-80 overflow-y-auto rounded-2xl border border-[#d8d3cb] bg-white py-1 text-start shadow-lg"
      />
    </div>
  );
}
