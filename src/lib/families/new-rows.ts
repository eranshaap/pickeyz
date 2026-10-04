// Opening screen, F3b — the family of a catalog row created after the families import (BRIEF F3b §1). Pure.
// A new row takes the family_id of the rows already in the database with the same name: the same
// catalogKey (review.ts), so a spelling the chain merges finds the family of its siblings. The families
// import puts every row of a name in one family, so a name with two families is a guard, never a choice.

import { catalogKey } from "./review";

/** "{canonicalMake}|{key}" -> the family ids of the stored rows with that name. */
export type FamilyIndex = Map<string, Set<number>>;

export class FamilyConflictError extends Error {
  readonly conflicts: { name: string; familyIds: number[] }[];
  constructor(conflicts: { name: string; familyIds: number[] }[]) {
    super(
      `${conflicts.length} catalog name(s) with more than one family:\n` +
        conflicts.map((c) => `  ${c.name}: families ${c.familyIds.join(", ")}`).join("\n"),
    );
    this.conflicts = conflicts;
  }
}

function indexKey(make: string, model: string): string {
  const k = catalogKey(make, model);
  return `${k.canonicalMake}|${k.key}`;
}

/** A row with make, model or family_id null is skipped. */
export function buildFamilyIndex(rows: { make: string | null; model: string | null; family_id: number | null }[]): FamilyIndex {
  const index: FamilyIndex = new Map();
  for (const r of rows) {
    if (r.make === null || r.model === null || r.family_id === null) continue;
    const k = indexKey(r.make, r.model);
    const ids = index.get(k) ?? new Set<number>();
    index.set(k, ids);
    ids.add(r.family_id);
  }
  return index;
}

// The one lookup: null, the family id, or the conflict for the caller to report.
function lookup(index: FamilyIndex, make: string | null, model: string | null): { id: number | null } | { name: string; familyIds: number[] } {
  if (make === null || model === null) return { id: null };
  const ids = index.get(indexKey(make, model));
  if (ids === undefined) return { id: null };
  if (ids.size === 1) return { id: [...ids][0] };
  return { name: `${make} ${model}`, familyIds: [...ids].sort((a, b) => a - b) };
}

export function familyForNewRow(index: FamilyIndex, make: string | null, model: string | null): number | null {
  const r = lookup(index, make, model);
  if ("id" in r) return r.id;
  throw new FamilyConflictError([r]);
}

/** familyForNewRow over a list, in order; every conflict (once per name) is collected into one FamilyConflictError. */
export function familiesForNewRows(index: FamilyIndex, rows: { make: string | null; model: string | null }[]): (number | null)[] {
  const ids: (number | null)[] = [];
  const conflicts = new Map<string, { name: string; familyIds: number[] }>();
  for (const row of rows) {
    const r = lookup(index, row.make, row.model);
    if ("id" in r) ids.push(r.id);
    else {
      ids.push(null);
      if (!conflicts.has(r.name)) conflicts.set(r.name, r);
    }
  }
  if (conflicts.size > 0) throw new FamilyConflictError([...conflicts.values()]);
  return ids;
}
