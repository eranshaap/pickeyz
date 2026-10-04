// scripts/build-model-families.ts
// Opening screen, F1 — prints the raw material of the model-families table: candidates are
// (make, spelling key) pairs from `models` (year >= --year-from, the live vehicle class), each with
// the ACTIVE vehicles the ministry's quantities dataset (QUANTITIES_RESOURCE_ID) counts for its
// catalog rows. Printed as makes by fleet share, keys per threshold, and every make's keys.
// It does not cut: the two bars (fleet share per make, active vehicles per spelling) are Eran's.
//
// READ-ONLY BY CONSTRUCTION: Prisma reads only, no --write flag exists, nothing is written to the
// database or to disk (data/raw/mot/ included). Prints to stdout only.
//
// Usage: npx tsx scripts/build-model-families.ts [--year-from=YYYY]   (default 2015)
//
// Exit 1, with the lists printed, when: the live models carry more than one vehicle class; a
// catalog row has no make, model or degem_code; the quantities fields cannot be mapped
// unambiguously; a quantities value is not what its field promises; or one join key appears on two
// quantities rows. None of these is resolved here — the next launch pins it.

import "dotenv/config";
import { pathToFileURL } from "node:url";
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

const PAGE_LIMIT = 10000;

function log(line = "") {
  console.log(line);
}

// Printed already; main's catch only adds the STOPPED line and exits 1.
class Stop extends Error {}

const fmt = (n: number): string => n.toLocaleString("en-US");
const pct = (x: number): string => (x * 100).toFixed(2);

function parseArgs(argv: string[]): { yearFrom: number } {
  let yearFrom = 2015;
  for (const arg of argv) {
    const m = /^--year-from=(\d{4})$/.exec(arg);
    if (m) yearFrom = Number(m[1]);
    else throw new Error(`unknown argument ${JSON.stringify(arg)} — the only flag is --year-from=YYYY`);
  }
  return { yearFrom };
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
  const url = `${MOT_API}?resource_id=${QUANTITIES_RESOURCE_ID}&limit=${PAGE_LIMIT}&offset=${offset}`;
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

// ---------------------------------------------------------------- main

async function main() {
  const { yearFrom } = parseArgs(process.argv.slice(2));
  log(`year-from: ${yearFrom}`);

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
  if (q.fields.some((f) => f.id.toLowerCase() === "sug_degem")) {
    log("note: the quantities dataset carries sug_degem; the join key (tozeret|degem|year) does not use it");
  }

  const fm = mapFields(q.fields);
  log(`field mapping: tozeret=${fm.tozeret} · degem=${fm.degem} · year=${fm.year} · active=${fm.active}`);

  // §5.4: rows below year-from are skipped here, not by a server-side filter.
  type QRow = { tozeretCd: string; degemCd: string; year: number; active: number };
  const inScope: QRow[] = [];
  q.records.forEach((r, i) => {
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
