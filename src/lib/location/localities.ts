// BRIEF Day 19b Run 21 §3 — THE LOCALITIES FILE. The Central Bureau of Statistics' locality list, as the
// plan's technical section ("קובץ היישובים") describes it: data/raw/localities.xlsx, sheet גיליון1, headers
// in row 11, data from row 13, and three of its columns read by header text.
//
// THE SITE NEVER IMPORTS THIS FILE — it pulls in exceljs through src/lib/excel/read.ts. The pure rules the
// car page and the contact window read live in place.ts next door, and src/lib/location/ deliberately has
// NO index.ts, so no import of "@/lib/location" can drag a spreadsheet library into the browser bundle.
//
// EVERY ERROR HERE STOPS THE IMPORT BEFORE IT STARTS (plan: "ערך אחר — הייבוא לא מתחיל"), and every error
// names the row of the file, because that is what a person opens the file to look at.

import type * as ExcelJS from "exceljs";
import { dataRows, headerColumns, readWorkbook, worksheetByName } from "@/lib/excel/read";
import { cleanCityName, lookupKey, regionOf, regionOfDistrict, type Locality, type LocalityIndex } from "./place";

export const LOCALITIES_PATH = "data/raw/localities.xlsx";
export const LOCALITIES_SHEET = "\u05D2\u05D9\u05DC\u05D9\u05D5\u05DF1"; // גיליון1
export const LOCALITIES_HEADER_ROW = 11;
export const LOCALITIES_FIRST_DATA_ROW = 13;

/** The three headers we read. The file has others; they are ignored, and it may gain more. */
export const HEADER_CODE = "\u05E1\u05DE\u05DC \u05D4\u05D9\u05D9\u05E9\u05D5\u05D1"; // סמל היישוב
export const HEADER_NAME = "\u05E9\u05DD \u05D9\u05D9\u05E9\u05D5\u05D1"; // שם יישוב
export const HEADER_DISTRICT = "\u05DE\u05D7\u05D5\u05D6"; // מחוז

/**
 * The workbook → the index the import looks a location cell up in, keyed by lookupKey() of the FILE's name.
 *
 * Every value is trimmed; the stored city spelling is cleanCityName() of the name; the area is regionOf(),
 * which puts אילת in its own area before the district is read at all.
 */
export function parseLocalities(wb: ExcelJS.Workbook): LocalityIndex {
  const ws = worksheetByName(wb, LOCALITIES_SHEET);
  const columns = headerColumns(ws, LOCALITIES_HEADER_ROW, [HEADER_CODE, HEADER_NAME, HEADER_DISTRICT], "subset");

  const index = new Map<string, Locality>();
  const rowOfCode = new Map<string, number>();
  const rowOfKey = new Map<string, number>();
  const nameOfKey = new Map<string, string>();

  for (const { row, values } of dataRows(ws, LOCALITIES_FIRST_DATA_ROW, columns)) {
    const code = values[HEADER_CODE].trim();
    const name = values[HEADER_NAME].trim();
    const district = values[HEADER_DISTRICT].trim();

    if (code === "") throw new Error(`${LOCALITIES_PATH} row ${row}: the locality code (${HEADER_CODE}) is empty`);
    if (name === "") throw new Error(`${LOCALITIES_PATH} row ${row}: the locality name (${HEADER_NAME}) is empty`);
    if (district === "") throw new Error(`${LOCALITIES_PATH} row ${row}: the district (${HEADER_DISTRICT}) is empty, for "${name}"`);

    if (regionOfDistrict(district) === null) {
      throw new Error(`${LOCALITIES_PATH} row ${row}: the district "${district}" is not one of the seven this code knows, for "${name}"`);
    }

    const seenCode = rowOfCode.get(code);
    if (seenCode !== undefined) throw new Error(`${LOCALITIES_PATH} row ${row}: the locality code ${code} is already row ${seenCode}`);
    rowOfCode.set(code, row);

    const city = cleanCityName(name);
    // regionOf() cannot be null here — the district was checked against the seven just above — but the
    // check is written out rather than asserted away: a null area must never reach the index.
    const region = regionOf(city, district);
    if (region === null) throw new Error(`${LOCALITIES_PATH} row ${row}: no area for "${name}" in the district "${district}"`);

    const key = lookupKey(name);
    const seenKey = rowOfKey.get(key);
    if (seenKey !== undefined) {
      throw new Error(
        `${LOCALITIES_PATH} row ${row}: "${name}" and "${nameOfKey.get(key)}" (row ${seenKey}) are one search key — the import cannot tell them apart`,
      );
    }
    rowOfKey.set(key, row);
    nameOfKey.set(key, name);

    index.set(key, { code, city, region });
  }

  return index;
}

/** The index, read from the file. The only function here that touches the disk. */
export async function loadLocalities(path: string = LOCALITIES_PATH): Promise<LocalityIndex> {
  const wb = await readWorkbook(path);
  return parseLocalities(wb);
}
