// BRIEF Day 19b Run 22 §2 — THE "מפרט ידני" TAB: the manual spec, one row per model_specs row
// (findCar-schema.md §18). Read in "exact" header mode: this is OUR sheet, and a column that moved would be
// read into the wrong field.
//
// EVERY COLUMN IS REQUIRED except the consumption, which is empty exactly for the electric and the plug-in
// engine types — there is no "empty = everything" anywhere. Every error names the row and the column, and
// stops the import before it starts.
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
  "תא מטען (ליטר)", "מיכל דלק (ליטר)", "צריכת דלק (ק\u0022מ לליטר)", "קישור קארזון", "תאריך",
] as const;

export type ManualSpec = {
  n: number; make: string; model: string; body_type: string; year: number; engine_size: number;
  engine_type: EngineTypeCode; drive_type: "4X2" | "4X4"; sub_models: string[];
  length_mm: number; width_mm: number; height_mm: number; trunk_liters: number; tank_liters: number;
  km_per_liter: number | null; carzone_url: string; source_date: string;
};

function fail(n: number, column: string, msg: string): never {
  throw new Error(`row ${n}: ${column}: ${msg}`);
}

/** A whole number ≥ 1, a thousands comma removed first (as the cars tab's intOrNull does). */
function positiveInt(value: string, n: number, column: string): number {
  const digits = value.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(digits)) fail(n, column, `not a whole number: ${JSON.stringify(value)}`);
  const v = Number(digits);
  if (v < 1) fail(n, column, `must be at least 1, got ${JSON.stringify(value)}`);
  return v;
}

/** §2.3 — one row of the tab. */
export function parseSpecRow(values: Record<string, string>, n: number): ManualSpec {
  const [MAKE, MODEL, BODY, ENGINE, DRIVE, TRIM, YEAR, CC, LENGTH, WIDTH, HEIGHT, TRUNK, TANK, CONSUMPTION, CARZONE, DATE] = SPEC_HEADERS;
  const v = (column: string): string => (values[column] ?? "").trim();
  const required = (column: string): string => {
    const t = v(column);
    if (!t) fail(n, column, "empty");
    return t;
  };

  const make = required(MAKE);
  const model = required(MODEL);
  const body_type = required(BODY);

  const engineWord = required(ENGINE);
  const engine_type = engineTypeFromWord(engineWord);
  if (engine_type === null) fail(n, ENGINE, `unknown engine type ${JSON.stringify(engineWord)}`);

  const driveCell = required(DRIVE);
  let drive_type: "4X2" | "4X4";
  if (driveCell === "2") drive_type = "4X2";
  else if (driveCell === "4") drive_type = "4X4";
  else fail(n, DRIVE, `expected 2 or 4, got ${JSON.stringify(driveCell)}`);

  // A comma-separated list. Another separator is not recognized: such a cell is one strange trim that will
  // simply match nothing.
  const sub_models = required(TRIM).split(",").map((p) => p.trim());
  if (sub_models.some((p) => p === "")) fail(n, TRIM, `an empty part in the list ${JSON.stringify(v(TRIM))}`);
  const twice = sub_models.find((p, i) => sub_models.indexOf(p) !== i);
  if (twice !== undefined) fail(n, TRIM, `${JSON.stringify(twice)} appears twice`);

  const yearCell = required(YEAR);
  if (!/^\d{4}$/.test(yearCell)) fail(n, YEAR, `expected four digits, got ${JSON.stringify(yearCell)}`);

  const engine_size = positiveInt(required(CC), n, CC);
  const length_mm = positiveInt(required(LENGTH), n, LENGTH);
  const width_mm = positiveInt(required(WIDTH), n, WIDTH);
  const height_mm = positiveInt(required(HEIGHT), n, HEIGHT);
  const trunk_liters = positiveInt(required(TRUNK), n, TRUNK);
  const tank_liters = positiveInt(required(TANK), n, TANK);

  // The consumption: empty exactly for electric / plug_in, filled for every other engine type.
  const consumptionCell = v(CONSUMPTION);
  const noConsumption = engine_type === "electric" || engine_type === "plug_in";
  let km_per_liter: number | null = null;
  if (noConsumption) {
    if (consumptionCell) fail(n, CONSUMPTION, `must be empty for ${JSON.stringify(engineWord)}, got ${JSON.stringify(consumptionCell)}`);
  } else {
    if (!consumptionCell) fail(n, CONSUMPTION, `empty (required for ${JSON.stringify(engineWord)})`);
    if (!/^\d+([.,]\d+)?$/.test(consumptionCell)) fail(n, CONSUMPTION, `not a decimal number: ${JSON.stringify(consumptionCell)}`);
    km_per_liter = Number(consumptionCell.replace(",", "."));
    if (!(km_per_liter > 0)) fail(n, CONSUMPTION, `must be above 0, got ${JSON.stringify(consumptionCell)}`);
  }

  const carzone_url = required(CARZONE);
  const source_date = required(DATE);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source_date) || Number.isNaN(Date.parse(source_date))) {
    fail(n, DATE, `expected YYYY-MM-DD, got ${JSON.stringify(source_date)}`);
  }

  return {
    n, make, model, body_type, year: Number(yearCell), engine_size, engine_type, drive_type, sub_models,
    length_mm, width_mm, height_mm, trunk_liters, tank_liters, km_per_liter, carzone_url, source_date,
  };
}

/** The seven scalars a models row is matched on (findCar-schema.md §18), joined — the trims aside. */
function scalarKey(s: ManualSpec): string {
  return [s.make, s.model, s.body_type, s.year, s.engine_size, s.engine_type, s.drive_type].join("\u0000");
}

/** §2.4 — the whole tab. Zero data rows is fine (the tab before it is filled). */
export function readSpecTab(wb: ExcelJS.Workbook): ManualSpec[] {
  const ws = worksheetByName(wb, SPEC_TAB);
  const columns = headerColumns(ws, 1, SPEC_HEADERS, "exact");
  const specs = dataRows(ws, 2, columns).map(({ row, values }) => parseSpecRow(values, row));

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
export function specKey(spec: ManualSpec): string {
  return [scalarKey(spec), ...[...spec.sub_models].sort()].join("\u0000");
}
