// scripts/compute-market-stats.ts
// Computes the market norms from listings and appends rows to the three norm tables. Default is a dry
// run: computes and prints everything, writes nothing. `--write` appends the rows.
//
// Day 14 (BRIEF Engine v3, §5): THREE NORM LEVELS, each keyed at its own level and each written here.
//   market_stats  per cell  (comparison_group × year)  median_price · median_km · median_history · sample_size
//   model_stats   per model (make, model)              km_slope · km_slope_n
//   pool_stats    per run   (the whole pool)           the anchor curve: intercept · per_year · error_pct · age_min · age_max · n
// All three are append-only. A new row is written only when the values changed against the latest row of
// the same key at the same versions (§0.1); the write order is pool → model → cell, one statement per table.
//
// Rules (Day 9, revised Day 9c - no descent ladder):
// - One `now` for the run: it bounds the pool and is the computed_at of every row of every table.
// - Pool for window W: first_seen_at <= now AND (delisted_at IS NULL OR delisted_at >= now - W days).
//   Every listing in the pool contributes price. (Day 18 §4 replaces "every listing counts - no dedupe": one
//   listing per car, cancelled cars out — see the Day 18 block below.)
// - Cells: every distinct (groupKey(fields), cars.year) in the 90-day pool.
// - Per cell: pool at 90 days; if sample_size < MIN_SAMPLE, pool at 180 days instead. The row is
//   written with the window actually used and its true sample_size, even when it is still below
//   MIN_SAMPLE. A thin cell is never merged into a coarser group - the scoring step treats
//   sample_size < MIN_SAMPLE as "no price comparison".
// - One row per cell. Keys come only from groupKey() in src/lib/comparison-group.ts;
//   group_version = GROUP_VERSION. engine_version = ENGINE_VERSION is written explicitly.
// - Touches the three norm tables only. listings.market_stats_id / model_stats_id / pool_stats_id are
//   written by the scoring step.
//
// The typical (§0.2, P1): median_history = the median of the ON-PAPER history row over the cell's listings
// WHOSE CAR HAS A REGISTRY RECORD, computed with the engine's own historyRow() and never reimplemented.
// It needs at least MIN_SAMPLE such listings, else null. It replaces Day 11's median_condition, which is
// dropped from the table - the value each old score used survives in its own score_breakdown copy.
//
// The model slope (§5.2) and the anchor curve (§5.3) are fitted by REUSING the code of parts M5, M8 and
// M8b of scripts/measure-constants.ts - ols(), at() and loo() are imported from it, never re-implemented.
// Model and pool rows were measured on LIVE listings (delisted_at is null), as M5 / M8 measure them — until Day 18,
// which measures them on the 90-day market (below).
//
// Day 15 (BRIEF §1): model_stats.km_filter_anchors - the km filter chips of the search screen. They are
// quartiles (P25/P50/P75) of km_declared over ALL LIVE listings of the model - the model's full pool, with
// nulls ignored and no other filter applied - each rounded UP to the nearest 10,000 and then deduplicated,
// so two quartiles that round to the same number give fewer chips and never an invented value. Written here
// and nowhere else: the chips are measured in the norms run and stay put until the next one (the cross-cutting
// rule of days 15-16 - a measurement of the market only on the norms beat; a derivative of what is already
// stored is free at request time). They are a UI number, not a norm: no engine or selection code reads them.
// The quantile is the linear interpolation that agrees with median() at p = 0.5, so P50 IS this file's median.
//
// Day 15 (BRIEF §1.3): the skip rule (§0.1) is now evaluated in BOTH modes. The dry run prints, per table,
// exactly which rows a --write would append and which column made each of them differ; --write then appends
// those same rows. Nothing else about the dry run changed - it still writes nothing.
//
// Day 15, Run 1b (BRIEF §1): EVERY DECIMAL THIS RUN WRITES IS ROUNDED TO DECIMALS PLACES FIRST - the five
// pool_stats anchor values and model_stats.km_slope. A coefficient fitted here carries the full ~15
// significant digits of a double; the same fit repeated on the same data does not have to reproduce them bit
// for bit, and the value that comes back out of Postgres compares against a fresh one by !==. The skip rule
// then saw a difference that no reader could see and appended a row identical in every visible digit.
// Rounding happens where the row is BUILT, so the printed value, the compared value and the written value
// are one number.
//
// Day 18 (BRIEF §4, §5, §6, §11) — engine v4:
// - ONE MARKET for the three norms (src/lib/norms/market-listings.ts): per model and window, a listing on the
//   market at some moment of the window (delisted ones included), cars.cancelled_at IS NULL, ONE listing per car
//   (latest first_seen_at, then highest id). The cell medians, the km slope and the anchor consume that function
//   and nothing else; sample_size, km_slope_n and anchor_listings count its listings (= cars). This replaces the
//   Day 9 pool above ("every listing counts - no dedupe"). The 90 -> 180 widening per thin cell is unchanged and
//   runs on the same function with the wider window. The km slope and the anchor are measured on the 90-day market
//   (they have no widening of their own). km_filter_anchors and P5 still read ALL live listings, as before.
// - The anchor is fitted through MODEL-YEAR POINTS keyed (make, model, year); a point enters the fit only with at
//   least ANCHOR_POINT_MIN_SAMPLE market listings, and the line needs ANCHOR_MIN_POINTS points. The points are
//   written to pool_stats.anchor_points every run (6 dp) and the skip rule compares them. anchor_age_min/max are
//   still written, as a description of the fit.
// - §6: the trim table — every (make, model, sub_model) over the 90-day market, its median distance from the curve.
// - §11: the read-back — sample_size / km_slope old -> new, the points, the thin-cell listings without an anchor
//   old -> new, and the comparison_group of the COMFORT / SPIRIT 2022 model codes.

import "dotenv/config";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { GROUP_VERSION, groupKey, type GroupFields } from "@/lib/comparison-group";
import { buildAnchorPoints, parseAnchorPoints, pointKey, sameAnchorPoints, type AnchorObservation } from "@/lib/norms/anchor-points";
import { marketListings, marketModels, type MarketListing } from "@/lib/norms/market-listings";
import { ANCHOR_MIN_POINTS, ANCHOR_POINT_MIN_SAMPLE, ENGINE_VERSION, KM_SLOPE_MIN_SAMPLE, MIN_SAMPLE } from "@/lib/scoring/constants";
import { historyRow, kmRow, priceRow, type AnchorPoint, type ScoringInput } from "@/lib/scoring";
import { scoringSubject } from "@/lib/scoring-input";
import { at, loo, ols, type Fit } from "./measure-constants";

const DRY = !process.argv.includes("--write");

// The two windows: 90 days, widened to 180 for a thin cell.
type Window = 90 | 180;

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

