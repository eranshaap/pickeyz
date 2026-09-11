// scripts/measure-constants.ts
// BRIEF Day 13 part 4, §1 — measures the engine's constants against the live pool and prints
// markdown tables to stdout. READ-ONLY BY CONSTRUCTION: Prisma reads only, no --write flag exists,
// no Prisma mutation is imported, nothing is written to the database and no file is written here.
//
// Rule of the day (§0): every classification of a listing — history class, zero-km, fleet first
// owner, hand kind, km kind — is taken from the stored `score_breakdown` or from the engine's own
// functions imported from src/lib/scoring/. Nothing is re-implemented. Prices are asking prices.
//
// Every table is split three ways: MAZDA 3 · IONIQ HYBRID · both. Every number carries its n.
// Where a measurement has a floor on n, below the floor the line prints NOT MEASURABLE, never a
// number. Every derivation that was not read straight out of the breakdown, every floor that bit
// and every fit that was dropped is listed in the INTERPRETED, NOT READ section.

import "dotenv/config";
import { pathToFileURL } from "node:url";
import { db } from "@/lib/db";
import { kmFacts } from "@/lib/scoring/checks";
import {
  ENGINE_VERSION,
  KM_BELOW_THRESHOLD,
  KM_CAP_PCT,
  KM_IMPLAUSIBLE_PER_MONTH,
  KM_SLOPE_PCT_PER_1000_PER_YEAR,
  MIN_SAMPLE,
  OWNER_TYPE_DEDUCTION,
  ZERO_KM_LEASING_DEDUCTION,
  ZERO_KM_QUALIFYING_TYPES,
  ZERO_KM_WINDOW_MONTHS,
} from "@/lib/scoring/constants";
import { analyzeHistory } from "@/lib/scoring/history";
import { BELOW_THRESHOLD_FLOOR_PCT, PRICE_VS_NEW_CEILING_PCT } from "@/lib/selection/constants";
import { parseOwnershipHistory, scoringSubject, sellerTypeOf } from "@/lib/scoring-input";
import type { Check, Row, ScoreResult, ScoringInput } from "@/lib/scoring";

const SEED = 20260909; // M4's fixed random seed
const M4_SUBSAMPLES = 2000; // §M4: 2,000 random subsamples per n
const M4_CELL_FLOOR = 40; // §M4: cells with at least this many listings
const M4_NS = [3, 4, 5, 6, 7, 8, 10, 15];
// §4b — M4b sweeps n = 3 … 20 over the fat cells, with M4's seed and M4's 2,000 draws.
const M4B_NS = Array.from({ length: 18 }, (_, i) => i + 3);
const M4B_CELL_FLOOR = 20; // §M4b: every cell with at least this many listings
const M4B_REFERENCE_FLOOR = 15; // §M4b: plus every MAZDA cell with at least this many, the homogeneous reference
const M4B_TAIL = 3; // §M4b: inside a cell n runs only up to its size − 3
const M4B_BOOT_FLOOR = 8; // rule (b): below this many listings a cell's own error is NOT ESTIMABLE
const M8B_MIN_OTHER_YEARS = 2; // §M8b: a per-model curve needs at least this many other model-years
const M1_FLOOR_CARS = 20;
const M2_FLOOR_CASES = 15;
const M3_FLOOR_CASES = 50;
const M3_LIST_ABOVE = 2000;
const M5_FLOOR_LISTINGS = 60;
const M6_CLASS_FLOOR = 8; // §M6: >= 8 private-only AND >= 8 full-leasing in the cell
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

function log(line = "") {
  console.log(line);
}
const notes: string[] = [];
function note(line: string) {
  notes.push(line);
}

// ---------- formatting ----------
function f(x: number | null | undefined, d = 2): string {
  return x === null || x === undefined || !Number.isFinite(x) ? "-" : x.toFixed(d);
}
function sgn(x: number | null | undefined, d = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "-";
  return (x > 0 ? "+" : "") + x.toFixed(d);
}
function table(headers: string[], body: (string | number)[][]) {
  log(`| ${headers.join(" | ")} |`);
  log(`|${headers.map(() => "---").join("|")}|`);
  for (const r of body) log(`| ${r.map((c) => String(c)).join(" | ")} |`);
}
function h2(title: string) {
  log("");
  log(`## ${title}`);
  log("");
}

