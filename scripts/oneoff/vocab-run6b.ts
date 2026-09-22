// scripts/oneoff/vocab-run6b.ts — Day 19 Run 6b-A (BRIEF §1): the display vocabulary print.
//
// READ-ONLY. No writes, no transactions, no --write flag: it only SELECTs and prints.
// Raw SQL only, static strings, no interpolation. Every count is cast with ::int — no BigInt
// reaches the printing.
//
// The screens of Run 6b display values that live in the database. Per the vocabulary rule
// (AGENTS/work) no mapping may be written from a guess, so the real value lists are printed here
// first, copied into REPORT.md, and the run stops. Nothing in this file decides a mapping.
//
//   §1.1  per models.model in the live pool: sub_model (registry-truncated to 12 chars),
//         body_type, fuel_type, transmission, vehicle_class, engine_size — distinct values
//         with live-listing counts.
//   §1.2  dealers.dealer_type over dealers with at least one live listing.
//   §1.3  the ownership-type codes that actually occur: cars.ownership_history[].type plus
//         cars.current_owner_type, over cars with a live listing.
//   §1.4  listings.region on live listings (display is as-stored; awareness only).
//
// live = listings.delisted_at IS NULL.

import "dotenv/config";
import { db } from "@/lib/db";

type ModelFieldRow = { model: string | null; field: string; value: string | null; listings: number };
type DealerTypeRow = { dealer_type: string; dealers: number; listings: number };
type OwnershipRow = { source: string; value: string | null; occurrences: number; cars: number };
type RegionRow = { region: string | null; listings: number };

const show = (v: string | null) => (v === null ? "(null)" : v === "" ? '(empty string "")' : v);

// §1.1 — one row per (model, field, value) over the live pool. The six fields are UNIONed so the
// whole section is one static statement; engine_size is cast to text to sit in the same column.
async function modelFields(): Promise<ModelFieldRow[]> {
  return db.$queryRaw<ModelFieldRow[]>`
    WITH live AS (
      SELECT l.id,
             m.model, m.sub_model, m.body_type, m.fuel_type,
             m.transmission, m.vehicle_class, m.engine_size
      FROM "listings" l
      JOIN "cars"   c ON c.id = l.car_id
      JOIN "models" m ON m.id = c.model_id
      WHERE l.delisted_at IS NULL
    )
    SELECT model, 'sub_model'     AS field, sub_model                AS value, count(*)::int AS listings FROM live GROUP BY model, sub_model
    UNION ALL
    SELECT model, 'body_type'     AS field, body_type                AS value, count(*)::int AS listings FROM live GROUP BY model, body_type
    UNION ALL
    SELECT model, 'fuel_type'     AS field, fuel_type                AS value, count(*)::int AS listings FROM live GROUP BY model, fuel_type
    UNION ALL
    SELECT model, 'transmission'  AS field, transmission             AS value, count(*)::int AS listings FROM live GROUP BY model, transmission
    UNION ALL
    SELECT model, 'vehicle_class' AS field, vehicle_class            AS value, count(*)::int AS listings FROM live GROUP BY model, vehicle_class
    UNION ALL
    SELECT model, 'engine_size'   AS field, engine_size::text        AS value, count(*)::int AS listings FROM live GROUP BY model, engine_size
    ORDER BY model, field, listings DESC, value`;
}

// §1.2 — dealer_type over dealers that have at least one live listing. Both counts are printed:
// how many such dealers carry the code, and how many live listings sit behind them.
async function dealerTypes(): Promise<DealerTypeRow[]> {
  return db.$queryRaw<DealerTypeRow[]>`
    WITH live_dealers AS (
      SELECT d.id, d.dealer_type, count(*)::int AS listings
      FROM "dealers" d
      JOIN "listings" l ON l.dealer_id = d.id AND l.delisted_at IS NULL
      GROUP BY d.id, d.dealer_type
    )
    SELECT dealer_type,
           count(*)::int          AS dealers,
           sum(listings)::int     AS listings
    FROM live_dealers
    GROUP BY dealer_type
    ORDER BY listings DESC, dealer_type`;
}

