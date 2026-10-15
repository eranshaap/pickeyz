// BRIEF Day 19b Run 21 §3 — the localities file. The workbook is built IN MEMORY, laid out exactly like the
// real one: sheet גיליון1, rows 1–10 empty (the file's own preamble), twelve headers in row 11 with our
// three among them, row 12 empty, data from row 13. Non-ASCII marks are \uXXXX escapes, as in §2.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as ExcelJS from "exceljs";
import {
  HEADER_CODE,
  HEADER_DISTRICT,
  HEADER_NAME,
  LOCALITIES_FIRST_DATA_ROW,
  LOCALITIES_HEADER_ROW,
  LOCALITIES_SHEET,
  parseLocalities,
} from "./localities";
import { lookupKey } from "./place";

// --- the names and districts this file speaks about -------------------------
const NETANYA = "\u05E0\u05EA\u05E0\u05D9\u05D4"; // נתניה
const SAKHNIN = "\u05E1\u05D7\u0027\u05E0\u05D9\u05DF"; // סח'נין, with U+0027
const SAKHNIN_GERESH = "\u05E1\u05D7\u05F3\u05E0\u05D9\u05DF"; // סח׳נין, with U+05F3 — the same search key
const TEL_AVIV_YAFO_FILE = "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1 -\u05D9\u05E4\u05D5"; // תל אביב -יפו
const TEL_AVIV_YAFO_STORED = "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1-\u05D9\u05E4\u05D5"; // תל אביב-יפו
const EILAT = "\u05D0\u05D9\u05DC\u05EA"; // אילת
const JERUSALEM = "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD"; // ירושלים
const YERUHAM_STARRED = "\u05D9\u05E8\u05D5\u05D7\u05DD*"; // ירוחם*, as the file marks some names
const YERUHAM = "\u05D9\u05E8\u05D5\u05D7\u05DD"; // ירוחם

const CENTER: string = "\u05DE\u05E8\u05DB\u05D6"; // מרכז
const NORTH: string = "\u05E6\u05E4\u05D5\u05DF"; // צפון
const TEL_AVIV_REGION: string = "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1"; // תל אביב
const SOUTH: string = "\u05D3\u05E8\u05D5\u05DD"; // דרום
const JERUSALEM_REGION: string = "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD"; // ירושלים

const D_CENTER = "\u05D4\u05DE\u05E8\u05DB\u05D6"; // המרכז
const D_NORTH = "\u05D4\u05E6\u05E4\u05D5\u05DF"; // הצפון
const D_TEL_AVIV = "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1"; // תל אביב
const D_SOUTH = "\u05D4\u05D3\u05E8\u05D5\u05DD"; // הדרום
const D_JERUSALEM = "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD"; // ירושלים
const D_UNKNOWN = "\u05D4\u05E9\u05E8\u05D5\u05DF"; // השרון — no such district in the file

/** The file's twelve headers: ours in columns 2, 4 and 7, five others around them. */
const HEADERS: (string | null)[] = [
  "\u05E1\u05D4\u0022\u05DB", // סה"כ
  HEADER_CODE,
  "\u05DE\u05D8\u05E8\u05D5\u05E4\u05D5\u05DC\u05D9\u05DF", // מטרופולין
  HEADER_NAME,
  "\u05E0\u05E4\u05D4", // נפה
  "\u05DE\u05D5\u05E2\u05E6\u05D4 \u05D0\u05D6\u05D5\u05E8\u05D9\u05EA", // מועצה אזורית
  HEADER_DISTRICT,
  "\u05E6\u05D5\u05E8\u05EA \u05D9\u05D9\u05E9\u05D5\u05D1", // צורת יישוב
  "\u05D3\u05EA", // דת
  "\u05DE\u05D3\u05D3", // מדד
  null,
  null,
];

// F3e: plain letters only, no marks, so written as text.
const KIRYAT_TIVON_LONG = "קריית טבעון"; // the file's spelling
const KIRYAT_TIVON_SHORT = "קרית טבעון"; // one yod
const D_HAIFA = "חיפה";

const COL_CODE = 2;
const COL_NAME = 4;
const COL_DISTRICT = 7;

type Row = { code: string; name: string; district: string };

/** A workbook laid out like the real file, with `rows` from row 13 on. */
function workbookOf(rows: readonly Row[], headers: (string | null)[] = HEADERS): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(LOCALITIES_SHEET);
  headers.forEach((h, i) => {
    ws.getRow(LOCALITIES_HEADER_ROW).getCell(i + 1).value = h;
  });
  rows.forEach((r, i) => {
    const row = ws.getRow(LOCALITIES_FIRST_DATA_ROW + i);
    row.getCell(COL_CODE).value = r.code;
    row.getCell(COL_NAME).value = r.name;
    row.getCell(COL_DISTRICT).value = r.district;
  });
  return wb;
}

const GOOD: Row[] = [
  { code: "7400", name: NETANYA, district: D_CENTER },
  { code: "0469", name: SAKHNIN, district: D_NORTH },
  { code: "5000", name: TEL_AVIV_YAFO_FILE, district: D_TEL_AVIV },
  { code: "2600", name: EILAT, district: D_SOUTH },
  { code: "3000", name: JERUSALEM, district: D_JERUSALEM },
  { code: "0831", name: YERUHAM_STARRED, district: D_SOUTH },
];

