// scripts/oneoff/readback-run2c-a.ts — the read-back of Days 15–16 Run 2c-A (BRIEF §3).
//
// READ-ONLY. It opens no transaction, writes no row and takes no flag: everything it prints is a SELECT
// against what §2's migration (20260913160000_day15_search_results_pointer) left behind.
//
// Three blocks:
//   (a) the columns of search_results from information_schema.columns — listing_scores_id integer present,
//       was_recommended and score_breakdown absent.
//   (b) _prisma_migrations: the count (expect 25) and the last applied migration_name (expect the new folder).
//   (c) the row counts of searches (expect 16) and search_results (expect 547) — the migration changed no row,
//       only columns, so both are unchanged from Run 2b.
//
// Every expectation is checked as well as printed. A mismatch prints FAIL on its own line and the script exits 1.

import "dotenv/config";
import { db } from "@/lib/db";

const EXPECTED_MIGRATION = "20260913160000_day15_search_results_pointer";
const EXPECTED_MIGRATION_COUNT = 25;
const EXPECTED_SEARCHES = 16;
const EXPECTED_SEARCH_RESULTS = 547;

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
  console.log("===== (a) search_results columns =====");
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

  const byName = new Map(columns.map((c) => [c.column_name, c]));
  const pointer = byName.get("listing_scores_id");
  check(
    "listing_scores_id present",
    pointer !== undefined && pointer.data_type === "integer" && pointer.is_nullable === "YES",
    pointer === undefined ? "absent" : `${pointer.data_type}, nullable ${pointer.is_nullable}`,
  );
  check("was_recommended dropped", !byName.has("was_recommended"), byName.has("was_recommended") ? "still present" : "absent");
  check("score_breakdown dropped", !byName.has("score_breakdown"), byName.has("score_breakdown") ? "still present" : "absent");
  check("column count", columns.length === 15, `${columns.length} (expected 15: 16 minus two dropped plus one added)`);
}

async function blockB() {
  console.log("\n===== (b) _prisma_migrations =====");
  const applied = await db.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
    SELECT migration_name, finished_at
      FROM "_prisma_migrations"
     ORDER BY migration_name`;
  console.log(`count: ${applied.length}`);
  const last = applied[applied.length - 1];
  console.log(`last: ${last === undefined ? "(none)" : `${last.migration_name} | finished_at ${last.finished_at?.toISOString() ?? "-"}`}`);
  check("migration count", applied.length === EXPECTED_MIGRATION_COUNT, `${applied.length} (expected ${EXPECTED_MIGRATION_COUNT})`);
  check(
    "last migration",
    last !== undefined && last.migration_name === EXPECTED_MIGRATION,
    `${last?.migration_name ?? "(none)"} (expected ${EXPECTED_MIGRATION})`,
  );
}

async function blockC() {
  console.log("\n===== (c) row counts — unchanged by the migration =====");
  const searches = await db.searches.count();
  const results = await db.search_results.count();
  console.log("table | rows | expected");
  console.log(`searches | ${searches} | ${EXPECTED_SEARCHES}`);
  console.log(`search_results | ${results} | ${EXPECTED_SEARCH_RESULTS}`);
  check("searches rows", searches === EXPECTED_SEARCHES, `${searches} (expected ${EXPECTED_SEARCHES})`);
  check("search_results rows", results === EXPECTED_SEARCH_RESULTS, `${results} (expected ${EXPECTED_SEARCH_RESULTS})`);

  // Both counts came out above the brief's expectation. The migration is DDL only — it cannot add a row — so
  // the extra rows were written before this run. This breakdown says by whom and when; it decides nothing.
  if (searches !== EXPECTED_SEARCHES || results !== EXPECTED_SEARCH_RESULTS) {
    console.log("\n-- breakdown of searches by visitor_id (who wrote the extra rows) --");
    const byVisitor = await db.$queryRaw<
      { visitor_id: string | null; n: bigint; first_at: Date; last_at: Date; result_rows: bigint }[]
    >`SELECT s.visitor_id,
             COUNT(DISTINCT s.id) AS n,
             MIN(s.created_at) AS first_at,
             MAX(s.created_at) AS last_at,
             COUNT(r.id)       AS result_rows
        FROM "searches" s
        LEFT JOIN "search_results" r ON r.search_id = s.id
       GROUP BY s.visitor_id
       ORDER BY MIN(s.created_at)`;
    console.log("visitor_id | searches | search_results | first_at | last_at");
    for (const v of byVisitor) {
      console.log(
        `${v.visitor_id ?? "(null)"} | ${v.n} | ${v.result_rows} | ${v.first_at.toISOString()} | ${v.last_at.toISOString()}`,
      );
    }

    console.log("\n-- searches per day --");
    const byDay = await db.$queryRaw<{ day: Date; n: bigint; result_rows: bigint }[]>`
      SELECT DATE_TRUNC('day', s.created_at) AS day, COUNT(DISTINCT s.id) AS n, COUNT(r.id) AS result_rows
        FROM "searches" s
        LEFT JOIN "search_results" r ON r.search_id = s.id
       GROUP BY 1
       ORDER BY 1`;
    console.log("day | searches | search_results");
    for (const d of byDay) console.log(`${d.day.toISOString().slice(0, 10)} | ${d.n} | ${d.result_rows}`);
  }
}

async function main() {
  await blockA();
  await blockB();
  await blockC();

  console.log(`\n===== ${failures === 0 ? "PASS - every expectation met" : `FAIL - ${failures} expectation(s) missed`} =====`);
  await db.$disconnect();
  if (failures > 0) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exitCode = 1;
});
