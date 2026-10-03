// BRIEF Day 19b Run 22 §3 — WHICH models ROWS A MANUAL-SPEC ROW DESCRIBES (findCar-schema.md §18), pure.
// make, model, body_type, year, engine_size and drive_type equal; the engine type computed from the row's
// (drive_technology, fuel_type) equal to the spec's; the row's sub_model one of the spec's trims. Text is
// compared trimmed, letters untouched; a null on the models side never matches.

import { engineTypeCode } from "@/lib/display/spec";
import type { ManualSpec } from "./spec-tab";

/** §3.1 — the nine models columns the rule reads. */
export type SpecMatchModel = {
  make: string | null; model: string | null; body_type: string | null; year: number | null;
  engine_size: number | null; drive_technology: string | null; fuel_type: string | null;
  drive_type: string | null; sub_model: string | null;
};

function sameText(row: string | null, spec: string): boolean {
  return row !== null && row.trim() === spec;
}

function sameNumber(row: number | null, spec: number): boolean {
  return row !== null && row === spec;
}

/** §3.2 */
export function specMatches(row: SpecMatchModel, spec: ManualSpec): boolean {
  return (
    sameText(row.make, spec.make) &&
    sameText(row.model, spec.model) &&
    sameText(row.body_type, spec.body_type) &&
    sameNumber(row.year, spec.year) &&
    sameNumber(row.engine_size, spec.engine_size) &&
    sameText(row.drive_type, spec.drive_type) &&
    engineTypeCode(row.drive_technology, row.fuel_type) === spec.engine_type && // null never equals a code
    row.sub_model !== null && spec.sub_models.includes(row.sub_model.trim())
  );
}

export type SpecCandidateWhere = {
  make: string; model: string; body_type: string; year: number; engine_size: number;
  drive_type: string; sub_model: { in: string[] };
};

/**
 * §3.3 — the filter the script passes to models.findMany for one spec row. The engine type is computed, not a
 * column, so it is not here: specMatches finishes the job on the rows returned. Pure data, no Prisma import.
 */
export function specCandidateWhere(spec: ManualSpec): SpecCandidateWhere {
  return {
    make: spec.make, model: spec.model, body_type: spec.body_type, year: spec.year,
    engine_size: spec.engine_size, drive_type: spec.drive_type, sub_model: { in: [...spec.sub_models] },
  };
}
