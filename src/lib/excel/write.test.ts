// Opening screen, F3c §3 — appending to a workbook without harming it. Every workbook is written to a temp
// directory; the real review file, when it exists, is only copied and read, never opened for writing.

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ExcelJS from "exceljs";
import { MAKES_HEADERS, MAKES_TAB, MODELS_HEADERS, MODELS_TAB, REVIEW_FILE } from "@/lib/families/words";
import { dataRows, headerColumns, readWorkbook, worksheetByName } from "./read";
import { appendRows, backupPath, copyToBackup, excelLockPath, isOpenInExcel } from "./write";

const YELLOW = "FFFFF2B3";
const DECISION = MODELS_HEADERS.slice(6);
const FILL = { columns: DECISION, argb: YELLOW };

const dir = mkdtempSync(join(tmpdir(), "findcar-write-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const argbOf = (cell: ExcelJS.Cell): string | undefined =>
  cell.fill?.type === "pattern" && cell.fill.pattern === "solid" ? cell.fill.fgColor?.argb : undefined;

async function smallWorkbook(name: string): Promise<string> {
  const path = join(dir, name);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(MODELS_TAB);
  ws.addRow([...MODELS_HEADERS]);
  ws.addRow(["A", "G1", "N1", 1000, "2015-2020", "", "MAKE1", "M1", "he:1"]);
  ws.addRow(["B", "G2", "N2", 2000, "2016-2021", "", "", "", ""]);
  for (let c = 7; c <= 9; c += 1) ws.getRow(3).getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
  wb.addWorksheet(MAKES_TAB).addRow([...MAKES_HEADERS]);
  await wb.xlsx.writeFile(path);
  return path;
}

describe("appendRows", () => {
  it("appends after the last row: old rows keep values and fills, the new row is row 4, filled on the decision cells only", async () => {
    const path = await smallWorkbook("append.xlsx");
    await appendRows(path, MODELS_TAB, MODELS_HEADERS, [["C", "G3", "N3", 345, "", "", "MAKE3", "M3", "he:3"]], FILL);

    const ws = worksheetByName(await readWorkbook(path), MODELS_TAB);
    const values = (r: number) => Array.from({ length: 9 }, (_, i) => ws.getRow(r).getCell(i + 1).value);
    assert.deepEqual(values(2), ["A", "G1", "N1", 1000, "2015-2020", "", "MAKE1", "M1", "he:1"]);
    assert.deepEqual(values(3), ["B", "G2", "N2", 2000, "2016-2021", "", "", "", ""]);
    for (let c = 1; c <= 9; c += 1) {
      assert.equal(argbOf(ws.getRow(2).getCell(c)), undefined, `row 2 col ${c}`);
      assert.equal(argbOf(ws.getRow(3).getCell(c)), c >= 7 ? YELLOW : undefined, `row 3 col ${c}`);
    }

    const row4 = ws.getRow(4);
    assert.deepEqual(values(4), ["C", "G3", "N3", 345, null, null, "MAKE3", "M3", "he:3"]);
    assert.equal(typeof row4.getCell(4).value, "number");
    for (let c = 1; c <= 9; c += 1) assert.equal(argbOf(row4.getCell(c)), c >= 7 ? YELLOW : undefined, `row 4 col ${c}`);
    assert.equal(ws.getRow(5).cellCount, 0);
  });

  it("headers that are not exactly the given ones, and a row of the wrong width, throw and write nothing", async () => {
    const path = await smallWorkbook("refuse.xlsx");
    const before = readFileSync(path);
    await assert.rejects(appendRows(path, MODELS_TAB, [...MODELS_HEADERS].reverse(), [], FILL), /the headers are not the expected ones/);
    await assert.rejects(appendRows(path, MODELS_TAB, MODELS_HEADERS, [["C"]], FILL), /has 1 cells/);
    await assert.rejects(appendRows(path, "nope", MODELS_HEADERS, [], FILL), /no sheet named "nope"/);
    assert.deepEqual(readFileSync(path), before);
  });
});

describe("isOpenInExcel / copyToBackup", () => {
  it("isOpenInExcel is true exactly when a ~$ file sits next to the workbook", async () => {
    const path = await smallWorkbook("locked.xlsx");
    assert.equal(excelLockPath(path), join(dir, "~$locked.xlsx"));
    assert.equal(isOpenInExcel(path), false);
    writeFileSync(excelLockPath(path), "lock");
    assert.equal(isOpenInExcel(path), true);
    rmSync(excelLockPath(path));
    assert.equal(isOpenInExcel(path), false);
  });

  it("backupPath is .before-import beside the file; copyToBackup replaces an earlier backup", () => {
    const path = join(dir, "model-families-review.xlsx");
    assert.equal(backupPath(path), join(dir, "model-families-review.before-import.xlsx"));
    writeFileSync(path, "first");
    copyToBackup(path);
    writeFileSync(path, "second");
    copyToBackup(path);
    assert.equal(readFileSync(backupPath(path), "utf8"), "second");
  });
});

const REAL = fileURLToPath(new URL(`../../../${REVIEW_FILE}`, import.meta.url));

describe("the real review file", () => {
  it("one row appended to a copy changes nothing else", { skip: !existsSync(REAL) && `${REAL} does not exist` }, async () => {
    const mtime = statSync(REAL).mtimeMs;
    const copy = join(dir, "real-copy.xlsx");
    copyFileSync(REAL, copy);
    try {
      await appendRows(copy, MODELS_TAB, MODELS_HEADERS, [["F3C TEST", "F3C", "F3C TEST", 1, "2020-2020", "", "", "", ""]], FILL);

      const original = await readWorkbook(REAL);
      const changed = await readWorkbook(copy);
      for (const [tab, headers] of [[MODELS_TAB, MODELS_HEADERS], [MAKES_TAB, MAKES_HEADERS]] as const) {
        const a = worksheetByName(original, tab);
        const b = worksheetByName(changed, tab);
        const width = Math.max(a.columnCount, b.columnCount);
        for (let r = 1; r <= a.rowCount; r += 1) {
          for (let c = 1; c <= width; c += 1) {
            assert.deepEqual(b.getRow(r).getCell(c).value, a.getRow(r).getCell(c).value, `${tab} row ${r} col ${c}`);
          }
        }
        const countA = dataRows(a, 2, headerColumns(a, 1, headers, "exact")).length;
        const countB = dataRows(b, 2, headerColumns(b, 1, headers, "exact")).length;
        assert.equal(countB, countA + (tab === MODELS_TAB ? 1 : 0), `${tab} data rows`);
      }

      const a = worksheetByName(original, MODELS_TAB);
      const b = worksheetByName(changed, MODELS_TAB);
      const columns = headerColumns(a, 1, MODELS_HEADERS, "exact");
      for (let r = 1; r <= a.rowCount; r += 1) {
        for (const h of DECISION) {
          assert.deepEqual(b.getRow(r).getCell(columns[h]).fill, a.getRow(r).getCell(columns[h]).fill, `fill row ${r} ${h}`);
        }
      }
    } finally {
      rmSync(copy, { force: true });
    }
    assert.equal(existsSync(copy), false);
    assert.equal(statSync(REAL).mtimeMs, mtime);
  });
});
