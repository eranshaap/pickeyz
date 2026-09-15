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
//   Every listing in the pool contributes price. Every listing counts - no dedupe by car, dealer or phone.
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
// Model and pool rows are measured on LIVE listings (delisted_at is null), as M5 / M8 measure them.
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

import "dotenv/config";
import { db } from "@/lib/db";
import { GROUP_VERSION, groupKey, type GroupFields } from "@/lib/comparison-group";
import { ENGINE_VERSION, KM_SLOPE_MIN_SAMPLE, MIN_SAMPLE } from "@/lib/scoring/constants";
import { historyRow, kmRow, type ScoringInput } from "@/lib/scoring";
import { scoringSubject } from "@/lib/scoring-input";
import { at, loo, ols, type Fit } from "./measure-constants";

const DRY = !process.argv.includes("--write");

const WINDOWS = [90, 180] as const;
type Window = (typeof WINDOWS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

// M5's column name — at(fit, X_NAME) reads the slope out of the fit.
const X_NAME = "x (km_dev/1000/yr)";
// P4: a curve needs at least this many model-years with a new price and a median.
const ANCHOR_MIN_MODEL_YEARS = 3;
// Day 15 (§1.2): the km filter chips are these quantiles of the model's live km_declared, each rounded UP to
// KM_ANCHOR_ROUNDING. Not constants of the engine - a chip is a UI number, and the pencil book holds no UI numbers.
const KM_ANCHOR_QUANTILES = [0.25, 0.5, 0.75] as const;
const KM_ANCHOR_ROUNDING = 10_000;
// Day 15, Run 1b (§1): the storage precision of every decimal a norms run writes. Not a constant of the
// engine and not a threshold - it is how many digits of a fitted coefficient we keep, uniform across the
// two tables that hold one, so that a stored value and a freshly computed one are comparable by ===.
const DECIMALS = 6;

type CellNorm = NonNullable<ScoringInput["market"]>;

type PoolListing = {
  id: number;
  car_id: number;
  year: number;
  price: number; // the contributed price
  km: number | null;
  dealer_type: string;
  delisted_at: Date | null;
  first_seen_at: Date;
  first_registration: Date | null;
  make: string;
  model: string;
  vehicle_class: string;
  new_price: number | null; // the latest new_car_prices row on the car's key; null when none matches
  typical_v2: number | null; // score_breakdown.typical_condition as the listing carries it today (§5.5)
  key: string; // groupKey(fields)
  subject: Omit<ScoringInput, "market">; // the listing and car as the engine sees them (§10)
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

function inWindow(l: PoolListing, now: Date, window: Window): boolean {
  return l.delisted_at === null || l.delisted_at.getTime() >= now.getTime() - window * DAY_MS;
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
  anchor_listings: number; // the listings behind those points — coverage, not the fit's n
  engine_version: number;
  computed_at: Date;
};

// The cell as the engine reads it, for a row that is not written yet and therefore has no id.
// §22.4: the history and km rows never read `id`; priceRow must NOT be called with this object —
// its raw.market_stats_id would be wrong.
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

async function main() {
  const now = new Date();
  const maxWindow = Math.max(...WINDOWS) as Window;
  console.log(`${DRY ? "[DRY RUN] " : ""}compute-market-stats - now = ${now.toISOString()}, group_version = ${GROUP_VERSION}, engine_version = ${ENGINE_VERSION}`);

  // ---------- 1. the pool ----------
  const totalListings = await db.listings.count();

  const raw = await db.listings.findMany({
    where: {
      first_seen_at: { lte: now },
      OR: [{ delisted_at: null }, { delisted_at: { gte: new Date(now.getTime() - maxWindow * DAY_MS) } }],
    },
    include: { car: { include: { model: true } }, dealer: { select: { dealer_type: true } } },
    orderBy: { id: "asc" },
  });

  const pool: PoolListing[] = raw.map((l) => {
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
      id: l.id, car_id: l.car_id, year: l.car.year, price: l.price, km: l.km_declared,
      dealer_type: l.dealer.dealer_type, delisted_at: l.delisted_at,
      first_seen_at: l.first_seen_at,
      first_registration: l.car.first_registration,
      make: m.make, model: m.model, vehicle_class: m.vehicle_class,
      new_price: null, // filled below from new_car_prices
      typical_v2: bd !== null && typeof bd.typical_condition === "number" ? bd.typical_condition : null,
      key: groupKey(fields),
      subject: scoringSubject(l, l.car, l.dealer.dealer_type),
    };
  });

  // The new-car price, joined exactly as select-three.ts joins it: the latest published_at row of
  // new_car_prices on (degem_code = models.degem_code, sug_degem = models.vehicle_class, shnat_yitzur = cars.year).
  type NewPriceKey = { degem_code: string; shnat_yitzur: number; sug_degem: string };
  const keyText = (k: NewPriceKey) => `${k.degem_code}|${k.shnat_yitzur}|${k.sug_degem}`;
  const wanted = new Map<string, NewPriceKey>();
  const listingKey = new Map<number, string>();
  for (let i = 0; i < pool.length; i++) {
    const dc = raw[i].car.model.degem_code;
    if (dc === null) continue; // no key, no new price; counted in the report
    const k: NewPriceKey = { degem_code: dc, shnat_yitzur: pool[i].year, sug_degem: pool[i].vehicle_class };
    wanted.set(keyText(k), k);
    listingKey.set(pool[i].id, keyText(k));
  }
  const priceRows = wanted.size
    ? await db.new_car_prices.findMany({ where: { OR: [...wanted.values()] }, orderBy: [{ published_at: "desc" }, { id: "desc" }] })
    : [];
  const latestPrice = new Map<string, number>();
  for (const r of priceRows) {
    const k = keyText(r);
    if (!latestPrice.has(k)) latestPrice.set(k, r.mehir); // first = latest published_at
  }
  for (const l of pool) {
    const k = listingKey.get(l.id);
    l.new_price = k === undefined ? null : latestPrice.get(k) ?? null;
  }

  const pool90 = pool.filter((l) => inWindow(l, now, 90));
  const pool180 = pool.filter((l) => inWindow(l, now, 180));
  const live = pool.filter((l) => l.delisted_at === null);

  // ---------- 2. cells ----------
  const cells = new Map<string, Cell>();
  for (const l of pool90) {
    const id = `${l.key} ${l.year}`;
    const c = cells.get(id);
    if (c) c.count90++;
    else cells.set(id, { key: l.key, year: l.year, count90: 1 });
  }
  const cellList = [...cells.values()].sort((a, b) => a.key.localeCompare(b.key) || a.year - b.year);

  console.log(`\n===== DISTRIBUTION - (comparison_group, year) cells in the 90-day pool (${cellList.length}) =====`);
  for (const c of cellList) console.log(`${c.count90.toString().padStart(4)}  ${c.key} x ${c.year}`);

  // ---------- 3. one row per cell ----------
  const cellRows: CellRow[] = [];
  let widened = 0; // cells whose 90-day sample was thin and were pooled at 180 days
  let thin = 0; // rows still below MIN_SAMPLE at the window actually used

  for (const c of cellList) {
    const inCell = (l: PoolListing) => l.year === c.year && l.key === c.key;
    let window: Window = 90;
    let cellPool = pool90.filter(inCell);
    if (cellPool.length < MIN_SAMPLE) {
      window = 180;
      cellPool = pool180.filter(inCell);
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

  // The regression pool: live listings of a cell WITH A NORM (sample_size >= MIN_SAMPLE) whose km row is
  // scored. y and x are M5's: y = price deviation from the cell median in %, x = km_dev_per_year / 1000,
  // and km_dev_per_year is read off the engine's own km row, never recomputed here.
  type M5Row = { l: PoolListing; y: number; x: number };
  const m5All: M5Row[] = [];
  let m5NoCell = 0, m5Thin = 0, m5NoKmRow = 0;
  for (const l of live) {
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

  // ---------- 5. the pool row (§5.3) ----------
  // Per live listing with a new price and a first registration: ratio = price / new_price and M8's age,
  // from first_registration to first_seen_at — price and age read at the same moment.
  type M8Row = { l: PoolListing; ratio: number; age: number };
  const m8All: M8Row[] = [];
  let m8NoNew = 0, m8NoReg = 0;
  for (const l of live) {
    if (l.new_price === null || l.new_price <= 0) { m8NoNew++; continue; }
    if (l.first_registration === null) { m8NoReg++; continue; }
    m8All.push({ l, ratio: l.price / l.new_price, age: (l.first_seen_at.getTime() - l.first_registration.getTime()) / YEAR_MS });
  }
  // The fit's points are MODEL-YEARS, equal weight: ratio per listing → median ratio per model-year,
  // age of the model-year = the median age of its listings.
  const myKeys = [...new Set(m8All.map((r) => `${r.l.model}|${r.l.year}`))].sort();
  const myears = myKeys.map((k) => {
    const [model, yearText] = k.split("|");
    const set = m8All.filter((r) => r.l.model === model && String(r.l.year) === yearText);
    return { key: k, model, year: Number(yearText), n: set.length, medianRatio: median(set.map((r) => r.ratio)), medianAge: median(set.map((r) => r.age)) };
  });

  let poolRow: PoolRow;
  let looRows: { my: (typeof myears)[number]; err: number | null; pred: number | null }[] = [];
  let perListingFit: { a: number; b: number; n: number; looMax: number | null } | null = null;
  if (myears.length < ANCHOR_MIN_MODEL_YEARS) {
    // P4: one row, no anchor anywhere — the five values are null together.
    poolRow = { anchor_ratio_intercept: null, anchor_ratio_per_year: null, anchor_error_pct: null, anchor_age_min_years: null, anchor_age_max_years: null, anchor_n: 0, anchor_listings: 0, engine_version: ENGINE_VERSION, computed_at: now };
  } else {
    const fit = ols(myears.map((p) => p.medianRatio), [{ name: "age", v: myears.map((p) => p.medianAge) }]);
    if (!fit.ok) throw new Error(`anchor curve: the fit over ${myears.length} model-year points was dropped - ${fit.reason}`);
    const b = at(fit, "age");
    if (b === null) throw new Error(`anchor curve: the age column was dropped (${fit.dropped.join(", ")})`);
    // M8b, on the same points: hold out one model-year, fit on the rest, ask the line for the held-out one.
    looRows = myears.map((my) => {
      const r = loo(my, myears.filter((x) => x.key !== my.key).map((x) => ({ ratio: x.medianRatio, age: x.medianAge })), `anchor curve, holding out ${my.model} ${my.year}`);
      return { my, err: r.err, pred: r.pred };
    });
    const errs = looRows.map((x) => x.err);
    if (errs.some((e) => e === null)) {
      throw new Error(`anchor curve: ${errs.filter((e) => e === null).length} of ${errs.length} leave-one-out fits produced no error - the curve error is not measurable, stop`);
    }
    const ages = myears.map((p) => p.medianAge);
    // Run 1b (§1): the five decimals at DECIMALS places — the values the engine will read back.
    poolRow = {
      anchor_ratio_intercept: stored(fit.coef[0]),
      anchor_ratio_per_year: stored(b.coef),
      anchor_error_pct: stored(Math.max(...(errs as number[]))), // §2: "the worst model-year"
      anchor_age_min_years: stored(Math.min(...ages)),
      anchor_age_max_years: stored(Math.max(...ages)),
      anchor_n: myears.length, // the points the line was fitted through
      anchor_listings: m8All.length, // the listings behind those points
      engine_version: ENGINE_VERSION,
      computed_at: now,
    };
    // Reported only, never stored: M8 / M8b as coded fit over LISTINGS — Day 13's method. Q9 was
    // answered (ii): the line the engine uses is the model-year-point fit above. This is printed beside
    // it so the two stay comparable.
    const pl = ols(m8All.map((r) => r.ratio), [{ name: "age", v: m8All.map((r) => r.age) }]);
    const plb = pl.ok ? at(pl, "age") : null;
    if (pl.ok && plb !== null) {
      const errs = myears.map((my) => loo(my, m8All.filter((x) => `${x.l.model}|${x.l.year}` !== my.key), `M8b as coded, holding out ${my.model} ${my.year}`).err);
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
  console.log(`regression pool: ${m5All.length} of ${live.length} live listings (dropped: ${m5NoCell} with no cell row, ${m5Thin} in a thin cell, ${m5NoKmRow} with no scored km row)`);
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
  console.log(`listings: ${m8All.length} of ${live.length} live (dropped: ${m8NoNew} with no new price, ${m8NoReg} with no first_registration)`);
  console.log(`fit points: ${myears.length} model-year(s), equal weight`);
  if (myears.length) {
    console.log("model | year | n | median ratio | median age (yrs) | predicted (leave-one-out) | error %");
    for (const { my, err, pred } of looRows) {
      console.log(`${my.model} | ${my.year} | ${my.n} | ${f(my.medianRatio, 3)} | ${f(my.medianAge, 2)} | ${f(pred, 3)} | ${f(err, 2)}`);
    }
  }
  // Run 1b (§1): printed at DECIMALS places — this line is the row as it would be stored, digit for digit.
  console.log(`THE ROW (${DECIMALS} dp): intercept ${f(poolRow.anchor_ratio_intercept, DECIMALS)} | per_year ${f(poolRow.anchor_ratio_per_year, DECIMALS)} | error_pct ${f(poolRow.anchor_error_pct, DECIMALS)} | age ${f(poolRow.anchor_age_min_years, DECIMALS)} … ${f(poolRow.anchor_age_max_years, DECIMALS)} | n ${poolRow.anchor_n} points | ${poolRow.anchor_listings} listings`);
  if (perListingFit !== null) {
    console.log(`Day 13 method, NOT STORED (M8 / M8b as coded, fitted over the ${perListingFit.n} listings): intercept ${f(perListingFit.a, 4)}, per_year ${f(perListingFit.b, 4)}, worst leave-one-out error ${f(perListingFit.looMax, 2)} % - this is Day 13's 0.83 / -0.041 / 6.5.`);
  }

  // ---------- 7. summary ----------
  console.log("\n===== SUMMARY =====");
  console.log(`listings in DB                      ${totalListings}`);
  console.log(`listings in 90-day pool             ${pool90.length}`);
  console.log(`listings in 180-day pool            ${pool180.length}`);
  console.log(`live listings (delisted_at null)    ${live.length}`);
  console.log(`cells                               ${cellList.length}`);
  console.log(`cell rows                           ${cellRows.length}`);
  console.log(`rows widened to 180                 ${widened}`);
  console.log(`thin rows (sample_size < ${MIN_SAMPLE})         ${thin}`);
  console.log(`cell rows with median_history       ${cellRows.filter((r) => r.median_history !== null).length}`);
  console.log(`model rows                          ${modelRows.length}`);
  console.log(`pool rows                           1`);
  console.log(`engine_version                      ${ENGINE_VERSION}`);

  // ---------- 8. the skip rule, then the write (§5.4) ----------
  // Skip rule (§0.1): a new row only when the values changed against the latest row of the same key at
  // the same versions (and window_days for cells). Write order: pool → model → cell.
  // Day 15 (§1.3): evaluated in BOTH modes. The dry run has to be able to say which rows a --write would
  // append and why — it still writes nothing; only the reading below moved above the DRY branch.
  const latestPool = await db.pool_stats.findFirst({ where: { engine_version: ENGINE_VERSION }, orderBy: [{ computed_at: "desc" }, { id: "desc" }] });
  // Day 15 (§1.3): the same seven comparisons as before, but each one named, so the report says WHICH value
  // made the row differ instead of only that it did. Nothing about the decision changed.
  // Run 1b (§1): the computed side of the five decimal comparisons is already rounded to DECIMALS places
  // (poolRow was built that way), so a stored 15-digit value and a fresh fit of the same data now agree.
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
    return cmp.filter(([, a, b]) => a !== b).map(([name, a, b]) => `${name} ${a === null ? "null" : a} -> ${b === null ? "null" : b}`);
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
    const poolWritten = poolChanged ? (await tx.pool_stats.create({ data: { ...poolRow } })) : null;
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
