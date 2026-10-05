"use client";

// The opening screen's model bar (BRIEF Days 15–16, Run 2b §5; S2 §5).
//
// S2 — THE BAR READS THE MODEL FAMILIES. What it offers, how it is typed into and what a choice does are no
// longer this file's: the list is <CompletionPanel> and the behaviour is useFamilyBar(), the same two the
// question row's editor uses (CompletionPanel.tsx). SearchScreen holds the bar's state, because the "חפש"
// button below the bar reads it (its colour) and drives it (a press with no model asks for one); this file
// draws the input and the list under it, and nothing else.
//
// A choice searches at once — the filters come with the results, so there is no "פילטרים" button any more.
//
// THE HINT (§5): the placeholder is hintText(families, HINT_NAME_MAX_CHARS), picked ONCE when the screen mounts
// and never on a render. It is put on the input after mount — a random pick made during the server render
// would differ from the browser's — and until then the bar shows the hint alone. A focused bar shows none.

import { useEffect, useRef } from "react";
import { hintText, type FamilyEntry } from "@/lib/opening/completion";
import { HINT_NAME_MAX_CHARS } from "@/lib/opening/constants";
import { OPENING_TEXTS } from "@/lib/opening/texts";
import CompletionPanel, { type FamilyBar } from "./CompletionPanel";

export default function ModelBar({ families, bar, inputRef }: { families: FamilyEntry[]; bar: FamilyBar; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const root = useRef<HTMLDivElement>(null);

  // §5 — the hint, picked once on mount. Set on the element itself so no render can pick it again.
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current || inputRef.current === null) return;
    picked.current = true;
    inputRef.current.placeholder = hintText(families, HINT_NAME_MAX_CHARS);
  }, [families, inputRef]);

  // A press anywhere outside the bar and its list closes the list (the text stays). It is a listener and not
  // a backdrop, so the press that closes it — on "חפש", say — still reaches what it was aimed at.
  const listOpen = bar.panel.kind !== "closed";
  const { closeList } = bar;
  useEffect(() => {
    if (!listOpen) return;
    const away = (e: PointerEvent) => {
      if (root.current !== null && !root.current.contains(e.target as Node)) closeList();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [listOpen, closeList]);

  return (
    <div ref={root} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        placeholder={OPENING_TEXTS.hintAlone}
        autoComplete="off"
        aria-label={OPENING_TEXTS.hintAlone}
        className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-lg text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:placeholder:text-transparent"
        {...bar.input}
      />

      {/* z-30 sits above the opening screen's "חפש" button (z-10): on desktop the button is laid out directly
          under the bar, so an open list would otherwise be painted over by it. */}
      <CompletionPanel
        panel={bar.panel}
        marked={bar.marked}
        onChoose={bar.choose}
        className="absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-neutral-200 bg-white py-1 shadow-lg"
      />
    </div>
  );
}
