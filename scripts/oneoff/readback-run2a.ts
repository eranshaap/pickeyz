// scripts/oneoff/readback-run2a.ts — the single read-back of Days 15–16 Run 2a (BRIEF §3).
//
// READ-ONLY. It opens no transaction, writes no row and takes no flag: everything it prints is a SELECT
// against what §1 (`compute-market-stats --write`, once) and §2 (the `search_results` migration) left behind.
//
// It prints four blocks, in this order:
//   (a) the latest model_stats row per LIVE model — make, model, km_slope, km_slope_n, km_filter_anchors,
//       computed_at. "Live model" is the same predicate the search layer uses: a distinct (make, model) with
//       at least one listing whose delisted_at is null — the listings, never the `models` catalog. The anchors
//       must equal the two arrays §1 printed.
//   (b) the latest pool_stats row's five anchor values — the numbers that closed Finding A of Brief 1b. They
//       must be the six-decimal values §1 wrote, digit for digit.
//   (c) the row counts of pool_stats and model_stats now, against the counts §1 started from. Those starting
//       counts are DERIVED from §1's own write summary (pool_stats: 1 written, model_stats: 2 written), not
//       measured before the write — no snapshot was taken, and none is invented here.
//   (d) search_results as the database now holds it: the column list from information_schema.columns, the
//       foreign keys with their delete rule, the indexes, the trigger list (must be EMPTY — BRIEF §0.2) and
//       the row count (must be 0 — the table is born empty; Run 2b is what fills it).
//
// Every expectation is checked as well as printed. A mismatch prints FAIL on its own line and the script exits 1.

import "dotenv/config";
import { db } from "@/lib/db";

// The two arrays §1 printed, per model. The read-back's whole point is that these came back out of Postgres.
const EXPECTED_ANCHORS: Record<string, number[]> = {
  "מזדה MAZDA 3": [70000, 80000, 100000],
  "יונדאי IONIQ HYBRID": [100000, 120000, 150000],
};

// The five anchor values of the pool row, at 6 dp (BRIEF §3b).
const EXPECTED_POOL = {
  anchor_ratio_intercept: 0.831609,
  anchor_ratio_per_year: -0.041557,
  anchor_error_pct: 4.588443,
  anchor_age_min_years: 3.189596,
  anchor_age_max_years: 6.491444,
};

// What §1's write summary said it appended — the basis for the "started from" counts in (c).
const WRITTEN_BY_SECTION_1 = { pool_stats: 1, model_stats: 2 };