// §1.3 — the ownership-type codes that actually occur over cars with a live listing:
// every element type inside ownership_history, plus current_owner_type. A car is counted once
// per distinct code; occurrences counts the history rows themselves.
async function ownershipTypes(): Promise<OwnershipRow[]> {
  return db.$queryRaw<OwnershipRow[]>`
    WITH pool AS (
      SELECT DISTINCT c.id, c.ownership_history, c.current_owner_type
      FROM "cars" c
      JOIN "listings" l ON l.car_id = c.id AND l.delisted_at IS NULL
    ),
    hist AS (
      SELECT p.id, elem->>'type' AS value
      FROM pool p,
           LATERAL jsonb_array_elements(p.ownership_history) AS elem
      WHERE p.ownership_history IS NOT NULL
        AND jsonb_typeof(p.ownership_history) = 'array'
    )
    SELECT 'ownership_history[].type' AS source,
           value,
           count(*)::int              AS occurrences,
           count(DISTINCT id)::int    AS cars
    FROM hist
    GROUP BY value
    UNION ALL
    SELECT 'cars.current_owner_type'  AS source,
           current_owner_type         AS value,
           count(*)::int              AS occurrences,
           count(DISTINCT id)::int    AS cars
    FROM pool
    GROUP BY current_owner_type
    ORDER BY source, occurrences DESC, value`;
}

// §1.4 — listings.region on live listings.
async function regions(): Promise<RegionRow[]> {
  return db.$queryRaw<RegionRow[]>`
    SELECT region, count(*)::int AS listings
    FROM "listings"
    WHERE delisted_at IS NULL
    GROUP BY region
    ORDER BY listings DESC, region`;
}

async function main() {
  console.log("=== Run 6b-A §1 — display vocabulary (read-only) ===");
  console.log(`generated_at: ${new Date().toISOString()}`);

  const fields = await modelFields();
  const models = [...new Set(fields.map((r) => r.model))];

  console.log("");
  console.log(`--- §1.1 models fields per model in the live pool (models in pool: ${models.length}) ---`);
  const FIELD_ORDER = ["sub_model", "body_type", "fuel_type", "transmission", "vehicle_class", "engine_size"];
  for (const model of models) {
    const forModel = fields.filter((r) => r.model === model);
    const total = forModel
      .filter((r) => r.field === "sub_model")
      .reduce((sum, r) => sum + r.listings, 0);
    console.log("");
    console.log(`  model: ${show(model)}  (live listings: ${total})`);
    for (const field of FIELD_ORDER) {
      const rows = forModel.filter((r) => r.field === field);
      console.log(`    ${field}:`);
      for (const r of rows) {
        const len = r.value === null ? "" : `  [len ${r.value.length}]`;
        console.log(`      ${String(r.listings).padStart(4)}  ${show(r.value)}${field === "sub_model" ? len : ""}`);
      }
    }
  }

  console.log("");
  console.log("--- §1.2 dealers.dealer_type over dealers with at least one live listing ---");
  for (const r of await dealerTypes()) {
    console.log(`  ${String(r.listings).padStart(4)} listings  ${String(r.dealers).padStart(3)} dealers  ${r.dealer_type}`);
  }

  console.log("");
  console.log("--- §1.3 ownership-type codes that occur (cars with a live listing) ---");
  for (const r of await ownershipTypes()) {
    console.log(
      `  ${r.source.padEnd(24)}  ${String(r.occurrences).padStart(4)} occurrences  ${String(r.cars).padStart(4)} cars  ${show(r.value)}`,
    );
  }

  console.log("");
  console.log("--- §1.4 listings.region on live listings (as stored) ---");
  for (const r of await regions()) {
    console.log(`  ${String(r.listings).padStart(4)}  ${show(r.region)}`);
  }

  console.log("");
  console.log("=== end ===");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
