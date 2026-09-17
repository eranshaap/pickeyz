// scripts/refresh-cars.ts
// Day 14 run C — the first explicit re-fetch of a known car from the Ministry of Transport.
//
// The flow has one direction and two writers that always move together (BRIEF §0.1):
//   Ministry -> raw cache (data/raw/mot/<plate>/, the answer as it arrived: evidence)
//            -> cars      (the interpretation the product reads)
// For every car the fresh answer is written to BOTH or to NEITHER. The cache never fills itself;
// only our fetches write it, and a fetch happens in exactly two places — the import of a new plate,
// and this script.
//
// The gate sits before both writes (§0.2). Every answer goes through the pure acceptance function in
// src/lib/refresh/, which returns accept (with the exact set of values to persist) or reject (with a
// reason). A rejected answer writes nothing, not even the timestamp. This script decides nothing about
// the data: it fetches, asks the function, and persists exactly what the function returned.
//
// Three outcomes per car (§0.12):
//   ACCEPT  the archive step + the fresh raw + the `cars` fields + a reading row if one is due +
//           registry_checked_at = the run's timestamp, in one operation per car.
//   REJECT  nothing written; one report line with the reason and both values; the run continues.
//   STOP    a structural failure (a renamed field, an unknown owner type, the wrong plate returned),
//           or 5 consecutive cars with no answer at all — the Ministry is down, and there is no point
//           in asking about 245 more.
//
// The archive (§0.11): the cache stops being overwritten. On accept, if the fresh raw differs from the
// current snapshot the current snapshot MOVES to data/raw/mot/<plate>/history/<fetched_at>/ and the
// fresh raw is written at the top; if it is identical nothing moves and only registry_checked_at
// changes — snapshot on change, not on check. The import's cache reader is untouched: it reads
// <plate>/<resource>.json at the top level and never looks into a subfolder.
//
// Dry run vs --write (§0.13): both fetch fresh from the Ministry, 150 ms between calls (Day 5), one
// timestamp for the whole run. The dry run writes NOTHING — not the database, not the cache, not the
// timestamp — and prints the full change report. --write fetches again and writes per §0.12.
// Plates: every car with a live listing (listings.delisted_at IS NULL), or --plates=<comma list>.
//
// P2, the write order per accepted car: the fresh raw to a staging folder -> one database transaction
// (the `cars` update + the reading insert) -> on commit, the archive move and then staging-to-top ->
// on database failure, drop the staging folder and report the car as write_failed, and continue.
// A failure BETWEEN the commit and the file moves is the only divergence possible; it is printed
// loudly with the plate, and the run continues.
//
// Day 18 (§7): current_owner_type, registry_color and color_changed go through the gate as ordinary registry
// fields and are written with the rest of an accepted car.
//
// Day 18 (§7) — `--from-cache`: for every car with a live listing (or --plates), the three columns re-derived from
// the CURRENT top-level cached snapshot (data/raw/mot/<plate>/*.json), read through the same interpret() as the
// import and the gate (src/lib/refresh/evaluate.ts deriveFromCache). No ministry call, nothing written under
// data/raw/, registry_checked_at untouched. Dry by default: per column, would fill / unchanged / would change
// (old → new). `--from-cache --write` writes the three columns and updated_at, one statement per car, nothing else.
// A snapshot that does not parse, an unknown baalut word or a plate with no cached registry record stops the run.

import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WRITE_TRANSACTION_OPTIONS, db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { fetchRowsFresh, plateDir, type ApiResource } from "@/lib/mot/fetch";
import { normalizePlate } from "@/lib/mot/vehicle";
import { CACHE_COLUMNS, UNDECIDABLE, deriveFromCache, evaluate, type CacheColumn } from "@/lib/refresh/evaluate";
import {
  RESOURCE_KEYS, sameResource, sameSnapshot, type RawRecord, type ResourceKey, type Snapshot,
} from "@/lib/refresh/raw";
import {
  FLAG_WORDS, REASON_WORDS, type Accept, type Change, type OwnershipRow, type Reason, type StoredCar,
} from "@/lib/refresh/types";
import { parseOwnerType } from "@/lib/scoring-input";

