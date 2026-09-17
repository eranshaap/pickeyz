// Day 14 run C — the raw layer of the refresh: what the ministry's answer looks like on disk, which
// of its fields this brief names, and how two answers are compared (BRIEF §0.9, §0.11, P4).
//
// src/lib/mot/ knows how to ASK and how to READ an answer into VehicleData. This file knows the rest
// of the record — every field, including the ones the product never stores — because §0.9 asks for a
// report line on any of them that moved. Nothing here does I/O and nothing here decides anything.

import { REGISTRY_FIELDS, type RawRows } from "@/lib/mot/vehicle";
import type { Change } from "./types";

export type ResourceKey = "registry" | "cancelled" | "inactive" | "history_km" | "history_hand";
export const RESOURCE_KEYS: ResourceKey[] = ["registry", "cancelled", "inactive", "history_km", "history_hand"];

export type RawRecord = Record<string, unknown>;
/** One plate's answers. `undefined` = the resource was not asked; `[]` = it answered nothing (§0.3). */
export type Snapshot = Partial<Record<ResourceKey, RawRecord[]>>;

/** §0.9: API artifacts, excluded from every comparison and from every report line. */
export const ARTIFACTS = ["_id", "rank"] as const;

// The fields the GATE reads. A rename at the ministry turns one of these into `undefined`, which
// would let a car through on a value that is not there — so a missing one stops the run (§0.3).
// `_id` is required on history 2 as well: it is the tie-break that orders two rows of the same month.
export const REQUIRED: Record<ResourceKey, readonly string[]> = {
  registry: ["mispar_rechev", "tozeret_cd", "degem_cd", "sug_degem", "shnat_yitzur", "moed_aliya_lakvish", "misgeret", "tokef_dt", "mivchan_acharon_dt", "baalut", "tzeva_rechev"],
  inactive: ["mispar_rechev", "tozeret_cd", "degem_cd", "sug_degem", "shnat_yitzur", "moed_aliya_lakvish", "misgeret", "tokef_dt", "mivchan_acharon_dt", "baalut", "tzeva_rechev"],
  cancelled: ["mispar_rechev", "tozeret_cd", "degem_cd", "shnat_yitzur", "misgeret", "bitul_dt"],
  history_km: ["mispar_rechev", "kilometer_test_aharon", "rishum_rishon_dt", "mkoriut_nm", "shnui_zeva_ind"],
  history_hand: ["_id", "mispar_rechev", "baalut_dt", "baalut"],
};

// Day 18 (§7): baalut (registry / inactive -> cars.current_owner_type) and shnui_zeva_ind (history 1 ->
// cars.color_changed) reach the database now, and tzeva_rechev reaches cars.registry_color as well as the colour
// fill. A change to any of them is a `cars` change line, so none of them is listed "outside the database" any more.
// The fields that reach the database, or that the identity check compares. Their movement is already
// a report line of its own — a changed `cars` field, or a reject — so they are NOT listed again under
// "fields outside the database" (§0.9). Everything else in the record is.
// On a cancellation record `tzeva_rechev` is not in this list: §0.4 writes cancelled_at and the
// timestamp and nothing else, so a cancellation record never fills cars.color.
const IN_DATABASE: Record<ResourceKey, readonly string[]> = {
  registry: ["tozeret_cd", "degem_cd", "sug_degem", "shnat_yitzur", "moed_aliya_lakvish", "misgeret", "tokef_dt", "mivchan_acharon_dt", "tzeva_rechev", "baalut"],
  inactive: ["tozeret_cd", "degem_cd", "sug_degem", "shnat_yitzur", "moed_aliya_lakvish", "misgeret", "tokef_dt", "mivchan_acharon_dt", "tzeva_rechev", "baalut"],
  cancelled: ["tozeret_cd", "degem_cd", "shnat_yitzur", "misgeret", "bitul_dt"],
  history_km: ["kilometer_test_aharon", "rishum_rishon_dt", "shnui_zeva_ind"],
  history_hand: ["baalut_dt", "baalut"],
};

