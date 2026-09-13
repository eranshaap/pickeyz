"use client";

// The model bar (BRIEF Days 15–16, Run 2b §5) — a two-level autocomplete over LIVE models only.
//
// Level 1 is the manufacturer, level 2 is its models. Typing a manufacturer OPENS its models and does not
// search, even on Enter: "מזדה" is not a question a search can answer. Typing a model jumps straight to it.
// The match is a prefix match on the Hebrew make and on the Latin model, case-insensitive.
//
// The list comes from src/lib/search/models.ts — the live listings, not the `models` catalog — so text that
// resolves to nothing gets the honest answer: "הדגם עוד לא אצלנו", followed by what IS here, clickable.
//
// The model is the only required field of the screen (§0.7): until one is chosen there is no filters cluster
// and the search button is disabled, because the filter shelf is per model.

import { useMemo, useRef, useState } from "react";
import type { LiveModel } from "@/lib/search/models";

const PLACEHOLDER = "איזה רכב מעניין אותך?";
const NOT_HERE_YET = "הדגם עוד לא אצלנו; כרגע:";

const norm = (s: string): string => s.trim().toLowerCase();

export default function ModelBar({
  models,
  chosen,
  onChoose,
  onSubmit,
}: {
  models: LiveModel[];
  chosen: LiveModel | null;
  onChoose: (m: LiveModel | null) => void;
  /** Enter on an already chosen model = a full search on the whole model pool (§5). */
  onSubmit: () => void;
}) {
  const [text, setText] = useState(chosen?.display ?? "");
  const [open, setOpen] = useState(false);
  const [openMake, setOpenMake] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const makes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const m of models) seen.set(m.make, (seen.get(m.make) ?? 0) + m.listings);
    return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([make]) => make);
  }, [models]);

  const q = norm(text);
  const isChosenText = chosen !== null && text === chosen.display;
  const makeHits = useMemo(() => (q === "" ? [] : makes.filter((m) => norm(m).startsWith(q))), [makes, q]);
  const modelHits = useMemo(() => (q === "" || isChosenText ? [] : models.filter((m) => norm(m.model).startsWith(q))), [models, q, isChosenText]);

  // What the open list shows. The order is the resolution order: an opened manufacturer wins, then a model
  // prefix, then a manufacturer prefix (one manufacturer opens straight into its models), then nothing found.
  type Panel = { kind: "makes"; makes: string[] } | { kind: "models"; models: LiveModel[]; heading: string | null } | { kind: "none" };
  const panel: Panel = useMemo(() => {
    if (openMake !== null) return { kind: "models", models: models.filter((m) => m.make === openMake), heading: openMake };
    if (q === "" || isChosenText) return { kind: "makes", makes };
    if (modelHits.length > 0) return { kind: "models", models: modelHits, heading: null };
    if (makeHits.length === 1) return { kind: "models", models: models.filter((m) => m.make === makeHits[0]), heading: makeHits[0] };
    if (makeHits.length > 1) return { kind: "makes", makes: makeHits };
    return { kind: "none" };
  }, [openMake, q, isChosenText, makes, makeHits, modelHits, models]);

  function choose(m: LiveModel) {
    onChoose(m);
    setText(m.display);
    setOpenMake(null);
    setOpen(false);
    input.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (isChosenText) {
      setOpen(false);
      onSubmit(); // §5: Enter on a chosen model searches the whole model pool
      return;
    }
    if (modelHits.length === 1) return choose(modelHits[0]);
    if (makeHits.length === 1) {
      setOpenMake(makeHits[0]); // §5: Enter on a manufacturer OPENS its models, it does not search
      setOpen(true);
    }
  }

  return (
    <div className="relative w-full">
      <input
        ref={input}
        type="text"
        value={text}
        placeholder={PLACEHOLDER}
        autoComplete="off"
        aria-label={PLACEHOLDER}
        className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-lg text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400 focus:border-neutral-900"
        onChange={(e) => {
          setText(e.target.value);
          setOpenMake(null);
          setOpen(true);
          if (chosen !== null && e.target.value !== chosen.display) onChoose(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {/* z-30 sits above the opening screen's "חפש" button (z-10) and above this list's own click-away
          backdrop (z-20): on desktop the button is laid out directly under the bar, so an open list would
          otherwise be painted over by it. */}
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-neutral-200 bg-white py-1 shadow-lg">
          {panel.kind === "makes" &&
            panel.makes.map((make) => (
              <button
                key={make}
                type="button"
                className="block w-full px-4 py-2.5 text-start text-neutral-900 hover:bg-neutral-100"
                onClick={() => {
                  setOpenMake(make);
                  setOpen(true);
                }}
              >
                {make}
              </button>
            ))}

          {panel.kind === "models" && (
            <>
              {panel.heading !== null && <div className="px-4 py-1.5 text-sm text-neutral-500">{panel.heading}</div>}
              {panel.models.map((m) => (
                <button key={m.key} type="button" className="block w-full px-4 py-2.5 text-start text-neutral-900 hover:bg-neutral-100" onClick={() => choose(m)}>
                  {m.display}
                </button>
              ))}
            </>
          )}

          {panel.kind === "none" && (
            <>
              <div className="px-4 py-2 text-sm text-neutral-500">{NOT_HERE_YET}</div>
              {models.map((m) => (
                <button key={m.key} type="button" className="block w-full px-4 py-2.5 text-start text-neutral-900 hover:bg-neutral-100" onClick={() => choose(m)}>
                  {m.display}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {open && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />}
    </div>
  );
}