// M5's column name — at(fit, X_NAME) reads the slope out of the fit.
const X_NAME = "x (km_dev/1000/yr)";
// Day 15 (§1.2): the km filter chips are these quantiles of the model's live km_declared, each rounded UP to
// KM_ANCHOR_ROUNDING. Not constants of the engine - a chip is a UI number, and the pencil book holds no UI numbers.
const KM_ANCHOR_QUANTILES = [0.25, 0.5, 0.75] as const;
const KM_ANCHOR_ROUNDING = 10_000;
// Day 15, Run 1b (§1): the storage precision of every decimal a norms run writes. Not a constant of the
// engine and not a threshold - it is how many digits of a fitted coefficient we keep, uniform across the
// two tables that hold one, so that a stored value and a freshly computed one are comparable by ===.
const DECIMALS = 6;
// Day 18 (§11): the model-code check — each group of codes is one model-year as a person knows it, and must be
// one comparison_group. Printed, never enforced here.
const MODEL_CODE_CHECK: { name: string; year: number; codes: string[] }[] = [
  { name: "COMFORT", year: 2022, codes: ["588-339", "588-349"] },
  { name: "SPIRIT sedan", year: 2022, codes: ["588-249", "588-342", "588-364"] },
];

type CellNorm = NonNullable<ScoringInput["market"]>;

type PoolListing = {
  id: number;
  car_id: number;
  plate: string;
  year: number;
  price: number; // the contributed price
  km: number | null;
  dealer_type: string;
  delisted_at: Date | null;
  first_seen_at: Date;
  first_registration: Date | null;
  make: string;
  model: string;
  sub_model: string | null;
  vehicle_class: string;
  degem_code: string | null;
  new_price: number | null; // the latest new_car_prices row on the car's key; null when none matches
  new_car_price_id: number | null;
  typical_v2: number | null; // score_breakdown.typical_condition as the listing carries it today (§5.5)
  key: string; // groupKey(fields)
  subject: Omit<ScoringInput, "market">; // the listing and car as the engine sees them (§10)
  stored_breakdown: unknown; // listings.score_breakdown — §11's "old" side reads the stored price row
};

