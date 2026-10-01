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
  // Day 19ב — the spec section: four fields of their own, plus the 15 flags of FLAG_FIELDS below.
  mispar_dlatot: string;
  mispar_kariot_avir: string;
  technologiat_hanaa_nm: string;
  CO2_WLTP: string;
  blimat_hirum_lifnei_holhei_regel_ofanaim: string;
  zihuy_holchey_regel_ind: string;
  zihuy_rechev_do_galgali: string;
  zihuy_matzav_hitkarvut_mesukenet_ind: string;
  nitur_merhak_milfanim_ind: string;
  bakarat_stiya_menativ_ind: string;
  bakarat_stiya_activ_s: string;
  zihuy_beshetah_nistar_ind: string;
  bakarat_shyut_adaptivit_ind: string;
  zihuy_tamrurey_tnua_ind: string;
  shlita_automatit_beorot_gvohim_ind: string;
  blima_otomatit_nesia_leahor: string;
  halon_bagg_ind: string;
  galgaley_sagsoget_kala_ind: string;
  matzlemat_reverse_ind: string;
};

let rows: CatalogRow[] | null = null;

export function loadCatalog(): CatalogRow[] {
  if (rows) return rows;
  const file = path.join(process.cwd(), RAW_DIR, "catalog.csv");
  rows = parsePipeCsv<CatalogRow>(readFileSync(file, "utf8"));
  return rows;
}

// Day 19ב — the 15 flag columns of `models` and the catalog field each one reads, in the section's
// display order: 1-12 the driver-assist row, 13-15 the equipment row. This table is the only place
// the pairing is written; ModelRow's flag fields are derived from it.
const FLAG_FIELDS = {
  aeb_pedestrian_cyclist:    "blimat_hirum_lifnei_holhei_regel_ofanaim",
  pedestrian_detection:      "zihuy_holchey_regel_ind",
  two_wheeler_detection:     "zihuy_rechev_do_galgali",
  forward_collision_warning: "zihuy_matzav_hitkarvut_mesukenet_ind",
  distance_monitoring:       "nitur_merhak_milfanim_ind",
  lane_departure_warning:    "bakarat_stiya_menativ_ind",
  lane_keeping:              "bakarat_stiya_activ_s",
  blind_spot_detection:      "zihuy_beshetah_nistar_ind",
  adaptive_cruise:           "bakarat_shyut_adaptivit_ind",
  traffic_sign_recognition:  "zihuy_tamrurey_tnua_ind",
  auto_high_beams:           "shlita_automatit_beorot_gvohim_ind",
  reverse_auto_braking:      "blima_otomatit_nesia_leahor",
  sunroof:                   "halon_bagg_ind",
  alloy_wheels:              "galgaley_sagsoget_kala_ind",
  reverse_camera:            "matzlemat_reverse_ind",
} as const satisfies Record<string, keyof CatalogRow>;

// The flag columns of ModelRow, named by the table above (`-readonly`: the table is `as const`).
type FlagColumns = { -readonly [K in keyof typeof FLAG_FIELDS]: boolean };

// The catalog's four drive-technology words -> our codes (schema, part E §2).
const DRIVE_TECHNOLOGY: Readonly<Record<string, string>> = {
  "הנעה רגילה": "regular",
  "היברידי רגיל": "hybrid",
  "PLUG IN": "plug_in",
  "רכב חשמלי": "electric",
};

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
  safety_rating: number | null;
  doors: number | null;
  airbags: number | null;
  drive_technology: string; // regular | hybrid | plug_in | electric — never null: an unknown word throws
  co2_wltp: number | null;
} & FlagColumns; // the 15 flags of FLAG_FIELDS, never null: any value but "0"/"1" throws

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

