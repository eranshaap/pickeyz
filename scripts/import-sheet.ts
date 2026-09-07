// scripts/import-sheet.ts
// Imports the manual collection sheet (data/raw/sheet.csv — the רכבים tab, CSV UTF-8)
// into models -> dealers -> cars -> listings. `--dry-run` reads, fetches and reports, writes nothing.
//
// Rules (Day 6):
// - The sheet is the first-seen observation: an existing listing is never updated here.
// - Unknown values stop the run. Only cancelled and not_found plates are counted and skipped;
//   a plate found in the inactive-vehicles dataset is imported like an active one (counted as car:inactive).
// - Ads without an asking price are counted, not imported — same reason as auctions.
// - dealers: private = one row per listing; business = normalized name -> same phone -> create.
//   No registry lookup here: corp_id / in_dealer_registry / registry_checked_at are set at onboarding.
// - cars: a listing fills an empty color, never overwrites; official snapshot fields are refreshed.
// - Day 11: a new listing writes its first listing_price_history row (price, first_seen_at); a car's
//   (mivchan_acharon_dt, km_at_last_test) reading is appended to car_test_readings when that test date is new.

import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getVehicleData, type VehicleData } from "@/lib/mot/vehicle";
import { normalizeName } from "@/lib/names";

const DRY = process.argv.includes("--dry-run");
const FILE = process.argv.find((a) => a.endsWith(".csv")) ?? "data/raw/sheet.csv";

// --expect-model "MAZDA 3": the registry's commercial model name every row must carry.
const EXPECT_MODEL = (() => {
  const i = process.argv.indexOf("--expect-model");
  if (i === -1) return null;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--")) throw new Error("--expect-model: missing value");
  return value;
})();

// Both sides are compared uppercased and without spaces.
function modelKey(s: string): string {
  return (s ?? "").toUpperCase().replace(/\s+/g, "");
}

// ---------- 1. the sheet's contract ----------
const HEADERS = [
  "מספר רישוי", "מחיר", "קילומטראז'", "יד לפי המודעה", "צבע", "אזור",
  "שם המוכר", "סוג המוכר", "טלפון", "קישור למודעה", "תאריך צפייה", "הערות שלי",
] as const;
type SheetRow = Record<(typeof HEADERS)[number], string>;

const SELLER_TYPE: Record<string, string> = {
  "מגרש": "lot", "פרטי": "private", "ליסינג": "leasing", "השכרה": "rental", "יבואן": "importer",
};

type Row = {
  n: number; plate: string; price: number | null; km: number | null; hand: number | null;
  color: string | null; region: string | null; seller_name: string; seller_type: string;
  phone: string | null; source: string; external_id: string; first_seen: string;
};

function fail(n: number, msg: string): never {
  throw new Error(`row ${n}: ${msg}`);
}

function text(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

// Excel exports the displayed value, so "103,000" arrives with the comma.
function intOrNull(s: string | undefined, field: string, n: number): number | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const digits = t.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(digits)) fail(n, `${field}: not a whole number: ${JSON.stringify(s)}`);
  return Number(digits);
}

function phoneOrNull(s: string | undefined): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.startsWith("972") ? "0" + d.slice(3) : d;
}

function parseLink(s: string | undefined, n: number): { source: string; external_id: string } {
  const m = /^https:\/\/www\.yad2\.co\.il\/vehicles\/item\/([A-Za-z0-9]+)/.exec((s ?? "").trim());
  if (!m) fail(n, `link: not a yad2 item url: ${JSON.stringify(s)}`);
  return { source: "yad2", external_id: m[1] };
}

function readSheet(file: string): Row[] {
  const raw = parse(readFileSync(path.join(process.cwd(), file), "utf8"), {
    columns: true, bom: true, skip_empty_lines: true, trim: true,
  }) as SheetRow[];
  if (raw.length === 0) throw new Error(`${file}: no rows`);
  const got = Object.keys(raw[0]);
  const missing = HEADERS.filter((h) => !got.includes(h));
  if (missing.length) throw new Error(`${file}: missing columns: ${missing.join(", ")} — got: ${got.join(", ")}`);

  // The export pads the sheet with fully empty rows (",,,,"); they are not records.
  // A row with any value in it is still validated in full.
  const rows = raw
    .map((r, i) => ({ r, n: i + 2 })) // sheet row number (1 = header)
    .filter(({ r }) => HEADERS.some((h) => (r[h] ?? "").trim() !== ""));

  return rows.map(({ r, n }) => {
    const plate = (r["מספר רישוי"] ?? "").replace(/\D/g, "");
    if (!/^\d{7,8}$/.test(plate)) fail(n, `plate: expected 7-8 digits, got ${JSON.stringify(r["מספר רישוי"])}`);
    const sellerHe = (r["סוג המוכר"] ?? "").trim();
    const seller_type = SELLER_TYPE[sellerHe];
    if (!seller_type) fail(n, `seller type: unknown value ${JSON.stringify(sellerHe)}`);
    const seller_name = text(r["שם המוכר"]);
    if (!seller_name) fail(n, `seller name: empty`);
    const first_seen = (r["תאריך צפייה"] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(first_seen) || Number.isNaN(Date.parse(first_seen))) fail(n, `date: expected YYYY-MM-DD, got ${JSON.stringify(first_seen)}`);
    const { source, external_id } = parseLink(r["קישור למודעה"], n);
    return {
      n, plate,
      price: intOrNull(r["מחיר"], "price", n),
      km: intOrNull(r["קילומטראז'"], "km", n),
      hand: intOrNull(r["יד לפי המודעה"], "hand", n),
      color: text(r["צבע"]),
      region: text(r["אזור"]),
      seller_name, seller_type,
      phone: phoneOrNull(r["טלפון"]),
      source, external_id, first_seen,
    };
  });
}

