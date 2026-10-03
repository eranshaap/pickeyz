// BRIEF Day 19b Run 22 §2 — THE "מפרט ידני" TAB: the manual spec, one row per model_specs row
// (findCar-schema.md §18). Read in "exact" header mode: this is OUR sheet, and a column that moved would be
// read into the wrong field.
//
// EVERY COLUMN IS REQUIRED except the consumption, which is empty exactly for the electric and the plug-in
// engine types — there is no "empty = everything" anywhere. Every problem names its row and its column, and
// all of them — every row, every column — are listed together before the import stops (Day 19b Run 24).
// The sources column holds one or more links, separated by spaces or line breaks.
//
// THE SITE NEVER IMPORTS src/lib/sheet/.

import type * as ExcelJS from "exceljs";
import { dataRows, headerColumns, worksheetByName } from "@/lib/excel/read";
import { engineTypeFromWord, type EngineTypeCode } from "@/lib/display/spec";

export const SPEC_TAB = "מפרט ידני";

// The 16 headers, in this order, from column 1. The mark in סמ"ק, מ"מ and ק"מ is U+0022, the plain quotation
// mark, exactly as the sheet writes it; the parentheses are ASCII.
export const SPEC_HEADERS = [
  "יצרן", "דגם", "מרכב", "סוג מנוע", "הנעה", "גימור", "שנה",
  "נפח מנוע (סמ\u0022ק)", "אורך (מ\u0022מ)", "רוחב (מ\u0022מ)", "גובה (מ\u0022מ)",
  "תא מטען (ליטר)", "מיכל דלק (ליטר)", "צריכת דלק (ק\u0022מ לליטר)", "מקורות", "תאריך",
] as const;

export type ManualSpec = {
  n: number; make: string; model: string; body_type: string; year: number; engine_size: number;
  engine_type: EngineTypeCode; drive_type: "4X2" | "4X4"; sub_models: string[];
  length_mm: number; width_mm: number; height_mm: number; trunk_liters: number; tank_liters: number;
  km_per_liter: number | null; carzone_url: string; source_date: string;
};

export type SpecProblem = { n: number; column: string; message: string };

/** Day 19b Run 24 — every problem of one row, one per line: `row {n}: {column}: {message}`. */
export class SpecRowError extends Error {
  readonly problems: SpecProblem[];
  constructor(problems: SpecProblem[]) {
    super(problems.map((p) => `row ${p.n}: ${p.column}: ${p.message}`).join("\n"));
    this.problems = problems;
  }
}

/** One cell's problem; parseSpecRow collects it and goes on to the next column. */
class CellProblem {
  constructor(readonly column: string, readonly message: string) {}
}

function fail(column: string, msg: string): never {
  throw new CellProblem(column, msg);
}

/** A whole number ≥ 1, a thousands comma removed first (as the cars tab's intOrNull does). */
function positiveInt(value: string, column: string): number {
  const digits = value.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(digits)) fail(column, `not a whole number: ${JSON.stringify(value)}`);
  const v = Number(digits);
  if (v < 1) fail(column, `must be at least 1, got ${JSON.stringify(value)}`);
  return v;
}

/** A decimal above 0, a comma or a dot. */
function positiveDecimal(value: string, column: string): number {
  if (!/^\d+([.,]\d+)?$/.test(value)) fail(column, `not a decimal number: ${JSON.stringify(value)}`);
  const d = Number(value.replace(",", "."));
  if (!(d > 0)) fail(column, `must be above 0, got ${JSON.stringify(value)}`);
  return d;
}

