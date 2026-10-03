// BRIEF Day 19b Run 22 §1 — the "רכבים" tab. Every workbook is built IN MEMORY: the sheet's 14 headers in
// row 1 (extra headers allowed), data from row 2.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as ExcelJS from "exceljs";
import { CARS_HEADERS, CARS_TAB, parseCarsRow, readCarsTab } from "./cars-tab";

const LINK = "https://www.yad2.co.il/vehicles/item/abc123XY";

/** A full, good row, by header. */
function good(over: Record<string, ExcelJS.CellValue> = {}): Record<string, ExcelJS.CellValue> {
  return {
    "מספר רישוי": "12-345-67",
    "מחיר": "103,000",
    "קילומטראז\u0027": 85000,
    "יד לפי המודעה": "2",
    "צבע": " לבן ",
    "אזור": " נתניה ",
    "שם המוכר": " אוטו דיל ",
    "סוג המוכר": "מגרש",
    "טלפון": "972-52-1234567",
    "קישור למודעה": LINK,
    "תאריך צפייה": new Date(Date.UTC(2026, 9, 2)),
    "הערות שלי": "whatever",
    "ירד": "לא",
    "שנתון לפי המודעה": 2021,
    ...over,
  };
}

/** A workbook with the tab "רכבים": `headers` in row 1, one row per object from row 2. */
function workbook(rows: Record<string, ExcelJS.CellValue>[], headers: readonly string[] = CARS_HEADERS): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(CARS_TAB);
  headers.forEach((h, i) => (ws.getRow(1).getCell(i + 1).value = h));
  rows.forEach((r, j) => {
    headers.forEach((h, i) => {
      if (h in r) ws.getRow(j + 2).getCell(i + 1).value = r[h];
    });
  });
  return wb;
}

/** One row read through the whole tab, so the cell values go through cellText as the import's do. */
function one(over: Record<string, ExcelJS.CellValue> = {}) {
  return readCarsTab(workbook([good(over)])).rows[0];
}

describe("CARS_HEADERS (§1.1)", () => {
  it("the 14 headers, ירד and שנתון לפי המודעה among them", () => {
    assert.equal(CARS_HEADERS.length, 14);
    assert.ok((CARS_HEADERS as readonly string[]).includes("ירד"));
    assert.ok((CARS_HEADERS as readonly string[]).includes("שנתון לפי המודעה"));
    assert.equal(CARS_HEADERS[2], "קילומטראז\u0027");
  });
});

describe("readCarsTab / parseCarsRow (§1.3, §1.4)", () => {
  it("a good row → every field", () => {
    assert.deepEqual(one(), {
      n: 2, plate: "1234567", price: 103000, km: 85000, hand: 2, color: "לבן", place_cell: "נתניה",
      seller_name: "אוטו דיל", seller_type: "lot", phone: "0521234567", source: "yad2", external_id: "abc123XY",
      first_seen: "2026-10-02", link: LINK, delisted_cell: "לא", ad_year: 2021,
    });
  });

  it("headers = the header texts found", () => {
    const { headers } = readCarsTab(workbook([good()], [...CARS_HEADERS, "עוד עמודה"]));
    assert.deepEqual(headers, [...CARS_HEADERS, "עוד עמודה"]);
  });

  it("a private seller with an empty name → \"\"", () => {
    const r = one({ "סוג המוכר": "פרטי", "שם המוכר": "  " });
    assert.equal(r.seller_type, "private");
    assert.equal(r.seller_name, "");
  });

  it("a business with an empty name → the error", () => {
    assert.throws(() => one({ "שם המוכר": null }), /^Error: row 2: seller name: empty$/);
  });

  it("ad_year: empty → null, 2021 → 2021, \"2021 \" → 2021, 21 → error", () => {
    assert.equal(one({ "שנתון לפי המודעה": null }).ad_year, null);
    assert.equal(one({ "שנתון לפי המודעה": "2021" }).ad_year, 2021);
    assert.equal(one({ "שנתון לפי המודעה": "2021 " }).ad_year, 2021);
    assert.throws(() => one({ "שנתון לפי המודעה": 21 }), /^Error: row 2: ad year \(שנתון לפי המודעה\): expected four digits, got "21"$/);
  });

  it("place_cell trimmed, \"\" when empty — no validation here", () => {
    assert.equal(one({ "אזור": "  חיפה  " }).place_cell, "חיפה");
    assert.equal(one({ "אזור": null }).place_cell, "");
    assert.equal(one({ "אזור": "no such place" }).place_cell, "no such place");
  });

  it("delisted_cell is the raw cell, not trimmed", () => {
    assert.equal(one({ "ירד": " כן " }).delisted_cell, " כן ");
  });

  it("a missing header → one error naming it", () => {
    const headers = CARS_HEADERS.filter((h) => h !== "שנתון לפי המודעה");
    assert.throws(() => readCarsTab(workbook([good()], headers)), /missing header: "שנתון לפי המודעה"/);
  });

  it("an extra header passes", () => {
    const wb = workbook([good({ "עוד עמודה": "x" })], ["עוד עמודה", ...CARS_HEADERS]);
    assert.equal(readCarsTab(wb).rows[0].plate, "1234567");
  });

  it("the four other stops: plate, seller type, date, link", () => {
    assert.throws(() => one({ "מספר רישוי": "12345" }), /^Error: row 2: plate: expected 7-8 digits, got "12345"$/);
    assert.throws(() => one({ "סוג המוכר": "סוחר" }), /^Error: row 2: seller type: unknown value "סוחר"$/);
    assert.throws(() => one({ "תאריך צפייה": "02/10/2026" }), /^Error: row 2: date: expected YYYY-MM-DD, got "02\/10\/2026"$/);
    assert.throws(() => one({ "קישור למודעה": "https://example.com/x" }), /^Error: row 2: link: not a yad2 item url/);
  });

  it("the row number is the Excel row (an all-empty row in between is skipped, not counted)", () => {
    const wb = workbook([good(), {}, good({ "מספר רישוי": "bad" })]);
    assert.throws(() => readCarsTab(wb), /^Error: row 4: plate/);
    const ok = readCarsTab(workbook([good(), {}, good()])).rows;
    assert.deepEqual(ok.map((r) => r.n), [2, 4]);
  });

  it("zero data rows → an error naming the tab", () => {
    assert.throws(() => readCarsTab(workbook([])), /sheet "רכבים": no data rows/);
  });

  it("parseCarsRow alone takes the row number it is given", () => {
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(good({ "תאריך צפייה": "2026-10-02", "שנתון לפי המודעה": "" }))) values[k] = String(v ?? "");
    const r = parseCarsRow(values, 17);
    assert.equal(r.n, 17);
    assert.equal(r.ad_year, null);
  });
});
