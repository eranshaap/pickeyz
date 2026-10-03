// scripts/import-sheet.ts
// Imports the collection workbook (the Excel file named by SHEET_PATH in .env — two tabs, the cars and the
// manual spec) into models -> dealers -> cars -> listings, and model_specs. Day 12's rule holds in every
// mode: the run is a DRY RUN unless `--write` is given — it reads, fetches and reports, and writes nothing
// to the database. The one file it writes in every mode is failed-cars.csv in the project folder.
//
// Rules (Day 6):
// - The sheet is the first-seen observation: an existing listing is never updated here.
// - Unknown values stop the run. Only cancelled and not_found plates are counted and skipped;
//   a plate found in the inactive-vehicles dataset is imported like an active one (counted as car:inactive).
// - Ads without an asking price are counted, not imported — same reason as auctions.
// - dealers: private = one row per listing; business = normalized name -> same phone -> create.
//   No registry lookup here: corp_id / in_dealer_registry / registry_checked_at are set at onboarding.
// - cars: a listing fills an empty color, never overwrites; official snapshot fields are refreshed.
// - Day 18 (§7, §3.5): a NEW car also gets current_owner_type (registry baalut), registry_color (tzeva_rechev) and
//   color_changed (history 1 shnui_zeva_ind; null when there is no history-1 record). The existing-car path does not
//   touch them: filling them is refresh-cars.ts --from-cache, changing them is the refresh gate.
// - Day 11: a new listing writes its first listing_price_history row (price, first_seen_at); a car's
//   (mivchan_acharon_dt, km_at_last_test) reading is appended to car_test_readings when that test date is new.
//
// Day 17 — the observation layer:
// - `--seen YYYY-MM-DD` turns the run into an observation of the whole sheet: existing listings are
//   verified, re-priced, or delisted per the sheet's `ירד` column. Every rule lives in src/lib/observe.ts;
//   this file only maps rows to observations, calls it, and counts. Without `--seen` nothing changes:
//   the `ירד` column is ignored and an existing listing is still never touched.
// - G1 narrowed (15/09): a row this script cannot import — no asking price, or a plate the registry
//   reports cancelled / not_found — is outside the observation whatever its `ירד` value. It is
//   counted and listed under skipped:* exactly as before, never a stop and never a write.
// - R4′: an existing listing marked `לא` whose sheet row has no asking price has left our market
//   (the pool holds priced ads only) — delisted_at = seen, counted apart from the `כן` delistings.
//
// Day 19 (§8.5): a km change found by --seen carries the day it was observed; its screen line shows it.
//
// Day 19b (Run 22) — the workbook, the manual spec, the car that cannot enter, the place:
// - The workbook is read directly (src/lib/excel/read.ts via src/lib/sheet/): both tabs, the localities file,
//   every header and every row checked before any database or ministry call. A broken row stops the run.
// - A NEW listing passes the entry check first (entryCheck below): the place, the registry, the ad's year,
//   the version. A car that cannot enter is not a stop: it is written to failed-cars.csv with one reason,
//   counted under failed:*, and is outside the --seen observation. A not_found plate is now such a car;
//   a cancelled plate is still skipped:cancelled. An existing listing takes today's path unchanged.
// - A version missing from `models` is asked of the ministry's online catalog and, with --write, created
//   inside the car's own transaction (model:new). Once the ministry fails to answer, only cached plates
//   are tried and the rest are filed as not tried.
// - The listing's place: city and region from the localities file, written once at insert. Nothing writes
//   a dealer's region.
// - The manual spec: model_specs mirrors the "manual spec" tab, and models.model_spec_id points at the row
//   that describes each version (findCar-schema.md §18), in one transaction after the cars.
// - The end of the run lists the alerts: live versions with no manual spec, and catalog holes.

import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { db, WRITE_TRANSACTION_OPTIONS } from "@/lib/db";
import { Prisma, type model_specs, type models } from "@/generated/prisma/client";
import { getVehicleData, isPlateCached, type VehicleData } from "@/lib/mot/vehicle";
import { MotUnavailableError } from "@/lib/mot/fetch";
import { fetchCatalogVersion } from "@/lib/mot/catalog-lookup";
import { canonicalModelNames, nameKey as modelNameKey, translateCatalogRow, type ModelRow } from "@/lib/mot/catalog";
import { readWorkbook } from "@/lib/excel/read";
import { loadLocalities } from "@/lib/location/localities";
import { resolvePlace, type LocalityIndex, type PlaceResolution } from "@/lib/location/place";
import { normalizeName } from "@/lib/names";
import { newPublicId } from "@/lib/public-id";
import {
  absentFromSheet, apply as applyObservation, checkDelistedColumn, decide,
  firstPriceObservedAt, lastVerifiedAtOnInsert, parseSeen,
  type Decision, type ListingState, type Observation, type Violation,
} from "@/lib/observe";
import { CARS_TAB, readCarsTab, type CarsRow } from "@/lib/sheet/cars-tab";
import { SPEC_TAB, readSpecTab, specKey, type ManualSpec } from "@/lib/sheet/spec-tab";
import { specCandidateWhere, specMatches, type SpecMatchModel } from "@/lib/sheet/spec-match";
import { catalogHoleLine, catalogHoles, missingSpecLine, type LiveVersion } from "@/lib/sheet/alerts";
import {
  FAILED_CARS_PATH, failedCarsCsv, yearMismatchDetails, type FailedCar, type FailedReason,
} from "@/lib/sheet/failed-cars";

// `--seen YYYY-MM-DD` (or `--seen=YYYY-MM-DD`). Absent -> null, and the run behaves exactly as before.
const SEEN_ARG = ((): string | null => {
  const i = process.argv.indexOf("--seen");
  if (i >= 0) return process.argv[i + 1] ?? "";
  const eq = process.argv.find((a) => a.startsWith("--seen="));
  return eq ? eq.slice("--seen=".length) : null;
})();

