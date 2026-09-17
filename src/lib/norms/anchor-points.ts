// Day 18 (§5) — pool_stats.anchor_points: the model-year points of the anchor fit, as data.
//
//   buildAnchorPoints()   the points from (make, model, year, ratio, age) observations: one point per model-year
//                         with at least ANCHOR_POINT_MIN_SAMPLE observations; ratio = the median ratio, median_age =
//                         the median age; every number rounded to `decimals` places like every norm value
//   parseAnchorPoints()   the stored Json read back into the engine's shape — a value that is not that shape stops
//                         the reader, it is never read as "no points"
//   sameAnchorPoints()    the skip-identical comparison (§3.5): element by element, numbers compared at 6 dp
//
// Pure: no database.

import { ANCHOR_POINT_MIN_SAMPLE } from "@/lib/scoring/constants";
import type { AnchorPoint } from "@/lib/scoring/types";

export type AnchorObservation = { make: string; model: string; year: number; ratio: number; age: number };

/** A model-year that did not reach ANCHOR_POINT_MIN_SAMPLE — printed by the norms run, never fitted. */
export type ThinPoint = { make: string; model: string; year: number; n: number };

function median(values: number[]): number {
  if (values.length === 0) throw new Error("median of an empty set");
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round = (v: number, decimals: number) => Number(v.toFixed(decimals));
export const pointKey = (p: { make: string; model: string; year: number }) => `${p.make}|${p.model}|${p.year}`;

export function buildAnchorPoints(obs: AnchorObservation[], decimals: number): { points: AnchorPoint[]; thin: ThinPoint[] } {
  const groups = new Map<string, AnchorObservation[]>();
  for (const o of obs) {
    const k = pointKey(o);
    if (!groups.has(k)) groups.set(k, []);
    (groups.get(k) as AnchorObservation[]).push(o);
  }
  const points: AnchorPoint[] = [];
  const thin: ThinPoint[] = [];
  for (const set of groups.values()) {
    const { make, model, year } = set[0];
    if (set.length < ANCHOR_POINT_MIN_SAMPLE) {
      thin.push({ make, model, year, n: set.length });
      continue;
    }
    points.push({
      make,
      model,
      year,
      n: set.length,
      ratio: round(median(set.map((o) => o.ratio)), decimals),
      median_age: round(median(set.map((o) => o.age)), decimals),
    });
  }
  const order = (a: { make: string; model: string; year: number }, b: { make: string; model: string; year: number }) =>
    a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || a.year - b.year;
  return { points: points.sort(order), thin: thin.sort(order) };
}

export function parseAnchorPoints(json: unknown, where: string): AnchorPoint[] | null {
  if (json === null || json === undefined) return null;
  if (!Array.isArray(json)) throw new Error(`${where}: anchor_points is not an array`);
  return json.map((e, i) => {
    const p = (e ?? {}) as Record<string, unknown>;
    const bad = (field: string) => new Error(`${where}: anchor_points[${i}].${field} = ${JSON.stringify(p[field])}`);
    if (typeof p.make !== "string") throw bad("make");
    if (typeof p.model !== "string") throw bad("model");
    for (const f of ["year", "n", "ratio", "median_age"]) if (typeof p[f] !== "number" || !Number.isFinite(p[f])) throw bad(f);
    if (!Number.isInteger(p.year)) throw bad("year");
    if (!Number.isInteger(p.n)) throw bad("n");
    return { make: p.make, model: p.model, year: p.year as number, n: p.n as number, ratio: p.ratio as number, median_age: p.median_age as number };
  });
}

/** §3.5: the same points, in the same order, numbers equal at 6 dp. A previous null (a row from before the column) differs. */
export function sameAnchorPoints(prev: AnchorPoint[] | null, next: AnchorPoint[]): boolean {
  if (prev === null || prev.length !== next.length) return false;
  const r6 = (v: number) => Number(v.toFixed(6));
  return prev.every((p, i) => {
    const q = next[i];
    return p.make === q.make && p.model === q.model && p.year === q.year && p.n === q.n && r6(p.ratio) === r6(q.ratio) && r6(p.median_age) === r6(q.median_age);
  });
}