/** §2.3 — one row of the tab. Every column is checked, in header order; all the problems are thrown together. */
export function parseSpecRow(values: Record<string, string>, n: number): ManualSpec {
  const [MAKE, MODEL, BODY, ENGINE, DRIVE, TRIM, YEAR, CC, LENGTH, WIDTH, HEIGHT, TRUNK, TANK, CONSUMPTION, SOURCES, DATE] = SPEC_HEADERS;
  const v = (column: string): string => (values[column] ?? "").trim();
  const required = (column: string): string => {
    const t = v(column);
    if (!t) fail(column, "empty");
    return t;
  };
  const problems: SpecProblem[] = [];
  const check = <T>(run: () => T): T | undefined => {
    try {
      return run();
    } catch (e) {
      if (!(e instanceof CellProblem)) throw e;
      problems.push({ n, column: e.column, message: e.message });
      return undefined;
    }
  };

  const make = check(() => required(MAKE));
  const model = check(() => required(MODEL));
  const body_type = check(() => required(BODY));

  const engine_type = check(() => {
    const word = required(ENGINE);
    const t = engineTypeFromWord(word);
    if (t === null) fail(ENGINE, `unknown engine type ${JSON.stringify(word)}`);
    return t;
  });
  const engineWord = v(ENGINE);

  const drive_type = check((): "4X2" | "4X4" => {
    const driveCell = required(DRIVE);
    if (driveCell === "2") return "4X2";
    if (driveCell === "4") return "4X4";
    fail(DRIVE, `expected 2 or 4, got ${JSON.stringify(driveCell)}`);
  });

  // A comma-separated list. Another separator is not recognized: such a cell is one strange trim that will
  // simply match nothing.
  const sub_models = check(() => {
    const parts = required(TRIM).split(",").map((p) => p.trim());
    if (parts.some((p) => p === "")) fail(TRIM, `an empty part in the list ${JSON.stringify(v(TRIM))}`);
    const twice = parts.find((p, i) => parts.indexOf(p) !== i);
    if (twice !== undefined) fail(TRIM, `${JSON.stringify(twice)} appears twice`);
    return parts;
  });

  const year = check(() => {
    const yearCell = required(YEAR);
    if (!/^\d{4}$/.test(yearCell)) fail(YEAR, `expected four digits, got ${JSON.stringify(yearCell)}`);
    return Number(yearCell);
  });

  const engine_size = check(() => positiveInt(required(CC), CC));
  const length_mm = check(() => positiveInt(required(LENGTH), LENGTH));
  const width_mm = check(() => positiveInt(required(WIDTH), WIDTH));
  const height_mm = check(() => positiveInt(required(HEIGHT), HEIGHT));
  const trunk_liters = check(() => positiveInt(required(TRUNK), TRUNK));
  const tank_liters = check(() => positiveInt(required(TANK), TANK));

  // The consumption: empty exactly for electric / plug_in, filled for every other engine type. When the engine
  // type is unknown (its own problem is listed), only the form is checked: if filled, a decimal above 0.
  const km_per_liter = check((): number | null => {
    const consumptionCell = v(CONSUMPTION);
    if (engine_type === undefined) {
      if (consumptionCell) positiveDecimal(consumptionCell, CONSUMPTION);
      return null;
    }
    if (engine_type === "electric" || engine_type === "plug_in") {
      if (consumptionCell) fail(CONSUMPTION, `must be empty for ${JSON.stringify(engineWord)}, got ${JSON.stringify(consumptionCell)}`);
      return null;
    }
    if (!consumptionCell) fail(CONSUMPTION, `empty (required for ${JSON.stringify(engineWord)})`);
    return positiveDecimal(consumptionCell, CONSUMPTION);
  });

  // The sources: one or more links, split on every run of whitespace (spaces and line breaks alike). The
  // trimmed cell text is kept as it is.
  const carzone_url = check(() => {
    const text = required(SOURCES);
    for (const part of text.split(/\s+/)) {
      if (!/^https?:\/\//.test(part)) fail(SOURCES, `not a link: ${JSON.stringify(part)}`);
    }
    return text;
  });

  const source_date = check(() => {
    const d = required(DATE);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) {
      fail(DATE, `expected YYYY-MM-DD, got ${JSON.stringify(d)}`);
    }
    return d;
  });

  if (problems.length > 0) throw new SpecRowError(problems);
  return {
    n, make: make!, model: model!, body_type: body_type!, year: year!, engine_size: engine_size!,
    engine_type: engine_type!, drive_type: drive_type!, sub_models: sub_models!,
    length_mm: length_mm!, width_mm: width_mm!, height_mm: height_mm!, trunk_liters: trunk_liters!,
    tank_liters: tank_liters!, km_per_liter: km_per_liter as number | null, carzone_url: carzone_url!,
    source_date: source_date!,
  };
}

/**
 * Day 19b Run 22b — the fields a spec row's identity is made of. A stored model_specs row carries them under
 * the same names, so the import keys the stored rows and the tab's rows by the one function below.
 */
export type SpecIdentity = {
  make: string; model: string; body_type: string; year: number; engine_size: number;
  engine_type: string; drive_type: string; sub_models: readonly string[];
};

/** The seven scalars a models row is matched on (findCar-schema.md §18), joined — the trims aside. */
function scalarKey(s: SpecIdentity): string {
  return [s.make, s.model, s.body_type, s.year, s.engine_size, s.engine_type, s.drive_type].join("\u0000");
}

/**
 * §2.4 — the whole tab. Zero data rows is fine (the tab before it is filled). Every row is parsed and every
 * problem of the tab is listed in one error (Day 19b Run 24); the clash check runs only on a tab with none.
 */
export function readSpecTab(wb: ExcelJS.Workbook): ManualSpec[] {
  const ws = worksheetByName(wb, SPEC_TAB);
  const columns = headerColumns(ws, 1, SPEC_HEADERS, "exact");
  const specs: ManualSpec[] = [];
  const problems: SpecProblem[] = [];
  for (const { row, values } of dataRows(ws, 2, columns)) {
    try {
      specs.push(parseSpecRow(values, row));
    } catch (e) {
      if (!(e instanceof SpecRowError)) throw e;
      problems.push(...e.problems);
    }
  }
  if (problems.length > 0) {
    throw new Error([
      `sheet "${SPEC_TAB}": ${problems.length} problem(s) — the import does not start:`,
      ...problems.map((p) => `  row ${p.n}: ${p.column}: ${p.message}`),
    ].join("\n"));
  }

  // Two rows with the same seven scalars and a trim in common would make one models row match both.
  const clashes: string[] = [];
  for (let i = 0; i < specs.length; i += 1) {
    for (let j = i + 1; j < specs.length; j += 1) {
      if (scalarKey(specs[i]) !== scalarKey(specs[j])) continue;
      const shared = specs[i].sub_models.filter((t) => specs[j].sub_models.includes(t));
      if (shared.length > 0) {
        clashes.push(`rows ${specs[i].n} and ${specs[j].n} share the trim ${shared.map((t) => JSON.stringify(t)).join(", ")}`);
      }
    }
  }
  if (clashes.length > 0) {
    throw new Error(`sheet "${SPEC_TAB}": the same version in two rows:\n  ${clashes.join("\n  ")}`);
  }
  return specs;
}

/** §2.5 — a spec row's identity for the sync: the seven scalars and the trims as a sorted set. */
export function specKey(spec: SpecIdentity): string {
  return [scalarKey(spec), ...[...spec.sub_models].sort()].join("\u0000");
}
