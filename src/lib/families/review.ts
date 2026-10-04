// Opening screen, F3 — the review file as rules (BRIEF F3 §1). Pure: no database, no file system, no Excel
// package. The families import script reads the review file (REVIEW_FILE) into text rows and writes the plan;
// this module parses the two tabs (parseReview), places a catalog row in the file
// (catalogKey + familyOf) and plans the import against the database's state (planImport).
//
// The key chain is the sheet builder's own (sheet.ts familyMakes): canonicalMake(make, MAKE_MERGES), then
// mergeKey(model, MAKES[canonical].prefixes, or none for a make without an entry). It is called here, never
// re-derived: a key the import computes differently from the one that built the sheet is a stop.

import { FAMILIES_YEAR_FROM } from "./constants";
import { mergeKey } from "./merge";
import { canonicalMake as foldMake } from "./sheet";
import {
  MAKE_MERGES, MAKES, MAKES_HEADERS, MAKES_TAB, MODELS_HEADERS, MODELS_TAB, SPELLING_SEPARATOR,
} from "./words";

// ---------------------------------------------------------------- the file (§1.1, §1.2)

/** One row of a tab: `row` is the Excel row number (header 1, first data row 2); `cells` in header order. */
export type TextRow = { row: number; cells: string[] };

export type ReviewMake = {
  row: number;
  nameEn: string;
  nameHe: string;
  catalogSpellings: string[];
  extraSpellings: string[];
  /** catalogSpellings then extraSpellings, duplicates dropped keeping the first. */
  aliases: string[];
};

export type ReviewRow = {
  row: number;
  catalogMakes: string[];
  spellings: string[];
  makeEn: string;
  model: string;
  nameHe: string;
  /** Both the model and the Hebrew name empty: a known name deliberately kept out of the table. */
  left: boolean;
  canonicalMake: string;
  key: string;
};

export type ReviewFamily = {
  makeEn: string;
  nameEn: string;
  nameHe: string;
  /** The spellings of its rows, in row order, duplicates dropped. */
  aliases: string[];
  rows: number[];
};

export type CatalogKey = { canonicalMake: string; key: string };

export type ReviewFile = {
  makes: ReviewMake[];
  rows: ReviewRow[];
  families: ReviewFamily[];
  /** The family of a (canonical make, key); "left" for a left row; undefined for a key the file does not know. */
  familyOf(k: CatalogKey): ReviewFamily | "left" | undefined;
  familyOf(canonicalMake: string, key: string): ReviewFamily | "left" | undefined;
};

export class ReviewFileError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`the review file has ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join("\n")}`);
    this.problems = problems;
  }
}

// A table lookup by own key only, as sheet.ts does: a make spelled like an Object.prototype member finds nothing.
function prefixesOf(canonical: string): string[] {
  return Object.hasOwn(MAKES, canonical) ? MAKES[canonical].prefixes : [];
}

/** The sheet builder's chain applied to a catalog row's own make and model. */
export function catalogKey(make: string, model: string): CatalogKey {
  const canonicalMake = foldMake(make, MAKE_MERGES);
  return { canonicalMake, key: mergeKey(model, prefixesOf(canonicalMake)) };
}

const pairKey = (a: string, b: string): string => JSON.stringify([a, b]);

