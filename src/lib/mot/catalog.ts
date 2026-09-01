import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePipeCsv } from "./pipe-csv";
import { RAW_DIR } from "./resources";
import { makeDegemCode } from "./degem-code";
import { groupKey } from "../comparison-group";

// One catalog row, ministry field names, only what we read.
export type CatalogRow = {
  sug_degem: string; // "P" private | "M" commercial — degem numbers are counted separately per class
  tozeret_cd: string;
  degem_cd: string;
  shnat_yitzur: string;
  degem_nm: string;
  tozar: string;
  tozeret_nm: string;
  kinuy_mishari: string;
  ramat_gimur: string;
  merkav: string;
  nefah_manoa: string;
  koah_sus: string;
  mispar_moshavim: string;
  delek_nm: string;
  automatic_ind: string;
  hanaa_nm: string;
  gova: string;
  ramat_eivzur_betihuty: string;
};

let rows: CatalogRow[] | null = null;

export function loadCatalog(): CatalogRow[] {
  if (rows) return rows;
  const file = path.join(process.cwd(), RAW_DIR, "catalog.csv");
  rows = parsePipeCsv<CatalogRow>(readFileSync(file, "utf8"));
  return rows;
}

// What the models table receives — our names, our codes. One row per catalog entry:
// identity = (vehicle_class, degem_code, year), exactly the ministry's key.
export type ModelRow = {
  vehicle_class: string;
  degem_code: string;
  year: number;
  comparison_group: string;
  make: string | null;
  model: string | null;
  sub_model: string | null;
  engine_size: number | null;
  fuel_type: string | null;
  transmission: string | null; // "auto" | "manual"
  drive_type: string | null;
  body_type: string | null;
  seats: number | null;
  horsepower: number | null;
  height_mm: number | null;
  safety_rating: number | null;
};

export type BuildReport = {
  catalog_rows: number;
  rows: number;
  skipped_no_year: number;
  skipped_no_class: number;
  broken_pairs: number;
  recycled_codes: number; // (class, pair) whose group key differs across years — the ministry reuses degem numbers
  recycled_sample: { code: string; variants: { spec: string; years: string }[] }[];
  duplicate_conflicts: { key: string; variants: string[] }[]; // fatal: same identity, different spec
  model_name_merges: number;
};

export function buildModelRows(): { rows: ModelRow[]; report: BuildReport } {
  const all = loadCatalog();
  const { canon, merges } = canonicalModelNames(all);

  type Entry = { row: ModelRow; key: string };
  const byIdentity = new Map<string, Entry[]>();
  const keysByCode = new Map<string, Map<string, Set<number>>>(); // class+code -> spec key -> years
  let broken = 0;
  let noYear = 0;
  let noClass = 0;

  for (const r of all) {
    let code: string | null;
    try {
      code = makeDegemCode(r.tozeret_cd, r.degem_cd);
    } catch {
      broken++;
      continue;
    }
    if (!code) {
      broken++;
      continue;
    }
    const cls = (r.sug_degem ?? "").trim();
    if (!cls) {
      noClass++;
      continue;
    }
    const year = num(r.shnat_yitzur);
    if (year === null) {
      noYear++;
      continue;
    }
    const fields = groupFields(r, canon);
    const key = JSON.stringify(fields);
    const row: ModelRow = {
      vehicle_class: cls,
      degem_code: code,
      year,
      comparison_group: groupKey(fields, 1),
      ...fields,
      seats: num(r.mispar_moshavim),
      height_mm: num(r.gova),
      safety_rating: num(r.ramat_eivzur_betihuty),
    };
    const identity = `${cls}|${code}|${year}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, []);
    byIdentity.get(identity)!.push({ row, key });

    const classCode = `${cls}|${code}`;
    if (!keysByCode.has(classCode)) keysByCode.set(classCode, new Map());
    const m = keysByCode.get(classCode)!;
    if (!m.has(key)) m.set(key, new Set());
    m.get(key)!.add(year);
  }

  const out: ModelRow[] = [];
  const dups: BuildReport["duplicate_conflicts"] = [];
  for (const [identity, entries] of byIdentity) {
    const distinct = new Set(entries.map((e) => e.key));
    if (distinct.size > 1) {
      dups.push({ key: identity, variants: [...distinct] });
      continue;
    }
    out.push(entries[0].row); // identical duplicates collapse to one
  }

  const recycled = [...keysByCode.entries()].filter(([, m]) => m.size > 1);
  const sample = recycled.slice(0, 5).map(([code, m]) => ({
    code,
    variants: [...m.entries()].map(([key, years]) => {
      const f = JSON.parse(key) as ReturnType<typeof groupFields>;
      return {
        spec: `${f.make ?? "?"} ${f.model ?? "?"} ${f.body_type ?? ""} ${f.engine_size ?? "?"}cc ${f.horsepower ?? "?"}hp`,
        years: [...years].sort().join(","),
      };
    }),
  }));

  return {
    rows: out,
    report: {
      catalog_rows: all.length,
      rows: out.length,
      skipped_no_year: noYear,
      skipped_no_class: noClass,
      broken_pairs: broken,
      recycled_codes: recycled.length,
      recycled_sample: sample,
      duplicate_conflicts: dups,
      model_name_merges: merges,
    },
  };
}

// The nine fields that make up the comparison-group key, translated from the ministry's row.
function groupFields(r: CatalogRow, canon: Map<string, string>) {
  return {
    make: txt(r.tozar),
    model: canon.get(nameKey(r.kinuy_mishari)) ?? null,
    body_type: txt(r.merkav),
    fuel_type: txt(r.delek_nm),
    engine_size: num(r.nefah_manoa),
    horsepower: num(r.koah_sus),
    transmission: gearbox(r.automatic_ind),
    drive_type: txt(r.hanaa_nm),
    sub_model: txt(r.ramat_gimur),
  };
}

function txt(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

// "136." -> 136; empty or non-numeric -> null
function num(v: string | undefined): number | null {
  const s = (v ?? "").trim().replace(/\.$/, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function gearbox(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (s === "1") return "auto";
  if (s === "0") return "manual";
  return null;
}

// "MAZDA 3" and "MAZDA3" share one key; the canonical spelling is the most frequent one in the catalog.
function nameKey(v: string | undefined): string {
  return (v ?? "").toUpperCase().replace(/\s+/g, "");
}

function canonicalModelNames(all: CatalogRow[]): { canon: Map<string, string>; merges: number } {
  const counts = new Map<string, Map<string, number>>();
  for (const r of all) {
    const raw = (r.kinuy_mishari ?? "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!raw) continue;
    const k = nameKey(raw);
    const m = counts.get(k) ?? new Map<string, number>();
    m.set(raw, (m.get(raw) ?? 0) + 1);
    counts.set(k, m);
  }
  const canon = new Map<string, string>();
  let merges = 0;
  for (const [k, m] of counts) {
    if (m.size > 1) merges++;
    canon.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return { canon, merges };
}