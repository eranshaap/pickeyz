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
//
// Day 19 (Run 5c2, §5) — THE SECOND DOOR. `assemblePoolPreview()` exists so that the dry scoring run can show
// what the picks WOULD become before any engine version is written: it assembles the same pool twice, once
// from the stored scores and once from the scores the run has just computed, and nothing is written either way.
// Only scripts/score-listings.ts may call it. The site and scripts/select-three.ts call assemblePool() and see
// no difference at all — same signature, same load, same validations in the same order with the same messages,
// same version check, same PoolItems. Both doors are thin wrappers over one internal function, and the preview
// differs from assemblePool in exactly three things:
//   1. no version check — the caller hands in the scores and knows which engine each side is;
//   2. where a listing's five score fields come from (src/lib/search/pool-scores.ts);
//   3. a live listing with no score on that side is left out of the pool and reported in `without_score`,
//      instead of stopping the load — a never-scored listing is a legitimate state in a dry run.
// Every other validation throws exactly as it does today.
//
// S2 §2 — A SEARCH IS A SEARCH OF ONE FAMILY. The pool is cut by family: a live listing is in it when its car's
// catalog row has `family_id` = the asked family. Every door goes through that one cut:
//   assembleFamilyPool(familyId)   the site's path — the family the bar chose
//   assemblePool(model)            the scripts' path, same signature and same --model meaning as before: the
//                                  text is matched by modelKey() over the live listings exactly as it was, and
//                                  then resolves to the family behind those listings; the pool is that family's
//   assemblePoolPreview(model)     score-listings.ts's door, resolved from its text the same way

import { db } from "@/lib/db";
import { ENGINE_VERSION } from "@/lib/scoring/constants";
import { isCancelled, type Row } from "@/lib/scoring/types";
import type { CandidateListing } from "@/lib/selection";
import { poolScoreOf, type PoolScoreSource } from "./pool-scores";

export type { PoolScore, PoolScoreSource } from "./pool-scores";

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

// Day 19 (Run 5c2, §5.2): the preview's extra field — the live listings of this model that have no score on
// the side being assembled (stored: score_breakdown null; a map: no entry). assemblePool() stops on those.
export type AssembledPoolPreview = AssembledPool & { without_score: number[] };

export type AssembledPool = {
  now: Date;
  live_listings: number; // live listings in the database, ALL models — before the model cut
  models_present: ModelPresence[]; // by listing count, then name
  models_present_text: string;
  model_key: string;
  model_display: string;
  model_listings: number; // live listings of this family — the pool before any filter
  family: { id: number; make_en: string; name_en: string }; // S2 §2 — the family the pool is cut by
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
  return assemble({ model }, { now: opts.now, checkVersion: true, scores: "stored", onMissingScore: "throw" });
}

/**
 * S2 §2 — the live pool of one family: the site's path. The same assembly, validations and version check as
 * assemblePool(); only the target is named by family id instead of by text.
 */
export async function assembleFamilyPool(familyId: number, opts: { now?: Date } = {}): Promise<AssembledPool> {
  return assemble({ family_id: familyId }, { now: opts.now, checkVersion: true, scores: "stored", onMissingScore: "throw" });
}

/**
 * Day 19 (Run 5c2, §5.2) — the second door: the same pool, assembled from scores the caller hands in.
 *
 * ONLY scripts/score-listings.ts may call this. It is not a search path: there is no version check, so the
 * caller is the one that knows which engine each side is, and a listing with no score on that side is reported
 * in `without_score` rather than stopping the load. The site and scripts/select-three.ts keep going through
 * assemblePool(), whose version guard is unchanged.
 *
 * @param scores  "stored" — the listings' own columns, exactly as assemblePool reads them;
 *                a map — one PoolScore per listing id, the scores a run has computed but not written.
 */
export async function assemblePoolPreview(
  model: string | null,
  opts: { now?: Date; scores: PoolScoreSource },
): Promise<AssembledPoolPreview> {
  return assemble({ model }, { now: opts.now, checkVersion: false, scores: opts.scores, onMissingScore: "collect" });
}

