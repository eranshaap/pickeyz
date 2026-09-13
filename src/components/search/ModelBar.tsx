"use client";

// The model bar (BRIEF Days 15–16, Run 2b §5; Run 2c §6) — a two-level autocomplete over LIVE models only.
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
//
// THE EDIT MODE (Run 2c §6) — the same bar, opened IN PLACE in the results header when the model in the
// question line is tapped. It arrives prefilled with the asked model's display name, the text selected so
// typing replaces it (§0.2), and the list already open beneath it. Every rule above still holds inside it.
// Cancel is a click outside the bar and its list, Esc, or Enter on the asked model's own name (§0.1) — all
// three call `edit.onCancel()`; choosing a model calls `onChoose`, and the SCREEN decides whether that is a
// new question or a cancel. Nothing here knows about the results, the dim or the history stack.

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveModel } from "@/lib/search/models";

const PLACEHOLDER = "איזה רכב מעניין אותך?";
const NOT_HERE_YET = "הדגם עוד לא אצלנו; כרגע:";

const norm = (s: string): string => s.trim().toLowerCase();

export default function ModelBar({
  models,
  chosen,
  onChoose,
  onSubmit,
  edit = null,
}: {
  models: LiveModel[];
  chosen: LiveModel | null;
  onChoose: (m: LiveModel | null) => void;
  /** Enter on an already chosen model = a full search on the whole model pool (§5). Not used in edit mode. */
  onSubmit: () => void;
  /** §6 — non-null turns the bar into the results screen's model editor. */
  edit?: { onCancel: () => void } | null;
}) {
  const [text, setText] = useState(chosen?.display ?? "");
  const [open, setOpen] = useState(edit !== null); // §0.2 — the editor arrives with its list already down
  const [openMake, setOpenMake] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const editing = edit !== null;

  // §0.2 — the editor opens prefilled, with the text selected, so typing replaces it. The list is already
  // down: `open` starts true in edit mode, which is state and not something an effect has to set.
  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

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
    if (e.key === "Escape" && edit !== null) {
      e.preventDefault();
      edit.onCancel(); // §6 — Esc is one of the three cancels
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (isChosenText) {
      setOpen(false);
      // §0.1 — inside the editor, the asked model again is a cancel, not a search
      if (edit !== null) edit.onCancel();
      else onSubmit(); // §5: Enter on a chosen model searches the whole model pool
      return;
    }
    if (modelHits.length === 1) return choose(modelHits[0]);
    if (makeHits.length === 1) {
      setOpenMake(makeHits[0]); // §5: Enter on a manufacturer OPENS its models, it does not search
      setOpen(true);
      return;
    }
    setOpen(true); // unresolved text: show "הדגם עוד לא אצלנו" and the live models, clickable (§6)
  }

  return (
    // In edit mode the bar must stay above its own click-away backdrop, which covers the dimmed results.
    <div className={`relative w-full ${editing ? "z-30" : ""}`}>
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
          // Typing over the name un-chooses the model on the opening screen. In the editor it does NOT: the
          // asked question stays exactly as it is until a model is chosen or the editor is cancelled (§6).
          if (!editing && chosen !== null && e.target.value !== chosen.display) onChoose(null);
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

      {/* The click-away. In the editor it is always there and it CANCELS (§6): a click outside the bar and its
          list restores the asked model. On the opening screen it only closes the list, as it always did. */}
      {(open || editing) && (
        <button
          type="button"
          aria-label={editing ? "ביטול" : undefined}
          aria-hidden={editing ? undefined : true}
          tabIndex={-1}
          className="fixed inset-0 z-20 cursor-default"
          onClick={() => (edit !== null ? edit.onCancel() : setOpen(false))}
        />
      )}
    </div>
  );
}
