// scripts/import-new-car-prices.ts
// The Ministry of Transport new-car price list (data/raw/new-car-prices.csv) into new_car_prices (BRIEF Day 12 part 5, §2).
//
// Dry run by default; --write inserts. Required: --published=YYYY-MM-DD — the date shown on the dataset page ("עודכן בתאריך").
// A missing or unparsable date is a stop, never a default.
//
// The file: pipe-delimited, quoted values (the ministry dialect, parsePipeCsv), 10 columns: semel_yevuan, shem_yevuan, sug_degem,
// tozeret_cd, tozeret_nm, degem_cd, degem_nm, shnat_yitzur, mehir, kinuy_mishari. Strict parse — every code, year, price and
// importer code a non-negative integer, sug_degem in {P, M}, every not-null text column non-empty; the first bad row is a stop
// with the row printed. kinuy_mishari (nullable in the table) is stored as null when empty; the count is printed.
// The four-column key (tozeret_cd, degem_cd, shnat_yitzur, sug_degem) must be unique over the file: distinct keys = rows read,
// otherwise stop.
//
// Idempotent per publication: rows with that published_at already in the table → print their count and stop ("already imported"),
// no partial re-import. --write: one createMany per batch, all batches in one transaction (nothing half-imported), then
// select published_at, count(*) from new_car_prices group by 1.
//
// If the table does not exist yet (the migration not applied): the dry run says so and goes on with the file checks; --write stops.
// Day 12 part 6: every row also gets degem_code = makeDegemCode(tozeret_cd, degem_cd) — the same string as models.degem_code.

import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { makeDegemCode } from "@/lib/mot/degem-code";
import { parsePipeCsv } from "@/lib/mot/pipe-csv";
import { RAW_DIR } from "@/lib/mot/resources";

const FILE = path.join(process.cwd(), RAW_DIR, "new-car-prices.csv");
const COLUMNS = ["semel_yevuan", "shem_yevuan", "sug_degem", "tozeret_cd", "tozeret_nm", "degem_cd", "degem_nm", "shnat_yitzur", "mehir", "kinuy_mishari"] as const;
const SUG_DEGEM = ["P", "M"] as const;
const CHUNK = 1000; // rows per createMany
const SAMPLE = 5; // rows printed in the dry run, spread evenly over the file
const TRANSACTION_TIMEOUT_MS = 10 * 60 * 1000;

type Column = (typeof COLUMNS)[number];
type FileRow = Record<Column, string>;
type Insert = {
  tozeret_cd: number;
  degem_cd: number;
  degem_code: string; // makeDegemCode(tozeret_cd, degem_cd)
  shnat_yitzur: number;
  sug_degem: string;
  semel_yevuan: number;
  shem_yevuan: string;
  tozeret_nm: string;
  degem_nm: string;
  kinuy_mishari: string | null;
  mehir: number;
  published_at: Date;
};

// ---------- arguments ----------
const WRITE = process.argv.includes("--write");

function publishedArg(): { text: string; date: Date } {
  const a = process.argv.find((x) => x.startsWith("--published="));
  if (!a) throw new Error("STOP: --published=YYYY-MM-DD is required — the date shown on the dataset page (עודכן בתאריך). No default.");
  const text = a.slice("--published=".length);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) throw new Error(`STOP: --published: expected YYYY-MM-DD, got '${text}'`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error(`STOP: --published: '${text}' is not a calendar date`);
  return { text, date };
}

// ---------- the strict parser ----------
function stopAt(line: number, row: FileRow, what: string): never {
  throw new Error(`STOP: ${path.relative(process.cwd(), FILE)} line ${line}: ${what}\n  row: ${JSON.stringify(row)}`);
}

function int(row: FileRow, col: Column, line: number): number {
  const v = row[col] ?? "";
  if (!/^\d+$/.test(v)) stopAt(line, row, `${col} is not an integer: ${JSON.stringify(v)}`);
  return Number(v);
}

function text(row: FileRow, col: Column, line: number): string {
  const v = row[col] ?? "";
  if (v === "") stopAt(line, row, `${col} is empty (not null in new_car_prices)`);
  return v;
}

function parseFile(published: Date): { inserts: Insert[]; header: string[]; kinuyNull: number } {
  if (!existsSync(FILE)) throw new Error(`STOP: ${FILE} is missing`);
  const content = readFileSync(FILE, "utf8");
  const headerLine = (content.charCodeAt(0) === 0xfeff ? content.slice(1) : content).split(/\r?\n/, 1)[0];
  const header = headerLine.split("|").map((h) => h.replace(/^"|"$/g, "").trim());
  const missing = COLUMNS.filter((c) => !header.includes(c));
  const extra = header.filter((h) => !(COLUMNS as readonly string[]).includes(h));
  if (missing.length || extra.length) {
    throw new Error(`STOP: header differs from the expected ${COLUMNS.length} columns — missing: [${missing.join(", ")}], unexpected: [${extra.join(", ")}]; header is: ${header.join(" | ")}`);
  }
  const raw = parsePipeCsv<FileRow>(content);
  let kinuyNull = 0;
  const inserts = raw.map((row, i) => {
    const line = i + 2;
    const sug = row.sug_degem ?? "";
    if (!(SUG_DEGEM as readonly string[]).includes(sug)) stopAt(line, row, `sug_degem not in {${SUG_DEGEM.join(", ")}}: ${JSON.stringify(sug)}`);
    const kinuy = (row.kinuy_mishari ?? "").trim();
    if (kinuy === "") kinuyNull++;
    const tozeret_cd = int(row, "tozeret_cd", line);
    const degem_cd = int(row, "degem_cd", line);
    const degem_code = makeDegemCode(tozeret_cd, degem_cd); // throws on a non-positive code — a stop
    if (degem_code === null) stopAt(line, row, `degem_code is null for tozeret_cd=${tozeret_cd}, degem_cd=${degem_cd}`);
    return {
      tozeret_cd,
      degem_cd,
      degem_code,
      shnat_yitzur: int(row, "shnat_yitzur", line),
      sug_degem: sug,
      semel_yevuan: int(row, "semel_yevuan", line),
      shem_yevuan: text(row, "shem_yevuan", line),
      tozeret_nm: text(row, "tozeret_nm", line),
      degem_nm: text(row, "degem_nm", line),
      kinuy_mishari: kinuy === "" ? null : kinuy,
      mehir: int(row, "mehir", line),
      published_at: published,
    };
  });
  return { inserts, header, kinuyNull };
}