type AssembleOpts = {
  now?: Date;
  checkVersion: boolean; // switch 1
  scores: PoolScoreSource; // switch 2
  onMissingScore: "throw" | "collect"; // switch 3
};

// S2 §2 — what the pool is asked for: a family by id, or a text that resolves to one.
type AssembleTarget = { family_id: number } | { model: string | null };

async function assemble(target: AssembleTarget, opts: AssembleOpts): Promise<AssembledPoolPreview> {
  const now = opts.now ?? new Date();
  // §13.3: open = agreement_end is null or later than this run's now. agreement_status plays no part.
  const isOpen = (end: Date | null) => end === null || end > now;

  const rows = await db.listings.findMany({
    where: { delisted_at: null },
    include: {
      car: { select: { id: true, license_plate: true, year: true, model: { select: { model: true, sub_model: true, comparison_group: true, degem_code: true, vehicle_class: true, family_id: true } } } },
      market_stats: { select: { id: true, median_price: true, engine_version: true } },
      dealer: { select: { id: true, name: true, dealer_type: true, commercial: { select: { id: true, agreement_status: true, agreement_end: true } } } },
    },
    orderBy: { id: "asc" },
  });

  // version check over every live listing and every norm row it points at (switch 1: the preview has none)
  const badVersion = !opts.checkVersion
    ? []
    : rows.filter((l) => l.engine_version !== ENGINE_VERSION || (l.market_stats !== null && l.market_stats.engine_version !== ENGINE_VERSION));
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

  // S2 §2 — the target resolves to ONE family, and the pool is that family's.
  let familyId: number;
  let resolved: { key: string; display: string } | null = null; // the text's own match, on the scripts' path
  if ("family_id" in target) {
    familyId = target.family_id;
    if (!rows.some((l) => l.car.model.family_id === familyId)) {
      throw new PoolAssemblyError(`no live listing is of family ${familyId} — see the list above; no search was run`, presentLine);
    }
  } else {
    const model = target.model;
    if (model === null && present.size > 1) {
      throw new PoolAssemblyError(`--model=<value> is required: the live listings span ${present.size} models — see the list above; no search was run`, presentLine);
    }
    if (model !== null && !present.has(modelKey(model))) {
      throw new PoolAssemblyError(`--model: no live listing has model '${model}' — see the list above; no search was run`, presentLine);
    }
    const text = model === null ? models_present[0] : (models_present.find((e) => e.key === modelKey(model)) as ModelPresence);
    resolved = text;
    // the family of the live listings behind the key — exactly one, and every one of them has it
    const behind = rows.filter((l) => modelKey(l.car.model.model as string) === text.key);
    const noFamily = behind.filter((l) => l.car.model.family_id === null);
    if (noFamily.length > 0) {
      throw new PoolAssemblyError(
        `--model: ${noFamily.length} live listing(s) of '${text.display}' have a catalog row with no family — the pool is cut by family; no search was run`,
        noFamily.map((l) => `  listing ${l.id} (${l.car.license_plate ?? "?"})`),
      );
    }
    const families = [...new Set(behind.map((l) => l.car.model.family_id as number))].sort((a, b) => a - b);
    if (families.length > 1) {
      throw new PoolAssemblyError(`--model: '${text.display}' resolves to ${families.length} families (${families.join(", ")}) — no search was run`, presentLine);
    }
    familyId = families[0];
  }
  const familyRow = await db.model_families.findUnique({ where: { id: familyId }, include: { make: { select: { name_en: true } } } });
  if (familyRow === null) throw new Error(`family ${familyId}: live listings point at it but model_families has no such row`);
  const family = { id: familyId, make_en: familyRow.make.name_en, name_en: familyRow.name_en };
  // the scripts keep the text they asked for; the site's path names the family in English, as model_searched does
  const familyText = `${family.make_en} ${family.name_en}`;
  const target_key = resolved?.key ?? modelKey(familyText);
  const target_display = resolved?.display ?? familyText;

  // Switch 2, the norm side of it: with a map, median_price comes from the market_stats row the MAP's score
  // points at, not from the listing's included relation. One query for every id the map carries.
  const mapped = opts.scores === "stored" ? null : opts.scores;
  const medians = new Map<number, number>();
  if (mapped !== null) {
    const ids = [...new Set([...mapped.values()].map((s) => s.market_stats_id).filter((id): id is number => id !== null))];
    if (ids.length) {
      for (const r of await db.market_stats.findMany({ where: { id: { in: ids } }, select: { id: true, median_price: true } })) {
        medians.set(r.id, r.median_price);
      }
    }
  }

  // the pool of the model — every validation runs over EVERY live listing, as it always has, and only then
  // does the model cut happen
  const items: PoolItem[] = [];
  const without_score: number[] = [];
  for (const l of rows) {
    const plate = l.car.license_plate ?? "?";
    if (l.car.year === null) throw new Error(`listing ${l.id} (${plate}): cars.year is null`);
    if (l.car.model.comparison_group === null) throw new Error(`listing ${l.id} (${plate}): models.comparison_group is null`);
    if (l.car.model.degem_code === null) throw new Error(`listing ${l.id} (${plate}): models.degem_code is null`);
    if (!/^\d+-\d+$/.test(l.car.model.degem_code)) throw new Error(`listing ${l.id} (${plate}): models.degem_code '${l.car.model.degem_code}' is not 'tozeret_cd-degem_cd'`);
    if (l.car.model.vehicle_class === null) throw new Error(`listing ${l.id} (${plate}): models.vehicle_class is null`);
    // Switch 3: assemblePool stops here, as it always has. The preview defers the question until after the
    // family cut, so `without_score` names the listings of THIS family and nothing else.
    if (l.score_breakdown === null && opts.onMissingScore === "throw") throw new Error(`listing ${l.id} (${plate}): score_breakdown is null`);
    if (l.car.model.model === null) throw new Error(`listing ${l.id} (${plate}): models.model is null`);
    if (l.car.model.family_id !== familyId) continue; // S2 §2 — THE CUT: the asked family, and nothing else
    // Switch 2: the five score fields — the listing's own columns, or the map's entry for it.
    const scored = poolScoreOf(l, opts.scores);
    if (scored === null) {
      without_score.push(l.id);
      continue;
    }
    const breakdown = scored.breakdown;
    // Day 18 (engine v4 §8): a cancelled car's invoice has no rows by definition — the candidate is built as always,
    // with no median price, and the "no price row" stop is skipped for that case only.
    const cancelled = isCancelled(breakdown);
    const priceRow = cancelled ? null : breakdown.rows.find((r: Row) => r.row === "price");
    if (!cancelled && !priceRow) throw new Error(`listing ${l.id} (${plate}): invoice has no price row`);
    // The same rule on both sides: median_price is the median_price of the market_stats row THIS score points
    // at, null when the price row is not scored, and a scored price row with no such row is still a stop.
    if (priceRow?.status === "scored" && scored.market_stats_id === null) throw new Error(`listing ${l.id} (${plate}): price row scored but market_stats_id is null`);
    let normMedian: number | null;
    if (mapped === null) {
      normMedian = l.market_stats?.median_price ?? null;
    } else {
      const id = scored.market_stats_id;
      if (id !== null && !medians.has(id)) throw new Error(`listing ${l.id} (${plate}): market_stats ${id} is not in market_stats`);
      normMedian = id === null ? null : (medians.get(id) as number);
    }
    const median_price = priceRow?.status === "scored" ? normMedian : null;
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
      score: scored.score,
      market_stats_id: scored.market_stats_id,
      model_stats_id: scored.model_stats_id,
      pool_stats_id: scored.pool_stats_id,
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
    model_key: target_key,
    model_display: target_display,
    model_listings: rows.filter((l) => l.car.model.family_id === familyId).length,
    family,
    items,
    without_score,
  };
}
