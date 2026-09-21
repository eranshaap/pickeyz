// scripts/oneoff/readback-run6a.ts — the read-back of Day 19 Run 6a (BRIEF §8).
//
// Raw SQL only, static strings, no interpolation: the script runs the same before and after
// `prisma generate`, so --pre (§0.4, before the migration) and the default mode (after §7) are the
// same binary. Every count is cast with ::int — no BigInt reaches the printing.
//
// It never writes, with one exception: R7 opens ONE interactive transaction that ALWAYS ends by
// throwing, so it always rolls back. Nothing it does survives.
//
//   --pre      P1 row counts · P2 max(listings.updated_at) · P3 the non-internal triggers ·
//              P4 the functions this migration creates (must be none — otherwise it would collide).
//   (default)  P1-P3 again, then R1-R7 against the recorded --pre values.
//
// The --pre values are carried across the migration in the PRE block below, filled by hand from the
// --pre output exactly as the expectation constants of readback-run2c-a.ts are. The default mode
// refuses to run while it is unfilled.

import "dotenv/config";
import { db } from "@/lib/db";

// ---- filled by hand from the --pre run of §0.4 ------------------------------------------------
const PRE = {
  filled: true,
  listings: 257,
  searches: 20,
  search_results: 1670,
  dealer_commercial: 220,
  max_listings_updated_at: "2026-09-19T10:32:20.949Z",
  triggers: ["listings.listings_forbid_delete", "listings.listings_forbid_truncate"] as string[], // "table.trigger_name", sorted
};
// -----------------------------------------------------------------------------------------------

type CountRow = { listings: number; searches: number; search_results: number; dealer_commercial: number };
type TriggerRow = { table_name: string; trigger_name: string };
type FunctionRow = { schema_name: string; function_name: string };