describe("parseLocalities, a good file (§3)", () => {
  const index = parseLocalities(workbookOf(GOOD));

  it("has one entry per data row", () => {
    assert.equal(index.size, GOOD.length);
  });

  it("keys every locality by the search key of the FILE's name", () => {
    assert.deepEqual(index.get(lookupKey(NETANYA)), { code: "7400", city: NETANYA, region: CENTER });
    assert.deepEqual(index.get(lookupKey(SAKHNIN_GERESH)), { code: "0469", city: SAKHNIN, region: NORTH });
  });

  it("stores \u05EA\u05DC \u05D0\u05D1\u05D9\u05D1 -\u05D9\u05E4\u05D5 as \u05EA\u05DC \u05D0\u05D1\u05D9\u05D1-\u05D9\u05E4\u05D5", () => {
    assert.deepEqual(index.get(lookupKey(TEL_AVIV_YAFO_FILE)), { code: "5000", city: TEL_AVIV_YAFO_STORED, region: TEL_AVIV_REGION });
  });

  it("drops the asterisk from a marked name", () => {
    assert.deepEqual(index.get(lookupKey(YERUHAM_STARRED)), { code: "0831", city: YERUHAM, region: SOUTH });
    assert.deepEqual(index.get(lookupKey(YERUHAM)), { code: "0831", city: YERUHAM, region: SOUTH });
  });

  it("\u05D0\u05D9\u05DC\u05EA is its own area, not \u05D3\u05E8\u05D5\u05DD", () => {
    assert.deepEqual(index.get(lookupKey(EILAT)), { code: "2600", city: EILAT, region: EILAT });
  });

  it("\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD is a city in its own area", () => {
    assert.deepEqual(index.get(lookupKey(JERUSALEM)), { code: "3000", city: JERUSALEM, region: JERUSALEM_REGION });
  });
});

describe("parseLocalities, the errors that stop the import (§3)", () => {
  it("a missing header", () => {
    const headers = HEADERS.map((h) => (h === HEADER_DISTRICT ? "x" : h));
    assert.throws(() => parseLocalities(workbookOf(GOOD, headers)), (e: Error) => e.message.includes(HEADER_DISTRICT));
  });

  it("the wrong sheet name", () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Sheet1");
    assert.throws(() => parseLocalities(wb), (e: Error) => e.message.includes(LOCALITIES_SHEET));
  });

  it("an empty code, naming the row", () => {
    const rows: Row[] = [GOOD[0], { code: "   ", name: EILAT, district: D_SOUTH }];
    assert.throws(() => parseLocalities(workbookOf(rows)), (e: Error) => e.message.includes("row 14") && e.message.includes(HEADER_CODE));
  });

  it("an empty name, naming the row", () => {
    const rows: Row[] = [GOOD[0], { code: "2600", name: "", district: D_SOUTH }];
    assert.throws(() => parseLocalities(workbookOf(rows)), (e: Error) => e.message.includes("row 14") && e.message.includes(HEADER_NAME));
  });

  it("an empty district, naming the row and the locality", () => {
    const rows: Row[] = [GOOD[0], { code: "2600", name: EILAT, district: "" }];
    assert.throws(() => parseLocalities(workbookOf(rows)), (e: Error) => e.message.includes("row 14") && e.message.includes(EILAT));
  });

  it("a district regionOfDistrict() does not know, naming the value and the row", () => {
    const rows: Row[] = [GOOD[0], { code: "2600", name: NETANYA, district: D_UNKNOWN }];
    assert.throws(
      () => parseLocalities(workbookOf(rows)),
      (e: Error) => e.message.includes("row 14") && e.message.includes(D_UNKNOWN),
    );
  });

  it("a code seen twice, naming both rows", () => {
    const rows: Row[] = [GOOD[0], GOOD[1], { code: "7400", name: EILAT, district: D_SOUTH }];
    assert.throws(
      () => parseLocalities(workbookOf(rows)),
      (e: Error) => e.message.includes("row 15") && e.message.includes("row 13") && e.message.includes("7400"),
    );
  });

  it("two names with the same search key, naming both", () => {
    const rows: Row[] = [{ code: "0469", name: SAKHNIN, district: D_NORTH }, { code: "0470", name: SAKHNIN_GERESH, district: D_NORTH }];
    assert.throws(
      () => parseLocalities(workbookOf(rows)),
      (e: Error) => e.message.includes(SAKHNIN) && e.message.includes(SAKHNIN_GERESH) && e.message.includes("row 14") && e.message.includes("row 13"),
    );
  });

  it("KIRYAT_TIVON_LONG and KIRYAT_TIVON_SHORT collide under the yod fold (F3e), naming both", () => {
    const rows: Row[] = [{ code: "2300", name: KIRYAT_TIVON_LONG, district: D_HAIFA }, { code: "2301", name: KIRYAT_TIVON_SHORT, district: D_HAIFA }];
    assert.throws(
      () => parseLocalities(workbookOf(rows)),
      (e: Error) => e.message.includes(KIRYAT_TIVON_LONG) && e.message.includes(KIRYAT_TIVON_SHORT),
    );
  });

  it("צוקים and צוקי ים do NOT collide: the yod fold is inside a word only (Run 1b)", () => {
    const rows: Row[] = [{ code: "1001", name: "צוקי ים", district: D_CENTER }, { code: "1002", name: "צוקים", district: D_SOUTH }];
    const index = parseLocalities(workbookOf(rows));
    assert.equal(index.size, 2);
  });
});
