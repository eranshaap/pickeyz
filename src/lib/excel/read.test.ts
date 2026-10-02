// BRIEF Day 19b Run 21 §1 — the Excel reader. Every workbook here is built IN MEMORY with exceljs: no file
// on disk, no fixture to keep in step with the code. Non-ASCII marks are \uXXXX escapes, as in §2.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as ExcelJS from "exceljs";
import { cellText, dataRows, headerColumns, worksheetByName } from "./read";

const NETANYA = "\u05E0\u05EA\u05E0\u05D9\u05D4"; // נתניה
const HAIFA = "\u05D7\u05D9\u05E4\u05D4"; // חיפה
const TEL = "\u05EA\u05DC "; // "תל ", the first run of a rich-text cell
const AVIV = "\u05D0\u05D1\u05D9\u05D1"; // אביב, the second
const SHEET1_HE = "\u05D2\u05D9\u05DC\u05D9\u05D5\u05DF1"; // גיליון1 — the localities file's sheet
const CODE = "\u05E1\u05DE\u05DC \u05D4\u05D9\u05D9\u05E9\u05D5\u05D1"; // סמל היישוב
const NAME = "\u05E9\u05DD \u05D9\u05D9\u05E9\u05D5\u05D1"; // שם יישוב
const DISTRICT = "\u05DE\u05D7\u05D5\u05D6"; // מחוז

/** A one-sheet workbook; the callback fills the sheet. */
function sheet(fill: (ws: ExcelJS.Worksheet) => void, name = "Sheet1"): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name);
  fill(ws);
  return ws;
}

/** One cell holding `value`, read as text. */
function textOf(value: ExcelJS.CellValue): string {
  const ws = sheet((s) => {
    s.getCell("A1").value = value;
  });
  return cellText(ws.getCell("A1"));
}

describe("cellText (§1)", () => {
  it("an empty cell is the empty string", () => {
    const ws = sheet(() => {});
    assert.equal(cellText(ws.getCell("A1")), "");
    assert.equal(textOf(null), "");
  });

  it("a string is itself, untrimmed", () => {
    assert.equal(textOf(NETANYA), NETANYA);
    assert.equal(textOf("  spaced  "), "  spaced  ");
  });

  it("a number is its String()", () => {
    assert.equal(textOf(7200), "7200");
    assert.equal(textOf(0), "0");
    assert.equal(textOf(12.5), "12.5");
  });

  it("a boolean is TRUE / FALSE", () => {
    assert.equal(textOf(true), "TRUE");
    assert.equal(textOf(false), "FALSE");
  });

  it("a date is YYYY-MM-DD from its UTC parts", () => {
    assert.equal(textOf(new Date(Date.UTC(2026, 9, 2))), "2026-10-02");
    assert.equal(textOf(new Date(Date.UTC(2026, 0, 1))), "2026-01-01");
  });

  it("rich text is its parts joined", () => {
    assert.equal(textOf({ richText: [{ text: TEL }, { text: AVIV }] }), TEL + AVIV);
  });

  it("a hyperlink is its text", () => {
    assert.equal(textOf({ text: "yad2", hyperlink: "https://www.yad2.co.il/" }), "yad2");
  });

  it("a formula is its cached result, of any kind", () => {
    assert.equal(textOf({ formula: "A2&A3", result: HAIFA }), HAIFA);
    assert.equal(textOf({ formula: "1+1", result: 2 }), "2");
    assert.equal(textOf({ sharedFormula: "B1", result: "x" }), "x");
  });

  it("a formula with no cached result is an error naming the cell", () => {
    assert.throws(
      () => textOf({ formula: "A2&A3", result: undefined }),
      (e: Error) => e.message.includes("A1") && e.message.includes("formula"),
    );
  });

  it("an error value is an error naming the cell and the error", () => {
    assert.throws(() => textOf({ error: "#N/A" }), (e: Error) => e.message.includes("A1") && e.message.includes("#N/A"));
  });

  it("anything else is an error naming the cell", () => {
    assert.throws(
      () => textOf({ somethingElse: true } as unknown as ExcelJS.CellValue),
      (e: Error) => e.message.includes("A1"),
    );
  });
});

describe("worksheetByName (§1)", () => {
  it("finds the sheet of that exact name", () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet(SHEET1_HE);
    assert.equal(worksheetByName(wb, SHEET1_HE).name, SHEET1_HE);
  });

  it("a missing sheet is an error naming the wanted sheet and listing the sheets there are", () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Sheet1");
    wb.addWorksheet("notes");
    assert.throws(
      () => worksheetByName(wb, SHEET1_HE),
      (e: Error) => e.message.includes(SHEET1_HE) && e.message.includes("Sheet1") && e.message.includes("notes"),
    );
  });
});

/** Puts `headers` in row `row`, column 1 onwards. */
function withHeaders(headers: (string | null)[], row = 1): ExcelJS.Worksheet {
  return sheet((ws) => {
    headers.forEach((h, i) => {
      ws.getRow(row).getCell(i + 1).value = h;
    });
  });
}