function median(values: number[]): number {
  if (values.length === 0) throw new Error("median of an empty set");
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Day 15 (§1.2): the quantile this file uses everywhere it needs one that is not the median - linear
// interpolation between the two neighbouring order statistics. It agrees with median() at p = 0.5 by
// construction (checked below), so the P50 chip and the file's medians are the same convention.
function quantile(values: number[], p: number): number {
  if (values.length === 0) throw new Error("quantile of an empty set");
  const s = [...values].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

// Day 15 (§1.2): the model's km filter chips. Quartiles of the km values given, each rounded UP to the
// nearest KM_ANCHOR_ROUNDING, then deduplicated - two quartiles that round to the same number leave fewer
// chips, never an invented one. Ascending. Empty when no live listing of the model states a km.
function kmFilterAnchors(kms: number[]): number[] {
  if (kms.length === 0) return [];
  const rounded = KM_ANCHOR_QUANTILES.map((p) => Math.ceil(quantile(kms, p) / KM_ANCHOR_ROUNDING) * KM_ANCHOR_ROUNDING);
  return [...new Set(rounded)].sort((a, b) => a - b);
}

function mix(pool: PoolListing[]): string {
  const counts = new Map<string, number>();
  for (const l of pool) counts.set(l.dealer_type, (counts.get(l.dealer_type) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
}

const f = (v: number | null, d: number) => (v === null ? "-" : v.toFixed(d));
const arrow = (a: number | string | null | undefined, b: number | string | null | undefined) => `${a === null || a === undefined ? "-" : a} -> ${b === null || b === undefined ? "-" : b}`;

// Day 15, Run 1b (§1): the one place a written decimal is rounded. Null passes through - a null anchor is the
// absence of a curve (P4), not a number.
const stored = (v: number | null): number | null => (v === null ? null : Number(v.toFixed(DECIMALS)));

type Cell = { key: string; year: number; count90: number };
type CellRow = {
  comparison_group: string;
  year: number;
  median_price: number;
  median_km: number | null;
  median_history: number | null;
  sample_size: number;
  window_days: Window;
  group_version: number;
  engine_version: number;
  computed_at: Date;
  // printed, not stored
  pool: PoolListing[];
  histories: number; // how many listings contributed to median_history
  with_record: number; // listings of the cell whose car has a registry record
};

type ModelRow = {
  make: string;
  model: string;
  km_slope: number | null;
  km_slope_n: number;
  km_filter_anchors: number[]; // Day 15 (§1.2): the search screen's km chips; [] when no live listing of the model states a km
  engine_version: number;
  group_version: number;
  computed_at: Date;
  // printed, not stored
  fit_note: string | null;
  km_listings: number; // live listings of the model whose km_declared is not null - the anchors' own n
  km_live: number; // live listings of the model, with a km or without
};

type PoolRow = {
  anchor_ratio_intercept: number | null;
  anchor_ratio_per_year: number | null;
  anchor_error_pct: number | null;
  anchor_age_min_years: number | null;
  anchor_age_max_years: number | null;
  anchor_n: number; // the model-year POINTS the line was fitted through — the fit's own n
  anchor_listings: number; // the market listings (= cars) behind those points — coverage, not the fit's n
  anchor_points: AnchorPoint[]; // Day 18 (§5): the points themselves; [] when there is no curve
  engine_version: number;
  computed_at: Date;
};

// The cell as the engine reads it, for a row that is not written yet and therefore has no id.
// §22.4: the history and km rows never read `id`. priceRow is called with it ONLY for §11's count of thin-cell
// listings without an anchor, which reads the row's status and nothing else — its raw.market_stats_id is 0 there.
function cellNormOf(r: Pick<CellRow, "median_price" | "median_km" | "median_history" | "sample_size" | "window_days">): CellNorm {
  return {
    id: 0,
    median_price: r.median_price,
    median_km: r.median_km,
    median_history: r.median_history,
    sample_size: r.sample_size,
    window_days: r.window_days,
    group_version: GROUP_VERSION,
    engine_version: ENGINE_VERSION,
  };
}

// P1 (§5.1): the on-paper history row of every listing in the cell whose car HAS a registry record,
// computed with the engine's own historyRow(). Cars without a record are excluded by definition — their
// row IS the typical (§0.4), so letting them in would be circular.
function poolHistories(pool: PoolListing[]): { values: number[]; with_record: number } {
  const values: number[] = [];
  let with_record = 0;
  for (const l of pool) {
    if (l.subject.car.ownership_history === null) continue;
    with_record++;
    // median_history is null here by construction: this is the value we are about to compute.
    const input: ScoringInput = { ...l.subject, market: null };
    const history = historyRow(input);
    if (history.status !== "scored" || typeof history.value !== "number") {
      throw new Error(`listing ${l.id} (car ${l.car_id}): the car has a registry record but its history row is ${history.status} (${history.reason ?? "no reason"})`);
    }
    values.push(history.value);
  }
  return { values, with_record };
}

type LoadedListing = Omit<MarketListing, "car"> & { car: MarketListing["car"] };

function toPool(l: LoadedListing): PoolListing {
  const plate = l.car.license_plate ?? "?";
  if (l.car.year === null) throw new Error(`listing ${l.id} (car ${l.car_id}): cars.year is null - cannot place it in a (group, year) cell`);
  const m = l.car.model;
  if (m.make === null) throw new Error(`listing ${l.id} (car ${l.car_id}): models.make is null`);
  if (m.model === null) throw new Error(`listing ${l.id} (car ${l.car_id}): models.model is null`);
  if (m.vehicle_class === null) throw new Error(`listing ${l.id} (car ${l.car_id}): models.vehicle_class is null`);
  const fields: GroupFields = {
    vehicle_class: m.vehicle_class,
    make: m.make, model: m.model, body_type: m.body_type, fuel_type: m.fuel_type,
    engine_size: m.engine_size, horsepower: m.horsepower, transmission: m.transmission,
    drive_type: m.drive_type, sub_model: m.sub_model,
  };
  const bd = l.score_breakdown as { typical_condition?: unknown } | null;
  return {
    id: l.id, car_id: l.car_id, plate, year: l.car.year, price: l.price, km: l.km_declared,
    dealer_type: l.dealer.dealer_type, delisted_at: l.delisted_at,
    first_seen_at: l.first_seen_at,
    first_registration: l.car.first_registration,
    make: m.make, model: m.model, sub_model: m.sub_model, vehicle_class: m.vehicle_class, degem_code: m.degem_code,
    new_price: null, // filled below from new_car_prices
    new_car_price_id: null,
    typical_v2: bd !== null && typeof bd.typical_condition === "number" ? bd.typical_condition : null,
    key: groupKey(fields),
    subject: scoringSubject(l, l.car, l.dealer.dealer_type),
    stored_breakdown: l.score_breakdown,
  };
}

async function main() {
  const now = new Date();
  console.log(`${DRY ? "[DRY RUN] " : ""}compute-market-stats - now = ${now.toISOString()}, group_version = ${GROUP_VERSION}, engine_version = ${ENGINE_VERSION}`);

  // ---------- 1. the market (§4) ----------
  const totalListings = await db.listings.count();
  const windowStart = (w: Window) => new Date(now.getTime() - w * DAY_MS);
  const models = await marketModels({ windowStart: windowStart(180), windowEnd: now });
  const market90: PoolListing[] = [];
  const market180: PoolListing[] = [];
  for (const modelKey of models) {
    for (const l of await marketListings({ modelKey, windowStart: windowStart(90), windowEnd: now })) market90.push(toPool(l));
    for (const l of await marketListings({ modelKey, windowStart: windowStart(180), windowEnd: now })) market180.push(toPool(l));
  }
  // Every live listing, as before: the km filter chips (§1.2), P5, and §11's thin-cell count read these.
  const liveRaw = await db.listings.findMany({
    where: { delisted_at: null },
    include: { car: { include: { model: true } }, dealer: { select: { dealer_type: true } } },
    orderBy: { id: "asc" },
  });
  const live = liveRaw.map(toPool);

  // The new-car price, joined exactly as select-three.ts joins it: the latest published_at row of
  // new_car_prices on (degem_code = models.degem_code, sug_degem = models.vehicle_class, shnat_yitzur = cars.year).
  type NewPriceKey = { degem_code: string; shnat_yitzur: number; sug_degem: string };
  const keyText = (k: NewPriceKey) => `${k.degem_code}|${k.shnat_yitzur}|${k.sug_degem}`;
  const everyListing = [...market90, ...market180, ...live];
  const wanted = new Map<string, NewPriceKey>();
  for (const l of everyListing) {
    if (l.degem_code === null) continue; // no key, no new price; counted in the report
    const k: NewPriceKey = { degem_code: l.degem_code, shnat_yitzur: l.year, sug_degem: l.vehicle_class };
    wanted.set(keyText(k), k);
  }
  const priceRows = wanted.size
    ? await db.new_car_prices.findMany({ where: { OR: [...wanted.values()] }, orderBy: [{ published_at: "desc" }, { id: "desc" }] })
    : [];
  const latestPrice = new Map<string, { id: number; mehir: number }>();
  for (const r of priceRows) {
    const k = keyText(r);
    if (!latestPrice.has(k)) latestPrice.set(k, { id: r.id, mehir: r.mehir }); // first = latest published_at
  }
  for (const l of everyListing) {
    if (l.degem_code === null) continue;
    const hit = latestPrice.get(keyText({ degem_code: l.degem_code, shnat_yitzur: l.year, sug_degem: l.vehicle_class }));
    l.new_price = hit?.mehir ?? null;
    l.new_car_price_id = hit?.id ?? null;
  }

  // ---------- 2. cells ----------
  const cells = new Map<string, Cell>();
  for (const l of market90) {
    const id = `${l.key} ${l.year}`;
    const c = cells.get(id);
    if (c) c.count90++;
    else cells.set(id, { key: l.key, year: l.year, count90: 1 });
  }
  const cellList = [...cells.values()].sort((a, b) => a.key.localeCompare(b.key) || a.year - b.year);

  console.log(`\n===== DISTRIBUTION - (comparison_group, year) cells in the 90-day market (${cellList.length}) =====`);
  for (const c of cellList) console.log(`${c.count90.toString().padStart(4)}  ${c.key} x ${c.year}`);

  // ---------- 3. one row per cell ----------
  const cellRows: CellRow[] = [];
  let widened = 0; // cells whose 90-day sample was thin and were pooled at 180 days
  let thin = 0; // rows still below MIN_SAMPLE at the window actually used

  for (const c of cellList) {
    const inCell = (l: PoolListing) => l.year === c.year && l.key === c.key;
    let window: Window = 90;
    let cellPool = market90.filter(inCell);
    if (cellPool.length < MIN_SAMPLE) {
      window = 180;
      cellPool = market180.filter(inCell);
      widened++;
    }
    if (cellPool.length < MIN_SAMPLE) thin++;
    const kms = cellPool.map((l) => l.km).filter((k): k is number => k !== null);
    const median_price = Math.round(median(cellPool.map((l) => l.price)));
    const median_km = kms.length ? Math.round(median(kms)) : null;
    const sample_size = cellPool.length;
    // P1: at least MIN_SAMPLE listings with a registry record, else null.
    const { values, with_record } = poolHistories(cellPool);
    const median_history = values.length >= MIN_SAMPLE ? median(values) : null;
    cellRows.push({
      comparison_group: c.key,
      year: c.year,
      median_price,
      median_km,
      median_history,
      sample_size,
      window_days: window,
      group_version: GROUP_VERSION,
      engine_version: ENGINE_VERSION,
      computed_at: now,
      pool: cellPool,
      histories: values.length,
      with_record,
    });
  }

  // §9.10: the invariant the engine throws on (§9.6) — assert it here, before anything is written.
  for (const r of cellRows) {
    if (r.sample_size < MIN_SAMPLE && r.median_history !== null) {
      throw new Error(`cell ${r.comparison_group} x ${r.year}: sample_size ${r.sample_size} < ${MIN_SAMPLE} but median_history is ${r.median_history} - a thin cell must carry no typical (§9.10)`);
    }
  }
  const cellByKey = new Map(cellRows.map((r) => [`${r.comparison_group} ${r.year}`, r]));

  // ---------- 4. model rows (§5.2) ----------
  // P5: one (make, model) must not span two vehicle_class values.
  const classesByModel = new Map<string, Set<string>>();
  for (const l of live) {
    const k = `${l.make}|${l.model}`;
    if (!classesByModel.has(k)) classesByModel.set(k, new Set());
    (classesByModel.get(k) as Set<string>).add(l.vehicle_class);
  }
  const p5 = [...classesByModel.entries()].filter(([, s]) => s.size > 1);
  if (p5.length) {
    throw new Error(`P5: ${p5.map(([k, s]) => `${k.replace("|", " ")} spans vehicle_class ${[...s].sort().join(", ")}`).join("; ")} - stop and report`);
  }

  // The regression pool (Day 18 §4): the 90-day MARKET listings of a cell WITH A NORM (sample_size >= MIN_SAMPLE)
  // whose km row is scored. y and x are M5's: y = price deviation from the cell median in %, x = km_dev_per_year /
  // 1000, and km_dev_per_year is read off the engine's own km row, never recomputed here.
  type M5Row = { l: PoolListing; y: number; x: number };
  const m5All: M5Row[] = [];
  let m5NoCell = 0, m5Thin = 0, m5NoKmRow = 0;
  for (const l of market90) {
    const cellRow = cellByKey.get(`${l.key} ${l.year}`);
    if (cellRow === undefined) { m5NoCell++; continue; }
    if (cellRow.sample_size < MIN_SAMPLE) { m5Thin++; continue; }
    if (cellRow.median_price <= 0) throw new Error(`cell ${cellRow.comparison_group} x ${cellRow.year}: median_price ${cellRow.median_price}`);
    const input: ScoringInput = { ...l.subject, market: cellNormOf(cellRow) };
    const km = kmRow(input, now);
    const dev = km.raw.km_dev_per_year;
    if (km.status !== "scored" || typeof dev !== "number") { m5NoKmRow++; continue; }
    m5All.push({ l, y: ((l.price - cellRow.median_price) / cellRow.median_price) * 100, x: dev / 1000 });
  }

  const modelKeys = [...new Set(live.map((l) => `${l.make}|${l.model}`))].sort();
  const modelRows: ModelRow[] = modelKeys.map((k) => {
    const [make, model] = k.split("|");
    // Day 15 (§1.2): the chips are measured on the model's FULL LIVE POOL — every live listing of the model,
    // nulls dropped, no cell, no window, no thin-cell test and no other filter. Not the regression pool below.
    const modelLive = live.filter((l) => l.make === make && l.model === model);
    const kms = modelLive.map((l) => l.km).filter((v): v is number => v !== null);
    if (kms.length > 0 && quantile(kms, 0.5) !== median(kms)) {
      throw new Error(`${make} ${model}: quantile(p=0.5) ${quantile(kms, 0.5)} != median() ${median(kms)} over ${kms.length} km values - the two conventions must agree (§1.2)`);
    }
    const anchors = { km_filter_anchors: kmFilterAnchors(kms), km_listings: kms.length, km_live: modelLive.length };
    const set = m5All.filter((r) => r.l.make === make && r.l.model === model);
    const fit: Fit = ols(set.map((r) => r.y), [{ name: X_NAME, v: set.map((r) => r.x) }]);
    if (!fit.ok) {
      return { make, model, km_slope: null, km_slope_n: 0, ...anchors, engine_version: ENGINE_VERSION, group_version: GROUP_VERSION, computed_at: now, fit_note: `fit dropped: ${fit.reason}` };
    }
    const c = at(fit, X_NAME);
    if (c === null) {
      return { make, model, km_slope: null, km_slope_n: 0, ...anchors, engine_version: ENGINE_VERSION, group_version: GROUP_VERSION, computed_at: now, fit_note: `column dropped: ${fit.dropped.join(", ")}` };
    }
    // §0.3: stored with its real sign — the OLS coefficient as it comes out (more km → negative).
    // M5's tables print minus this number, which is why Day 13 reads 0.64 / 1.19 there and -0.64 / -1.19 here.
    // Run 1b (§1): at DECIMALS places, like the anchor values.
    return { make, model, km_slope: stored(c.coef), km_slope_n: fit.n, ...anchors, engine_version: ENGINE_VERSION, group_version: GROUP_VERSION, computed_at: now, fit_note: null };
  });

  // ---------- 5. the pool row (§5.3, Day 18 §5) ----------
  // Per 90-day market listing with a new price and a first registration: ratio = price / new_price and M8's age,
  // from first_registration to first_seen_at — price and age read at the same moment.
  type M8Row = { l: PoolListing; ratio: number; age: number };
  const m8All: M8Row[] = [];
  let m8NoNew = 0, m8NoReg = 0;
  for (const l of market90) {
    if (l.new_price === null || l.new_price <= 0) { m8NoNew++; continue; }
    if (l.first_registration === null) { m8NoReg++; continue; }
    m8All.push({ l, ratio: l.price / l.new_price, age: (l.first_seen_at.getTime() - l.first_registration.getTime()) / YEAR_MS });
  }
  // Day 18 (§5): the fit's points are MODEL-YEARS keyed (make, model, year), equal weight, each with at least
  // ANCHOR_POINT_MIN_SAMPLE listings: median ratio, median age, rounded to DECIMALS — the data as stored.
  const observations: AnchorObservation[] = m8All.map((r) => ({ make: r.l.make, model: r.l.model, year: r.l.year, ratio: r.ratio, age: r.age }));
  const { points, thin: thinPoints } = buildAnchorPoints(observations, DECIMALS);
  const pointKeys = new Set(points.map(pointKey));
  const behindPoints = m8All.filter((r) => pointKeys.has(pointKey({ make: r.l.make, model: r.l.model, year: r.l.year })));

  let poolRow: PoolRow;
  let looRows: { p: AnchorPoint; err: number | null; pred: number | null }[] = [];
  let perListingFit: { a: number; b: number; n: number; looMax: number | null } | null = null;
  if (points.length < ANCHOR_MIN_POINTS) {
    // P4: one row, no anchor anywhere — the values are null together and there are no points.
    poolRow = { anchor_ratio_intercept: null, anchor_ratio_per_year: null, anchor_error_pct: null, anchor_age_min_years: null, anchor_age_max_years: null, anchor_n: 0, anchor_listings: 0, anchor_points: [], engine_version: ENGINE_VERSION, computed_at: now };
  } else {
    const fit = ols(points.map((p) => p.ratio), [{ name: "age", v: points.map((p) => p.median_age) }]);
    if (!fit.ok) throw new Error(`anchor curve: the fit over ${points.length} model-year points was dropped - ${fit.reason}`);
    const b = at(fit, "age");
    if (b === null) throw new Error(`anchor curve: the age column was dropped (${fit.dropped.join(", ")})`);
    // M8b, on the same points: hold out one model-year, fit on the rest, ask the line for the held-out one.
    looRows = points.map((p) => {
      const r = loo({ medianRatio: p.ratio, medianAge: p.median_age }, points.filter((x) => pointKey(x) !== pointKey(p)).map((x) => ({ ratio: x.ratio, age: x.median_age })), `anchor curve, holding out ${p.make} ${p.model} ${p.year}`);
      return { p, err: r.err, pred: r.pred };
    });
    const errs = looRows.map((x) => x.err);
    if (errs.some((e) => e === null)) {
      throw new Error(`anchor curve: ${errs.filter((e) => e === null).length} of ${errs.length} leave-one-out fits produced no error - the curve error is not measurable, stop`);
    }
    const ages = points.map((p) => p.median_age);
    // Run 1b (§1): the decimals at DECIMALS places — the values the engine will read back.
    poolRow = {
      anchor_ratio_intercept: stored(fit.coef[0]),
      anchor_ratio_per_year: stored(b.coef),
      anchor_error_pct: stored(Math.max(...(errs as number[]))), // §2: "the worst model-year"
      anchor_age_min_years: stored(Math.min(...ages)),
      anchor_age_max_years: stored(Math.max(...ages)),
      anchor_n: points.length, // the points the line was fitted through
      anchor_listings: behindPoints.length, // the market listings (= cars) behind those points
      anchor_points: points,
      engine_version: ENGINE_VERSION,
      computed_at: now,
    };
    // Reported only, never stored: M8 / M8b as coded fit over LISTINGS — Day 13's method, over the listings
    // behind the points. Q9 was answered (ii): the line the engine uses is the model-year-point fit above.
    const pl = ols(behindPoints.map((r) => r.ratio), [{ name: "age", v: behindPoints.map((r) => r.age) }]);
    const plb = pl.ok ? at(pl, "age") : null;
    if (pl.ok && plb !== null) {
      const errs = points.map((p) => loo({ medianRatio: p.ratio, medianAge: p.median_age }, behindPoints.filter((x) => pointKey({ make: x.l.make, model: x.l.model, year: x.l.year }) !== pointKey(p)), `M8b as coded, holding out ${p.make} ${p.model} ${p.year}`).err);
      perListingFit = { a: pl.coef[0], b: plb.coef, n: pl.n, looMax: errs.some((e) => e === null) ? null : Math.max(...(errs as number[])) };
    }
  }

  // ---------- 6. report (§5.5) ----------
  console.log(`\n===== CELL ROWS (${cellRows.length}) =====`);
  console.log("comparison_group | year | window | sample_size | median_price | median_km | median_history (n) | old typical (v2) | difference");
  for (const r of cellRows) {
    const flag = r.sample_size < MIN_SAMPLE ? " THIN" : "";
    const hist = r.median_history === null ? "-" : `${f(r.median_history, 2)} (${r.histories})`;
    // §5.5: the old typical as the cell's listings carry it today, from score_breakdown.typical_condition.
    const olds = [...new Set(r.pool.map((l) => l.typical_v2).filter((v): v is number => v !== null))];
    const oldText = olds.length === 0 ? "-" : olds.length === 1 ? f(olds[0], 2) : `${olds.map((v) => f(v, 2)).join(" / ")} (NOT ONE VALUE)`;
    const diff = olds.length === 1 && r.median_history !== null ? f(olds[0] - r.median_history, 2) : "-";
    console.log(`\n${r.comparison_group} | ${r.year} | ${r.window_days} | ${r.sample_size} | ${r.median_price} | ${r.median_km ?? "-"} | ${hist} | ${oldText} | ${diff}${flag}`);
    console.log(`  dealer_type mix: ${mix(r.pool)}; listings with a registry record: ${r.with_record} of ${r.sample_size}`);
  }
  console.log(`\n(difference = old typical_condition (v2) - new median_history. §0.7: within a cell every listing's deal moves by exactly this constant,`);
  console.log(` plus the change of its km row where the model's slope replaces the default.)`);

  console.log(`\n===== MODEL ROWS (${modelRows.length}) =====`);
  console.log(`regression pool: ${m5All.length} of ${market90.length} 90-day market listings (dropped: ${m5NoCell} with no cell row, ${m5Thin} in a thin cell, ${m5NoKmRow} with no scored km row)`);
  console.log(`make | model | km_slope (stored sign, ${DECIMALS} dp) | n | engine uses it? | note`);
  for (const r of modelRows) {
    const uses = r.km_slope !== null && r.km_slope_n >= KM_SLOPE_MIN_SAMPLE;
    console.log(`${r.make} | ${r.model} | ${f(r.km_slope, DECIMALS)} | ${r.km_slope_n} | ${uses ? "yes" : `no - the default (n < ${KM_SLOPE_MIN_SAMPLE})`} | ${r.fit_note ?? "-"}`);
  }
  // Day 15 (§1.2 / §1.3): the km filter chips, per model, with the raw quartiles beside the stored (rounded,
  // deduplicated) array so the rounding is visible.
  console.log(`\nkm filter anchors (quartiles ${KM_ANCHOR_QUANTILES.join(" / ")} of km_declared over the model's FULL live pool, each rounded UP to ${KM_ANCHOR_ROUNDING}, deduplicated):`);
  console.log("make | model | live listings | with km | raw P25 / P50 / P75 | stored km_filter_anchors");
  for (const r of modelRows) {
    const kms = live.filter((l) => l.make === r.make && l.model === r.model).map((l) => l.km).filter((v): v is number => v !== null);
    const rawText = kms.length === 0 ? "-" : KM_ANCHOR_QUANTILES.map((p) => Math.round(quantile(kms, p))).join(" / ");
    console.log(`${r.make} | ${r.model} | ${r.km_live} | ${r.km_listings} | ${rawText} | [${r.km_filter_anchors.join(", ")}]${r.km_filter_anchors.length < KM_ANCHOR_QUANTILES.length ? `  (${KM_ANCHOR_QUANTILES.length - r.km_filter_anchors.length} chip(s) lost to deduplication)` : ""}`);
  }
  console.log(`P5 (one vehicle_class per make+model): passed - ${classesByModel.size} model(s) checked`);

  console.log(`\n===== POOL ROW (the anchor curve) =====`);
  console.log(`listings: ${m8All.length} of ${market90.length} 90-day market listings (dropped: ${m8NoNew} with no new price, ${m8NoReg} with no first_registration)`);
  console.log(`model-years: ${points.length + thinPoints.length}; points (n >= ANCHOR_POINT_MIN_SAMPLE = ${ANCHOR_POINT_MIN_SAMPLE}): ${points.length}, over ${behindPoints.length} listings; a line needs ANCHOR_MIN_POINTS = ${ANCHOR_MIN_POINTS}`);
  if (points.length) {
    console.log("make | model | year | n | median ratio | median age (yrs) | predicted (leave-one-out) | error %");
    for (const p of points) {
      const lr = looRows.find((x) => x.p === p);
      console.log(`${p.make} | ${p.model} | ${p.year} | ${p.n} | ${f(p.ratio, 3)} | ${f(p.median_age, 2)} | ${f(lr?.pred ?? null, 3)} | ${f(lr?.err ?? null, 2)}`);
    }
  }
  if (thinPoints.length) {
    console.log(`model-years below the bar (not fitted, not in anchor_points):`);
    for (const t of thinPoints) console.log(`  ${t.make} | ${t.model} | ${t.year} | n ${t.n}`);
  }
  // Run 1b (§1): printed at DECIMALS places — this line is the row as it would be stored, digit for digit.
  console.log(`THE ROW (${DECIMALS} dp): intercept ${f(poolRow.anchor_ratio_intercept, DECIMALS)} | per_year ${f(poolRow.anchor_ratio_per_year, DECIMALS)} | error_pct ${f(poolRow.anchor_error_pct, DECIMALS)} | age ${f(poolRow.anchor_age_min_years, DECIMALS)} … ${f(poolRow.anchor_age_max_years, DECIMALS)} | n ${poolRow.anchor_n} points | ${poolRow.anchor_listings} listings`);
  console.log(`anchor_points: ${JSON.stringify(poolRow.anchor_points)}`);
  if (perListingFit !== null) {
    console.log(`Day 13 method, NOT STORED (M8 / M8b as coded, fitted over the ${perListingFit.n} listings behind the points): intercept ${f(perListingFit.a, 4)}, per_year ${f(perListingFit.b, 4)}, worst leave-one-out error ${f(perListingFit.looMax, 2)} %.`);
  }

  // ---------- 6b. Day 18 §6: the trim table ----------
  console.log(`\n===== TRIM TABLE (§6) — distance from the curve per (make, model, ramat_gimur), 90-day market =====`);
  if (poolRow.anchor_ratio_intercept === null || poolRow.anchor_ratio_per_year === null) {
    console.log("no curve this run - no distances");
  } else {
    const a = poolRow.anchor_ratio_intercept, b = poolRow.anchor_ratio_per_year;
    const trims = new Map<string, M8Row[]>();
    for (const r of m8All) {
      const k = `${r.l.make}|${r.l.model}|${r.l.sub_model ?? "(null)"}`;
      if (!trims.has(k)) trims.set(k, []);
      (trims.get(k) as M8Row[]).push(r);
    }
    console.log(`distance per listing = (price / new_price - (intercept + per_year × age at first_seen_at)) × 100, in ratio points; ${m8All.length} listings with a new price and a first registration`);
    console.log("make | model | ramat_gimur | n (cars) | model years | median distance | spread (max - min of the per-year medians)");
    for (const [k, rows] of [...trims.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
      const [make, model, trim] = k.split("|");
      const dist = (r: M8Row) => (r.ratio - (a + b * r.age)) * 100;
      const years = [...new Set(rows.map((r) => r.l.year))].sort((x, y) => x - y);
      const perYear = years.map((y) => median(rows.filter((r) => r.l.year === y).map(dist)));
      const spread = perYear.length > 1 ? Math.max(...perYear) - Math.min(...perYear) : null;
      console.log(`${make} | ${model} | ${trim} | ${rows.length} | ${years.join(", ")} | ${f(median(rows.map(dist)), 2)} | ${spread === null ? "- (one year)" : f(spread, 2)}`);
    }
  }

  // ---------- 7. summary ----------
  console.log("\n===== SUMMARY =====");
  console.log(`listings in DB                      ${totalListings}`);
  console.log(`models in the 180-day market        ${models.length}`);
  console.log(`listings (= cars) in 90-day market  ${market90.length}`);
  console.log(`listings (= cars) in 180-day market ${market180.length}`);
  console.log(`live listings (delisted_at null)    ${live.length}`);
  console.log(`cells                               ${cellList.length}`);
  console.log(`cell rows                           ${cellRows.length}`);
  console.log(`rows widened to 180                 ${widened}`);
  console.log(`thin rows (sample_size < ${MIN_SAMPLE})         ${thin}`);
  console.log(`cell rows with median_history       ${cellRows.filter((r) => r.median_history !== null).length}`);
  console.log(`model rows                          ${modelRows.length}`);
  console.log(`pool rows                           1`);
  console.log(`engine_version                      ${ENGINE_VERSION}`);

  // ---------- 7b. Day 18 §11: the read-back, old -> new ----------
  // "old" = the rows a score run reads today: the latest row per key at the current group_version, any engine version.
  console.log(`\n===== READ-BACK (§11) — old = the latest stored row per key (any engine_version), new = this run =====`);
  const oldCells = await db.market_stats.findMany({ where: { group_version: GROUP_VERSION }, orderBy: [{ computed_at: "desc" }, { id: "desc" }] });
  const oldCellOf = new Map<string, (typeof oldCells)[number]>();
  for (const r of oldCells) if (!oldCellOf.has(`${r.comparison_group} ${r.year}`)) oldCellOf.set(`${r.comparison_group} ${r.year}`, r);
  console.log("cell | sample_size old -> new | window old -> new | median_price old -> new");
  const cellKeys = [...new Set([...oldCellOf.keys(), ...cellByKey.keys()])].sort();
  for (const k of cellKeys) {
    const o = oldCellOf.get(k), n = cellByKey.get(k);
    console.log(`${k} | ${arrow(o?.sample_size, n?.sample_size)} | ${arrow(o?.window_days, n?.window_days)} | ${arrow(o?.median_price, n?.median_price)}`);
  }
  const oldModels = await db.model_stats.findMany({ where: { group_version: GROUP_VERSION }, orderBy: [{ computed_at: "desc" }, { id: "desc" }] });
  const oldModelOf = new Map<string, (typeof oldModels)[number]>();
  for (const r of oldModels) if (!oldModelOf.has(`${r.make}|${r.model}`)) oldModelOf.set(`${r.make}|${r.model}`, r);
  console.log("\nmodel | km_slope old -> new | km_slope_n old -> new");
  for (const r of modelRows) {
    const o = oldModelOf.get(`${r.make}|${r.model}`);
    console.log(`${r.make} ${r.model} | ${arrow(o?.km_slope, r.km_slope)} | ${arrow(o?.km_slope_n, r.km_slope_n)}`);
  }
  const oldPool = await db.pool_stats.findFirst({ orderBy: [{ computed_at: "desc" }, { id: "desc" }] });
  console.log(`\npool: row ${oldPool?.id ?? "-"} (engine_version ${oldPool?.engine_version ?? "-"}) -> this run`);
  console.log(`  intercept ${arrow(oldPool?.anchor_ratio_intercept, poolRow.anchor_ratio_intercept)} | per_year ${arrow(oldPool?.anchor_ratio_per_year, poolRow.anchor_ratio_per_year)} | error_pct ${arrow(oldPool?.anchor_error_pct, poolRow.anchor_error_pct)} | anchor_n ${arrow(oldPool?.anchor_n, poolRow.anchor_n)} | anchor_listings ${arrow(oldPool?.anchor_listings, poolRow.anchor_listings)}`);
  console.log(`  points in: ${points.map((p) => `${p.make} ${p.model} ${p.year} (n ${p.n})`).join("; ") || "none"}`);

  // Thin-cell listings without an anchor. old: live listings whose STORED invoice's price row rests on a thin cell
  // (raw.sample_size < MIN_SAMPLE — carried on the anchored and the unanchored path alike), without an anchor = that
  // row is not scored. new: live listings in a cell this run makes thin, whose price row the engine (v4 gate) would
  // leave unscored with this run's pool row and points.
  const inputPool: NonNullable<ScoringInput["pool_stats"]> = {
    id: 0,
    anchor_ratio_intercept: poolRow.anchor_ratio_intercept, anchor_ratio_per_year: poolRow.anchor_ratio_per_year, anchor_error_pct: poolRow.anchor_error_pct,
    anchor_age_min_years: poolRow.anchor_age_min_years, anchor_age_max_years: poolRow.anchor_age_max_years,
    anchor_points: poolRow.anchor_points, anchor_n: poolRow.anchor_n, anchor_listings: poolRow.anchor_listings,
  };
  const storedPrice = (bd: unknown) => ((bd ?? null) as { rows?: { row?: string; status?: string; raw?: { sample_size?: unknown } }[] } | null)?.rows?.find((r) => r.row === "price");
  const oldThin = live.filter((l) => {
    const n = storedPrice(l.stored_breakdown)?.raw?.sample_size;
    return typeof n === "number" && n < MIN_SAMPLE;
  });
  const oldWithout = oldThin.filter((l) => storedPrice(l.stored_breakdown)?.status !== "scored");
  const noStored = live.filter((l) => l.stored_breakdown === null).length;
  const newThin: { l: PoolListing; why: string }[] = [];
  let noCellRow = 0;
  for (const l of live) {
    const c = cellByKey.get(`${l.key} ${l.year}`);
    if (c === undefined) { noCellRow++; continue; }
    if (c.sample_size >= MIN_SAMPLE) continue;
    const newPrice = l.new_price === null ? null : { id: l.new_car_price_id as number, mehir: l.new_price };
    const subject = { ...l.subject, listing: { ...l.subject.listing, new_price: newPrice?.mehir ?? null, new_car_price_id: newPrice?.id ?? null } };
    const p = priceRow({ ...subject, market: cellNormOf(c), pool_stats: inputPool }, now);
    newThin.push({ l, why: p.status === "scored" ? "anchored" : String(p.raw.anchor_unavailable ?? p.reason) });
  }
  const newWithout = newThin.filter((x) => x.why !== "anchored");
  console.log(`\nthin-cell live listings: old ${oldThin.length} -> new ${newThin.length}; of them WITHOUT an anchor: old ${oldWithout.length} -> new ${newWithout.length}`);
  console.log(`  (live listings with no stored invoice: ${noStored}; live listings with no cell row this run: ${noCellRow})`);
  for (const x of newWithout) console.log(`  new, without an anchor: listing ${x.l.id} (${x.l.plate}) ${x.l.make} ${x.l.model} ${x.l.year} — ${x.why}`);

  // The model-code check.
  console.log(`\nmodel-code check (§11): comparison_group of the catalog rows — expected one group per line`);
  for (const chk of MODEL_CODE_CHECK) {
    const rows = await db.models.findMany({ where: { degem_code: { in: chk.codes }, year: chk.year }, orderBy: [{ degem_code: "asc" }, { id: "asc" }] });
    const groups = [...new Set(rows.map((r) => r.comparison_group ?? "(null)"))];
    console.log(`${chk.name} ${chk.year} (${chk.codes.join(", ")}): ${rows.length} models row(s), ${groups.length} distinct comparison_group`);
    for (const r of rows) {
      const now_key = groupKey({ vehicle_class: r.vehicle_class, make: r.make, model: r.model, body_type: r.body_type, fuel_type: r.fuel_type, engine_size: r.engine_size, horsepower: r.horsepower, transmission: r.transmission, drive_type: r.drive_type, sub_model: r.sub_model });
      console.log(`  ${r.degem_code} (${r.vehicle_class}) sub_model ${r.sub_model ?? "-"} | stored ${r.comparison_group ?? "(null)"}${now_key !== r.comparison_group ? ` | groupKey(fields) now ${now_key}` : ""}`);
    }
    for (const code of chk.codes) if (!rows.some((r) => r.degem_code === code)) console.log(`  ${code}: no models row for year ${chk.year}`);
  }

  // ---------- 8. the skip rule, then the write (§5.4) ----------
  // Skip rule (§0.1): a new row only when the values changed against the latest row of the same key at
  // the same versions (and window_days for cells). Write order: pool → model → cell.
  // Day 15 (§1.3): evaluated in BOTH modes. The dry run has to be able to say which rows a --write would
  // append and why — it still writes nothing; only the reading below moved above the DRY branch.
  const latestPool = await db.pool_stats.findFirst({ where: { engine_version: ENGINE_VERSION }, orderBy: [{ computed_at: "desc" }, { id: "desc" }] });
  // Day 15 (§1.3): the comparisons, each one named, so the report says WHICH value made the row differ.
  // Run 1b (§1): the computed side of the decimal comparisons is already rounded to DECIMALS places.
  // Day 18 (§3.5): anchor_points joins the comparison, its numbers compared at 6 dp.
  const poolDiff = ((): string[] => {
    if (latestPool === null) return ["no previous row at this engine_version"];
    const cmp: [string, number | null, number | null][] = [
      ["anchor_ratio_intercept", latestPool.anchor_ratio_intercept, poolRow.anchor_ratio_intercept],
      ["anchor_ratio_per_year", latestPool.anchor_ratio_per_year, poolRow.anchor_ratio_per_year],
      ["anchor_error_pct", latestPool.anchor_error_pct, poolRow.anchor_error_pct],
      ["anchor_age_min_years", latestPool.anchor_age_min_years, poolRow.anchor_age_min_years],
      ["anchor_age_max_years", latestPool.anchor_age_max_years, poolRow.anchor_age_max_years],
      ["anchor_n", latestPool.anchor_n, poolRow.anchor_n],
      ["anchor_listings", latestPool.anchor_listings, poolRow.anchor_listings],
    ];
    const diffs = cmp.filter(([, a, b]) => a !== b).map(([name, a, b]) => `${name} ${a === null ? "null" : a} -> ${b === null ? "null" : b}`);
    const prevPoints = parseAnchorPoints(latestPool.anchor_points, `pool_stats ${latestPool.id}`);
    if (!sameAnchorPoints(prevPoints, poolRow.anchor_points)) diffs.push(`anchor_points ${prevPoints === null ? "null" : `${prevPoints.length} point(s)`} -> ${poolRow.anchor_points.length} point(s)`);
    return diffs;
  })();
  const poolChanged = poolDiff.length > 0;

  const latestModels = await db.model_stats.findMany({
    where: { engine_version: ENGINE_VERSION, group_version: GROUP_VERSION },
    orderBy: [{ computed_at: "desc" }, { id: "desc" }],
  });
  const latestModelOf = new Map<string, (typeof latestModels)[number]>();
  for (const r of latestModels) {
    const k = `${r.make}|${r.model}`;
    if (!latestModelOf.has(k)) latestModelOf.set(k, r);
  }
  // Day 15 (§1.2): km_filter_anchors joins the comparison — "a row is written only if any column differs
  // from the model's last row at the same versions". The stored value is Json; equality is element-wise on
  // the array, and a previous null (a row from before the column existed) always differs.
  const sameAnchors = (prev: unknown, next: number[]): boolean =>
    Array.isArray(prev) && prev.length === next.length && prev.every((v, i) => v === next[i]);
  const modelDiff = (r: ModelRow): string[] => {
    const prev = latestModelOf.get(`${r.make}|${r.model}`);
    if (prev === undefined) return ["no previous row"];
    const changed: string[] = [];
    if (prev.km_slope !== r.km_slope) changed.push(`km_slope ${prev.km_slope === null ? "null" : prev.km_slope} -> ${r.km_slope === null ? "null" : r.km_slope}`);
    if (prev.km_slope_n !== r.km_slope_n) changed.push(`km_slope_n ${prev.km_slope_n} -> ${r.km_slope_n}`);
    if (!sameAnchors(prev.km_filter_anchors, r.km_filter_anchors)) {
      changed.push(`km_filter_anchors ${prev.km_filter_anchors === null ? "null" : JSON.stringify(prev.km_filter_anchors)} -> ${JSON.stringify(r.km_filter_anchors)}`);
    }
    return changed;
  };
  const modelsToWrite = modelRows.filter((r) => modelDiff(r).length > 0);

  const latestCells = await db.market_stats.findMany({
    where: { engine_version: ENGINE_VERSION, group_version: GROUP_VERSION },
    orderBy: [{ computed_at: "desc" }, { id: "desc" }],
  });
  const latestCellOf = new Map<string, (typeof latestCells)[number]>();
  for (const r of latestCells) {
    const k = `${r.comparison_group} ${r.year} ${r.window_days}`;
    if (!latestCellOf.has(k)) latestCellOf.set(k, r);
  }
  const cellsToWrite = cellRows.filter((r) => {
    const prev = latestCellOf.get(`${r.comparison_group} ${r.year} ${r.window_days}`);
    return (
      prev === undefined ||
      prev.median_price !== r.median_price ||
      prev.median_km !== r.median_km ||
      prev.median_history !== r.median_history ||
      prev.sample_size !== r.sample_size
    );
  });

  // Day 15 (§1.3): the same three lines in both modes — what a --write would append, and for the model rows
  // which column made each of them differ.
  console.log(`\n===== ROWS THIS RUN WOULD APPEND (skip rule §0.1) =====`);
  console.log(`pool_stats:   ${poolChanged ? 1 : 0} new, ${poolChanged ? 0 : 1} skipped (identical)`);
  console.log(`model_stats:  ${modelsToWrite.length} new, ${modelRows.length - modelsToWrite.length} skipped (identical)`);
  console.log(`market_stats: ${cellsToWrite.length} new, ${cellRows.length - cellsToWrite.length} skipped (identical)`);
  if (poolChanged) console.log(`  pool_stats (vs row ${latestPool?.id ?? "-"}, computed_at ${latestPool?.computed_at.toISOString() ?? "-"}): ${poolDiff.join("; ")}`);
  for (const r of modelsToWrite) console.log(`  model_stats ${r.make} ${r.model}: ${modelDiff(r).join("; ")}`);

  if (DRY) {
    console.log("\n[DRY RUN] nothing written");
    return;
  }

  const written = await db.$transaction(async (tx) => {
    const poolWritten = poolChanged
      ? (await tx.pool_stats.create({ data: { ...poolRow, anchor_points: poolRow.anchor_points as unknown as Prisma.InputJsonValue } }))
      : null;
    const modelWritten = modelsToWrite.length
      ? (await tx.model_stats.createMany({
          data: modelsToWrite.map((r) => ({ make: r.make, model: r.model, km_slope: r.km_slope, km_slope_n: r.km_slope_n, km_filter_anchors: r.km_filter_anchors, engine_version: r.engine_version, group_version: r.group_version, computed_at: r.computed_at })),
        })).count
      : 0;
    const cellWritten = cellsToWrite.length
      ? (await tx.market_stats.createMany({
          data: cellsToWrite.map((r) => ({
            comparison_group: r.comparison_group, year: r.year, median_price: r.median_price, median_km: r.median_km,
            median_history: r.median_history, sample_size: r.sample_size, window_days: r.window_days,
            group_version: r.group_version, engine_version: r.engine_version, computed_at: r.computed_at,
          })),
        })).count
      : 0;
    return { pool: poolWritten === null ? 0 : 1, model: modelWritten, cell: cellWritten };
  });
  console.log(`\npool_stats:   ${written.pool} written, ${1 - written.pool} skipped (unchanged)`);
  console.log(`model_stats:  ${written.model} written, ${modelRows.length - written.model} skipped (unchanged)`);
  console.log(`market_stats: ${written.cell} written, ${cellRows.length - written.cell} skipped (unchanged)`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
