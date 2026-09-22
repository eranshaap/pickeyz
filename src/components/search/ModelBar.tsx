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
const CURRENT_MODEL = "הדגם הנוכחי"; // Run 6b §6 — the marker the question row puts on the asked model

const norm = (s: string): string => s.trim().toLowerCase();

// ---------------------------------------------------------------------------
// The completion, exported for Run 6b §6 (ALLOWED: "reuse/export of the completion for §6 only").
//
// The question row opens this same two-level autocomplete in place of the results header, so the resolution
// order — an opened manufacturer, then a model prefix, then a manufacturer prefix, then nothing found — is
// decided in ONE function and rendered by ONE component. Nothing about the behaviour changed when it moved
// out of the component body: the bar below calls exactly what it used to compute inline.
// ---------------------------------------------------------------------------

export type Panel = { kind: "makes"; makes: string[] } | { kind: "models"; models: LiveModel[]; heading: string | null } | { kind: "none" };

/** Every manufacturer among the live models, by listing count then name. */
export function makesOf(models: LiveModel[]): string[] {
  const seen = new Map<string, number>();
  for (const m of models) seen.set(m.make, (seen.get(m.make) ?? 0) + m.listings);
  return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([make]) => make);
}

export type Completion = { panel: Panel; makeHits: string[]; modelHits: LiveModel[]; isChosenText: boolean };

/** What the open list shows, and the two hit lists Enter resolves against. Pure. */
export function completion(models: LiveModel[], text: string, chosenDisplay: string | null, openMake: string | null): Completion {
  const makes = makesOf(models);
  const q = norm(text);
  const isChosenText = chosenDisplay !== null && text === chosenDisplay;
  const makeHits = q === "" ? [] : makes.filter((m) => norm(m).startsWith(q));
  const modelHits = q === "" || isChosenText ? [] : models.filter((m) => norm(m.model).startsWith(q));

  let panel: Panel;
  if (openMake !== null) panel = { kind: "models", models: models.filter((m) => m.make === openMake), heading: openMake };
  else if (q === "" || isChosenText) panel = { kind: "makes", makes };
  else if (modelHits.length > 0) panel = { kind: "models", models: modelHits, heading: null };
  else if (makeHits.length === 1) panel = { kind: "models", models: models.filter((m) => m.make === makeHits[0]), heading: makeHits[0] };
  else if (makeHits.length > 1) panel = { kind: "makes", makes: makeHits };
  else panel = { kind: "none" };

  return { panel, makeHits, modelHits, isChosenText };
}

/**
 * The list itself. `currentKey` marks the asked model with "הדגם הנוכחי" (§6); the bar passes null and the
 * list looks exactly as it always did.
 */
export function CompletionList({
  panel,
  models,
  currentKey = null,
  onChoose,
  onOpenMake,
}: {
  panel: Panel;
  models: LiveModel[];
  currentKey?: string | null;
  onChoose: (m: LiveModel) => void;
  onOpenMake: (make: string) => void;
}) {
  const row = (m: LiveModel) => (
    <button
      key={m.key}
      type="button"
      className="flex w-full items-baseline gap-2 px-4 py-2.5 text-start text-neutral-900 hover:bg-neutral-100"
      onClick={() => onChoose(m)}
    >
      <span>{m.display}</span>
      {m.key === currentKey && <span className="text-sm text-neutral-500">{CURRENT_MODEL}</span>}
    </button>
  );

  return (
    <>
      {panel.kind === "makes" &&
        panel.makes.map((make) => (
          <button key={make} type="button" className="block w-full px-4 py-2.5 text-start text-neutral-900 hover:bg-neutral-100" onClick={() => onOpenMake(make)}>
            {make}
          </button>
        ))}

      {panel.kind === "models" && (
        <>
          {panel.heading !== null && <div className="px-4 py-1.5 text-sm text-neutral-500">{panel.heading}</div>}
          {panel.models.map(row)}
        </>
      )}

      {panel.kind === "none" && (
        <>
          <div className="px-4 py-2 text-sm text-neutral-500">{NOT_HERE_YET}</div>
          {models.map(row)}
        </>
      )}
    </>
  );
}

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

  const { panel, makeHits, modelHits, isChosenText } = useMemo(() => completion(models, text, chosen?.display ?? null, openMake), [models, text, chosen, openMake]);

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
          <CompletionList
            panel={panel}
            models={models}
            onChoose={choose}
            onOpenMake={(make) => {
              setOpenMake(make);
              setOpen(true);
            }}
          />
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
