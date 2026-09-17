// The pool assembly (BRIEF Days 15–16, §2). One model's live listings, loaded and shaped into exactly what
// selectThree() takes — plus the per-listing fields the search screen filters on.
//
// This is a PURE EXTRACTION of what scripts/select-three.ts did inline until Day 15. Nothing about the
// loading, the validations, their order or their messages changed; the script now calls assemblePool() and
// its report is byte-identical for the same database state. Two callers share it from here on:
//   scripts/select-three.ts   the tuning report, with its own --max-price / --years flags applied AFTER this
//   src/lib/search/run.ts     the search action, with the screen's filters applied AFTER this
//
// What the assembly is (§2):
//   invoices        listings.score_breakdown, the engine's ScoreResult, read and never recomputed
//   median_price    the norm row's median_price via market_stats_id; null when the invoice's price row is
//                   not 'scored' (a scored price row with no norm row is a stop, not a null)
//   seller_visible  the seller has an OPEN dealer_commercial row = agreement_end is null OR later than this
//                   run's `now` (§13.3: a trial born with a known end date is open until that date arrives).
//                   agreement_status plays no part — the demo sellers sit on rows in status 'demo'.
//   new_price       the latest published_at row of new_car_prices on the car's four-column key
//                   (degem_code = models.degem_code, sug_degem = models.vehicle_class, shnat_yitzur = cars.year);
//                   null when no row matches.
//
// The version check is part of the assembly, not of the caller: every live listing and every norm row it
// points at must be at ENGINE_VERSION. Anything else stops the load — a search must never run on a pool
// that mixes engine versions.
//
// The filters are NOT here. The assembly is the whole model pool; cutting it is the caller's job, and it
// happens before selectThree() either way (the filters define the question, they never touch a score).

import { db } from "@/lib/db";
import { ENGINE_VERSION } from "@/lib/scoring/constants";
import { isCancelled, type Invoice, type Row } from "@/lib/scoring/types";
import type { CandidateListing } from "@/lib/selection";

// Day 15 Run 2b (§4): the snapshot fields a `search_results` row needs and the two display facts the raw pick
// card shows (§0.6) travel on the pool item too. They are ADDITIVE — nothing that existed changed shape, and
// scripts/select-three.ts reads none of them, so its report stays byte-identical.

// The four-column key's three variable columns (the fourth, tozeret_cd, is inside degem_code).
export type NewPriceKey = { degem_code: string; shnat_yitzur: number; sug_degem: string };
export const newPriceKeyText = (k: NewPriceKey) => `${k.degem_code}|${k.shnat_yitzur}|${k.sug_degem}`;

// A model among the live listings, keyed the way modelKey() keys it.
export type ModelPresence = { key: string; display: string; listings: number };

// One listing of the pool: the selectThree input, plus everything a report or a screen shows or filters on.
export type PoolItem = {
  candidate: CandidateListing;
  // the screen's filter fields (§2): price and listing_id and car_id are on the candidate too, repeated here
  // so a filter never has to reach through it
  listing_id: number;
  car_id: number;
  price: number;
  km_declared: number | null;
  year: number;
  region: string | null;
  // display and report fields
  plate: string;
  dealer_id: number;
  seller: string; // "name (dealer_type, dealer id)"
  cell: string; // "comparison_group year"
  codes: string; // models.degem_code, "tozeret_cd-degem_cd"
  vehicle_class: string; // models.vehicle_class = the price file's sug_degem
  key: NewPriceKey;
  new_price_published_at: Date | null; // the publication the new price came from; null when there is none
  // Day 15 Run 2b (§4) — what a `search_results` row snapshots. The invoice itself is candidate.breakdown:
  // the same object, read from listings.score_breakdown and never recomputed.
  score: number | null; // listings.score — the stored deal score; null when the listing has none (thin cell)
  market_stats_id: number | null; // the three norm pointers AS THE LISTING CARRIES THEM — pointers, not copies
  model_stats_id: number | null;
  pool_stats_id: number | null;
  new_car_price_id: number | null; // the new_car_prices row `new_price` came from; null when the key has no row
  // Day 15 Run 2b (§0.6) — the two facts the raw pick card shows that nothing else here carried.
  dealer_type: string; // code: private | ... — the card says "פרטי" for private and "מגרש" for anything else
  sub_model: string | null; // models.sub_model (catalog ramat_gimur)
};

