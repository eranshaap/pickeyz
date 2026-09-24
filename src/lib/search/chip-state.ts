// The drawer's rules (BRIEF Run 8 §1) — PURE, and the only place a chip's state is decided.
//
// FilterPanel.tsx and SearchScreen.tsx render and forward; they decide nothing. The page (§3.1) and the
// resolve action (§3.3) both call resolveDrawer(), so the drawer on arrival and the drawer after an edit are
// computed by ONE piece of code and cannot disagree.
//
// THE VOCABULARY (§1.1). A CHIP belongs to one of the three chip groups — years (multi-select), km ceiling
// (single-select), region (multi-select). The TYPED VALUES are the two price fields. The DRAFT is what the
// user has chosen: the set of chosen chips plus the typed values, carried in the canonical SearchFilters of
// filters.ts — there is no parallel filters shape, and a chip remembers only that it was chosen: no order,
// no history. A chip is in one of three states:
//
//   off       not chosen. Clickable (switches on) ONLY if its count is > 0; with count 0 it is NOT
//             SELECTABLE (findCar-now.md: "צ'יפ עם מונה 0 אינו ניתן לבחירה" — this cancels "מונה 0 אינו נועל").
//   awake     chosen, count > 0. Counted in the filters and in "עדכן · N".
//   dormant   chosen, count 0. Drawn greyed (§2.2), NOT in the filters and NOT in "עדכן · N", and it wakes
//             by itself the moment its count returns above 0 — whichever filter was released.
//
// A CHIP'S COUNT keeps today's definition exactly (counts.ts §0.11): listings in that option within the
// OTHER groups' effective filters, its own group ignored — so touching a chip inside a group never moves
// that group's numbers. "Effective filters" = the awake chips + the typed values; a dormant chip is not in
// them. The counting predicate is the search's own (filters.ts), here as everywhere else.

import { countPassing, normalizeFilters, sameFilters, type Filterable, type SearchFilters } from "./filters";

/** The three chip groups. The name is the SearchFilters key the group writes, so nothing translates. */
export type ChipGroup = "years" | "kmMax" | "regions";

export type ChipState = "off" | "awake" | "dormant";

/** A chip as the drawer draws it. `value` is the year, the km ceiling or the region name. */
export type ChipView<V extends number | string = number | string> = {
  group: ChipGroup;
  value: V;
  state: ChipState;
  count: number;
  /** §1.1 — an off chip with count 0 is not selectable; a chosen chip is always clickable (it switches off). */
  selectable: boolean;
};

/** Which chip a click is about. The component sends this and nothing else. */
export type ChipRef = { group: ChipGroup; value: number | string };

/**
 * The drawer, resolved. `years`/`km`/`regions` are the SHELF's chips in the shelf's own order; `effective`
 * is what "עדכן" would send; `total` is the number on the button.
 */
export type ResolvedDrawer = {
  years: ChipView<number>[];
  km: ChipView<number>[];
  regions: ChipView<string>[];
  effective: SearchFilters;
  total: number;
  /** §1.2 step 2 — the chosen chips leave nothing TOGETHER although none of them is a culprit on its own. */
  emptyCombination: boolean;
};

/** §1.2 — which chips the drawer offers for one model. The shape counts.ts's filterShelf() already returns. */
export type DrawerShelf = {
  years: number[];
  km_anchors: number[] | null;
  regions: string[];
};

// ---------------------------------------------------------------------------
// the filters arithmetic, expressed once
// ---------------------------------------------------------------------------

/** The typed values alone — E of §1.2 step 1. */
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

// ---------------------------------------------------------------------------
// §1.2 — the one function that decides
// ---------------------------------------------------------------------------

/**
 * §1.2 — every chip with its state and count, the effective filters, the button's number, and whether the
 * combination is empty. Deterministic, four steps, no iteration:
 *
 *  1. PRICE ALONE. E = the typed values only. Every chosen chip whose count within E is 0 is DORMANT — the
 *     price on its own leaves it nothing.
 *  2. THE COMBINATION. Add the remaining chosen chips to E. If the pool under E is EMPTY: stop — the
 *     remaining chips stay AWAKE, `total` is 0 and `emptyCombination` is true. That is the existing
 *     emptied-pool situation and it keeps today's behaviour (§5); the drawer does not pick a culprit when no
 *     single chip is one.
 *  3. CHIPS THAT ADD NOTHING. Otherwise every remaining chosen chip whose count within E's OTHER groups is 0
 *     is DORMANT. This can only happen inside a multi-select group whose other chip carries the pool (2021
 *     and 2022 chosen, a region chosen, and every car in that region under the price is a 2022). Putting
 *     such a chip to sleep does not change the pool, so ONE pass is enough.
 *  4. RESULT. Effective = E minus the dormant chips; `total` = the pool under it; every chip's displayed
 *     count is taken within the effective filters of the other groups. A dormant chip's displayed count is
 *     therefore always 0 — its count can only shrink when more filters are added.
 *
 * Why step 2 is rare and why clicks never cause it: a chip can only be switched ON while its count is > 0
 * (§1.1), so a click never empties the pool. Only a typed price — or the market changing since the question
 * was asked — can.
 *
 * A chosen value the shelf does not offer (a year whose last car left the pool since the question was
 * stored) has no chip to draw. It is still resolved: its count is 0, so step 1 puts it to sleep and it drops
 * out of `effective` exactly like any other dormant chip. Nothing special-cases it.
 */