// ---------- numeric helpers ----------
function median(values: number[]): number {
  if (values.length === 0) throw new Error("median of an empty set");
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error("percentile of an empty set");
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const idx = p * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
function mean(values: number[]): number {
  if (values.length === 0) throw new Error("mean of an empty set");
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// The widest interval between two consecutive OBSERVED values, both endpoints inside [lo, hi].
// null when fewer than two distinct observations fall in the range — then the line prints so.
type Gap = { lo: number; hi: number; width: number };
function widestEmptyGap(values: number[], lo: number, hi: number): Gap | null {
  const s = [...new Set(values.filter((v) => v >= lo && v <= hi))].sort((a, b) => a - b);
  if (s.length < 2) return null;
  let best: Gap | null = null;
  for (let i = 0; i + 1 < s.length; i++) {
    const w = s[i + 1] - s[i];
    if (best === null || w > best.width) best = { lo: s[i], hi: s[i + 1], width: w };
  }
  return best;
}

// The two observations that bracket a value — the empty interval the value in use actually sits in,
// which is not necessarily the widest one. Printed so the second reading of HOLDS is visible.
function neighbours(values: number[], v: number): { lo: number | null; hi: number | null; observed: boolean } {
  const s = [...new Set(values)].sort((a, b) => a - b);
  const below = s.filter((x) => x < v);
  return { lo: below.length ? below[below.length - 1] : null, hi: s.find((x) => x > v) ?? null, observed: s.includes(v) };
}

// ---------- ordinary least squares ----------
// Day 14 (§5.2, §5.3): scripts/compute-market-stats.ts fits the model slope (M5) and the anchor curve
// (M8 / M8b) by REUSING this code — Column, Fit, ols(), at() and loo() are exported for it. Nothing this
// script measures changed; the only behaviour change is that main() runs on direct invocation only (see
// the foot of the file), so importing the module no longer runs the whole measurement.
export type Column = { name: string; v: number[] };
export type FitOk = {
  ok: true;
  n: number;
  df: number;
  r2: number;
  names: string[];
  coef: number[];
  se: number[];
  lo: number[];
  hi: number[];
  dropped: string[];
};
export type FitBad = { ok: false; n: number; reason: string; dropped: string[] };
export type Fit = FitOk | FitBad;

// Student-t 95 % two-sided critical value, Cornish-Fisher expansion in 1/df (~1e-4 at df >= 20).
function tCrit95(df: number): number {
  const z = 1.959963984540054;
  const g1 = (z ** 3 + z) / 4;
  const g2 = (5 * z ** 5 + 16 * z ** 3 + 3 * z) / 96;
  const g3 = (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / 384;
  const g4 = (79 * z ** 9 + 776 * z ** 7 + 1482 * z ** 5 - 1920 * z ** 3 - 945 * z) / 92160;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3 + g4 / df ** 4;
}

function invert(m: number[][]): number[][] | null {
  const k = m.length;
  const a = m.map((r, i) => [...r, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  let scale = 0;
  for (const r of m) for (const v of r) scale = Math.max(scale, Math.abs(v));
  const eps = 1e-12 * Math.max(scale, 1);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    if (Math.abs(a[piv][col]) < eps) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    const d = a[col][col];
    for (let j = 0; j < 2 * k; j++) a[col][j] /= d;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const factor = a[r][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * k; j++) a[r][j] -= factor * a[col][j];
    }
  }
  return a.map((r) => r.slice(k));
}

// y on [1, ...cols]. A column that does not vary in this sample is dropped and named; a singular
// X'X drops the whole fit with its reason. Nothing is silently omitted.
export function ols(y: number[], cols: Column[]): Fit {
  const n = y.length;
  const dropped: string[] = [];
  const use: Column[] = [];
  for (const c of cols) {
    if (c.v.length !== n) throw new Error(`ols: column ${c.name} has ${c.v.length} rows, y has ${n}`);
    if (n > 0 && c.v.every((x) => x === c.v[0])) {
      dropped.push(`${c.name} (constant in this sample)`);
      continue;
    }
    use.push(c);
  }
  const names = ["intercept", ...use.map((c) => c.name)];
  const k = names.length;
  if (n <= k) return { ok: false, n, reason: `n = ${n} is not above k = ${k}`, dropped };

  const X: number[][] = [];
  for (let i = 0; i < n; i++) X.push([1, ...use.map((c) => c.v[i])]);
  const XtX: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const Xty = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  const inv = invert(XtX);
  if (inv === null) return { ok: false, n, reason: "X'X is singular (collinear columns)", dropped };

  const coef = new Array<number>(k).fill(0);
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) coef[a] += inv[a][b] * Xty[b];
  let sse = 0;
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    for (let a = 0; a < k; a++) yhat += coef[a] * X[i][a];
    sse += (y[i] - yhat) ** 2;
  }
  const ybar = mean(y);
  const sst = y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const df = n - k;
  const s2 = sse / df;
  const t = tCrit95(df);
  const se = coef.map((_, a) => Math.sqrt(Math.max(s2 * inv[a][a], 0)));
  return {
    ok: true,
    n,
    df,
    r2: sst === 0 ? 0 : 1 - sse / sst,
    names,
    coef,
    se,
    lo: coef.map((c, a) => c - t * se[a]),
    hi: coef.map((c, a) => c + t * se[a]),
    dropped,
  };
}
export function at(fit: FitOk, name: string): { coef: number; se: number; lo: number; hi: number } | null {
  const i = fit.names.indexOf(name);
  return i < 0 ? null : { coef: fit.coef[i], se: fit.se[i], lo: fit.lo[i], hi: fit.hi[i] };
}

// M8b's leave-one-out, lifted out of main() unchanged so §5.3 can call it on the same points. It fits
// ratio = a + b × age on `fitPool` — which never contains the held-out target — and asks the line for the
// target's median ratio at its median age. Structural parameters: M8's own rows and model-years satisfy them.
export type CurvePoint = { ratio: number; age: number };
export type LooTarget = { medianRatio: number; medianAge: number };
export type Loo = { err: number | null; a: number | null; b: number | null; pred: number | null; fitN: number; reason: string | null };
export function loo(target: LooTarget, fitPool: CurvePoint[], tag: string): Loo {
  if (fitPool.length === 0) {
    note(`M8b: ${tag} — no listing outside the held-out model-year, so there is nothing to fit.`);
    return { err: null, a: null, b: null, pred: null, fitN: 0, reason: "no listing outside the held-out model-year" };
  }
  const fit = ols(
    fitPool.map((r) => r.ratio),
    [{ name: "age", v: fitPool.map((r) => r.age) }],
  );
  if (!fit.ok) {
    note(`M8b fit dropped: ${tag} — ${fit.reason}.`);
    return { err: null, a: null, b: null, pred: null, fitN: fitPool.length, reason: fit.reason };
  }
  const bc = at(fit, "age");
  if (bc === null) {
    note(`M8b: ${tag} — the age column was dropped (${fit.dropped.join(", ")}).`);
    return { err: null, a: fit.coef[0], b: null, pred: null, fitN: fit.n, reason: "age column dropped" };
  }
  const pred = fit.coef[0] + bc.coef * target.medianAge;
  return { err: (Math.abs(pred - target.medianRatio) / target.medianRatio) * 100, a: fit.coef[0], b: bc.coef, pred, fitN: fit.n, reason: null };
}

// ---------- deterministic RNG (M4) ----------
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- resampling (M4b and rule (b)) ----------
// One |deviation| per draw: |resample median − fullMedian| / fullMedian × 100.
// withReplacement = false — a subsample of n distinct listings: M4's procedure, here for n = 3 … 20.
// withReplacement = true — the bootstrap of rule (b): n draws with replacement out of the same n
// listings. Without replacement a draw of the cell's own size returns the cell's own median every
// time, so a cell's error AT ITS OWN n can only be estimated with replacement (INTERPRETED, NOT READ).
function medianDeviationsPct(
  prices: number[],
  n: number,
  rand: () => number,
  fullMedian: number,
  draws: number,
  withReplacement: boolean,
): number[] {
  const devs: number[] = [];
  const idx = prices.map((_, i) => i);
  for (let s = 0; s < draws; s++) {
    const sub: number[] = [];
    if (withReplacement) {
      for (let i = 0; i < n; i++) sub.push(prices[Math.floor(rand() * prices.length)]);
    } else {
      for (let i = 0; i < n; i++) {
        const j = i + Math.floor(rand() * (idx.length - i));
        [idx[i], idx[j]] = [idx[j], idx[i]];
        sub.push(prices[idx[i]]);
      }
    }
    devs.push(Math.abs(((median(sub) - fullMedian) / fullMedian) * 100));
  }
  return devs;
}

// ---------- the pool ----------
type HClass = "private_only" | "zero_km" | "fleet" | "other";
const H_CLASS_LABEL: Record<HClass, string> = {
  private_only: "private-only",
  zero_km: "zero-km",
  fleet: "full leasing / fleet",
  other: "other",
};
const H_CLASSES = Object.keys(H_CLASS_LABEL) as HClass[];

type Loaded = {
  id: number;
  car_id: number;
  plate: string;
  model_label: string;
  year: number;
  price: number;
  km_declared: number | null;
  km_at_last_test: number | null;
  mivchan_acharon_dt: Date | null;
  first_registration: Date | null;
  first_seen_at: Date;
  seller: "dealer" | "private" | "fleet_company";
  cell_key: string;
  cell_label: string;
  degem_code: string;
  vehicle_class: string;
  new_price: number | null;
  bd: ScoreResult;
  input: ScoringInput;
  hclass: HClass;
};

const rowOf = (bd: ScoreResult, name: Row["row"]): Row | undefined => bd.rows.find((r) => r.row === name);
const checkOf = (bd: ScoreResult, name: Check["check"]): Check | undefined => bd.checks.find((c) => c.check === name);
function rawNum(raw: Record<string, unknown> | undefined, key: string): number | null {
  if (!raw) return null;
  const v = raw[key];
  return typeof v === "number" ? v : null;
}

// The history class, read off the stored record with the engine's own analyzeHistory (§0).
function historyClass(bd: ScoreResult, plate: string): HClass {
  const h = rowOf(bd, "history");
  if (!h || h.status !== "scored" || h.source !== "mot") return "other";
  const rows = parseOwnershipHistory(h.raw.owners, plate);
  if (rows === null) return "other";
  const a = analyzeHistory(rows);
  if (a.zero_km_deal) return "zero_km";
  if (a.has_fleet_row) return "fleet";
  return "private_only";
}

type Split = { name: string; pool: Loaded[] };
type Verdict = "HOLDS" | "SAME BALLPARK" | "FLAG" | "NOT MEASURABLE";
type NewPriceKey = { degem_code: string; sug_degem: string; shnat_yitzur: number };

async function main() {
  const now = new Date();
  log(`# measure-constants — read-only. now = ${now.toISOString()}, engine_version in code = ${ENGINE_VERSION}`);

  const rows = await db.listings.findMany({
    where: { delisted_at: null },
    include: {
      car: { include: { model: true } },
      dealer: { select: { dealer_type: true } },
      market_stats: { select: { id: true, median_price: true, sample_size: true } },
    },
    orderBy: { id: "asc" },
  });

  const pool: Loaded[] = [];
  for (const l of rows) {
    const plate = l.car.license_plate;
    if (plate === null) throw new Error(`listing ${l.id}: cars.license_plate is null`);
    if (l.score_breakdown === null) throw new Error(`listing ${l.id} (${plate}): score_breakdown is null — score the pool first`);
    if (l.engine_version !== ENGINE_VERSION) {
      throw new Error(`listing ${l.id} (${plate}): engine_version ${l.engine_version ?? "null"} != ${ENGINE_VERSION}`);
    }
    const m = l.car.model;
    if (m.model === null) throw new Error(`listing ${l.id} (${plate}): models.model is null`);
    if (m.comparison_group === null) throw new Error(`listing ${l.id} (${plate}): models.comparison_group is null`);
    if (m.degem_code === null) throw new Error(`listing ${l.id} (${plate}): models.degem_code is null`);
    if (m.vehicle_class === null) throw new Error(`listing ${l.id} (${plate}): models.vehicle_class is null`);
    if (l.car.year === null) throw new Error(`listing ${l.id} (${plate}): cars.year is null`);
    const bd = l.score_breakdown as unknown as ScoreResult;
    if (!Array.isArray(bd.rows) || !Array.isArray(bd.checks)) throw new Error(`listing ${l.id} (${plate}): score_breakdown is not a ScoreResult`);
    const subject = scoringSubject(l, l.car, l.dealer.dealer_type);
    pool.push({
      id: l.id,
      car_id: l.car_id,
      plate,
      model_label: m.model,
      year: l.car.year,
      price: l.price,
      km_declared: l.km_declared,
      km_at_last_test: l.car.km_at_last_test,
      mivchan_acharon_dt: l.car.mivchan_acharon_dt,
      first_registration: l.car.first_registration,
      first_seen_at: l.first_seen_at,
      seller: sellerTypeOf(l.dealer.dealer_type),
      cell_key: `${m.comparison_group} ${l.car.year}`,
      cell_label: `${m.model}${m.sub_model ? ` ${m.sub_model}` : ""} ${l.car.year}`,
      degem_code: m.degem_code,
      vehicle_class: m.vehicle_class,
      new_price: null,
      bd,
      input: { ...subject, market: null },
      hclass: historyClass(bd, plate),
    });
  }

  // The new-car price, joined exactly as select-three.ts joins it: the latest published_at row on
  // (degem_code, sug_degem, shnat_yitzur); null when no row matches.
  const keyText = (k: NewPriceKey) => `${k.degem_code}|${k.shnat_yitzur}|${k.sug_degem}`;
  const keyOf = (p: Loaded): NewPriceKey => ({ degem_code: p.degem_code, sug_degem: p.vehicle_class, shnat_yitzur: p.year });
  const wanted = new Map<string, NewPriceKey>();
  for (const p of pool) wanted.set(keyText(keyOf(p)), keyOf(p));
  const priceRows = wanted.size
    ? await db.new_car_prices.findMany({ where: { OR: [...wanted.values()] }, orderBy: [{ published_at: "desc" }, { id: "desc" }] })
    : [];
  const latestNew = new Map<string, { mehir: number; published_at: Date }>();
  for (const r of priceRows) {
    const k = keyText(r);
    if (!latestNew.has(k)) latestNew.set(k, { mehir: r.mehir, published_at: r.published_at });
  }
  for (const p of pool) p.new_price = latestNew.get(keyText(keyOf(p)))?.mehir ?? null;
  const publications = [...new Set([...latestNew.values()].map((v) => v.published_at.toISOString().slice(0, 10)))].sort();

  // ---------- splits ----------
  const labels = [...new Set(pool.map((p) => p.model_label))].sort();
  if (labels.length !== 2) {
    throw new Error(`expected exactly two models in the pool (the brief names MAZDA 3 and IONIQ HYBRID); found ${labels.length}: ${labels.join(", ")}`);
  }
  const mazda = labels.filter((x) => /MAZDA/i.test(x));
  if (mazda.length !== 1) throw new Error(`cannot order the splits: expected exactly one model whose name contains MAZDA, found ${mazda.length} in ${labels.join(", ")}`);
  const ordered = [mazda[0], labels.find((x) => x !== mazda[0]) as string];
  const splits: Split[] = [
    { name: ordered[0], pool: pool.filter((p) => p.model_label === ordered[0]) },
    { name: ordered[1], pool: pool.filter((p) => p.model_label === ordered[1]) },
    { name: "both", pool },
  ];

  const cars = new Set(pool.map((p) => p.car_id));
  log("");
  log(
    `pool: ${pool.length} live listings (delisted_at is null), ${cars.size} cars, ${new Set(pool.map((p) => p.cell_key)).size} (comparison_group × year) cells; ` +
      splits.slice(0, 2).map((s) => `${s.name} ${s.pool.length}`).join(", ") +
      `; new price joined for ${pool.filter((p) => p.new_price !== null).length}${publications.length ? ` (publication(s) ${publications.join(", ")})` : ""}`,
  );
  log(
    `constants in use: ZERO_KM_WINDOW_MONTHS ${ZERO_KM_WINDOW_MONTHS} (qualifying types ${ZERO_KM_QUALIFYING_TYPES.join(", ")}), KM_BELOW_THRESHOLD ${KM_BELOW_THRESHOLD}, ` +
      `KM_IMPLAUSIBLE_PER_MONTH ${KM_IMPLAUSIBLE_PER_MONTH}, MIN_SAMPLE ${MIN_SAMPLE}, KM_SLOPE_PCT_PER_1000_PER_YEAR ${KM_SLOPE_PCT_PER_1000_PER_YEAR}, KM_CAP_PCT ${KM_CAP_PCT}, ` +
      `OWNER_TYPE_DEDUCTION.leasing ${OWNER_TYPE_DEDUCTION.leasing}, ZERO_KM_LEASING_DEDUCTION ${ZERO_KM_LEASING_DEDUCTION}`,
  );

  const summary: (string | number)[][] = [];

  // ======================================================================== M1
  h2(`M1 — ZERO_KM_WINDOW_MONTHS (in use: ${ZERO_KM_WINDOW_MONTHS})`);
  log(`Population: one row per car whose record starts with a qualifying type (${ZERO_KM_QUALIFYING_TYPES.join(", ")}) and whose next non-dealer row is private.`);
  log(`Months = analyzeHistory(record).months_to_first_private — the engine's own reading. Floor: ${M1_FLOOR_CARS} cars.`);
  log("");

  const byCar = new Map<number, Loaded>();
  for (const p of pool) if (!byCar.has(p.car_id)) byCar.set(p.car_id, p);
  type M1Row = { car: Loaded; months: number };
  const m1All: M1Row[] = [];
  for (const p of byCar.values()) {
    const h = rowOf(p.bd, "history");
    if (!h || h.status !== "scored" || h.source !== "mot") continue;
    const record = parseOwnershipHistory(h.raw.owners, p.plate);
    if (record === null) continue;
    const a = analyzeHistory(record);
    if (a.months_to_first_private === null) continue;
    m1All.push({ car: p, months: a.months_to_first_private });
  }
  const M1_BINS: { label: string; test: (m: number) => boolean }[] = [
    { label: "0–3", test: (m) => m <= 3 },
    { label: "4–6", test: (m) => m >= 4 && m <= 6 },
    { label: "7–12", test: (m) => m >= 7 && m <= 12 },
    { label: "13–18", test: (m) => m >= 13 && m <= 18 },
    { label: "19–24", test: (m) => m >= 19 && m <= 24 },
    { label: "25–36", test: (m) => m >= 25 && m <= 36 },
    { label: "37+", test: (m) => m >= 37 },
  ];
  const m1BySplit = new Map<string, M1Row[]>();
  for (const s of splits) m1BySplit.set(s.name, s.name === "both" ? m1All : m1All.filter((r) => r.car.model_label === s.name));
  const m1Of = (name: string) => m1BySplit.get(name) as M1Row[];
  const m1Gap = (name: string) => {
    const set = m1Of(name);
    return { gap: widestEmptyGap(set.map((r) => r.months), 0, 36), ok: set.length >= M1_FLOOR_CARS, n: set.length };
  };

  table(
    ["split", "cars", ...M1_BINS.map((b) => b.label), `≤ ${ZERO_KM_WINDOW_MONTHS}`, `> ${ZERO_KM_WINDOW_MONTHS}`, "widest empty interval below 36", "measurable"],
    splits.map((s) => {
      const set = m1Of(s.name);
      const months = set.map((r) => r.months);
      const g = m1Gap(s.name);
      return [
        s.name,
        set.length,
        ...M1_BINS.map((b) => months.filter(b.test).length),
        months.filter((m) => m <= ZERO_KM_WINDOW_MONTHS).length,
        months.filter((m) => m > ZERO_KM_WINDOW_MONTHS).length,
        g.ok ? (g.gap === null ? "no gap (fewer than two distinct values ≤ 36)" : `${g.gap.lo} → ${g.gap.hi} (${g.gap.width} months wide)`) : "NOT MEASURABLE",
        g.ok ? "yes" : `NOT MEASURABLE (${set.length} < ${M1_FLOOR_CARS} cars)`,
      ];
    }),
  );
  log("");
  log(`observed months, all ${m1All.length} cars, sorted: ${m1All.map((r) => r.months).sort((a, b) => a - b).join(", ") || "none"}`);
  for (const s of splits) {
    const set = m1Of(s.name);
    if (set.length < M1_FLOOR_CARS) note(`M1 floor bit: ${s.name} has ${set.length} qualifying cars, floor ${M1_FLOOR_CARS} — NOT MEASURABLE.`);
  }

  // ======================================================================== M2
  h2(`M2 — KM_BELOW_THRESHOLD (in use: ${KM_BELOW_THRESHOLD})`);
  log("Population: listings with km_declared < km_at_last_test, both present. gap = official − declared.");
  log(`Floor: ${M2_FLOOR_CASES} cases. The widest empty interval is searched between 1,000 and 15,000.`);
  log("");
  type M2Row = { l: Loaded; gap: number };
  const m2All: M2Row[] = pool
    .filter((p) => p.km_declared !== null && p.km_at_last_test !== null && p.km_declared < p.km_at_last_test)
    .map((p) => ({ l: p, gap: (p.km_at_last_test as number) - (p.km_declared as number) }));
  const m2BySplit = new Map<string, M2Row[]>();
  for (const s of splits) m2BySplit.set(s.name, s.name === "both" ? m2All : m2All.filter((r) => r.l.model_label === s.name));
  const m2Of = (name: string) => m2BySplit.get(name) as M2Row[];
  const m2Gap = (name: string) => {
    const set = m2Of(name);
    return { gap: widestEmptyGap(set.map((r) => r.gap), 1000, 15000), ok: set.length >= M2_FLOOR_CASES, n: set.length };
  };

  table(
    ["split", "cases", `≤ ${KM_BELOW_THRESHOLD}`, `> ${KM_BELOW_THRESHOLD}`, "widest empty interval in [1,000 … 15,000]", "measurable"],
    splits.map((s) => {
      const set = m2Of(s.name);
      const gaps = set.map((r) => r.gap);
      const g = m2Gap(s.name);
      return [
        s.name,
        set.length,
        gaps.filter((x) => x <= KM_BELOW_THRESHOLD).length,
        gaps.filter((x) => x > KM_BELOW_THRESHOLD).length,
        g.ok ? (g.gap === null ? "no gap (fewer than two distinct values in range)" : `${g.gap.lo} → ${g.gap.hi} (${g.gap.width} km wide)`) : "NOT MEASURABLE",
        g.ok ? "yes" : `NOT MEASURABLE (${set.length} < ${M2_FLOOR_CASES} cases)`,
      ];
    }),
  );
  log("");
  log("all gaps, sorted (plate: gap):");
  log([...m2All].sort((a, b) => a.gap - b.gap).map((r) => `${r.l.plate}: ${r.gap}`).join(", ") || "none");
  for (const s of splits) {
    const set = m2Of(s.name);
    if (set.length < M2_FLOOR_CASES) note(`M2 floor bit: ${s.name} has ${set.length} cases, floor ${M2_FLOOR_CASES} — NOT MEASURABLE.`);
  }

  // ======================================================================== M3
  h2(`M3 — KM_IMPLAUSIBLE_PER_MONTH (in use: ${KM_IMPLAUSIBLE_PER_MONTH})`);
  log("Population: listings with km_declared > km_at_last_test and a test date.");
  log("Rate = the km per month the engine computes, read from checks.km.raw.km_per_month_since_test when the breakdown carries it; otherwise");
  log("kmFacts(input, first_seen_at).km_per_month_since_test — the engine's own function, never re-implemented.");
  log(`Floor: ${M3_FLOOR_CASES} cases.`);
  log("");
  type M3Row = { l: Loaded; rate: number; from: "breakdown" | "engine_fn" };
  const m3All: M3Row[] = [];
  let m3NoRate = 0;
  for (const p of pool) {
    if (p.km_declared === null || p.km_at_last_test === null || p.mivchan_acharon_dt === null) continue;
    if (!(p.km_declared > p.km_at_last_test)) continue;
    const stored = rawNum(checkOf(p.bd, "km")?.raw, "km_per_month_since_test");
    if (stored !== null) {
      m3All.push({ l: p, rate: stored, from: "breakdown" });
      continue;
    }
    const fromFn = kmFacts(p.input, p.first_seen_at).km_per_month_since_test;
    if (fromFn === null) {
      m3NoRate++;
      continue;
    }
    m3All.push({ l: p, rate: fromFn, from: "engine_fn" });
  }
  const m3BySplit = new Map<string, M3Row[]>();
  for (const s of splits) m3BySplit.set(s.name, s.name === "both" ? m3All : m3All.filter((r) => r.l.model_label === s.name));
  const m3Of = (name: string) => m3BySplit.get(name) as M3Row[];
  const m3Gap = (name: string) => {
    const set = m3Of(name);
    return { gap: set.length ? widestEmptyGap(set.map((r) => r.rate), -Infinity, Infinity) : null, ok: set.length >= M3_FLOOR_CASES, n: set.length };
  };

  table(
    ["split", "cases", "rate from breakdown", "rate from engine fn", "p50", "p90", "p95", "p99", "max", "widest empty interval (all rates)", "measurable"],
    splits.map((s) => {
      const set = m3Of(s.name);
      const rates = set.map((r) => r.rate);
      const g = m3Gap(s.name);
      const stats = g.ok
        ? [f(percentile(rates, 0.5), 0), f(percentile(rates, 0.9), 0), f(percentile(rates, 0.95), 0), f(percentile(rates, 0.99), 0), f(Math.max(...rates), 0)]
        : ["NOT MEASURABLE", "NOT MEASURABLE", "NOT MEASURABLE", "NOT MEASURABLE", "NOT MEASURABLE"];
      return [
        s.name,
        set.length,
        set.filter((r) => r.from === "breakdown").length,
        set.filter((r) => r.from === "engine_fn").length,
        ...stats,
        g.ok ? (g.gap === null ? "no gap" : `${f(g.gap.lo, 0)} → ${f(g.gap.hi, 0)} (${f(g.gap.width, 0)} wide)`) : "NOT MEASURABLE",
        g.ok ? "yes" : `NOT MEASURABLE (${set.length} < ${M3_FLOOR_CASES} cases)`,
      ];
    }),
  );
  log("");
  const m3High = m3All.filter((r) => r.rate > M3_LIST_ABOVE).sort((a, b) => b.rate - a.rate);
  log(`cases above ${M3_LIST_ABOVE} km/month (${m3High.length}):`);
  if (m3High.length === 0) log("none");
  else
    table(
      ["plate", "listing", "model", "rate km/month", "declared", "official", "rate from"],
      m3High.map((r) => [r.l.plate, r.l.id, r.l.model_label, f(r.rate, 0), r.l.km_declared ?? "-", r.l.km_at_last_test ?? "-", r.from]),
    );
  if (m3NoRate) note(`M3: ${m3NoRate} listing(s) in the population had no rate from either source and are out of M3.`);
  for (const s of splits) {
    const set = m3Of(s.name);
    if (set.length < M3_FLOOR_CASES) note(`M3 floor bit: ${s.name} has ${set.length} cases, floor ${M3_FLOOR_CASES} — NOT MEASURABLE.`);
  }

  // ======================================================================== M4
  h2(`M4 — MIN_SAMPLE (in use: ${MIN_SAMPLE})`);
  const cellsByKey = new Map<string, Loaded[]>();
  for (const p of pool) {
    const arr = cellsByKey.get(p.cell_key);
    if (arr) arr.push(p);
    else cellsByKey.set(p.cell_key, [p]);
  }
  const bigCells = [...cellsByKey.entries()].filter(([, v]) => v.length >= M4_CELL_FLOOR).map(([k]) => k);
  const mazdaCells = [...cellsByKey.entries()].filter(([, v]) => v[0].model_label === ordered[0]).sort((a, b) => b[1].length - a[1].length);
  const largestMazda = mazdaCells.length ? mazdaCells[0][0] : null;
  const m4Cells = [...new Set([...bigCells, ...(largestMazda === null ? [] : [largestMazda])])];
  log(`Cells measured: every cell with ≥ ${M4_CELL_FLOOR} listings, plus the largest ${ordered[0]} cell. Random seed = ${SEED} (mulberry32); ${M4_SUBSAMPLES} subsamples per n, without replacement.`);
  log("Deviation = (subsample median price − full-cell median price) / full-cell median price × 100. The full-cell median is the median over the cell's live listings.");
  log("");
  type M4CellResult = {
    key: string;
    label: string;
    model: string;
    size: number;
    fullMedian: number;
    perN: Map<number, { meanAbs: number; p90Abs: number } | null>;
    smallest5: number | null;
    smallest3: number | null;
  };
  const m4Results: M4CellResult[] = [];
  for (const key of m4Cells) {
    const cell = cellsByKey.get(key) as Loaded[];
    const prices = cell.map((p) => p.price);
    const fullMedian = median(prices);
    const rand = mulberry32(SEED);
    const perN = new Map<number, { meanAbs: number; p90Abs: number } | null>();
    for (const n of M4_NS) {
      if (n >= prices.length) {
        perN.set(n, null);
        continue;
      }
      const devs: number[] = [];
      const idx = prices.map((_, i) => i);
      for (let s = 0; s < M4_SUBSAMPLES; s++) {
        for (let i = 0; i < n; i++) {
          const j = i + Math.floor(rand() * (idx.length - i));
          [idx[i], idx[j]] = [idx[j], idx[i]];
        }
        const sub = idx.slice(0, n).map((i) => prices[i]);
        devs.push(Math.abs(((median(sub) - fullMedian) / fullMedian) * 100));
      }
      perN.set(n, { meanAbs: mean(devs), p90Abs: percentile(devs, 0.9) });
    }
    const smallestAt = (bar: number): number | null => {
      for (const n of M4_NS) {
        const r = perN.get(n);
        if (r && r.p90Abs <= bar) return n;
      }
      return null;
    };
    m4Results.push({ key, label: cell[0].cell_label, model: cell[0].model_label, size: cell.length, fullMedian, perN, smallest5: smallestAt(5), smallest3: smallestAt(3) });
  }
  m4Results.sort((a, b) => b.size - a.size);
  for (const r of m4Results) {
    log(`**${r.label}** — model ${r.model}, ${r.size} listings, full-cell median price ${r.fullMedian}`);
    table(
      ["n", "mean |deviation| %", "p90 |deviation| %"],
      M4_NS.map((n) => {
        const v = r.perN.get(n);
        return [n, v ? f(v.meanAbs) : `NOT MEASURABLE (n ≥ cell size ${r.size})`, v ? f(v.p90Abs) : "NOT MEASURABLE"];
      }),
    );
    log(`smallest n with p90 |deviation| ≤ 5 %: ${r.smallest5 ?? `none of ${M4_NS.join(", ")}`}; ≤ 3 %: ${r.smallest3 ?? `none of ${M4_NS.join(", ")}`}`);
    log("");
    for (const n of M4_NS) if (r.perN.get(n) === null) note(`M4: cell ${r.label} has ${r.size} listings, so n = ${n} is not a subsample — NOT MEASURABLE for that n.`);
  }
  const m4Worst = (name: string): number | null => {
    const rs = m4Results.filter((r) => name === "both" || r.model === name);
    if (rs.length === 0 || rs.some((r) => r.smallest5 === null)) return null;
    return Math.max(...rs.map((r) => r.smallest5 as number));
  };
  table(
    ["split", "cells measured", "listings in them", "smallest n with p90 ≤ 5 % (worst measured cell)"],
    splits.map((s) => {
      const rs = m4Results.filter((r) => s.name === "both" || r.model === s.name);
      const v = m4Worst(s.name);
      return [s.name, rs.length, rs.reduce((a, r) => a + r.size, 0), rs.length === 0 ? "NOT MEASURABLE (no cell measured)" : v === null ? `not reached within ${M4_NS.join(", ")}` : v];
    }),
  );

  // ======================================================================== M5
  h2(`M5 — KM_SLOPE_PCT_PER_1000_PER_YEAR (in use: ${KM_SLOPE_PCT_PER_1000_PER_YEAR}) and the asymmetry`);
  log("Pool: listings with a deal score (fat cells) whose km row is scored.");
  log("y = (price − cell median_price) / median_price × 100, both read from the stored price row. x = km_dev_per_year / 1,000, read from the stored km row.");
  log("Slopes are printed in the engine's sign convention — percent of value per 1,000 km per year of deviation, positive = the price rises when km is below the median,");
  log(`which is minus the OLS coefficient of y on x. Floor: ${M5_FLOOR_LISTINGS} listings per split.`);
  log("");
  type M5Row = { l: Loaded; y: number; x: number };
  const m5All: M5Row[] = [];
  let m5NoKm = 0;
  let m5NoDeal = 0;
  for (const p of pool) {
    if (p.bd.deal_score === null) {
      m5NoDeal++;
      continue;
    }
    const pr = rowOf(p.bd, "price");
    const kmr = rowOf(p.bd, "km");
    const medianPrice = rawNum(pr?.raw, "median_price");
    const dev = rawNum(kmr?.raw, "km_dev_per_year");
    if (pr?.status !== "scored" || medianPrice === null || medianPrice <= 0) {
      throw new Error(`listing ${p.id} (${p.plate}): deal_score is set but the stored price row carries no usable median_price`);
    }
    if (kmr?.status !== "scored" || dev === null) {
      m5NoKm++;
      continue;
    }
    m5All.push({ l: p, y: ((p.price - medianPrice) / medianPrice) * 100, x: dev / 1000 });
  }
  if (m5NoDeal) note(`M5/M6: ${m5NoDeal} listing(s) have no deal score (thin cells) and are out of every fit.`);
  if (m5NoKm) note(`M5/M6: ${m5NoKm} listing(s) have a deal score but no scored km row — no x — and were dropped from every fit.`);
  const m5BySplit = new Map<string, M5Row[]>();
  for (const s of splits) m5BySplit.set(s.name, s.name === "both" ? m5All : m5All.filter((r) => r.l.model_label === s.name));
  const m5Of = (name: string) => m5BySplit.get(name) as M5Row[];

  const X_NAME = "x (km_dev/1000/yr)";
  const X_NEG = "x<0 (km below median)";
  const X_POS = "x≥0 (km above median)";
  const dummy = (set: M5Row[], c: HClass): Column => ({ name: `class:${H_CLASS_LABEL[c]}`, v: set.map((r) => (r.l.hclass === c ? 1 : 0)) });
  const sellerCol = (set: M5Row[]): Column => ({ name: "seller:private", v: set.map((r) => (r.l.seller === "private" ? 1 : 0)) });
  const xCol = (set: M5Row[]): Column => ({ name: X_NAME, v: set.map((r) => r.x) });
  const xNegCol = (set: M5Row[]): Column => ({ name: X_NEG, v: set.map((r) => Math.min(r.x, 0)) });
  const xPosCol = (set: M5Row[]): Column => ({ name: X_POS, v: set.map((r) => Math.max(r.x, 0)) });

  const m5Fits = new Map<string, { a: Fit; b: Fit; c: Fit }>();
  for (const s of splits) {
    const set = m5Of(s.name);
    const y = set.map((r) => r.y);
    const classCols = [dummy(set, "zero_km"), dummy(set, "fleet"), dummy(set, "other")]; // private-only = reference
    m5Fits.set(s.name, {
      a: ols(y, [xCol(set)]),
      b: ols(y, [xCol(set), ...classCols, sellerCol(set)]),
      c: ols(y, [xNegCol(set), xPosCol(set), ...classCols, sellerCol(set)]),
    });
  }
  const slopeRows: (string | number)[][] = [];
  for (const s of splits) {
    const set = m5Of(s.name);
    const fits = m5Fits.get(s.name) as { a: Fit; b: Fit; c: Fit };
    const measurable = set.length >= M5_FLOOR_LISTINGS;
    if (!measurable) note(`M5 floor bit: ${s.name} has ${set.length} listings, floor ${M5_FLOOR_LISTINGS} — NOT MEASURABLE.`);
    const line = (tag: string, fit: Fit, colName: string) => {
      if (!measurable) {
        slopeRows.push([s.name, tag, colName, "NOT MEASURABLE", "NOT MEASURABLE", "NOT MEASURABLE", "NOT MEASURABLE", set.length]);
        return;
      }
      if (!fit.ok) {
        note(`M5 fit dropped: split ${s.name}, fit ${tag} — ${fit.reason}${fit.dropped.length ? `; columns dropped: ${fit.dropped.join(", ")}` : ""}.`);
        slopeRows.push([s.name, tag, colName, "fit dropped", fit.reason, "-", "-", fit.n]);
        return;
      }
      if (fit.dropped.length) note(`M5: split ${s.name}, fit ${tag} — columns dropped: ${fit.dropped.join(", ")}.`);
      const c = at(fit, colName);
      if (c === null) {
        slopeRows.push([s.name, tag, colName, "column dropped", "-", "-", f(fit.r2, 3), fit.n]);
        return;
      }
      slopeRows.push([s.name, tag, colName, sgn(-c.coef, 3), f(c.se, 3), `${sgn(-c.hi, 3)} … ${sgn(-c.lo, 3)}`, f(fit.r2, 3), fit.n]);
    };
    line("(a) y ~ x", fits.a, X_NAME);
    line("(b) y ~ x + class + seller", fits.b, X_NAME);
    line("(c) two slopes, x < 0", fits.c, X_NEG);
    line("(c) two slopes, x ≥ 0", fits.c, X_POS);
  }
  table(["split", "fit", "term", "slope (engine sign)", "SE", "95 % interval", "R²", "n"], slopeRows);
  log("");
  log("full coefficients of fits (b) and (c), OLS sign (y in % of the cell median; negative = cheaper than the cell median):");
  for (const s of splits) {
    const set = m5Of(s.name);
    if (set.length < M5_FLOOR_LISTINGS) {
      log(`- ${s.name}: NOT MEASURABLE (${set.length} < ${M5_FLOOR_LISTINGS})`);
      continue;
    }
    const fits = m5Fits.get(s.name) as { a: Fit; b: Fit; c: Fit };
    for (const [tag, fit] of [["(b)", fits.b], ["(c)", fits.c]] as [string, Fit][]) {
      if (!fit.ok) {
        log(`- ${s.name} ${tag}: fit dropped — ${fit.reason}`);
        continue;
      }
      log(
        `- ${s.name} ${tag}: n ${fit.n}, R² ${f(fit.r2, 3)}, ` +
          fit.names.map((nm, i) => `${nm} ${sgn(fit.coef[i], 2)} (SE ${f(fit.se[i], 2)})`).join("; ") +
          (fit.dropped.length ? ` [dropped: ${fit.dropped.join(", ")}]` : ""),
      );
    }
  }
  log("");
  log("class and seller counts in the M5 pool:");
  table(
    ["split", ...H_CLASSES.map((c) => H_CLASS_LABEL[c]), "lot (dealer)", "private seller", "n"],
    splits.map((s) => {
      const set = m5Of(s.name);
      return [
        s.name,
        ...H_CLASSES.map((c) => set.filter((r) => r.l.hclass === c).length),
        set.filter((r) => r.l.seller !== "private").length,
        set.filter((r) => r.l.seller === "private").length,
        set.length,
      ];
    }),
  );

  // ======================================================================== M6
  h2(`M6 — OWNER_TYPE_DEDUCTION.leasing (in use: ${OWNER_TYPE_DEDUCTION.leasing}) and the zero-km order (in use: ${ZERO_KM_LEASING_DEDUCTION})`);
  log(`Qualifying cell: at least ${M6_CLASS_FLOOR} private-only AND at least ${M6_CLASS_FLOOR} full-leasing / fleet listings inside the M5 pool.`);
  log("Fit: y on class dummies (private-only = reference) + x + seller type. The fleet coefficient is that cell's leasing deduction; the zero-km coefficient is its order.");
  log("");
  const m6Cells = new Map<string, M5Row[]>();
  for (const r of m5All) {
    const arr = m6Cells.get(r.l.cell_key);
    if (arr) arr.push(r);
    else m6Cells.set(r.l.cell_key, [r]);
  }
  const cellClassCounts = [...m6Cells.entries()]
    .map(([key, set]) => ({
      key,
      label: set[0].l.cell_label,
      model: set[0].l.model_label,
      n: set.length,
      counts: Object.fromEntries(H_CLASSES.map((c) => [c, set.filter((r) => r.l.hclass === c).length])) as Record<HClass, number>,
    }))
    .sort((a, b) => b.n - a.n);
  log("class counts per cell (the M5 pool):");
  table(
    ["cell", "model", "n", ...H_CLASSES.map((c) => H_CLASS_LABEL[c]), "qualifies"],
    cellClassCounts.map((c) => [c.label, c.model, c.n, ...H_CLASSES.map((k) => c.counts[k]), c.counts.private_only >= M6_CLASS_FLOOR && c.counts.fleet >= M6_CLASS_FLOOR ? "yes" : "no"]),
  );
  log("");
  const qualifying = cellClassCounts.filter((c) => c.counts.private_only >= M6_CLASS_FLOOR && c.counts.fleet >= M6_CLASS_FLOOR);
  const m6Fit = (set: M5Row[]): Fit =>
    ols(
      set.map((r) => r.y),
      [dummy(set, "zero_km"), dummy(set, "fleet"), dummy(set, "other"), xCol(set), sellerCol(set)],
    );
  const m6Line = (name: string, set: M5Row[]): (string | number)[][] => {
    const fit = m6Fit(set);
    if (!fit.ok) {
      note(`M6 fit dropped: ${name} — ${fit.reason}${fit.dropped.length ? `; columns dropped: ${fit.dropped.join(", ")}` : ""}.`);
      return [[name, "fit dropped", fit.reason, "-", "-", "-", "-", "-", set.length]];
    }
    if (fit.dropped.length) note(`M6: ${name} — columns dropped: ${fit.dropped.join(", ")}.`);
    const lease = at(fit, `class:${H_CLASS_LABEL.fleet}`);
    const zero = at(fit, `class:${H_CLASS_LABEL.zero_km}`);
    return [
      [
        name,
        lease === null ? "column dropped" : sgn(lease.coef, 1),
        lease === null ? "-" : f(lease.se, 1),
        lease === null ? "-" : `${sgn(lease.lo, 1)} … ${sgn(lease.hi, 1)}`,
        zero === null ? "column dropped" : sgn(zero.coef, 1),
        zero === null ? "-" : f(zero.se, 1),
        zero === null ? "-" : `${sgn(zero.lo, 1)} … ${sgn(zero.hi, 1)}`,
        f(fit.r2, 3),
        fit.n,
      ],
    ];
  };
  let m6Pooled: Fit | null = null;
  if (qualifying.length === 0) {
    log(`NOT MEASURABLE — no cell holds ${M6_CLASS_FLOOR} private-only and ${M6_CLASS_FLOOR} full-leasing / fleet listings. The class counts per cell are the table above.`);
    note(`M6 floor bit: no cell reaches ${M6_CLASS_FLOOR} private-only AND ${M6_CLASS_FLOOR} fleet listings — the leasing deduction and the zero-km order are NOT MEASURABLE on this pool.`);
  } else {
    const body: (string | number)[][] = [];
    for (const c of qualifying) body.push(...m6Line(c.label, m6Cells.get(c.key) as M5Row[]));
    const union = qualifying.flatMap((c) => m6Cells.get(c.key) as M5Row[]);
    m6Pooled = m6Fit(union);
    body.push(...m6Line(`POOLED over ${qualifying.length} qualifying cell(s)`, union));
    table(["cell", "leasing coef", "SE", "95 % interval", "zero-km coef", "SE", "95 % interval", "R²", "n"], body);
    log("");
    log("n per class in the qualifying cells:");
    table(
      ["cell", ...H_CLASSES.map((c) => H_CLASS_LABEL[c]), "n"],
      qualifying.map((c) => [c.label, ...H_CLASSES.map((k) => c.counts[k]), c.n]),
    );
  }
  log("");
  log("CONTEXT ONLY — the same fit pooled over every fat cell, ignoring the ≥ 8 / ≥ 8 floor. Not a qualifying M6 measurement and not used for any verdict:");
  const contextBody: (string | number)[][] = [];
  for (const s of splits) contextBody.push(...m6Line(s.name, m5Of(s.name)));
  table(["split", "leasing coef", "SE", "95 % interval", "zero-km coef", "SE", "95 % interval", "R²", "n"], contextBody);

  // ======================================================================== M7
  h2("M7 — hand-gap frequencies (a decision input, not a constant)");
  const HAND_KEYS = ["match", "mismatch:fleet_undercount", "mismatch:zero_km_undercount", "mismatch:other", "mismatch:private_pair", "skipped", "unavailable"] as const;
  const handKey = (c: Check | undefined): string => {
    if (!c) return "unavailable";
    if (c.status === "mismatch") return `mismatch:${c.kind ?? "?"}`;
    return c.status;
  };
  table(
    ["split", ...HAND_KEYS, "n"],
    splits.map((s) => {
      const keys = s.pool.map((p) => handKey(checkOf(p.bd, "hand")));
      return [s.name, ...HAND_KEYS.map((k) => keys.filter((x) => x === k).length), s.pool.length];
    }),
  );
  const unexpected = [...new Set(pool.map((p) => handKey(checkOf(p.bd, "hand"))))].filter((k) => !(HAND_KEYS as readonly string[]).includes(k));
  if (unexpected.length) throw new Error(`the hand check produced kinds outside the brief's list: ${unexpected.join(", ")}`);
  log("");
  const expected = { "mismatch:fleet_undercount": 18, "mismatch:zero_km_undercount": 11, "mismatch:other": 8, "mismatch:private_pair": 1 };
  const expectedKeys = Object.keys(expected) as (keyof typeof expected)[];
  const actual = Object.fromEntries(expectedKeys.map((k) => [k, pool.filter((p) => handKey(checkOf(p.bd, "hand")) === k).length])) as Record<keyof typeof expected, number>;
  const selfCheckOk = expectedKeys.every((k) => actual[k] === expected[k]);
  log(
    `SELF-CHECK (is the breakdown being read correctly?) fleet_undercount / zero_km_undercount / other / private_pair — ` +
      `dry run ${expectedKeys.map((k) => expected[k]).join(" / ")}, measured here ${expectedKeys.map((k) => actual[k]).join(" / ")} → ${selfCheckOk ? "PASS" : "FAIL"}`,
  );
  if (!selfCheckOk) {
    throw new Error(`M7 self-check failed: dry run ${JSON.stringify(expected)}, measured ${JSON.stringify(actual)} — the breakdown is not being read the way the dry run read it`);
  }
  log("");
  log("Ads that declare hand 1, against the registry (official = non-dealer rows, from the stored hand check):");
  const declared1 = pool.filter((p) => {
    const c = checkOf(p.bd, "hand");
    return c !== undefined && c.declared === 1 && (c.status === "match" || c.status === "mismatch");
  });
  const FLEET_KINDS = ["fleet_undercount", "zero_km_undercount"];
  table(
    ["split", "ads declaring hand 1 (check ran)", "of them registry = 2", "of those, kind fleet_undercount / zero_km_undercount", "share of the hand-1 ads"],
    splits.map((s) => {
      const set = s.name === "both" ? declared1 : declared1.filter((p) => p.model_label === s.name);
      const two = set.filter((p) => checkOf(p.bd, "hand")?.official === 2);
      const fleet = two.filter((p) => FLEET_KINDS.includes(checkOf(p.bd, "hand")?.kind ?? ""));
      return [s.name, set.length, two.length, fleet.length, set.length ? `${f((100 * fleet.length) / set.length, 1)} %` : "-"];
    }),
  );
  log("");
  log("the same hand-1 / registry-2 ads by the first non-dealer row of the record (read off the stored record, unclassified):");
  const firstOwnerCounts = new Map<string, number>();
  for (const p of declared1) {
    if (checkOf(p.bd, "hand")?.official !== 2) continue;
    const h = rowOf(p.bd, "history");
    const record = h && h.status === "scored" && h.source === "mot" ? parseOwnershipHistory(h.raw.owners, p.plate) : null;
    const first = record === null ? "no record" : (analyzeHistory(record).non_dealer[0]?.type ?? "no non-dealer row");
    firstOwnerCounts.set(first, (firstOwnerCounts.get(first) ?? 0) + 1);
  }
  table(["first non-dealer row type", "ads"], [...firstOwnerCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]));

  // ======================================================================== M8
  h2("M8 — depreciation against the new-car price");
  log("ratio = price / new_price; new_price = the latest published_at row of new_car_prices on (degem_code, sug_degem, shnat_yitzur), joined as select-three.ts joins it.");
  log("age = years from first_registration to first_seen_at (365.25-day years). No floor — n is stated everywhere.");
  log("");
  type M8Row = { l: Loaded; ratio: number; age: number };
  const m8All: M8Row[] = [];
  let m8NoNew = 0;
  let m8NoReg = 0;
  for (const p of pool) {
    if (p.new_price === null || p.new_price <= 0) {
      m8NoNew++;
      continue;
    }
    if (p.first_registration === null) {
      m8NoReg++;
      continue;
    }
    m8All.push({ l: p, ratio: p.price / p.new_price, age: (p.first_seen_at.getTime() - p.first_registration.getTime()) / YEAR_MS });
  }
  if (m8NoNew) note(`M8: ${m8NoNew} listing(s) have no new_car_prices row on their key and are out of M8.`);
  if (m8NoReg) note(`M8: ${m8NoReg} listing(s) have no first_registration and are out of M8.`);
  const m8Keys = [...new Set(m8All.map((r) => `${r.l.model_label}|${r.l.year}`))].sort();
  table(
    ["model", "year", "n", "median ratio", "p25", "p75", "median age (yrs)"],
    m8Keys.map((k) => {
      const [modelName, yearText] = k.split("|");
      const set = m8All.filter((r) => r.l.model_label === modelName && String(r.l.year) === yearText);
      const ratios = set.map((r) => r.ratio);
      return [modelName, yearText, set.length, f(median(ratios), 3), f(percentile(ratios, 0.25), 3), f(percentile(ratios, 0.75), 3), f(median(set.map((r) => r.age)), 2)];
    }),
  );
  log("");
  log("fit ratio = a + b × age (OLS):");
  const m8Fits = splits.map((s) => {
    const set = s.name === "both" ? m8All : m8All.filter((r) => r.l.model_label === s.name);
    return { name: s.name, set, fit: ols(set.map((r) => r.ratio), [{ name: "age", v: set.map((r) => r.age) }]) };
  });
  table(
    ["split", "a (intercept)", "SE", "b (per year)", "SE", "95 % interval on b", "R²", "n"],
    m8Fits.map(({ name, set, fit }) => {
      if (!fit.ok) {
        note(`M8 fit dropped: ${name} — ${fit.reason}.`);
        return [name, "fit dropped", fit.reason, "-", "-", "-", "-", set.length];
      }
      const b = at(fit, "age");
      return [
        name,
        f(fit.coef[0], 4),
        f(fit.se[0], 4),
        b === null ? "column dropped" : f(b.coef, 4),
        b === null ? "-" : f(b.se, 4),
        b === null ? "-" : `${f(b.lo, 4)} … ${f(b.hi, 4)}`,
        f(fit.r2, 3),
        fit.n,
      ];
    }),
  );
  log("");
  log(
    "the two models on one line: " +
      m8Fits
        .filter((x) => x.name !== "both")
        .map(({ name, fit }) => (fit.ok ? `${name}: ratio = ${f(fit.coef[0], 4)} ${fit.coef[1] >= 0 ? "+" : "−"} ${f(Math.abs(fit.coef[1]), 4)} × age (n ${fit.n}, R² ${f(fit.r2, 3)})` : `${name}: fit dropped`))
        .join("   |   "),
  );

  // ======================================================================== M9
  h2("M9 — sanity lines");
  const below = pool.filter((p) => {
    const mp = rawNum(rowOf(p.bd, "price")?.raw, "median_price");
    return mp !== null && mp > 0 && (p.price / mp) * 100 < BELOW_THRESHOLD_FLOOR_PCT;
  });
  log(`- listings priced below ${BELOW_THRESHOLD_FLOOR_PCT} % of their cell median (BELOW_THRESHOLD_FLOOR_PCT): **${below.length}** (expected 0)${below.length ? " — " + below.map((p) => `${p.plate} (listing ${p.id})`).join(", ") : ""}`);
  const withNew = pool.filter((p) => p.new_price !== null && p.new_price > 0);
  const pctOfNew = withNew.map((p) => (p.price / (p.new_price as number)) * 100);
  const maxIdx = pctOfNew.length ? pctOfNew.indexOf(Math.max(...pctOfNew)) : -1;
  log(
    `- max price / new_price in the pool (PRICE_VS_NEW_CEILING_PCT ${PRICE_VS_NEW_CEILING_PCT}): ` +
      (maxIdx < 0 ? "no listing has a new price" : `**${f(pctOfNew[maxIdx], 1)} %** (${withNew[maxIdx].plate}, listing ${withNew[maxIdx].id}, ${withNew.length} listings priced against a new price)`) +
      ` (expected < ${PRICE_VS_NEW_CEILING_PCT})`,
  );
  log(`- listings whose km row hits KM_CAP_PCT (|value| = ${KM_CAP_PCT}):`);
  const capped = m5All.filter((r) => {
    const v = rowOf(r.l.bd, "km")?.value;
    return typeof v === "number" && Math.abs(v) === KM_CAP_PCT;
  });
  table(
    ["split", "listings at the cap", "mean y (% off the cell median)", "plates"],
    splits.map((s) => {
      const set = s.name === "both" ? capped : capped.filter((r) => r.l.model_label === s.name);
      return [s.name, set.length, set.length ? sgn(mean(set.map((r) => r.y)), 2) : "-", set.map((r) => r.l.plate).join(", ") || "-"];
    }),
  );
  log("");
  log(`(the cap count runs over the M5 pool — ${m5All.length} listings with both a deal score and a scored km row — because y is only defined there.)`);

  // ======================================================================== M4b
  h2(`M4b — median error by n, n = ${M4B_NS[0]} … ${M4B_NS[M4B_NS.length - 1]}`);
  log(`Cells: every cell with ≥ ${M4B_CELL_FLOOR} listings, plus — as the homogeneous reference — every ${ordered[0]} cell with ≥ ${M4B_REFERENCE_FLOOR} listings.`);
  log(`Seed ${SEED} (mulberry32, restarted at the top of each cell, as in M4); ${M4_SUBSAMPLES} subsamples per n, without replacement.`);
  log("Deviation = (subsample median price − full-cell median price) / full-cell median price × 100 — M4's reading, unchanged.");
  log(`Inside a cell n runs only up to its size − ${M4B_TAIL}; above that the row prints NOT MEASURABLE.`);
  log("");

  type M4bCell = {
    key: string;
    label: string;
    model: string;
    size: number;
    fullMedian: number;
    role: "heterogeneous" | "homogeneous reference";
    perN: Map<number, { meanAbs: number; p90Abs: number } | null>;
  };
  const m4bCells: M4bCell[] = [];
  for (const [key, cell] of [...cellsByKey.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const big = cell.length >= M4B_CELL_FLOOR;
    const reference = cell[0].model_label === ordered[0] && cell.length >= M4B_REFERENCE_FLOOR;
    if (!big && !reference) continue;
    if (big && cell[0].model_label === ordered[0]) {
      note(
        `M4b: ${cell[0].cell_label} is a ${ordered[0]} cell that also clears the ≥ ${M4B_CELL_FLOOR} floor — the brief's naming ` +
          `(the ${ordered[0]} cell as the homogeneous reference) did not anticipate it; it is counted as heterogeneous here.`,
      );
    }
    const prices = cell.map((p) => p.price);
    const fullMedian = median(prices);
    const rand = mulberry32(SEED);
    const perN = new Map<number, { meanAbs: number; p90Abs: number } | null>();
    for (const n of M4B_NS) {
      if (n > prices.length - M4B_TAIL) {
        perN.set(n, null);
        continue;
      }
      const devs = medianDeviationsPct(prices, n, rand, fullMedian, M4_SUBSAMPLES, false);
      perN.set(n, { meanAbs: mean(devs), p90Abs: percentile(devs, 0.9) });
    }
    m4bCells.push({
      key,
      label: cell[0].cell_label,
      model: cell[0].model_label,
      size: cell.length,
      fullMedian,
      role: big ? "heterogeneous" : "homogeneous reference",
      perN,
    });
  }
  for (const c of m4bCells) {
    log(`**${c.label}** — model ${c.model}, ${c.size} listings, full-cell median price ${c.fullMedian}, ${c.role}`);
    table(
      ["n", "mean |deviation| %", "p90 |deviation| %"],
      M4B_NS.map((n) => {
        const v = c.perN.get(n);
        return [n, v ? f(v.meanAbs) : `NOT MEASURABLE (n > ${c.size} − ${M4B_TAIL})`, v ? f(v.p90Abs) : "NOT MEASURABLE"];
      }),
    );
    log("");
    const missing = M4B_NS.filter((n) => c.perN.get(n) === null);
    if (missing.length) note(`M4b: cell ${c.label} has ${c.size} listings, so n = ${missing.join(", ")} exceed size − ${M4B_TAIL} — NOT MEASURABLE for those n.`);
  }
  if (m4bCells.length === 0) {
    log(`NOT MEASURABLE — no cell reaches ${M4B_CELL_FLOOR} listings and no ${ordered[0]} cell reaches ${M4B_REFERENCE_FLOOR}.`);
    note(`M4b floor bit: no cell qualifies (≥ ${M4B_CELL_FLOOR}, or ≥ ${M4B_REFERENCE_FLOOR} for ${ordered[0]}) — M4b is NOT MEASURABLE on this pool.`);
  }

  // ======================================================================== M8b
  h2("M8b — the honest curve error (leave-one-out)");
  log("For each model-year: ratio = a + b × age is fitted on the listings of the OTHER model-years only, then asked for the held-out model-year's");
  log("median ratio at its median age. error = |predicted − actual median ratio| / actual × 100. No listing sits in a fit that judges it.");
  log("");
  type MYear = { key: string; model: string; year: number; n: number; medianRatio: number; medianAge: number };
  const myears: MYear[] = m8Keys.map((k) => {
    const [modelName, yearText] = k.split("|");
    const set = m8All.filter((r) => r.l.model_label === modelName && String(r.l.year) === yearText);
    return {
      key: k,
      model: modelName,
      year: Number(yearText),
      n: set.length,
      medianRatio: median(set.map((r) => r.ratio)),
      medianAge: median(set.map((r) => r.age)),
    };
  });
  // loo() is now module-level (exported for §5.3); MYear and M8Row satisfy its structural parameters.
  const yearKey = (r: M8Row) => `${r.l.model_label}|${r.l.year}`;

  log(`**The pooled curve** — both models together: ${myears.length} model-years, ${m8All.length} listings with a new price and a first registration.`);
  const pooledLoo = myears.map((my) => ({ my, r: loo(my, m8All.filter((x) => yearKey(x) !== my.key), `pooled curve, holding out ${my.model} ${my.year}`) }));
  table(
    ["held-out model-year", "n held out", "median age (yrs)", "actual median ratio", "a (fit on the rest)", "b", "predicted ratio", "error %", "n in the fit"],
    pooledLoo.map(({ my, r }) => [
      `${my.model} ${my.year}`,
      my.n,
      f(my.medianAge, 2),
      f(my.medianRatio, 3),
      f(r.a, 4),
      f(r.b, 4),
      f(r.pred, 3),
      r.err === null ? `NOT MEASURABLE (${r.reason ?? "no fit"})` : f(r.err, 2),
      r.fitN,
    ]),
  );
  const pooledErrs = pooledLoo.map((x) => x.r.err).filter((e): e is number => e !== null);
  const allPooled = myears.length > 0 && pooledErrs.length === myears.length;
  const CURVE_MAX = allPooled ? Math.max(...pooledErrs) : null;
  const CURVE_MEAN = allPooled ? mean(pooledErrs) : null;
  if (!allPooled) {
    note(
      `M8b: ${myears.length - pooledErrs.length} of ${myears.length} pooled leave-one-out fits produced no error — the curve error is NOT MEASURABLE ` +
        "and both candidate rules print NOT MEASURABLE.",
    );
  }
  log("");
  log(
    allPooled
      ? `pooled leave-one-out error over the ${myears.length} model-years: **mean ${f(CURVE_MEAN, 2)} %**, **max ${f(CURVE_MAX, 2)} %**.`
      : "pooled leave-one-out error: NOT MEASURABLE.",
  );
  log("");
  log(`**The per-model curve** — the same leave-one-out inside one model, run only where the model has at least ${M8B_MIN_OTHER_YEARS} other model-years.`);
  const perModelLoo = myears.map((my) => {
    const fitPool = m8All.filter((x) => x.l.model_label === my.model && yearKey(x) !== my.key);
    const others = new Set(fitPool.map((x) => x.l.year)).size;
    if (others < M8B_MIN_OTHER_YEARS) {
      note(`M8b floor bit: ${my.model} ${my.year} has ${others} other model-year(s) of its own model, floor ${M8B_MIN_OTHER_YEARS} — its per-model curve is NOT MEASURABLE.`);
      return { my, others, r: null as Loo | null };
    }
    return { my, others, r: loo(my, fitPool, `${my.model} only, holding out ${my.year}`) };
  });
  table(
    ["held-out model-year", "other model-years of the model", "n held out", "median age (yrs)", "actual median ratio", "a", "b", "predicted ratio", "error %", "n in the fit"],
    perModelLoo.map(({ my, others, r }) => [
      `${my.model} ${my.year}`,
      others,
      my.n,
      f(my.medianAge, 2),
      f(my.medianRatio, 3),
      r === null ? "-" : f(r.a, 4),
      r === null ? "-" : f(r.b, 4),
      r === null ? "-" : f(r.pred, 3),
      r === null
        ? `NOT MEASURABLE (< ${M8B_MIN_OTHER_YEARS} other model-years)`
        : r.err === null
          ? `NOT MEASURABLE (${r.reason ?? "no fit"})`
          : f(r.err, 2),
      r === null ? "-" : r.fitN,
    ]),
  );
  const perModelErrs = perModelLoo.map((x) => x.r?.err ?? null).filter((e): e is number => e !== null);
  log("");
  log(
    perModelErrs.length === 0
      ? "per-model leave-one-out error: NOT MEASURABLE for every model-year."
      : perModelErrs.length === myears.length
        ? `per-model leave-one-out error over the ${myears.length} model-years: **mean ${f(mean(perModelErrs), 2)} %**, **max ${f(Math.max(...perModelErrs), 2)} %**.`
        : `per-model leave-one-out error over the ${perModelErrs.length} measurable model-year(s): mean ${f(mean(perModelErrs), 2)} %, max ${f(Math.max(...perModelErrs), 2)} % — ` +
          `NOT MEASURABLE for the other ${myears.length - perModelErrs.length}.`,
  );
  log("");
  log("Reported separately, as the brief asks. The two rules below are measured against the POOLED curve, not this one.");

  // ======================================================================== the comparison
  h2("The comparison — two candidate rules");
  log(
    allPooled
      ? `Both rules are measured against the pooled leave-one-out curve error of M8b: max **${f(CURVE_MAX, 2)} %**, mean **${f(CURVE_MEAN, 2)} %**.`
      : "Both rules are measured against the pooled leave-one-out curve error of M8b, which is NOT MEASURABLE on this pool.",
  );
  log("");
  log("**(a) Fixed N** — the smallest n at which the p90 |deviation| of an n-listing median (M4b) is already no worse than the curve.");
  log("");
  const hetero = m4bCells.filter((c) => c.role === "heterogeneous");
  const nRange = `n = ${M4B_NS[0]} … ${M4B_NS[M4B_NS.length - 1]}`;
  const smallestNBelow = (c: M4bCell, bar: number | null): number | null => {
    if (bar === null) return null;
    for (const n of M4B_NS) {
      const v = c.perN.get(n);
      if (v && v.p90Abs <= bar) return n;
    }
    return null;
  };
  const nText = (c: M4bCell, bar: number | null): string => {
    if (bar === null) return "NOT MEASURABLE (no curve error)";
    const n = smallestNBelow(c, bar);
    return n === null ? `not reached within ${nRange}` : String(n);
  };
  if (hetero.length === 0) {
    log(`NOT MEASURABLE — no heterogeneous cell (≥ ${M4B_CELL_FLOOR} listings) is in M4b.`);
    note(`Rule (a): no cell reaches ${M4B_CELL_FLOOR} listings — the candidate constant is NOT MEASURABLE.`);
  } else {
    table(
      ["heterogeneous cell", "listings", `p90 at n = ${MIN_SAMPLE} (MIN_SAMPLE)`, "smallest n with p90 ≤ max curve error", "smallest n with p90 ≤ mean curve error"],
      hetero.map((c) => [c.label, c.size, f(c.perN.get(MIN_SAMPLE)?.p90Abs ?? null), nText(c, CURVE_MAX), nText(c, CURVE_MEAN)]),
    );
  }
  const worstN = (bar: number | null): number | null => {
    if (hetero.length === 0 || bar === null) return null;
    const ns = hetero.map((c) => smallestNBelow(c, bar));
    return ns.some((x) => x === null) ? null : Math.max(...(ns as number[]));
  };
  const CAND_MAX = worstN(CURVE_MAX);
  const CAND_MEAN = worstN(CURVE_MEAN);
  const candText = (v: number | null, bar: number | null): string =>
    bar === null ? "NOT MEASURABLE" : v === null ? `not reached within ${nRange}` : `n = ${v}`;
  log("");
  log(
    `candidate constant, the worst heterogeneous cell: against the **max** curve error **${candText(CAND_MAX, CURVE_MAX)}**; ` +
      `against the **mean** curve error **${candText(CAND_MEAN, CURVE_MEAN)}** (MIN_SAMPLE in use: ${MIN_SAMPLE}).`,
  );
  log("");
  log(`**(b) Dispersion-based** — every cell with ≥ ${MIN_SAMPLE} listings (MIN_SAMPLE, the fat cells). The estimate is the p90 |deviation| of ${M4_SUBSAMPLES} bootstrap`);
  log(`resamples of the cell's own listings (n draws with replacement out of the same n, seed ${SEED}) around the cell's own median; below ${M4B_BOOT_FLOOR} listings the line prints NOT ESTIMABLE.`);
  log(`A cell switches to the anchor when its estimated error exceeds the curve's max leave-one-out error${allPooled ? ` (${f(CURVE_MAX, 2)} %)` : ""}.`);
  log("");
  const fatCells = [...cellsByKey.entries()].filter(([, v]) => v.length >= MIN_SAMPLE).sort((a, b) => b[1].length - a[1].length);
  type RuleB = { key: string; label: string; model: string; size: number; est: number | null; switches: boolean | null };
  const ruleB: RuleB[] = fatCells.map(([key, cell]) => {
    const base = { key, label: cell[0].cell_label, model: cell[0].model_label, size: cell.length };
    if (cell.length < M4B_BOOT_FLOOR) return { ...base, est: null, switches: null };
    const prices = cell.map((p) => p.price);
    const devs = medianDeviationsPct(prices, cell.length, mulberry32(SEED), median(prices), M4_SUBSAMPLES, true);
    const est = percentile(devs, 0.9);
    return { ...base, est, switches: CURVE_MAX === null ? null : est > CURVE_MAX };
  });
  table(
    ["cell", "cell key (comparison_group × year)", "n", "estimated p90 error of this cell's own median %", "curve error (max LOO) %", "switches to the anchor"],
    ruleB.map((r) => [
      r.label,
      r.key.replace(/\|/g, " · "), // the key's own separator is a pipe, which would break the table

      r.size,
      r.est === null ? `NOT ESTIMABLE (n < ${M4B_BOOT_FLOOR})` : f(r.est, 2),
      allPooled ? f(CURVE_MAX, 2) : "NOT MEASURABLE",
      r.switches === null ? (r.est === null ? "NOT ESTIMABLE" : "NOT MEASURABLE (no curve error)") : r.switches ? "yes" : "no",
    ]),
  );
  for (const r of ruleB) {
    if (r.est === null) note(`Rule (b): cell ${r.label} has ${r.size} listings, below the bootstrap floor ${M4B_BOOT_FLOOR} — its own error is NOT ESTIMABLE and the rule does not decide it.`);
  }

  const allCells = [...cellsByKey.entries()];
  const listingsIn = (cs: [string, Loaded[]][]) => cs.reduce((a, [, v]) => a + v.length, 0);
  const anchorA = CAND_MAX === null ? null : allCells.filter(([, v]) => v.length < CAND_MAX);
  const switchesYes = ruleB.filter((r) => r.switches === true);
  const notEstimable = ruleB.filter((r) => r.est === null);
  const thinCells = allCells.filter(([, v]) => v.length < MIN_SAMPLE);
  log("");
  log(
    `**The count.** Of today's ${allCells.length} cells (${pool.length} listings): under rule (a) with the candidate constant ${candText(CAND_MAX, CURVE_MAX)}, ` +
      (anchorA === null ? "NOT MEASURABLE" : `**${anchorA.length} cells (${listingsIn(anchorA)} listings)** anchor on the curve`) +
      `; under rule (b), **${switchesYes.length} cells (${switchesYes.reduce((a, r) => a + r.size, 0)} listings)** switch to the curve, with ` +
      `${notEstimable.length} fat cell(s) (${notEstimable.reduce((a, r) => a + r.size, 0)} listings) NOT ESTIMABLE and ${thinCells.length} cell(s) ` +
      `(${listingsIn(thinCells)} listings) below the ≥ ${MIN_SAMPLE} floor the rule never reaches — neither group is counted either way.`,
  );
  if (CAND_MEAN !== null && CAND_MEAN !== CAND_MAX) {
    const anchorMean = allCells.filter(([, v]) => v.length < CAND_MEAN);
    log("");
    log(`the same count under rule (a) with the mean-error candidate ${candText(CAND_MEAN, CURVE_MEAN)}: **${anchorMean.length} cells (${listingsIn(anchorMean)} listings)** anchor on the curve.`);
  }

  // ======================================================================== verdicts
  // Computed here, printed twice below: as per-split lines inside INTERPRETED, and as the summary
  // table, which stays the last thing printed (§1).
  const thresholdVerdict = (value: number, gap: Gap | null, measurable: boolean): Verdict => {
    if (!measurable || gap === null) return "NOT MEASURABLE";
    if (value > gap.lo && value < gap.hi) return "HOLDS";
    const edge = Math.abs(value - gap.lo) <= Math.abs(value - gap.hi) ? gap.lo : gap.hi;
    return Math.abs(value - edge) <= 0.2 * Math.abs(edge) ? "SAME BALLPARK" : "FLAG";
  };
  const gapText = (g: { gap: Gap | null; ok: boolean }, d = 0) => (!g.ok ? "NOT MEASURABLE" : g.gap === null ? "no gap" : `${f(g.gap.lo, d)} → ${f(g.gap.hi, d)}`);

  const m1Verdict = (name: string): Verdict => {
    const g = m1Gap(name);
    return thresholdVerdict(ZERO_KM_WINDOW_MONTHS, g.gap, g.ok);
  };
  const m2Verdict = (name: string): Verdict => {
    const g = m2Gap(name);
    return thresholdVerdict(KM_BELOW_THRESHOLD, g.gap, g.ok);
  };
  const m3Verdict = (name: string): Verdict => {
    const g = m3Gap(name);
    return thresholdVerdict(KM_IMPLAUSIBLE_PER_MONTH, g.gap, g.ok);
  };
  const m4Verdict = (name: string): Verdict => {
    const rs = m4Results.filter((r) => name === "both" || r.model === name);
    if (rs.length === 0) return "NOT MEASURABLE";
    const v = m4Worst(name);
    return v !== null && MIN_SAMPLE >= v ? "HOLDS" : "FLAG";
  };
  const m5SlopeOf = (name: string): { v: number | null; lo: number | null; hi: number | null; n: number; ok: boolean } => {
    const set = m5Of(name);
    const fit = (m5Fits.get(name) as { a: Fit }).a;
    if (set.length < M5_FLOOR_LISTINGS || !fit.ok) return { v: null, lo: null, hi: null, n: set.length, ok: false };
    const c = at(fit, X_NAME);
    if (c === null) return { v: null, lo: null, hi: null, n: set.length, ok: false };
    return { v: -c.coef, lo: -c.hi, hi: -c.lo, n: fit.n, ok: true };
  };
  const m5Verdict = (name: string): Verdict => {
    const r = m5SlopeOf(name);
    if (!r.ok) return "NOT MEASURABLE";
    const lo = r.lo as number;
    const hi = r.hi as number;
    if (lo <= KM_SLOPE_PCT_PER_1000_PER_YEAR && KM_SLOPE_PCT_PER_1000_PER_YEAR <= hi) return "HOLDS";
    return lo - 0.1 <= KM_SLOPE_PCT_PER_1000_PER_YEAR && KM_SLOPE_PCT_PER_1000_PER_YEAR <= hi + 0.1 ? "SAME BALLPARK" : "FLAG";
  };
  const lease = m6Pooled !== null && m6Pooled.ok ? at(m6Pooled, `class:${H_CLASS_LABEL.fleet}`) : null;
  const zero = m6Pooled !== null && m6Pooled.ok ? at(m6Pooled, `class:${H_CLASS_LABEL.zero_km}`) : null;
  const pooledN = m6Pooled !== null && m6Pooled.ok ? m6Pooled.n : "-";
  const leasePooled: Verdict =
    lease === null
      ? "NOT MEASURABLE"
      : lease.lo <= OWNER_TYPE_DEDUCTION.leasing && OWNER_TYPE_DEDUCTION.leasing <= lease.hi
        ? "HOLDS"
        : Math.abs(OWNER_TYPE_DEDUCTION.leasing - lease.coef) <= 8
          ? "SAME BALLPARK"
          : "FLAG";
  const zeroPooled: Verdict =
    zero === null || lease === null
      ? "NOT MEASURABLE"
      : zero.coef > Math.min(lease.coef, 0) && zero.coef < Math.max(lease.coef, 0)
        ? "HOLDS"
        : zero.hi > Math.min(lease.coef, 0) && zero.lo < Math.max(lease.coef, 0)
          ? "SAME BALLPARK"
          : "FLAG";
  const m6Has = (name: string) => qualifying.filter((q) => name === "both" || q.model === name).length > 0;
  const m6Verdict = (name: string, which: "lease" | "zero"): Verdict => (!m6Has(name) ? "NOT MEASURABLE" : which === "lease" ? leasePooled : zeroPooled);
  const m6SplitText = (name: string, c: { coef: number; lo: number; hi: number } | null) =>
    !m6Has(name) || c === null ? "NOT MEASURABLE" : `${sgn(c.coef, 1)} [${sgn(c.lo, 1)} … ${sgn(c.hi, 1)}]`;

  summary.push(["ZERO_KM_WINDOW_MONTHS", ZERO_KM_WINDOW_MONTHS, ...splits.map((s) => gapText(m1Gap(s.name))), m1Gap("both").n, m1Verdict("both")]);
  summary.push(["KM_BELOW_THRESHOLD", KM_BELOW_THRESHOLD, ...splits.map((s) => gapText(m2Gap(s.name))), m2Gap("both").n, m2Verdict("both")]);
  summary.push(["KM_IMPLAUSIBLE_PER_MONTH", KM_IMPLAUSIBLE_PER_MONTH, ...splits.map((s) => gapText(m3Gap(s.name))), m3Gap("both").n, m3Verdict("both")]);
  summary.push([
    "MIN_SAMPLE",
    MIN_SAMPLE,
    ...splits.map((s) => {
      const rs = m4Results.filter((r) => s.name === "both" || r.model === s.name);
      const v = m4Worst(s.name);
      return rs.length === 0 ? "NOT MEASURABLE" : v === null ? `> ${M4_NS[M4_NS.length - 1]}` : `n ≥ ${v}`;
    }),
    m4Results.reduce((a, r) => a + r.size, 0),
    m4Verdict("both"),
  ]);
  summary.push([
    "KM_SLOPE_PCT_PER_1000_PER_YEAR",
    KM_SLOPE_PCT_PER_1000_PER_YEAR,
    ...splits.map((s) => {
      const r = m5SlopeOf(s.name);
      return r.ok ? `${sgn(r.v, 3)} [${sgn(r.lo, 2)} … ${sgn(r.hi, 2)}]` : "NOT MEASURABLE";
    }),
    m5SlopeOf("both").n,
    m5Verdict("both"),
  ]);
  summary.push(["OWNER_TYPE_DEDUCTION.leasing", OWNER_TYPE_DEDUCTION.leasing, ...splits.map((s) => m6SplitText(s.name, lease)), pooledN, m6Verdict("both", "lease")]);
  summary.push(["ZERO_KM_LEASING_DEDUCTION (order)", ZERO_KM_LEASING_DEDUCTION, ...splits.map((s) => m6SplitText(s.name, zero)), pooledN, m6Verdict("both", "zero")]);

  // ======================================================================== INTERPRETED
  h2("INTERPRETED, NOT READ");
  log("Readings this script had to fix because the brief states the measurement but not its exact arithmetic, plus every floor that bit and every fit that was dropped.");
  log("Every raw number stands next to its verdict above, so a different reading can be applied in the chat without re-running.");
  log("");
  log("- History class: the engine's analyzeHistory over the record in the history row's raw.owners — zero_km_deal → zero-km, else has_fleet_row → full leasing / fleet, else private-only. A history row that is unavailable or whose source is 'ad' (no record at all) is 'other'.");
  log("- Seller type: the engine's sellerTypeOf(dealers.dealer_type) — 'private' → private seller, anything else → lot (dealer).");
  log("- M3 rate: the stored checks.km rate is the engine's own, computed against the scoring run's `now`, not against first_seen_at. The fallback path (a check that stored no rate) calls kmFacts with first_seen_at as `now`, as the brief describes. The two denominators differ; the source of every case is counted in the M3 table.");
  log("- M2 / M3 population: km_declared, km_at_last_test and the test date are read from the database row — they are inputs, not classifications, and the Day 13 §1 regression pass found no difference between them and the values the breakdown carries.");
  log("- Widest empty interval: the widest span between two consecutive OBSERVED values that both lie inside the stated range. The range boundaries are not treated as observations.");
  log("- M4 full-cell median: the median over the cell's live listings — the same set the subsamples are drawn from — not market_stats.median_price, which is that median rounded to whole shekels.");
  log("- M5 slope sign: the tables print minus the OLS coefficient of y on x, so a positive number means the engine's 'the price rises when km is below the median', comparable with the 0.6 in the code and Day 12's 0.64.");
  log("- 95 % intervals: coefficient ± t(0.975, df) × SE, t from a Cornish-Fisher expansion in 1/df (accurate to about 1e-4 at the df here).");
  log("- M7 'fleet first owner': read as the engine's own hand-check kinds fleet_undercount and zero_km_undercount — the two kinds it raises when the record holds a fleet row the ad did not count. The first non-dealer row type of the same ads is printed beside it, unclassified.");
  log(`- M4b 'heterogeneous': the cells that entered by the ≥ ${M4B_CELL_FLOOR} floor. The ${ordered[0]} cell entered by the ≥ ${M4B_REFERENCE_FLOOR} floor and is the brief's homogeneous reference; it is NOT one of the cells rule (a) reads a candidate constant off. The role of every cell is printed beside it.`);
  log(`- M4b n range: for a cell, n stops at size − ${M4B_TAIL} (the brief's rule), not at size − 1; above it the row prints NOT MEASURABLE rather than a number from a near-complete subsample.`);
  log(`- M4b vs M4 at a shared n: the seed is the same and the procedure is the same, but M4b walks n = ${M4B_NS[0]} … ${M4B_NS[M4B_NS.length - 1]} on one RNG stream per cell while M4 walks ${M4_NS.join(", ")}, so a given n is drawn from a different point of the stream and the two tables differ in the last tenths at the n they share. Neither is more correct; both are ${M4_SUBSAMPLES} draws.`);
  log("- Cell labels are not unique: the cell is (comparison_group × year), and two MAZDA 3 SPIRIT 2021 cells (different comparison groups) carry the same label. Rule (b)'s table prints the cell key beside the label; the older tables print the label alone, unchanged.");
  log(`- Rule (b) bootstrap: the brief asks for the p90 error of a cell's own median at its actual n, 'by the same bootstrap on the cell's own listings'. A subsample WITHOUT replacement of size n out of n is the cell itself and its deviation is 0 every time, so the estimate is taken with replacement — ${M4_SUBSAMPLES} resamples of n draws with replacement from the same n listings, seed ${SEED}, deviation measured against the cell's own median. This is the one place where the resampling differs from M4's.`);
  log(`- Rule (b) coverage: the rule decides a cell only where the estimate exists (n ≥ ${M4B_BOOT_FLOOR}). Fat cells below that floor print NOT ESTIMABLE and cells below ${MIN_SAMPLE} listings are outside the rule altogether; the count line reports both groups separately instead of assuming a side for them.`);
  log("- Rule (a) count: a cell anchors on the curve when its listing count is BELOW the candidate constant — the candidate is the smallest n whose median is already as good as the curve, so a cell that reaches it keeps its own median.");
  log("- The candidate constant is printed twice, once against the max leave-one-out curve error and once against the mean, because the brief asks for both n and names neither as the constant. The count line uses the max-error candidate, the same bar rule (b) switches on, and repeats the count for the mean-error candidate when the two differ.");
  log("- M8b holds out a MODEL-YEAR, not a listing: the fit that predicts a model-year's median ratio contains none of that model-year's listings. 'age' and 'ratio' are M8's, unchanged.");
  log("- Verdicts are computed mechanically on the 'both' split: HOLDS = the value in use lies strictly inside the measured empty gap, or inside the 95 % interval, or (MIN_SAMPLE) is at least the smallest n the measurement needs. SAME BALLPARK = leasing within ±8 points of the coefficient; slope inside the interval widened by 0.1; a threshold within 20 % of the nearer edge of the gap. FLAG = outside. NOT MEASURABLE = below the floor.");
  log("");
  const uniqueNotes = [...new Set(notes)];
  if (uniqueNotes.length === 0) log("No floor bit, no fit was dropped and no listing fell out of a population.");
  else for (const n of uniqueNotes) log(`- ${n}`);

  log("");
  log("**The second reading of HOLDS.** The verdicts above use 'the value sits inside THE measured (widest) empty gap', because SAME BALLPARK is defined against 'the gap's edges'.");
  log("Under the looser reading — 'the value sits inside ANY empty gap' — the three thresholds land differently. The bracketing observations are:");
  log("");
  const bracket = (label: string, value: number, per: (name: string) => number[], strict: (name: string) => Verdict): (string | number)[][] =>
    splits.map((s) => {
      const nb = neighbours(per(s.name), value);
      return [
        label,
        s.name,
        value,
        nb.observed ? "the value itself is observed" : `${nb.lo === null ? "nothing below" : f(nb.lo, 0)} → ${nb.hi === null ? "nothing above" : f(nb.hi, 0)}`,
        nb.observed || nb.lo === null || nb.hi === null ? "no" : "yes",
        strict(s.name),
      ];
    });
  table(
    ["constant", "split", "in use", "bracketing observations", "inside some empty gap", "verdict as computed (widest gap)"],
    [
      ...bracket("ZERO_KM_WINDOW_MONTHS", ZERO_KM_WINDOW_MONTHS, (n) => m1Of(n).map((r) => r.months), m1Verdict),
      ...bracket("KM_BELOW_THRESHOLD", KM_BELOW_THRESHOLD, (n) => m2Of(n).map((r) => r.gap), m2Verdict),
      ...bracket("KM_IMPLAUSIBLE_PER_MONTH", KM_IMPLAUSIBLE_PER_MONTH, (n) => m3Of(n).map((r) => r.rate), m3Verdict),
    ],
  );
  log("");
  log("**Per split.** The summary table carries one verdict, computed on 'both'. Per split it reads:");
  log("");
  table(
    ["constant", ...splits.map((s) => s.name)],
    [
      ["ZERO_KM_WINDOW_MONTHS", ...splits.map((s) => m1Verdict(s.name))],
      ["KM_BELOW_THRESHOLD", ...splits.map((s) => m2Verdict(s.name))],
      ["KM_IMPLAUSIBLE_PER_MONTH", ...splits.map((s) => m3Verdict(s.name))],
      ["MIN_SAMPLE", ...splits.map((s) => m4Verdict(s.name))],
      ["KM_SLOPE_PCT_PER_1000_PER_YEAR", ...splits.map((s) => m5Verdict(s.name))],
      ["OWNER_TYPE_DEDUCTION.leasing", ...splits.map((s) => m6Verdict(s.name, "lease"))],
      ["ZERO_KM_LEASING_DEDUCTION (order)", ...splits.map((s) => m6Verdict(s.name, "zero"))],
    ],
  );

  // ======================================================================== SUMMARY
  h2("SUMMARY");
  log("Verdicts are computed on the 'both' split and n is that split's n. The vocabulary is closed: HOLDS · SAME BALLPARK · FLAG · NOT MEASURABLE.");
  log("");
  table(["constant", "in use", ordered[0], ordered[1], "both", "n", "verdict"], summary);
}

// Day 14 (§5): run the measurement only when this file IS the command — importing it for ols() / at() /
// loo() must not run it. Invoked directly, everything below behaves exactly as before.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
    .then(() => db.$disconnect())
    .catch(async (e) => {
      console.error("\nSTOPPED:", (e as Error).message);
      await db.$disconnect();
      process.exit(1);
    });
}
