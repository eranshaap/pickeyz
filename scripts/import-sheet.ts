// scripts/import-sheet.ts
// Imports the manual collection sheet (data/raw/sheet.csv — the רכבים tab, CSV UTF-8)
// into models -> dealers -> cars -> listings. Day 12's rule holds in every mode: the run is a DRY
// RUN unless `--write` is given — it reads, fetches and reports, and writes nothing.
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

import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getVehicleData, type VehicleData } from "@/lib/mot/vehicle";
import { normalizeName } from "@/lib/names";
import {
  absentFromSheet, apply as applyObservation, checkDelistedColumn, decide, DELISTED_HEADER,
  firstPriceObservedAt, lastVerifiedAtOnInsert, parseSeen,
  type Decision, type ListingState, type Observation, type Violation,
} from "@/lib/observe";

// `--seen YYYY-MM-DD` (or `--seen=YYYY-MM-DD`). Absent -> null, and the run behaves exactly as before.
const SEEN_ARG = ((): string | null => {
  const i = process.argv.indexOf("--seen");
  if (i >= 0) return process.argv[i + 1] ?? "";
  const eq = process.argv.find((a) => a.startsWith("--seen="));
  return eq ? eq.slice("--seen=".length) : null;
})();

// Day 12, in every mode: dry by default, `--write` is the only thing that writes. `--dry-run` is
// still accepted — it is what this script used to need — and is now simply the default, so ignored.
const DRY = !process.argv.includes("--write");
const FILE = process.argv.find((a) => a.endsWith(".csv")) ?? "data/raw/sheet.csv";

// --expect-model "MAZDA 3": the registry's commercial model name every row must carry.
// The flag may be repeated — `--expect-model "MAZDA 3" --expect-model "IONIQ HYBRID"`
// (or `--expect-model=A`): a row passes when its registry model equals ANY of the values.
// With no flag, no model check is made.
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

// Both sides are compared uppercased and without spaces.
function modelKey(s: string): string {
  return (s ?? "").toUpperCase().replace(/\s+/g, "");
}

// ---------- 1. the sheet's contract ----------
const HEADERS = [
  "מספר רישוי", "מחיר", "קילומטראז'", "יד לפי המודעה", "צבע", "אזור",
  "שם המוכר", "סוג המוכר", "טלפון", "קישור למודעה", "תאריך צפייה", "הערות שלי",
] as const;
// The `ירד` column (Day 17) is not part of this contract: it may be absent, and --seen checks for it.
type SheetRow = Record<string, string>;

const SELLER_TYPE: Record<string, string> = {
  "מגרש": "lot", "פרטי": "private", "ליסינג": "leasing", "השכרה": "rental", "יבואן": "importer",
};

