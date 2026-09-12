// scripts/oneoff/revert-reordered-histories.ts
// Day 14 run C, §11.2 — a one-off repair, committed so that the repair is on record.
//
// WHAT HAPPENED. Four cars — 28211803, 35903902, 76903702, 84759901 — had their ownership_history
// rewritten by the --write refresh of 2026-09-12T01:43:29.148Z. The ministry had re-ordered two or
// three rows INSIDE one month; §10.10, the rule in force at the time, treated the fresh array as the
// one to keep and wrote it. §10.17 then decided that a pure re-ordering is not a change anywhere:
// the order of two rows in one month is not information the ministry gives (history_hand carries only
// _id as a tie-break, and the ministry re-orders it), so nothing should have been written.
//
// THE DIVERGENCE THIS CLOSES. P4 compares the raw with _id excluded, so the refresh read those four
// answers as IDENTICAL: no archive move, no top-level rewrite. The database took the new order and the
// cache kept the import's. §0.1 says the two writers move together or not at all, and for these four
// they did not. This script puts the database back to what the cache says, which is the state §10.17
// would have produced had it existed two hours earlier.
//
// HOW. The array is not hand-written here: it is REBUILT from the plate's own cached history_hand.json
// through src/lib/mot/vehicle.ts's `interpret` — the import's own path, the same sort by
// (baalut_dt, _id) and the same ownership mapping. No network call is made and no cache file is
// touched, read-only. If a rebuilt array disagrees with the cache on anything but order, the script
// stops rather than write.
//
// `hand` does not change (the same rows, so the same non-dealer count) and is not written.
// `registry_checked_at` stays at the refresh's timestamp: that answer WAS accepted, and this script is
// not a re-check. `updated_at` is set to this script's `now`, by hand, because raw SQL bypasses
// Prisma's @updatedAt.
//
// Dry by default: prints the stored array, the rebuilt array and the difference, and writes nothing.
// `--write` performs the four updates in ONE transaction, and throws unless exactly four rows moved.

import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { plateDir } from "@/lib/mot/fetch";
import { interpret, type RawRows } from "@/lib/mot/vehicle";
import type { OwnershipRow } from "@/lib/refresh/types";

/** The four cars of §8.6, and only these four. */
const PLATES = ["28211803", "35903902", "76903702", "84759901"] as const;

const RESOURCES = ["registry", "cancelled", "inactive", "history_km", "history_hand"] as const;

const WRITE = process.argv.includes("--write");
for (const arg of process.argv.slice(2)) {
  if (arg === "--write") continue;
  throw new Error(`unknown argument ${JSON.stringify(arg)} — this script takes --write and nothing else`);
}

const NOW = new Date();

/** One plate's cached answers, exactly as the import's reader sees them (top level only). */
function readCachedSnapshot(plate: string): RawRows {
  const rows: Record<string, unknown[]> = {};
  for (const key of RESOURCES) {
    const file = path.join(plateDir(plate), `${key}.json`);
    if (!existsSync(file)) continue;
    const body = JSON.parse(readFileSync(file, "utf8")) as { result?: { records?: unknown[] } };
    rows[key] = body.result?.records ?? [];
  }
  return rows as unknown as RawRows;
}

const text = (rows: OwnershipRow[] | null) =>
  rows === null ? "null" : rows.map((r) => `${r.ym}:${r.type}`).join(" → ");

/** Same rows in the same order? */
const identical = (a: OwnershipRow[], b: OwnershipRow[]) =>
  a.length === b.length && a.every((r, i) => r.ym === b[i].ym && r.type === b[i].type);

/** Same multiset of (ym, type)? A re-ordering only — anything else is not ours to repair. */
function sameMultiset(a: OwnershipRow[], b: OwnershipRow[]): boolean {
  const key = (rows: OwnershipRow[]) => rows.map((r) => `${r.ym}:${r.type}`).sort().join("|");
  return key(a) === key(b);
}

