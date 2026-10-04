// scripts/build-model-families.ts
// Opening screen, F1 — prints the raw material of the model-families table: candidates are
// (make, spelling key) pairs from `models` (year >= --year-from, the live vehicle class), each with
// the ACTIVE vehicles the ministry's quantities dataset (QUANTITIES_RESOURCE_ID) counts for its
// catalog rows. Printed as makes by fleet share, keys per threshold, and every make's keys.
// It does not cut: the two bars (fleet share per make, active vehicles per spelling) are Eran's.
//
// F2 (--sheet): after the same loading and join, the F1 printing is skipped; catalog makes fold by
// MAKE_MERGES, model names by mergeKey, names group by groupKey, and every name of a group with at least
// FAMILY_GROUP_MIN_ACTIVE active vehicles is written to data/raw/model-families.xlsx (two tabs: models
// and makes; the decision columns empty except the English make). An existing file is overwritten.
//
// READ-ONLY ON THE DATABASE BY CONSTRUCTION: Prisma reads only, no --write flag exists. Without --sheet
// nothing is written to disk (data/raw/mot/ included) and the output is stdout only; with --sheet the one
// file written is data/raw/model-families.xlsx.
//
// Usage: npx tsx scripts/build-model-families.ts [--year-from=YYYY] [--sheet]   (default FAMILIES_YEAR_FROM)
//
// Exit 1, with the lists printed, when: the live models carry more than one vehicle class; a
// catalog row has no make, model or degem_code; the quantities fields cannot be mapped
// unambiguously; a quantities value is not what its field promises; the dataset has sug_degem and no
// record carries the live class; or one join key appears on two quantities rows. None of these is resolved here — the next launch pins it.
// --sheet adds: a live model without make or model; a canonical make with a kept group and no MAKES
// entry (nothing is written; the entry is added in the next launch).

import "dotenv/config";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { motGet } from "@/lib/mot/fetch";
import { MOT_API, QUANTITIES_RESOURCE_ID } from "@/lib/mot/resources";
import {
  bucketCounts,
  distribution,
  quantityKey,
  type CatalogRow,
  type KeyStat,
} from "@/lib/families/distribution";
import { FAMILIES_YEAR_FROM, FAMILY_GROUP_MIN_ACTIVE } from "@/lib/families/constants";
import { buildSheet, liveKey, missingMakeEntries, type MakeRow, type ModelRow, type SheetInput } from "@/lib/families/sheet";
import { MAKE_MERGES, MAKES, MAKES_HEADERS, MAKES_TAB, MODELS_HEADERS, MODELS_TAB, YES } from "@/lib/families/words";

const PAGE_LIMIT = 10000;
const SHEET_PATH = fileURLToPath(new URL("../data/raw/model-families.xlsx", import.meta.url));

function log(line = "") {
  console.log(line);
}

// Printed already; main's catch only adds the STOPPED line and exits 1.
class Stop extends Error {}

const fmt = (n: number): string => n.toLocaleString("en-US");
const pct = (x: number): string => (x * 100).toFixed(2);

function parseArgs(argv: string[]): { yearFrom: number; sheet: boolean } {
  let yearFrom = FAMILIES_YEAR_FROM;
  let sheet = false;
  for (const arg of argv) {
    const m = /^--year-from=(\d{4})$/.exec(arg);
    if (m) yearFrom = Number(m[1]);
    else if (arg === "--sheet") sheet = true;
    else throw new Error(`unknown argument ${JSON.stringify(arg)} — the only flags are --year-from=YYYY and --sheet`);
  }
  return { yearFrom, sheet };
}

// ---------------------------------------------------------------- vehicle class (§5.2)

async function liveVehicleClass(): Promise<string> {
  const found = await db.models.findMany({
    where: { cars: { some: { listings: { some: { delisted_at: null } } } } },
    distinct: ["vehicle_class"],
    select: { vehicle_class: true },
  });
  const classes = found.map((r) => r.vehicle_class);
  if (classes.length !== 1 || classes[0] === null) {
    log(`vehicle classes over the live models (${classes.length}):`);
    for (const c of classes) log(`  ${JSON.stringify(c)}`);
    throw new Stop("expected exactly one non-empty vehicle class among the live models");
  }
  return classes[0];
}

