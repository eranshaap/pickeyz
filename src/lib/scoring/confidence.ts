// Confidence (BRIEF §8, amended §18.8 and §18.17): how much of the invoice rests on verified,
// complete inputs.
//
// items = one missing_row per distinct unavailable REASON across the rows (§18.17: a thin cell costs
//         one item, not two; ref = the reason). Day 14 §9.7 keeps that true with the anchor: when the
//         anchor cannot be built the price row's reason is 'thin_cell', the same reason the km row
//         carries, so the two dedupe into one item and a thin-cell listing stays 'medium'.
//       + one counted_mismatch per check with status mismatch and counts = true (ref = check:kind)
//       + one assumed_typical when the history row's source is 'typical' (Day 14, §3.5: the row came
//         from the cell's median, not from the car's own record) — OR one unverified_source when the
//         history row's source is 'ad'. One item either way, never both.
//       + one possibly_sold when the sold signal is medium (§18.8; a strong signal adds nothing — the
//         listing is out of the results and its confidence is irrelevant)
// Skipped checks are neither items nor mismatches.
// level: 0 items -> high; 1 -> medium; 2 or more -> low.

import type { Check, ConfidenceItem, ConfidenceLevel, Row, SoldSignal } from "./types";

export function confidenceItems(rows: Row[], checks: Check[], sold: SoldSignal): ConfidenceItem[] {
  const items: ConfidenceItem[] = [];
  const reasons = new Set<string>();
  for (const r of rows) {
    if (r.status !== "unavailable") continue;
    const reason = r.reason ?? "?";
    if (reasons.has(reason)) continue;
    reasons.add(reason);
    items.push({ kind: "missing_row", ref: reason });
  }
  for (const c of checks) {
    if (c.status === "mismatch" && c.counts === true) items.push({ kind: "counted_mismatch", ref: `${c.check}:${c.kind ?? "?"}` });
  }
  const history = rows.find((r) => r.row === "history");
  if (history && history.status === "scored") {
    if (history.source === "typical") items.push({ kind: "assumed_typical", ref: "history:typical" });
    else if (history.source === "ad") items.push({ kind: "unverified_source", ref: "history:ad" });
  }
  if (sold.strength === "medium") items.push({ kind: "possibly_sold", ref: "sold_signal:medium" });
  return items;
}

export function confidenceLevel(itemCount: number): ConfidenceLevel {
  if (itemCount === 0) return "high";
  if (itemCount === 1) return "medium";
  return "low";
}

export function confidence(rows: Row[], checks: Check[], sold: SoldSignal): { level: ConfidenceLevel; items: ConfidenceItem[] } {
  const items = confidenceItems(rows, checks, sold);
  return { level: confidenceLevel(items.length), items };
}