// ---------- 2. writing, with a memory of what a dry run "would" have created ----------
type Tx = Prisma.TransactionClient;
type DealerLike = { id: number; name: string; dealer_type: string; phone: string | null };
const pendingDealers: DealerLike[] = [];
const pendingCars = new Map<string, { id: number; color: string | null }>();
let fakeId = -1;

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

async function resolveDealer(tx: Tx, row: Row): Promise<{ id: number; how: string }> {
  if (row.seller_type === "private") {
    const id = await createDealer(tx, {
      name: row.seller_name, dealer_type: "private", region: row.region, phone: row.phone,
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
    name: row.seller_name, dealer_type: row.seller_type, region: row.region, phone: row.phone,
  });
  return { id, how: "new" };
}

function dateOrNull(s: string | null): Date | null {
  return s ? new Date(`${s}T00:00:00.000Z`) : null;
}

async function upsertCar(tx: Tx, row: Row, v: VehicleData, model_id: number): Promise<{ id: number; created: boolean }> {
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
  const c = await tx.cars.create({ data: { license_plate: v.license_plate, model_id, color, ...official } });
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

// ---------- 3. the run ----------
type Check = { plate: string; declared: number | null; official: number | null; test_dt: string | null; note: string };

async function main() {
  const rows = readSheet(FILE);
  console.log(`${DRY ? "[DRY RUN] " : ""}${FILE}: ${rows.length} rows, headers OK`);

  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const handMismatch: Check[] = [];
  const kmBelowTest: Check[] = [];
  const density = new Map<string, number>();
  const densityCode = new Map<string, number>();
  const seenCars = new Set<string>();

  for (const [i, row] of rows.entries()) {
    const tag = `[${i + 1}/${rows.length}] ${row.plate}`;
    if (row.price === null) { bump("skipped:no_price"); console.log(`${tag} skipped — no asking price`); continue; }

    const lookup = await getVehicleData(row.plate);
    if (lookup.status !== "active" && lookup.status !== "inactive") {
      bump(`skipped:${lookup.status}`); console.log(`${tag} skipped — ${lookup.status}`); continue;
    }
    // An inactive car carries the same registry fields; its expired tokef_dt is data, not a reason to skip.
    const v = lookup.data;
    if (EXPECT_MODEL !== null && modelKey(v.registry.model_name) !== modelKey(EXPECT_MODEL)) {
      fail(row.n, `${row.plate}: expected model ${JSON.stringify(EXPECT_MODEL)}, registry says ${v.registry.make} ${v.registry.model_name}`);
    }
    if (!v.degem_code) fail(row.n, `${row.plate}: registry row without a degem_code`);

    const model = await db.models.findUnique({
      where: { vehicle_class_degem_code_year: { vehicle_class: v.vehicle_class, degem_code: v.degem_code, year: v.year } },
    });
    if (!model) fail(row.n, `${row.plate}: no models row for (${v.vehicle_class}, ${v.degem_code}, ${v.year}) — catalog import incomplete`);

    const work = async (tx: Tx) => {
      const dealer = await resolveDealer(tx, row);
      const car = await upsertCar(tx, row, v, model.id);
      const exists = await tx.listings.findUnique({ where: { source_external_id: { source: row.source, external_id: row.external_id } } });
      let listing = "existing";
      if (!exists) {
        listing = "new";
        if (!DRY) {
          const first_seen_at = new Date(`${row.first_seen}T00:00:00.000Z`);
          const created = await tx.listings.create({
            data: {
              car_id: car.id, dealer_id: dealer.id, source: row.source, external_id: row.external_id,
              price: row.price!, region: row.region, image_urls: [], km_declared: row.km, hand_declared: row.hand,
              first_seen_at,
              owners_at_first_seen: v.ownership_history?.length ?? null, // Day 11: the record's size at first sight
            },
          });
          // Day 11 (§19.2): the first observed price, at first sight. Later changes go through recordPrice().
          await tx.listing_price_history.create({ data: { listing_id: created.id, price: row.price!, observed_at: first_seen_at } });
        }
      }
      return { dealer, car, listing };
    };
    const r = DRY ? await work(db as unknown as Tx) : await db.$transaction(work);

    bump(`car:${r.car.created ? "new" : "existing"}`);
    if (lookup.status === "inactive") bump("car:inactive");
    bump(`listing:${r.listing}`);
    bump(`dealer:${r.dealer.how}`);
    console.log(`${tag} ${v.degem_code} ${v.year} | car:${r.car.created ? "new" : "existing"} dealer:${r.dealer.how} listing:${r.listing}`);

    // cross-checks, reported not stored (one line per car, not per listing)
    if (!seenCars.has(row.plate)) {
      seenCars.add(row.plate);
      const dkey = `${model.comparison_group ?? "?"} × ${v.year}`;
      density.set(dkey, (density.get(dkey) ?? 0) + 1);
      const ckey = `${v.degem_code} (${model.body_type ?? "?"}, ${model.sub_model ?? "?"}) × ${v.year}`;
      densityCode.set(ckey, (densityCode.get(ckey) ?? 0) + 1);
    }
    if (row.hand !== null && v.hand !== null && row.hand !== v.hand) {
      handMismatch.push({ plate: row.plate, declared: row.hand, official: v.hand, test_dt: null, note: (v.ownership_history ?? []).map((h) => `${h.ym}:${h.type}`).join(" → ") });
    }
    if (row.km !== null && v.km_at_last_test !== null && row.km < v.km_at_last_test) {
      kmBelowTest.push({ plate: row.plate, declared: row.km, official: v.km_at_last_test, test_dt: v.mivchan_acharon_dt, note: row.seller_name });
    }
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
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
