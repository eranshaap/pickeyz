// Opening screen, F1 — the raw material of the model-families table, as numbers. Pure.
// Candidates are (make, spelling key) pairs; each carries the ACTIVE vehicles the ministry's
// quantities dataset counts for its catalog rows. Nothing here cuts: the two bars (fleet share per
// make, active vehicles per spelling) are set by Eran after reading the distribution.

import { spellingKey } from "./key";

// One models row, already filtered by the caller (year and vehicle class).
export type CatalogRow = {
  make: string;
  model: string;
  vehicleClass: string;
  tozeretCd: string;
  degemCd: string;
  year: number;
};

export type KeyStat = {
  key: string;
  /** Every raw spelling that folded into this key, with its catalog row count, in first-seen order. */
  spellings: { raw: string; rows: number }[];
  rows: number;
  /** [min, max] year over the key's catalog rows. */
  years: [number, number];
  active: number;
};

export type MakeStat = {
  make: string;
  active: number;
  share: number;
  cumulativeShare: number;
  keys: KeyStat[];
};

export type Distribution = {
  makes: MakeStat[];
  totalActive: number;
  matchedRows: number;
  unmatchedRows: number;
};

// The join key on both sides: the codes as given (trimmed strings) and the year.
export function quantityKey(tozeretCd: string, degemCd: string, year: number): string {
  return `${tozeretCd}|${degemCd}|${year}`;
}

export function distribution(rows: CatalogRow[], quantities: Map<string, number>): Distribution {
  const byMake = new Map<string, Map<string, KeyStat>>();
  let matchedRows = 0;
  let unmatchedRows = 0;

  for (const r of rows) {
    const q = quantities.get(quantityKey(r.tozeretCd.trim(), r.degemCd.trim(), r.year));
    let active = 0;
    if (q === undefined) unmatchedRows++;
    else {
      matchedRows++;
      active = q;
    }

    const key = spellingKey(r.model);
    const keys = byMake.get(r.make) ?? new Map<string, KeyStat>();
    byMake.set(r.make, keys);
    const stat = keys.get(key) ?? { key, spellings: [], rows: 0, years: [r.year, r.year], active: 0 };
    keys.set(key, stat);

    stat.rows++;
    stat.active += active;
    stat.years = [Math.min(stat.years[0], r.year), Math.max(stat.years[1], r.year)];
    const spelling = stat.spellings.find((s) => s.raw === r.model);
    if (spelling) spelling.rows++;
    else stat.spellings.push({ raw: r.model, rows: 1 });
  }

  const makes: MakeStat[] = [...byMake.entries()].map(([make, keys]) => {
    const sorted = [...keys.values()].sort((a, b) => b.active - a.active);
    return {
      make,
      active: sorted.reduce((sum, k) => sum + k.active, 0),
      share: 0,
      cumulativeShare: 0,
      keys: sorted,
    };
  });
  makes.sort((a, b) => b.active - a.active);

  const totalActive = makes.reduce((sum, m) => sum + m.active, 0);
  let cumulative = 0;
  for (const m of makes) {
    m.share = totalActive === 0 ? 0 : m.active / totalActive;
    cumulative += m.share;
    m.cumulativeShare = cumulative;
  }

  return { makes, totalActive, matchedRows, unmatchedRows };
}

// For each threshold, how many keys (across all makes) have at least that many active vehicles.
export function bucketCounts(
  makes: MakeStat[],
  thresholds: number[] = [100, 500, 1000, 2000, 5000, 10000],
): { threshold: number; keys: number }[] {
  const all = makes.flatMap((m) => m.keys);
  return thresholds.map((threshold) => ({ threshold, keys: all.filter((k) => k.active >= threshold).length }));
}