// ---------------------------------------------------------------- catalog rows (§5.3)

async function catalogRows(yearFrom: number, vehicleClass: string): Promise<CatalogRow[]> {
  const models = await db.models.findMany({
    where: { year: { gte: yearFrom }, vehicle_class: vehicleClass },
    select: { id: true, make: true, model: true, vehicle_class: true, degem_code: true, year: true },
    orderBy: { id: "asc" },
  });

  const rows: CatalogRow[] = [];
  const problems: string[] = [];
  for (const m of models) {
    // models has no tozeret_cd / degem_cd columns: degem_code is "tozeret_cd-degem_cd", both positive
    // integers without leading zeros (src/lib/mot/degem-code.ts makeDegemCode).
    const code = /^(\d+)-(\d+)$/.exec(m.degem_code ?? "");
    const missing = [
      !m.make?.trim() && "make",
      !m.model?.trim() && "model",
      !code && `degem_code=${JSON.stringify(m.degem_code)}`,
      m.year === null && "year",
    ].filter(Boolean);
    if (missing.length > 0 || !code || m.year === null) {
      problems.push(`  models.id ${m.id}: ${missing.join(", ")}`);
      continue;
    }
    rows.push({
      make: m.make!,
      model: m.model!,
      vehicleClass: vehicleClass,
      tozeretCd: code[1],
      degemCd: code[2],
      year: m.year,
    });
  }
  if (problems.length > 0) {
    log(`catalog rows that cannot be placed (${problems.length}):`);
    for (const p of problems) log(p);
    throw new Stop("catalog rows without make, model or a tozeret-degem code — not skipped");
  }
  return rows;
}

// ---------------------------------------------------------------- quantities (§5.4)

type Field = { id: string; type: string };
type QuantitiesRecord = Record<string, unknown>;
type QuantitiesPage = { result?: { records?: QuantitiesRecord[]; total?: number; fields?: Field[] } };

// motGet's body type declares records only; the answer's text carries the whole result, total and
// fields included, so the page is read from the text.
async function fetchPage(offset: number): Promise<{ records: QuantitiesRecord[]; total: number; fields: Field[] }> {
  // F1b §9.2: sort=_id gives offset paging a stable order, so each row comes back exactly once.
  const url = `${MOT_API}?resource_id=${QUANTITIES_RESOURCE_ID}&limit=${PAGE_LIMIT}&offset=${offset}&sort=_id`;
  const { text } = await motGet<QuantitiesRecord>(url);
  const page = JSON.parse(text) as QuantitiesPage;
  const records = page.result?.records;
  const total = page.result?.total;
  const fields = page.result?.fields;
  if (!Array.isArray(records) || typeof total !== "number" || !Array.isArray(fields)) {
    throw new Error(
      `quantities offset ${offset}: the answer has no records array, numeric total or fields array — ` +
        `records=${Array.isArray(records)}, total=${JSON.stringify(total)}, fields=${Array.isArray(fields)}`,
    );
  }
  return { records, total, fields };
}

async function fetchQuantities(): Promise<{ records: QuantitiesRecord[]; total: number; fields: Field[]; pages: number }> {
  const first = await fetchPage(0);
  const records = [...first.records];
  let pages = 1;
  let offset = PAGE_LIMIT;
  while (offset < first.total) {
    const page = await fetchPage(offset);
    if (page.total !== first.total) {
      throw new Error(`quantities: total changed while paging — ${first.total} on page 1, ${page.total} at offset ${offset}`);
    }
    if (page.records.length === 0) {
      throw new Error(`quantities: an empty page at offset ${offset} before total ${first.total} was reached`);
    }
    records.push(...page.records);
    pages++;
    offset += PAGE_LIMIT;
  }
  if (records.length !== first.total) {
    throw new Error(`quantities: fetched ${records.length} records, the answer's total is ${first.total}`);
  }
  return { records, total: first.total, fields: first.fields, pages };
}