type Row = {
  n: number; plate: string; price: number | null; km: number | null; hand: number | null;
  color: string | null; region: string | null; seller_name: string; seller_type: string;
  phone: string | null; source: string; external_id: string; first_seen: string;
  link: string; delisted_cell: string; // Day 17: the ad's url as written, and the raw `ירד` cell
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

function readSheet(file: string): { rows: Row[]; headers: string[] } {
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

  const mapped = rows.map(({ r, n }) => {
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
      link: (r["קישור למודעה"] ?? "").trim(),
      delisted_cell: r[DELISTED_HEADER] ?? "",
    };
  });
  return { rows: mapped, headers: got };
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

// ---------- 3. the run ----------
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
  const { rows, headers } = readSheet(FILE);
  console.log(`${DRY ? "[DRY RUN]" : "[WRITE]"} ${FILE}: ${rows.length} rows, headers OK`);

  // ---------- Day 17: G1, every guard before any write ----------
  let seen: Date | null = null;
  const known = new Map<string, ListingState>();
  let notInSheet: string[] = [];
  if (SEEN_ARG !== null) {
    const parsed = parseSeen(SEEN_ARG, new Date());
    if (!parsed.ok) throw new Error(parsed.violation.message);
    seen = parsed.seen;
    const column = checkDelistedColumn(headers);
    if (!column.ok) throw new Error(column.violation.message);

    const sources = [...new Set(rows.map((r) => r.source))].sort();
    const stored = await db.listings.findMany({ where: { source: { in: sources } }, select: LISTING_STATE });
    for (const l of stored) known.set(key(l.source, l.external_id), l);
    notInSheet = absentFromSheet(
      stored.map((l) => l.external_id),
      rows.map((r) => r.external_id),
    );

    const offending: { row: Row; violation: Violation }[] = [];
    for (const row of rows) {
      const existing = known.get(key(row.source, row.external_id)) ?? null;
      const observation = (importable: boolean): Observation =>
        ({ price: row.price, km: row.km, hand: row.hand, cell: row.delisted_cell, importable });
      // Importability costs a registry lookup, so the registry is asked only where its answer can
      // change the outcome: a row this pass would stop for being a new listing marked כן. Every other
      // row is decided on what the sheet says alone (a row without a price imports nothing either way).
      let r = decide(existing, observation(row.price !== null), seen);
      if (!r.ok && r.violation.guard === "new_row_delisted") {
        const status = (await getVehicleData(row.plate)).status;
        r = decide(existing, observation(status === "active" || status === "inactive"), seen);
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

  const tally = (row: Row, d: Decision) => {
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
        kmHand.push(`${w.field === "km_declared" ? "km" : "hand"} ${w.from ?? "—"} -> ${w.to}`);
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

    const lookup = await getVehicleData(row.plate);
    if (lookup.status !== "active" && lookup.status !== "inactive") {
      // Day 17: same reason as a row without a price — an existing listing must not be silently skipped.
      if (seen && known.has(key(row.source, row.external_id))) {
        fail(row.n, `${row.plate}: registry says ${lookup.status} but its listing already exists — no rule covers this row`);
      }
      bump(`skipped:${lookup.status}`);
      if (seen) skippedLines.push(`  row ${row.n} | ${row.external_id} (${row.plate}) | ירד ${JSON.stringify(row.delisted_cell)} | ${lookup.status}`);
      console.log(`${tag} skipped — ${lookup.status}`); continue;
    }
    // An inactive car carries the same registry fields; its expired tokef_dt is data, not a reason to skip.
    const v = lookup.data;
    if (EXPECT_MODELS.length > 0 && !EXPECT_MODELS.some((m) => modelKey(m) === modelKey(v.registry.model_name))) {
      fail(row.n, `${row.plate}: expected model ${EXPECT_MODELS.map((m) => JSON.stringify(m)).join(" or ")}, registry says ${v.registry.make} ${v.registry.model_name}`);
    }
    if (!v.degem_code) fail(row.n, `${row.plate}: registry row without a degem_code`);

    const model = await db.models.findUnique({
      where: { vehicle_class_degem_code_year: { vehicle_class: v.vehicle_class, degem_code: v.degem_code, year: v.year } },
    });
    if (!model) fail(row.n, `${row.plate}: no models row for (${v.vehicle_class}, ${v.degem_code}, ${v.year}) — catalog import incomplete`);

    // The sheet is a first-seen observation: a row whose listing already exists changes nothing.
    // The existence check therefore comes before resolveDealer(), which creates a dealers row
    // for every private seller — a re-run would otherwise leave one orphan per private row.
    const work = async (tx: Tx) => {
      const car = await upsertCar(tx, row, v, model.id);
      const exists = await tx.listings.findUnique({ where: { source_external_id: { source: row.source, external_id: row.external_id } } });
      if (exists) {
        // Day 17: without --seen an existing listing still changes nothing.
        if (!seen) return { dealer: null, car, listing: "existing", decision: null };
        const r = decide(exists, { price: row.price, km: row.km, hand: row.hand, cell: row.delisted_cell, importable: true }, seen);
        if (!r.ok) fail(row.n, `${row.plate}: ${r.violation.message}`); // G1 already passed; the data moved under us
        if (!DRY) await applyObservation(tx, r.decision);
        return { dealer: null, car, listing: "existing", decision: r.decision };
      }
      const dealer = await resolveDealer(tx, row);
      if (!DRY) {
        const first_seen_at = new Date(`${row.first_seen}T00:00:00.000Z`);
        const created = await tx.listings.create({
          data: {
            car_id: car.id, dealer_id: dealer.id, source: row.source, external_id: row.external_id,
            price: row.price!, region: row.region, image_urls: [], km_declared: row.km, hand_declared: row.hand,
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
      return { dealer, car, listing: "new", decision: null };
    };
    const r = DRY ? await work(db as unknown as Tx) : await db.$transaction(work);

    if (seen) {
      tally(row, r.decision ?? { outcome: "insert", listing_id: null, writes: [], finding: null });
    }
    bump(`car:${r.car.created ? "new" : "existing"}`);
    if (lookup.status === "inactive") bump("car:inactive");
    bump(`listing:${r.listing}`);
    if (r.dealer) bump(`dealer:${r.dealer.how}`);
    console.log(`${tag} ${v.degem_code} ${v.year} | car:${r.car.created ? "new" : "existing"} dealer:${r.dealer?.how ?? "—"} listing:${r.listing}`);

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
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
