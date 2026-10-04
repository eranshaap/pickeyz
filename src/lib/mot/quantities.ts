// Opening screen, F3c §5 — active vehicles for a few model codes, from the ministry's quantities dataset
// (QUANTITIES_RESOURCE_ID). scripts/build-model-families.ts reads the whole dataset page by page; the sheet
// import asks only for the codes of its new names, one filtered request per code. The fields are the ones F1
// mapped (families-f1.txt): tozeret_cd, degem_cd, shnat_yitzur, mispar_rechavim_pailim, sug_degem.

import { quantityKey } from "@/lib/families/distribution";
import { motGet } from "./fetch";
import { MOT_API, QUANTITIES_RESOURCE_ID } from "./resources";

// The private class, as F1b keeps it (the live vehicle class).
const PRIVATE = "P";

// The codes and the year as F1 types them (build-model-families.ts codeOf / intOf): a code is the trimmed
// digits of a number or a string; a year and a count are non-negative integers. Anything else throws.
function codeOf(v: unknown, field: string, at: number): string {
  if (typeof v !== "number" && typeof v !== "string") {
    throw new Error(`quantities record ${at}: ${field} = ${JSON.stringify(v)} — not a code`);
  }
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) throw new Error(`quantities record ${at}: ${field} = ${JSON.stringify(v)} — not digits`);
  return s;
}

function intOf(v: unknown, field: string, at: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN;
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`quantities record ${at}: ${field} = ${JSON.stringify(v)} — not a non-negative integer`);
  }
  return n;
}

function classOf(v: unknown, at: number): string {
  if (typeof v !== "string" && typeof v !== "number") {
    throw new Error(`quantities record ${at}: sug_degem = ${JSON.stringify(v)} — not a class value`);
  }
  return String(v).trim().toUpperCase();
}

/** The private records' active vehicles by quantityKey; two records of one key are summed. */
export function activeCountsFromRecords(records: Record<string, unknown>[]): Map<string, number> {
  const counts = new Map<string, number>();
  records.forEach((r, i) => {
    if (classOf(r.sug_degem, i) !== PRIVATE) return;
    const k = quantityKey(
      codeOf(r.tozeret_cd, "tozeret_cd", i),
      codeOf(r.degem_cd, "degem_cd", i),
      intOf(r.shnat_yitzur, "shnat_yitzur", i),
    );
    counts.set(k, (counts.get(k) ?? 0) + intOf(r.mispar_rechavim_pailim, "mispar_rechavim_pailim", i));
  });
  return counts;
}

type QuantitiesPage = { result?: { records?: Record<string, unknown>[]; total?: number } };

/** One filtered request per distinct (tozeret_cd, degem_cd); one page is a code's years. Errors go to the caller. */
export async function fetchActiveCounts(codes: { tozeretCd: string; degemCd: string }[]): Promise<Map<string, number>> {
  const distinct = new Map(codes.map((c) => [`${c.tozeretCd}|${c.degemCd}`, c]));
  const records: Record<string, unknown>[] = [];
  for (const c of distinct.values()) {
    const filters = { tozeret_cd: String(c.tozeretCd), degem_cd: String(c.degemCd) };
    const url = `${MOT_API}?resource_id=${QUANTITIES_RESOURCE_ID}&filters=${encodeURIComponent(JSON.stringify(filters))}`;
    // motGet's body type declares records only; the total is read from the text, as F1 reads it.
    const { text } = await motGet<Record<string, unknown>>(url);
    const page = JSON.parse(text) as QuantitiesPage;
    const found = page.result?.records;
    const total = page.result?.total;
    if (!Array.isArray(found) || typeof total !== "number") {
      throw new Error(`quantities ${c.tozeretCd}-${c.degemCd}: the answer has no records array or numeric total`);
    }
    if (found.length !== total) {
      throw new Error(`quantities ${c.tozeretCd}-${c.degemCd}: ${found.length} records on one page, the answer's total is ${total}`);
    }
    records.push(...found);
  }
  return activeCountsFromRecords(records);
}
