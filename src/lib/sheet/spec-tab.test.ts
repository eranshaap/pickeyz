// BRIEF Day 19b Run 22 §2 — the "מפרט ידני" tab. Workbooks built IN MEMORY with the 16 headers in row 1.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as ExcelJS from "exceljs";
import { readSpecTab, SPEC_HEADERS, SPEC_TAB, specKey, type ManualSpec } from "./spec-tab";

const [MAKE, MODEL, BODY, ENGINE, DRIVE, TRIM, YEAR, CC, LENGTH, WIDTH, HEIGHT, TRUNK, TANK, CONSUMPTION, CARZONE, DATE] = SPEC_HEADERS;

/** A full petrol row, by header. */
function good(over: Record<string, ExcelJS.CellValue> = {}): Record<string, ExcelJS.CellValue> {
  return {
    [MAKE]: "מאזדה", [MODEL]: "MAZDA 3", [BODY]: "האצ'בק", [ENGINE]: "בנזין", [DRIVE]: 2,
    [TRIM]: " SPORT , PREMIUM ", [YEAR]: 2021, [CC]: "1,998", [LENGTH]: 4460, [WIDTH]: 1795, [HEIGHT]: 1435,
    [TRUNK]: 358, [TANK]: 51, [CONSUMPTION]: "15,6", [CARZONE]: "https://www.carzone.co.il/x",
    [DATE]: new Date(Date.UTC(2026, 9, 1)),
    ...over,
  };
}

function workbook(rows: Record<string, ExcelJS.CellValue>[], headers: readonly string[] = SPEC_HEADERS): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SPEC_TAB);
  headers.forEach((h, i) => (ws.getRow(1).getCell(i + 1).value = h));
  rows.forEach((r, j) => {
    headers.forEach((h, i) => {
      if (h in r) ws.getRow(j + 2).getCell(i + 1).value = r[h];
    });
  });
  return wb;
}

function one(over: Record<string, ExcelJS.CellValue> = {}): ManualSpec {
  return readSpecTab(workbook([good(over)]))[0];
}

describe("SPEC_HEADERS (§2.1)", () => {
  it("16 headers; the mark in סמ\"ק, מ\"מ and ק\"מ is U+0022", () => {
    assert.equal(SPEC_HEADERS.length, 16);
    assert.equal(CC, "נפח מנוע (סמ\u0022ק)");
    assert.equal(LENGTH, "אורך (מ\u0022מ)");
    assert.equal(CONSUMPTION, "צריכת דלק (ק\u0022מ לליטר)");
  });
});