// Day 12, in every mode: dry by default, `--write` is the only thing that writes.
const DRY = !process.argv.includes("--write");

// --expect-model "MAZDA 3": the registry's commercial model name every row must carry.
// The flag may be repeated — `--expect-model "MAZDA 3" --expect-model "IONIQ HYBRID"`
// (or `--expect-model=A`): a row passes when its registry model equals ANY of the values.
// With no flag, no model check is made. Day 19b: a NEW row that fails it is a car that cannot
// enter (unexpected_model); an existing listing that fails it still stops the run.
const EXPECT_MODELS = ((): string[] => {
  const values: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === "--expect-model") {
      const value = process.argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--expect-model: missing value");
      values.push(value);
    } else if (a.startsWith("--expect-model=")) {
      const value = a.slice("--expect-model=".length);
      if (!value) throw new Error("--expect-model: missing value");
      values.push(value);
    }
  });
  return values;
})();

// Day 19b Run 22 §9.1: the three flags above and nothing else. A stray argument stops the run by name.
function checkArgs(argv: string[]): void {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") continue;
    if (a === "--seen" || a === "--expect-model") { i++; continue; } // the value was read above
    if (a.startsWith("--seen=") || a.startsWith("--expect-model=")) continue;
    throw new Error(`unknown argument ${JSON.stringify(a)} — the arguments are --write, --seen YYYY-MM-DD, --expect-model <name>`);
  }
}

// Both sides are compared uppercased and without spaces.
function modelKey(s: string): string {
  return (s ?? "").toUpperCase().replace(/\s+/g, "");
}

function fail(n: number, msg: string): never {
  throw new Error(`row ${n}: ${msg}`);
}

// ---------- 1. writing, with a memory of what a dry run "would" have created ----------
type Tx = Prisma.TransactionClient;
type DealerLike = { id: number; name: string; dealer_type: string; phone: string | null };
const pendingDealers: DealerLike[] = [];
const pendingCars = new Map<string, { id: number; color: string | null }>();
let fakeId = -1;

// Day 19b Run 22 §9.5.e: versions found in the ministry's online catalog during this run, by identity
// (vehicle_class|degem_code|year). `id` is fake until --write creates the row inside a car's transaction.
type PendingModel = { id: number; data: ModelRow; created: boolean; counted: boolean };
const pendingModels = new Map<string, PendingModel>();

function nameKey(s: string): string {
  return normalizeName(s).toLowerCase();
}

async function createDealer(tx: Tx, data: Prisma.dealersCreateInput): Promise<number> {
  if (DRY) {
    const d = { id: fakeId--, name: data.name, dealer_type: data.dealer_type, phone: data.phone ?? null };
    pendingDealers.push(d);
    return d.id;
  }
  return (await tx.dealers.create({ data })).id;
}

async function resolveDealer(tx: Tx, row: CarsRow): Promise<{ id: number; how: string }> {
  if (row.seller_type === "private") {
    const id = await createDealer(tx, {
      name: row.seller_name, dealer_type: "private", phone: row.phone,
    });
    return { id, how: "private:new" };
  }
  const businesses: DealerLike[] = [
    ...(await tx.dealers.findMany({ where: { dealer_type: { not: "private" } } })),
    ...pendingDealers.filter((d) => d.dealer_type !== "private"),
  ];
  const key = nameKey(row.seller_name);
  const byName = businesses.find((b) => nameKey(b.name) === key);
  if (byName) return { id: byName.id, how: "name" };
  if (row.phone) {
    const byPhone = businesses.find((b) => b.phone === row.phone);
    if (byPhone) return { id: byPhone.id, how: "phone" };
  }
  const id = await createDealer(tx, {
    name: row.seller_name, dealer_type: row.seller_type, phone: row.phone,
  });
  return { id, how: "new" };
}

function dateOrNull(s: string | null): Date | null {
  return s ? new Date(`${s}T00:00:00.000Z`) : null;
}