type FieldMap = { tozeret: string; degem: string; year: string; active: string };

const COUNT_WORDS = ["kamut", "cnt", "count", "mispar"];
const STATUS_WORDS = ["pail", "status"];
// "lo pail" / "le pail" is inactive, as in the inactive-vehicles resource (rechev_le_pail_with_degem).
const INACTIVE = /(^|_)(lo|le)_?pail/;

// §5.4: map the four fields by name, case-insensitive; anything ambiguous prints the list and stops.
function mapFields(fields: Field[]): FieldMap {
  const names = fields.map((f) => f.id).filter((id) => id !== "_id");
  const exact = (want: string): string[] => names.filter((n) => n.toLowerCase() === want);
  const counts = names.filter((n) => COUNT_WORDS.some((w) => n.toLowerCase().includes(w)));
  const statuses = names.filter(
    (n) => !counts.includes(n) && STATUS_WORDS.some((w) => n.toLowerCase().includes(w)),
  );

  const problems: string[] = [];
  const one = (label: string, found: string[]): string => {
    if (found.length !== 1) problems.push(`${label}: ${found.length} candidates [${found.join(", ")}]`);
    return found[0] ?? "";
  };
  const tozeret = one("tozeret code (tozeret_cd)", exact("tozeret_cd"));
  const degem = one("degem code (degem_cd)", exact("degem_cd"));
  const year = one("model year (shnat_yitzur)", exact("shnat_yitzur"));

  let active = "";
  if (statuses.length > 0) {
    // One count split by a status field: which value means active is not read from a name.
    problems.push(
      `active count: the dataset has a status field [${statuses.join(", ")}] beside the count fields ` +
        `[${counts.join(", ")}] — which status value is active is pinned in the next launch`,
    );
  } else if (counts.length === 1) {
    active = counts[0];
    log(`active count field: ${active} (the only count field)`);
  } else if (counts.length > 1) {
    const activeCounts = counts.filter((n) => n.toLowerCase().includes("pail") && !INACTIVE.test(n.toLowerCase()));
    if (activeCounts.length === 1) {
      active = activeCounts[0];
      log(`active count field: ${active} (of the count fields ${counts.join(", ")})`);
    } else {
      problems.push(
        `active count: ${counts.length} count fields [${counts.join(", ")}], ${activeCounts.length} of them read as active`,
      );
    }
  } else {
    problems.push(`active count: no field name contains ${COUNT_WORDS.join(" / ")}`);
  }

  if (problems.length > 0) {
    log("FIELD MAPPING FAILED:");
    for (const p of problems) log(`  ${p}`);
    log("fields:");
    for (const f of fields) log(`  ${f.id}  ${f.type}`);
    throw new Stop("the quantities fields cannot be mapped unambiguously");
  }
  return { tozeret, degem, year, active };
}

function codeOf(v: unknown, field: string, at: number): string {
  if (typeof v !== "number" && typeof v !== "string") {
    throw new Error(`quantities record ${at}: ${field} = ${JSON.stringify(v)} — not a code`);
  }
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) throw new Error(`quantities record ${at}: ${field} = ${JSON.stringify(v)} — not digits`);
  return s;
}

function intOf(v: unknown, field: string, at: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN;
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`quantities record ${at}: ${field} = ${JSON.stringify(v)} — not a non-negative integer`);
  }
  return n;
}

// ---------------------------------------------------------------- the review sheet (F2, §10.7)

// §10.7.1: the (make, model) pairs of models rows that have a car with a live listing.
async function livePairs(): Promise<Set<string>> {
  const found = await db.models.findMany({
    where: { cars: { some: { listings: { some: { delisted_at: null } } } } },
    distinct: ["make", "model"],
    select: { make: true, model: true },
  });
  const blank = found.filter((r) => !r.make?.trim() || !r.model?.trim());
  if (blank.length > 0) {
    log(`live models without make or model (${blank.length}):`);
    for (const r of blank) log(`  make=${JSON.stringify(r.make)} model=${JSON.stringify(r.model)}`);
    throw new Stop("a live model without make or model — the live flag cannot be placed");
  }
  return new Set(found.map((r) => liveKey(r.make!, r.model!)));
}

