// scripts/seed-dealer-commercial-demo.ts
// Seeds the demo agreements (BRIEF Day 12 part 2, §12.1): every dealer with at least one live listing
// (listings.delisted_at is null) that has NO open dealer_commercial row gets one row in status demo.
//
// Default is a DRY RUN: it prints the counts and writes nothing. `--write` inserts — one createMany.
// Idempotent: a second run finds every such dealer already open and inserts nothing.
//
//   open row (§13.3)   agreement_end is null OR later than this run's `now`. agreement_status plays no part.
//   the seeded row     agreement_status = 'demo', agreement_start = now (a date column), agreement_end = null.
//                      prisma/schema.prisma: the only other required column is dealer_id; everything else is
//                      optional and stays null.
//   never > 1 open row per dealer   a dealer that already has two or more open rows is a data error → STOP before
//                      anything is written. Dealers with an open row are skipped and counted. Dealers with no live
//                      listing are not touched.
//
// Prints, per dealer_type and in total: dealers seen · to insert · skipped (open row exists). After --write it
// re-reads the table: agreement_status, count(*) grouped, and the open-row count.

import "dotenv/config";
import { db } from "@/lib/db";

const WRITE = process.argv.includes("--write");
const STATUS_DEMO = "demo"; // findCar-schema.md part E / prisma/schema.prisma: agreement_status codes demo | trial | active | suspended

type Counts = { seen: number; insert: number; skipped: number };
const fmtCounts = (c: Counts) => `${c.seen} · ${c.insert} · ${c.skipped}`;

async function statusCounts(): Promise<string> {
  const rows = await db.$queryRaw<{ agreement_status: string; count: bigint }[]>`select agreement_status, count(*) from dealer_commercial group by 1 order by 1`;
  return rows.length ? rows.map((r) => `${r.agreement_status}: ${r.count}`).join(", ") : "(no rows)";
}

async function main() {
  const now = new Date();
  const isOpen = (end: Date | null) => end === null || end > now;

  console.log(`seed-dealer-commercial-demo — ${WRITE ? "WRITE" : "DRY RUN (no --write: nothing is written)"} — now = ${now.toISOString()}`);
  console.log(`open row = agreement_end is null or later than now; seeded rows: agreement_status = '${STATUS_DEMO}', agreement_start = now, agreement_end = null`);
  console.log(`dealer_commercial before: ${await statusCounts()}`);

  // every dealer with at least one live listing, with all its commercial rows
  const dealers = await db.dealers.findMany({
    where: { listings: { some: { delisted_at: null } } },
    select: { id: true, name: true, dealer_type: true, commercial: { select: { id: true, agreement_status: true, agreement_end: true } } },
    orderBy: { id: "asc" },
  });

  const byType = new Map<string, Counts>();
  const total: Counts = { seen: 0, insert: 0, skipped: 0 };
  const toInsert: { id: number; name: string; dealer_type: string }[] = [];
  const broken: string[] = [];
  for (const d of dealers) {
    const c = byType.get(d.dealer_type) ?? { seen: 0, insert: 0, skipped: 0 };
    byType.set(d.dealer_type, c);
    const open = d.commercial.filter((r) => isOpen(r.agreement_end));
    if (open.length > 1) broken.push(`dealer ${d.id} (${d.name}, ${d.dealer_type}): ${open.length} open rows — ids ${open.map((r) => r.id).join(", ")}`);
    c.seen++;
    total.seen++;
    if (open.length > 0) {
      c.skipped++;
      total.skipped++;
    } else {
      c.insert++;
      total.insert++;
      toInsert.push({ id: d.id, name: d.name, dealer_type: d.dealer_type });
    }
  }

  console.log(`\ndealers with a live listing — seen · to insert · skipped (open row exists)`);
  for (const [type, c] of [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${type.padEnd(8)} ${fmtCounts(c)}`);
  console.log(`  ${"total".padEnd(8)} ${fmtCounts(total)}`);

  if (broken.length) {
    for (const b of broken) console.log(`  BROKEN: ${b}`);
    throw new Error(`${broken.length} dealer(s) already have more than one open dealer_commercial row — nothing written`);
  }

  if (!WRITE) {
    console.log(`\ndry run: nothing written. Rows that --write would insert: ${toInsert.length}.`);
    return;
  }
  if (toInsert.length === 0) {
    console.log(`\nnothing to insert — every dealer with a live listing already has an open row.`);
    return;
  }

  const inserted = await db.dealer_commercial.createMany({
    data: toInsert.map((d) => ({ dealer_id: d.id, agreement_status: STATUS_DEMO, agreement_start: now, agreement_end: null })),
  });
  if (inserted.count !== toInsert.length) throw new Error(`createMany inserted ${inserted.count} rows, expected ${toInsert.length}`);
  console.log(`\ninserted ${inserted.count} rows (one createMany).`);
  console.log(`dealer_commercial after: ${await statusCounts()}`);
  const openRows = await db.dealer_commercial.count({ where: { OR: [{ agreement_end: null }, { agreement_end: { gt: now } }] } });
  console.log(`open rows after: ${openRows}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