const keyOf = (r: Insert) => `${r.tozeret_cd}|${r.degem_cd}|${r.shnat_yitzur}|${r.sug_degem}`;

async function tableExists(): Promise<boolean> {
  const rows = await db.$queryRaw<{ exists: boolean }[]>`select exists (select 1 from information_schema.tables where table_schema = current_schema() and table_name = 'new_car_prices') as "exists"`;
  return rows[0]?.exists === true;
}

async function main() {
  const published = publishedArg();
  console.log(`import-new-car-prices — ${WRITE ? "WRITE" : "dry run (no write; pass --write to insert)"}; published_at = ${published.text}; file ${path.relative(process.cwd(), FILE)}`);

  // ---------- the file ----------
  const { inserts, header, kinuyNull } = parseFile(published.date);
  console.log(`header (${header.length} columns): ${header.join(" | ")}`);

  const keys = new Set<string>();
  for (const r of inserts) {
    const k = keyOf(r);
    if (keys.has(k)) throw new Error(`STOP: four-column key ${k.replace(/\|/g, "-")} appears more than once in the file — the key is not unique; nothing inserted`);
    keys.add(k);
  }

  // ---------- the table ----------
  const exists = await tableExists();
  if (!exists) {
    console.log(`table new_car_prices does not exist — the migration is not applied${WRITE ? "" : "; the dry run goes on with the file checks"}`);
    if (WRITE) throw new Error("STOP: --write with no new_car_prices table — apply the migration first");
  } else {
    const existing = await db.new_car_prices.count({ where: { published_at: published.date } });
    if (existing > 0) throw new Error(`STOP: already imported — ${existing} rows with published_at = ${published.text} are in new_car_prices; nothing inserted`);
    console.log(`rows already in new_car_prices with published_at = ${published.text}: 0`);
  }

  // ---------- the summary (dry run and write alike) ----------
  const years = inserts.map((r) => r.shnat_yitzur);
  const p = inserts.filter((r) => r.sug_degem === "P").length;
  const m = inserts.filter((r) => r.sug_degem === "M").length;
  console.log(`rows read:                  ${inserts.length}`);
  console.log(`rows to insert:             ${inserts.length}`);
  console.log(`distinct four-column keys:  ${keys.size} (tozeret_cd, degem_cd, shnat_yitzur, sug_degem)${keys.size === inserts.length ? " = rows read" : " ≠ rows read"}`);
  console.log(`P / M:                      ${p} / ${m}`);
  console.log(`year range:                 ${Math.min(...years)} – ${Math.max(...years)}`);
  console.log(`kinuy_mishari empty → null: ${kinuyNull}`);
  console.log(`sample of ${SAMPLE} rows (spread over the file):`);
  console.log(`  tozeret_cd | degem_cd | degem_code | shnat_yitzur | sug_degem | semel_yevuan | shem_yevuan | tozeret_nm | degem_nm | kinuy_mishari | mehir | published_at`);
  for (let i = 0; i < SAMPLE; i++) {
    const r = inserts[Math.floor((i * (inserts.length - 1)) / (SAMPLE - 1))];
    console.log(`  ${r.tozeret_cd} | ${r.degem_cd} | ${r.degem_code} | ${r.shnat_yitzur} | ${r.sug_degem} | ${r.semel_yevuan} | ${r.shem_yevuan} | ${r.tozeret_nm} | ${r.degem_nm} | ${r.kinuy_mishari ?? "null"} | ${r.mehir} | ${published.text}`);
  }
  if (keys.size !== inserts.length) throw new Error(`STOP: distinct keys ${keys.size} ≠ rows read ${inserts.length}`);

  if (!WRITE) {
    console.log(`\ndry run — nothing written`);
    return;
  }

  // ---------- write ----------
  let inserted = 0;
  await db.$transaction(
    async (tx) => {
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const res = await tx.new_car_prices.createMany({ data: inserts.slice(i, i + CHUNK) });
        inserted += res.count;
        process.stdout.write(`\r  written ${Math.min(i + CHUNK, inserts.length)}/${inserts.length}`);
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: 30000 },
  );
  console.log(`\ninserted: ${inserted}`);
  if (inserted !== inserts.length) throw new Error(`STOP: inserted ${inserted} ≠ rows to insert ${inserts.length}`);

  const counts = await db.$queryRaw<{ published_at: Date; count: bigint }[]>`select published_at, count(*) from new_car_prices group by 1 order by 1`;
  console.log(`\nselect published_at, count(*) from new_car_prices group by 1:`);
  for (const c of counts) console.log(`  ${c.published_at.toISOString().slice(0, 10)}: ${c.count.toString()}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
