"use client";

// The question line (BRIEF Days 15–16, Run 2b §5) — what the shown picks answer, fixed at the top of the
// results. It is what the model bar BECAME after the merge animation.
//
// It shows the question that was ASKED, never the draft: while the drawer is open and the draft has moved,
// this line does not move with it. That is the whole point of having two states — the line says what the
// three cars on screen are an answer to, and the results dim instead of lying.
//
// One rubric per ACTIVE filter and nothing for the rest: an inactive filter has no rubric (§5). Tapping a
// rubric opens the drawer (mobile) or focuses the panel (desktop) on that filter; "+ פילטרים" opens it whole.
//
// Run 2c §6: the MODEL NAME is a control too — a rubric like the others. Tapping it opens the model editor in
// the header, in place of this line; the line comes back on cancel, still showing the asked question.

import type { SearchFilters } from "@/lib/search/filters";
import type { FilterName } from "@/app/actions/search";
import { FILTER_LABEL, km, num, shekel } from "./labels";

const ADD_FILTERS = "+ פילטרים";

/** §5's rubric formats, one per filter. null = the filter is not active and has no rubric. */
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

export default function QuestionLine({
  modelDisplay,
  filters,
  active,
  onOpen,
  onEditModel,
}: {
  modelDisplay: string;
  filters: SearchFilters;
  active: FilterName[];
  /** null = the whole drawer / panel; a name = opened focused on that filter. */
  onOpen: (focus: FilterName | null) => void;
  /** §6 — the model is a rubric: tapping it opens the editor in the header. */
  onEditModel: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-neutral-200 bg-white px-4 py-3">
      <button type="button" className="rounded-lg font-semibold text-neutral-900 underline-offset-4 hover:underline" onClick={onEditModel}>
        {modelDisplay}
      </button>
      {active.map((name) => {
        const value = rubric(name, filters);
        if (value === null) return null;
        return (
          <span key={name} className="flex items-center gap-1 text-neutral-500">
            <span aria-hidden>·</span>
            <button
              type="button"
              className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-800 hover:bg-neutral-200"
              onClick={() => onOpen(name)}
            >
              <span className="text-neutral-500">{FILTER_LABEL[name]} </span>
              {value}
            </button>
          </span>
        );
      })}
      <span className="flex items-center gap-1 text-neutral-500">
        <span aria-hidden>·</span>
        <button type="button" className="rounded-full px-3 py-1 text-sm text-neutral-600 underline-offset-4 hover:underline" onClick={() => onOpen(null)}>
          {ADD_FILTERS}
        </button>
      </span>
    </div>
  );
}
