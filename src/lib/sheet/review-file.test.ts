// Opening screen, F3c §2 — the review file's reader, on small workbooks written with exceljs to a temp directory.

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ExcelJS from "exceljs";
import { MAKES_HEADERS, MAKES_TAB, MODELS_HEADERS, MODELS_TAB } from "@/lib/families/words";
import { readReviewRows } from "./review-file";

const dir = mkdtempSync(join(tmpdir(), "findcar-review-"));
after(() => rmSync(dir, { recursive: true, force: true }));

async function workbook(
  name: string,
  tabs: { name: string; rows: (string | number | null)[][] }[],
): Promise<string> {
  const path = join(dir, name);
  const wb = new ExcelJS.Workbook();
  for (const t of tabs) {
    const ws = wb.addWorksheet(t.name);
    for (const r of t.rows) ws.addRow(r);
  }
  await wb.xlsx.writeFile(path);
  return path;
}

const MODELS = {
  name: MODELS_TAB,
  rows: [
    [...MODELS_HEADERS],
    ["MAKE", "G", "NAME", 1234, "2015-2020", null, "MAKE EN", "MODEL", "he:model"],
    [null, null, null, null, null, null, null, null, null],
    [" MAKE2 ", "G2", "NAME2", 5, "2019-2019", null, null, null, null],
  ],
};
const MAKES = { name: MAKES_TAB, rows: [[...MAKES_HEADERS], ["MAKE", 1239, "MAKE EN", "he:make", null]] };

describe("readReviewRows", () => {
  it("the rows come back as TextRows with their Excel row numbers; all-empty rows are skipped", async () => {
    const path = await workbook("good.xlsx", [MODELS, MAKES]);
    const { models, makes } = await readReviewRows(path);
    assert.deepEqual(models, [
      { row: 2, cells: ["MAKE", "G", "NAME", "1234", "2015-2020", "", "MAKE EN", "MODEL", "he:model"] },
      { row: 4, cells: [" MAKE2 ", "G2", "NAME2", "5", "2019-2019", "", "", "", ""] },
    ]);
    assert.deepEqual(makes, [{ row: 2, cells: ["MAKE", "1239", "MAKE EN", "he:make", ""] }]);
  });

  it("a missing file throws naming it", async () => {
    const path = join(dir, "missing.xlsx");
    await assert.rejects(readReviewRows(path), { message: `the review file ${path} does not exist` });
  });

  it("a missing tab throws naming it", async () => {
    const path = await workbook("no-makes.xlsx", [MODELS]);
    await assert.rejects(readReviewRows(path), new RegExp(`no sheet named "${MAKES_TAB}"`));
  });

  it("headers that are not exactly the constants throw", async () => {
    const extra = await workbook("extra.xlsx", [{ name: MODELS_TAB, rows: [[...MODELS_HEADERS, "x"]] }, MAKES]);
    await assert.rejects(readReviewRows(extra), new RegExp(`sheet "${MODELS_TAB}" row 1: the headers are not the expected ones`));
    const swapped = [...MAKES_HEADERS];
    [swapped[2], swapped[3]] = [swapped[3], swapped[2]];
    const path = await workbook("swapped.xlsx", [MODELS, { name: MAKES_TAB, rows: [swapped] }]);
    await assert.rejects(readReviewRows(path), new RegExp(`sheet "${MAKES_TAB}" row 1: the headers are not the expected ones`));
  });
});
