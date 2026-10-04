// Opening screen, F3c §3 — appending rows to OUR OWN workbook without harming it. The sheet import adds a
// row per new name to the review file (REVIEW_FILE); before that it checks that Excel does not hold the file
// open and keeps one backup copy beside it. Over exceljs and src/lib/excel/read.ts; the site never imports it.
//
// FAIL LOUDLY (AGENTS.md): a missing tab, headers that are not exactly the expected ones, or a row of the
// wrong width throw before anything is written.

import { copyFileSync, existsSync } from "node:fs";
import { basename, dirname, join, parse } from "node:path";
import { headerColumns, readWorkbook, worksheetByName } from "./read";

/** The lock file Excel keeps beside an open workbook: same directory, "~$" + the file name. */
export function excelLockPath(path: string): string {
  return join(dirname(path), `~$${basename(path)}`);
}

/** True exactly when Excel's lock file sits next to the workbook. */
export function isOpenInExcel(path: string): boolean {
  return existsSync(excelLockPath(path));
}

/** "model-families-review.xlsx" -> "model-families-review.before-import.xlsx", in the same directory. */
export function backupPath(path: string): string {
  const p = parse(path);
  return join(p.dir, `${p.name}.before-import${p.ext}`);
}

/** Copies the workbook to backupPath, replacing the previous copy. */
export function copyToBackup(path: string): void {
  copyFileSync(path, backupPath(path));
}

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === "";

/**
 * Writes `rows` after the last row that holds any value, in header order (the headers checked "exact"), and
 * gives the cells under `fill.columns` a solid fill. Numbers stay numbers; an empty string stays an empty
 * cell. The workbook is saved to the same path; nothing else in it is changed.
 */
export async function appendRows(
  path: string,
  sheetName: string,
  headers: readonly string[],
  rows: (string | number)[][],
  fill: { columns: readonly string[]; argb: string },
): Promise<void> {
  const wb = await readWorkbook(path);
  const ws = worksheetByName(wb, sheetName);
  const columns = headerColumns(ws, 1, headers, "exact");
  for (const c of fill.columns) {
    if (!headers.includes(c)) throw new Error(`appendRows: the fill column "${c}" is not a header of "${sheetName}"`);
  }
  rows.forEach((r, i) => {
    if (r.length !== headers.length) {
      throw new Error(`appendRows: row ${i + 1} of ${rows.length} has ${r.length} cells, "${sheetName}" has ${headers.length} headers`);
    }
  });

  let last = ws.rowCount;
  while (last > 1) {
    let any = false;
    ws.getRow(last).eachCell((cell) => {
      if (!isEmpty(cell.value)) any = true;
    });
    if (any) break;
    last -= 1;
  }

  rows.forEach((r, i) => {
    const row = ws.getRow(last + 1 + i);
    headers.forEach((h, j) => {
      if (r[j] !== "") row.getCell(columns[h]).value = r[j];
    });
    for (const c of fill.columns) {
      row.getCell(columns[c]).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill.argb } };
    }
  });

  await wb.xlsx.writeFile(path);
}
