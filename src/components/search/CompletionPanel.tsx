"use client";

// The one list under both bars (S2 §4) and the one behaviour of both bars (S2 §5).
//
// <CompletionPanel> renders S1's Panel (src/lib/opening/completion.ts) — the opening screen's bar (ModelBar)
// and the question row's editor (QuestionRow, computer and phone) draw exactly this:
//   list    the notice, when there is one, as one grey line at the top; then each make's Hebrew name as a
//           header that cannot be chosen, and under it one row per model showing its nameHe alone ("3" under
//           "מאזדה"). A header sits close to its models, and the gap before the next make is about twice that.
//   grey    the grey line; under it, when there is one, the have-line and the groups as in `list`.
//   closed  nothing.
// The marked row has a light grey background. Nothing in the list is red.
//
// useFamilyBar() is what both bars do with it: the text, when the list is open, the mark the arrow keys move,
// what a choice does and what "חפש" / Enter with nothing marked does. The bars own only their own look.

import { useCallback, useMemo, useState } from "react";
import { completionPanel, exactModel, fullName, moveMark, panelModels, type FamilyEntry, type Panel, type PanelModel } from "@/lib/opening/completion";

// §4 — the vertical rhythm. Computer: a header 14 px above and 2 below, a model row 9 above and below.
// Phone: a header 16 and 2, a row 11. The rows' own look follows the list it replaces.
const LINE = "px-4 pt-2 pb-1 text-sm text-neutral-500";
const HEADER = "px-4 pt-4 pb-0.5 text-sm text-neutral-500 md:pt-3.5";
const ROW = "block w-full px-4 py-[11px] text-start text-neutral-900 hover:bg-neutral-100 md:py-[9px]";
const MARKED = "bg-neutral-100";

export default function CompletionPanel({
  panel,
  marked,
  onChoose,
  className,
}: {
  panel: Panel;
  /** The family id of the marked row; null = none. */
  marked: number | null;
  onChoose: (m: PanelModel) => void;
  /** The frame the bar puts the list in — under the bar, at its width, scrolling inside itself. */
  className: string;
}) {
  if (panel.kind === "closed") return null;
  return (
    <div className={className} role="listbox">
      {panel.kind === "list" && panel.notice !== null && <div className={LINE}>{panel.notice}</div>}
      {panel.kind === "grey" && <div className={LINE}>{panel.line}</div>}
      {panel.kind === "grey" && panel.haveLine !== null && <div className={LINE}>{panel.haveLine}</div>}
      {panel.groups.map((g) => (
        <div key={g.make.id} role="group" aria-label={g.make.nameHe}>
          <div className={HEADER}>{g.make.nameHe}</div>
          {g.models.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={m.id === marked}
              aria-label={m.fullName}
              className={`${ROW} ${m.id === marked ? MARKED : ""}`}
              onClick={() => onChoose(m)}
            >
              {m.nameHe}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

const CLOSED: Panel = { kind: "closed" };

export type FamilyBar = {
  text: string;
  panel: Panel;
  marked: number | null;
  /** The person is in the bar (it has the focus). */
  inUse: boolean;
  /** exactModel() of the text: the one live family it names, or null. */
  exact: FamilyEntry | null;
  /** A row chosen by a click, a touch, or Enter on the marked row. */
  choose: (m: PanelModel) => void;
  /** "חפש", and Enter with nothing marked. */
  submit: () => void;
  /** Close the list; the text stays. */
  closeList: () => void;
  /** Open the list, as a click into the bar does (the editor opening on a click on the model). */
  openList: () => void;
  /** Put a text in the bar without opening anything (the editor's prefill). */
  reset: (text: string) => void;
  /** Spread on the bar's input. */
  input: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onPointerDown: () => void;
    onFocus: () => void;
    onBlur: () => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  };
};

/**
 * S2 §5 — one bar's behaviour.
 *
 * The list opens on typing and on a click into the bar, closes when a model is chosen and on Esc (the text
 * stays), and opens again only on typing or a click into the bar. Arrow down / up move the mark through the
 * model rows; Enter on a marked row chooses it. Choosing fills the bar with the model's full name and hands its
 * family to `onChoose`. "חפש" / Enter with nothing marked searches the family the text names exactly; otherwise
 * the bar asks for a model: it takes the focus, the list opens with "צריך לבחור דגם." at its top, and when the
 * list has models its first row is marked, so a second Enter chooses it.
 *
 * `onEscape` is called on Esc while the list is already closed (the editor's cancel); `focus` puts the focus
 * back in the bar.
 */
export function useFamilyBar(
  families: FamilyEntry[],
  opts: { initialText?: string; onChoose: (familyId: number) => void; onEscape?: () => void; focus: () => void },
): FamilyBar {
  const [text, setText] = useState(opts.initialText ?? "");
  const [open, setOpen] = useState(false);
  const [needModel, setNeedModel] = useState(false);
  const [marked, setMarked] = useState<number | null>(null);
  const [inUse, setInUse] = useState(false);

  const panel = useMemo(() => (open ? completionPanel(families, text, needModel) : CLOSED), [open, families, text, needModel]);
  const models = panelModels(panel);
  const mark = marked !== null && models.some((m) => m.id === marked) ? marked : null;
  const exact = useMemo(() => exactModel(families, text), [families, text]);

  const closeList = useCallback(() => {
    setOpen(false);
    setNeedModel(false);
    setMarked(null);
  }, []);

  function choose(m: PanelModel) {
    setText(m.fullName);
    closeList();
    opts.onChoose(m.id);
  }

  function submit() {
    if (exact !== null) {
      setText(fullName(exact));
      closeList();
      opts.onChoose(exact.id);
      return;
    }
    opts.focus();
    setOpen(true);
    setNeedModel(true);
    const asked = completionPanel(families, text, true);
    const first = panelModels(asked)[0];
    setMarked(asked.kind === "list" && first !== undefined ? first.id : null);
  }

  return {
    text,
    panel,
    marked: mark,
    inUse,
    exact,
    choose,
    submit,
    closeList,
    openList: () => setOpen(true),
    reset: (t: string) => {
      setText(t);
      closeList();
    },
    input: {
      value: text,
      onChange: (e) => {
        setText(e.target.value);
        setNeedModel(false); // the notice answered a press; typing is a new state of the bar
        setMarked(null);
        setOpen(true);
      },
      onPointerDown: () => setOpen(true),
      onFocus: () => setInUse(true),
      onBlur: () => setInUse(false),
      onKeyDown: (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (models.length === 0) return;
          e.preventDefault();
          setMarked(moveMark(models, mark, e.key === "ArrowDown" ? 1 : -1));
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          if (panel.kind !== "closed") closeList();
          else opts.onEscape?.();
          return;
        }
        if (e.key !== "Enter") return;
        e.preventDefault();
        const m = mark === null ? undefined : models.find((x) => x.id === mark);
        if (m !== undefined) choose(m);
        else submit();
      },
    },
  };
}