describe("headerColumns, subset (§1)", () => {
  it("every expected header found, extra headers allowed", () => {
    const ws = withHeaders(["x", CODE, "y", NAME, DISTRICT, "z"]);
    assert.deepEqual(headerColumns(ws, 1, [CODE, NAME, DISTRICT], "subset"), { [CODE]: 2, [NAME]: 4, [DISTRICT]: 5 });
  });

  it("headers are trimmed before the comparison", () => {
    const ws = withHeaders([`  ${CODE} `, NAME, DISTRICT]);
    assert.deepEqual(headerColumns(ws, 1, [CODE, NAME, DISTRICT], "subset"), { [CODE]: 1, [NAME]: 2, [DISTRICT]: 3 });
  });

  it("two missing headers are ONE error naming both, with the sheet name", () => {
    const ws = withHeaders([CODE, "y"]);
    let message = "";
    assert.throws(
      () => headerColumns(ws, 1, [CODE, NAME, DISTRICT], "subset"),
      (e: Error) => {
        message = e.message;
        return true;
      },
    );
    assert.ok(message.includes(NAME), message);
    assert.ok(message.includes(DISTRICT), message);
    assert.ok(message.includes("Sheet1"), message);
  });

  it("an expected header present twice is an error", () => {
    const ws = withHeaders([CODE, NAME, DISTRICT, NAME]);
    assert.throws(() => headerColumns(ws, 1, [CODE, NAME, DISTRICT], "subset"), (e: Error) => e.message.includes(NAME));
  });

  it("reads the header row it is given, not the first row", () => {
    const ws = withHeaders([CODE, NAME, DISTRICT], 11);
    assert.deepEqual(headerColumns(ws, 11, [CODE, NAME, DISTRICT], "subset"), { [CODE]: 1, [NAME]: 2, [DISTRICT]: 3 });
  });
});

describe("headerColumns, exact (§1)", () => {
  it("the expected headers in the expected order pass", () => {
    const ws = withHeaders([CODE, NAME, DISTRICT]);
    assert.deepEqual(headerColumns(ws, 1, [CODE, NAME, DISTRICT], "exact"), { [CODE]: 1, [NAME]: 2, [DISTRICT]: 3 });
  });

  it("empty cells after the last header are ignored", () => {
    const ws = withHeaders([CODE, NAME, DISTRICT, null, "  ", null]);
    assert.deepEqual(headerColumns(ws, 1, [CODE, NAME, DISTRICT], "exact"), { [CODE]: 1, [NAME]: 2, [DISTRICT]: 3 });
  });

  it("a swapped order is an error showing expected and found", () => {
    const ws = withHeaders([CODE, DISTRICT, NAME]);
    assert.throws(
      () => headerColumns(ws, 1, [CODE, NAME, DISTRICT], "exact"),
      (e: Error) => e.message.includes("expected") && e.message.includes("found"),
    );
  });

  it("an extra header is an error", () => {
    const ws = withHeaders([CODE, NAME, DISTRICT, "x"]);
    assert.throws(() => headerColumns(ws, 1, [CODE, NAME, DISTRICT], "exact"), /expected/);
  });

  it("a missing header is an error", () => {
    const ws = withHeaders([CODE, NAME]);
    assert.throws(() => headerColumns(ws, 1, [CODE, NAME, DISTRICT], "exact"), /expected/);
  });
});

describe("dataRows (§1)", () => {
  it("reads from firstRow, skips an all-empty row, and returns the row numbers", () => {
    const ws = sheet((s) => {
      s.getRow(1).getCell(1).value = CODE;
      s.getRow(1).getCell(2).value = NAME;
      s.getRow(2).getCell(1).value = "before firstRow, never read";
      s.getRow(3).getCell(1).value = 70;
      s.getRow(3).getCell(2).value = NETANYA;
      s.getRow(4).getCell(1).value = "   "; // styled and empty, skipped
      s.getRow(5).getCell(1).value = 2800;
      s.getRow(5).getCell(2).value = HAIFA;
    });
    const columns = { [CODE]: 1, [NAME]: 2 };
    assert.deepEqual(dataRows(ws, 3, columns), [
      { row: 3, values: { [CODE]: "70", [NAME]: NETANYA } },
      { row: 5, values: { [CODE]: "2800", [NAME]: HAIFA } },
    ]);
  });

  it("the values are NOT trimmed", () => {
    const ws = sheet((s) => {
      s.getRow(1).getCell(1).value = "  x  ";
    });
    assert.deepEqual(dataRows(ws, 1, { a: 1 }), [{ row: 1, values: { a: "  x  " } }]);
  });

  it("a sheet with no data rows gives []", () => {
    const ws = withHeaders([CODE]);
    assert.deepEqual(dataRows(ws, 2, { [CODE]: 1 }), []);
  });
});
