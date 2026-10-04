// Opening screen, F2 — the rows of the model-families review sheet (BRIEF §10.6). Pure.
// Catalog makes fold into their canonical make (MAKE_MERGES), model names fold by mergeKey, names group by
// groupKey, and only the groups whose active total reaches the bar enter the sheet — every name of a kept
// group, however small. The decision columns are not filled here: proposals are made in the chat.

import type { CatalogRow } from "./distribution";
import { groupKey } from "./group";
import { mergeKey, stripMake } from "./merge";
import { SPELLING_SEPARATOR, type MakeEntry } from "./words";

/** A catalog row with its matched active count (0 when the quantities dataset has no row for it). */
export type ActiveRow = CatalogRow & { active: number };

export type SheetInput = {
  /** In models.id order: ties keep first-seen order. */
  rows: ActiveRow[];
  /** liveKey(make, model) of every models row with a car that has a live listing. */
  live: Set<string>;
  makeMerges: Record<string, string>;
  makes: Record<string, MakeEntry>;
  minActive: number;
};

export type ModelRow = {
  /** The make's catalog spellings, canonical first, joined by " · ". */
  catalogMake: string;
  group: string;
  /** The shown spelling, then the other spellings of the merged name, joined by " · ". */
  catalogName: string;
  /** The same spellings as an array (shown first); the script's summary counts them. */
  spellings: string[];
  active: number;
  /** "min-max" over the merged name's catalog rows. */
  years: string;
  live: boolean;
  englishMake: string;
};

export type MakeRow = {
  catalogSpellings: string;
  spellings: string[];
  /** Over all the make's in-scope catalog rows, not only its kept groups. */
  active: number;
  english: string;
};

export type MissingMakeEntry = { make: string; groups: { key: string; total: number }[] };

// U+05F3 (geresh) and U+2019, built from their code points: words.ts is the only file with Hebrew letters.
const MAKE_APOSTROPHES = new RegExp(`[${String.fromCharCode(0x05f3)}${String.fromCharCode(0x2019)}]`, "g");

// The compared form of a catalog make: trimmed, one space per whitespace run, U+05F3 and U+2019 -> U+0027.
export function makeKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").replace(MAKE_APOSTROPHES, "'");
}

// A table lookup by own key only: a make spelled like an Object.prototype member finds nothing.
function own<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

export function canonicalMake(raw: string, makeMerges: Record<string, string>): string {
  const k = makeKey(raw);
  return own(makeMerges, k) ?? k;
}

export function liveKey(make: string, model: string): string {
  return JSON.stringify([make, model]);
}

type NameStat = {
  spellings: { raw: string; active: number }[];
  active: number;
  years: [number, number];
  live: boolean;
};

type GroupStat = { key: string; total: number; names: NameStat[] };

type MakeFamilies = { make: string; spellings: string[]; active: number; groups: GroupStat[] };

const byActiveDesc = <T extends { active: number }>(a: T, b: T) => b.active - a.active;

// Every canonical make with all its groups, sorted (Array.prototype.sort is stable, so ties keep the
// first-seen order of the Maps, which is the rows' order). A make with no MAKES entry is grouped with no
// prefixes: the missing-entry check (missingMakeEntries) reads those groups.
function familyMakes(input: SheetInput): MakeFamilies[] {
  type MakeAcc = { spellings: string[]; active: number; names: Map<string, NameStat> };
  const byMake = new Map<string, MakeAcc>();

  for (const r of input.rows) {
    const canonical = canonicalMake(r.make, input.makeMerges);
    const prefixes = own(input.makes, canonical)?.prefixes ?? [];
    const acc = byMake.get(canonical) ?? { spellings: [canonical], active: 0, names: new Map<string, NameStat>() };
    byMake.set(canonical, acc);
    const spelling = makeKey(r.make);
    if (!acc.spellings.includes(spelling)) acc.spellings.push(spelling);
    acc.active += r.active;

    const k = mergeKey(r.model, prefixes);
    const name = acc.names.get(k) ?? { spellings: [], active: 0, years: [r.year, r.year], live: false };
    acc.names.set(k, name);
    name.active += r.active;
    name.years = [Math.min(name.years[0], r.year), Math.max(name.years[1], r.year)];
    if (input.live.has(liveKey(r.make, r.model))) name.live = true;
    const s = name.spellings.find((x) => x.raw === r.model);
    if (s) s.active += r.active;
    else name.spellings.push({ raw: r.model, active: r.active });
  }

  const result: MakeFamilies[] = [];
  for (const [make, acc] of byMake) {
    const prefixes = own(input.makes, make)?.prefixes ?? [];
    const groups = new Map<string, GroupStat>();
    for (const name of acc.names.values()) {
      // The shown spelling (most active, first seen on a tie) comes first; its groupKey is the name's group.
      name.spellings.sort(byActiveDesc);
      const key = groupKey(stripMake(name.spellings[0].raw, prefixes));
      const g = groups.get(key) ?? { key, total: 0, names: [] };
      groups.set(key, g);
      g.total += name.active;
      g.names.push(name);
    }
    const sorted = [...groups.values()].sort((a, b) => b.total - a.total);
    for (const g of sorted) g.names.sort(byActiveDesc);
    result.push({ make, spellings: acc.spellings, active: acc.active, groups: sorted });
  }
  return result.sort(byActiveDesc);
}

/** The canonical makes that have a kept group and no MAKES entry, with those groups. Empty = the sheet can be built. */
export function missingMakeEntries(input: SheetInput): MissingMakeEntry[] {
  return familyMakes(input)
    .filter((m) => own(input.makes, m.make) === undefined)
    .map((m) => ({
      make: m.make,
      groups: m.groups.filter((g) => g.total >= input.minActive).map((g) => ({ key: g.key, total: g.total })),
    }))
    .filter((m) => m.groups.length > 0);
}

export function buildSheet(input: SheetInput): { models: ModelRow[]; makes: MakeRow[] } {
  const missing = missingMakeEntries(input);
  if (missing.length > 0) {
    throw new Error(`canonical makes with a kept group and no MAKES entry: ${missing.map((m) => m.make).join(", ")}`);
  }

  const models: ModelRow[] = [];
  const makes: MakeRow[] = [];
  for (const m of familyMakes(input)) {
    const kept = m.groups.filter((g) => g.total >= input.minActive);
    if (kept.length === 0) continue;
    const entry = own(input.makes, m.make)!;
    const catalogMake = m.spellings.join(SPELLING_SEPARATOR);
    makes.push({ catalogSpellings: catalogMake, spellings: m.spellings, active: m.active, english: entry.english });
    for (const g of kept) {
      for (const n of g.names) {
        const spellings = n.spellings.map((s) => s.raw);
        models.push({
          catalogMake,
          group: g.key,
          catalogName: spellings.join(SPELLING_SEPARATOR),
          spellings,
          active: n.active,
          years: `${n.years[0]}-${n.years[1]}`,
          live: n.live,
          englishMake: entry.english,
        });
      }
    }
  }
  return { models, makes };
}
