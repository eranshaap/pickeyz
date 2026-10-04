// scripts/import-model-families.ts
// Opening screen, F3 — imports the model families from the review file (REVIEW_FILE,
// data/raw/model-families-review.xlsx, two tabs: models and makes), the only place the families table is
// edited. It brings three things in the database to be like the file: makes, model_families, and
// models.family_id on every catalog row. It runs again after every change to the file.
//
// Identity is by name: a make = its English name; a family = (make English name, family English name). The
// same key is the same row and the same id; the Hebrew name and the aliases are updated in place. A family
// the file no longer has hands its searches to the family where most of its catalog rows went, and is
// deleted. searches.model_searched is frozen text — never touched. Every rule lives in
// src/lib/families/review.ts; this file reads the workbook and the database, prints the plan, and writes it.
//
// Day 12's rule: a DRY RUN unless `--write` is given. A parse problem or a stop prints and exits 1, and
// nothing is written.
//
// Usage: npx tsx scripts/import-model-families.ts [--write]

import "dotenv/config";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db, WRITE_TRANSACTION_OPTIONS } from "@/lib/db";
import { dataRows, headerColumns, readWorkbook, worksheetByName } from "@/lib/excel/read";
import { FAMILIES_YEAR_FROM } from "@/lib/families/constants";
import {
  familyLabel, parseReview, planImport, ReviewFileError,
  type DbState, type FamilyRef, type ImportPlan, type ReviewFile, type TextRow,
} from "@/lib/families/review";
import { MAKES_HEADERS, MAKES_TAB, MODELS_HEADERS, MODELS_TAB, REVIEW_FILE } from "@/lib/families/words";

const REVIEW_PATH = fileURLToPath(new URL(`../${REVIEW_FILE}`, import.meta.url));
const IDS_PER_STATEMENT = 1000;

// F1's rule: no argument = dry run; --write = write; anything else stops by name.
function parseArgs(argv: string[]): { write: boolean } {
  let write = false;
  for (const a of argv) {
    if (a === "--write") write = true;
    else throw new Error(`unknown argument ${JSON.stringify(a)} — the only flag is --write`);
  }
  return { write };
}

function log(line = "") {
  console.log(line);
}

const list = (a: string[]) => `[${a.map((s) => JSON.stringify(s)).join(", ")}]`;

// ---------------------------------------------------------------- 1. the file

function readTab(wb: Awaited<ReturnType<typeof readWorkbook>>, tab: string, headers: readonly string[]): TextRow[] {
  const ws = worksheetByName(wb, tab);
  const columns = headerColumns(ws, 1, headers, "exact");
  // dataRows skips the rows whose cells are all empty; the cells go in header order, untrimmed.
  return dataRows(ws, 2, columns).map((r) => ({ row: r.row, cells: headers.map((h) => r.values[h]) }));
}

// ---------------------------------------------------------------- 2. the database (four reads)

async function loadState(): Promise<DbState> {
  const makes = await db.makes.findMany({ select: { id: true, name_en: true, name_he: true, aliases: true }, orderBy: { id: "asc" } });
  const families = await db.model_families.findMany({
    select: { id: true, make_id: true, name_en: true, name_he: true, aliases: true },
    orderBy: { id: "asc" },
  });
  const catalog = await db.models.findMany({
    select: { id: true, make: true, model: true, family_id: true, vehicle_class: true, year: true },
    orderBy: { id: "asc" },
  });
  const grouped = await db.searches.groupBy({ by: ["family_id"], where: { family_id: { not: null } }, _count: { _all: true } });
  const searches = new Map<number, number>();
  for (const g of grouped) searches.set(g.family_id!, g._count._all);
  return { makes, families, catalog, searches };
}

// ---------------------------------------------------------------- 3. printing

function printFile(file: ReviewFile) {
  const left = file.rows.filter((r) => r.left).length;
  log("=== FILE ===");
  log(
    `models tab: ${file.rows.length} rows, ${file.rows.length - left} with a model, ${left} left out; ` +
      `families: ${file.families.length}; makes tab: ${file.makes.length} makes`,
  );
}