// ---------- the parameters, documented in the plan's Day 14 block (§9) ----------
const CALL_GAP_MS = 150; // Day 5: the pause between two calls to the Ministry
const RETRY_WAIT_MS = 2000; // P3: a failed call is retried once, after this
const NO_ANSWER_STOP = 5; // §0.12: this many consecutive cars with no answer stops the run

const REPORT_FILE = "REPORT-refresh-cars.md"; // P5

// ---------- 1. the command line: an unknown flag fails loudly (§4.1) ----------
const KNOWN_FLAGS = ["--write", "--from-cache"] as const;
const WRITE = process.argv.includes("--write");
const FROM_CACHE = process.argv.includes("--from-cache");
const PLATES = (() => {
  const a = process.argv.find((x) => x.startsWith("--plates="));
  return a ? a.slice("--plates=".length).split(",").map((p) => p.trim()).filter(Boolean) : [];
})();
for (const arg of process.argv.slice(2)) {
  if ((KNOWN_FLAGS as readonly string[]).includes(arg) || arg.startsWith("--plates=")) continue;
  throw new Error(`unknown argument ${JSON.stringify(arg)} — this script takes --write, --from-cache and --plates=<comma list>`);
}

const out: string[] = [];
function log(line = "") {
  out.push(line);
  console.log(line);
}

// ---------- 2. the run's one timestamp ----------
const NOW = new Date();
/** The archive folder name for this run: an ISO instant without the characters Windows forbids. */
const STAMP = NOW.toISOString().replace(/[:.]/g, "").replace(/Z$/, "Z");

