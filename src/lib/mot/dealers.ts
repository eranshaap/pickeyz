import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePipeCsv } from "./pipe-csv";
import { RAW_DIR } from "./resources";

// One row of data/raw/dealers.csv, with the ministry's own field names.
type DealerRow = {
  shem: string;
  yishuv: string;
  mikud: string;
  ktovet: string;
  het_pei: string;
};

// What the rest of the code receives. The ministry's names stop here.
export type DealerRecord = {
  registry_name: string;
  yishuv: string;
  corp_id: string | null;
};

let rows: DealerRow[] | null = null;

function loadRows(): DealerRow[] {
  if (rows) return rows;
  const file = path.join(process.cwd(), RAW_DIR, "dealers.csv");
  rows = parsePipeCsv<DealerRow>(readFileSync(file, "utf8"));
  return rows;
}

// Punctuation and spacing differ between yad2 and the registry; compare without them.
export function normalizeName(s: string): string {
  return s.replace(/["'.\-–״׳]/g, " ").replace(/\s+/g, " ").trim();
}

export function getDealerData(name: string): DealerRecord | null {
  const wanted = normalizeName(name);
  const row = loadRows().find((r) => normalizeName(r.shem) === wanted);
  if (!row) return null;
  return {
    registry_name: row.shem,
    yishuv: row.yishuv,
    corp_id: row.het_pei ? row.het_pei : null,
  };
}

export function dealerStats() {
  const all = loadRows();
  return { total: all.length, with_corp_id: all.filter((r) => r.het_pei).length };
}