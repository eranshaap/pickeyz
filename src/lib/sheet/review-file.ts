// Opening screen, F3c §2 — the one reader of the model-families review file (REVIEW_FILE): its two tabs as
// text rows, for parseReview (src/lib/families/review.ts). The families import and the sheet import both read
// the file through here. Over src/lib/excel/read.ts; the site never imports this file.

import { existsSync } from "node:fs";
import { dataRows, headerColumns, readWorkbook, worksheetByName } from "@/lib/excel/read";
import type { TextRow } from "@/lib/families/review";
import { MAKES_HEADERS, MAKES_TAB, MODELS_HEADERS, MODELS_TAB } from "@/lib/families/words";

function readTab(wb: Awaited<ReturnType<typeof readWorkbook>>, tab: string, headers: readonly string[]): TextRow[] {
  const ws = worksheetByName(wb, tab);
  const columns = headerColumns(ws, 1, headers, "exact");
  // dataRows skips the rows whose cells are all empty; the cells go in header order, untrimmed.
  return dataRows(ws, 2, columns).map((r) => ({ row: r.row, cells: headers.map((h) => r.values[h]) }));
}

/** The models tab and the makes tab. A missing file, a missing tab or headers not exactly the constants throw. */
export async function readReviewRows(path: string): Promise<{ models: TextRow[]; makes: TextRow[] }> {
  if (!existsSync(path)) throw new Error(`the review file ${path} does not exist`);
  const wb = await readWorkbook(path);
  const models = readTab(wb, MODELS_TAB, MODELS_HEADERS);
  const makes = readTab(wb, MAKES_TAB, MAKES_HEADERS);
  return { models, makes };
}