// ---------- 3. dates: the import's own convention (§4.3) ----------
/** "2026-04-27" -> the Date the import writes into a @db.Date column. */
function dateOrNull(s: string | null | undefined): Date | null {
  return s ? new Date(`${s}T00:00:00.000Z`) : null;
}
/** A @db.Date column as the acceptance function wants it: the ISO day, no timezone in the way. */
function isoOrNull(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- 4. the cache, with the archive layout on top of it (§0.11, P1, P2) ----------
const topFile = (plate: string, key: ResourceKey) => path.join(plateDir(plate), `${key}.json`);
const stagingDir = (plate: string) => path.join(plateDir(plate), `.staged-${STAMP}`);
const archiveDir = (plate: string) => path.join(plateDir(plate), "history", STAMP);
const rejectedDir = (plate: string) => path.join(plateDir(plate), "rejected", STAMP);

/** The snapshot currently at the top level of a plate's cache folder. */
function readTopSnapshot(plate: string): Snapshot {
  const snap: Snapshot = {};
  for (const key of RESOURCE_KEYS) {
    const f = topFile(plate, key);
    if (!existsSync(f)) continue;
    const body = JSON.parse(readFileSync(f, "utf8")) as { result?: { records?: RawRecord[] } };
    snap[key] = body.result?.records ?? [];
  }
  return snap;
}

/** Which top-level resource files a plate's folder holds right now. */
function topFiles(plate: string): ResourceKey[] {
  return RESOURCE_KEYS.filter((k) => existsSync(topFile(plate, k)));
}

// ---------- 5. one plate's fresh answer ----------
type Fetched = {
  snapshot: Snapshot;
  /** The response text per resource, exactly as it arrived — what §0.11 archives. */
  text: Partial<Record<ResourceKey, string>>;
  calls: number;
  retries: number;
};
type NoAnswer = { failed: ResourceKey; error: string; calls: number; retries: number };

let totalCalls = 0;
let totalRetries = 0;
let lastCallAt = 0;

/** One call, with P3's single retry. The 150 ms gap is kept between every two calls of the run. */
async function callOnce<T extends RawRecord>(key: ResourceKey, plate: string): Promise<{ records: T[]; text: string; retries: number }> {
  const gap = CALL_GAP_MS - (Date.now() - lastCallAt);
  if (gap > 0) await sleep(gap);
  totalCalls++;
  lastCallAt = Date.now();
  try {
    return { ...(await fetchRowsFresh<T>(key as ApiResource, plate)), retries: 0 };
  } catch (e) {
    totalRetries++;
    console.log(`      ${plate} ${key}: ${(e as Error).message} — retrying once in ${RETRY_WAIT_MS} ms (P3)`);
    await sleep(RETRY_WAIT_MS);
    totalCalls++;
    lastCallAt = Date.now();
    return { ...(await fetchRowsFresh<T>(key as ApiResource, plate)), retries: 1 };
  }
}

/**
 * The chain, in the import's own order: active -> cancellations -> inactive -> none (§0.3).
 * Both history files are then asked for, and "empty" is an answer — including on a cancellation
 * record, so that the snapshot this run may write is a complete one and never a half-archived folder.
 * A plate in none of the three registries is rejected on the chain alone; nothing about it is written,
 * so its history files are not asked for.
 */
async function fetchFresh(plate: string): Promise<Fetched | NoAnswer> {
  const snapshot: Snapshot = {};
  const text: Partial<Record<ResourceKey, string>> = {};
  let calls = 0;
  let retries = 0;
  const ask = async (key: ResourceKey): Promise<void> => {
    const r = await callOnce(key, plate);
    calls += 1 + r.retries;
    retries += r.retries;
    snapshot[key] = r.records;
    text[key] = r.text;
  };
  try {
    await ask("registry");
    if (!snapshot.registry?.[0]) {
      await ask("cancelled");
      if (!snapshot.cancelled?.[0]) await ask("inactive");
    }
    const resolved = !!(snapshot.registry?.[0] ?? snapshot.cancelled?.[0] ?? snapshot.inactive?.[0]);
    if (resolved) {
      await ask("history_km");
      await ask("history_hand");
    }
    return { snapshot, text, calls, retries };
  } catch (e) {
    // P3: still failing after the one retry — the car is "no answer", not evaluated. Which source
    // failed is reported. §0.12 counts consecutive no-answer cars towards the stop.
    const failed = RESOURCE_KEYS.find((k) => snapshot[k] === undefined) ?? "registry";
    return { failed, error: (e as Error).message, calls, retries };
  }
}

// ---------- 6. the write, per accepted car (P2) ----------
type WriteOutcome = "written" | "timestamp_only" | "write_failed" | "divergence";

async function persist(stored: StoredCar, a: Accept, rawChanged: boolean, text: Partial<Record<ResourceKey, string>>): Promise<{ outcome: WriteOutcome; error?: string }> {
  const plate = stored.license_plate;
  const w = a.writes;

  // (1) the fresh raw to a staging folder — outside the top level, so nothing reads it yet.
  if (rawChanged) {
    mkdirSync(stagingDir(plate), { recursive: true });
    for (const key of RESOURCE_KEYS) {
      if (text[key] === undefined) continue;
      writeFileSync(path.join(stagingDir(plate), `${key}.json`), text[key], "utf8");
    }
  }

  // (2) one transaction: the cars update and the reading insert.
  try {
    await db.$transaction(async (tx) => {
      const ownership = w.car.ownership_history !== undefined ? w.car.ownership_history : stored.ownership_history;
      const n = await tx.$executeRaw`
        UPDATE "cars" SET
          "hand"                = ${w.car.hand !== undefined ? w.car.hand : stored.hand},
          "ownership_history"   = ${ownership === null ? null : JSON.stringify(ownership)}::jsonb,
          "color"               = ${w.car.color !== undefined ? w.car.color : stored.color},
          "test_expiry"         = ${dateOrNull(w.car.test_expiry !== undefined ? w.car.test_expiry : stored.test_expiry)},
          "mivchan_acharon_dt"  = ${dateOrNull(w.car.mivchan_acharon_dt !== undefined ? w.car.mivchan_acharon_dt : stored.mivchan_acharon_dt)},
          "km_at_last_test"     = ${w.car.km_at_last_test !== undefined ? w.car.km_at_last_test : stored.km_at_last_test},
          "first_registration"  = ${dateOrNull(w.car.first_registration !== undefined ? w.car.first_registration : stored.first_registration)},
          "cancelled_at"        = ${dateOrNull(w.car.cancelled_at !== undefined ? w.car.cancelled_at : stored.cancelled_at)},
          "current_owner_type"  = ${w.car.current_owner_type !== undefined ? w.car.current_owner_type : stored.current_owner_type},
          "registry_color"      = ${w.car.registry_color !== undefined ? w.car.registry_color : stored.registry_color},
          "color_changed"       = ${w.car.color_changed !== undefined ? w.car.color_changed : stored.color_changed},
          "registry_checked_at" = ${w.registry_checked_at},
          "updated_at"          = ${w.registry_checked_at}
        WHERE "id" = ${stored.id}`;
      if (n !== 1) throw new Error(`the cars UPDATE touched ${n} rows, not 1`);
      if (w.reading !== null) {
        await tx.car_test_readings.create({
          data: {
            car_id: stored.id,
            test_date: dateOrNull(w.reading.test_date) as Date,
            km: w.reading.km,
            observed_at: w.reading.observed_at,
          },
        });
      }
    }, WRITE_TRANSACTION_OPTIONS);
  } catch (e) {
    if (rawChanged) rmSync(stagingDir(plate), { recursive: true, force: true });
    return { outcome: "write_failed", error: (e as Error).message };
  }

  // (3) committed. The archive move, then staging-to-top. A failure from here on is the one
  // divergence P2 allows: the database has the fresh answer and the cache does not.
  if (!rawChanged) return { outcome: "timestamp_only" };
  try {
    mkdirSync(archiveDir(plate), { recursive: true });
    for (const key of topFiles(plate)) {
      renameSync(topFile(plate, key), path.join(archiveDir(plate), `${key}.json`));
    }
    for (const f of readdirSync(stagingDir(plate))) {
      renameSync(path.join(stagingDir(plate), f), path.join(plateDir(plate), f));
    }
    rmSync(stagingDir(plate), { recursive: true, force: true });
    return { outcome: "written" };
  } catch (e) {
    const msg =
      `DIVERGENCE ${plate}: the database was committed and the cache move failed — ${(e as Error).message}. ` +
      `The fresh raw is in ${stagingDir(plate)}; the top level is whatever the move left behind. Fix by hand.`;
    console.error(`\n${msg}\n`);
    return { outcome: "divergence", error: msg };
  }
}

/** P1: a rejected answer is kept aside as evidence, unread by anything on the import's path. */
function keepRejected(plate: string, text: Partial<Record<ResourceKey, string>>): void {
  mkdirSync(rejectedDir(plate), { recursive: true });
  for (const key of RESOURCE_KEYS) {
    if (text[key] === undefined) continue;
    writeFileSync(path.join(rejectedDir(plate), `${key}.json`), text[key], "utf8");
  }
}

// ---------- 7. the run ----------
type CarRow = {
  id: number;
  license_plate: string | null;
  model_id: number;
  year: number | null;
  hand: number | null;
  ownership_history: Prisma.JsonValue;
  color: string | null;
  test_expiry: Date | null;
  mivchan_acharon_dt: Date | null;
  km_at_last_test: number | null;
  first_registration: Date | null;
  current_owner_type: string | null;
  registry_color: string | null;
  color_changed: boolean | null;
  model: { vehicle_class: string | null; degem_code: string | null };
};

type Line = { plate: string; text: string };
type RejectLine = { plate: string; reason: Reason; detail: string };

async function main() {
  if (FROM_CACHE) return fromCache();
  log(`# refresh-cars ${WRITE ? "--write" : "dry run"}`);
  log();
  log("```");
  log(`${WRITE ? "" : "[DRY RUN] "}refresh-cars — now = ${NOW.toISOString()}, archive stamp = ${STAMP}`);
  log(`call gap ${CALL_GAP_MS} ms · one retry after ${RETRY_WAIT_MS} ms (P3) · stop after ${NO_ANSWER_STOP} consecutive cars with no answer (§0.12)`);

  // The two columns of §0.10 exist only after run 2's migrate deploy. In a dry run before that they
  // are read as null and said to be missing, loudly; --write refuses to run without them.
  const present = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'cars'
      AND column_name IN ('registry_checked_at', 'cancelled_at')`;
  const hasNewColumns = present[0].n === 2;
  if (!hasNewColumns) {
    if (WRITE) {
      throw new Error(
        `cars.registry_checked_at / cars.cancelled_at are not in the database (found ${present[0].n} of 2). ` +
          `Apply prisma/migrations/20260912120000_cars_registry_checked_at_cancelled_at first (§6.1). --write refuses to run without them.`,
      );
    }
    log(`NOTE: cars.registry_checked_at and cars.cancelled_at are NOT in the database yet (${present[0].n} of 2 found).`);
    log(`      The migration is applied in run 2. This dry run reads both as null for every car — which is`);
    log(`      what the backfill will make them equal to anyway for cancelled_at, and created_at for the other.`);
  }

  const where: Prisma.carsWhereInput = PLATES.length
    ? { license_plate: { in: PLATES.map((p) => normalizePlate(p)) } }
    : { listings: { some: { delisted_at: null } } };
  const cars = (await db.cars.findMany({
    where,
    orderBy: { license_plate: "asc" },
    include: { model: { select: { vehicle_class: true, degem_code: true } } },
  })) as CarRow[];

  if (PLATES.length) {
    const wanted = PLATES.map((p) => normalizePlate(p));
    const missing = wanted.filter((p) => !cars.some((c) => c.license_plate === p));
    if (missing.length) throw new Error(`--plates: no cars row for ${missing.join(", ")} — this script refreshes cars we already hold`);
  }
  if (cars.length === 0) throw new Error(`no cars to refresh`);

  // The two new columns, when they exist. One query, not one per car.
  const extra = new Map<number, { registry_checked_at: string | null; cancelled_at: string | null }>();
  if (hasNewColumns) {
    const rows = await db.$queryRaw<{ id: number; registry_checked_at: Date | null; cancelled_at: Date | null }[]>`
      SELECT "id", "registry_checked_at", "cancelled_at" FROM "cars"`;
    for (const r of rows) {
      extra.set(r.id, {
        registry_checked_at: r.registry_checked_at === null ? null : r.registry_checked_at.toISOString(),
        cancelled_at: isoOrNull(r.cancelled_at),
      });
    }
  }

  log(`${cars.length} car(s)${PLATES.length ? ` (--plates)` : ` with a live listing`}`);
  log();

  // ---- the counters and the report's lists ----
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const changed: Line[] = [];
  const readings: Line[] = [];
  const grew: string[] = [];
  const cancelled: Line[] = [];
  const rejects: RejectLine[] = [];
  const flagged: Line[] = [];
  const outside: Line[] = [];
  const colours: Line[] = [];
  const notEvaluated: Line[] = [];
  const inactiveNoChange: string[] = [];
  const undecidable: string[] = []; // §11.1: the ownership cross-check had nothing to decide
  const writeProblems: Line[] = [];
  let noAnswerRun = 0;
  let stoppedAt: string | null = null;
  const started = Date.now();

  for (const [i, c] of cars.entries()) {
    const plate = c.license_plate;
    if (!plate) throw new Error(`cars.id ${c.id} has no license_plate — the refresh has nothing to ask about`);
    const tag = `[${i + 1}/${cars.length}] ${plate}`;

    const fresh = await fetchFresh(plate);
    if ("failed" in fresh) {
      noAnswerRun++;
      bump("not_evaluated");
      notEvaluated.push({ plate, text: `${fresh.failed} did not answer — ${fresh.error}` });
      log(`${tag} not evaluated — ${fresh.failed}: ${fresh.error}`);
      if (noAnswerRun >= NO_ANSWER_STOP) {
        stoppedAt = plate;
        log(`\nSTOPPED at ${plate}: ${NO_ANSWER_STOP} consecutive cars with no answer — the Ministry is down (§0.12).`);
        break;
      }
      continue;
    }
    noAnswerRun = 0;

    const previous = readTopSnapshot(plate);
    const stored: StoredCar = {
      id: c.id,
      license_plate: plate,
      model_id: c.model_id,
      year: c.year,
      hand: c.hand,
      ownership_history: (c.ownership_history ?? null) as OwnershipRow[] | null,
      color: c.color,
      test_expiry: isoOrNull(c.test_expiry),
      mivchan_acharon_dt: isoOrNull(c.mivchan_acharon_dt),
      km_at_last_test: c.km_at_last_test,
      first_registration: isoOrNull(c.first_registration),
      registry_checked_at: extra.get(c.id)?.registry_checked_at ?? null,
      cancelled_at: extra.get(c.id)?.cancelled_at ?? null,
      current_owner_type: parseOwnerType(c.current_owner_type, plate),
      registry_color: c.registry_color,
      color_changed: c.color_changed,
      model: c.model,
    };

    // §0.3: a structural failure throws out of here and stops the run — it is not caught.
    const result = evaluate(stored, previous, fresh.snapshot, NOW);

    if (result.outcome === "reject") {
      bump("rejected");
      rejects.push({ plate, reason: result.reason, detail: result.detail });
      log(`${tag} REJECT ${result.reason} — ${result.detail}`);
      if (WRITE) keepRejected(plate, fresh.text);
      continue;
    }

    // §0.11: snapshot on change, not on check. The per-resource comparison is P4's.
    const rawChanged = !sameSnapshot(previous, fresh.snapshot);
    const movedResources = RESOURCE_KEYS.filter((k) => fresh.snapshot[k] !== undefined && !sameResource(k, previous[k], fresh.snapshot[k]));

    bump("accepted");
    bump(`status:${result.status}`);
    bump(rawChanged ? "raw_changed" : "raw_unchanged");
    if (Object.keys(result.writes.car).length > 0) bump("cars_fields_changed");
    else bump("cars_fields_unchanged");
    if (result.flags.length) bump("flagged");
    if (result.history_grew) grew.push(plate);

    for (const ch of result.changes) changed.push({ plate, text: line(ch) });
    if (result.writes.reading) readings.push({ plate, text: `test_date ${result.writes.reading.test_date}, km ${result.writes.reading.km}` });
    for (const f of result.flags) flagged.push({ plate, text: `${f} — ${FLAG_WORDS[f]}` });
    for (const n of result.notes) flagged.push({ plate, text: `note: ${n}` });
    if (result.notes.some((n) => n.startsWith(UNDECIDABLE))) undecidable.push(plate);
    for (const ch of result.outside) outside.push({ plate, text: line(ch) });
    if (result.status === "cancelled") {
      cancelled.push({ plate, text: `cancelled_at ${result.writes.car.cancelled_at ?? stored.cancelled_at ?? "?"} — its live listings should come down` });
    }
    if (result.colour && result.colour.stored !== result.colour.ministry) {
      colours.push({ plate, text: result.colour.written ? `color: null → ${result.colour.ministry} (written)` : `color: ${result.colour.stored} kept, the Ministry says ${result.colour.ministry} (not written)` });
    }
    if (result.status === "inactive" && !rawChanged && Object.keys(result.writes.car).length === 0) inactiveNoChange.push(plate);

    const head = `${tag} ACCEPT ${result.status} · raw ${rawChanged ? `changed (${movedResources.join(", ")})` : "unchanged"} · cars ${Object.keys(result.writes.car).length || "no"} field(s)${result.flags.length ? ` · flags ${result.flags.join(",")}` : ""}`;
    if (!WRITE) {
      log(head);
      continue;
    }
    const w = await persist(stored, result, rawChanged, fresh.text);
    bump(`write:${w.outcome}`);
    if (w.outcome === "write_failed" || w.outcome === "divergence") {
      writeProblems.push({ plate, text: `${w.outcome}: ${w.error}` });
      if (w.outcome === "write_failed") rejects.push({ plate, reason: "write_failed", detail: w.error ?? "" });
    }
    log(`${head} · ${w.outcome}`);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  // ---------- 8. the report, sections in the order of §4.4 ----------
  log();
  log(`===== SUMMARY =====`);
  log(`plates asked about            ${cars.length}`);
  for (const k of ["accepted", "rejected", "not_evaluated", "status:active", "status:inactive", "status:cancelled", "raw_changed", "raw_unchanged", "cars_fields_changed", "cars_fields_unchanged", "flagged", "write:written", "write:timestamp_only", "write:write_failed", "write:divergence"]) {
    if (counts[k] !== undefined) log(`${k.padEnd(28)} ${counts[k]}`);
  }
  log(`new readings                 ${readings.length}`);
  log(`history grew (sold candidates) ${grew.length}`);
  log(`stopped at                   ${stoppedAt ?? "—"}`);

  section(`CHANGED CARS — one line per field (${changed.length})`, changed.map((l) => `${l.plate} · ${l.text}`));
  section(`NEW READINGS (${readings.length})`, readings.map((l) => `${l.plate} · ${l.text}`));
  section(`HISTORY GREW — THE SOLD CANDIDATES (${grew.length})`, grew);
  section(`CANCELLED — MANUAL-PASS ITEMS (${cancelled.length})`, cancelled.map((l) => `${l.plate} · ${l.text}`));
  section(`REJECTED (${rejects.length})`, rejects.map((r) => `${r.plate} · ${r.reason} (${REASON_WORDS[r.reason]}) · ${r.detail}`));
  section(
    `FLAGS AND NOTES (${flagged.length})`,
    flagged.map((l) => `${l.plate} · ${l.text}`),
    // §11.1: the undecidable cars are counted up front — they are not a disagreement, and a reader
    // should see how much of the fleet the cross-check simply cannot speak about.
    undecidable.length
      ? [`${UNDECIDABLE}: ${undecidable.length} car(s) — the last month holds more than one row and the registry's own type is among them`,
         `  ${undecidable.join(", ")}`, ``]
      : [`${UNDECIDABLE}: 0 car(s)`, ``],
  );
  section(`FIELDS OUTSIDE THE DATABASE — changed since the previous snapshot (${outside.length})`, outside.map((l) => `${l.plate} · ${l.text}`));
  section(`COLOUR — §0.8, fills an empty value and never overwrites (${colours.length})`, colours.map((l) => `${l.plate} · ${l.text}`), colourSummary(colours));
  section(`NOT EVALUATED (${notEvaluated.length})`, notEvaluated.map((l) => `${l.plate} · ${l.text}`));
  section(`INACTIVE, NO CHANGE (${inactiveNoChange.length})`, inactiveNoChange);
  if (writeProblems.length) section(`WRITE PROBLEMS (${writeProblems.length})`, writeProblems.map((l) => `${l.plate} · ${l.text}`));

  log();
  log(`===== TIMING =====`);
  log(`calls ${totalCalls} · retries ${totalRetries} · elapsed ${elapsed} s · ${(totalCalls / Math.max(1, Number(elapsed))).toFixed(1)} calls/s`);
  log("```");

  writeFileSync(REPORT_FILE, `${out.join("\n")}\n`, "utf8");
  if (!WRITE) {
    console.log(`\n[DRY RUN] nothing written to the database, nothing written under data/raw/; report written to ${REPORT_FILE}`);
  } else {
    console.log(`\nreport written to ${REPORT_FILE}`);
  }
}