export type AssembledPool = {
  now: Date;
  live_listings: number; // live listings in the database, ALL models — before the model cut
  models_present: ModelPresence[]; // by listing count, then name
  models_present_text: string;
  model_key: string;
  model_display: string;
  model_listings: number; // live listings of this model — the pool before any filter
  items: PoolItem[];
};

// A stop during the assembly that the caller has lines to print for (the per-listing version table, the list
// of models present). The caller prints `lines` and rethrows; the message alone is never the whole story.
export class PoolAssemblyError extends Error {
  constructor(
    message: string,
    readonly lines: string[],
  ) {
    super(message);
    this.name = "PoolAssemblyError";
  }
}

// --model=<value> and the screen's model are compared to models.model uppercased and without whitespace,
// exactly as scripts/import-sheet.ts's --expect-model compares it.
export function modelKey(s: string): string {
  return s.toUpperCase().replace(/\s+/g, "");
}

/**
 * The live pool of one model, assembled for selectThree().
 *
 * @param model  the model to search, matched by modelKey(). null is allowed only when exactly one model is
 *               live (the script's convenience when --model is omitted); with more than one it stops.
 */
export async function assemblePool(model: string | null, opts: { now?: Date } = {}): Promise<AssembledPool> {
  const now = opts.now ?? new Date();
  // §13.3: open = agreement_end is null or later than this run's now. agreement_status plays no part.
  const isOpen = (end: Date | null) => end === null || end > now;

  const rows = await db.listings.findMany({
    where: { delisted_at: null },
    include: {
      car: { select: { id: true, license_plate: true, year: true, model: { select: { model: true, sub_model: true, comparison_group: true, degem_code: true, vehicle_class: true } } } },
      market_stats: { select: { id: true, median_price: true, engine_version: true } },
      dealer: { select: { id: true, name: true, dealer_type: true, commercial: { select: { id: true, agreement_status: true, agreement_end: true } } } },
    },
    orderBy: { id: "asc" },
  });

  // version check over every live listing and every norm row it points at
  const badVersion = rows.filter((l) => l.engine_version !== ENGINE_VERSION || (l.market_stats !== null && l.market_stats.engine_version !== ENGINE_VERSION));
  if (badVersion.length) {
    const lines = badVersion.map(
      (l) => `  listing ${l.id} (${l.car.license_plate ?? "?"}): engine_version ${l.engine_version ?? "null"}, norm row ${l.market_stats?.id ?? "none"} engine_version ${l.market_stats?.engine_version ?? "-"}`,
    );
    throw new PoolAssemblyError(`${badVersion.length} live listing(s) or norm row(s) not at engine version ${ENGINE_VERSION} — see above`, lines);
  }

  // §1: the models among the live listings, keyed the way the model argument is compared. The model is the
  // search's input: with more than one model live it is required, an unknown value stops — both before any search.
  const present = new Map<string, { display: string; n: number }>();
  for (const l of rows) {
    if (l.car.model.model === null) throw new Error(`listing ${l.id} (${l.car.license_plate ?? "?"}): models.model is null`);
    const e = present.get(modelKey(l.car.model.model)) ?? { display: l.car.model.model, n: 0 };
    e.n += 1;
    present.set(modelKey(l.car.model.model), e);
  }
  const models_present: ModelPresence[] = [...present.entries()]
    .map(([key, e]) => ({ key, display: e.display, listings: e.n }))
    .sort((a, b) => b.listings - a.listings || a.display.localeCompare(b.display));
  const models_present_text = models_present.map((e) => `${e.display} (${e.listings} listing${e.listings === 1 ? "" : "s"})`).join(", ");
  const presentLine = [`models among the ${rows.length} live listings: ${models_present_text}`];

  if (model === null && present.size > 1) {
    throw new PoolAssemblyError(`--model=<value> is required: the live listings span ${present.size} models — see the list above; no search was run`, presentLine);
  }
  if (model !== null && !present.has(modelKey(model))) {
    throw new PoolAssemblyError(`--model: no live listing has model '${model}' — see the list above; no search was run`, presentLine);
  }
  const resolved = model === null ? models_present[0] : (models_present.find((e) => e.key === modelKey(model)) as ModelPresence);

  // the pool of the model — every validation runs over EVERY live listing, as it always has, and only then
  // does the model cut happen
  const items: PoolItem[] = [];
  for (const l of rows) {
    const plate = l.car.license_plate ?? "?";
    if (l.car.year === null) throw new Error(`listing ${l.id} (${plate}): cars.year is null`);
    if (l.car.model.comparison_group === null) throw new Error(`listing ${l.id} (${plate}): models.comparison_group is null`);
    if (l.car.model.degem_code === null) throw new Error(`listing ${l.id} (${plate}): models.degem_code is null`);
    if (!/^\d+-\d+$/.test(l.car.model.degem_code)) throw new Error(`listing ${l.id} (${plate}): models.degem_code '${l.car.model.degem_code}' is not 'tozeret_cd-degem_cd'`);
    if (l.car.model.vehicle_class === null) throw new Error(`listing ${l.id} (${plate}): models.vehicle_class is null`);
    if (l.score_breakdown === null) throw new Error(`listing ${l.id} (${plate}): score_breakdown is null`);
    if (l.car.model.model === null) throw new Error(`listing ${l.id} (${plate}): models.model is null`);
    if (modelKey(l.car.model.model) !== resolved.key) continue;
    const breakdown = l.score_breakdown as unknown as Invoice;
    // Day 18 (engine v4 §8): a cancelled car's invoice has no rows by definition — the candidate is built as always,
    // with no median price, and the "no price row" stop is skipped for that case only.
    const cancelled = isCancelled(breakdown);
    const priceRow = cancelled ? null : breakdown.rows.find((r: Row) => r.row === "price");
    if (!cancelled && !priceRow) throw new Error(`listing ${l.id} (${plate}): invoice has no price row`);
    if (priceRow?.status === "scored" && l.market_stats === null) throw new Error(`listing ${l.id} (${plate}): price row scored but market_stats_id is null`);
    const median_price = priceRow?.status === "scored" ? (l.market_stats?.median_price ?? null) : null;
    const seller_visible = l.dealer.commercial.some((c) => isOpen(c.agreement_end));
    items.push({
      candidate: {
        listing_id: l.id,
        car_id: l.car.id,
        price: l.price,
        first_seen_at: l.first_seen_at.toISOString(),
        year: l.car.year,
        comparison_group: l.car.model.comparison_group,
        median_price,
        new_price: null, // filled below from new_car_prices
        seller_visible,
        breakdown,
      },
      listing_id: l.id,
      car_id: l.car.id,
      price: l.price,
      km_declared: l.km_declared,
      year: l.car.year,
      region: l.region,
      plate,
      dealer_id: l.dealer.id,
      seller: `${l.dealer.name} (${l.dealer.dealer_type}, dealer ${l.dealer.id})`,
      cell: `${l.car.model.comparison_group} ${l.car.year}`,
      codes: l.car.model.degem_code,
      vehicle_class: l.car.model.vehicle_class,
      key: { degem_code: l.car.model.degem_code, shnat_yitzur: l.car.year, sug_degem: l.car.model.vehicle_class },
      new_price_published_at: null, // filled below
      score: l.score,
      market_stats_id: l.market_stats_id,
      model_stats_id: l.model_stats_id,
      pool_stats_id: l.pool_stats_id,
      new_car_price_id: null, // filled below, beside the price itself
      dealer_type: l.dealer.dealer_type,
      sub_model: l.car.model.sub_model,
    });
  }

  // the new price: the latest published_at row on the car's key; null when none. One query for the pool's keys.
  const wanted = new Map<string, NewPriceKey>();
  for (const p of items) wanted.set(newPriceKeyText(p.key), p.key);
  const priceRows = wanted.size
    ? await db.new_car_prices.findMany({ where: { OR: [...wanted.values()] }, orderBy: [{ published_at: "desc" }, { id: "desc" }] })
    : [];
  // The row's id travels with its price: §4 stores WHICH new_car_prices row supplied the ceiling's new price,
  // and the id is the only thing that identifies it after a later publication lands on the same key.
  const latest = new Map<string, { id: number; mehir: number; published_at: Date }>();
  for (const r of priceRows) {
    const k = newPriceKeyText(r);
    if (!latest.has(k)) latest.set(k, { id: r.id, mehir: r.mehir, published_at: r.published_at }); // first = latest published_at
  }
  for (const p of items) {
    const hit = latest.get(newPriceKeyText(p.key));
    p.candidate.new_price = hit?.mehir ?? null;
    p.new_price_published_at = hit?.published_at ?? null;
    p.new_car_price_id = hit?.id ?? null;
  }

  return {
    now,
    live_listings: rows.length,
    models_present,
    models_present_text,
    model_key: resolved.key,
    model_display: resolved.display,
    model_listings: resolved.listings,
    items,
  };
}
