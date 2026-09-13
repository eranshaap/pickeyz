"use server";

// The filter counters (BRIEF Days 15–16, §4). The grey number on every option in the drawer.
//
// WHAT A COUNTER IS: the size of the pool AFTER pressing that option — the whole draft, with that one option
// toggled (selected → removed, unselected → added) — plus an arrow saying whether that is more or less than
// the draft's own size. A shelf fact, nothing more: no colours, no deltas, no ranking, no recommendation, and
// a 0 never disables anything (the filling order is not the order of importance).
//
// STOCK IS NOT A VERDICT: the number counts listings that survive the cut. It does not promise that the three
// categories will fill — a pool can be large and still leave a category empty-with-a-reason.
//
// WHERE THE NUMBERS COME FROM (the cross-cutting rule of days 15–16): a MEASUREMENT of the market — a norm, a
// quartile, a median — happens only on the norms beat. A DERIVATIVE of what is already stored is free at
// request time. These counters are the second kind: one fetch of the model's live listings, then arithmetic
// in memory, one pass per option. The km chips are the first kind and are NOT computed here — they are read
// from model_stats.km_filter_anchors, which the norms run wrote (§1).
//
// The counting predicate is the search's own (src/lib/search/filters.ts). A counter with its own rule would
// promise a pool the search would not deliver.

import { db } from "@/lib/db";
import { modelKey } from "./assemble";
import { countPassing, kmActive, priceActive, type Filterable, type SearchFilters } from "./filters";

export type Direction = "up" | "down" | "same";

export type OptionCount = {
  count: number; // the pool after this option is toggled, with the rest of the draft
  direction: Direction; // against poolNow, so the UI renders the arrow without re-deriving it
  selected: boolean; // is the option part of the draft right now
};

export type YearOption = OptionCount & { year: number };
export type KmOption = OptionCount & { km_max: number };
export type RegionOption = OptionCount & { region: string };
export type PriceOption = OptionCount & {
  min: number | null;
  max: number | null;
  in_range: number; // the pool under the draft AS TYPED — this is poolNow, kept beside the toggle count on purpose
};

export type FilterCountsView = {
  model: string;
  model_key: string;
  pool_total: number; // the model's live pool, no filter at all
  pool_now: number; // under the full draft — the number on the "עדכן · N" button
  years: YearOption[]; // years WITH STOCK in the model, ascending
  km: {
    available: boolean; // false when the anchors have never been written — the UI hides the km group
    note: string | null; // why, when they are unavailable
    chips: KmOption[]; // ascending
  };
  regions: RegionOption[]; // distinct non-null region in the model pool, by name
  price: PriceOption;
};

type Row = Filterable & { id: number };

// Day 15 Run 2b (§5): the SHELF — the options the drawer offers for one model, with no draft and no counts.
// It does not change while the user edits the draft, which is why it is fetched once per model and not with
// every counter call. Every number filterCounts() prints is unchanged; this is an additional export.
export type ShelfView = {
  model: string; // the display spelling, as models.model holds it
  model_key: string;
  pool_total: number; // the model's live pool, no filter at all
  years: number[]; // years WITH STOCK in the model pool, ascending
  regions: string[]; // distinct non-null region in the model pool, by name
  km_anchors: number[] | null; // the latest model_stats.km_filter_anchors; null = no km block at all (§5)
  km_note: string | null; // why there are no anchors, when there are none
};

type ModelPool = { display: string; key: string; make: string; rows: Row[] };

// One fetch of the model's live listings, shared by the counters and the shelf. The model is matched on
// modelKey() (uppercased, whitespace stripped), which is a normalisation SQL cannot do for us, so the cut is
// in memory on the same field the assembly cuts on. make comes along because model_stats is keyed on
// (make, model).
async function loadModelPool(model: string): Promise<ModelPool> {
  const key = modelKey(model);
  const live = await db.listings.findMany({
    where: { delisted_at: null },
    select: {
      id: true,
      price: true,
      km_declared: true,
      region: true,
      car: { select: { year: true, model: { select: { make: true, model: true } } } },
    },
    orderBy: { id: "asc" },
  });

  let display: string | null = null;
  const makes = new Set<string>();
  const rows: Row[] = [];
  for (const l of live) {
    const name = l.car.model.model;
    if (name === null) throw new Error(`listing ${l.id}: models.model is null`);
    if (modelKey(name) !== key) continue;
    if (l.car.year === null) throw new Error(`listing ${l.id}: cars.year is null — it cannot be placed on a year chip`);
    if (l.car.model.make === null) throw new Error(`listing ${l.id}: models.make is null — model_stats is keyed on (make, model)`);
    display = display ?? name;
    makes.add(l.car.model.make);
    rows.push({ id: l.id, price: l.price, year: l.car.year, km_declared: l.km_declared, region: l.region });
  }
  if (display === null) throw new Error(`filterCounts: no live listing has model '${model}'`);
  if (makes.size > 1) throw new Error(`filterCounts: model '${display}' spans ${makes.size} makes (${[...makes].sort().join(", ")}) — model_stats cannot be read for it`);
  return { display, key, make: [...makes][0], rows };
}