async function main() {
  console.log(`${WRITE ? "" : "[DRY RUN] "}revert-reordered-histories — now = ${NOW.toISOString()}`);
  console.log(`§11.2: the four cars of §8.6 return to the import's order, rebuilt from the cache (no network).\n`);

  const cars = await db.cars.findMany({
    where: { license_plate: { in: [...PLATES] } },
    select: { id: true, license_plate: true, hand: true, ownership_history: true },
    orderBy: { license_plate: "asc" },
  });
  if (cars.length !== PLATES.length) {
    throw new Error(`expected ${PLATES.length} cars, found ${cars.length} — ${cars.map((c) => c.license_plate).join(", ")}`);
  }

  const plan: { id: number; plate: string; rebuilt: OwnershipRow[] }[] = [];

  for (const car of cars) {
    const plate = car.license_plate as string;
    const stored = (car.ownership_history ?? null) as OwnershipRow[] | null;
    if (stored === null) throw new Error(`${plate}: ownership_history is null — this script repairs a re-ordering, not a missing record`);

    const lookup = interpret(plate, readCachedSnapshot(plate));
    if (lookup.status !== "active" && lookup.status !== "inactive") {
      throw new Error(`${plate}: the cached answer resolves to ${lookup.status} — stopping rather than rebuilding from it`);
    }
    const rebuilt = lookup.data.ownership_history;
    if (rebuilt === null) throw new Error(`${plate}: the cache rebuilds to no ownership rows at all — stopping`);

    // The only difference this script is allowed to repair is the ORDER. Anything else means the cache
    // and the database disagree about a fact, which is not §11.2's business.
    if (!sameMultiset(stored, rebuilt)) {
      throw new Error(
        `${plate}: the cache and the database differ by more than row order — stopping.\n` +
          `  stored:  ${text(stored)}\n  cache:   ${text(rebuilt)}`,
      );
    }
    if (lookup.data.hand !== car.hand) {
      throw new Error(`${plate}: hand would move ${car.hand} -> ${lookup.data.hand}; §11.2 says it does not change — stopping`);
    }

    console.log(`${plate}`);
    console.log(`  stored (database, the refresh's order): ${text(stored)}`);
    console.log(`  rebuilt (cache, the import's order):    ${text(rebuilt)}`);
    if (identical(stored, rebuilt)) {
      console.log(`  diff: none — already the import's order, nothing to write\n`);
      continue;
    }
    const moved = stored
      .map((r, i) => (r.ym === rebuilt[i].ym && r.type === rebuilt[i].type ? null : `row ${i + 1} ${r.type} → ${rebuilt[i].type} (${r.ym})`))
      .filter((x): x is string => x !== null);
    console.log(`  diff: ${moved.join("; ")}`);
    console.log(`  hand ${car.hand} unchanged · registry_checked_at unchanged · updated_at → ${NOW.toISOString()}\n`);
    plan.push({ id: car.id, plate, rebuilt });
  }

  if (!WRITE) {
    console.log(`[DRY RUN] ${plan.length} car(s) would be written. Nothing was written to the database and nothing under data/raw/.`);
    return;
  }
  if (plan.length !== PLATES.length) {
    throw new Error(`§11.2 expects all ${PLATES.length} cars to need the repair; ${plan.length} do — stopping rather than writing a partial set`);
  }

  const n = await db.$transaction(async (tx) => {
    let rows = 0;
    for (const p of plan) {
      const moved = await tx.$executeRaw`
        UPDATE "cars"
           SET "ownership_history" = ${JSON.stringify(p.rebuilt)}::jsonb,
               "updated_at"        = ${NOW}
         WHERE "id" = ${p.id}`;
      if (moved !== 1) throw new Error(`${p.plate}: the UPDATE touched ${moved} rows, not 1`);
      rows += moved;
    }
    if (rows !== 4) throw new Error(`the repair touched ${rows} rows, not 4 — rolled back`);
    return rows;
  });

  console.log(`written: ${n} rows in one transaction. The cache was not touched.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