// The plate itself: identity, checked structurally, never a report line.
const IDENTITY = ["mispar_rechev"] as const;

function ignored(key: ResourceKey, field: string): boolean {
  return (ARTIFACTS as readonly string[]).includes(field)
    || (IDENTITY as readonly string[]).includes(field)
    || IN_DATABASE[key].includes(field);
}

/** The record without the API artifacts — what P4 compares. */
export function dataFields(rec: RawRecord): RawRecord {
  const out: RawRecord = {};
  for (const k of Object.keys(rec).sort()) {
    if ((ARTIFACTS as readonly string[]).includes(k)) continue;
    out[k] = rec[k];
  }
  return out;
}

/**
 * §0.3, the structural gate. Throws — never skips. A record that does not parse, a plate that is not
 * the plate asked for, or a field the gate reads that is no longer there stops the whole run.
 * An UNEXPECTED field does not: §0.9 says a field this brief does not name is never a reason to
 * reject, and it is reported under "fields outside the database" instead.
 */
export function checkStructure(plate: string, snap: Snapshot): void {
  for (const key of RESOURCE_KEYS) {
    const records = snap[key];
    if (records === undefined) continue;
    if (!Array.isArray(records)) throw new Error(`MoT ${plate} ${key}: the answer is not a list of records`);
    for (const [i, rec] of records.entries()) {
      const where = `MoT ${plate} ${key}[${i}]`;
      if (rec === null || typeof rec !== "object") throw new Error(`${where}: the record does not parse`);
      const got = Object.keys(rec);
      const missing = REQUIRED[key].filter((f) => !got.includes(f));
      if (missing.length) {
        throw new Error(
          `${where}: field(s) the gate reads are not in the record — missing: [${missing.join(", ")}]. ` +
            `A renamed field at the ministry must not be skipped 250 times: re-check the mapping.`,
        );
      }
      if (String(rec.mispar_rechev) !== plate) {
        throw new Error(`${where}: the plate returned is ${JSON.stringify(rec.mispar_rechev)}, not the plate asked for (${plate})`);
      }
    }
  }
  // The inactive dataset is documented as carrying the active record's fields; we do not take that on
  // trust (src/lib/mot/vehicle.ts, Day 5). Here the same list is asserted on whichever of the two answered.
  for (const key of ["registry", "inactive"] as const) {
    const rec = snap[key]?.[0];
    if (!rec) continue;
    const missing = REGISTRY_FIELDS.filter((f) => !Object.keys(rec).includes(f));
    if (missing.length) throw new Error(`MoT ${plate} ${key}: the registry record lost field(s) [${missing.join(", ")}]`);
  }
}

/**
 * P4: are two answers to one resource the same? On the data fields, artifacts excluded,
 * order-insensitive for history 2 (its rows carry no order of their own beyond `_id`, and `_id` is
 * excluded). An answer that was not asked for on one side is not "the same" as one that was.
 */
export function sameResource(key: ResourceKey, prev: RawRecord[] | undefined, fresh: RawRecord[] | undefined): boolean {
  if (prev === undefined || fresh === undefined) return prev === fresh;
  if (prev.length !== fresh.length) return false;
  const shape = (recs: RawRecord[]) => {
    const lines = recs.map((r) => JSON.stringify(dataFields(r)));
    return key === "history_hand" ? lines.sort() : lines;
  };
  return JSON.stringify(shape(prev)) === JSON.stringify(shape(fresh));
}

/** True when the whole snapshot is identical to the previous one, resource by resource (§0.11). */
export function sameSnapshot(prev: Snapshot, fresh: Snapshot): boolean {
  return RESOURCE_KEYS.every((k) => fresh[k] === undefined || sameResource(k, prev[k], fresh[k]));
}

/**
 * §0.9: every field this brief does not name, or names as information only, that moved since the
 * previous snapshot. One line per (resource, field); history 2 is compared as a whole because its
 * rows have no stable identity of their own.
 */
