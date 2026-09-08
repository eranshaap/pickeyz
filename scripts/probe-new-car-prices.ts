// scripts/probe-new-car-prices.ts
// Read-only probe of the Ministry of Transport new-car price list (BRIEF Day 12 part 3, §7). Reads
// data/raw/new-car-prices.csv and the database; writes nothing — no table, no migration, no update.
//
// The file (as published): semel_yevuan, shem_yevuan, sug_degem, tozeret_cd, tozeret_nm, degem_cd, degem_nm, shnat_yitzur,
// mehir, kinuy_mishari (the brief also lists an `id_` column; the header is printed so a difference is visible). Pipe-delimited,
// quoted values, maybe a BOM — parsed with the same parsePipeCsv the catalog uses. Codes, years and prices are compared as numbers.
//
// Join: cars → models (model_id) → degem_code "tozeret_cd-degem_cd" (makeDegemCode's shape) split into the pair; the year is
// cars.year. File key = (tozeret_cd, degem_cd, shnat_yitzur). `cars` has no commercial-name / trim field of its own; the
// registry fields that could correspond to the file's kinuy_mishari are on `models`: models.model (the catalog's kinuy_mishari,
// normalised at import) and models.sub_model (the catalog's ramat_gimur). Neither is joined on — both are reported as
// candidates, with a side-by-side comparison against the file's kinuy_mishari for every matched car.
//
// Reports: 1. the file — rows, year range, every row for the demo's (tozeret_cd, degem_cd) pairs. 2. match rate on the demo
// cars — matched on codes + year, the kinuy_mishari candidate check, unmatched cars, keys matching more than one file row.
// 3. every live listing whose car matched — price / new price as a percent, sorted; the distribution per year; the count at
// or above 100%. A car whose key matches several file rows with different prices is listed with its price range and kept out
// of the distribution (counted). The "usable anchor" paragraph (§7.4) is written in REPORT.md, not here.
// 4. (part 4 §3) the whole-file duplicate check over ALL rows: keys (tozeret_cd, degem_cd, shnat_yitzur) with more than one row
// and what differs between their rows; the same with the importer in the key; examples; the share per manufacturer; the count
// of rows with a missing or non-numeric code, year or price (counted before the strict parse, which stops on the first one).

import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { parsePipeCsv } from "@/lib/mot/pipe-csv";
import { RAW_DIR } from "@/lib/mot/resources";

const FILE = path.join(process.cwd(), RAW_DIR, "new-car-prices.csv");
const JOIN_COLUMNS = ["tozeret_cd", "degem_cd", "shnat_yitzur", "mehir", "kinuy_mishari", "sug_degem", "semel_yevuan", "shem_yevuan", "degem_nm", "tozeret_nm"];
const YEARS_REPORTED = [2021, 2022, 2023]; // §7.3: the distribution per year
// part 4 §3 — report format only
const DUPE_EXAMPLES = 10; // §3.4: examples, chosen to cover the combinations found
const MANUFACTURERS_TOP = 10; // §3.5: manufacturers by duplicate keys
const NUMERIC_COLUMNS = ["tozeret_cd", "degem_cd", "shnat_yitzur", "mehir"] as const; // §3.6
// §3.2: the non-key columns compared between the rows of one key — the five the brief names, then the two display names
// that follow a code (shem_yevuan follows semel_yevuan, tozeret_nm follows tozeret_cd), reported apart.
const DIFF_COLUMNS: { col: keyof FileRow; label: string; named: boolean }[] = [
  { col: "semel_yevuan", label: "importer", named: true },
  { col: "mehir", label: "price", named: true },
  { col: "kinuy_mishari", label: "kinuy", named: true },
  { col: "sug_degem", label: "sug_degem", named: true },
  { col: "degem_nm", label: "degem_nm", named: true },
  { col: "shem_yevuan", label: "shem_yevuan (importer name)", named: false },
  { col: "tozeret_nm", label: "tozeret_nm (manufacturer name)", named: false },
];

