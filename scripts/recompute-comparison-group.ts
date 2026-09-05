// scripts/recompute-comparison-group.ts
// Recomputes models.comparison_group for every row from the row's own fields, using groupKey()
// in src/lib/comparison-group.ts, and writes the key back where the stored value differs.
// Run after every change of GROUP_VERSION (Day 10a: version 2, vehicle_class joins the key).
//
// - `--dry-run`: prints counts only (rows checked, rows that would change). Writes nothing.
// - without the flag: writes the changed keys in batches (one UPDATE ... FROM (VALUES ...) per
//   batch, all batches in one transaction) and prints rows changed.
// - Touches models.comparison_group only. market_stats is recomputed separately by
//   scripts/compute-market-stats.ts.
// - Fails loudly: a batch that updates fewer rows than it was given aborts the transaction.

import "dotenv/config";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { GROUP_VERSION, groupKey, type GroupFields } from "@/lib/comparison-group";

const DRY = process.argv.includes("--dry-run");
const BATCH = 1000;

async function main() {
  console.log(`${DRY ? "[DRY RUN] " : ""}recompute-comparison-group - group_version = ${GROUP_VERSION}`);

  const rows = await db.models.findMany({
    select: {
      id: true, comparison_group: true,
      vehicle_class: true, make: true, model: true, body_type: true, fuel_type: true,
      engine_size: true, horsepower: true, transmission: true, drive_type: true, sub_model: true,
    },
    orderBy: { id: "asc" },
  });

  const changes: { id: number; key: string }[] = [];
  for (const r of rows) {
    const fields: GroupFields = {
      vehicle_class: r.vehicle_class,
      make: r.make, model: r.model, body_type: r.body_type, fuel_type: r.fuel_type,
      engine_size: r.engine_size, horsepower: r.horsepower, transmission: r.transmission,
      drive_type: r.drive_type, sub_model: r.sub_model,
    };
    const key = groupKey(fields);
    if (key !== r.comparison_group) changes.push({ id: r.id, key });
  }

  console.log(`rows checked:          ${rows.length}`);
  console.log(`rows that would change: ${changes.length}`);

  if (DRY) {
    console.log("[DRY RUN] nothing written");
    return;
  }

  const changed = await db.$transaction(
    async (tx) => {
      let n = 0;
      for (let i = 0; i < changes.length; i += BATCH) {
        const batch = changes.slice(i, i + BATCH);
        const values = Prisma.join(batch.map((c) => Prisma.sql`(${c.id}::int, ${c.key}::text)`));
        const count = await tx.$executeRaw`
          UPDATE models AS m SET comparison_group = v.key
          FROM (VALUES ${values}) AS v(id, key)
          WHERE m.id = v.id`;
        if (count !== batch.length) {
          throw new Error(`batch at offset ${i}: expected ${batch.length} rows updated, got ${count} - aborted, nothing written`);
        }
        n += count;
        process.stdout.write(`\r  written ${Math.min(i + BATCH, changes.length)}/${changes.length}`);
      }
      return n;
    },
    { timeout: 10 * 60 * 1000 },
  );
  console.log(`\nrows changed:           ${changed}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