export function outsideChanges(prev: Snapshot, fresh: Snapshot): Change[] {
  const out: Change[] = [];
  for (const key of RESOURCE_KEYS) {
    const f = fresh[key];
    if (f === undefined) continue;
    const p = prev[key];
    if (key === "history_hand") continue; // every field of it is in the database or an artifact
    const fRec = f[0], pRec = p?.[0];
    if (!fRec && !pRec) continue;
    if (!fRec || !pRec) {
      out.push({ field: `${key}: the record itself`, from: pRec ? "present" : "absent", to: fRec ? "present" : "absent" });
      continue;
    }
    for (const field of Object.keys(fRec).sort()) {
      if (ignored(key, field)) continue;
      const a = pRec[field], b = fRec[field];
      if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
      out.push({ field: `${key}.${field}`, from: show(a), to: show(b) });
    }
    for (const field of Object.keys(pRec).sort()) {
      if (ignored(key, field) || field in fRec) continue;
      out.push({ field: `${key}.${field}`, from: show(pRec[field]), to: "absent" });
    }
  }
  return out;
}

export function show(v: unknown): string {
  if (v === undefined) return "absent";
  if (v === null) return "null";
  if (v === "") return '""';
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** The snapshot as src/lib/mot/vehicle.ts's `interpret` wants it. Shape, not content. */
export function asRawRows(snap: Snapshot): RawRows {
  return snap as unknown as RawRows;
}

// ---- the ministry's value formats, parsed strictly: a value that does not parse is structural ----

/** "2026-04-27" -> "2026-04-27"; "" / absent -> null. Anything else throws (§0.3). */
export function isoDate(v: unknown, where: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (s === "") return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(s);
  if (!m) throw new Error(`${where}: not a date the ministry writes: ${JSON.stringify(v)}`);
  const d = new Date(`${m[1]}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`${where}: not a real date: ${JSON.stringify(v)}`);
  return m[1];
}

/** "2021-6" / "2021-06" / 202106 -> "2021-06"; "" / absent -> null. Anything else throws. */
export function monthKey(v: unknown, where: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (s === "") return null;
  const dash = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (dash) return `${dash[1]}-${dash[2].padStart(2, "0")}`;
  const flat = /^(\d{4})(\d{2})$/.exec(s);
  if (flat) return `${flat[1]}-${flat[2]}`;
  const full = /^(\d{4})-(\d{2})-\d{2}/.exec(s);
  if (full) return `${full[1]}-${full[2]}`;
  throw new Error(`${where}: not a ministry month: ${JSON.stringify(v)}`);
}

/** A whole number, or null for absent/empty. Anything else throws. */
export function intOrNull(v: unknown, where: string): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isInteger(n)) throw new Error(`${where}: not a whole number: ${JSON.stringify(v)}`);
  return n;
}

/** The chassis number as the ministry writes it, trimmed; "" / absent -> null. */
export function chassis(v: unknown): string | null {
  const s = (v === null || v === undefined ? "" : String(v)).trim();
  return s === "" ? null : s;
}

// §0.7, second clause: "if history 1 carries a test date of its own, it must equal the registry's
// mivchan_acharon_dt". The resource carries no such field today — its ten fields are _id,
// mispar_rechev, mispar_manoa, kilometer_test_aharon, the four change indicators, rishum_rishon_dt
// and mkoriut_nm, verified over all 250 cached snapshots (REPORT.md §1.4). The check is written
// against the names such a field could arrive under, so the rule is in place the day it appears;
// until then it does not fire and the report says so.
const HISTORY1_TEST_DATE_FIELDS = ["mivchan_acharon_dt", "test_dt", "taarich_test", "mivchan_dt"] as const;

/** The test date history 1 carries of its own, or null when it carries none (today: always null). */
export function history1TestDate(rec: RawRecord | undefined): string | null {
  if (!rec) return null;
  for (const f of HISTORY1_TEST_DATE_FIELDS) {
    if (f in rec) return isoDate(rec[f], `history_km.${f}`);
  }
  return null;
}