describe("readSpecTab / parseSpecRow (§2.3, §2.4)", () => {
  it("a full row → every field", () => {
    assert.deepEqual(one(), {
      n: 2, make: "מאזדה", model: "MAZDA 3", body_type: "האצ'בק", year: 2021, engine_size: 1998,
      engine_type: "petrol", drive_type: "4X2", sub_models: ["SPORT", "PREMIUM"],
      length_mm: 4460, width_mm: 1795, height_mm: 1435, trunk_liters: 358, tank_liters: 51,
      km_per_liter: 15.6, carzone_url: "https://www.carzone.co.il/x", source_date: "2026-10-01",
    });
  });

  it("4 → 4X4; a consumption with a dot; a text date in the right form", () => {
    const r = one({ [DRIVE]: "4", [CONSUMPTION]: 14.2, [DATE]: "2026-09-30" });
    assert.equal(r.drive_type, "4X4");
    assert.equal(r.km_per_liter, 14.2);
    assert.equal(r.source_date, "2026-09-30");
  });

  it("each required column empty → its error", () => {
    for (const column of SPEC_HEADERS) {
      assert.throws(() => one({ [column]: null }), (e: Error) => e.message.startsWith(`row 2: ${column}: empty`), column);
    }
  });

  it("an unknown engine word", () => {
    assert.throws(() => one({ [ENGINE]: "גז" }), /^Error: row 2: סוג מנוע: unknown engine type "גז"$/);
  });

  it("הנעה = 3", () => {
    assert.throws(() => one({ [DRIVE]: 3 }), /^Error: row 2: הנעה: expected 2 or 4, got "3"$/);
  });

  it("a 0 and a negative in a number", () => {
    assert.throws(() => one({ [TRUNK]: 0 }), /^Error: row 2: תא מטען \(ליטר\): must be at least 1, got "0"$/);
    assert.throws(() => one({ [TANK]: -5 }), /^Error: row 2: מיכל דלק \(ליטר\): not a whole number: "-5"$/);
    assert.throws(() => one({ [CONSUMPTION]: 0 }), /must be above 0/);
    assert.throws(() => one({ [CONSUMPTION]: "-4" }), /not a decimal number/);
  });

  it("the year: exactly four digits", () => {
    assert.throws(() => one({ [YEAR]: 21 }), /^Error: row 2: שנה: expected four digits, got "21"$/);
  });

  it("a consumption on an electric row → error; empty there → null; the same for a plug-in", () => {
    assert.throws(() => one({ [ENGINE]: "חשמלי" }), /^Error: row 2: צריכת דלק \(ק"מ לליטר\): must be empty for "חשמלי"/);
    assert.equal(one({ [ENGINE]: "חשמלי", [CONSUMPTION]: null }).km_per_liter, null);
    assert.equal(one({ [ENGINE]: "היברידי נטען", [CONSUMPTION]: null }).engine_type, "plug_in");
  });

  it("an empty consumption on a petrol row → error", () => {
    assert.throws(() => one({ [CONSUMPTION]: null }), /^Error: row 2: צריכת דלק \(ק"מ לליטר\): empty \(required for "בנזין"\)$/);
  });

  it("the trims: a duplicate within a list, an empty part → error; another separator is one trim", () => {
    assert.throws(() => one({ [TRIM]: "SPORT, SPORT" }), /^Error: row 2: גימור: "SPORT" appears twice$/);
    assert.throws(() => one({ [TRIM]: "SPORT,,PREMIUM" }), /an empty part/);
    assert.deepEqual(one({ [TRIM]: "SPORT · PREMIUM" }).sub_models, ["SPORT · PREMIUM"]);
  });

  it("a bad date", () => {
    assert.throws(() => one({ [DATE]: "01/10/2026" }), /^Error: row 2: תאריך: expected YYYY-MM-DD/);
  });

  it("the exact headers: a swapped pair, a missing one, an extra one → the error", () => {
    const swapped = [...SPEC_HEADERS];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    assert.throws(() => readSpecTab(workbook([good()], swapped)), /the headers are not the expected ones/);
    assert.throws(() => readSpecTab(workbook([good()], SPEC_HEADERS.slice(0, 15))), /the headers are not the expected ones/);
    assert.throws(() => readSpecTab(workbook([good()], [...SPEC_HEADERS, "עוד"])), /the headers are not the expected ones/);
  });

  it("zero data rows → []", () => {
    assert.deepEqual(readSpecTab(workbook([])), []);
  });

  it("two rows with the same scalars and a trim in common → an error naming both rows and the trim", () => {
    const wb = workbook([good({ [TRIM]: "SPORT, PREMIUM" }), good({ [TRIM]: "LUXURY, PREMIUM" })]);
    assert.throws(() => readSpecTab(wb), /rows 2 and 3 share the trim "PREMIUM"/);
  });

  it("two rows that share the scalars but no trim → fine", () => {
    const wb = workbook([good({ [TRIM]: "SPORT" }), good({ [TRIM]: "PREMIUM" })]);
    assert.equal(readSpecTab(wb).length, 2);
  });
});

describe("specKey (§2.5)", () => {
  it("equal for the same trims in another order, different for another trim set", () => {
    assert.equal(specKey(one({ [TRIM]: "A, B" })), specKey(one({ [TRIM]: "B, A" })));
    assert.notEqual(specKey(one({ [TRIM]: "A, B" })), specKey(one({ [TRIM]: "A" })));
    assert.notEqual(specKey(one()), specKey(one({ [YEAR]: 2022 })));
  });
});