// The km chips of one model: the anchors the norms run wrote (§1), never computed here. Shared by the
// counters and the shelf so that both say the same thing about a model whose anchors have never been written.
async function loadKmAnchors(make: string, model: string): Promise<{ anchors: number[] | null; note: string | null }> {
  const modelStats = await db.model_stats.findFirst({
    where: { make, model },
    orderBy: [{ computed_at: "desc" }, { id: "desc" }],
    select: { id: true, km_filter_anchors: true, computed_at: true },
  });
  const stored = modelStats?.km_filter_anchors ?? null;
  const anchors: number[] | null = Array.isArray(stored) ? stored.filter((v): v is number => typeof v === "number") : null;
  return {
    anchors,
    note:
      modelStats === null
        ? `no model_stats row for ${make} ${model} — the norms run has never written one`
        : anchors === null
          ? `model_stats row ${modelStats.id} (${modelStats.computed_at.toISOString()}) carries no km_filter_anchors — the column has not been written yet; the km group is hidden`
          : null,
  };
}

/** §5 — the drawer's shelf for one model: the years with stock, the regions present, the km anchors. */
export async function filterShelf(model: string): Promise<ShelfView> {
  const pool = await loadModelPool(model);
  const km = await loadKmAnchors(pool.make, pool.display);
  return {
    model: pool.display,
    model_key: pool.key,
    pool_total: pool.rows.length,
    years: [...new Set(pool.rows.map((r) => r.year))].sort((a, b) => a - b),
    regions: [...new Set(pool.rows.map((r) => r.region).filter((v): v is string => v !== null))].sort((a, b) => a.localeCompare(b)),
    km_anchors: km.anchors,
    km_note: km.note,
  };
}

export async function filterCounts(input: { model: string; draft?: SearchFilters }): Promise<FilterCountsView> {
  const draft = input.draft ?? {};
  const { display, key, make, rows } = await loadModelPool(input.model);

  const pool_total = rows.length;
  const pool_now = countPassing(rows, draft);
  const at = (f: SearchFilters, selected: boolean): OptionCount => {
    const count = countPassing(rows, f);
    return { count, direction: count > pool_now ? "up" : count < pool_now ? "down" : "same", selected };
  };

  // years offered = years WITH STOCK in the model. Toggling one adds it to, or removes it from, the list.
  const chosenYears = draft.years ?? [];
  const years: YearOption[] = [...new Set(rows.map((r) => r.year))]
    .sort((a, b) => a - b)
    .map((year) => {
      const selected = chosenYears.includes(year);
      const next = selected ? chosenYears.filter((y) => y !== year) : [...chosenYears, year];
      return { year, ...at({ ...draft, years: next }, selected) };
    });

  // regions offered = the distinct non-null region values present in the model pool. Same toggle.
  const chosenRegions = draft.regions ?? [];
  const regions: RegionOption[] = [...new Set(rows.map((r) => r.region).filter((v): v is string => v !== null))]
    .sort((a, b) => a.localeCompare(b))
    .map((region) => {
      const selected = chosenRegions.includes(region);
      const next = selected ? chosenRegions.filter((x) => x !== region) : [...chosenRegions, region];
      return { region, ...at({ ...draft, regions: next }, selected) };
    });

  // km chips = the anchors the norms run wrote (§1), never computed here. The ceiling is single-valued, so
  // toggling a chip that is not the current ceiling REPLACES the ceiling; toggling the current one clears it.
  const { anchors, note } = await loadKmAnchors(make, display);
  const km = {
    available: anchors !== null,
    note,
    chips: (anchors ?? []).map((km_max) => {
      const selected = kmActive(draft) && draft.kmMax === km_max;
      const next: SearchFilters = selected ? { ...draft, kmMax: undefined } : { ...draft, kmMax: km_max };
      return { km_max, ...at(next, selected) };
    }),
  };

  // The price block. Toggling a range can only mean REMOVING it — there is no value to add when nothing was
  // typed — so with no bound set the count is the draft's own and the arrow says "same".
  // in_range is the pool under the range AS TYPED, which is the plan's "הבריכה בטווח הנוכחי" and equals
  // pool_now. Both are returned; which one the drawer prints is a UI decision (flagged in REPORT.md).
  const priceSelected = priceActive(draft);
  const price: PriceOption = {
    min: draft.priceMin ?? null,
    max: draft.priceMax ?? null,
    in_range: pool_now,
    ...at(priceSelected ? { ...draft, priceMin: undefined, priceMax: undefined } : draft, priceSelected),
  };

  return { model: display, model_key: key, pool_total, pool_now, years, km, regions, price };
}
