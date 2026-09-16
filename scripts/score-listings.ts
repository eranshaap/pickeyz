// scripts/score-listings.ts
// Scores every live listing with the Stage A engine (BRIEF Day 11, §11). Default is a DRY RUN: it
// prints the report below and writes the same text to REPORT-score-listings.md (§22.3 — never to
// REPORT.md), nothing else. `--write` is the only way anything reaches the database.
//
// Per listing with delisted_at IS NULL:
//   1. load listing, car, model, dealer, and the THREE norm rows (Day 14 §6.1), each the latest by
//      computed_at at the current versions:
//        cell  = market_stats for (models.comparison_group, cars.year) with group_version = GROUP_VERSION
//        model = model_stats for (models.make, models.model)          with group_version = GROUP_VERSION
//        pool  = pool_stats  for the run                              (no group_version — P3)
//      a missing row -> null for that level; a row from an older engine_version is counted, and the
//      counter covers all three tables and must be 0.
//   2. build ScoringInput (src/lib/scoring-input.ts) — with new_price + its new_car_prices row id, joined
//      as select-three.ts joins it — and scoreListing(input, now). One `now` for the run.
//   3. collect; a listing that throws is reported with its id and the error, and the run continues.
//
// Dry run prints: top 10 by deal_score (nulls last) as compact invoices; counts by confidence level,
// by check kind, by sold_signal strength, by unavailable reason per row; the full ScoreResult JSON for
// `--plates=1234567,...`; everything that threw.
//
// Day 13 §1 — the regression block classifies. Every difference between a stored score and the
// recomputed one carries exactly one label, the first that applies: VERSION, NEW, CLOCK, DATA, NORM,
// else UNEXPLAINED; only UNEXPLAINED counts as a regression (decision, Eran 09/09: a difference
// explained by the clock is not one). The engine is not touched — CLOCK re-runs it read-only with the
// stored scored_at as `now`, DATA and NORM read the inputs and norm values the stored breakdown carries.
//
// Day 14 §6.3 — the classifier's VERSION label is no longer "listed, not compared". v2 -> v3 moves a
// listing's deal by a KNOWN amount: (old typical_condition - new median_history) + (new km row - old km
// row), with the price row and the history row identical. A VERSION line that does not move by that,
// within the ±0.1 rounding allowance of Q11, is UNEXPLAINED. The per-cell constant is printed and must be
// the same for every listing of the cell; the lines that needed the allowance are counted.
//
// Q13 (run 3, option 1) — that rule cannot describe the two populations §0.4 and §0.5 created, so VERSION
// gains two NAMED sub-rules. Each is a checked identity, not an exemption; a listing that enters one and
// fails its identity is UNEXPLAINED like any other.
//   (a) VERSION (anchor)  — the thin-cell anchor (§0.5): neither version has a deal score, the history and
//       km rows are identical, and the price row goes from absent to a scored row with source 'anchor'.
//   (b) VERSION (typical) — the re-sourced history (§0.4): the car has no ownership row, the v3 history row
//       is the cell's typical (source 'typical'), the price row is unchanged, and the deal moves by
//       constant + (new history - old history) + (new km - old km), within the same ±0.1 allowance.
// The count of each sub-rule is printed and compared against the §6.4 populations it must equal —
// except on a run with no version move at all, where the line reads `n/a — same engine version`
// instead of comparing 0 against them (Day 14 run C §0.15, answering run B's Q12).
//
// --write (§22.2): one transaction, one statement per table — a createMany of listing_scores rows
// (§19.1) and one UPDATE listings … FROM unnest(...) setting score = deal_score, score_breakdown = the
// result, scored_at = now, market_stats_id / model_stats_id / pool_stats_id = the ids of the three rows
// the score used (or null), engine_version = ENGINE_VERSION (and updated_at, which Prisma's update would
// have touched). Prisma's default transaction timeout. The report is printed in both modes.
//
// Day 17 run 4 §2 — the classifier itself is no longer here: it lives in src/lib/scoring/regression.ts
// as a pure module that opens no database. This script keeps the three things the module cannot do — it
// LOADS (the current norm rows, the stored side, and the norm rows that stored score used), it provides
// the recompute CALLBACK scoreWith(normRows, at), and it PRINTS. Every label keeps the meaning and the
// identity it already had, and --against keeps run 3's semantics.
//   Run 3 had two separate NORM sub-checks; they are now ONE composed identity. Whichever of the three
//   norm rows the stored score used — the cell row (market_stats), the slope row (model_stats), the
//   anchor row (pool_stats) — is not the row the current score used, the engine is re-run with ALL the
//   stored rows at the stored run's own clock; reproducing the stored score exactly earns a label naming
//   the rows that differ: NORM (median), NORM (slope), NORM (anchor), NORM (median, slope), and so on.
//   A recomputation that does not reproduce it leaves the line UNEXPLAINED, with the attempt printed.
//
// Day 17 run 3 §2 — `--against YYYY-MM-DD` moves the comparison target: the stored side becomes, per
// listing, its latest listing_scores row with scored_at on that day or earlier (UTC), instead of what
// listings holds now. Nothing is re-scored and nothing is written; the engine version is untouched.
//
// Day 14 run B (BRIEF rules v5, §6.2): the derived copy columns condition_score and confidence are gone from
// both tables, so neither statement writes them. Nothing else about the write changed — the invoice is
// untouched, ENGINE_VERSION stays 3, and the invoice keeps carrying the condition sum and the confidence
// level exactly as before. The classifier's STORED side now reads those two out of listings.score_breakdown
// instead of out of the columns; its printed lines are unchanged.

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { GROUP_VERSION, groupKey, type GroupFields } from "@/lib/comparison-group";
import { scoreListing, type ScoreResult, type ScoringInput } from "@/lib/scoring";
import { ENGINE_VERSION, MIN_SAMPLE } from "@/lib/scoring/constants";
import { tallyCheckKinds } from "@/lib/scoring/check-kinds";
import {
  classify, fmt, storedRowValue, storedSums, versionExpectation,
  DATA_COVERS, DATA_MISSING, LABELS, LABEL_WIDTH, ROUNDING_ALLOWANCE,
  type Label, type NormKind, type NormRows, type StoredBreakdown, type VersionCheck,
} from "@/lib/scoring/regression";
import { round } from "@/lib/scoring/util";
import { scoringSubject } from "@/lib/scoring-input";

