"use server";

// The filter counters (BRIEF Days 15–16, §4; re-decided in Run 2c §12 after the phone test of 13/09).
//
// WHAT A COUNTER IS, since Run 2c: HOW MANY LISTINGS ARE IN THAT OPTION — counted within the draft's filters
// of the OTHER groups only, the chip's own group ignored. Concretely (§0.11): the count is the cut-pool size
// of a draft in which the chip's group is replaced by that single option — years -> years: [Y], km -> kmMax: C,
// regions -> regions: [R] — with every other group exactly as the draft has it, price included.
//
// The consequence is the whole point: tapping inside a group never moves that group's own numbers. Run 2b's
// counter was "the pool after tapping this option", with an up/down arrow, which made a single tap move all
// twelve numbers on the phone at once; that was rejected on 13/09. No arrows, no colours, no deltas. The one
// number that answers "what will I get" is on the "עדכן · N" button, and that is pool_now — the cut pool.
// A 0 still disables nothing (the filling order is not the order of importance).
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
import type { ModelRows } from "./chip-state";
import { countPassing, kmActive, type Filterable, type SearchFilters } from "./filters";

export type OptionCount = {
  count: number; // §0.11 — the cut pool of the draft with this option's GROUP replaced by this option alone
  selected: boolean; // is the option part of the draft right now
};

export type YearOption = OptionCount & { year: number };
export type KmOption = OptionCount & { km_max: number };
export type RegionOption = OptionCount & { region: string };

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
  // §12: the price block has NO number of its own — under the per-option counters it would only repeat the
  // button, and the button already holds while a price is being typed (§0.3). The typed bounds are the
  // client's own draft; nothing here has to hand them back.
};

// Run 8b §2.1 — the row is EXACTLY the Filterable the search cuts with and nothing else. The listing id was
// written here and never read; it is gone, because these rows now travel to the browser (§2.1: no listing id
// and no other listing data) and the way to keep that true is not to carry it in the first place.
type ModelPool = { display: string; key: string; make: string; rows: Filterable[] };

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
  const rows: Filterable[] = [];
  for (const l of live) {
    const name = l.car.model.model;
    if (name === null) throw new Error(`listing ${l.id}: models.model is null`);
    if (modelKey(name) !== key) continue;
    if (l.car.year === null) throw new Error(`listing ${l.id}: cars.year is null — it cannot be placed on a year chip`);
    if (l.car.model.make === null) throw new Error(`listing ${l.id}: models.make is null — model_stats is keyed on (make, model)`);
    display = display ?? name;
    makes.add(l.car.model.make);
    rows.push({ price: l.price, year: l.car.year, km_declared: l.km_declared, region: l.region });
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

/**
 * Run 8b §2.1 / §2.4 — THE WHOLE OF WHAT THE DRAWER NEEDS FROM THE DATABASE, in one fetch of the model's
 * live listings plus the anchors row: the rows the chips are counted over and the anchors the km chips are.
 *
 * Nothing about a chip is decided here and the SHELF IS NOT BUILT HERE ANY MORE (§2.4): its arithmetic —
 * the years and regions with stock, the km chips from the anchors, and §3's join of the stored question's own
 * values — is pure and moved to src/lib/search/chip-state.ts (shelfOf), which the browser can import. Run 8's
 * drawerInput() and the ShelfView it returned are gone with the resolved drawer they served: the page and the
 * model-rows action hand these rows over, and resolveDrawer() runs where the component renders (§2.2).
 *
 * The rows are the counters' own rows — the same `Filterable` the search cuts with — so the drawer's numbers
 * and the search's pool can never be measured differently.
 */
export async function modelRows(model: string): Promise<ModelRows> {
  const loaded = await loadModelPool(model);
  const km = await loadKmAnchors(loaded.make, loaded.display);
  return { model: loaded.display, model_key: loaded.key, rows: loaded.rows, km_anchors: km.anchors, km_note: km.note };
}

export async function filterCounts(input: { model: string; draft?: SearchFilters }): Promise<FilterCountsView> {
  const draft = input.draft ?? {};
  const { display, key, make, rows } = await loadModelPool(input.model);

  const pool_total = rows.length;
  const pool_now = countPassing(rows, draft); // the "עדכן · N" number: the WHOLE draft, every group applied

  // §0.11 — one composed draft per option: the option's own group replaced by that single option, every other
  // group left exactly as the draft has it (price included). filters.ts does the deciding, here and in the
  // search alike; nothing in this file knows what a filter means.
  const at = (group: SearchFilters, selected: boolean): OptionCount => ({ count: countPassing(rows, { ...draft, ...group }), selected });

  // years offered = years WITH STOCK in the model. With the group replaced by one year, a group's numbers do
  // not move when a chip inside it is tapped — which is the whole of §12.
  const chosenYears = draft.years ?? [];
  const years: YearOption[] = [...new Set(rows.map((r) => r.year))]
    .sort((a, b) => a - b)
    .map((year) => ({ year, ...at({ years: [year] }, chosenYears.includes(year)) }));

  // regions offered = the distinct non-null region values present in the model pool.
  const chosenRegions = draft.regions ?? [];
  const regions: RegionOption[] = [...new Set(rows.map((r) => r.region).filter((v): v is string => v !== null))]
    .sort((a, b) => a.localeCompare(b))
    .map((region) => ({ region, ...at({ regions: [region] }, chosenRegions.includes(region)) }));

  // km chips = the anchors the norms run wrote (§1), never computed here. The ceiling is single-valued, so the
  // group replaced by one option is simply that ceiling — and the counts never fall as the ceiling rises.
  const { anchors, note } = await loadKmAnchors(make, display);
  const km = {
    available: anchors !== null,
    note,
    chips: (anchors ?? []).map((km_max) => ({ km_max, ...at({ kmMax: km_max }, kmActive(draft) && draft.kmMax === km_max) })),
  };

  return { model: display, model_key: key, pool_total, pool_now, years, km, regions };
}