function printPlan(plan: ImportPlan) {
  const c = plan.counts;
  log("=== CATALOG ===");
  log(
    `catalog rows: ${c.catalog}; set from null: ${c.setFromNull}; moved: ${c.moved}; cleared: ${c.cleared}; ` +
      `unchanged: ${c.unchanged}; outside: ${c.outside} (of them P and year >= ${FAMILIES_YEAR_FROM}: ${c.outsideInScope})`,
  );
  log("per family:");
  for (const r of plan.familyRows) log(`  ${familyLabel(r.family.makeEn, r.family.nameEn)}: ${r.rows} catalog rows`);

  log("=== MAKES ===");
  log(`create: ${plan.makeCreates.length}`);
  for (const m of plan.makeCreates) log(`  ${m.nameEn}`);
  log(`update: ${plan.makeUpdates.length}`);
  for (const u of plan.makeUpdates) {
    const what = [
      u.nameHe && `name_he ${JSON.stringify(u.nameHe.before)} -> ${JSON.stringify(u.nameHe.after)}`,
      u.aliases && `aliases ${list(u.aliases.before)} -> ${list(u.aliases.after)}`,
    ].filter(Boolean);
    log(`  ${u.nameEn}: ${what.join("; ")}`);
  }
  log(`delete: ${plan.makeDeletes.length}`);
  for (const d of plan.makeDeletes) log(`  ${d.nameEn}`);

  log("=== FAMILIES ===");
  log(`create: ${plan.familyCreates.length}`);
  for (const f of plan.familyCreates) log(`  ${f.key}`);
  log(`update: ${plan.familyUpdates.length}`);
  for (const u of plan.familyUpdates) {
    const what = [
      u.nameHe && `name_he ${JSON.stringify(u.nameHe.before)} -> ${JSON.stringify(u.nameHe.after)}`,
      u.aliases && `aliases ${list(u.aliases.before)} -> ${list(u.aliases.after)}`,
    ].filter(Boolean);
    log(`  ${u.key}: ${what.join("; ")}`);
  }
  log(`delete: ${plan.familyDeletes.length}`);
  for (const d of plan.familyDeletes) {
    log(d.move === null || d.move.searchesMoved === 0
      ? `  ${d.key}${d.move ? ` -> ${d.move.toKey}` : ""}: no searches`
      : `  ${d.key} -> ${d.move.toKey}: ${d.move.searchesMoved} searches`);
  }
}

// Read-only: listings with delisted_at null -> their cars -> the cars' models rows -> the planned family.
async function printLive(plan: ImportPlan) {
  const live = await db.listings.findMany({
    where: { delisted_at: null },
    select: { car: { select: { model_id: true, model: { select: { make: true, model: true } } } } },
  });
  const perFamily = new Map<string, { line: string; n: number }>();
  // F3b §3.3: the live listings outside every family, per catalog name.
  const outside = new Map<string, number>();
  for (const l of live) {
    const f = plan.targetOf.get(l.car.model_id) ?? null;
    if (f === null) {
      const name = plan.targetOf.has(l.car.model_id)
        ? `${l.car.model.make ?? "?"} ${l.car.model.model ?? "?"}`
        : "(no catalog row)";
      outside.set(name, (outside.get(name) ?? 0) + 1);
      continue;
    }
    const k = familyLabel(f.makeEn, f.nameEn);
    const e = perFamily.get(k) ?? { line: `${k} (${f.nameHe})`, n: 0 };
    perFamily.set(k, e);
    e.n += 1;
  }
  log("=== LIVE ===");
  for (const e of [...perFamily.values()].sort((a, b) => b.n - a.n)) log(`${e.line}: ${e.n} live listings`);
  log(`live listings outside every family: ${[...outside.values()].reduce((s, n) => s + n, 0)}`);
  for (const [name, n] of [...outside].sort((a, b) => b[1] - a[1])) log(`  ${name}: ${n}`);
}

function printStops(stops: string[]) {
  log("=== STOPS ===");
  for (const s of stops.length > 0 ? stops : ["none"]) log(s);
}

// ---------------------------------------------------------------- 4. the write (steps 1-5, one transaction)