async function upsertCar(tx: Tx, row: CarsRow, v: VehicleData, model_id: number): Promise<{ id: number; created: boolean }> {
  const official = {
    year: v.year,
    hand: v.hand,
    ownership_history: (v.ownership_history ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue,
    test_expiry: dateOrNull(v.test_expiry),
    mivchan_acharon_dt: dateOrNull(v.mivchan_acharon_dt),
    km_at_last_test: v.km_at_last_test,
    first_registration: dateOrNull(v.first_registration),
  };
  const existing = (await tx.cars.findUnique({ where: { license_plate: v.license_plate } })) ?? pendingCars.get(v.license_plate) ?? null;
  if (existing) {
    const patch = { ...official, ...(existing.color ? {} : { color: row.color ?? v.color }) };
    if (!DRY) {
      await tx.cars.update({ where: { id: existing.id }, data: patch });
      await recordTestReading(tx, existing.id, official.mivchan_acharon_dt, official.km_at_last_test);
    }
    return { id: existing.id, created: false };
  }
  const color = row.color ?? v.color;
  if (DRY) {
    const id = fakeId--;
    pendingCars.set(v.license_plate, { id, color });
    return { id, created: true };
  }
  // Day 18 (§3.5): the three registry fields on the create path only.
  const registry = { current_owner_type: v.ownership_current, registry_color: v.color, color_changed: v.color_changed };
  const c = await tx.cars.create({ data: { license_plate: v.license_plate, model_id, color, ...official, ...registry } });
  await recordTestReading(tx, c.id, official.mivchan_acharon_dt, official.km_at_last_test);
  return { id: c.id, created: true };
}

// Day 11 (§21): keep every (car, test date) reading. cars keeps the latest; this appends when the date is new.
async function recordTestReading(tx: Tx, car_id: number, test_date: Date | null, km: number | null): Promise<void> {
  if (test_date === null || km === null) return;
  const seen = await tx.car_test_readings.findUnique({ where: { car_id_test_date: { car_id, test_date } } });
  if (seen) return;
  await tx.car_test_readings.create({ data: { car_id, test_date, km, observed_at: new Date() } });
}

// ---------- 2. the entry check (Day 19b Run 22 §9.5) ----------
// A priced row whose listing is not in the database either enters, or is a car that cannot enter with ONE
// reason — the first step that fails, cheap checks first, the catalog last — or is a cancelled plate.
// Every ministry call of the script is in here or on the existing-listing path of the cars loop.

type Place = Extract<PlaceResolution, { ok: true }>;
type ModelRef = { kind: "stored"; row: models } | { kind: "pending"; key: string };
type EntryResult =
  | { ok: true; v: VehicleData; status: "active" | "inactive"; model: ModelRef; place: Place }
  | { ok: false; failed: FailedCar }
  | { ok: false; skipped: "cancelled" };

// Loaded once in main(), read by checkEntry().
let localities: LocalityIndex = new Map();
const modelSpellings = new Map<string, string>();
// Set by the first MotUnavailableError: from then on only plates with a raw cache are read, and no
// catalog lookup is made — the rest are filed as ministry_down, not tried.
let ministryDown = false;

function markMinistryDown(e: MotUnavailableError): void {
  if (!ministryDown) console.log(`ministry down: ${e.message} — from here on only cached plates are tried`);
  ministryDown = true;
}

const entryMemo = new Map<CarsRow, Promise<EntryResult>>();

// Memoized per row: the G1 pre-pass and the cars loop ask nothing twice.
function entryCheck(row: CarsRow): Promise<EntryResult> {
  let r = entryMemo.get(row);
  if (!r) {
    r = checkEntry(row);
    entryMemo.set(row, r);
  }
  return r;
}

async function checkEntry(row: CarsRow): Promise<EntryResult> {
  const failed = (reason: FailedReason, details: string, v: VehicleData | null, not_tried = false): EntryResult => ({
    ok: false,
    failed: {
      plate: row.plate, link: row.link,
      registry_model: v ? `${v.registry.make} ${v.registry.model_name}` : null,
      registry_year: v ? v.year : null,
      reason, details, not_tried,
    },
  });

  // a. the place
  const place = resolvePlace(row.place_cell, localities);
  if (!place.ok) {
    return place.reason === "empty" ? failed("area_empty", "", null) : failed("city_unknown", place.written, null);
  }

  // b. the ministry is down and this plate has no cache: not tried
  if (ministryDown && !isPlateCached(row.plate)) return failed("ministry_down", "", null, true);

  // c. the registry (cache first, by the module itself). Any error but the ministry's silence stops the run.
  let lookup: Awaited<ReturnType<typeof getVehicleData>>;
  try {
    lookup = await getVehicleData(row.plate);
  } catch (e) {
    if (e instanceof MotUnavailableError) {
      markMinistryDown(e);
      return failed("ministry_down", "", null);
    }
    throw e;
  }
  if (lookup.status === "not_found") return failed("plate_not_in_registry", "", null);
  if (lookup.status === "cancelled") return { ok: false, skipped: "cancelled" };
  const v = lookup.data;
  const status = lookup.status;

  // d. the registry row: a model code, the expected models, the ad's year
  if (!v.degem_code) return failed("no_degem_code", "", v);
  if (EXPECT_MODELS.length > 0 && !EXPECT_MODELS.some((m) => modelKey(m) === modelKey(v.registry.model_name))) {
    return failed("unexpected_model", `${v.registry.make} ${v.registry.model_name}`, v);
  }
  if (row.ad_year !== null && row.ad_year !== v.year) return failed("year_mismatch", yearMismatchDetails(row.ad_year, v.year), v);

  // e. the version: stored, found online earlier in this run, or asked of the online catalog now
  const ok = (model: ModelRef): EntryResult => ({ ok: true, v, status, model, place });
  const stored = await db.models.findUnique({
    where: { vehicle_class_degem_code_year: { vehicle_class: v.vehicle_class, degem_code: v.degem_code, year: v.year } },
  });
  if (stored) return ok({ kind: "stored", row: stored });
  const identity = `${v.vehicle_class}|${v.degem_code}|${v.year}`;
  if (pendingModels.has(identity)) return ok({ kind: "pending", key: identity });
  if (ministryDown) return failed("ministry_down", "", v, true);

  // makeDegemCode joins two positive integers as "t-d"; the catalog lookup takes the two halves.
  const halves = v.degem_code.split("-");
  if (halves.length !== 2) fail(row.n, `${row.plate}: degem_code ${JSON.stringify(v.degem_code)} is not "tozeret_cd-degem_cd"`);
  const [tozeretCd, degemCd] = halves;
  let answer: Awaited<ReturnType<typeof fetchCatalogVersion>>;
  try {
    answer = await fetchCatalogVersion({ vehicleClass: v.vehicle_class, tozeretCd, degemCd, year: v.year });
  } catch (e) {
    if (e instanceof MotUnavailableError) {
      markMinistryDown(e);
      return failed("ministry_down", "", v);
    }
    throw e;
  }
  if (answer.kind === "absent") return failed("version_not_in_catalog", `${v.vehicle_class} ${v.degem_code} ${v.year}`, v);

  // The model spelled as its stored siblings are; a model with no stored row yet takes the row's own
  // canonical spelling (empty when the row has no model name, exactly as buildModelRows does).
  const key = modelNameKey(answer.row.kinuy_mishari);
  const modelName = modelSpellings.get(key) ?? canonicalModelNames([answer.row]).canon.get(key) ?? "";
  let data: ModelRow;
  try {
    data = translateCatalogRow(answer.row, modelName);
  } catch (e) {
    return failed("catalog_translation", (e as Error).message, v);
  }
  const got = `${data.vehicle_class}|${data.degem_code}|${data.year}`;
  if (got !== identity) fail(row.n, `${row.plate}: the catalog answered ${got} for ${identity}`);
  pendingModels.set(identity, { id: fakeId--, data, created: false, counted: false });
  return ok({ kind: "pending", key: identity });
}

// The few models fields the cars loop reads, from a stored row or a pending one.
function modelFields(m: ModelRef): { comparison_group: string | null; body_type: string | null; sub_model: string | null } {
  return m.kind === "stored" ? m.row : pendingModels.get(m.key)!.data;
}

// ---------- 3. the manual spec (Day 19b Run 22 §9.6) ----------
const SPEC_MODEL_SELECT = {
  id: true, model_spec_id: true, vehicle_class: true, degem_code: true,
  make: true, model: true, body_type: true, year: true, engine_size: true,
  drive_technology: true, fuel_type: true, drive_type: true, sub_model: true,
} as const;
type SpecModel = SpecMatchModel & { id: number; model_spec_id: number | null; vehicle_class: string | null; degem_code: string | null };

const versionName = (m: { vehicle_class: string | null; degem_code: string | null; year: number | null }) =>
  `(${m.vehicle_class ?? "?"}, ${m.degem_code ?? "?"}, ${m.year ?? "?"})`;

function specValues(spec: ManualSpec) {
  return {
    length_mm: spec.length_mm, width_mm: spec.width_mm, height_mm: spec.height_mm,
    trunk_liters: spec.trunk_liters, tank_liters: spec.tank_liters, km_per_liter: spec.km_per_liter,
    carzone_url: spec.carzone_url, source_date: new Date(`${spec.source_date}T00:00:00.000Z`),
  };
}

function sameValues(stored: model_specs, spec: ManualSpec): boolean {
  return (
    stored.length_mm === spec.length_mm && stored.width_mm === spec.width_mm && stored.height_mm === spec.height_mm &&
    stored.trunk_liters === spec.trunk_liters && stored.tank_liters === spec.tank_liters &&
    stored.km_per_liter === spec.km_per_liter && stored.carzone_url === spec.carzone_url &&
    (stored.source_date ? stored.source_date.toISOString().slice(0, 10) : null) === spec.source_date
  );
}

// Returns the ids of the models rows a tab row describes once the sync is done (dry: would describe).
async function syncSpecs(specs: ManualSpec[], storedSpecs: model_specs[]): Promise<Set<number>> {
  // The diff, by identity.
  const storedByKey = new Map<string, model_specs>();
  for (const s of storedSpecs) {
    const k = specKey(s);
    const twin = storedByKey.get(k);
    if (twin) throw new Error(`model_specs: rows ${twin.id} and ${s.id} have the same identity — nothing written`);
    storedByKey.set(k, s);
  }
  type Plan = { spec: ManualSpec; stored: model_specs | null; action: "create" | "update" | "unchanged" };
  const plans: Plan[] = specs.map((spec) => {
    const stored = storedByKey.get(specKey(spec)) ?? null;
    const action = stored === null ? "create" : sameValues(stored, spec) ? "unchanged" : "update";
    return { spec, stored, action };
  });
  const usedKeys = new Set(specs.map(specKey));
  const deletes = storedSpecs.filter((s) => !usedKeys.has(specKey(s)));

  // The candidates: the column filter in the database, specMatches on what comes back; in a dry run, the
  // versions this run would create are matched in memory.
  const pending: SpecModel[] = DRY
    ? [...pendingModels.values()].map((p) => ({ ...p.data, id: p.id, model_spec_id: null }))
    : [];
  const keptBy = new Map<number, { spec: ManualSpec; model: SpecModel }>();
  const clashes: string[] = [];
  const perRow: { plan: Plan; candidates: number; kept: SpecModel[]; toPoint: SpecModel[] }[] = [];
  for (const plan of plans) {
    const found: SpecModel[] = await db.models.findMany({ where: specCandidateWhere(plan.spec), select: SPEC_MODEL_SELECT });
    const pendingKept = pending.filter((m) => specMatches(m, plan.spec));
    const kept = [...found.filter((m) => specMatches(m, plan.spec)), ...pendingKept];
    for (const m of kept) {
      const other = keptBy.get(m.id);
      if (other) clashes.push(`models ${versionName(m)} is described by tab rows ${other.spec.n} and ${plan.spec.n}`);
      else keptBy.set(m.id, { spec: plan.spec, model: m });
    }
    const toPoint = kept.filter((m) => plan.stored === null || m.model_spec_id !== plan.stored.id);
    perRow.push({ plan, candidates: found.length + pendingKept.length, kept, toPoint });
  }
  if (clashes.length > 0) {
    throw new Error(`${SPEC_TAB}: a models row matches two tab rows — nothing written to model_specs:\n  ${clashes.join("\n  ")}`);
  }

  // The pointers no tab row keeps any more.
  const pointed = await db.models.findMany({ where: { model_spec_id: { not: null } }, select: { id: true } });
  const unpoint = pointed.map((m) => m.id).filter((id) => !keptBy.has(id));
  const toPointCount = perRow.reduce((n, r) => n + r.toPoint.length, 0);

  if (!DRY) {
    await db.$transaction(async (tx) => {
      if (deletes.length > 0) await tx.model_specs.deleteMany({ where: { id: { in: deletes.map((d) => d.id) } } });
      for (const p of plans) {
        if (p.action === "update") await tx.model_specs.update({ where: { id: p.stored!.id }, data: specValues(p.spec) });
      }
      const specId = new Map<ManualSpec, number>();
      for (const p of plans) {
        if (p.stored !== null) { specId.set(p.spec, p.stored.id); continue; }
        const s = p.spec;
        const created = await tx.model_specs.create({
          data: {
            make: s.make, model: s.model, body_type: s.body_type, year: s.year, engine_size: s.engine_size,
            engine_type: s.engine_type, drive_type: s.drive_type, sub_models: s.sub_models, ...specValues(s),
          },
        });
        specId.set(s, created.id);
      }
      for (const r of perRow) {
        if (r.kept.length === 0) continue;
        await tx.models.updateMany({ where: { id: { in: r.kept.map((m) => m.id) } }, data: { model_spec_id: specId.get(r.plan.spec)! } });
      }
      if (unpoint.length > 0) await tx.models.updateMany({ where: { id: { in: unpoint } }, data: { model_spec_id: null } });
    }, WRITE_TRANSACTION_OPTIONS);
  }

  const count = (a: Plan["action"]) => plans.filter((p) => p.action === a).length;
  console.log(`\nspec: tab ${specs.length} · stored ${storedSpecs.length} · create ${count("create")} · update ${count("update")} · unchanged ${count("unchanged")} · delete ${deletes.length} · point ${toPointCount} · unpoint ${unpoint.length}`);
  for (const r of perRow) {
    console.log(`  row ${r.plan.spec.n}: candidates ${r.candidates} · kept ${r.kept.length} · to point ${r.toPoint.length}`);
  }
  if (deletes.length > 0) {
    console.log(`stored rows to delete (${deletes.length})`);
    for (const d of deletes) {
      console.log(`  id ${d.id}: ${[d.make, d.model, d.body_type, d.year, d.engine_size, d.engine_type, d.drive_type, d.sub_models.join(", ")].join(" · ")}`);
    }
  }
  return new Set(keptBy.keys());
}

// ---------- 4. the alert list (Day 19b Run 22 §9.8.4) ----------
const LIVE_SELECT = {
  ...SPEC_MODEL_SELECT,
  horsepower: true, doors: true, seats: true, transmission: true, airbags: true,
} as const;
type LiveRow = LiveVersion & { id: number; model_spec_id: number | null };

async function printAlerts(dryNewListings: { carId: number; modelId: number }[], keptIds: Set<number>): Promise<void> {
  // Live cars per version: cars with at least one listing not delisted, plus (dry) the cars this run would insert.
  const carsOf = new Map<number, Set<number>>();
  const add = (modelId: number, carId: number) => {
    if (!carsOf.has(modelId)) carsOf.set(modelId, new Set());
    carsOf.get(modelId)!.add(carId);
  };
  const live = await db.cars.findMany({ where: { listings: { some: { delisted_at: null } } }, select: { id: true, model_id: true } });
  for (const c of live) add(c.model_id, c.id);
  if (DRY) for (const n of dryNewListings) add(n.modelId, n.carId);

  const versions: LiveRow[] = await db.models.findMany({ where: { id: { in: [...carsOf.keys()].filter((id) => id > 0) } }, select: LIVE_SELECT });
  if (DRY) {
    for (const p of pendingModels.values()) {
      if (carsOf.has(p.id)) versions.push({ ...p.data, id: p.id, model_spec_id: null });
    }
  }
  const text = (s: string | null) => s ?? "";
  versions.sort((a, b) =>
    text(a.make).localeCompare(text(b.make)) || text(a.model).localeCompare(text(b.model)) ||
    (a.year ?? 0) - (b.year ?? 0) || text(a.sub_model).localeCompare(text(b.sub_model)));

  // After the sync a version has a spec exactly when a tab row keeps it; a dry run reads that from the sync's
  // plan ("to point" counts as pointed, "unpoint" as gone), a --write run from the database.
  const hasSpec = (v: LiveRow) => (DRY ? keptIds.has(v.id) : v.model_spec_id !== null);
  const missing: string[] = [];
  const holes: string[] = [];
  for (const v of versions) {
    const cars = carsOf.get(v.id)!.size;
    if (!hasSpec(v)) missing.push(missingSpecLine(v, cars));
    const h = catalogHoles(v);
    if (h.length > 0) holes.push(catalogHoleLine(v, h, cars));
  }
  console.log("\n===== ALERTS =====");
  console.log(`missing manual spec (${missing.length} versions)`);
  for (const l of missing.length > 0 ? missing : ["none"]) console.log(`  ${l}`);
  console.log(`\ncatalog holes (${holes.length} versions)`);
  for (const l of holes.length > 0 ? holes : ["none"]) console.log(`  ${l}`);
}

// ---------- 5. the run ----------
type Check = { plate: string; declared: number | null; official: number | null; test_dt: string | null; note: string };

// Day 17: the four listing fields an observation reads back, plus what identifies the row.
const LISTING_STATE = {
  id: true, source: true, external_id: true, price: true, km_declared: true,
  hand_declared: true, last_verified_at: true, delisted_at: true, first_seen_at: true,
} as const;

const key = (source: string, external_id: string) => `${source}|${external_id}`;

// Day 17: the counters block, printed for every --seen run. The labels are the brief's, verbatim.
function counterLine(label: string, n: number, note = ""): string {
  return `${label.padEnd(42)}${n}${note ? `   ${note}` : ""}`;
}

async function main() {
  checkArgs(process.argv.slice(2));

  // ---------- Day 19b §9.1–9.2: the workbook and the localities, all read before anything else ----------
  const sheetPath = (process.env.SHEET_PATH ?? "").trim();
  if (!sheetPath) throw new Error("SHEET_PATH is not set in .env — the path of the Excel workbook (the collection sheet)");
  const wb = await readWorkbook(sheetPath);
  console.log(`${DRY ? "[DRY RUN]" : "[WRITE]"} ${sheetPath}`);
  const specs = readSpecTab(wb);
  const { rows, headers } = readCarsTab(wb);
  localities = await loadLocalities();
  console.log(`${CARS_TAB}: ${rows.length} rows`);
  console.log(`${SPEC_TAB}: ${specs.length} rows`);
  console.log(`localities: ${localities.size}`);

  let seen: Date | null = null;
  if (SEEN_ARG !== null) {
    const parsed = parseSeen(SEEN_ARG, new Date());
    if (!parsed.ok) throw new Error(parsed.violation.message);
    seen = parsed.seen;
    const column = checkDelistedColumn(headers);
    if (!column.ok) throw new Error(column.violation.message);
  }

  // ---------- Day 19b §9.3: what the run loads once ----------
  const known = new Map<string, ListingState>();
  const sources = [...new Set(rows.map((r) => r.source))].sort();
  const stored = await db.listings.findMany({ where: { source: { in: sources } }, select: LISTING_STATE });
  for (const l of stored) known.set(key(l.source, l.external_id), l);
  let notInSheet: string[] = [];
  if (seen) {
    notInSheet = absentFromSheet(
      stored.map((l) => l.external_id),
      rows.map((r) => r.external_id),
    );
  }
  const storedSpecs = await db.model_specs.findMany();
  // The stored spelling of every model name, by its name key: a version arriving from the network is spelled
  // like its stored siblings. The catalog import writes one spelling per key; two is a stop.
  const spellings = await db.models.findMany({ where: { model: { not: null } }, select: { model: true }, distinct: ["model"] });
  const spellingClashes: string[] = [];
  for (const { model } of spellings) {
    const k = modelNameKey(model!);
    const had = modelSpellings.get(k);
    if (had !== undefined) spellingClashes.push(`${JSON.stringify(had)} and ${JSON.stringify(model)}`);
    else modelSpellings.set(k, model!);
  }
  if (spellingClashes.length > 0) {
    throw new Error(`models.model: two stored spellings under one name key — ${spellingClashes.join("; ")}`);
  }

  // ---------- Day 17: G1, every guard before any write ----------
  if (seen) {
    const offending: { row: CarsRow; violation: Violation }[] = [];
    for (const row of rows) {
      const existing = known.get(key(row.source, row.external_id)) ?? null;
      const observation = (importable: boolean): Observation =>
        ({ price: row.price, km: row.km, hand: row.hand, cell: row.delisted_cell, importable });
      // Importability costs a registry lookup, so the registry is asked only where its answer can
      // change the outcome: a row this pass would stop for being a new listing marked כן. Every other
      // row is decided on what the sheet says alone (a row without a price imports nothing either way).
      // Day 19b (§9.4): that answer is the entry check — a new row that cannot enter is outside the observation.
      let r = decide(existing, observation(row.price !== null), seen);
      if (!r.ok && r.violation.guard === "new_row_delisted") {
        r = decide(existing, observation((await entryCheck(row)).ok), seen);
      }
      if (!r.ok) offending.push({ row, violation: r.violation });
    }
    if (offending.length > 0) {
      console.log(`\nG1 — ${offending.length} row(s) stop the run; nothing was written:`);
      for (const o of offending) {
        console.log(`  row ${o.row.n} | ${o.row.link} | ${JSON.stringify(o.row.delisted_cell)} | ${o.violation.guard}: ${o.violation.message}`);
      }
      throw new Error(`G1: ${offending.length} row(s) — nothing written`);
    }
  }

  const obs = {
    new: 0, existing: 0, verified: 0, priceChanged: 0, kmHandChanged: 0,
    delistedNow: 0, priceRemoved: 0, alreadyDelisted: 0, findings: 0,
  };
  const wrote = { history: 0, price: 0, kmhand: 0, lastVerified: 0, delisted: 0 };
  const priceLines: string[] = [];
  const kmHandLines: string[] = [];
  const priceRemovedLines: string[] = [];
  const findingLines: string[] = [];
  const skippedLines: string[] = []; // the rows outside the observation, with their `ירד` value

  const tally = (row: CarsRow, d: Decision) => {
    if (d.outcome === "outside") return; // counted under skipped:* and listed there, not here
    if (d.outcome === "insert") { obs.new++; return; }
    obs.existing++;
    if (d.outcome === "verified") obs.verified++;
    if (d.outcome === "delist") obs.delistedNow++;
    if (d.outcome === "delist_price_removed") {
      obs.priceRemoved++;
      const was = known.get(key(row.source, row.external_id))?.price;
      priceRemovedLines.push(`  ${row.external_id} (${row.plate}): DB price ${was ?? "—"}, none in the sheet -> delisted`);
    }
    if (d.outcome === "already_delisted") obs.alreadyDelisted++;
    if (d.finding) { obs.findings++; findingLines.push(`  ${row.external_id} (${row.plate}): ${d.finding}`); }
    const kmHand: string[] = [];
    for (const w of d.writes) {
      if (w.field === "price") {
        obs.priceChanged++; wrote.price++; wrote.history++;
        priceLines.push(`  ${row.external_id} (${row.plate}): ${w.from} -> ${w.to}`);
      } else if (w.field === "km_declared" || w.field === "hand_declared") {
        wrote.kmhand++;
        // Day 19 (§8.5): a km change now carries the day it was observed, so the line shows it. A hand change
        // writes no date (§8.3) and its line is unchanged. The counters are untouched.
        kmHand.push(
          w.field === "km_declared"
            ? `km ${w.from ?? "—"} -> ${w.to} · observed ${w.observed_at.toISOString().slice(0, 10)}`
            : `hand ${w.from ?? "—"} -> ${w.to}`,
        );
      } else if (w.field === "last_verified_at") wrote.lastVerified++;
      else wrote.delisted++;
    }
    if (kmHand.length > 0) { obs.kmHandChanged++; kmHandLines.push(`  ${row.external_id} (${row.plate}): ${kmHand.join(" · ")}`); }
  };

  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const handMismatch: Check[] = [];
  const kmBelowTest: Check[] = [];
  const density = new Map<string, number>();
  const densityCode = new Map<string, number>();
  const seenCars = new Set<string>();
  const failed: FailedCar[] = [];
  const dryNewListings: { carId: number; modelId: number }[] = []; // the alert list's would-be live cars

  for (const [i, row] of rows.entries()) {
    const tag = `[${i + 1}/${rows.length}] ${row.plate}`;
    if (row.price === null) {
      // Not imported, exactly as before: an ad enters the pool with a price, so this row creates nothing.
      bump("skipped:no_price");
      // Day 17 (R4′): if it is already a listing, the missing price is the observation — the ad has
      // left the pool. No registry lookup is needed: the only write is delisted_at.
      const existing = seen ? known.get(key(row.source, row.external_id)) ?? null : null;
      if (seen && existing) {
        const r = decide(existing, { price: null, km: row.km, hand: row.hand, cell: row.delisted_cell, importable: false }, seen);
        if (!r.ok) fail(row.n, `${row.plate}: ${r.violation.message}`); // G1 already passed; the data moved under us
        if (!DRY) await db.$transaction((tx) => applyObservation(tx, r.decision));
        tally(row, r.decision);
        console.log(`${tag} no asking price | listing:existing ${r.decision.outcome}`);
        continue;
      }
      if (seen) skippedLines.push(`  row ${row.n} | ${row.external_id} (${row.plate}) | ירד ${JSON.stringify(row.delisted_cell)} | no asking price`);
      console.log(`${tag} skipped — no asking price`);
      continue;
    }

    let v: VehicleData;
    let status: "active" | "inactive";
    let model: ModelRef;
    let place: Place | null = null; // only a new listing is placed; an existing one keeps what it has

    if (known.has(key(row.source, row.external_id))) {
      // The existing listing: today's path, unchanged.
      const lookup = await getVehicleData(row.plate);
      if (lookup.status !== "active" && lookup.status !== "inactive") {
        // Day 17: same reason as a row without a price — an existing listing must not be silently skipped.
        if (seen) {
          fail(row.n, `${row.plate}: registry says ${lookup.status} but its listing already exists — no rule covers this row`);
        }
        bump(`skipped:${lookup.status}`);
        console.log(`${tag} skipped — ${lookup.status}`); continue;
      }
      // An inactive car carries the same registry fields; its expired tokef_dt is data, not a reason to skip.
      v = lookup.data;
      status = lookup.status;
      if (EXPECT_MODELS.length > 0 && !EXPECT_MODELS.some((m) => modelKey(m) === modelKey(v.registry.model_name))) {
        fail(row.n, `${row.plate}: expected model ${EXPECT_MODELS.map((m) => JSON.stringify(m)).join(" or ")}, registry says ${v.registry.make} ${v.registry.model_name}`);
      }
      if (!v.degem_code) fail(row.n, `${row.plate}: registry row without a degem_code`);
      const stored = await db.models.findUnique({
        where: { vehicle_class_degem_code_year: { vehicle_class: v.vehicle_class, degem_code: v.degem_code, year: v.year } },
      });
      if (!stored) fail(row.n, `${row.plate}: no models row for (${v.vehicle_class}, ${v.degem_code}, ${v.year}) — catalog import incomplete`);
      model = { kind: "stored", row: stored };
    } else {
      // Day 19b (§9.5): a new listing enters only through the entry check.
      const entry = await entryCheck(row);
      if (!entry.ok) {
        if ("skipped" in entry) {
          bump(`skipped:${entry.skipped}`);
          if (seen) skippedLines.push(`  row ${row.n} | ${row.external_id} (${row.plate}) | ירד ${JSON.stringify(row.delisted_cell)} | ${entry.skipped}`);
          console.log(`${tag} skipped — ${entry.skipped}`); continue;
        }
        const f = entry.failed;
        failed.push(f);
        bump(`failed:${f.reason}`);
        if (f.not_tried) bump(`failed:${f.reason}:not_tried`);
        if (seen) skippedLines.push(`  row ${row.n} | ${row.external_id} (${row.plate}) | ירד ${JSON.stringify(row.delisted_cell)} | not entering — ${f.reason}`);
        console.log(`${tag} not entering — ${f.reason}${f.details ? " — " + f.details : ""}`);
        continue;
      }
      ({ v, status, model, place } = entry);
    }

    // The sheet is a first-seen observation: a row whose listing already exists changes nothing.
    // The existence check therefore comes before resolveDealer(), which creates a dealers row
    // for every private seller — a re-run would otherwise leave one orphan per private row.
    const work = async (tx: Tx) => {
      // Day 19b (§9.7): a version found online is created first, inside this car's transaction, once.
      let model_id: number;
      if (model.kind === "pending") {
        const p = pendingModels.get(model.key)!;
        if (!DRY && !p.created) {
          p.id = (await tx.models.create({ data: p.data })).id;
          p.created = true;
        }
        if (!p.counted) { p.counted = true; bump("model:new"); }
        model_id = p.id;
      } else model_id = model.row.id;

      const car = await upsertCar(tx, row, v, model_id);
      const exists = await tx.listings.findUnique({ where: { source_external_id: { source: row.source, external_id: row.external_id } } });
      if (exists) {
        // Day 17: without --seen an existing listing still changes nothing.
        if (!seen) return { dealer: null, car, model_id, listing: "existing", decision: null };
        const r = decide(exists, { price: row.price, km: row.km, hand: row.hand, cell: row.delisted_cell, importable: true }, seen);
        if (!r.ok) fail(row.n, `${row.plate}: ${r.violation.message}`); // G1 already passed; the data moved under us
        if (!DRY) await applyObservation(tx, r.decision);
        return { dealer: null, car, model_id, listing: "existing", decision: r.decision };
      }
      if (place === null) fail(row.n, `${row.plate}: its listing was in the database at the start of the run and is gone now`);
      const dealer = await resolveDealer(tx, row);
      if (!DRY) {
        const first_seen_at = new Date(`${row.first_seen}T00:00:00.000Z`);
        const created = await tx.listings.create({
          data: {
            car_id: car.id, dealer_id: dealer.id, source: row.source, external_id: row.external_id,
            public_id: newPublicId(),
            // Day 19b: the place from the localities file, written once here.
            price: row.price!, city: place.city, region: place.region, image_urls: [], km_declared: row.km, hand_declared: row.hand,
            km_observed_at: first_seen_at,
            first_seen_at,
            // Day 17 (R1): a --seen run walked this ad and found it up with its price — the insert is
            // itself an observation of seen, the same one R4 records for a listing that already existed.
            last_verified_at: lastVerifiedAtOnInsert(seen),
            owners_at_first_seen: v.ownership_history?.length ?? null, // Day 11: the record's size at first sight
          },
        });
        // Day 11 (§19.2): the first observed price, at first sight. Later changes go through recordPrice().
        // Day 17 (R1): in a --seen run the walk is what confirmed that price, so it was observed on seen.
        await tx.listing_price_history.create({
          data: { listing_id: created.id, price: row.price!, observed_at: firstPriceObservedAt(first_seen_at, seen) },
        });
      }
      return { dealer, car, model_id, listing: "new", decision: null };
    };
    const r = DRY ? await work(db as unknown as Tx) : await db.$transaction(work);

    if (seen) {
      tally(row, r.decision ?? { outcome: "insert", listing_id: null, writes: [], finding: null });
    }
    bump(`car:${r.car.created ? "new" : "existing"}`);
    if (status === "inactive") bump("car:inactive");
    bump(`listing:${r.listing}`);
    if (r.dealer) bump(`dealer:${r.dealer.how}`);
    if (DRY && r.listing === "new") dryNewListings.push({ carId: r.car.id, modelId: r.model_id });
    console.log(`${tag} ${v.degem_code} ${v.year} | car:${r.car.created ? "new" : "existing"} dealer:${r.dealer?.how ?? "—"} listing:${r.listing}`);

    // cross-checks, reported not stored (one line per car, not per listing)
    const m = modelFields(model);
    if (!seenCars.has(row.plate)) {
      seenCars.add(row.plate);
      const dkey = `${m.comparison_group ?? "?"} × ${v.year}`;
      density.set(dkey, (density.get(dkey) ?? 0) + 1);
      const ckey = `${v.degem_code} (${m.body_type ?? "?"}, ${m.sub_model ?? "?"}) × ${v.year}`;
      densityCode.set(ckey, (densityCode.get(ckey) ?? 0) + 1);
    }
    if (row.hand !== null && v.hand !== null && row.hand !== v.hand) {
      handMismatch.push({ plate: row.plate, declared: row.hand, official: v.hand, test_dt: null, note: (v.ownership_history ?? []).map((h) => `${h.ym}:${h.type}`).join(" → ") });
    }
    if (row.km !== null && v.km_at_last_test !== null && row.km < v.km_at_last_test) {
      kmBelowTest.push({ plate: row.plate, declared: row.km, official: v.km_at_last_test, test_dt: v.mivchan_acharon_dt, note: row.seller_name });
    }
  }

  // ---------- Day 19b §9.6: the manual spec, after the cars so this run's new versions are in ----------
  const keptIds = await syncSpecs(specs, storedSpecs);

  // ---------- Day 19b §9.8: the end of the run ----------
  // The failed-cars file, in every run, also empty: it shows only the last import's failures.
  writeFileSync(path.join(process.cwd(), FAILED_CARS_PATH), failedCarsCsv(failed), "utf8");
  console.log(`\n${FAILED_CARS_PATH}: ${failed.length === 0 ? "0 rows — header only" : `${failed.length} rows`}`);

  if (seen) {
    console.log(`\n===== OBSERVATION ${seen.toISOString().slice(0, 10)} =====`);
    console.log(counterLine("sheet rows", rows.length));
    console.log(counterLine("new listings", obs.new, DRY ? "(dry: would insert)" : ""));
    console.log(counterLine("existing listings", obs.existing));
    console.log(counterLine("  verified (לא)", obs.verified));
    console.log(counterLine("  price changed", obs.priceChanged, "old -> new per listing, listed below"));
    console.log(counterLine("  km/hand changed", obs.kmHandChanged, "per listing, listed below"));
    console.log(counterLine("  delisted now (כן)", obs.delistedNow));
    console.log(counterLine("  delisted: price removed (לא, no price)", obs.priceRemoved, "listed"));
    console.log(counterLine("  already delisted (skipped)", obs.alreadyDelisted));
    console.log(counterLine("  findings: delisted in DB, לא in sheet", obs.findings, "listed"));
    console.log(counterLine("blank / invalid cells", 0, "listed -> STOP"));
    console.log(counterLine("in DB, not in sheet", notInSheet.length, "listed"));
    console.log(`writes: history rows ${wrote.history} · price ${wrote.price} · km/hand ${wrote.kmhand} · last_verified_at ${wrote.lastVerified} · delisted_at ${wrote.delisted}`);

    if (priceLines.length) { console.log("\nprice changed"); for (const l of priceLines) console.log(l); }
    if (kmHandLines.length) { console.log("\nkm/hand changed"); for (const l of kmHandLines) console.log(l); }
    if (priceRemovedLines.length) { console.log("\ndelisted: price removed (לא, no price)"); for (const l of priceRemovedLines) console.log(l); }
    if (findingLines.length) { console.log("\nfindings: delisted in DB, לא in sheet"); for (const l of findingLines) console.log(l); }
    if (skippedLines.length) { console.log("\nskipped — outside the observation"); for (const l of skippedLines) console.log(l); }
    if (notInSheet.length) { console.log("\nin DB, not in sheet"); for (const id of notInSheet) console.log(`  ${id}`); }
  }

  console.log("\n===== REPORT =====");
  for (const [k, n] of Object.entries(counts).sort()) console.log(`${k.padEnd(28)} ${n}`);

  console.log(`\nhand: declared ≠ official (${handMismatch.length})`);
  for (const c of handMismatch) console.log(`  ${c.plate}: ad ${c.declared}, official ${c.official} | ${c.note}`);

  console.log(`\nkm: declared BELOW last test (${kmBelowTest.length})`);
  for (const c of kmBelowTest) console.log(`  ${c.plate}: ad ${c.declared}, test ${c.official} on ${c.test_dt} | ${c.note}`);

  console.log("\ncars per comparison_group × year");
  for (const [k, n] of [...density.entries()].sort()) console.log(`  ${n.toString().padStart(3)}  ${k}`);
  console.log("\ncars per degem_code × year");
  for (const [k, n] of [...densityCode.entries()].sort()) console.log(`  ${n.toString().padStart(3)}  ${k}`);

  await printAlerts(dryNewListings, keptIds);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
