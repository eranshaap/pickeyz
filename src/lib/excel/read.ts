// BRIEF Day 19b Run 21 §1 — reading an Excel workbook. A small layer over exceljs: open a file, find a
// sheet by name, read a cell as the text a CSV export would give, map a header row to column numbers, and
// walk the data rows.
//
// THE SITE NEVER IMPORTS THIS FILE. exceljs lives in devDependencies and appears in exactly four places:
// this file, its test, src/lib/location/localities.ts and its test. src/lib/location/place.ts — the pure
// rules the car page and the contact window read — imports nothing, so the browser bundle stays clean.
//
// FAIL LOUDLY (AGENTS.md). A cell this file cannot read as text is an error naming its address, never a
// silent "": a spreadsheet the import cannot read is a spreadsheet the import does not start on.

import * as ExcelJS from "exceljs";

/** Opens a workbook. A missing or unreadable file → an error naming the path, with the package's own message. */
export async function readWorkbook(path: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(path);
  } catch (e) {
    throw new Error(`cannot read the workbook ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return wb;
}

/** The sheet of that exact name. Missing → an error naming the wanted sheet and listing the workbook's sheets. */
export function worksheetByName(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const ws = wb.getWorksheet(name);
  if (ws === undefined) {
    const names = wb.worksheets.map((w) => w.name);
    throw new Error(`the workbook has no sheet named "${name}"; its sheets are: ${names.map((n) => `"${n}"`).join(", ")}`);
  }
  return ws;
}

/**
 * The cell as text, exactly as a CSV export would give it — NOT trimmed, because a stray space is the
 * caller's decision to make, not this layer's.
 */
export function cellText(cell: ExcelJS.Cell): string {
  return valueText(cell.value, cell.address);
}

function valueText(value: ExcelJS.CellValue, address: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  // exceljs reads a date cell as UTC midnight, so the date is read from the UTC parts: the local parts would
  // give the day before in any timezone west of Greenwich.
  if (value instanceof Date) {
    const y = String(value.getUTCFullYear()).padStart(4, "0");
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text: string }[]).map((part) => part.text).join("");
    }
    if ("error" in v) {
      throw new Error(`cell ${address} holds the error value ${String(v.error)}`);
    }
    if ("formula" in v || "sharedFormula" in v) {
      const result = v.result as ExcelJS.CellValue;
      if (result === null || result === undefined) {
        throw new Error(`cell ${address} holds a formula with no cached result`);
      }
      return valueText(result, address);
    }
    if ("hyperlink" in v) {
      return valueText(v.text as ExcelJS.CellValue, address);
    }
  }
  throw new Error(`cell ${address} holds a value this reader does not know: ${JSON.stringify(value)}`);
}

/**
 * The header row → header text to column number, each header read with cellText() and trimmed.
 *
 *   "subset" — every expected header present exactly once; other headers are allowed and ignored. This is
 *              how a ministry file is read: it has columns we do not want, and it may gain more.
 *   "exact"  — the non-empty header cells, from column 1, ARE `expected`, in that order. Trailing empty
 *              cells are ignored; anything else — an extra column, a missing one, a swapped pair — is an
 *              error. This is how OUR OWN sheet is read: a column that moved is a column that would be
 *              read into the wrong field.
 */
export function headerColumns(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  expected: readonly string[],
  mode: "subset" | "exact",
): Record<string, number> {
  const row = ws.getRow(headerRow);
  const width = Math.max(row.cellCount, ws.columnCount, expected.length);
  const texts: string[] = [];
  for (let c = 1; c <= width; c += 1) texts.push(cellText(row.getCell(c)).trim());

  if (mode === "exact") {
    let last = texts.length;
    while (last > 0 && texts[last - 1] === "") last -= 1;
    const found = texts.slice(0, last);
    const same = found.length === expected.length && found.every((t, i) => t === expected[i]);
    if (!same) {
      throw new Error(
        `sheet "${ws.name}" row ${headerRow}: the headers are not the expected ones.\n` +
          `  expected: ${expected.map((t) => `"${t}"`).join(", ")}\n` +
          `  found:    ${found.map((t) => `"${t}"`).join(", ")}`,
      );
    }
    const columns: Record<string, number> = {};
    expected.forEach((t, i) => {
      columns[t] = i + 1;
    });
    return columns;
  }

  const columns: Record<string, number> = {};
  const missing: string[] = [];
  for (const want of expected) {
    const at: number[] = [];
    texts.forEach((t, i) => {
      if (t === want) at.push(i + 1);
    });
    if (at.length === 0) missing.push(want);
    else if (at.length > 1) {
      throw new Error(`sheet "${ws.name}" row ${headerRow}: the header "${want}" appears in ${at.length} columns (${at.join(", ")})`);
    } else columns[want] = at[0];
  }
  // ONE error for every missing header, not the first one: a file read with the wrong header row would
  // otherwise be found out one run at a time.
  if (missing.length > 0) {
    throw new Error(`sheet "${ws.name}" row ${headerRow}: missing header${missing.length > 1 ? "s" : ""}: ${missing.map((t) => `"${t}"`).join(", ")}`);
  }
  return columns;
}

/**
 * Every row from `firstRow` to the sheet's last, with the named columns read as text. The row NUMBER comes
 * back with the values: every error of a later layer names the row of the file, not an index into an array.
 *
 * A row whose named values are all empty after trimming is skipped — a spreadsheet's last rows are often
 * styled and empty. The values themselves are NOT trimmed; the caller decides that.
 */
export function dataRows(
  ws: ExcelJS.Worksheet,
  firstRow: number,
  columns: Record<string, number>,
): { row: number; values: Record<string, string> }[] {
  const names = Object.keys(columns);
  const out: { row: number; values: Record<string, string> }[] = [];
  for (let r = firstRow; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const values: Record<string, string> = {};
    let any = false;
    for (const name of names) {
      const text = cellText(row.getCell(columns[name]));
      values[name] = text;
      if (text.trim() !== "") any = true;
    }
    if (any) out.push({ row: r, values });
  }
  return out;
}