// Day 19ב §2.3 — one catalog row to one models row: the identity, the nine group fields, the group
// key and the spec fields. Pure. The one thing it cannot know on its own is the canonical model
// spelling, which is a whole-file fact, so the caller passes it in (buildModelRows from the file's
// own pass; the sheet import from the spelling `models` already holds). Every text value it stores
// is trimmed, so a row read from the file and the same version read from the API come out identical.
// A row whose identity cannot be formed, and a technology word or flag value the catalog is not
// allowed to hold, stop the caller — never a silent null (AGENTS.md).
export function translateCatalogRow(row: CatalogRow, modelName: string): ModelRow {
  const cls = (row.sug_degem ?? "").trim();
  const code = makeDegemCode(row.tozeret_cd, row.degem_cd);
  const year = num(row.shnat_yitzur);
  const identity = `${cls || "?"}|${code ?? "?"}|${year ?? "?"}`;
  if (!cls) throw new Error(`catalog ${identity}: sug_degem is empty — the row has no vehicle class`);
  if (!code) throw new Error(`catalog ${identity}: no degem_code — tozeret_cd and degem_cd are both empty`);
  if (year === null) throw new Error(`catalog ${identity}: shnat_yitzur is not a year: ${JSON.stringify(row.shnat_yitzur ?? "")}`);

  const fields = groupFields(row, modelName);
  return {
    vehicle_class: cls,
    degem_code: code,
    year,
    comparison_group: groupKey({ vehicle_class: cls, ...fields }),
    ...fields,
    seats: num(row.mispar_moshavim),
    safety_rating: num(row.ramat_eivzur_betihuty),
    doors: num(row.mispar_dlatot),
    airbags: num(row.mispar_kariot_avir),
    drive_technology: driveTechnology(row.technologiat_hanaa_nm, identity),
    co2_wltp: num(row.CO2_WLTP),
    ...flags(row, identity),
  };
}

// Day 19ב §2.5 — every field of one datastore_search record as a string, so that a version read
// over the network goes through the very same translation as the same version read from the file:
// the API gives the numbers as numbers (588, not "00588"; 160, not "160.") and the text trimmed,
// and translateCatalogRow parses and trims both forms to the same values. `_id` is the datastore's
// own row number, not data.
export function catalogRowFromApi(record: Record<string, unknown>): CatalogRow {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "_id") continue;
    out[key] = value === null || value === undefined ? "" : String(value);
  }
  // The resource's 94 fields are the file's header, in the file's order (Run 15-discovery), so every
  // CatalogRow field is present; a missing one would surface as a translation error, not a null.
  return out as unknown as CatalogRow;
}

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
    const modelName = canon.get(nameKey(r.kinuy_mishari)) ?? "";
    const key = JSON.stringify(groupFields(r, modelName));
    const row = translateCatalogRow(r, modelName);
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
// `modelName` is the canonical spelling the caller chose for this row's kinuy_mishari.
function groupFields(r: CatalogRow, modelName: string) {
  return {
    make: txt(r.tozar),
    model: txt(modelName),
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

// The four words of DRIVE_TECHNOLOGY and nothing else: a fifth word is a catalog change we must see.
function driveTechnology(v: string | undefined, identity: string): string {
  const s = (v ?? "").trim();
  const code = DRIVE_TECHNOLOGY[s];
  if (!code) {
    throw new Error(
      `catalog ${identity}: technologiat_hanaa_nm = ${JSON.stringify(v ?? "")} — not one of ${Object.keys(DRIVE_TECHNOLOGY).join(" / ")}`,
    );
  }
  return code;
}

// "1" -> true, "0" -> false; any other value, empty included, stops the run.
function flags(r: CatalogRow, identity: string): FlagColumns {
  const out = {} as FlagColumns;
  for (const [column, field] of Object.entries(FLAG_FIELDS) as [keyof FlagColumns, keyof CatalogRow][]) {
    const s = (r[field] ?? "").trim();
    if (s === "1") out[column] = true;
    else if (s === "0") out[column] = false;
    else throw new Error(`catalog ${identity}: ${field} = ${JSON.stringify(r[field] ?? "")} — expected "0" or "1"`);
  }
  return out;
}

// "MAZDA 3" and "MAZDA3" share one key; the canonical spelling is the most frequent one in the catalog.
export function nameKey(v: string | undefined): string {
  return (v ?? "").toUpperCase().replace(/\s+/g, "");
}

// The whole-file pass: for each name key, the spelling the catalog uses most often. Exported (§2.6)
// so that a version arriving from outside the file — the sheet import, over the network — can be
// spelled the way `models` already spells its siblings. `merges` counts the keys that had more than
// one spelling to choose from.
export function canonicalModelNames(all: CatalogRow[]): { canon: Map<string, string>; merges: number } {
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
