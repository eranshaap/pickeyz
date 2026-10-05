// The filters window's rules (BRIEF Run 8b §1, §2.4, §3) — PURE, and the only place a chip's state is decided.
//
// WHERE IT RUNS (§2.2). This module is imported by the results page AND by the browser: resolveFilters() runs
// where the component renders — on the server for the first paint, in the browser for every edit after it —
// so a chip click and a price edit make NO server call. Run 8 resolved the filters window in an action and the
// component rendered only the server's answer, which put a network round trip in front of every click; that
// is what Run 8b takes out. The one call left is the model's rows (§2.3), and it is not this module's
// business: this module is given rows and answers questions about them.
//
// THE VOCABULARY (§1.1). A CHIP belongs to one of the three chip groups — years (multi-select), km ceiling
// (single-select), region (multi-select). The TYPED VALUES are the two price fields. The DRAFT is what the
// user has chosen: the set of chosen chips plus the typed values, carried in the canonical SearchFilters of
// filters.ts — there is no parallel filters shape, and a chip remembers only that it was chosen: no order,
// no history. A chip is in one of THREE states, and there is no fourth:
//
//   chosen    in the draft. Counted in the filters and in "עדכן · N", whatever its count is.
//   off       not in the draft, count > 0. Clickable — it switches on.
//   off-0     not in the draft, count 0. A real `disabled` button; the "0" is still shown.
//
// RUN 8's "DORMANT" CHIP IS CANCELLED (§1.2, ruled 24/09 and confirmed as restated). A chosen chip that an
// edit takes to 0 does not go grey and does not wait to be woken: it simply LEAVES THE SELECTION and becomes
// an ordinary off / off-0 chip. It never comes back by itself — deleting the price that emptied it leaves it
// off, with its number back, for the user to click if they want it again. There is no memory of any kind, and
// therefore no state, no look and no waking rule to carry.
//
// A CHIP'S COUNT keeps today's definition exactly (counts.ts §0.11): listings in that option within the
// OTHER groups' chosen chips and the typed values, its own group ignored — so touching a chip inside a group
// never moves that group's numbers. The counting predicate is the search's own (filters.ts), here as
// everywhere else.

import { countPassing, normalizeFilters, sameFilters, type Filterable, type SearchFilters } from "./filters";

/** The three chip groups. The name is the SearchFilters key the group writes, so nothing translates. */
export type ChipGroup = "years" | "kmMax" | "regions";

/** §1.1 — three states, and no fourth. `off-0` is the one that cannot be clicked on. */
export type ChipState = "chosen" | "off" | "off-0";

/** A chip as the filters window draws it. `value` is the year, the km ceiling or the region name. */
export type ChipView<V extends number | string = number | string> = {
  group: ChipGroup;
  value: V;
  state: ChipState;
  count: number;
};

/** Which chip a click is about. The component sends this and nothing else. */
export type ChipRef = { group: ChipGroup; value: number | string };

/**
 * The filters window, resolved. `years`/`km`/`regions` are the SHELF's chips in the shelf's own order; `total` is
 * the number on the "עדכן · N" button — the pool under the draft as it stands.
 *
 * There is no `effective` and no `emptyCombination` any more (§1.4): after an edit the draft cannot hold a
 * chip at 0, so what "עדכן" sends IS the draft (applyFilters below), and the only way the pool can be empty
 * is a typed price that leaves nothing — which the button says as "עדכן · 0", as it always did.
 */
export type ResolvedFilters = {
  years: ChipView<number>[];
  km: ChipView<number>[];
  regions: ChipView<string>[];
  total: number;
};

/**
 * §2.1 — ONE MODEL'S LIVE FILTER ROWS, as the page carries them to the browser and as the model-rows action
 * returns them. `rows` holds only the fields countPassing() reads (filters.ts's Filterable): no listing id
 * and no other listing data. `km_anchors` are the family's km chips, computed per family from its live listings'
 * km when the rows load (S3: src/lib/search/km-anchors.ts, through counts.ts) — null means the model has no km
 * group at all, and `km_note` says why.
 */