const WRITE = process.argv.includes("--write");
const PLATES = (() => {
  const a = process.argv.find((x) => x.startsWith("--plates="));
  return a ? a.slice("--plates=".length).split(",").map((p) => p.trim()).filter(Boolean) : [];
})();
// Day 17 §2: the comparison target. Parsed inside main() so a malformed date stops the run through the
// same STOPPED path as everything else. `--against 2026-09-11` and `--against=2026-09-11` both read.
type Against = { day: string; before: Date };
function parseAgainst(): Against | null {
  const i = process.argv.indexOf("--against");
  const raw = i >= 0 ? process.argv[i + 1] : process.argv.find((x) => x.startsWith("--against="))?.slice("--against=".length);
  if (raw === undefined) return null;
  const t = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error(`--against: expected YYYY-MM-DD, got ${JSON.stringify(raw)}`);
  const day = new Date(`${t}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) throw new Error(`--against: not a real date: ${JSON.stringify(t)}`);
  // "on that day or earlier" = strictly before the next midnight UTC.
  return { day: t, before: new Date(day.getTime() + 24 * 60 * 60 * 1000) };
}
const REPORT_FILE = "REPORT-score-listings.md"; // §22.3: never REPORT.md

type Scored = {
  listing_id: number;
  plate: string;
  year: number;
  price: number;
  cell_key: string; // "comparison_group year" — the per-cell VERSION constant is checked over this
  group: string | null; // models.comparison_group — the key a stored cell row is looked up by
  make: string | null;
  model: string | null;
  market_stats_id: number | null;
  model_stats_id: number | null; // Day 14 §6.2: the score points at the row it used from each level
  pool_stats_id: number | null;
  input: ScoringInput; // kept for the §1 CLOCK check: the same inputs, a different `now`
  result: ScoreResult;
  // Day 13 §1: what listings holds now — the classifier compares against all of it. Day 14 run B: score comes
  // from the column (it stays); condition_score and the confidence level come out of the stored invoice, which is
  // where they have always also been — §3 proved the two agreed on all 918 rows before the columns were dropped.
  stored: {
    score: number | null;
    condition_score: number | null;
    confidence: string | null;
    engine_version: number | null;
    scored_at: Date | null;
    breakdown: unknown; // listings.score_breakdown — a stored ScoreResult
    // Day 17 §2: the norm rows the stored score actually used. The composed NORM identity re-runs the
    // engine with exactly these rows, so the label is earned by recomputation rather than inferred.
    market_stats_id: number | null;
    model_stats_id: number | null;
    pool_stats_id: number | null;
  };
};
type Failed = { listing_id: number; plate: string; error: string };

const out: string[] = [];
function log(line = "") {
  out.push(line);
  console.log(line);
}
function count<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

async function main() {
  const now = new Date();
  const AGAINST = parseAgainst();
  log(`${WRITE ? "" : "[DRY RUN] "}score-listings - now = ${now.toISOString()}, engine_version = ${ENGINE_VERSION}, group_version = ${GROUP_VERSION}`);
  log(
    AGAINST === null
      ? `comparison target: the latest score, as listings holds it now (no --against)`
      : `comparison target: --against ${AGAINST.day} - per listing, its latest listing_scores row with scored_at before ${AGAINST.before.toISOString()} (that day or earlier, UTC)`,
  );

  const listings = await db.listings.findMany({
    where: { delisted_at: null },
    include: { car: { include: { model: true } }, dealer: { select: { dealer_type: true } } },
    orderBy: { id: "asc" },
  });

  // ---------- 1. the three norm levels (§6.1) ----------
  const norms = new Map<string, Awaited<ReturnType<typeof db.market_stats.findFirst>>>();
  async function normRow(group: string, year: number) {
    const k = `${group} ${year}`;
    if (!norms.has(k)) {
      norms.set(k, await db.market_stats.findFirst({
        where: { comparison_group: group, year, group_version: GROUP_VERSION },
        orderBy: [{ computed_at: "desc" }, { id: "desc" }],
      }));
    }
    return norms.get(k) ?? null;
  }
  const modelNorms = new Map<string, Awaited<ReturnType<typeof db.model_stats.findFirst>>>();
  async function modelRow(make: string, model: string) {
    const k = `${make}|${model}`;
    if (!modelNorms.has(k)) {
      modelNorms.set(k, await db.model_stats.findFirst({
        where: { make, model, group_version: GROUP_VERSION },
        orderBy: [{ computed_at: "desc" }, { id: "desc" }],
      }));
    }
    return modelNorms.get(k) ?? null;
  }
  // P3: pool_stats carries no group_version — the curve is measured per model-year, not per cell.
  const poolNormRow = await db.pool_stats.findFirst({ orderBy: [{ computed_at: "desc" }, { id: "desc" }] });

  // ---------- Day 17 §2: the stored side the classifier compares against ----------
  // Without --against it is the listings row itself — the latest score, as it has always been. With
  // --against it is, per listing, the latest listing_scores row of that day or earlier; a listing with
  // no such row has no stored score at all and takes NEW, exactly as an unscored listing does.
  type Stored = Scored["stored"];
  const NO_STORED: Stored = {
    score: null, condition_score: null, confidence: null, engine_version: null,
    scored_at: null, breakdown: null, market_stats_id: null, model_stats_id: null, pool_stats_id: null,
  };
  const storedOf = new Map<number, Stored>();
  if (AGAINST !== null) {
    const rows = await db.listing_scores.findMany({
      where: { listing_id: { in: listings.map((l) => l.id) }, scored_at: { lt: AGAINST.before } },
      orderBy: [{ scored_at: "desc" }, { id: "desc" }],
    });
    for (const r of rows) {
      if (storedOf.has(r.listing_id)) continue; // ordered newest first: the first row per listing is the one
      storedOf.set(r.listing_id, {
        ...storedSums(r.breakdown), score: r.deal_score, engine_version: r.engine_version,
        scored_at: r.scored_at, breakdown: r.breakdown,
        market_stats_id: r.market_stats_id, model_stats_id: r.model_stats_id, pool_stats_id: r.pool_stats_id,
      });
    }
    log(`stored rows found at or before ${AGAINST.day}: ${storedOf.size} of ${listings.length} listings`);
  }
  const storedFor = (l: { id: number; score: number | null; score_breakdown: unknown; engine_version: number | null; scored_at: Date | null; market_stats_id: number | null; model_stats_id: number | null; pool_stats_id: number | null }): Stored =>
    AGAINST === null
      ? {
          ...storedSums(l.score_breakdown), score: l.score, engine_version: l.engine_version,
          scored_at: l.scored_at, breakdown: l.score_breakdown,
          market_stats_id: l.market_stats_id, model_stats_id: l.model_stats_id, pool_stats_id: l.pool_stats_id,
        }
      : storedOf.get(l.id) ?? NO_STORED;

  // The new-car price, joined exactly as select-three.ts and compute-market-stats.ts join it: the latest
  // published_at row of new_car_prices on (degem_code, sug_degem = vehicle_class, shnat_yitzur = year).
  type NewPriceKey = { degem_code: string; shnat_yitzur: number; sug_degem: string };
  const keyText = (k: NewPriceKey) => `${k.degem_code}|${k.shnat_yitzur}|${k.sug_degem}`;
  const wanted = new Map<string, NewPriceKey>();
  const listingPriceKey = new Map<number, string>();
  for (const l of listings) {
    const m = l.car.model;
    if (m.degem_code === null || m.vehicle_class === null || l.car.year === null) continue;
    const k: NewPriceKey = { degem_code: m.degem_code, shnat_yitzur: l.car.year, sug_degem: m.vehicle_class };
    wanted.set(keyText(k), k);
    listingPriceKey.set(l.id, keyText(k));
  }
  const priceRows = wanted.size
    ? await db.new_car_prices.findMany({ where: { OR: [...wanted.values()] }, orderBy: [{ published_at: "desc" }, { id: "desc" }] })
    : [];
  const latestNewPrice = new Map<string, { id: number; mehir: number }>();
  for (const r of priceRows) {
    const k = keyText(r);
    if (!latestNewPrice.has(k)) latestNewPrice.set(k, { id: r.id, mehir: r.mehir }); // first = latest published_at
  }
  const newPriceOf = (listingId: number) => {
    const k = listingPriceKey.get(listingId);
    return k === undefined ? null : latestNewPrice.get(k) ?? null;
  };

  // ---------- 2. score ----------
  const scored: Scored[] = [];
  const failed: Failed[] = [];
  let noGroup = 0; // models.comparison_group is null
  let noNorm = 0; // no market_stats row for (group, year)
  let noModelNorm = 0; // no model_stats row for (make, model)
  let keyMismatch = 0; // models.comparison_group differs from groupKey(fields) under the current version
  let staleNorm = 0; // §6.1: a norm row from an older engine_version, over ALL THREE tables — must be 0
  let noNewPrice = 0; // no new_car_prices row on the car's key

  for (const l of listings) {
    const plate = l.car.license_plate ?? "?";
    try {
      const m = l.car.model;
      const fields: GroupFields = {
        vehicle_class: m.vehicle_class, make: m.make, model: m.model, body_type: m.body_type, fuel_type: m.fuel_type,
        engine_size: m.engine_size, horsepower: m.horsepower, transmission: m.transmission, drive_type: m.drive_type, sub_model: m.sub_model,
      };
      if (m.comparison_group !== null && m.comparison_group !== groupKey(fields)) keyMismatch++;

      const newPrice = newPriceOf(l.id);
      if (newPrice === null) noNewPrice++;
      const subject = scoringSubject(l, l.car, l.dealer.dealer_type, newPrice);

      let market: ScoringInput["market"] = null;
      if (m.comparison_group === null) noGroup++;
      else {
        const n = await normRow(m.comparison_group, subject.car.year);
        if (n === null) noNorm++;
        else {
          if (n.engine_version !== ENGINE_VERSION) staleNorm++;
          market = {
            id: n.id, median_price: n.median_price, median_km: n.median_km, median_history: n.median_history,
            sample_size: n.sample_size, window_days: n.window_days, group_version: n.group_version, engine_version: n.engine_version,
          };
        }
      }
      // The model level. make / model come from the car's model row, as §6.1 names them.
      let model_stats: ScoringInput["model_stats"] = null;
      if (m.make !== null && m.model !== null) {
        const mr = await modelRow(m.make, m.model);
        if (mr === null) noModelNorm++;
        else {
          if (mr.engine_version !== ENGINE_VERSION) staleNorm++;
          model_stats = { id: mr.id, km_slope: mr.km_slope, km_slope_n: mr.km_slope_n };
        }
      }
      // The pool level: one row for the whole run.
      let pool_stats: ScoringInput["pool_stats"] = null;
      if (poolNormRow !== null) {
        if (poolNormRow.engine_version !== ENGINE_VERSION) staleNorm++;
        pool_stats = {
          id: poolNormRow.id,
          anchor_ratio_intercept: poolNormRow.anchor_ratio_intercept,
          anchor_ratio_per_year: poolNormRow.anchor_ratio_per_year,
          anchor_error_pct: poolNormRow.anchor_error_pct,
          anchor_age_min_years: poolNormRow.anchor_age_min_years,
          anchor_age_max_years: poolNormRow.anchor_age_max_years,
          anchor_n: poolNormRow.anchor_n,
          anchor_listings: poolNormRow.anchor_listings,
        };
      }

      const input: ScoringInput = { ...subject, market, model_stats, pool_stats };
      const result = scoreListing(input, now);
      scored.push({
        listing_id: l.id, plate, year: subject.car.year, price: l.price,
        cell_key: `${m.comparison_group ?? "(no group)"} ${subject.car.year}`,
        group: m.comparison_group, make: m.make, model: m.model,
        market_stats_id: market?.id ?? null, model_stats_id: model_stats?.id ?? null, pool_stats_id: pool_stats?.id ?? null,
        input, result,
        stored: storedFor(l),
      });
    } catch (e) {
      failed.push({ listing_id: l.id, plate, error: (e as Error).message });
    }
  }

  // ---------- 3. report ----------
  log(`listings (delisted_at is null): ${listings.length}; scored: ${scored.length}; threw: ${failed.length}`);
  log(`no cell row: ${noNorm}; no model row: ${noModelNorm}; pool row: ${poolNormRow === null ? "none" : `id ${poolNormRow.id}`}; model without comparison_group: ${noGroup}; comparison_group != groupKey(fields): ${keyMismatch}`);
  log(`norm row from an older engine (all three tables): ${staleNorm} (must be 0); listings with no new-car price: ${noNewPrice}`);

  log(`\n===== TOP 10 BY deal_score (nulls last) =====`);
  log("plate | year | price | price_adv | history | km | condition | typical | deal | confidence | sold");
  const ranked = [...scored].sort((a, b) => {
    const x = a.result.deal_score, y = b.result.deal_score;
    if (x === null && y === null) return a.listing_id - b.listing_id;
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || a.listing_id - b.listing_id;
  });
  for (const s of ranked.slice(0, 10)) {
    const r = s.result;
    const row = (name: string) => r.rows.find((x) => x.row === name);
    log(`${s.plate} | ${s.year} | ${s.price} | ${fmt(r.price_advantage)} | ${fmt(row("history")?.value)} | ${fmt(row("km")?.value)} | ${fmt(r.condition_score)} | ${fmt(r.typical_history)} | ${fmt(r.deal_score)} | ${r.confidence.level} | ${r.sold_signal.strength ?? "-"}`);
  }

  log(`\n===== COUNTS =====`);
  log("by confidence level");
  for (const [k, n] of count(scored, (s) => s.result.confidence.level)) log(`  ${n.toString().padStart(4)}  ${k}`);
  log("by check kind (check: status[:kind|reason])");
  for (const [k, n] of tallyCheckKinds(scored.map((s) => s.result))) log(`  ${n.toString().padStart(4)}  ${k}`);
  log("by sold_signal strength");
  for (const [k, n] of count(scored, (s) => s.result.sold_signal.strength ?? "null")) log(`  ${n.toString().padStart(4)}  ${k}`);
  log("by unavailable reason per row");
  const unavailable = scored.flatMap((s) => s.result.rows.filter((r) => r.status === "unavailable").map((r) => `${r.row}: ${r.reason}`));
  for (const [k, n] of count(unavailable, (x) => x)) log(`  ${n.toString().padStart(4)}  ${k}`);
  log("deal_score present");
  log(`  ${scored.filter((s) => s.result.deal_score !== null).length.toString().padStart(4)}  scored`);
  log(`  ${scored.filter((s) => s.result.deal_score === null).length.toString().padStart(4)}  null`);

  // The two §6.4 populations, defined once: the classifier's sub-rule counts are checked against them
  // below and the §6.4 sections print them, so the two can never drift apart.
  const noHistory = scored.filter((s) => s.input.car.ownership_history === null);
  const thin = scored.filter((s) => s.input.market !== null && s.input.market.sample_size < MIN_SAMPLE);

  // ---------- Day 17 run 4 §2: the norm rows the stored scores used ----------
  // The script's whole part in the composed identity is this: load the rows. Per listing and per level,
  // the row the stored score points at by id; where that id is null, the row that was current at the
  // stored scored_at (the latest computed_at at or before it, at the same key). A dangling id — one whose
  // row is gone from its table — is recorded rather than read as "there was no row": the module then says
  // the identity cannot be checked and the line stays UNEXPLAINED.
  type CellRow = NonNullable<Awaited<ReturnType<typeof db.market_stats.findFirst>>>;
  type ModelRow = NonNullable<Awaited<ReturnType<typeof db.model_stats.findFirst>>>;
  type PoolRow = NonNullable<Awaited<ReturnType<typeof db.pool_stats.findFirst>>>;
  const idsOf = (pick: (x: Scored) => number | null) => [...new Set(scored.map(pick).filter((x): x is number => x !== null))];
  const byId = <T extends { id: number }>(rows: T[]) => new Map<number, T>(rows.map((r) => [r.id, r]));
  const storedCellRows = byId(await db.market_stats.findMany({ where: { id: { in: idsOf((x) => x.stored.market_stats_id) } } }));
  const storedModelRows = byId(await db.model_stats.findMany({ where: { id: { in: idsOf((x) => x.stored.model_stats_id) } } }));
  const storedPoolRows = byId(await db.pool_stats.findMany({ where: { id: { in: idsOf((x) => x.stored.pool_stats_id) } } }));
  const asMarket = (r: CellRow): NonNullable<ScoringInput["market"]> => ({
    id: r.id, median_price: r.median_price, median_km: r.median_km, median_history: r.median_history,
    sample_size: r.sample_size, window_days: r.window_days, group_version: r.group_version, engine_version: r.engine_version,
  });
  const asModelStats = (r: ModelRow): NonNullable<ScoringInput["model_stats"]> => ({ id: r.id, km_slope: r.km_slope, km_slope_n: r.km_slope_n });
  const asPool = (r: PoolRow): NonNullable<ScoringInput["pool_stats"]> => ({
    id: r.id, anchor_ratio_intercept: r.anchor_ratio_intercept, anchor_ratio_per_year: r.anchor_ratio_per_year,
    anchor_error_pct: r.anchor_error_pct, anchor_age_min_years: r.anchor_age_min_years,
    anchor_age_max_years: r.anchor_age_max_years, anchor_n: r.anchor_n, anchor_listings: r.anchor_listings,
  });

  // "the row current at the stored scored_at" — one query per (key, moment), cached.
  const cellAt = new Map<string, CellRow | null>();
  async function cellRowAt(group: string, year: number, at: Date): Promise<CellRow | null> {
    const k = `${group}|${year}|${at.toISOString()}`;
    if (!cellAt.has(k)) {
      cellAt.set(k, await db.market_stats.findFirst({
        where: { comparison_group: group, year, group_version: GROUP_VERSION, computed_at: { lte: at } },
        orderBy: [{ computed_at: "desc" }, { id: "desc" }],
      }));
    }
    return cellAt.get(k) ?? null;
  }
  const modelAt = new Map<string, ModelRow | null>();
  async function modelRowAt(make: string, model: string, at: Date): Promise<ModelRow | null> {
    const k = `${make}|${model}|${at.toISOString()}`;
    if (!modelAt.has(k)) {
      modelAt.set(k, await db.model_stats.findFirst({
        where: { make, model, group_version: GROUP_VERSION, computed_at: { lte: at } },
        orderBy: [{ computed_at: "desc" }, { id: "desc" }],
      }));
    }
    return modelAt.get(k) ?? null;
  }
  const poolAt = new Map<string, PoolRow | null>();
  async function poolRowAt(at: Date): Promise<PoolRow | null> {
    const k = at.toISOString();
    if (!poolAt.has(k)) {
      poolAt.set(k, await db.pool_stats.findFirst({ where: { computed_at: { lte: at } }, orderBy: [{ computed_at: "desc" }, { id: "desc" }] }));
    }
    return poolAt.get(k) ?? null;
  }

  const storedNorms = new Map<number, { norms: NormRows; missing: NormKind[] }>();
  let byPointer = 0, byMoment = 0, dangling = 0; // how each stored row was found — printed with the block
  for (const s of scored) {
    const when = s.stored.scored_at;
    const missing: NormKind[] = [];
    let median: ScoringInput["market"] = null;
    if (s.stored.market_stats_id !== null) {
      const r = storedCellRows.get(s.stored.market_stats_id);
      if (r === undefined) missing.push("median");
      else { median = asMarket(r); byPointer++; }
    } else if (when !== null && s.group !== null) {
      const r = await cellRowAt(s.group, s.year, when);
      if (r !== null) { median = asMarket(r); byMoment++; }
    }
    let slope: ScoringInput["model_stats"] = null;
    if (s.stored.model_stats_id !== null) {
      const r = storedModelRows.get(s.stored.model_stats_id);
      if (r === undefined) missing.push("slope");
      else { slope = asModelStats(r); byPointer++; }
    } else if (when !== null && s.make !== null && s.model !== null) {
      const r = await modelRowAt(s.make, s.model, when);
      if (r !== null) { slope = asModelStats(r); byMoment++; }
    }
    let anchor: ScoringInput["pool_stats"] = null;
    if (s.stored.pool_stats_id !== null) {
      const r = storedPoolRows.get(s.stored.pool_stats_id);
      if (r === undefined) missing.push("anchor");
      else { anchor = asPool(r); byPointer++; }
    } else if (when !== null) {
      const r = await poolRowAt(when);
      if (r !== null) { anchor = asPool(r); byMoment++; }
    }
    dangling += missing.length;
    storedNorms.set(s.listing_id, { norms: { median, slope, anchor }, missing });
  }

  // ---------- Day 13 §1: regression against the stored score, every difference classified ----------
  log(`\n===== REGRESSION vs ${AGAINST === null ? "listings" : `listing_scores at or before ${AGAINST.day}`} (score, condition_score, confidence; engine_version) =====`);
  log(`stored norm rows: ${byPointer} by the id the stored score carries, ${byMoment} by the row current at its scored_at, ${dangling} id(s) whose row is gone (must be 0)`);
  const labelled: { s: Scored; label: Label; head: string; detail: string[] }[] = [];
  for (const s of scored) {
    const sn = storedNorms.get(s.listing_id) ?? { norms: { median: null, slope: null, anchor: null }, missing: [] };
    const c = classify({
      make: s.make ?? "?", model: s.model ?? "?",
      result: s.result, input: s.input,
      norms: { median: s.input.market, slope: s.input.model_stats, anchor: s.input.pool_stats },
      stored: { ...s.stored, norms: sn.norms, missing: sn.missing },
      engine_version: ENGINE_VERSION,
      // The callback: the engine, this listing's current data, the norm rows and the clock it is asked for.
      scoreWith: (norms, at) => scoreListing({ ...s.input, market: norms.median, model_stats: norms.slope, pool_stats: norms.anchor }, at),
    });
    if (c !== null) labelled.push({ s, label: c.label, head: c.head, detail: c.detail });
  }
  const labelCount = (l: Label) => labelled.filter((x) => x.label === l).length;
  log(`regression count: ${labelCount("UNEXPLAINED")} (must be 0) = UNEXPLAINED only; ${LABELS.map((l) => `${l} ${labelCount(l)}`).join(", ")}; unchanged ${scored.length - labelled.length} of ${scored.length}`);
  log(`DATA compares the inputs the stored breakdown carries: ${DATA_COVERS.join("; ")}`);
  log(`DATA cannot see (not carried in the breakdown): ${DATA_MISSING.join("; ")}`);
  // Q13: each sub-rule must carry exactly the §6.4 population it was written for — no more, no fewer.
  // Day 14 run C (§0.15, run B's Q12): the two sub-rules only exist to describe a v2 -> v3 move, so on a
  // run where every stored engine_version already equals ENGINE_VERSION there is no VERSION line to
  // carry — and comparing 0 against the two populations reads as a MISMATCH that is not one. Say so
  // instead. The check itself is unchanged on any run that does have a version move to describe.
  const anchorCount = labelCount("VERSION (anchor)"), typicalCount = labelCount("VERSION (typical)");
  const versionMoved = scored.some((s) => s.stored.engine_version !== null && s.stored.engine_version !== ENGINE_VERSION);
  log(
    !versionMoved
      ? `Q13 sub-rules: n/a — same engine version (every stored score is already engine_version ${ENGINE_VERSION}, so no listing takes the VERSION label; the populations they describe are ${thin.length} thin-cell listings and ${noHistory.length} cars with no ownership record)`
      : `Q13 sub-rules: VERSION (anchor) ${anchorCount} vs ${thin.length} thin-cell listings — ${anchorCount === thin.length ? "match" : "MISMATCH"}; ` +
          `VERSION (typical) ${typicalCount} vs ${noHistory.length} cars with no ownership record — ${typicalCount === noHistory.length ? "match" : "MISMATCH"}`,
  );
  for (const x of labelled) {
    log(`${x.label.padEnd(LABEL_WIDTH)} | listing ${x.s.listing_id} (${x.s.plate}) | ${x.head}`);
    for (const d of x.detail) log(`              ${d}`);
  }

  // §6.3: the per-cell constant, and the check that it is one number for the whole cell.
  log(`\n===== §6.3 PER-CELL CONSTANT (old typical_condition - new median_history) =====`);
  const byCell = new Map<string, { s: Scored; v: VersionCheck }[]>();
  for (const s of scored) {
    const bd = (s.stored.breakdown ?? null) as StoredBreakdown | null;
    if (s.stored.engine_version === null || s.stored.engine_version === ENGINE_VERSION) continue;
    const v = versionExpectation({ stored_score: s.stored.score, result: s.result, input: s.input }, bd);
    if (!byCell.has(s.cell_key)) byCell.set(s.cell_key, []);
    (byCell.get(s.cell_key) as { s: Scored; v: VersionCheck }[]).push({ s, v });
  }
  log("cell | listings | constant | km term (distinct) | one constant?");
  let cellConstantBreaks = 0;
  for (const [cell, items] of [...byCell.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const consts = [...new Set(items.map((x) => x.v.constant).filter((c): c is number => c !== null))];
    const kms = [...new Set(items.map((x) => x.v.km_term).filter((k): k is number => k !== null))].sort((a, b) => a - b);
    const one = consts.length <= 1;
    if (!one) cellConstantBreaks++;
    log(`${cell} | ${items.length} | ${consts.length === 0 ? "-" : consts.map((c) => fmt(c)).join(" / ")} | ${kms.length === 0 ? "-" : kms.map((k) => fmt(k)).join(", ")} | ${one ? "yes" : "NO - the cell does not move as one"}`);
  }
  log(`cells whose constant is not a single number: ${cellConstantBreaks} (must be 0)`);
  const allowanceUsed = [...byCell.values()].flat().filter((x) => x.v.used_allowance);
  log(`VERSION lines that needed the ±${ROUNDING_ALLOWANCE} rounding allowance (Q11): ${allowanceUsed.length} of ${[...byCell.values()].flat().length}`);
  for (const x of allowanceUsed) log(`  listing ${x.s.listing_id} (${x.s.plate})`);

  // §6.3: Mazda keeps the default slope (69 listings < KM_SLOPE_MIN_SAMPLE) and has no car without a
  // registry record, so its km row and its history + km must be identical to v2.
  const mazda = scored.filter((s) => s.model === "MAZDA 3" && s.stored.engine_version !== null && s.stored.engine_version !== ENGINE_VERSION);
  const mazdaMoved = mazda.filter((s) => {
    const bd = (s.stored.breakdown ?? null) as StoredBreakdown | null;
    if (bd === null) return true;
    const cur = s.result.rows.find((r) => r.row === "km");
    const curKm = cur && cur.status === "scored" && typeof cur.value === "number" ? cur.value : null;
    return storedRowValue(bd, "km") !== curKm || s.stored.condition_score !== s.result.condition_score;
  });
  log(`§0.7 Mazda check: ${mazda.length} listing(s) compared; km row or history + km moved on ${mazdaMoved.length} (must be 0)`);
  for (const s of mazdaMoved) log(`  listing ${s.listing_id} (${s.plate}): condition_score ${fmt(s.stored.condition_score)} -> ${fmt(s.result.condition_score)}`);

  // ---------- §6.4 ----------
  log(`\n===== §6.4 CARS WITH NO REGISTRY HISTORY =====`);
  log(`listings whose car has no ownership record: ${noHistory.length}`);
  log("listing | plate | history source | value | note | confidence | deal");
  for (const s of noHistory) {
    const h = s.result.rows.find((r) => r.row === "history");
    log(`${s.listing_id} | ${s.plate} | ${h?.source ?? "-"} | ${fmt(h?.value)} | ${h?.note ?? h?.reason ?? "-"} | ${s.result.confidence.level} (${s.result.confidence.items.map((i) => i.kind).join(", ") || "no items"}) | ${fmt(s.result.deal_score)}`);
  }

  log(`\n===== §6.4 THIN-CELL LISTINGS (sample_size < MIN_SAMPLE) =====`);
  const thinWithDeal = thin.filter((s) => s.result.deal_score !== null);
  log(`thin-cell listings: ${thin.length}; of them with a deal score: ${thinWithDeal.length} (must be 0 — §0.5)`);
  log("listing | plate | cell | sample_size | price row | anchor / why not | pool_stats_id");
  for (const s of thin) {
    const p = s.result.rows.find((r) => r.row === "price");
    const anchored = p?.status === "scored";
    const why = anchored ? `anchor ${fmt(typeof p?.raw.anchor === "number" ? round(p.raw.anchor as number) : null)} (ratio ${String(p?.raw.ratio ?? "-")}, age ${typeof p?.raw.age === "number" ? (p.raw.age as number).toFixed(2) : "-"})` : String(p?.raw.anchor_unavailable ?? p?.reason ?? "-");
    log(`${s.listing_id} | ${s.plate} | ${s.cell_key} | ${s.input.market?.sample_size ?? "-"} | ${anchored ? `${fmt(p?.value)} (${p?.source})` : `unavailable (${p?.reason})`} | ${why} | ${s.pool_stats_id ?? "null"}`);
  }

  log(`\n===== §6.4 SLOPE SOURCE AND THE POOL ROW =====`);
  const slopeSource = scored.map((s) => {
    const km = s.result.rows.find((r) => r.row === "km");
    return `${String(km?.raw?.slope_source ?? "-")} (slope ${String(km?.raw?.slope_used ?? "-")}, n ${String(km?.raw?.km_slope_n ?? "-")})`;
  });
  for (const [k, n] of count(slopeSource, (x) => x)) log(`  ${n.toString().padStart(4)}  ${k}`);
  log(
    poolNormRow === null
      ? "pool row used: none — no pool_stats row exists, so every thin-cell price row reports no_anchor_curve"
      : `pool row used: id ${poolNormRow.id}, intercept ${poolNormRow.anchor_ratio_intercept}, per_year ${poolNormRow.anchor_ratio_per_year}, error_pct ${poolNormRow.anchor_error_pct}, age ${poolNormRow.anchor_age_min_years} … ${poolNormRow.anchor_age_max_years}, n ${poolNormRow.anchor_n} model-year points over ${poolNormRow.anchor_listings} listings, engine_version ${poolNormRow.engine_version}`,
  );

  log(`\n===== REALITY DELTA (condition_by_reality !== condition_score) =====`);
  const historyOf = (s: Scored) => s.result.rows.find((r) => r.row === "history")!;
  const zeroKm = scored.filter((s) => historyOf(s).raw.zero_km_deal === true);
  const delta = scored.filter((s) => s.result.condition_by_reality !== s.result.condition_score);
  log(`zero-km cars in the pool: ${zeroKm.length}; listings with a reality delta: ${delta.length}`);
  log("listing | plate | history paper | history reality | delta (reality - paper)");
  for (const s of delta) {
    const h = historyOf(s);
    const d = typeof h.value === "number" && typeof h.value_by_reality === "number" ? Math.round((h.value_by_reality - h.value) * 10) / 10 : null;
    log(`${s.listing_id} | ${s.plate} | ${fmt(h.value)} | ${fmt(h.value_by_reality)} | ${fmt(d)}`);
  }

  if (PLATES.length) {
    log(`\n===== FULL RESULTS FOR --plates (${PLATES.length}) =====`);
    for (const p of PLATES) {
      const hits = scored.filter((s) => s.plate === p);
      if (hits.length === 0) {
        const f = failed.filter((x) => x.plate === p);
        log(`\n--- ${p}: ${f.length ? "threw: " + f.map((x) => x.error).join("; ") : "no live listing with this plate"}`);
        continue;
      }
      for (const s of hits) {
        log(`\n--- ${p} (listing ${s.listing_id}, year ${s.year}, price ${s.price}, market_stats_id ${s.market_stats_id ?? "null"})`);
        log(JSON.stringify(s.result, null, 2));
      }
    }
  }

  log(`\n===== THREW (${failed.length}) =====`);
  for (const f of failed) log(`listing ${f.listing_id} (${f.plate}): ${f.error}`);

  // ---------- 4. write ----------
  writeFileSync(REPORT_FILE, `# score-listings ${WRITE ? "--write" : "dry run"}\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`, "utf8");
  if (!WRITE) {
    console.log(`\n[DRY RUN] nothing written to the database; report written to ${REPORT_FILE}`);
    return;
  }
  // §22.2: one statement per table, inside one transaction, default timeout.
  const ids = scored.map((s) => s.listing_id);
  const deal = scored.map((s) => s.result.deal_score);
  const breakdown = scored.map((s) => JSON.stringify(s.result));
  const msid = scored.map((s) => s.market_stats_id);
  const mdid = scored.map((s) => s.model_stats_id);
  const plid = scored.map((s) => s.pool_stats_id);
  const n = await db.$transaction(async (tx) => {
    const ins = await tx.listing_scores.createMany({
      data: scored.map((s) => ({
        listing_id: s.listing_id, scored_at: now, engine_version: ENGINE_VERSION,
        market_stats_id: s.market_stats_id, model_stats_id: s.model_stats_id, pool_stats_id: s.pool_stats_id,
        deal_score: s.result.deal_score,
        breakdown: s.result as unknown as Prisma.InputJsonValue,
      })),
    });
    const upd = await tx.$executeRaw`
      UPDATE "listings" AS l SET
        "score" = v.score,
        "score_breakdown" = v.breakdown,
        "scored_at" = ${now},
        "market_stats_id" = v.market_stats_id,
        "model_stats_id" = v.model_stats_id,
        "pool_stats_id" = v.pool_stats_id,
        "engine_version" = ${ENGINE_VERSION},
        "updated_at" = ${now}
      FROM unnest(${ids}::int[], ${deal}::float8[], ${breakdown}::jsonb[], ${msid}::int[], ${mdid}::int[], ${plid}::int[])
        AS v(id, score, breakdown, market_stats_id, model_stats_id, pool_stats_id)
      WHERE l."id" = v.id`;
    if (ins.count !== scored.length || upd !== scored.length) {
      throw new Error(`write: expected ${scored.length} rows, inserted ${ins.count} listing_scores and updated ${upd} listings — rolled back`);
    }
    return upd;
  });
  console.log(`\nwrote ${n} listings and ${n} listing_scores rows; report written to ${REPORT_FILE}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