export function resolveDrawer(pool: Filterable[], shelf: DrawerShelf, draft: SearchFilters): ResolvedDrawer {
  const typed = typedOnly(draft);
  const chosen = GROUPS.flatMap((group) => chosenOf(draft, group).map((value) => ({ group, value })));

  // step 1 — the price alone
  const dormant = new Set<string>();
  for (const c of chosen) {
    if (countPassing(pool, { ...typed, ...only(c.group, c.value) }) === 0) dormant.add(idOf(c.group, c.value));
  }

  // step 2 — the combination
  const remaining = chosen.filter((c) => !dormant.has(idOf(c.group, c.value)));
  const combined = filtersOf(typed, remaining);
  const emptyCombination = countPassing(pool, combined) === 0;

  // step 3 — chips that add nothing (skipped entirely when step 2 stopped early)
  if (!emptyCombination) {
    for (const c of remaining) {
      if (countPassing(pool, { ...without(combined, c.group), ...only(c.group, c.value) }) === 0) dormant.add(idOf(c.group, c.value));
    }
  }

  // step 4 — the effective filters, the button's number, and every chip's displayed count
  const effective = filtersOf(
    typed,
    chosen.filter((c) => !dormant.has(idOf(c.group, c.value))),
  );
  const total = countPassing(pool, effective);

  const view = <V extends number | string>(group: ChipGroup, value: V): ChipView<V> => {
    const id = idOf(group, value);
    const isChosen = chosen.some((c) => idOf(c.group, c.value) === id);
    const count = countPassing(pool, { ...without(effective, group), ...only(group, value) });
    const state: ChipState = !isChosen ? "off" : dormant.has(id) ? "dormant" : "awake";
    return { group, value, state, count, selectable: state !== "off" || count > 0 };
  };

  return {
    years: shelf.years.map((y) => view("years", y)),
    km: (shelf.km_anchors ?? []).map((k) => view("kmMax", k)),
    regions: shelf.regions.map((r) => view("regions", r)),
    effective,
    total,
    emptyCombination,
  };
}

// ---------------------------------------------------------------------------
// §1.3 — the other pure functions
// ---------------------------------------------------------------------------

/**
 * The draft the drawer opens with: the stored question's chips as chosen, its price bounds as typed. A
 * stored question never contains a dormant chip — applyFilters() below is what writes it — so this is a
 * normalisation and never a translation.
 */
export function draftFromQuestion(stored: SearchFilters): SearchFilters {
  return normalizeFilters(stored);
}

/** Find a chip in the resolved drawer. A click on a chip the drawer does not offer is a bug, not a no-op. */
function viewOf(resolved: ResolvedDrawer, chip: ChipRef): ChipView {
  const list: ChipView[] = chip.group === "years" ? resolved.years : chip.group === "kmMax" ? resolved.km : resolved.regions;
  const found = list.find((c) => c.value === chip.value);
  if (found === undefined) throw new Error(`toggleChip: no ${chip.group} chip ${JSON.stringify(chip.value)} in the resolved drawer`);
  return found;
}

/**
 * §1.3 — a click.
 *
 *   off with count 0     the draft is returned UNCHANGED (nothing happens, no request)
 *   off with count > 0   chosen; in a single-select group it replaces the group's chosen chip, whose memory
 *                        is thereby cleared
 *   awake or dormant     removed from the chosen set — a manual switch-off clears the memory, and after it
 *                        count changes never wake it
 */
export function toggleChip(draft: SearchFilters, resolved: ResolvedDrawer, chip: ChipRef): SearchFilters {
  const view = viewOf(resolved, chip);
  if (view.state === "off" && !view.selectable) return draft;

  const next: SearchFilters = { ...draft };
  if (chip.group === "kmMax") {
    // single-select: choosing replaces whatever was chosen, clicking the chosen one clears the group
    if (view.state === "off") next.kmMax = chip.value as number;
    else delete next.kmMax;
    return next;
  }
  if (chip.group === "years") {
    const years = (draft.years ?? []).filter((y) => y !== chip.value);
    if (view.state === "off") years.push(chip.value as number);
    if (years.length === 0) delete next.years;
    else next.years = years;
    return next;
  }
  const regions = (draft.regions ?? []).filter((r) => r !== chip.value);
  if (view.state === "off") regions.push(chip.value as string);
  if (regions.length === 0) delete next.regions;
  else next.regions = regions;
  return next;
}

/**
 * §1.3 — the ONE predicate behind both the greyed "עדכן" (§2.3) and Run 7 §1.3's "apply with no effective
 * change = cancel". It compares the CHOSEN SET — awake and dormant together — plus the typed values against
 * the stored question, through the canonical deep-equal of filters.ts.
 *
 * A dormant chip cannot appear without another change that already lit the button. The one case where one
 * appears with nothing done — a stored chip that is 0 on open because the market changed — keeps the button
 * greyed, by rule: the chosen set is still the stored question's.
 */
export function isUnchanged(draft: SearchFilters, stored: SearchFilters): boolean {
  return sameFilters(draft, stored);
}

/**
 * §1.3 — what "עדכן" sends: the effective filters. A dormant chip is never sent, never stored and therefore
 * forgotten at "עדכן" — the filter session ends there, with no extra mechanism.
 */
export function applyFilters(resolved: ResolvedDrawer): SearchFilters {
  return resolved.effective;
}
