import { readFileSync } from "node:fs";

// The script owns its environment: .env is read here, before the database client is created.
function loadEnv(file = ".env") {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  if (!process.env.DATABASE_URL) loadEnv();
  const { db } = await import("../src/lib/db");
  const { buildModelRows } = await import("../src/lib/mot/catalog");

  const { rows, report } = buildModelRows();
  console.log("catalog rows:         ", report.catalog_rows);
  console.log("rows to import:       ", report.rows, "(one per class+code+year)");
  console.log("skipped, no year:     ", report.skipped_no_year);
  console.log("skipped, no class:    ", report.skipped_no_class);
  console.log("broken pairs skipped: ", report.broken_pairs);
  console.log("recycled codes:       ", report.recycled_codes, "(same class+pair, different car in other years)");
  for (const s of report.recycled_sample) {
    console.log("  ", s.code);
    for (const v of s.variants) console.log("      ", v.years.padEnd(28), v.spec);
  }
  console.log("model-name merges:    ", report.model_name_merges);

  if (report.duplicate_conflicts.length > 0) {
    console.error(`\nDUPLICATE CONFLICTS: ${report.duplicate_conflicts.length} identities appear twice with different specs:`);
    for (const c of report.duplicate_conflicts.slice(0, 20)) console.error(" ", c.key, c.variants);
    console.error("\nImport aborted — decide how to treat these before writing anything.");
    process.exit(1);
  }

  const before = await db.models.count();
  console.log("\nmodels rows before:  ", before);

  let inserted = 0;
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await db.models.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
    inserted += res.count;
    process.stdout.write(`\r  written ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  console.log(`\ninserted: ${inserted}, skipped (already present): ${rows.length - inserted}`);
  console.log("models rows after:   ", await db.models.count());

  // The twins must land in one comparison group, year by year.
  const twins = await db.models.findMany({
    where: { degem_code: { in: ["588-342", "588-353", "588-364"] } },
    select: { vehicle_class: true, degem_code: true, year: true, model: true, comparison_group: true },
    orderBy: [{ year: "asc" }, { degem_code: "asc" }],
  });
  console.log("\ntwins:");
  for (const t of twins) console.log(" ", t.vehicle_class, t.degem_code, t.year, "|", t.model, "|", t.comparison_group);

  await db.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});