// ---------- Day 18 (§7): --from-cache ----------
async function fromCache(): Promise<void> {
  log(`# refresh-cars --from-cache ${WRITE ? "--write" : "dry run"}`);
  log();
  log("```");
  log(`${WRITE ? "" : "[DRY RUN] "}refresh-cars --from-cache — now = ${NOW.toISOString()} · no ministry call · registry_checked_at untouched · reads the top-level cached snapshot`);

  const where: Prisma.carsWhereInput = PLATES.length
    ? { license_plate: { in: PLATES.map((p) => normalizePlate(p)) } }
    : { listings: { some: { delisted_at: null } } };
  const cars = await db.cars.findMany({
    where,
    orderBy: { license_plate: "asc" },
    select: { id: true, license_plate: true, current_owner_type: true, registry_color: true, color_changed: true },
  });
  if (PLATES.length) {
    const missing = PLATES.map((p) => normalizePlate(p)).filter((p) => !cars.some((c) => c.license_plate === p));
    if (missing.length) throw new Error(`--plates: no cars row for ${missing.join(", ")}`);
  }
  if (cars.length === 0) throw new Error(`no cars to derive`);
  log(`${cars.length} car(s)${PLATES.length ? ` (--plates)` : ` with a live listing`}`);

  const tally: Record<CacheColumn, Record<string, number>> = { current_owner_type: {}, registry_color: {}, color_changed: {} };
  const lines: Record<CacheColumn, string[]> = { current_owner_type: [], registry_color: [], color_changed: [] };
  const values: Record<CacheColumn, Map<string, number>> = { current_owner_type: new Map(), registry_color: new Map(), color_changed: new Map() };
  const statuses = new Map<string, number>();
  const toWrite: { id: number; plate: string; v: { current_owner_type: string; registry_color: string | null; color_changed: boolean | null } }[] = [];

  for (const c of cars) {
    const plate = c.license_plate;
    if (!plate) throw new Error(`cars.id ${c.id} has no license_plate`);
    if (topFiles(plate).length === 0) throw new Error(`${plate}: no top-level cached snapshot under ${plateDir(plate)}`);
    const d = deriveFromCache(
      { license_plate: plate, current_owner_type: parseOwnerType(c.current_owner_type, plate), registry_color: c.registry_color, color_changed: c.color_changed },
      readTopSnapshot(plate),
    );
    statuses.set(d.status, (statuses.get(d.status) ?? 0) + 1);
    let moves = false;
    for (const col of CACHE_COLUMNS) {
      const x = d.columns[col];
      tally[col][x.outcome] = (tally[col][x.outcome] ?? 0) + 1;
      const shown = JSON.stringify(x.to);
      values[col].set(shown, (values[col].get(shown) ?? 0) + 1);
      if (x.outcome === "change") lines[col].push(`${plate} · ${col}: ${JSON.stringify(x.from)} → ${JSON.stringify(x.to)}`);
      if (x.outcome !== "unchanged") moves = true;
    }
    if (moves) toWrite.push({ id: c.id, plate, v: d.values });
  }

  const verb = (o: string) => (WRITE ? o : o === "unchanged" ? o : `would ${o}`);
  log(`resolved to: ${[...statuses.entries()].map(([k, n]) => `${k} ${n}`).join(", ")}`);
  for (const col of CACHE_COLUMNS) {
    log();
    log(`===== ${col} =====`);
    for (const o of ["fill", "unchanged", "change"]) log(`  ${verb(o).padEnd(14)} ${tally[col][o] ?? 0}`);
    log(`  derived values:`);
    for (const [k, n] of [...values[col].entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) log(`    ${String(n).padStart(4)}  ${k}`);
    if (lines[col].length) {
      log(`  ${verb("change")} (old → new):`);
      for (const l of lines[col]) log(`    ${l}`);
    }
  }
  log();
  log(`cars whose row ${WRITE ? "moves" : "would move"}: ${toWrite.length} of ${cars.length}`);

  if (WRITE && toWrite.length) {
    let written = 0;
    await db.$transaction(async (tx) => {
      for (const t of toWrite) {
        const n = await tx.$executeRaw`
          UPDATE "cars" SET
            "current_owner_type" = ${t.v.current_owner_type},
            "registry_color"     = ${t.v.registry_color},
            "color_changed"      = ${t.v.color_changed},
            "updated_at"         = ${NOW}
          WHERE "id" = ${t.id}`;
        if (n !== 1) throw new Error(`${t.plate}: the cars UPDATE touched ${n} rows, not 1 — rolled back`);
        written++;
      }
    }, WRITE_TRANSACTION_OPTIONS);
    log(`written: ${written} car(s)`);
  }
  log("```");
  writeFileSync(REPORT_FILE, `${out.join("\n")}\n`, "utf8");
  console.log(WRITE ? `\nreport written to ${REPORT_FILE}` : `\n[DRY RUN] nothing written to the database; report written to ${REPORT_FILE}`);
}

function line(ch: Change): string {
  return `${ch.field}: ${ch.from} → ${ch.to}`;
}

function section(title: string, lines: string[], extra: string[] = []): void {
  log();
  log(`===== ${title} =====`);
  for (const l of extra) log(l);
  if (lines.length === 0) log(`(none)`);
  for (const l of lines) log(`  ${l}`);
}

/** 216 of 250 stored colours are the ad's word for the Ministry's shade; the pairs matter, not the rows. */
function colourSummary(colours: Line[]): string[] {
  const pairs = new Map<string, number>();
  for (const c of colours) pairs.set(c.text, (pairs.get(c.text) ?? 0) + 1);
  if (pairs.size === 0) return [];
  return [
    `${colours.length} car(s), ${pairs.size} distinct stored/Ministry pair(s):`,
    ...[...pairs.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${String(n).padStart(4)}  ${k}`),
    ``,
    `per car:`,
  ];
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    if (out.length) {
      out.push("", `STOPPED: ${(e as Error).message}`, "```");
      writeFileSync(REPORT_FILE, `${out.join("\n")}\n`, "utf8");
      console.error(`partial report written to ${REPORT_FILE}`);
    }
    await db.$disconnect();
    process.exit(1);
  });
