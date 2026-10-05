// Opening screen, F3c §4 — a new name in the sheet import: a car whose catalog row has no family. Pure.
// Why it does not enter (entryReason, from the review file), a guess at its decision columns from the file's
// own rows (guessDecision), and the row a --write run appends for it to the models tab (newNameRow). The data
// columns are the sheet builder's (sheet.ts familyMakes), over the name's own catalog rows.

import type { FailedReason } from "@/lib/sheet/failed-cars";
import { FAMILIES_YEAR_FROM } from "./constants";
import { quantityKey, type CatalogRow } from "./distribution";
import { groupKey } from "./group";
import { stripMake } from "./merge";
import { catalogKey, type ReviewFile, type ReviewRow } from "./review";
import { canonicalMake, familyMakes, type SheetInput } from "./sheet";
import { MAKE_MERGES, MAKES, MODELS_HEADERS, SPELLING_SEPARATOR } from "./words";

export type Guess = { makeEn: string; model: string; nameHe: string };

export type NewNameInput = {
  make: string;
  model: string;
  /** Every catalog row (models) with the name's catalogKey, of every year and vehicle class, in models.id order. */
  rows: CatalogRow[];
  /** Active vehicles by quantityKey; null when they could not be read. */
  counts: Map<string, number> | null;
  guess: Guess;
};

// The rows the active and years columns cover, as in F2: private, from FAMILIES_YEAR_FROM.
const IN_SCOPE_CLASS = "P";

// A table lookup by own key only, as sheet.ts and review.ts do.
function prefixesOf(canonical: string): string[] {
  return Object.hasOwn(MAKES, canonical) ? MAKES[canonical].prefixes : [];
}

export function entryReason(file: ReviewFile, make: string, model: string): FailedReason {
  const found = file.familyOf(catalogKey(make, model));
  if (found === undefined) return "name_not_in_file";
  if (found === "left") return "name_without_model";
  return "name_not_imported";
}

// The compared form of a name: the make stripped (upper-cased by stripMake), spaces collapsed.
function prepared(name: string, prefixes: readonly string[]): string {
  return stripMake(name, prefixes).replace(/\s+/g, " ").trim();
}

export function guessDecision(file: ReviewFile, make: string, model: string): Guess {
  const canonical = canonicalMake(make, MAKE_MERGES);
  const prefixes = prefixesOf(canonical);
  const name = prepared(model, prefixes);

  // The longest matching name wins; on equal length the first row of the file.
  let best: { row: ReviewRow; length: number } | undefined;
  for (const r of file.rows) {
    if (r.model === "" || !r.catalogMakes.includes(canonical)) continue;
    for (const candidate of [r.model, ...r.spellings]) {
      const c = prepared(candidate, prefixes);
      if (c === "") continue;
      if (name !== c && !name.startsWith(`${c} `)) continue;
      if (best === undefined || c.length > best.length) best = { row: r, length: c.length };
    }
  }
  if (best !== undefined) return { makeEn: best.row.makeEn, model: best.row.model, nameHe: best.row.nameHe };

  const makeRow = file.makes.find((m) => m.catalogSpellings.includes(canonical));
  return { makeEn: makeRow?.nameEn ?? "", model: "", nameHe: "" };
}

// One name's rows through the sheet builder: one make, one group, one name, or the key chain is broken.
function oneName(input: SheetInput, label: string) {
  const makes = familyMakes(input);
  if (makes.length === 0) return undefined;
  if (makes.length !== 1 || makes[0].groups.length !== 1 || makes[0].groups[0].names.length !== 1) {
    throw new Error(`${label}: the rows of one catalogKey do not fold into one make and one name`);
  }
  return { make: makes[0], group: makes[0].groups[0], name: makes[0].groups[0].names[0] };
}

/** The models-tab row of a new name, in MODELS_HEADERS order. */
export function newNameRow(input: NewNameInput): (string | number)[] {
  const label = `${input.make} ${input.model}`;
  const want = catalogKey(input.make, input.model);
  for (const r of input.rows) {
    const k = catalogKey(r.make, r.model);
    if (k.canonicalMake !== want.canonicalMake || k.key !== want.key) {
      throw new Error(`${label}: the catalog row ${JSON.stringify([r.make, r.model])} has another catalogKey`);
    }
  }

  const [CATALOG_MAKE, GROUP, CATALOG_NAME, ACTIVE, YEARS, LIVE, MAKE, MODEL, NAME_HE] = MODELS_HEADERS;
  // F3e §4: a name whose catalog rows were all skipped still gets its row — its own make and name, the group of
  // its name as the sheet builder computes it, the data cells empty.
  if (input.rows.length === 0) {
    const empty: Record<(typeof MODELS_HEADERS)[number], string | number> = {
      [CATALOG_MAKE]: input.make,
      [GROUP]: groupKey(stripMake(input.model, prefixesOf(canonicalMake(input.make, MAKE_MERGES)))),
      [CATALOG_NAME]: input.model,
      [ACTIVE]: "",
      [YEARS]: "",
      [LIVE]: "",
      [MAKE]: input.guess.makeEn,
      [MODEL]: input.guess.model,
      [NAME_HE]: input.guess.nameHe,
    };
    return MODELS_HEADERS.map((h) => empty[h]);
  }

  const inScope = (r: CatalogRow) => r.vehicleClass === IN_SCOPE_CLASS && r.year >= FAMILIES_YEAR_FROM;
  // Only the in-scope rows count, as in F2: the spellings of the other rows follow them in first-seen order.
  const activeOf = (r: CatalogRow): number =>
    input.counts === null || !inScope(r) ? 0 : input.counts.get(quantityKey(r.tozeretCd, r.degemCd, r.year)) ?? 0;
  const sheetInput = (rows: CatalogRow[]): SheetInput => ({
    rows: rows.map((r) => ({ ...r, active: activeOf(r) })),
    live: new Set<string>(),
    makeMerges: MAKE_MERGES,
    makes: MAKES,
    minActive: 0,
  });

  const all = oneName(sheetInput(input.rows), label)!;
  const scoped = oneName(sheetInput(input.rows.filter(inScope)), label);

  const cells: Record<(typeof MODELS_HEADERS)[number], string | number> = {
    [CATALOG_MAKE]: all.make.spellings.join(SPELLING_SEPARATOR),
    [GROUP]: all.group.key,
    [CATALOG_NAME]: all.name.spellings.map((s) => s.raw).join(SPELLING_SEPARATOR),
    [ACTIVE]: input.counts === null ? "" : scoped?.name.active ?? 0,
    [YEARS]: scoped === undefined ? "" : `${scoped.name.years[0]}-${scoped.name.years[1]}`,
    [LIVE]: "",
    [MAKE]: input.guess.makeEn,
    [MODEL]: input.guess.model,
    [NAME_HE]: input.guess.nameHe,
  };
  return MODELS_HEADERS.map((h) => cells[h]);
}