let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  OK   ${label}: ${detail}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}: ${detail}`);
  }
}

const iso = (d: Date | null) => (d === null ? "(null)" : d.toISOString());

async function rowCounts(): Promise<CountRow> {
  const rows = await db.$queryRaw<CountRow[]>`
    SELECT (SELECT count(*)::int FROM "listings")          AS listings,
           (SELECT count(*)::int FROM "searches")          AS searches,
           (SELECT count(*)::int FROM "search_results")    AS search_results,
           (SELECT count(*)::int FROM "dealer_commercial") AS dealer_commercial`;
  return rows[0];
}

async function maxListingsUpdatedAt(): Promise<Date | null> {
  const rows = await db.$queryRaw<{ max_updated_at: Date | null }[]>`
    SELECT max("updated_at") AS max_updated_at FROM "listings"`;
  return rows[0].max_updated_at;
}

async function triggers(): Promise<TriggerRow[]> {
  return db.$queryRaw<TriggerRow[]>`
    SELECT c.relname AS table_name, t.tgname AS trigger_name
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal
       AND c.relname IN ('listings', 'searches', 'dealer_commercial')
     ORDER BY c.relname, t.tgname`;
}

async function functions(): Promise<FunctionRow[]> {
  return db.$queryRaw<FunctionRow[]>`
    SELECT n.nspname AS schema_name, p.proname AS function_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname IN ('set_updated_at', 'tmp_run6a_public_id')
     ORDER BY n.nspname, p.proname`;
}

/** P1-P3 — printed in both modes, so the two outputs sit side by side in the report. */
async function printShared(): Promise<{ counts: CountRow; maxUpdatedAt: Date | null; trg: TriggerRow[] }> {
  console.log("===== P1 row counts =====");
  const counts = await rowCounts();
  console.log("table | rows");
  console.log(`listings | ${counts.listings}`);
  console.log(`searches | ${counts.searches}`);
  console.log(`search_results | ${counts.search_results}`);
  console.log(`dealer_commercial | ${counts.dealer_commercial}`);

  console.log("\n===== P2 max(listings.updated_at) =====");
  const maxUpdatedAt = await maxListingsUpdatedAt();
  console.log(iso(maxUpdatedAt));

  console.log("\n===== P3 non-internal triggers on listings / searches / dealer_commercial =====");
  const trg = await triggers();
  if (trg.length === 0) {
    console.log("(none)");
  } else {
    console.log("table | trigger");
    for (const t of trg) console.log(`${t.table_name} | ${t.trigger_name}`);
  }

  return { counts, maxUpdatedAt, trg };
}

async function pre() {
  const { counts, maxUpdatedAt, trg } = await printShared();

  console.log("\n===== P4 functions named set_updated_at / tmp_run6a_public_id (any schema) =====");
  const fns = await functions();
  if (fns.length === 0) {
    console.log("(none)");
  } else {
    console.log("schema | function");
    for (const f of fns) console.log(`${f.schema_name} | ${f.function_name}`);
  }
  check("no colliding function", fns.length === 0, fns.length === 0 ? "none" : fns.map((f) => `${f.schema_name}.${f.function_name}`).join(", "));

  console.log("\n-- PRE block to copy into this file --");
  console.log(`  filled: true,`);
  console.log(`  listings: ${counts.listings},`);
  console.log(`  searches: ${counts.searches},`);
  console.log(`  search_results: ${counts.search_results},`);
  console.log(`  dealer_commercial: ${counts.dealer_commercial},`);
  console.log(`  max_listings_updated_at: "${iso(maxUpdatedAt)}",`);
  console.log(`  triggers: [${trg.map((t) => `"${t.table_name}.${t.trigger_name}"`).join(", ")}],`);
}

async function post() {
  if (!PRE.filled) {
    throw new Error("the PRE block is not filled — run `--pre` first and copy its block into this file");
  }

  const { counts, maxUpdatedAt, trg } = await printShared();

  console.log("\n===== R1 row counts unchanged =====");
  check("listings", counts.listings === PRE.listings, `${counts.listings} (pre ${PRE.listings})`);
  check("searches", counts.searches === PRE.searches, `${counts.searches} (pre ${PRE.searches})`);
  check("search_results", counts.search_results === PRE.search_results, `${counts.search_results} (pre ${PRE.search_results})`);
  check("dealer_commercial", counts.dealer_commercial === PRE.dealer_commercial, `${counts.dealer_commercial} (pre ${PRE.dealer_commercial})`);

  console.log("\n===== R2 public_id =====");
  const listingIds = await db.$queryRaw<{ rows: number; nulls: number; distinct_ids: number; well_formed: number }[]>`
    SELECT count(*)::int                                                  AS rows,
           count(*) FILTER (WHERE "public_id" IS NULL)::int               AS nulls,
           count(DISTINCT "public_id")::int                               AS distinct_ids,
           count(*) FILTER (WHERE "public_id" ~ '^[a-z0-9]{10}$')::int    AS well_formed
      FROM "listings"`;
  const searchIds = await db.$queryRaw<{ rows: number; nulls: number; distinct_ids: number; well_formed: number }[]>`
    SELECT count(*)::int                                                  AS rows,
           count(*) FILTER (WHERE "public_id" IS NULL)::int               AS nulls,
           count(DISTINCT "public_id")::int                               AS distinct_ids,
           count(*) FILTER (WHERE "public_id" ~ '^[a-z0-9]{10}$')::int    AS well_formed
      FROM "searches"`;
  console.log("table | rows | nulls | distinct | well-formed");
  console.log(`listings | ${listingIds[0].rows} | ${listingIds[0].nulls} | ${listingIds[0].distinct_ids} | ${listingIds[0].well_formed}`);
  console.log(`searches | ${searchIds[0].rows} | ${searchIds[0].nulls} | ${searchIds[0].distinct_ids} | ${searchIds[0].well_formed}`);
  for (const [table, r] of [["listings", listingIds[0]], ["searches", searchIds[0]]] as const) {
    check(`${table} no null public_id`, r.nulls === 0, `${r.nulls} (expected 0)`);
    check(`${table} distinct = rows`, r.distinct_ids === r.rows, `${r.distinct_ids} of ${r.rows}`);
    check(`${table} well-formed = rows`, r.well_formed === r.rows, `${r.well_formed} of ${r.rows}`);
  }

  const listingSamples = await db.$queryRaw<{ id: number; public_id: string }[]>`
    SELECT "id", "public_id" FROM "listings" ORDER BY "id" LIMIT 5`;
  const searchSamples = await db.$queryRaw<{ id: number; public_id: string }[]>`
    SELECT "id", "public_id" FROM "searches" ORDER BY "id" LIMIT 5`;
  console.log("samples listings: " + listingSamples.map((s) => `${s.id}=${s.public_id}`).join(", "));
  console.log("samples searches: " + searchSamples.map((s) => `${s.id}=${s.public_id}`).join(", "));

  console.log("\n===== R3 max(listings.updated_at) untouched by the fill =====");
  check("max(updated_at)", iso(maxUpdatedAt) === PRE.max_listings_updated_at, `${iso(maxUpdatedAt)} (pre ${PRE.max_listings_updated_at})`);

  console.log("\n===== R4 searches.rerun_of — nothing writes it yet =====");
  const rerun = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*) FILTER (WHERE "rerun_of" IS NOT NULL)::int AS n FROM "searches"`;
  check("rerun_of set", rerun[0].n === 0, `${rerun[0].n} (expected 0)`);

  console.log("\n===== R5 dealer_commercial.updated_at =====");
  const dc = await db.$queryRaw<{ rows: number; nulls: number; min_at: Date | null; max_at: Date | null }[]>`
    SELECT count(*)::int                                      AS rows,
           count(*) FILTER (WHERE "updated_at" IS NULL)::int  AS nulls,
           min("updated_at")                                  AS min_at,
           max("updated_at")                                  AS max_at
      FROM "dealer_commercial"`;
  console.log(`rows ${dc[0].rows} | nulls ${dc[0].nulls} | min ${iso(dc[0].min_at)} | max ${iso(dc[0].max_at)}`);
  check("no null updated_at", dc[0].nulls === 0, `${dc[0].nulls} (expected 0)`);
  check("min = max (the migration's moment)", iso(dc[0].min_at) === iso(dc[0].max_at), `${iso(dc[0].min_at)} vs ${iso(dc[0].max_at)}`);

  console.log("\n===== R6 triggers, functions, foreign key =====");
  const found = trg.map((t) => `${t.table_name}.${t.trigger_name}`);
  const expected = [...PRE.triggers, "dealer_commercial.dealer_commercial_set_updated_at", "listings.listings_set_updated_at"].sort();
  check("trigger list", JSON.stringify([...found].sort()) === JSON.stringify(expected), `${found.join(", ") || "(none)"} (expected ${expected.join(", ")})`);

  const fns = await functions();
  const fnNames = fns.map((f) => `${f.schema_name}.${f.function_name}`);
  console.log(`functions: ${fnNames.join(", ") || "(none)"}`);
  check("set_updated_at exists", fns.some((f) => f.function_name === "set_updated_at"), fnNames.join(", ") || "(none)");
  check("tmp_run6a_public_id dropped", !fns.some((f) => f.function_name === "tmp_run6a_public_id"), fnNames.join(", ") || "(none)");

  const fk = await db.$queryRaw<{ conname: string; confdeltype: string; confupdtype: string }[]>`
    SELECT conname, confdeltype::text, confupdtype::text
      FROM pg_constraint
     WHERE conname = 'searches_rerun_of_fkey'`;
  if (fk.length === 0) {
    check("searches_rerun_of_fkey", false, "absent");
  } else {
    console.log(`${fk[0].conname} | confdeltype ${fk[0].confdeltype} | confupdtype ${fk[0].confupdtype}`);
    check("searches_rerun_of_fkey ON DELETE NO ACTION", fk[0].confdeltype === "a", `confdeltype ${fk[0].confdeltype} (expected a)`);
  }

  console.log("\n===== R7 the trigger really fires (transaction always rolled back) =====");
  const before = await db.$queryRaw<{ table_name: string; id: number; updated_at: Date }[]>`
    SELECT 'dealer_commercial' AS table_name, "id", "updated_at" FROM "dealer_commercial" ORDER BY "id" LIMIT 1`;
  const beforeL = await db.$queryRaw<{ table_name: string; id: number; updated_at: Date }[]>`
    SELECT 'listings' AS table_name, "id", "updated_at" FROM "listings" ORDER BY "id" LIMIT 1`;

  class Rollback extends Error {}
  let returnedDc: { id: number; updated_at: Date }[] = [];
  let returnedL: { id: number; updated_at: Date }[] = [];
  const atStart = new Date();
  try {
    await db.$transaction(async (tx) => {
      returnedDc = await tx.$queryRaw<{ id: number; updated_at: Date }[]>`
        UPDATE "dealer_commercial" SET "updated_at" = '2000-01-01T00:00:00Z'
         WHERE "id" = (SELECT min("id") FROM "dealer_commercial")
        RETURNING "id", "updated_at"`;
      returnedL = await tx.$queryRaw<{ id: number; updated_at: Date }[]>`
        UPDATE "listings" SET "updated_at" = '2000-01-01T00:00:00Z'
         WHERE "id" = (SELECT min("id") FROM "listings")
        RETURNING "id", "updated_at"`;
      throw new Rollback("rolling back on purpose");
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }

  console.log("table | id | old updated_at | sent | returned");
  for (const [row, ret] of [[before[0], returnedDc[0]], [beforeL[0], returnedL[0]]] as const) {
    console.log(`${row.table_name} | ${row.id} | ${iso(row.updated_at)} | 2000-01-01T00:00:00.000Z | ${iso(ret.updated_at)}`);
    check(
      `${row.table_name} the database overrode the sent value`,
      ret.updated_at.getTime() >= atStart.getTime(),
      `returned ${iso(ret.updated_at)} (not the year 2000, and at or after the start of this check ${iso(atStart)})`,
    );
  }

  const afterDc = await db.$queryRaw<{ id: number; updated_at: Date }[]>`
    SELECT "id", "updated_at" FROM "dealer_commercial" ORDER BY "id" LIMIT 1`;
  const afterL = await db.$queryRaw<{ id: number; updated_at: Date }[]>`
    SELECT "id", "updated_at" FROM "listings" ORDER BY "id" LIMIT 1`;
  console.log(`after rollback dealer_commercial ${afterDc[0].id}: ${iso(afterDc[0].updated_at)}`);
  console.log(`after rollback listings ${afterL[0].id}: ${iso(afterL[0].updated_at)}`);
  check("dealer_commercial rolled back", iso(afterDc[0].updated_at) === iso(before[0].updated_at), `${iso(afterDc[0].updated_at)} (old ${iso(before[0].updated_at)})`);
  check("listings rolled back", iso(afterL[0].updated_at) === iso(beforeL[0].updated_at), `${iso(afterL[0].updated_at)} (old ${iso(beforeL[0].updated_at)})`);
}

async function main() {
  const isPre = process.argv.includes("--pre");
  console.log(`readback-run6a — ${isPre ? "--pre (before the migration)" : "default (after the migration)"}\n`);
  if (isPre) await pre();
  else await post();

  console.log(`\n===== ${failures === 0 ? "PASS - every expectation met" : `FAIL - ${failures} expectation(s) missed`} =====`);
  await db.$disconnect();
  if (failures > 0) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exitCode = 1;
});