async function write(plan: ImportPlan) {
  await db.$transaction(async (tx) => {
    // 1. Makes upsert.
    const makeIds = new Map<string, number>();
    for (const m of plan.makeCreates) {
      const created = await tx.makes.create({ data: { name_en: m.nameEn, name_he: m.nameHe, aliases: m.aliases }, select: { id: true } });
      makeIds.set(`new:${m.nameEn}`, created.id);
    }
    for (const u of plan.makeUpdates) {
      await tx.makes.update({
        where: { id: u.id },
        data: { ...(u.nameHe && { name_he: u.nameHe.after }), ...(u.aliases && { aliases: u.aliases.after }) },
      });
    }

    // 2. Families upsert; a created family's id is known before step 3 uses it.
    const familyIds = new Map<string, number>();
    for (const f of plan.familyCreates) {
      const makeId = typeof f.makeId === "number" ? f.makeId : makeIds.get(f.makeId);
      if (makeId === undefined) throw new Error(`family ${f.key}: the make ${f.makeId} was not created in step 1`);
      const created = await tx.model_families.create({
        data: { make_id: makeId, name_en: f.nameEn, name_he: f.nameHe, aliases: f.aliases },
        select: { id: true },
      });
      familyIds.set(`new:${f.key}`, created.id);
    }
    for (const u of plan.familyUpdates) {
      await tx.model_families.update({
        where: { id: u.id },
        data: { ...(u.nameHe && { name_he: u.nameHe.after }), ...(u.aliases && { aliases: u.aliases.after }) },
      });
    }
    const resolve = (ref: FamilyRef): number => {
      if (typeof ref === "number") return ref;
      const id = familyIds.get(ref);
      if (id === undefined) throw new Error(`the family ${ref} was not created in step 2`);
      return id;
    };

    // 3. Catalog mapping: one group per target, at most IDS_PER_STATEMENT ids per statement.
    for (const w of plan.catalogWrites) {
      const familyId = w.familyId === null ? null : resolve(w.familyId);
      for (let i = 0; i < w.ids.length; i += IDS_PER_STATEMENT) {
        const ids = w.ids.slice(i, i + IDS_PER_STATEMENT);
        const done = await tx.models.updateMany({ where: { id: { in: ids } }, data: { family_id: familyId } });
        if (done.count !== ids.length) throw new Error(`models -> family ${String(w.familyId)}: ${done.count} rows updated, ${ids.length} planned`);
      }
    }

    // 4. Vanished families: the searches move, then the family is deleted.
    for (const d of plan.familyDeletes) {
      if (d.move !== null && d.move.searchesMoved > 0) {
        const done = await tx.searches.updateMany({ where: { family_id: d.move.fromId }, data: { family_id: resolve(d.move.toId) } });
        if (done.count !== d.move.searchesMoved) {
          throw new Error(`searches ${d.key} -> ${d.move.toKey}: ${done.count} rows moved, ${d.move.searchesMoved} planned`);
        }
      }
      await tx.model_families.delete({ where: { id: d.id } });
    }

    // 5. Makes delete.
    for (const d of plan.makeDeletes) await tx.makes.delete({ where: { id: d.id } });
  }, WRITE_TRANSACTION_OPTIONS);
}

// ---------------------------------------------------------------- main

async function main() {
  const { write: doWrite } = parseArgs(process.argv.slice(2));

  // The file is read whole before the database is touched.
  if (!existsSync(REVIEW_PATH)) throw new Error(`the review file ${REVIEW_PATH} does not exist`);
  const wb = await readWorkbook(REVIEW_PATH);
  const modelsRows = readTab(wb, MODELS_TAB, MODELS_HEADERS);
  const makesRows = readTab(wb, MAKES_TAB, MAKES_HEADERS);

  let file: ReviewFile;
  try {
    file = parseReview(modelsRows, makesRows);
  } catch (e) {
    if (!(e instanceof ReviewFileError)) throw e;
    log("=== FILE ===");
    for (const p of e.problems) log(p);
    printStops(e.problems);
    throw new Error(`the review file has ${e.problems.length} problem(s) — nothing written`);
  }

  const state = await loadState();
  const plan = planImport(file, state);

  printFile(file);
  printPlan(plan);
  await printLive(plan);
  printStops(plan.stops);

  if (plan.stops.length > 0) throw new Error(`${plan.stops.length} stop(s) — nothing written`);
  if (!doWrite) {
    log("DRY RUN — nothing written");
    return;
  }

  await write(plan);
  const c = plan.counts;
  log(
    `WRITTEN — makes: create ${plan.makeCreates.length}, update ${plan.makeUpdates.length}, delete ${plan.makeDeletes.length}; ` +
      `families: create ${plan.familyCreates.length}, update ${plan.familyUpdates.length}, delete ${plan.familyDeletes.length}; ` +
      `catalog: set from null ${c.setFromNull}, moved ${c.moved}, cleared ${c.cleared}; ` +
      `searches moved ${plan.familyDeletes.reduce((n, d) => n + (d.move?.searchesMoved ?? 0), 0)}`,
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