function splitOn(text: string, separator: string): string[] {
  return text.split(separator).map((s) => s.trim()).filter((s) => s !== "");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

// The cell under a header, trimmed. The position comes from the header list, never from a fixed index.
function cellOf(r: TextRow, headers: readonly string[], name: string): string {
  return r.cells[headers.indexOf(name)].trim();
}

const [M_CATALOG_MAKE, , M_CATALOG_NAME, , , , M_MAKE, M_MODEL, M_NAME_HE] = MODELS_HEADERS;
const [K_CATALOG_MAKE, , K_NAME_EN, K_NAME_HE, K_EXTRA] = MAKES_HEADERS;

export function parseReview(models: TextRow[], makes: TextRow[]): ReviewFile {
  const problems: string[] = [];
  const problem = (tab: string, row: number, column: string, message: string) =>
    problems.push(`${tab} row ${row}: ${column}: ${message}`);

  const widthOk = (tab: string, headers: readonly string[], r: TextRow): boolean => {
    if (r.cells.length === headers.length) return true;
    problem(tab, r.row, "(row)", `${r.cells.length} cells, the tab has ${headers.length} headers`);
    return false;
  };

  // Makes tab.
  const reviewMakes: ReviewMake[] = [];
  for (const r of makes) {
    if (!widthOk(MAKES_TAB, MAKES_HEADERS, r)) continue;
    const nameEn = cellOf(r, MAKES_HEADERS, K_NAME_EN);
    const nameHe = cellOf(r, MAKES_HEADERS, K_NAME_HE);
    if (nameEn === "") problem(MAKES_TAB, r.row, K_NAME_EN, "empty");
    if (nameHe === "") problem(MAKES_TAB, r.row, K_NAME_HE, "empty");
    const catalogSpellings = splitOn(cellOf(r, MAKES_HEADERS, K_CATALOG_MAKE), SPELLING_SEPARATOR);
    const extraSpellings = splitOn(cellOf(r, MAKES_HEADERS, K_EXTRA), ",");
    reviewMakes.push({
      row: r.row, nameEn, nameHe, catalogSpellings, extraSpellings,
      aliases: unique([...catalogSpellings, ...extraSpellings]),
    });
  }
  const duplicates = (column: string, value: (m: ReviewMake) => string) => {
    const byValue = new Map<string, number[]>();
    for (const m of reviewMakes) {
      if (value(m) === "") continue;
      byValue.set(value(m), [...(byValue.get(value(m)) ?? []), m.row]);
    }
    for (const [v, rows] of byValue) {
      if (rows.length < 2) continue;
      for (const n of rows) problem(MAKES_TAB, n, column, `${JSON.stringify(v)} is also on row(s) ${rows.filter((x) => x !== n).join(", ")}`);
    }
  };
  duplicates(K_NAME_EN, (m) => m.nameEn);
  duplicates(K_NAME_HE, (m) => m.nameHe);
  const makeNames = new Set(reviewMakes.map((m) => m.nameEn).filter((n) => n !== ""));

  // Models tab.
  const rows: ReviewRow[] = [];
  for (const r of models) {
    if (!widthOk(MODELS_TAB, MODELS_HEADERS, r)) continue;
    const catalogMakes = splitOn(cellOf(r, MODELS_HEADERS, M_CATALOG_MAKE), SPELLING_SEPARATOR);
    const spellings = splitOn(cellOf(r, MODELS_HEADERS, M_CATALOG_NAME), SPELLING_SEPARATOR);
    const makeEn = cellOf(r, MODELS_HEADERS, M_MAKE);
    const model = cellOf(r, MODELS_HEADERS, M_MODEL);
    const nameHe = cellOf(r, MODELS_HEADERS, M_NAME_HE);
    const left = model === "" && nameHe === "";

    if (model !== "" && nameHe === "") problem(MODELS_TAB, r.row, M_NAME_HE, `empty while ${M_MODEL} is ${JSON.stringify(model)}`);
    if (nameHe !== "" && model === "") problem(MODELS_TAB, r.row, M_MODEL, `empty while ${M_NAME_HE} is ${JSON.stringify(nameHe)}`);
    if (makeEn === "" && !left) problem(MODELS_TAB, r.row, M_MAKE, "empty");
    if (makeEn !== "" && !makeNames.has(makeEn)) {
      problem(MODELS_TAB, r.row, M_MAKE, `${JSON.stringify(makeEn)} is not a name of the ${MAKES_TAB} tab`);
    }

    let canonical = "";
    if (catalogMakes.length === 0) problem(MODELS_TAB, r.row, M_CATALOG_MAKE, "empty");
    else {
      const folded = unique(catalogMakes.map((m) => foldMake(m, MAKE_MERGES)));
      if (folded.length > 1) {
        problem(MODELS_TAB, r.row, M_CATALOG_MAKE, `the spellings fold into ${folded.length} makes (${folded.map((f) => JSON.stringify(f)).join(", ")}), not one`);
      } else canonical = folded[0];
    }

    let key = "";
    if (spellings.length === 0) problem(MODELS_TAB, r.row, M_CATALOG_NAME, "empty");
    else if (canonical !== "") {
      const keys = unique(spellings.map((s) => mergeKey(s, prefixesOf(canonical))));
      if (keys.length > 1) {
        problem(
          MODELS_TAB, r.row, M_CATALOG_NAME,
          `the spellings give ${keys.length} keys (${keys.map((k) => JSON.stringify(k)).join(", ")}) — the import's merge differs from the one that built the sheet`,
        );
      } else key = keys[0];
    }

    rows.push({ row: r.row, catalogMakes, spellings, makeEn, model, nameHe, left, canonicalMake: canonical, key });
  }

  // One row per (canonical make, key).
  const rowByKey = new Map<string, ReviewRow>();
  const sameKey = new Map<string, ReviewRow[]>();
  for (const r of rows) {
    if (r.canonicalMake === "" || r.key === "") continue;
    const k = pairKey(r.canonicalMake, r.key);
    sameKey.set(k, [...(sameKey.get(k) ?? []), r]);
    if (!rowByKey.has(k)) rowByKey.set(k, r);
  }
  for (const group of sameKey.values()) {
    if (group.length < 2) continue;
    for (const r of group) {
      problem(
        MODELS_TAB, r.row, M_CATALOG_NAME,
        `the same catalog make and key (${JSON.stringify(r.canonicalMake)}, ${JSON.stringify(r.key)}) as row(s) ${group.filter((x) => x !== r).map((x) => x.row).join(", ")}`,
      );
    }
  }

  // Families: (makeEn, model) over the rows that are not left.
  const familyByKey = new Map<string, ReviewFamily>();
  const heByFamily = new Map<string, { row: number; nameHe: string }[]>();
  for (const r of rows) {
    if (r.left) continue;
    const k = pairKey(r.makeEn, r.model);
    const f = familyByKey.get(k) ?? { makeEn: r.makeEn, nameEn: r.model, nameHe: r.nameHe, aliases: [], rows: [] };
    familyByKey.set(k, f);
    f.rows.push(r.row);
    f.aliases = unique([...f.aliases, ...r.spellings]);
    heByFamily.set(k, [...(heByFamily.get(k) ?? []), { row: r.row, nameHe: r.nameHe }]);
  }
  for (const [k, list] of heByFamily) {
    if (unique(list.map((x) => x.nameHe)).length < 2) continue;
    const f = familyByKey.get(k)!;
    problem(
      MODELS_TAB, list[0].row, M_NAME_HE,
      `the family ${f.makeEn} ${f.nameEn} has different Hebrew names: ${list.map((x) => `row ${x.row} ${JSON.stringify(x.nameHe)}`).join(", ")}`,
    );
  }

  if (problems.length > 0) throw new ReviewFileError(problems);

  function familyOf(a: CatalogKey | string, b?: string): ReviewFamily | "left" | undefined {
    const k = typeof a === "string" ? pairKey(a, b ?? "") : pairKey(a.canonicalMake, a.key);
    const r = rowByKey.get(k);
    if (r === undefined) return undefined;
    if (r.left) return "left";
    return familyByKey.get(pairKey(r.makeEn, r.model));
  }

  return { makes: reviewMakes, rows, families: [...familyByKey.values()], familyOf };
}

// ---------------------------------------------------------------- the plan (§1.3)

export type DbState = {
  makes: { id: number; name_en: string; name_he: string; aliases: string[] }[];
  families: { id: number; make_id: number; name_en: string; name_he: string; aliases: string[] }[];
  /** vehicle_class and year are read only for the information count of the outside rows. */
  catalog: {
    id: number; make: string | null; model: string | null; family_id: number | null;
    vehicle_class?: string | null; year?: number | null;
  }[];
  /** family_id -> number of searches rows pointing to it. */
  searches: Map<number, number>;
};

/** A family id: an existing row's id, or "new:<key>" for a family created in step 2. */
export type FamilyRef = number | `new:${string}`;
/** A make id: an existing row's id, or "new:<name_en>" for a make created in step 1. */
export type MakeRef = number | `new:${string}`;

export type Change<T> = { before: T; after: T };

export type ImportPlan = {
  makeCreates: { nameEn: string; nameHe: string; aliases: string[] }[];
  makeUpdates: { id: number; nameEn: string; nameHe?: Change<string>; aliases?: Change<string[]> }[];
  makeDeletes: { id: number; nameEn: string }[];
  familyCreates: { key: string; makeId: MakeRef; makeEn: string; nameEn: string; nameHe: string; aliases: string[] }[];
  familyUpdates: { id: number; key: string; nameHe?: Change<string>; aliases?: Change<string[]> }[];
  familyDeletes: {
    id: number; key: string;
    /** null = no target at all, or a split: nothing to move. */
    move: { fromId: number; toId: FamilyRef; toKey: string; searchesMoved: number } | null;
    /** Its names went to more than one family: a stop, and no move is recorded. */
    split?: true;
  }[];
  catalogWrites: { familyId: FamilyRef | null; ids: number[] }[];
  counts: {
    catalog: number; setFromNull: number; moved: number; cleared: number; unchanged: number; outside: number;
    /** Of the outside rows: vehicle_class "P" and year >= FAMILIES_YEAR_FROM. */
    outsideInScope: number;
  };
  /** Catalog rows per file family after step 3, in file order. */
  familyRows: { family: ReviewFamily; rows: number }[];
  /** models.id -> the family step 3 sends it to (null = none). */
  targetOf: Map<number, ReviewFamily | null>;
  stops: string[];
};

/** The display key of a family: "{make name_en} {family name_en}". */
export function familyLabel(makeEn: string, nameEn: string): string {
  return `${makeEn} ${nameEn}`;
}

const sameArray = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

export function planImport(file: ReviewFile, db: DbState): ImportPlan {
  const stops: string[] = [];

  // 1. Makes upsert.
  const dbMakeByName = new Map(db.makes.map((m) => [m.name_en, m]));
  const dbMakeById = new Map(db.makes.map((m) => [m.id, m]));
  const makeCreates: ImportPlan["makeCreates"] = [];
  const makeUpdates: ImportPlan["makeUpdates"] = [];
  const makeRef = new Map<string, MakeRef>();
  for (const m of file.makes) {
    const found = dbMakeByName.get(m.nameEn);
    if (found === undefined) {
      makeCreates.push({ nameEn: m.nameEn, nameHe: m.nameHe, aliases: m.aliases });
      makeRef.set(m.nameEn, `new:${m.nameEn}`);
      continue;
    }
    makeRef.set(m.nameEn, found.id);
    const u: ImportPlan["makeUpdates"][number] = { id: found.id, nameEn: m.nameEn };
    if (found.name_he !== m.nameHe) u.nameHe = { before: found.name_he, after: m.nameHe };
    if (!sameArray(found.aliases, m.aliases)) u.aliases = { before: found.aliases, after: m.aliases };
    if (u.nameHe !== undefined || u.aliases !== undefined) makeUpdates.push(u);
  }

  // 2. Families upsert. A DB family's key is its make's name_en and its own name_en.
  const dbFamilyKey = new Map<number, string>();
  const dbFamilyByKey = new Map<string, DbState["families"][number]>();
  for (const f of db.families) {
    const make = dbMakeById.get(f.make_id);
    if (make === undefined) {
      stops.push(`model_families id ${f.id} (${f.name_en}) points to make_id ${f.make_id}, which is not in makes`);
      continue;
    }
    const k = pairKey(make.name_en, f.name_en);
    dbFamilyKey.set(f.id, k);
    dbFamilyByKey.set(k, f);
  }
  const familyCreates: ImportPlan["familyCreates"] = [];
  const familyUpdates: ImportPlan["familyUpdates"] = [];
  const familyRef = new Map<ReviewFamily, FamilyRef>();
  for (const f of file.families) {
    const k = pairKey(f.makeEn, f.nameEn);
    const label = familyLabel(f.makeEn, f.nameEn);
    const found = dbFamilyByKey.get(k);
    if (found === undefined) {
      familyCreates.push({ key: label, makeId: makeRef.get(f.makeEn)!, makeEn: f.makeEn, nameEn: f.nameEn, nameHe: f.nameHe, aliases: f.aliases });
      familyRef.set(f, `new:${label}`);
      continue;
    }
    familyRef.set(f, found.id);
    const u: ImportPlan["familyUpdates"][number] = { id: found.id, key: label };
    if (found.name_he !== f.nameHe) u.nameHe = { before: found.name_he, after: f.nameHe };
    if (!sameArray(found.aliases, f.aliases)) u.aliases = { before: found.aliases, after: f.aliases };
    if (u.nameHe !== undefined || u.aliases !== undefined) familyUpdates.push(u);
  }

  // 3. Catalog mapping: every row by its name alone, every year and every vehicle class.
  const counts: ImportPlan["counts"] = {
    catalog: db.catalog.length, setFromNull: 0, moved: 0, cleared: 0, unchanged: 0, outside: 0, outsideInScope: 0,
  };
  const targetOf = new Map<number, ReviewFamily | null>();
  const writes = new Map<FamilyRef | null, number[]>();
  const rowsPerFamily = new Map<ReviewFamily, number>();
  // The file row a catalog row maps to, for the self-check below.
  const fileRowByKey = new Map(file.rows.map((r) => [pairKey(r.canonicalMake, r.key), r]));
  const matchedRows = new Set<ReviewRow>();
  for (const c of db.catalog) {
    let target: ReviewFamily | null = null;
    if (c.make !== null && c.model !== null) {
      const k = catalogKey(c.make, c.model);
      const fileRow = fileRowByKey.get(pairKey(k.canonicalMake, k.key));
      if (fileRow !== undefined) matchedRows.add(fileRow);
      const found = file.familyOf(k);
      if (found !== undefined && found !== "left") target = found;
    }
    targetOf.set(c.id, target);
    if (target !== null) rowsPerFamily.set(target, (rowsPerFamily.get(target) ?? 0) + 1);
    const ref = target === null ? null : familyRef.get(target)!;

    if (c.family_id === ref) {
      if (ref === null) {
        counts.outside += 1;
        if (c.vehicle_class === "P" && c.year !== null && c.year !== undefined && c.year >= FAMILIES_YEAR_FROM) {
          counts.outsideInScope += 1;
        }
      } else counts.unchanged += 1;
      continue;
    }
    if (c.family_id === null) counts.setFromNull += 1;
    else if (ref === null) counts.cleared += 1;
    else counts.moved += 1;
    writes.set(ref, [...(writes.get(ref) ?? []), c.id]);
  }

  // The self-check: the sheet was built from the catalog, so every file row matches at least one catalog row.
  const unmatched = file.rows.filter((r) => !matchedRows.has(r));
  for (const r of unmatched) {
    stops.push(
      `${MODELS_TAB} row ${r.row} (${r.spellings.join(SPELLING_SEPARATOR)}): no catalog row maps to it — ` +
        "the key chain is not the one that built the sheet",
    );
  }

  // 4. Vanished families: their searches follow the catalog rows, then they are deleted.
  const familyDeletes: ImportPlan["familyDeletes"] = [];
  const refLabel = (f: ReviewFamily) => familyLabel(f.makeEn, f.nameEn);
  for (const f of db.families) {
    const k = dbFamilyKey.get(f.id);
    if (k === undefined) continue; // already a stop above
    const [makeEn, nameEn] = JSON.parse(k) as [string, string];
    if (file.families.some((x) => x.makeEn === makeEn && x.nameEn === nameEn)) continue;
    const label = familyLabel(makeEn, nameEn);
    const searches = db.searches.get(f.id) ?? 0;

    const perTarget = new Map<ReviewFamily, number>();
    for (const c of db.catalog) {
      if (c.family_id !== f.id) continue;
      const t = targetOf.get(c.id) ?? null;
      if (t !== null) perTarget.set(t, (perTarget.get(t) ?? 0) + 1);
    }
    const ranked = [...perTarget].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0) {
      if (searches > 0) {
        stops.push(`${label} (id ${f.id}): a model whose rows were all emptied and that has ${searches} searches — ask Eran`);
      }
      familyDeletes.push({ id: f.id, key: label, move: null });
      continue;
    }
    // A split — more than one target family, whatever the numbers and the searches — stops (F3b §2).
    if (ranked.length > 1) {
      stops.push(
        `${label}: its names went to ${ranked.map(([t, n]) => `${refLabel(t)} (${n} catalog rows)`).join(", ")} — ` +
          "the import does not choose who inherits the searches; keep the old name on the part that should keep them, then run again",
      );
      familyDeletes.push({ id: f.id, key: label, move: null, split: true });
      continue;
    }
    const [to] = ranked[0];
    familyDeletes.push({ id: f.id, key: label, move: { fromId: f.id, toId: familyRef.get(to)!, toKey: refLabel(to), searchesMoved: searches } });
  }

  // 5. Makes delete — last; a surviving family still pointing to the make is a stop.
  const tabMakes = new Set(file.makes.map((m) => m.nameEn));
  const deletedFamilies = new Set(familyDeletes.map((d) => d.id));
  const makeDeletes: ImportPlan["makeDeletes"] = [];
  for (const m of db.makes) {
    if (tabMakes.has(m.name_en)) continue;
    const surviving = db.families.filter((f) => f.make_id === m.id && !deletedFamilies.has(f.id));
    if (surviving.length > 0) {
      stops.push(`make ${m.name_en} (id ${m.id}) leaves the tab but families still point to it: ${surviving.map((f) => `${f.name_en} (id ${f.id})`).join(", ")}`);
    }
    makeDeletes.push({ id: m.id, nameEn: m.name_en });
  }

  return {
    makeCreates, makeUpdates, makeDeletes, familyCreates, familyUpdates, familyDeletes,
    catalogWrites: [...writes].map(([familyId, ids]) => ({ familyId, ids })),
    counts,
    familyRows: file.families.map((family) => ({ family, rows: rowsPerFamily.get(family) ?? 0 })),
    targetOf,
    stops,
  };
}