let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  OK   ${label}: ${detail}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}: ${detail}`);
  }
}

async function blockA() {
  console.log("===== (a) latest model_stats row per live model =====");

  // Live models: distinct (make, model) over the cars of listings that are not delisted.
  const live = await db.listings.findMany({
    where: { delisted_at: null },
    select: { car: { select: { model: { select: { make: true, model: true } } } } },
  });
  const pairs = new Map<string, { make: string; model: string }>();
  for (const l of live) {
    const make = l.car.model.make;
    const model = l.car.model.model;
    if (make === null || model === null) continue;
    pairs.set(`${make} ${model}`, { make, model });
  }

  console.log(`live listings: ${live.length} | live models: ${pairs.size}`);
  console.log("make | model | km_slope | km_slope_n | km_filter_anchors | computed_at");

  for (const [display, { make, model }] of [...pairs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const row = await db.model_stats.findFirst({
      where: { make, model },
      orderBy: [{ computed_at: "desc" }, { id: "desc" }],
    });
    if (row === null) {
      failures += 1;
      console.log(`${display} | FAIL - no model_stats row at all`);
      continue;
    }
    const anchors = JSON.stringify(row.km_filter_anchors);
    console.log(
      `${row.make} | ${row.model} | ${row.km_slope} | ${row.km_slope_n} | ${anchors} | ${row.computed_at.toISOString()}`,
    );
    const expected = EXPECTED_ANCHORS[display];
    if (expected === undefined) {
      failures += 1;
      console.log(`  FAIL km_filter_anchors: ${display} is live but §1 printed no anchors for it`);
    } else {
      check("km_filter_anchors", anchors === JSON.stringify(expected), `${anchors} (expected ${JSON.stringify(expected)})`);
    }
  }
}

async function blockB() {
  console.log("\n===== (b) latest pool_stats row: the five anchor values =====");
  const row = await db.pool_stats.findFirst({ orderBy: [{ computed_at: "desc" }, { id: "desc" }] });
  if (row === null) {
    failures += 1;
    console.log("  FAIL - no pool_stats row at all");
    return;
  }
  console.log(`pool_stats id ${row.id} | computed_at ${row.computed_at.toISOString()} | n ${row.anchor_n} | listings ${row.anchor_listings}`);
  for (const [column, expected] of Object.entries(EXPECTED_POOL)) {
    const value = row[column as keyof typeof EXPECTED_POOL];
    check(column, value === expected, `${value} (expected ${expected})`);
  }
}

async function blockC() {
  console.log("\n===== (c) norm table row counts =====");
  const pool_now = await db.pool_stats.count();
  const model_now = await db.model_stats.count();
  const pool_before = pool_now - WRITTEN_BY_SECTION_1.pool_stats;
  const model_before = model_now - WRITTEN_BY_SECTION_1.model_stats;
  console.log("table | started from (derived from §1's write summary) | now | delta");
  console.log(`pool_stats | ${pool_before} | ${pool_now} | +${WRITTEN_BY_SECTION_1.pool_stats}`);
  console.log(`model_stats | ${model_before} | ${model_now} | +${WRITTEN_BY_SECTION_1.model_stats}`);
  check("pool_stats rows", pool_before >= 1, `${pool_before} row(s) before the write - the table was not empty`);
  check("model_stats rows", model_before >= 2, `${model_before} row(s) before the write - both models were already there`);
}

async function blockD() {
  console.log("\n===== (d) search_results as the database holds it =====");

  const columns = await db.$queryRaw<
    { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]
  >`SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'search_results'
     ORDER BY ordinal_position`;
  console.log(`columns (${columns.length}):`);
  console.log("column_name | data_type | nullable | default");
  for (const c of columns) {
    console.log(`${c.column_name} | ${c.data_type} | ${c.is_nullable} | ${c.column_default ?? "-"}`);
  }
  check("column count", columns.length === 16, `${columns.length} (expected 16)`);

  const fks = await db.$queryRaw<
    { constraint_name: string; column_name: string; foreign_table: string; foreign_column: string; delete_rule: string }[]
  >`SELECT tc.constraint_name,
           kcu.column_name,
           ccu.table_name  AS foreign_table,
           ccu.column_name AS foreign_column,
           rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = 'search_results' AND tc.constraint_type = 'FOREIGN KEY'
     ORDER BY tc.constraint_name`;
  console.log("\nforeign keys:");
  console.log("constraint | column | references | delete_rule");
  for (const f of fks) {
    console.log(`${f.constraint_name} | ${f.column_name} | ${f.foreign_table}.${f.foreign_column} | ${f.delete_rule}`);
  }
  check("foreign keys", fks.length === 2, `${fks.length} (expected 2: search_id, listing_id)`);
  check(
    "delete rule",
    fks.length === 2 && fks.every((f) => f.delete_rule === "RESTRICT"),
    fks.map((f) => `${f.column_name}=${f.delete_rule}`).join(", ") || "none",
  );
  const pointerColumns = ["market_stats_id", "model_stats_id", "pool_stats_id", "new_car_price_id"];
  check(
    "the four snapshot pointers carry no FK (§0.2)",
    fks.every((f) => !pointerColumns.includes(f.column_name)),
    pointerColumns.join(", "),
  );

  const indexes = await db.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'search_results'
     ORDER BY indexname`;
  console.log("\nindexes:");
  for (const i of indexes) console.log(`${i.indexname} | ${i.indexdef}`);
  check("indexes", indexes.length === 3, `${indexes.length} (expected 3: the primary key + search_id + listing_id)`);

  // Only real triggers: the RI triggers a foreign key installs are internal and are not user triggers.
  const triggers = await db.$queryRaw<{ tgname: string }[]>`
    SELECT t.tgname FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'search_results' AND NOT t.tgisinternal
     ORDER BY t.tgname`;
  console.log(`\ntriggers: ${triggers.length === 0 ? "(none)" : triggers.map((t) => t.tgname).join(", ")}`);
  check("no trigger (§0.2)", triggers.length === 0, `${triggers.length} trigger(s)`);

  const rows = await db.search_results.count();
  console.log(`\nrows: ${rows}`);
  check("born empty", rows === 0, `count() = ${rows}`);
}

async function main() {
  await blockA();
  await blockB();
  await blockC();
  await blockD();

  console.log(`\n===== ${failures === 0 ? "PASS - every expectation met" : `FAIL - ${failures} expectation(s) missed`} =====`);
  await db.$disconnect();
  if (failures > 0) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exitCode = 1;
});
