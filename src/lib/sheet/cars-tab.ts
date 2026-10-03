// BRIEF Day 19b Run 22 §1 — THE "רכבים" TAB: the sheet's contract and the row parsing, moved out of
// scripts/import-sheet.ts so the rules get tests. The rules are the script's own, moved as they are; the
// Day 19b changes are the seller name (a private seller may have none), the place cell (read as written,
// resolved only at the entry check) and the ad's year.
//
// THE SITE NEVER IMPORTS src/lib/sheet/. exceljs reaches this file only through src/lib/excel/read.ts.
//
// FAIL LOUDLY (AGENTS.md). The five read-time stops — plate, seller type, business name, date, link — and a
// bad number or year are thrown Errors with the row's Excel number: a broken row is fixed in the sheet.

import type * as ExcelJS from "exceljs";
import { cellText, dataRows, headerColumns, worksheetByName } from "@/lib/excel/read";
import { DELISTED_HEADER } from "@/lib/observe";

export const CARS_TAB = "רכבים";

// The 14 headers the import reads, found by text (extra headers allowed). All required, always: `ירד` is no
// longer special to --seen, and `הערות שלי` is required but never read. The apostrophe in קילומטראז' is
// U+0027, the ASCII one, as the sheet writes it.
export const CARS_HEADERS = [
  "מספר רישוי", "מחיר", "קילומטראז\u0027", "יד לפי המודעה", "צבע", "אזור",
  "שם המוכר", "סוג המוכר", "טלפון", "קישור למודעה", "תאריך צפייה", "הערות שלי",
  DELISTED_HEADER, "שנתון לפי המודעה",
] as const;

const SELLER_TYPE: Record<string, string> = {
  "מגרש": "lot", "פרטי": "private", "ליסינג": "leasing", "השכרה": "rental", "יבואן": "importer",
};

export type CarsRow = {
  n: number; plate: string; price: number | null; km: number | null; hand: number | null;
  color: string | null; place_cell: string; seller_name: string; seller_type: string;
  phone: string | null; source: string; external_id: string; first_seen: string;
  link: string; delisted_cell: string; ad_year: number | null;
};

function fail(n: number, msg: string): never {
  throw new Error(`row ${n}: ${msg}`);
}

function text(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

// Excel shows "103,000" with the comma; a number cell reads as "103000".
function intOrNull(s: string | undefined, field: string, n: number): number | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const digits = t.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(digits)) fail(n, `${field}: not a whole number: ${JSON.stringify(s)}`);
  return Number(digits);
}

function phoneOrNull(s: string | undefined): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.startsWith("972") ? "0" + d.slice(3) : d;
}

function parseLink(s: string | undefined, n: number): { source: string; external_id: string } {
  const m = /^https:\/\/www\.yad2\.co\.il\/vehicles\/item\/([A-Za-z0-9]+)/.exec((s ?? "").trim());
  if (!m) fail(n, `link: not a yad2 item url: ${JSON.stringify(s)}`);
  return { source: "yad2", external_id: m[1] };
}

/** §1.3 — one row of the tab, `n` its Excel row number (1 = the header). */
export function parseCarsRow(values: Record<string, string>, n: number): CarsRow {
  const plate = (values["מספר רישוי"] ?? "").replace(/\D/g, "");
  if (!/^\d{7,8}$/.test(plate)) fail(n, `plate: expected 7-8 digits, got ${JSON.stringify(values["מספר רישוי"])}`);
  const sellerHe = (values["סוג המוכר"] ?? "").trim();
  const seller_type = SELLER_TYPE[sellerHe];
  if (!seller_type) fail(n, `seller type: unknown value ${JSON.stringify(sellerHe)}`);
  // A private seller may have no name: "" is accepted and nothing is written in its place. A business must have one.
  const seller_name = (values["שם המוכר"] ?? "").trim();
  if (!seller_name && seller_type !== "private") fail(n, `seller name: empty`);
  const first_seen = (values["תאריך צפייה"] ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first_seen) || Number.isNaN(Date.parse(first_seen))) fail(n, `date: expected YYYY-MM-DD, got ${JSON.stringify(first_seen)}`);
  const { source, external_id } = parseLink(values["קישור למודעה"], n);
  const yearCell = (values["שנתון לפי המודעה"] ?? "").trim();
  if (yearCell && !/^\d{4}$/.test(yearCell)) fail(n, `ad year (שנתון לפי המודעה): expected four digits, got ${JSON.stringify(values["שנתון לפי המודעה"])}`);
  return {
    n, plate,
    price: intOrNull(values["מחיר"], "price", n),
    km: intOrNull(values["קילומטראז\u0027"], "km", n),
    hand: intOrNull(values["יד לפי המודעה"], "hand", n),
    color: text(values["צבע"]),
    place_cell: (values["אזור"] ?? "").trim(),
    seller_name, seller_type,
    phone: phoneOrNull(values["טלפון"]),
    source, external_id, first_seen,
    link: (values["קישור למודעה"] ?? "").trim(),
    delisted_cell: values[DELISTED_HEADER] ?? "",
    ad_year: yearCell ? Number(yearCell) : null,
  };
}

/** §1.4 — the whole tab. `headers` = the non-empty header texts of row 1, as found (for checkDelistedColumn). */
export function readCarsTab(wb: ExcelJS.Workbook): { rows: CarsRow[]; headers: string[] } {
  const ws = worksheetByName(wb, CARS_TAB);
  const columns = headerColumns(ws, 1, CARS_HEADERS, "subset");
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  for (let c = 1; c <= Math.max(headerRow.cellCount, ws.columnCount); c += 1) {
    const t = cellText(headerRow.getCell(c)).trim();
    if (t) headers.push(t);
  }
  const rows = dataRows(ws, 2, columns).map(({ row, values }) => parseCarsRow(values, row));
  if (rows.length === 0) throw new Error(`sheet "${CARS_TAB}": no data rows`);
  return { rows, headers };
}
