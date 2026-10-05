// S2 §1 — the model families, read from the database: what both bars offer, and what a search is a search of.
//
// The bars read `model_families` with their `makes` (S1's FamilyEntry), never the live `models.model` names.
// A family is LIVE when some listing with `delisted_at: null` has a car whose catalog row points at it — the
// same live condition liveModels() (src/lib/search/models.ts) and the pool assembly use. liveModels() stays
// for scripts/measure-justifications.ts; the site no longer calls it.
//
// A question asked before S2 has `family_id` null and a `models.model` spelling in `model_searched`;
// familyOfModelText() finds its family through the catalog, exactly, or says there is none.

import { db } from "@/lib/db";
import { fullName, type FamilyEntry } from "@/lib/opening/completion";

/** S2 §1 — every row of `model_families` with its make, and whether a live listing points at it. */
export async function barFamilies(): Promise<FamilyEntry[]> {
  const [families, live] = await Promise.all([
    db.model_families.findMany({ include: { make: true }, orderBy: { id: "asc" } }),
    db.listings.findMany({ where: { delisted_at: null }, select: { car: { select: { model: { select: { family_id: true } } } } } }),
  ]);
  const liveIds = new Set(live.map((l) => l.car.model.family_id).filter((id): id is number => id !== null));
  return families.map((f) => ({
    id: f.id,
    make: { id: f.make.id, nameHe: f.make.name_he, nameEn: f.make.name_en, aliases: f.make.aliases },
    nameHe: f.name_he,
    nameEn: f.name_en,
    aliases: f.aliases,
    live: liveIds.has(f.id),
  }));
}

export type FamilyNames = { makeHe: string; makeEn: string; nameHe: string; nameEn: string };

/** S2 §1 — one family's four names; null when no row has that id. */
export async function familyNames(familyId: number): Promise<FamilyNames | null> {
  const f = await db.model_families.findUnique({ where: { id: familyId }, include: { make: true } });
  return f === null ? null : { makeHe: f.make.name_he, makeEn: f.make.name_en, nameHe: f.name_he, nameEn: f.name_en };
}

/**
 * S2 §1 — the family of a question asked before S2: the `family_id` of a catalog row whose `model` equals the
 * text exactly and whose `family_id` is not null. None → null. Two families behind one text is a stop: the
 * families import refuses a name with two families, so the catalog and the import disagree.
 */
export async function familyOfModelText(text: string): Promise<number | null> {
  const rows = await db.models.findMany({ where: { model: text, family_id: { not: null } }, select: { family_id: true }, distinct: ["family_id"] });
  const ids = rows.map((r) => r.family_id as number).sort((a, b) => a - b);
  if (ids.length > 1) throw new Error(`familyOfModelText: the catalog name '${text}' has ${ids.length} families (${ids.join(", ")})`);
  return ids[0] ?? null;
}

/**
 * S2 §3 — the question row's name for a question: the fullName() of its family ("מאזדה 3"); no family, or a
 * family that cannot be read, keeps the stored `model_searched`, as before.
 */
export async function questionDisplay(familyId: number | null, modelSearched: string): Promise<string> {
  const names = familyId === null ? null : await familyNames(familyId);
  return names === null ? modelSearched : fullName({ make: { nameHe: names.makeHe }, nameHe: names.nameHe });
}

/** S2 §A.3 — a stored question's family: its own `family_id`, or, when that is null, familyOfModelText(model_searched). */
export async function familyOfQuestion(q: { family_id: number | null; model_searched: string }): Promise<number | null> {
  return q.family_id ?? (await familyOfModelText(q.model_searched));
}