export type ModelRows = {
  model: string; // the display spelling, as models.model holds it
  model_key: string; // modelKey(model) — what the search is run with
  rows: Filterable[];
  km_anchors: number[] | null;
  km_note: string | null;
};

/** §1.2 / §3 — which chips the filters window offers for one model, in the shelf's usual order. */
export type FiltersShelf = {
  years: number[];
  km_anchors: number[] | null;
  regions: string[];
};

// ---------------------------------------------------------------------------
// §2.4 / §3 — THE SHELF, built where the resolve runs
// ---------------------------------------------------------------------------

/**
 * §2.4 — the shelf's arithmetic, which lived in the `"use server"` counts.ts (shelfOf) and is pure: it moved
 * here so the browser can build it from the rows the page carries. §3 adds the one new rule to it.
 *
 * §3 — THE SHELF KEEPS THE ON-SCREEN QUESTION'S OWN VALUES (D3, ruled 24/09). The shelf is the options WITH
 * STOCK in the rows plus the stored question's own values in every group — years, regions and the km ceiling
 * — deduplicated, in the shelf's usual order. So a stored value whose last car has left the pool is still
 * drawn: chosen with count 0 on open (§1.3), off-0 after the first edit releases it (§1.2). Only the
 * ON-SCREEN question's values join; the draft's do not — a value can only enter the draft from the shelf, and
 * after "עדכן" the NEW question's values define the new page's shelf.
 *
 * `stored` is null on the opening screen (no question), where nothing joins.
 *
 * THE ONE CASE THIS RULE DOES NOT REACH, flagged in REPORT.md: when `km_anchors` is null the model has no km
 * group at all (counts.ts §5, unchanged) — there is no block for a stored ceiling to join, so a stored
 * `kmMax` is not drawn. It cannot arise from a question asked through this window (a ceiling can only be
 * chosen from an anchor), only from anchors deleted after the fact.
 */