type FileRow = {
  semel_yevuan: string;
  shem_yevuan: string;
  sug_degem: string;
  tozeret_cd: string;
  tozeret_nm: string;
  degem_cd: string;
  degem_nm: string;
  shnat_yitzur: string;
  mehir: string;
  kinuy_mishari: string;
};

type Parsed = FileRow & { t: number; d: number; y: number; price: number; line: number };

function log(line = "") {
  console.log(line);
}

function num(v: string, what: string, line: number): number {
  const s = (v ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`${FILE} line ${line}: ${what} is not numeric: ${JSON.stringify(v)}`);
  return Number(s);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pct(n: number): string {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}

// The catalog importer's normalisation of kinuy_mishari (src/lib/mot/catalog.ts canonicalModelNames): trim, upper-case,
// collapse whitespace. The space-insensitive form also drops spaces ("MAZDA 3" ~ "MAZDA3"), for the candidate check only.
function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}
function normNoSpace(s: string | null | undefined): string {
  return norm(s).replace(/ /g, "");
}

async function main() {
  // ---------- the file ----------
  if (!existsSync(FILE)) throw new Error(`STOP: ${FILE} is missing — download it by hand next to the other raw sources`);
  const text = readFileSync(FILE, "utf8");
  const hasBom = text.charCodeAt(0) === 0xfeff;
  const headerLine = (hasBom ? text.slice(1) : text).split(/\r?\n/, 1)[0];
  const header = headerLine.split("|").map((h) => h.replace(/^"|"$/g, "").trim());
  const missing = JOIN_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`STOP: ${FILE}: columns missing from the header: ${missing.join(", ")} — header is: ${header.join(" | ")}`);
  const raw = parsePipeCsv<FileRow>(text);
  // §3.6 — counted before the strict parse below, which stops on the first bad value (printed in section 4)
  const badCounts = NUMERIC_COLUMNS.map((col) => {
    let missing = 0;
    let nonNumeric = 0;
    raw.forEach((r) => {
      const v = (r[col] ?? "").trim();
      if (v === "") missing++;
      else if (!/^-?\d+(\.\d+)?$/.test(v)) nonNumeric++;
    });
    return { col, missing, nonNumeric };
  });
  if (badCounts.some((b) => b.missing || b.nonNumeric)) {
    for (const b of badCounts) log(`${b.col}: missing ${b.missing}, non-numeric ${b.nonNumeric}`);
  }
  const rows: Parsed[] = raw.map((r, i) => ({
    ...r,
    t: num(r.tozeret_cd, "tozeret_cd", i + 2),
    d: num(r.degem_cd, "degem_cd", i + 2),
    y: num(r.shnat_yitzur, "shnat_yitzur", i + 2),
    price: num(r.mehir, "mehir", i + 2),
    line: i + 2,
  }));
  const years = rows.map((r) => r.y);

  log(`probe-new-car-prices — read-only; file ${path.relative(process.cwd(), FILE)}`);
  log(`\n===== 1. THE FILE =====`);
  log(`header (${header.length} columns${hasBom ? ", UTF-8 BOM present" : ", no BOM"}): ${header.join(" | ")}`);
  if (!header.includes("id_")) log(`note: the brief lists an id_ column; the file has none. Not used by the join.`);
  log(`rows: ${rows.length}`);
  log(`year range: ${Math.min(...years)} – ${Math.max(...years)}`);
  log(`sug_degem values: ${[...new Set(rows.map((r) => r.sug_degem))].sort().join(", ")}`);

  // index by key
  const byKey = new Map<string, Parsed[]>();
  for (const r of rows) {
    const k = `${r.t}|${r.d}|${r.y}`;
    const list = byKey.get(k);
    if (list) list.push(r);
    else byKey.set(k, [r]);
  }

  // ---------- the demo cars ----------
  const cars = await db.cars.findMany({
    include: {
      model: { select: { id: true, vehicle_class: true, degem_code: true, year: true, make: true, model: true, sub_model: true } },
      listings: { where: { delisted_at: null }, select: { id: true, price: true } },
    },
    orderBy: { id: "asc" },
  });
  type Car = (typeof cars)[number] & { t: number; d: number; y: number; plate: string };
  const demo: Car[] = cars.map((c) => {
    const plate = c.license_plate ?? "?";
    if (c.model.degem_code === null) throw new Error(`car ${c.id} (${plate}): models.degem_code is null`);
    const m = /^(\d+)-(\d+)$/.exec(c.model.degem_code);
    if (!m) throw new Error(`car ${c.id} (${plate}): models.degem_code '${c.model.degem_code}' is not 'tozeret_cd-degem_cd'`);
    if (c.year === null) throw new Error(`car ${c.id} (${plate}): cars.year is null`);
    if (c.model.year !== null && c.model.year !== c.year) throw new Error(`car ${c.id} (${plate}): cars.year ${c.year} != models.year ${c.model.year}`);
    return { ...c, t: Number(m[1]), d: Number(m[2]), y: c.year, plate };
  });
  const pairs = [...new Set(demo.map((c) => `${c.t}|${c.d}`))].map((p) => p.split("|").map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  log(`\ndemo cars: ${demo.length}; live listings on them: ${demo.reduce((n, c) => n + c.listings.length, 0)}`);
  log(`demo (tozeret_cd, degem_cd) pairs: ${pairs.map(([t, d]) => `${t}-${d}`).join(", ")}`);
  log(`\nfile rows for the demo pairs (every year, every trim, every importer):`);
  log(`sug_degem | tozeret_cd | tozeret_nm | degem_cd | degem_nm | shnat_yitzur | mehir | kinuy_mishari | semel_yevuan | shem_yevuan`);
  const demoRows = rows.filter((r) => pairs.some(([t, d]) => r.t === t && r.d === d)).sort((a, b) => a.t - b.t || a.d - b.d || a.y - b.y || a.price - b.price);
  for (const r of demoRows) {
    log(`${r.sug_degem} | ${r.t} | ${r.tozeret_nm} | ${r.d} | ${r.degem_nm} | ${r.y} | ${r.price} | ${r.kinuy_mishari} | ${r.semel_yevuan} | ${r.shem_yevuan}`);
  }
  log(`(${demoRows.length} rows)`);

  // ---------- 2. match rate ----------
  log(`\n===== 2. MATCH RATE on the demo cars (${demo.length}) =====`);
  const matchOf = new Map<number, Parsed[]>(); // car id -> file rows on (tozeret_cd, degem_cd, year)
  for (const c of demo) matchOf.set(c.id, byKey.get(`${c.t}|${c.d}|${c.y}`) ?? []);
  const matched = demo.filter((c) => matchOf.get(c.id)!.length > 0);
  const unmatched = demo.filter((c) => matchOf.get(c.id)!.length === 0);
  log(`matched on (tozeret_cd, degem_cd, shnat_yitzur): ${matched.length} of ${demo.length}`);

  log(`\nkinuy_mishari — the candidate registry fields (cars has no commercial-name / trim field; both live on models):`);
  log(`  models.model     = the catalog's kinuy_mishari, normalised at import (upper-case, whitespace collapsed, spelling variants merged)`);
  log(`  models.sub_model = the catalog's ramat_gimur (trim level)`);
  log(`  candidate check on the ${matched.length} matched cars — the file's kinuy_mishari vs models.model (not a join):`);
  let exact = 0;
  let spaceless = 0;
  let different = 0;
  const seenCombos = new Map<string, number>();
  for (const c of matched) {
    const fileNames = [...new Set(matchOf.get(c.id)!.map((r) => r.kinuy_mishari))];
    const isExact = fileNames.every((n) => norm(n) === norm(c.model.model));
    const isSpaceless = fileNames.every((n) => normNoSpace(n) === normNoSpace(c.model.model));
    if (isExact) exact++;
    else if (isSpaceless) spaceless++;
    else different++;
    const combo = `file '${fileNames.join("' / '")}' | models.model '${c.model.model}' | models.sub_model '${c.model.sub_model}' → ${isExact ? "exact" : isSpaceless ? "equal without spaces" : "different"}`;
    seenCombos.set(combo, (seenCombos.get(combo) ?? 0) + 1);
  }
  log(`  exact (after the import normalisation): ${exact}; equal only without spaces ("MAZDA 3" ~ "MAZDA3"): ${spaceless}; different: ${different}`);
  for (const [combo, n] of [...seenCombos.entries()].sort((a, b) => b[1] - a[1])) log(`    ${n.toString().padStart(3)} × ${combo}`);
  const subModelHits = matched.filter((c) => c.model.sub_model && matchOf.get(c.id)!.some((r) => normNoSpace(r.kinuy_mishari).includes(normNoSpace(c.model.sub_model)))).length;
  log(`  matched cars whose models.sub_model (ramat_gimur) appears inside the file's kinuy_mishari: ${subModelHits} of ${matched.length}`);

  log(`\nunmatched (${unmatched.length}):`);
  if (unmatched.length) log(`car | plate | tozeret_cd | degem_cd | year | make | model | sub_model | file rows for the pair in other years`);
  for (const c of unmatched) {
    const otherYears = rows.filter((r) => r.t === c.t && r.d === c.d).map((r) => r.y);
    log(`${c.id} | ${c.plate} | ${c.t} | ${c.d} | ${c.y} | ${c.model.make} | ${c.model.model} | ${c.model.sub_model} | ${otherYears.length ? [...new Set(otherYears)].sort().join(", ") : "none"}`);
  }

  const multiKeys = [...new Set(matched.filter((c) => matchOf.get(c.id)!.length > 1).map((c) => `${c.t}|${c.d}|${c.y}`))];
  log(`\nkeys matching more than one file row: ${multiKeys.length}`);
  for (const k of multiKeys) {
    const list = byKey.get(k)!;
    const carsOnKey = matched.filter((c) => `${c.t}|${c.d}|${c.y}` === k).length;
    log(`  ${k.replace(/\|/g, "-")} (${carsOnKey} demo cars): ${list.map((r) => `${r.price} (${r.sug_degem}, importer ${r.semel_yevuan} ${r.shem_yevuan}, ${r.degem_nm}, ${r.kinuy_mishari}, line ${r.line})`).join(" · ")}`);
  }

  // ---------- 3. live listings vs new price ----------
  log(`\n===== 3. LIVE LISTINGS whose car matched — price / new price =====`);
  type Line = { plate: string; year: number; trim: string; price: number; newPrices: number[]; pct: number | null; listing: number };
  const lines: Line[] = [];
  for (const c of matched) {
    const newPrices = [...new Set(matchOf.get(c.id)!.map((r) => r.price))].sort((a, b) => a - b);
    for (const l of c.listings) {
      lines.push({
        plate: c.plate,
        year: c.y,
        trim: `${c.model.model} ${c.model.sub_model ?? "-"}`,
        price: l.price,
        newPrices,
        pct: newPrices.length === 1 ? (l.price / newPrices[0]) * 100 : null,
        listing: l.id,
      });
    }
  }
  const single = lines.filter((l) => l.pct !== null).sort((a, b) => (b.pct as number) - (a.pct as number) || a.listing - b.listing);
  const ambiguous = lines.filter((l) => l.pct === null);
  log(`listings: ${lines.length} (${single.length} with one new price, ${ambiguous.length} whose key has several new prices — listed apart, kept out of the distribution)`);
  log(`plate | listing | year | trim (models.model + sub_model) | price | new price | price / new price`);
  for (const l of single) log(`${l.plate} | ${l.listing} | ${l.year} | ${l.trim} | ${l.price} | ${l.newPrices[0]} | ${pct(l.pct as number)}`);
  if (ambiguous.length) {
    log(`\nseveral new prices on the key (not in the distribution):`);
    log(`plate | listing | year | trim | price | new prices | price / new price (range)`);
    for (const l of ambiguous) {
      const lo = (l.price / Math.max(...l.newPrices)) * 100;
      const hi = (l.price / Math.min(...l.newPrices)) * 100;
      log(`${l.plate} | ${l.listing} | ${l.year} | ${l.trim} | ${l.price} | ${l.newPrices.join(" / ")} | ${pct(lo)} – ${pct(hi)}`);
    }
  }

  log(`\ndistribution of price / new price (${single.length} listings):`);
  log(`year | n | min | median | max | at or above 100%`);
  const dist = (label: string, xs: Line[]) => {
    const ps = xs.map((l) => l.pct as number);
    if (ps.length === 0) return log(`${label} | 0 | - | - | - | 0`);
    log(`${label} | ${ps.length} | ${pct(Math.min(...ps))} | ${pct(median(ps))} | ${pct(Math.max(...ps))} | ${ps.filter((p) => p >= 100).length}`);
  };
  dist("all", single);
  for (const y of YEARS_REPORTED) dist(String(y), single.filter((l) => l.year === y));
  const otherYears = single.filter((l) => !YEARS_REPORTED.includes(l.year));
  if (otherYears.length) dist("other years", otherYears);
  log(`\nlistings at or above 100% of the new price: ${single.filter((l) => (l.pct as number) >= 100).length} of ${single.length}`);

  // ---------- 4. the whole file — duplicate keys (part 4 §3) ----------
  fileDuplicates(rows, byKey, badCounts, [...new Set(demo.map((c) => c.t))]);
  log(`\nnothing written — read-only probe`);
}