const MODELS_WIDTHS = [28, 12, 28, 10, 11, 8, 28, 28, 28];
const MAKES_WIDTHS = [28, 10, 28, 28, 28];

function addTab(wb: ExcelJS.Workbook, name: string, headers: readonly string[], widths: number[], rows: (string | number | null)[][]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1, rightToLeft: true }] });
  ws.columns = headers.map((header, i) => ({ header, width: widths[i] }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  return ws;
}

async function writeSheet(models: ModelRow[], makes: MakeRow[]) {
  if (!existsSync(dirname(SHEET_PATH))) throw new Error(`the folder ${dirname(SHEET_PATH)} does not exist`);
  const wb = new ExcelJS.Workbook();
  const modelsTab = addTab(
    wb,
    MODELS_TAB,
    MODELS_HEADERS,
    MODELS_WIDTHS,
    models.map((m) => [m.catalogMake, m.group, m.catalogName, m.active, m.years, m.live ? YES : null, m.englishMake, null, null]),
  );
  modelsTab.getColumn(4).numFmt = "#,##0";
  const makesTab = addTab(
    wb,
    MAKES_TAB,
    MAKES_HEADERS,
    MAKES_WIDTHS,
    makes.map((m) => [m.catalogSpellings, m.active, m.english, null, null]),
  );
  makesTab.getColumn(2).numFmt = "#,##0";
  await wb.xlsx.writeFile(SHEET_PATH);
}

async function sheetMode(rows: CatalogRow[], quantities: Map<string, number>) {
  const live = await livePairs();
  log(`live (make, model) pairs: ${fmt(live.size)}`);

  const input: SheetInput = {
    rows: rows.map((r) => ({ ...r, active: quantities.get(quantityKey(r.tozeretCd, r.degemCd, r.year)) ?? 0 })),
    live,
    makeMerges: MAKE_MERGES,
    makes: MAKES,
    minActive: FAMILY_GROUP_MIN_ACTIVE,
  };

  // §10.7.2: a canonical make with a kept group needs a MAKES entry; none -> print and stop, nothing written.
  const missing = missingMakeEntries(input);
  if (missing.length > 0) {
    log(`canonical makes with a kept group and no MAKES entry (${missing.length}):`);
    for (const m of missing) {
      log(`  ${m.make}`);
      for (const g of m.groups) log(`    ${fmt(g.total).padStart(12)}  ${g.key}`);
    }
    throw new Stop("a make with a kept group has no entry in MAKES (src/lib/families/words.ts) — nothing written");
  }

  const { models, makes } = buildSheet(input);
  await writeSheet(models, makes);

  const groups = new Set(models.map((m) => `${m.catalogMake}|${m.group}`)).size;
  const summary: [string, string][] = [
    ["minimum active per group", fmt(FAMILY_GROUP_MIN_ACTIVE)],
    ["canonical makes in the sheet", fmt(makes.length)],
    ["kept groups", fmt(groups)],
    ["names in the sheet", fmt(models.length)],
    ["  of them below the bar on their own", fmt(models.filter((m) => m.active < FAMILY_GROUP_MIN_ACTIVE).length)],
    ["make spellings folded (MAKE_MERGES)", fmt(makes.reduce((n, m) => n + m.spellings.length - 1, 0))],
    ["model spellings folded (mergeKey)", fmt(models.reduce((n, m) => n + m.spellings.length - 1, 0))],
    ["live names", fmt(models.filter((m) => m.live).length)],
  ];
  log("");
  log("SHEET");
  const labelWidth = Math.max(...summary.map(([l]) => l.length));
  for (const [l, v] of summary) log(`  ${l.padEnd(labelWidth)}  ${v.padStart(12)}`);
  log(`  written: ${SHEET_PATH}`);
}

// ---------------------------------------------------------------- main

async function main() {
  const { yearFrom, sheet } = parseArgs(process.argv.slice(2));
  log(`year-from: ${yearFrom}${sheet ? " · mode: --sheet" : ""}`);

  const vehicleClass = await liveVehicleClass();
  log(`vehicle class: ${vehicleClass}`);

  const rows = await catalogRows(yearFrom, vehicleClass);
  log(`catalog rows: ${fmt(rows.length)} · makes: ${fmt(new Set(rows.map((r) => r.make)).size)}`);

  const q = await fetchQuantities();
  log(`quantities: ${q.pages} pages fetched · total ${fmt(q.total)}`);
  log("quantities fields:");
  for (const f of q.fields) log(`  ${f.id}  ${f.type}`);
  log("quantities first 3 records:");
  for (const r of q.records.slice(0, 3)) log(`  ${JSON.stringify(r)}`);
  const fm = mapFields(q.fields);
  log(`field mapping: tozeret=${fm.tozeret} · degem=${fm.degem} · year=${fm.year} · active=${fm.active}`);

  // F1b §9.1: one tozeret|degem|year key can be both private and commercial, so when the dataset
  // carries sug_degem only the live class's records are kept — before the year filter, the
  // duplicate-key check and the join. Without sug_degem every record is kept, as before.
  const classField = q.fields.find((f) => f.id.toLowerCase() === "sug_degem")?.id;
  let classRecords = q.records.map((r, i) => ({ r, i }));
  if (classField !== undefined) {
    const classOf = (v: unknown, at: number): string => {
      if (typeof v !== "string" && typeof v !== "number") {
        throw new Error(`quantities record ${at}: ${classField} = ${JSON.stringify(v)} — not a class value`);
      }
      return String(v).trim().toUpperCase();
    };
    const byClass = new Map<string, number>();
    for (const { r, i } of classRecords) {
      const c = classOf(r[classField], i);
      byClass.set(c, (byClass.get(c) ?? 0) + 1);
    }
    log(`quantities records by ${classField} (all years):`);
    for (const [c, n] of byClass) log(`  ${JSON.stringify(c)}  ${fmt(n)}`);
    const want = vehicleClass.trim().toUpperCase();
    classRecords = classRecords.filter(({ r, i }) => classOf(r[classField], i) === want);
    if (classRecords.length === 0) {
      throw new Stop(`no quantities record carries the live vehicle class ${JSON.stringify(want)}`);
    }
    log(`kept for class ${want}: ${fmt(classRecords.length)}`);
  }

  // §5.4: rows below year-from are skipped here, not by a server-side filter.
  type QRow = { tozeretCd: string; degemCd: string; year: number; active: number };
  const inScope: QRow[] = [];
  classRecords.forEach(({ r, i }) => {
    const year = intOf(r[fm.year], fm.year, i);
    if (year < yearFrom) return;
    inScope.push({
      tozeretCd: codeOf(r[fm.tozeret], fm.tozeret, i),
      degemCd: codeOf(r[fm.degem], fm.degem, i),
      year,
      active: intOf(r[fm.active], fm.active, i),
    });
  });

  // §5.5: look at both sides' key forms before joining.
  log("join key samples, catalog side:");
  for (const r of rows.slice(0, 5)) log(`  ${quantityKey(r.tozeretCd, r.degemCd, r.year)}`);
  log("join key samples, quantities side:");
  for (const r of inScope.slice(0, 5)) log(`  ${quantityKey(r.tozeretCd, r.degemCd, r.year)}`);

  const leadingZero = (s: string) => /^0\d/.test(s);
  const catalogZeros = rows.some((r) => leadingZero(r.tozeretCd) || leadingZero(r.degemCd));
  const quantitiesZeros = inScope.some((r) => leadingZero(r.tozeretCd) || leadingZero(r.degemCd));
  if (catalogZeros !== quantitiesZeros) {
    const strip = (s: string) => String(Number(s));
    for (const r of rows) {
      r.tozeretCd = strip(r.tozeretCd);
      r.degemCd = strip(r.degemCd);
    }
    for (const r of inScope) {
      r.tozeretCd = strip(r.tozeretCd);
      r.degemCd = strip(r.degemCd);
    }
    log(
      `key forms differ: leading zeros on the ${catalogZeros ? "catalog" : "quantities"} side only — ` +
        "both sides normalized to the number without leading zeros",
    );
  } else {
    log(`key forms: the same on both sides (leading zeros: ${catalogZeros ? "both" : "neither"}) — no normalization`);
  }

  const quantities = new Map<string, number>();
  const duplicates = new Map<string, number>();
  for (const r of inScope) {
    const k = quantityKey(r.tozeretCd, r.degemCd, r.year);
    if (quantities.has(k)) duplicates.set(k, (duplicates.get(k) ?? 1) + 1);
    quantities.set(k, r.active);
  }
  if (duplicates.size > 0) {
    log(`join keys on more than one in-scope quantities row: ${fmt(duplicates.size)}; the first 20:`);
    for (const [k, n] of [...duplicates].slice(0, 20)) log(`  ${k}  x${n}`);
    throw new Stop("one join key on two quantities rows — summing or choosing is not decided here");
  }

  // F2: the same loading and join; the F1 printing below is skipped.
  if (sheet) {
    await sheetMode(rows, quantities);
    return;
  }

  const catalogKeys = new Set(rows.map((r) => quantityKey(r.tozeretCd, r.degemCd, r.year)));
  const orphanQuantities = [...quantities.keys()].filter((k) => !catalogKeys.has(k)).length;

  const d = distribution(rows, quantities);
  const keyCount = d.makes.reduce((sum, m) => sum + m.keys.length, 0);

  // ---------------------------------------------------------------- output (§5.6)
  log("");
  log("SUMMARY");
  const summary: [string, string][] = [
    ["year-from", String(yearFrom)],
    ["vehicle class", vehicleClass],
    ["catalog rows", fmt(rows.length)],
    ["makes", fmt(d.makes.length)],
    ["keys", fmt(keyCount)],
    ["quantities rows fetched", fmt(q.records.length)],
    ["quantities rows in scope (year >= from)", fmt(inScope.length)],
    ["matched catalog rows", fmt(d.matchedRows)],
    ["unmatched catalog rows", fmt(d.unmatchedRows)],
    ["in-scope quantities rows with no catalog row", fmt(orphanQuantities)],
    ["total active (matched)", fmt(d.totalActive)],
  ];
  const labelWidth = Math.max(...summary.map(([l]) => l.length));
  for (const [l, v] of summary) log(`  ${l.padEnd(labelWidth)}  ${v.padStart(12)}`);

  log("");
  log("MAKES");
  const makeWidth = Math.max(4, ...d.makes.map((m) => m.make.length));
  log(`${"rank".padStart(4)}  ${"make".padEnd(makeWidth)}  ${"active".padStart(12)}  ${"share %".padStart(8)}  ${"cum %".padStart(8)}  ${"keys".padStart(6)}`);
  d.makes.forEach((m, i) => {
    log(
      `${String(i + 1).padStart(4)}  ${m.make.padEnd(makeWidth)}  ${fmt(m.active).padStart(12)}  ` +
        `${pct(m.share).padStart(8)}  ${pct(m.cumulativeShare).padStart(8)}  ${fmt(m.keys.length).padStart(6)}`,
    );
  });

  log("");
  log("KEYS BY ACTIVE");
  log(bucketCounts(d.makes).map((b) => `>= ${fmt(b.threshold)}: ${fmt(b.keys)}`).join(" · "));

  const spellingsNote = (k: KeyStat): string =>
    k.spellings.length === 1 && k.spellings[0].raw === k.key
      ? ""
      : `  (${k.spellings.map((s) => `${JSON.stringify(s.raw)} ${s.rows}`).join(", ")})`;

  for (const m of d.makes) {
    log("");
    log(`== ${m.make}  active ${fmt(m.active)}`);
    for (const k of m.keys) {
      log(
        `  ${fmt(k.active).padStart(12)}  ${fmt(k.rows).padStart(5)} rows  ${k.years[0]}-${k.years[1]}  ${k.key}${spellingsNote(k)}`,
      );
    }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
    .then(() => db.$disconnect())
    .catch(async (e) => {
      console.error("\nSTOPPED:", (e as Error).message);
      await db.$disconnect();
      process.exit(1);
    });
}
