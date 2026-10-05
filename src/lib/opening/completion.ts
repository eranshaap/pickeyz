// Opening screen, S1 §3–§4 — the list under the bar, and the hint in it.
//
// One list for both bars (the opening screen and the question row). Only live models are offered. The list
// never forgives a typo — a misspelling is found only through the spellings the families table holds.
// Pure: the caller builds FamilyEntry[] from the database, every family in the table, live or not.

import { LIVE_MODELS_LIST_MAX } from "./constants";
import { fromEnglishLayout } from "./keyboard";
import { OPENING_TEXTS } from "./texts";

export type MakeEntry = { id: number; nameHe: string; nameEn: string; aliases: string[] };
export type FamilyEntry = { id: number; make: MakeEntry; nameHe: string; nameEn: string; aliases: string[]; live: boolean };
export type PanelModel = { id: number; nameHe: string; fullName: string };
export type PanelGroup = { make: { id: number; nameHe: string }; models: PanelModel[] };
export type Panel =
  | { kind: "closed" }
  | { kind: "list"; notice: string | null; groups: PanelGroup[] }
  | { kind: "grey"; line: string; haveLine: string | null; groups: PanelGroup[] };

const GERESH = String.fromCharCode(0x5f3);
const RIGHT_SINGLE_QUOTE = String.fromCharCode(0x2019);
const GERSHAYIM = String.fromCharCode(0x5f4);
const LEFT_DOUBLE_QUOTE = String.fromCharCode(0x201c);
const RIGHT_DOUBLE_QUOTE = String.fromCharCode(0x201d);
const APOSTROPHE = String.fromCharCode(0x27);
const QUOTATION_MARK = String.fromCharCode(0x22);

/** The form both sides are compared in. No hyphen or letter folding. */
export function typedKey(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(GERESH).join(APOSTROPHE)
    .split(RIGHT_SINGLE_QUOTE).join(APOSTROPHE)
    .split(GERSHAYIM).join(QUOTATION_MARK)
    .split(LEFT_DOUBLE_QUOTE).join(QUOTATION_MARK)
    .split(RIGHT_DOUBLE_QUOTE).join(QUOTATION_MARK);
}

/** The name the site shows for a model: "מאזדה 3". */
export function fullName(f: FamilyEntry): string {
  return `${f.make.nameHe} ${f.nameHe}`;
}

const makeSpellings = (f: FamilyEntry): string[] => [f.make.nameHe, f.make.nameEn, ...f.make.aliases];
const modelSpellings = (f: FamilyEntry): string[] => [f.nameHe, f.nameEn, ...f.aliases];
const fullNameSpellings = (f: FamilyEntry): string[] => makeSpellings(f).flatMap((mk) => modelSpellings(f).map((md) => `${mk} ${md}`));

/** The keys the typed text is tried with: as typed, and through the English-keyboard conversion. */
const typedKeys = (typed: string): string[] => [typedKey(typed), typedKey(fromEnglishLayout(typed))];

function matches(f: FamilyEntry, keys: string[]): boolean {
  const spellings = [...makeSpellings(f), ...modelSpellings(f), ...fullNameSpellings(f)].map(typedKey);
  return keys.some((k) => k !== "" && spellings.some((s) => s.startsWith(k)));
}

function grouped(families: FamilyEntry[]): PanelGroup[] {
  const byMake = new Map<number, PanelGroup>();
  for (const f of families) {
    let g = byMake.get(f.make.id);
    if (g === undefined) {
      g = { make: { id: f.make.id, nameHe: f.make.nameHe }, models: [] };
      byMake.set(f.make.id, g);
    }
    g.models.push({ id: f.id, nameHe: f.nameHe, fullName: fullName(f) });
  }
  const groups = [...byMake.values()].sort((a, b) => a.make.nameHe.localeCompare(b.make.nameHe, "he"));
  for (const g of groups) g.models.sort((a, b) => a.nameHe.localeCompare(b.nameHe, "he"));
  return groups;
}

/** What the open list shows. `needModel` is true after "חפש" or Enter while the bar does not hold a model. */
export function completionPanel(all: FamilyEntry[], typed: string, needModel = false): Panel {
  const live = all.filter((f) => f.live);
  const have = live.length >= 1 && live.length <= LIVE_MODELS_LIST_MAX ? grouped(live) : null;
  const notice = needModel ? OPENING_TEXTS.needModel : null;
  const keys = typedKeys(typed);

  if (keys[0] === "") {
    if (have !== null) return { kind: "list", notice, groups: have };
    return needModel ? { kind: "list", notice, groups: [] } : { kind: "closed" };
  }

  const liveHits = live.filter((f) => matches(f, keys));
  if (liveHits.length > 0) return { kind: "list", notice, groups: grouped(liveHits) };

  const notOurs = all.some((f) => !f.live && matches(f, keys));
  const line = notOurs ? OPENING_TEXTS.greyNotOurs : OPENING_TEXTS.greyNotFound;
  if (have !== null) return { kind: "grey", line, haveLine: OPENING_TEXTS.haveLine, groups: have };
  return { kind: "grey", line, haveLine: null, groups: [] };
}

/**
 * The one live family the text names exactly — through a full-name spelling or one of the family's own
 * aliases — or null when none or more than one does. A bare nameHe or nameEn ("3") is not enough.
 */
export function exactModel(all: FamilyEntry[], typed: string): FamilyEntry | null {
  const keys = typedKeys(typed);
  const hits = all.filter((f) => f.live && [...fullNameSpellings(f), ...f.aliases].map(typedKey).some((s) => keys.includes(s)));
  return hits.length === 1 ? hits[0] : null;
}

/** "איזה דגם? למשל מאזדה 3" — a live model whose full name fits `maxChars`; none fits → "איזה דגם?". */
export function hintText(all: FamilyEntry[], maxChars: number, random: () => number = Math.random): string {
  const fits = all.filter((f) => f.live && fullName(f).length <= maxChars);
  if (fits.length === 0) return OPENING_TEXTS.hintAlone;
  return `${OPENING_TEXTS.hintPrefix} ${fullName(fits[Math.floor(random() * fits.length)])}`;
}