// part 4 §3 — over ALL rows of the file. Pure reporting; nothing is resolved or chosen.
function fileDuplicates(
  rows: Parsed[],
  byKey: Map<string, Parsed[]>,
  badCounts: { col: string; missing: number; nonNumeric: number }[],
  demoTozeretCds: number[],
): void {
  log(`\n===== 4. FILE DUPLICATES — all ${rows.length} rows =====`);

  // 4.1 keys with more than one row
  const dupKeys = [...byKey.entries()].filter(([, list]) => list.length > 1);
  log(`\n--- 4.1 keys (tozeret_cd, degem_cd, shnat_yitzur) with more than one row`);
  log(`keys: ${byKey.size}; keys with more than one row: ${dupKeys.length} (${pct((dupKeys.length / byKey.size) * 100)}); rows on them: ${dupKeys.reduce((n, [, l]) => n + l.length, 0)} of ${rows.length}`);
  const sizeDist = new Map<string, number>();
  for (const [, list] of dupKeys) {
    const bucket = list.length >= 4 ? "4+" : String(list.length);
    sizeDist.set(bucket, (sizeDist.get(bucket) ?? 0) + 1);
  }
  log(`rows per key: ${["2", "3", "4+"].map((b) => `${b} → ${sizeDist.get(b) ?? 0} keys`).join(" · ")}${dupKeys.length ? `; largest key: ${Math.max(...dupKeys.map(([, l]) => l.length))} rows` : ""}`);

  // 4.2 what differs between the rows of a key
  log(`\n--- 4.2 what differs between the rows of one key (${dupKeys.length} keys)`);
  const differing = (list: Parsed[]): typeof DIFF_COLUMNS => DIFF_COLUMNS.filter((c) => new Set(list.map((r) => r[c.col].trim())).size > 1);
  const comboOf = (list: Parsed[]): string => {
    const d = differing(list);
    const named = d.filter((c) => c.named).map((c) => c.label);
    const unnamed = d.filter((c) => !c.named).map((c) => c.label);
    if (d.length === 0) return "identical rows";
    return [named.join(" + "), unnamed.length ? `(${unnamed.join(" + ")})` : ""].filter(Boolean).join(" ");
  };
  const perColumn = new Map<string, number>();
  const combos = new Map<string, [string, Parsed[]][]>();
  for (const entry of dupKeys) {
    for (const c of differing(entry[1])) perColumn.set(c.label, (perColumn.get(c.label) ?? 0) + 1);
    const combo = comboOf(entry[1]);
    const l = combos.get(combo);
    if (l) l.push(entry);
    else combos.set(combo, [entry]);
  }
  log(`keys by differing column (a key counts once per column in which its rows carry more than one value):`);
  for (const c of DIFF_COLUMNS) log(`  ${(perColumn.get(c.label) ?? 0).toString().padStart(6)}  ${c.label}`);
  log(`combinations (the set of columns that differ within the key):`);
  const comboList = [...combos.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [combo, list] of comboList) log(`  ${list.length.toString().padStart(6)}  ${combo}`);
  // the obvious follow-up when sug_degem differs on every key: is (tozeret_cd, degem_cd, shnat_yitzur, sug_degem) unique?
  const bySug = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.t}|${r.d}|${r.y}|${r.sug_degem.trim()}`;
    bySug.set(k, (bySug.get(k) ?? 0) + 1);
  }
  const dupSug = [...bySug.values()].filter((n) => n > 1).length;
  log(`with sug_degem added to the key (tozeret_cd, degem_cd, shnat_yitzur, sug_degem): keys ${bySug.size}; keys with more than one row: ${dupSug}`);

  // 4.3 the importer in the key
  log(`\n--- 4.3 keys (tozeret_cd, degem_cd, shnat_yitzur, semel_yevuan) with more than one row`);
  const byKey4 = new Map<string, Parsed[]>();
  for (const r of rows) {
    const k = `${r.t}|${r.d}|${r.y}|${r.semel_yevuan.trim()}`;
    const list = byKey4.get(k);
    if (list) list.push(r);
    else byKey4.set(k, [r]);
  }
  const dup4 = [...byKey4.entries()].filter(([, list]) => list.length > 1);
  log(`keys: ${byKey4.size}; keys with more than one row: ${dup4.length} (${pct((dup4.length / byKey4.size) * 100)}); rows on them: ${dup4.reduce((n, [, l]) => n + l.length, 0)}`);
  const identical = dup4.filter(([, l]) => differing(l).length === 0);
  const priceConflict = dup4.filter(([, l]) => differing(l).some((c) => c.col === "mehir"));
  const otherDiff = dup4.filter(([, l]) => differing(l).length > 0 && !differing(l).some((c) => c.col === "mehir"));
  log(`  true duplicates (every column equal): ${identical.length}`);
  log(`  same-importer price conflicts (mehir differs): ${priceConflict.length}`);
  log(`  same importer, same price, other columns differ: ${otherDiff.length}`);
  const combos4 = new Map<string, number>();
  for (const [, l] of dup4) combos4.set(comboOf(l), (combos4.get(comboOf(l)) ?? 0) + 1);
  for (const [combo, n] of [...combos4.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) log(`  ${n.toString().padStart(6)}  ${combo}`);
  if (priceConflict.length) {
    const spreads = priceConflict.map(([, l]) => {
      const ps = l.map((r) => r.price);
      return ((Math.max(...ps) - Math.min(...ps)) / Math.min(...ps)) * 100;
    });
    log(`  price conflicts — spread (max−min)/min: min ${pct(Math.min(...spreads))} | median ${pct(median(spreads))} | max ${pct(Math.max(...spreads))}`);
  }

  // 4.4 examples: one key per combination, most frequent first; then a second key of the most frequent combinations
  log(`\n--- 4.4 ${DUPE_EXAMPLES} examples, one key per combination (most frequent combination first), then second keys of the most frequent`);
  const examples: [string, Parsed[]][] = [];
  for (let round = 0; examples.length < DUPE_EXAMPLES; round++) {
    let added = false;
    for (const [, list] of comboList) {
      if (examples.length >= DUPE_EXAMPLES) break;
      if (list[round]) {
        examples.push(list[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  log(`line | semel_yevuan | shem_yevuan | sug_degem | tozeret_cd | tozeret_nm | degem_cd | degem_nm | shnat_yitzur | mehir | kinuy_mishari`);
  for (const [k, list] of examples) {
    log(`\nkey ${k.replace(/\|/g, "-")} — ${list.length} rows — ${comboOf(list)}`);
    for (const r of [...list].sort((a, b) => a.line - b.line)) {
      log(`${r.line} | ${r.semel_yevuan} | ${r.shem_yevuan} | ${r.sug_degem} | ${r.t} | ${r.tozeret_nm} | ${r.d} | ${r.degem_nm} | ${r.y} | ${r.price} | ${r.kinuy_mishari}`);
    }
  }

  // 4.5 per manufacturer (tozeret_nm, as written)
  log(`\n--- 4.5 duplicate keys per manufacturer (tozeret_nm as written in the file), top ${MANUFACTURERS_TOP} by duplicate keys`);
  const perMaker = new Map<string, { keys: Set<string>; dup: Set<string> }>();
  for (const [k, list] of byKey.entries()) {
    for (const name of new Set(list.map((r) => r.tozeret_nm.trim()))) {
      const m = perMaker.get(name) ?? { keys: new Set<string>(), dup: new Set<string>() };
      m.keys.add(k);
      if (list.length > 1) m.dup.add(k);
      perMaker.set(name, m);
    }
  }
  const makers = [...perMaker.entries()].sort((a, b) => b[1].dup.size - a[1].dup.size || b[1].keys.size - a[1].keys.size || a[0].localeCompare(b[0]));
  log(`manufacturers (distinct tozeret_nm): ${makers.length}; file-wide share of duplicate keys: ${pct((dupKeys.length / byKey.size) * 100)}`);
  log(`tozeret_nm | keys | duplicate keys | share`);
  for (const [name, m] of makers.slice(0, MANUFACTURERS_TOP)) log(`${name} | ${m.keys.size} | ${m.dup.size} | ${pct((m.dup.size / m.keys.size) * 100)}`);
  log(`the demo's manufacturer(s) — tozeret_cd ${demoTozeretCds.join(", ")}:`);
  for (const t of demoTozeretCds) {
    const names = [...new Set(rows.filter((r) => r.t === t).map((r) => r.tozeret_nm.trim()))];
    if (names.length === 0) log(`  tozeret_cd ${t}: no row in the file`);
    for (const name of names) {
      const m = perMaker.get(name)!;
      const place = makers.findIndex(([n]) => n === name) + 1;
      log(`  tozeret_cd ${t} = ${name} | keys ${m.keys.size} | duplicate keys ${m.dup.size} | share ${pct((m.dup.size / m.keys.size) * 100)} | place ${place} of ${makers.length}`);
    }
  }

  // 4.6 missing or non-numeric codes, years, prices
  log(`\n--- 4.6 rows with a missing or non-numeric value (the strict parse stops on the first one; these are the counts before it)`);
  for (const b of badCounts) log(`  ${b.col}: missing ${b.missing}, non-numeric ${b.nonNumeric}`);
  const zeroOrNegativePrice = rows.filter((r) => r.price <= 0).length;
  const yearsOutOfRange = rows.filter((r) => r.y < 1900 || r.y > 2100).length;
  log(`  (numeric but odd: mehir <= 0: ${zeroOrNegativePrice}; shnat_yitzur outside 1900–2100: ${yearsOutOfRange})`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