export function shelfOf(model: ModelRows, stored: SearchFilters | null): FiltersShelf {
  const storedKm = stored?.kmMax;
  return {
    years: [...new Set([...model.rows.map((r) => r.year), ...(stored?.years ?? [])])].sort((a, b) => a - b),
    km_anchors:
      model.km_anchors === null ? null : [...new Set([...model.km_anchors, ...(storedKm === undefined ? [] : [storedKm])])].sort((a, b) => a - b),
    regions: [...new Set([...model.rows.map((r) => r.region).filter((v): v is string => v !== null), ...(stored?.regions ?? [])])].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}

// ---------------------------------------------------------------------------
// the filters arithmetic, expressed once
// ---------------------------------------------------------------------------

/** The typed values alone — the half of a draft no chip can be released from. */
function typedOnly(draft: SearchFilters): SearchFilters {
  const e: SearchFilters = {};
  if (draft.priceMin !== undefined) e.priceMin = draft.priceMin;
  if (draft.priceMax !== undefined) e.priceMax = draft.priceMax;
  return e;
}

/** One group replaced by ONE option — the composed draft §0.11 of counts.ts counts an option within. */
function only(group: ChipGroup, value: number | string): SearchFilters {
  if (group === "years") return { years: [value as number] };
  if (group === "kmMax") return { kmMax: value as number };
  return { regions: [value as string] };
}

/** The same filters with one group dropped entirely — "the OTHER groups", as the counter's rule says. */
function without(f: SearchFilters, group: ChipGroup): SearchFilters {
  const out: SearchFilters = { ...f };
  delete out[group];
  return out;
}

/** The chosen chips of one group, in the draft's own order. km is single-valued and yields 0 or 1. */
function chosenOf(draft: SearchFilters, group: ChipGroup): (number | string)[] {
  if (group === "years") return draft.years ?? [];
  if (group === "kmMax") return draft.kmMax === undefined ? [] : [draft.kmMax];
  return draft.regions ?? [];
}

const GROUPS: readonly ChipGroup[] = ["years", "kmMax", "regions"];

/** A chosen chip's identity as a map key. No group name contains ":", so the prefix is unambiguous. */
const idOf = (group: ChipGroup, value: number | string): string => `${group}:${String(value)}`;

/** The filters a set of chosen chips plus the typed values makes. */
function filtersOf(typed: SearchFilters, chosen: { group: ChipGroup; value: number | string }[]): SearchFilters {
  const f: SearchFilters = { ...typed };
  const years = chosen.filter((c) => c.group === "years").map((c) => c.value as number);
  const regions = chosen.filter((c) => c.group === "regions").map((c) => c.value as string);
  const km = chosen.find((c) => c.group === "kmMax");
  if (years.length > 0) f.years = years;
  if (regions.length > 0) f.regions = regions;
  if (km !== undefined) f.kmMax = km.value as number;
  return f;
}

/** Every chosen chip of a draft, group by group. */
function chosenChips(draft: SearchFilters): { group: ChipGroup; value: number | string }[] {
  return GROUPS.flatMap((group) => chosenOf(draft, group).map((value) => ({ group, value })));
}

/** §1.1 — a chip's count: its own option within the OTHER groups' chosen chips and the typed values. */
function countOf(pool: Filterable[], draft: SearchFilters, group: ChipGroup, value: number | string): number {
  return countPassing(pool, { ...without(draft, group), ...only(group, value) });
}

// ---------------------------------------------------------------------------
// §1.1 — the one function that draws
// ---------------------------------------------------------------------------

/**
 * §1.1 — every chip of the shelf with its state and its count, and the button's number. No iteration and no
 * decision: a chosen chip is `chosen`, whatever its count; a chip that is not in the draft is `off` with
 * cars and `off-0` without them.
 *
 * A chosen value the shelf does not offer has no chip to draw and is not drawn — §3 makes that unreachable
 * for the on-screen question's own values, which always join the shelf. It is still in the draft, still in
 * `total`, and still released by the first edit like any other chosen chip at 0.
 */
export function resolveFilters(pool: Filterable[], shelf: FiltersShelf, draft: SearchFilters): ResolvedFilters {
  const chosen = new Set(chosenChips(draft).map((c) => idOf(c.group, c.value)));

  const view = <V extends number | string>(group: ChipGroup, value: V): ChipView<V> => {
    const count = countOf(pool, draft, group, value);
    const state: ChipState = chosen.has(idOf(group, value)) ? "chosen" : count > 0 ? "off" : "off-0";
    return { group, value, state, count };
  };

  return {
    years: shelf.years.map((y) => view("years", y)),
    km: (shelf.km_anchors ?? []).map((k) => view("kmMax", k)),
    regions: shelf.regions.map((r) => view("regions", r)),
    total: countPassing(pool, draft),
  };
}

// ---------------------------------------------------------------------------
// §1.2 — the release, and the edits that carry it
// ---------------------------------------------------------------------------

/**
 * §1.2 — THE RELEASE. After every edit, in ONE pass: every chosen chip whose count is 0 leaves the draft.
 *
 * AN EDIT IS: a chip toggle that changes the draft (toggleChip below applies the release itself), a settled
 * price — typed, changed or deleted — and a change of the active model. Each of the three returns the draft
 * AFTER the release, so the component commits exactly what this library returns and derives nothing.
 *
 * ONE PASS IS ENOUGH. If a chip c survives, some car x in the pool matches c's own option and every other
 * group of the draft. For each other group h, x's own value v in h is chosen and its count is at least 1
 * (x itself witnesses it), so v survives too — x therefore still matches the released draft, and c's count
 * is still at least 1. No chosen chip is left at 0 (asserted in chip-state.test.ts, case 13).
 *
 * NO MEMORY OF ANY KIND: a released chip is an ordinary off / off-0 chip. Deleting the price that emptied it
 * gives it its number back and nothing else — to have it chosen again the user clicks it.
 *
 * The draft is returned AS IT IS — the same object — when nothing is released, so an edit that changes
 * nothing re-renders nothing.
 */
export function release(pool: Filterable[], draft: SearchFilters): SearchFilters {
  const chosen = chosenChips(draft);
  const keep = chosen.filter((c) => countOf(pool, draft, c.group, c.value) > 0);
  if (keep.length === chosen.length) return draft;
  return filtersOf(typedOnly(draft), keep);
}

/** Find a chip in the resolved window. A click on a chip the window does not offer is a bug, not a no-op. */
function viewOf(resolved: ResolvedFilters, chip: ChipRef): ChipView {
  const list: ChipView[] = chip.group === "years" ? resolved.years : chip.group === "kmMax" ? resolved.km : resolved.regions;
  const found = list.find((c) => c.value === chip.value);
  if (found === undefined) throw new Error(`toggleChip: no ${chip.group} chip ${JSON.stringify(chip.value)} in the resolved window`);
  return found;
}

/**
 * §1.2 — a click, with the release included in what comes back.
 *
 *   off-0    THE DRAFT IS RETURNED UNCHANGED — the same object. A click on an off-0 chip is not an edit:
 *            nothing re-renders, nothing is released, nothing is sent. (The chip is a real `disabled`
 *            button, so the handler should not fire at all; this is the belt behind those braces.)
 *   off      chosen; in a single-select group it replaces whatever the group had chosen
 *   chosen   removed from the chosen set
 */
export function toggleChip(pool: Filterable[], draft: SearchFilters, resolved: ResolvedFilters, chip: ChipRef): SearchFilters {
  const view = viewOf(resolved, chip);
  if (view.state === "off-0") return draft;

  const next: SearchFilters = { ...draft };
  if (chip.group === "kmMax") {
    // single-select: choosing replaces whatever was chosen, clicking the chosen one clears the group
    if (view.state === "off") next.kmMax = chip.value as number;
    else delete next.kmMax;
  } else if (chip.group === "years") {
    const years = (draft.years ?? []).filter((y) => y !== chip.value);
    if (view.state === "off") years.push(chip.value as number);
    if (years.length === 0) delete next.years;
    else next.years = years;
  } else {
    const regions = (draft.regions ?? []).filter((r) => r !== chip.value);
    if (view.state === "off") regions.push(chip.value as string);
    if (regions.length === 0) delete next.regions;
    else next.regions = regions;
  }
  return release(pool, next);
}

// ---------------------------------------------------------------------------
// §1.3 / §1.4 — the other pure functions
// ---------------------------------------------------------------------------

/**
 * §1.3 — ON OPEN, NOTHING IS RELEASED. The stored question is drawn AS IT IS: a chip whose count is 0 now,
 * because the market changed since the question was asked, is drawn CHOSEN with its count 0, and
 * isUnchanged() is true — so the button is greyed, as ruled (greyed while nothing changed). The first edit
 * releases it like any other chosen chip at 0.
 */
export function draftFromQuestion(stored: SearchFilters): SearchFilters {
  return normalizeFilters(stored);
}

/**
 * §1.4 — the ONE predicate behind both the greyed "עדכן" and Run 7 §1.3's "apply with no change = cancel":
 * the chosen set plus the typed values against the stored question, through the canonical deep-equal of
 * filters.ts.
 *
 * The consequence to keep: a price typed, releasing a chip, then deleted is NOT unchanged — the chip does
 * not come back, so the draft is not the stored question any more and the button stays lit.
 */
export function isUnchanged(draft: SearchFilters, stored: SearchFilters): boolean {
  return sameFilters(draft, stored);
}

/**
 * §1.4 — what "עדכן" sends: THE DRAFT AS IT STANDS. After an edit nothing at 0 can be in it (release), and
 * the unchanged stored question never gets here — it is cancelled by "עדכן", as today.
 */
export function applyFilters(draft: SearchFilters): SearchFilters {
  return draft;
}
