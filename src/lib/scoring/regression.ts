// src/lib/scoring/regression.ts
// The regression classifier, as a pure library (Day 17 run 4 §2). scripts/score-listings.ts used to
// carry it inline; it now keeps only the loading, the recompute callback and the printing.
//
// One difference between a stored score and the recomputed one gets exactly one label, the first that
// applies: VERSION (with its two named sub-rules), NEW, CLOCK, DATA, NORM, NORM (…), else UNEXPLAINED.
// Only UNEXPLAINED counts as a regression (decision, Eran 09/09: a difference explained by the clock is
// not one). Every label keeps the meaning and the identity it was given on the day it was written:
//
//   VERSION           Day 14 §6.3 — a v2 -> v3 move, checked term by term against the per-cell constant.
//   VERSION (anchor)  Day 14 Q13 (a) — the thin-cell anchor (§0.5).
//   VERSION (typical) Day 14 Q13 (b) — the re-sourced history (§0.4).
//   NEW               no stored score at all: first scoring.
//   CLOCK             the same inputs and the same norm rows, only `now` moved back to scored_at.
//   DATA              an input the stored breakdown carries has changed since.
//   NORM              the cell's SET moved (sample_size / window_days / the row itself appearing).
//   NORM (…)          Day 17 run 4 §2 — the composed norm identity, below.
//
// The composed norm identity (Day 17 run 4 §2, replacing run 3's two separate checks): if any of the
// three norm rows the stored score points at — the cell row (market_stats), the slope row (model_stats),
// the anchor row (pool_stats) — is not the row the current score used, the engine is re-run with ALL the
// stored rows at the stored run's own clock. Reproduces the stored score exactly -> the label names the
// rows that differ: NORM (median), NORM (slope), NORM (anchor), NORM (median, slope), and so on. Does not
// reproduce it -> UNEXPLAINED, with the attempt printed under the line. The identity is never widened to
// make a line pass, and it is never an exemption: a label is earned by recomputation or it is not given.
//
// Day 17 run 5 §3 narrows the LABEL, not the test (findCar-now.md, "כלל הרגרסיה", as edited that day):
// the label names the rows that changed AMONG THOSE THE OLD SCORE READ — the cell row always, the slope
// row only when that score used the model slope rather than the default, the anchor row only when that
// score's price row came from the anchor (a thin cell). readNormKinds() reads both facts straight out of
// the stored invoice. The recomputation is unchanged: still ONE run with all three stored rows. A row
// that moved but was not read is still printed under the line, marked with why it is not named.
//
// This module opens no database and reads no argv. `scoreWith(normRows, at)` is the caller's — it is the
// engine re-run with those rows and that clock over the listing's CURRENT data (DATA is checked first, so
// by the time the identity runs the inputs are already known to be unchanged).
//
// Day 18 run 3c §13 — the auditor at a version write: ONE rule for every version write, no identity per version.
// Order: NEW; DATA (a listing whose inputs changed is DATA, version change or not); then, when the stored
// engine_version differs from ENGINE_VERSION, the version rule; then CLOCK / NORM / UNEXPLAINED as before.
//   The version rule is the NORM identity's recomputation: the current engine, the norm rows the stored score read,
//   at the stored score's date. Reproduced (within ROUNDING_ALLOWANCE) -> VERSION, naming the rows whose VALUES
//   changed among those the stored score read — (median), (slope), (anchor) — plus (anchor gate) when a vs_new_price
//   price row is in exactly one of the stored and the current invoice, plus (confidence: color) when the only
//   confidence move is the v4-only item color_mismatch. No name -> plain VERSION. Not reproduced -> only a declared
//   identity for the pair (from, to) may explain it: (2, 3) is versionExpectation() below; any other pair is
//   UNEXPLAINED ("engine moved a listing; no declared identity for v<from> → v<to>").
//   A stored pool row from before anchor_points (null): the recomputation gets a synthetic points list — the
//   listing's own (make, model, year) when the stored invoice's price row is the anchor's, [] otherwise — so the
//   yes / no of the anchor comes from the record while the number is still recomputed. The engine is untouched.
//
// Day 18 run 3c §13.2 (b): "a row changed" is decided by VALUES — the fields the norms run's skip-identical rule
// compares (anchor_points through sameAnchorPoints) — for the version rule and for the NORM (…) naming alike. The
// NORM identity is still attempted only when a pointer differs; a pointer that moved onto identical values names
// nothing.

import { sameAnchorPoints } from "@/lib/norms/anchor-points";
import { confidenceLevel } from "./confidence";
import { KM_SLOPE_MIN_SAMPLE, MIN_SAMPLE } from "./constants";
import type { AnchorPoint, CellNorm, Invoice, ModelNorm, PoolNorm, ScoringInput } from "./types";
import { dateToIso, round } from "./util";

// ---------- labels ----------
export const NORM_KINDS = ["median", "slope", "anchor"] as const;
export type NormKind = (typeof NORM_KINDS)[number];

// Day 18 run 3c: the names a VERSION line may carry, in this order.
export const VERSION_NAMES = ["median", "slope", "anchor", "anchor gate", "confidence: color"] as const;
export type VersionName = (typeof VERSION_NAMES)[number];

export type Label =
  | "VERSION" | `VERSION (${string})` | "VERSION (typical)"
  | "NEW" | "CLOCK" | "DATA"
  | "NORM"
  | "NORM (median)" | "NORM (slope)" | "NORM (anchor)"
  | "NORM (median, slope)" | "NORM (median, anchor)" | "NORM (slope, anchor)"
  | "NORM (median, slope, anchor)"
  | "UNEXPLAINED";
/** The VERSION label for a set of names, in VERSION_NAMES order; no names -> plain VERSION. */
export function versionNamedLabel(names: readonly VersionName[]): Label {
  const ordered = VERSION_NAMES.filter((n) => names.includes(n));
  return ordered.length === 0 ? "VERSION" : (`VERSION (${ordered.join(", ")})` as Label);
}
// Every VERSION combination, so a count line can list each one. "VERSION (anchor)" is also the name the (2, 3)
// identity's thin-cell sub-rule gives — one string, counted once.
const VERSION_LABELS: Label[] = Array.from({ length: 2 ** VERSION_NAMES.length }, (_, mask) =>
  versionNamedLabel(VERSION_NAMES.filter((_, i) => (mask >> i) & 1)),
);
export const LABELS: Label[] = [
  ...VERSION_LABELS, "VERSION (typical)", "NEW", "CLOCK", "DATA",
  "NORM", "NORM (median)", "NORM (slope)", "NORM (anchor)",
  "NORM (median, slope)", "NORM (median, anchor)", "NORM (slope, anchor)", "NORM (median, slope, anchor)",
  "UNEXPLAINED",
];
export const LABEL_WIDTH = Math.max(...LABELS.map((l) => l.length));
/** The composed NORM label for the rows that differ, in NORM_KINDS order. */
export function normLabel(kinds: readonly NormKind[]): Label {
  return `NORM (${kinds.join(", ")})` as Label;
}

// ---------- the three norm rows, as one thing ----------
// `median` is the cell row (market_stats), `slope` the model row (model_stats), `anchor` the pool row
// (pool_stats) — the names the labels use, so a label and the row it blames read the same.
export type NormRows = { median: CellNorm | null; slope: ModelNorm | null; anchor: PoolNorm | null };
export type ScoreWith = (norms: NormRows, at: Date) => Invoice;

export const normId = (n: NormRows, kind: NormKind): number | null => n[kind]?.id ?? null;

// ---------- what the caller passes ----------
export type StoredSide = {
  score: number | null;
  condition_score: number | null;
  confidence: string | null;
  engine_version: number | null;
  scored_at: Date | null;
  breakdown: unknown; // a stored ScoreResult (listings.score_breakdown or listing_scores.breakdown)
  // The norm rows that stored score used: the rows its ids point at, or — where an id is null — the row
  // that was current at its scored_at. The caller resolves them; this module only compares and re-runs.
  norms: NormRows;
  // Levels whose stored id points at a row that is gone from its table. Not the same as "there was no
  // row": the stored score cannot be reproduced without it, so the identity is not attempted.
  missing: NormKind[];
};

export type RegressionInput = {
  make: string;
  model: string;
  result: Invoice; // the current invoice (Day 18: possibly the cancelled one)
  input: ScoringInput; // the listing's data as it is now
  norms: NormRows; // the norm rows the current invoice used
  stored: StoredSide;
  engine_version: number; // ENGINE_VERSION — the version the current invoice carries
  scoreWith: ScoreWith;
};

export type Classified = { label: Label; head: string; detail: string[] };

// ---------- printing helpers ----------
export function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "-" : (n > 0 ? "+" : "") + String(n);
}
const num = (n: number | null | undefined): string => (n === null || n === undefined ? "-" : String(n));

// ---------- what this module reads out of a stored breakdown ----------
export type StoredBreakdown = {
  rows?: { row?: string; status?: string; source?: string; note?: string; value?: number; raw?: Record<string, unknown> }[];
  checks?: { check?: string; status?: string; reason?: string; declared?: number; official?: number; official_date?: string }[];
  facts?: Record<string, unknown>;
  typical_condition?: number | null; // v2's name for the cell's typical
  typical_history?: number | null; // v3's name for it (§3.4)
};

// Day 14 run B (§6.2): the two values the dropped columns used to hold, read from the stored invoice.
// A listing that has never been scored has no invoice — both are null, exactly as the columns were.
export function storedSums(breakdown: unknown): { condition_score: number | null; confidence: string | null } {
  const bd = (breakdown ?? null) as { condition_score?: number | null; confidence?: { level?: string } } | null;
  if (bd === null) return { condition_score: null, confidence: null };
  return { condition_score: bd.condition_score ?? null, confidence: bd.confidence?.level ?? null };
}

/** The stored typical under whichever name that engine wrote it (§0.2 renamed it, it is the same slot). */
export function storedTypical(bd: StoredBreakdown): number | null {
  if (typeof bd.typical_history === "number") return bd.typical_history;
  if (typeof bd.typical_condition === "number") return bd.typical_condition;
  return null;
}
/** A row's value as the stored breakdown carries it; null when the row is absent or was not scored. */
export function storedRowValue(bd: StoredBreakdown, row: string): number | null {
  const r = bd.rows?.find((x) => x.row === row);
  if (!r || r.status !== "scored" || typeof r.value !== "number") return null;
  return r.value;
}

// The engine's inputs (ScoringInput) as the stored breakdown carries them, and the ones it does not
// carry at all — the DATA check is partial by exactly this second list.
// Day 18 (engine v4): the new inputs join the two lists. car.current_owner_type is carried by a v4 invoice as
// facts.current_owner_registry (a v3 invoice does not carry it, so it is compared only against a v4 one). The colour
// inputs are carried only as the facts they produce — a mismatch or a reported change, not the words — so they are
// not comparable; make / model / cancelled_at are not carried at all.
export const DATA_COVERS = [
  "listing.price", "listing.km_declared", "car.hand", "car.ownership_history", "car.test_expiry",
  "listing.hand_declared (unless the hand check was skipped)",
  "car.km_at_last_test, car.mivchan_acharon_dt (unless the km check was skipped or had no declaration)",
  "car.current_owner_type (facts.current_owner_registry — v4 invoices only)",
];
export const DATA_MISSING = [
  "listing.first_seen_at", "listing.seller_type (dealers.dealer_type)", "listing.owners_at_first_seen", "car.year", "car.first_registration",
  "car.make", "car.model", "car.cancelled_at", "car.color", "car.registry_color", "car.color_changed",
];

export const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function show(v: unknown): string {
  if (v === undefined) return "absent";
  if (v === null) return "null";
  return typeof v === "string" ? v : JSON.stringify(v);
}
// The ownership record as one comparable string; key order in the stored JSON is not part of the input.
function ownersKey(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return `not-an-array:${JSON.stringify(v)}`;
  return v.map((e) => {
    const { ym, type } = (e ?? {}) as { ym?: unknown; type?: unknown };
    return `${String(ym)}:${String(type)}`;
  }).join(",");
}
// Compare every key the stored side carries; a key the current side lacks reads as 'absent'.
function diffMaps(stored: Map<string, unknown>, current: Map<string, unknown>): string[] {
  const diffs: string[] = [];
  for (const [k, a] of stored) {
    const b = current.get(k);
    if (!same(a, b)) diffs.push(`${k}: ${show(a)} -> ${show(b)}`);
  }
  return diffs;
}

const rawOf = (bd: StoredBreakdown, row: string) => bd.rows?.find((r) => r.row === row)?.raw;
const checkOf = (bd: StoredBreakdown, check: string) => bd.checks?.find((c) => c.check === check);

export function storedInputs(bd: StoredBreakdown): Map<string, unknown> {
  const m = new Map<string, unknown>();
  const price = rawOf(bd, "price"), km = rawOf(bd, "km"), history = rawOf(bd, "history");
  if (price && "price" in price) m.set("listing.price", price.price);
  if (km && "km_declared" in km) m.set("listing.km_declared", km.km_declared);
  if (history && "paper_hand" in history) m.set("car.hand", history.paper_hand);
  if (history && "owners" in history) m.set("car.ownership_history", ownersKey(history.owners));
  if (bd.facts && "test_expiry" in bd.facts) m.set("car.test_expiry", bd.facts.test_expiry);
  if (bd.facts && "current_owner_registry" in bd.facts) m.set("car.current_owner_type", bd.facts.current_owner_registry);
  // hand_declared: checks.hand carries it unless the check was skipped (§18.8); 'no_declaration' means null.
  const hand = checkOf(bd, "hand");
  if (hand && hand.status !== "skipped") m.set("listing.hand_declared", hand.reason === "no_declaration" ? null : hand.declared ?? null);
  // km check, in its own order (checks.ts): 'no_declaration' carries neither value; 'no_official_km' means
  // km_at_last_test null and says nothing about the test date; every later branch carries both.
  const kc = checkOf(bd, "km");
  if (kc && kc.status !== "skipped" && kc.reason !== "no_declaration") {
    m.set("car.km_at_last_test", kc.reason === "no_official_km" ? null : kc.official ?? null);
    if (kc.reason !== "no_official_km") m.set("car.mivchan_acharon_dt", kc.reason === "no_test_date" ? null : kc.official_date ?? null);
  }
  return m;
}
export function currentInputs(input: ScoringInput): Map<string, unknown> {
  const { listing, car } = input;
  return new Map<string, unknown>([
    ["listing.price", listing.price],
    ["listing.km_declared", listing.km_declared],
    ["listing.hand_declared", listing.hand_declared],
    ["car.hand", car.hand],
    ["car.ownership_history", ownersKey(car.ownership_history)],
    ["car.km_at_last_test", car.km_at_last_test],
    ["car.mivchan_acharon_dt", car.mivchan_acharon_dt === null ? null : dateToIso(car.mivchan_acharon_dt)],
    ["car.test_expiry", car.test_expiry === null ? null : dateToIso(car.test_expiry)],
    ["car.current_owner_type", car.current_owner_type],
  ]);
}

// The norm values the stored breakdown carries. The cell's typical only through typical_condition (v2) /
// typical_history (v3), which the engine writes only when the price row scored — when it is absent the
// stored typical is unknown and stays out of the comparison. market_row records whether there was a row.
export function storedNorm(bd: StoredBreakdown): Map<string, unknown> {
  const m = new Map<string, unknown>();
  const price = rawOf(bd, "price"), km = rawOf(bd, "km");
  m.set("market_row", price && "median_price" in price ? "present" : "none");
  if (price && "median_price" in price) m.set("median_price", price.median_price);
  if (price && "sample_size" in price) m.set("sample_size", price.sample_size);
  if (price && "window_days" in price) m.set("window_days", price.window_days);
  if (km && "median_km" in km) m.set("median_km", km.median_km);
  if (typeof storedTypical(bd) === "number") m.set("typical", storedTypical(bd));
  return m;
}
export function currentNorm(market: ScoringInput["market"]): Map<string, unknown> {
  const m = new Map<string, unknown>();
  m.set("market_row", market === null ? "none" : "present");
  if (market === null) return m;
  m.set("median_price", market.median_price);
  m.set("sample_size", market.sample_size);
  m.set("window_days", market.window_days);
  m.set("median_km", market.median_km);
  m.set("typical", market.median_history === null ? null : round(market.median_history));
  return m;
}

// ---------- Day 14 §6.3: the VERSION identity ----------
// The whole v2 -> v3 move of one listing's deal, checked term by term:
//   the price row is unchanged, the history row is unchanged, and
//   deal_v3 - deal_v2 = (old typical_condition - new median_history) + (new km row - old km row).
// `constant` is the per-cell part — (old typical - new typical) — which must be the same for every
// listing of the cell; the km term is the listing's own and is zero wherever the slope did not change.
// Q13: `sub` names which of the two sub-rules carried the line, null when the general rule did.
export type VersionSub = "anchor" | "typical" | null;
export type VersionCheck = { ok: boolean; sub: VersionSub; detail: string[]; constant: number | null; km_term: number | null; used_allowance: boolean };
/** What versionExpectation() needs of a listing: the stored deal, the current invoice, the current data. */
export type VersionSubject = { stored_score: number | null; result: Invoice; input: ScoringInput };
const EPS = 1e-9;
// Q11: v2 computed round(round(history + km) - typical), v3 computes round(history - typical + km) in
// ONE rounding. On a .05 boundary the two differ by exactly one ROUND_DECIMALS step, so a line whose only
// miss is that step is still VERSION — the deviation is printed and the lines that used it are counted.
// Anything larger is a real move and stays UNEXPLAINED.
export const ROUNDING_ALLOWANCE = 0.1;
export function versionExpectation(s: VersionSubject, bd: StoredBreakdown | null): VersionCheck {
  const detail: string[] = [];
  if (bd === null) return { ok: false, sub: null, detail: ["listings.score_breakdown is null: the v2 -> v3 move cannot be checked"], constant: null, km_term: null, used_allowance: false };

  const curRow = (name: string) => s.result.rows.find((r) => r.row === name);
  const curValue = (name: string) => {
    const r = curRow(name);
    return r && r.status === "scored" && typeof r.value === "number" ? r.value : null;
  };
  const oldPrice = storedRowValue(bd, "price"), newPrice = curValue("price");
  const oldHistory = storedRowValue(bd, "history"), newHistory = curValue("history");
  const oldKm = storedRowValue(bd, "km"), newKm = curValue("km");
  const oldTypical = storedTypical(bd), newTypical = s.result.typical_history;

  // Q13 (a) — the thin-cell anchor (§0.5). Neither version has a deal score, the history and km rows are
  // identical, and the ONLY move is a price row that goes from absent to a scored anchor. Everything the
  // sub-rule asserts is checked; a thin-cell listing that moved anything else falls through to the general
  // rule below and is UNEXPLAINED there.
  const priceSource = curRow("price")?.source ?? null;
  if (
    s.stored_score === null && s.result.deal_score === null &&
    oldHistory === newHistory && oldKm === newKm &&
    oldPrice === null && newPrice !== null && priceSource === "anchor"
  ) {
    detail.push(
      `thin cell (sample_size ${s.input.market?.sample_size ?? "-"} < ${MIN_SAMPLE}): price row absent -> ${fmt(newPrice)} from the anchor (§0.5); ` +
        `history ${fmt(oldHistory)} and km ${fmt(oldKm)} unchanged; no deal score on either side`,
    );
    return { ok: true, sub: "anchor", detail, constant: null, km_term: null, used_allowance: false };
  }

  // Q13 (b) — the re-sourced history (§0.4). The car has no ownership row, so v2 scored the hand the ad
  // declared and v3 takes the cell's typical instead. The deal must move by the cell constant plus that
  // history move plus the km move; the price row still may not move. Checked below, after the terms.
  const historySource = curRow("history")?.source ?? null;
  const reSourced =
    s.input.car.ownership_history === null && historySource === "typical" &&
    newHistory !== null && newTypical !== null && newHistory === round(newTypical) &&
    oldPrice === newPrice && s.stored_score !== null && s.result.deal_score !== null &&
    oldTypical !== null && oldHistory !== null;

  // The two rows the brief says must not move.
  if (oldPrice !== newPrice) detail.push(`price row moved ${fmt(oldPrice)} -> ${fmt(newPrice)} — §0.7 says it must not`);
  if (!reSourced && oldHistory !== newHistory) detail.push(`history row moved ${fmt(oldHistory)} -> ${fmt(newHistory)} — §0.7 says it must not`);

  if (s.stored_score === null || s.result.deal_score === null) {
    // A deal that appears or disappears is a move §0.7 does not describe; say so rather than pass it.
    detail.push(`deal ${fmt(s.stored_score)} -> ${fmt(s.result.deal_score)}: one side has no deal score, so the constant does not apply`);
    return { ok: false, sub: null, detail, constant: null, km_term: null, used_allowance: false };
  }
  if (oldTypical === null || newTypical === null) {
    detail.push(`typical ${fmt(oldTypical)} -> ${fmt(newTypical)}: one side has no typical, so the constant does not apply`);
    return { ok: false, sub: null, detail, constant: null, km_term: null, used_allowance: false };
  }

  if (reSourced) {
    const constant = round(oldTypical - newTypical);
    const km_term = round((newKm ?? 0) - (oldKm ?? 0));
    const history_term = round((newHistory as number) - (oldHistory as number));
    const expected = round(constant + history_term + km_term);
    const actual = round(s.result.deal_score - s.stored_score);
    detail.push(
      `car has no ownership record: history row ${fmt(oldHistory)} (ad's declared hand, v2) -> ${fmt(newHistory)} = the cell's typical (§0.4, ${history_term >= 0 ? "+" : ""}${history_term}); ` +
        `typical ${fmt(oldTypical)} -> ${fmt(newTypical)} (cell constant ${fmt(constant)}); ` +
        `km row ${fmt(oldKm)} -> ${fmt(newKm)} (${fmt(km_term)}, slope_source ${String(curRow("km")?.raw?.slope_source ?? "-")}); ` +
        `price row ${fmt(oldPrice)} unchanged; deal ${fmt(s.stored_score)} -> ${fmt(s.result.deal_score)} = ${fmt(actual)}, expected ${fmt(expected)}`,
    );
    const miss = Math.abs(actual - expected);
    const exact = miss < EPS;
    const used = !exact && miss <= ROUNDING_ALLOWANCE + EPS;
    if (used) detail.push(`off by ${fmt(round(actual - expected))} — within the ±${ROUNDING_ALLOWANCE} rounding allowance, counted as VERSION (typical)`);
    else if (!exact) detail.push(`the move is ${fmt(round(actual - expected))} away from the expected one — beyond the ±${ROUNDING_ALLOWANCE} rounding allowance`);
    // `reSourced` already required the price row to hold, so the identity is the only thing left to pass.
    return { ok: exact || used, sub: "typical", detail, constant, km_term, used_allowance: used };
  }
  const constant = round(oldTypical - newTypical);
  const km_term = round((newKm ?? 0) - (oldKm ?? 0));
  const expected = round(constant + km_term);
  const actual = round(s.result.deal_score - s.stored_score);
  detail.push(
    `typical ${fmt(oldTypical)} -> ${fmt(newTypical)} (cell constant ${fmt(constant)}); ` +
      `km row ${fmt(oldKm)} -> ${fmt(newKm)} (${fmt(km_term)}, slope_source ${String(curRow("km")?.raw?.slope_source ?? "-")}); ` +
      `deal ${fmt(s.stored_score)} -> ${fmt(s.result.deal_score)} = ${fmt(actual)}, expected ${fmt(expected)}`,
  );
  // detail.length === 1 means neither the price nor the history row moved: those two lines come first.
  const rowsHeld = detail.length === 1;
  const miss = Math.abs(actual - expected);
  const exact = miss < EPS;
  const used_allowance = !exact && miss <= ROUNDING_ALLOWANCE + EPS;
  if (used_allowance) {
    detail.push(`off by ${fmt(round(actual - expected))} — within the ±${ROUNDING_ALLOWANCE} rounding allowance (v2 rounded twice, v3 rounds once), counted as VERSION`);
  } else if (!exact) {
    detail.push(`the move is ${fmt(round(actual - expected))} away from the expected one — beyond the ±${ROUNDING_ALLOWANCE} rounding allowance`);
  }
  return { ok: rowsHeld && (exact || used_allowance), sub: null, detail, constant, km_term, used_allowance: rowsHeld && used_allowance };
}
/** Q13: the label a passing check carries. */
export const versionLabel = (v: VersionCheck): Label => (v.sub === null ? "VERSION" : (`VERSION (${v.sub})` as Label));

// ---------- Day 17 run 4 §2: the composed norm identity ----------
export type Triple = { score: number | null; condition_score: number | null; confidence: string | null };
const triple = (r: Invoice): Triple => ({ score: r.deal_score, condition_score: r.condition_score, confidence: r.confidence?.level ?? null });
const showTriple = (t: Triple) => `${fmt(t.score)} / ${fmt(t.condition_score)} / ${t.confidence ?? "-"}`;

// Day 17 run 5 §3 — which of the three norm rows the OLD score actually READ.
// The rule: the cell row always; the slope row only when that score used the model slope (n at or above
// the floor) rather than the default; the anchor row only when that score's price row came from the
// anchor (a thin cell). Both facts are recorded in the stored invoice itself, so nothing has to be
// derived from the pointed rows and the floor constant:
//   anchor read <=> the price row is marked vs_new_price. price.ts writes note 'vs_new_price' together
//                   with source 'anchor' on the thin-cell anchor path, and writes neither anywhere else;
//                   either mark is accepted so an older invoice that carried only one still reads right.
//   slope read  <=> the km row's raw.slope_source is 'model'. km.ts's slopeFor() writes 'model' exactly
//                   when km_slope is present and km_slope_n >= KM_SLOPE_MIN_SAMPLE, 'default' otherwise,
//                   and it writes the mark on an unavailable km row too.
// A missing invoice can claim only the row every score reads.
export function readNormKinds(bd: StoredBreakdown | null): NormKind[] {
  const read = new Set<NormKind>(["median"]);
  if (bd !== null) {
    const price = bd.rows?.find((r) => r.row === "price");
    const km = bd.rows?.find((r) => r.row === "km");
    if (price?.note === "vs_new_price" || price?.source === "anchor") read.add("anchor");
    if (km?.raw?.slope_source === "model") read.add("slope");
  }
  return NORM_KINDS.filter((k) => read.has(k)); // always in NORM_KINDS order
}
// Day 18 run 3c §13.2 (b): does a norm row's VALUE differ between two rows — the fields the norms run's skip-identical
// rule compares (compute-market-stats.ts §8): the cell's medians and set, the model's slope and its n, the pool's
// five curve values, its two counts and anchor_points (sameAnchorPoints, 6 dp). Two pool rows that both predate
// anchor_points (null) carry the same — no — points. A row on one side only differs.
const bothNullPoints = (a: AnchorPoint[] | null, b: AnchorPoint[] | null) => a === null && b === null;
export function normValuesDiffer(kind: NormKind, a: NormRows, b: NormRows): boolean {
  if (kind === "median") {
    const s = a.median, c = b.median;
    if (s === null || c === null) return s !== c;
    return s.median_price !== c.median_price || s.median_km !== c.median_km || s.median_history !== c.median_history ||
      s.sample_size !== c.sample_size || s.window_days !== c.window_days;
  }
  if (kind === "slope") {
    const s = a.slope, c = b.slope;
    if (s === null || c === null) return s !== c;
    return s.km_slope !== c.km_slope || s.km_slope_n !== c.km_slope_n;
  }
  const s = a.anchor, c = b.anchor;
  if (s === null || c === null) return s !== c;
  const points = bothNullPoints(s.anchor_points, c.anchor_points) ||
    (c.anchor_points !== null && sameAnchorPoints(s.anchor_points, c.anchor_points));
  return s.anchor_ratio_intercept !== c.anchor_ratio_intercept || s.anchor_ratio_per_year !== c.anchor_ratio_per_year ||
    s.anchor_error_pct !== c.anchor_error_pct || s.anchor_age_min_years !== c.anchor_age_min_years ||
    s.anchor_age_max_years !== c.anchor_age_max_years || s.anchor_n !== c.anchor_n || s.anchor_listings !== c.anchor_listings ||
    !points;
}

/** Why a row that moved is not named — the half of the rule that kept it out. */
function notReadBecause(kind: NormKind): string {
  if (kind === "slope") return "the stored score's km row used the default slope, not the model slope";
  if (kind === "anchor") return "the stored score's price row came from the cell, not the anchor";
  return "the stored score did not read the cell row";
}

/** One line describing how one of the three rows moved, stored -> current. */
function describeMove(kind: NormKind, x: RegressionInput): string {
  const a = normId(x.stored.norms, kind), b = normId(x.norms, kind);
  if (kind === "median") {
    const s = x.stored.norms.median, c = x.norms.median;
    const sameSet = s !== null && c !== null && s.sample_size === c.sample_size && s.window_days === c.window_days;
    return (
      `cell row market_stats ${num(a)} -> ${num(b)}: ` +
      `median_price ${num(s?.median_price)} -> ${num(c?.median_price)}, median_km ${num(s?.median_km)} -> ${num(c?.median_km)}, ` +
      `median_history ${num(s?.median_history)} -> ${num(c?.median_history)}; ` +
      `sample_size ${num(s?.sample_size)} -> ${num(c?.sample_size)}, window_days ${num(s?.window_days)} -> ${num(c?.window_days)}` +
      (sameSet ? " - the same set, different medians" : "")
    );
  }
  if (kind === "slope") {
    const s = x.stored.norms.slope, c = x.norms.slope;
    return (
      `model row model_stats ${num(a)} -> ${num(b)} (${x.make} ${x.model}): ` +
      `km_slope ${num(s?.km_slope)} -> ${num(c?.km_slope)}, km_slope_n ${num(s?.km_slope_n)} -> ${num(c?.km_slope_n)} ` +
      `(floor ${KM_SLOPE_MIN_SAMPLE}; slope_source now ${String(x.result.rows.find((r) => r.row === "km")?.raw?.slope_source ?? "-")})`
    );
  }
  const s = x.stored.norms.anchor, c = x.norms.anchor;
  return (
    `pool row pool_stats ${num(a)} -> ${num(b)}: ` +
    `anchor_ratio_intercept ${num(s?.anchor_ratio_intercept)} -> ${num(c?.anchor_ratio_intercept)}, ` +
    `anchor_ratio_per_year ${num(s?.anchor_ratio_per_year)} -> ${num(c?.anchor_ratio_per_year)}, ` +
    `anchor_error_pct ${num(s?.anchor_error_pct)} -> ${num(c?.anchor_error_pct)}, ` +
    `anchor_n ${num(s?.anchor_n)} -> ${num(c?.anchor_n)}`
  );
}

/**
 * The composed identity. Every norm row the stored score used that is not the row the current score used
 * is named; the engine is re-run with ALL of them at the stored clock, and the label is given only when
 * that reproduces the stored score exactly. Otherwise nothing is returned and the attempt is printed.
 */
export function composedNorm(x: RegressionInput, sto: Triple): { hit: { label: Label; detail: string[] } | null; tried: string[] } {
  const when = x.stored.scored_at;
  if (when === null) return { hit: null, tried: [] };
  if (x.stored.missing.length > 0) {
    return {
      hit: null,
      tried: [`the ${x.stored.missing.join(", ")} row(s) the stored score points at are no longer in their table — the identity cannot be checked`],
    };
  }
  const differ = NORM_KINDS.filter((k) => normId(x.stored.norms, k) !== normId(x.norms, k));
  if (differ.length === 0) return { hit: null, tried: [] };

  // §3: the label names only the rows that BOTH differ and were read by the old score. The test below is
  // untouched — it still recomputes once with all three stored rows — and a row that moved unread is
  // still printed, marked with why the rule does not name it.
  // Run 3c §13.2 (b): a row is named by its VALUES; a pointer that moved onto identical values names nothing.
  const read = readNormKinds((x.stored.breakdown ?? null) as StoredBreakdown | null);
  const valued = differ.filter((k) => normValuesDiffer(k, x.stored.norms, x.norms));
  const named = valued.filter((k) => read.includes(k));
  const label = named.length > 0 ? normLabel(named) : null;
  const moved = differ.map((k) =>
    describeMove(k, x) +
      (named.includes(k) ? "" : !valued.includes(k) ? " - not named: a new row with the same values" : ` - not named: ${notReadBecause(k)}`),
  );
  const ids = NORM_KINDS.map((k) => `${k} ${num(normId(x.stored.norms, k))}`).join(", ");
  const got = triple(x.scoreWith(x.stored.norms, when));
  if (same(got, sto)) {
    if (label === null) {
      // The identity holds, but every row that moved is one the old score never read. The rule names no
      // row and there is no label for that, so nothing is claimed: the line stays UNEXPLAINED and says
      // exactly this. Never silently widened back to the rows that moved.
      return {
        hit: null,
        tried: [
          ...moved,
          `the identity holds (recomputed with the STORED norm rows (${ids}) at ${when.toISOString()} -> ${showTriple(got)} = the stored values), ` +
            `but no row that moved was read by the stored score, so the rule names none and no NORM (...) label is given`,
        ],
      };
    }
    return {
      hit: {
        label,
        detail: [
          ...moved,
          `identity: recomputed with the STORED norm rows (${ids}) at the stored scored_at ${when.toISOString()} -> ${showTriple(got)} = the stored values`,
        ],
      },
      tried: [],
    };
  }
  return {
    hit: null,
    tried: [
      ...moved,
      `${label ?? `NORM (no row read)`}: recomputed with the stored norm rows (${ids}) at ${when.toISOString()} -> ${showTriple(got)}, not the stored ${showTriple(sto)} - the identity does not hold`,
    ],
  };
}

// ---------- Day 18 run 3c §13: the version rule ----------
// The declared identities for an engine move that is not reproduced by recomputation, keyed by the pair.
// (2, 3) is Day 14 §6.3's; no other pair has one — v4 changed no formula.
export const DECLARED_VERSION_PAIRS: readonly (readonly [number, number])[] = [[2, 3]];
const hasDeclaredIdentity = (from: number, to: number) => DECLARED_VERSION_PAIRS.some(([f, t]) => f === from && t === to);
// The first engine whose invoices can carry the confidence item color_mismatch (Day 18 §9).
export const COLOR_MISMATCH_FROM_ENGINE = 4;

/** A price row that is the anchor's — the mark readNormKinds() reads, on either invoice. */
function anchorPriceRow(rows: { row?: string; note?: string; source?: string }[] | undefined): boolean {
  const p = rows?.find((r) => r.row === "price");
  return p?.note === "vs_new_price" || p?.source === "anchor";
}

/** §13.2 (d): the stored rows as the recomputation reads them — a pre-v4 pool row gets its points from the record. */
export function recomputationNorms(x: RegressionInput, bd: StoredBreakdown | null): { norms: NormRows; note: string | null } {
  const pool = x.stored.norms.anchor;
  if (pool === null || pool.anchor_points !== null) return { norms: x.stored.norms, note: null };
  const { make, model, year } = x.input.car;
  if (bd !== null && anchorPriceRow(bd.rows)) {
    const raw = bd.rows?.find((r) => r.row === "price")?.raw ?? {};
    // n / ratio / median_age are recorded by the engine into raw.anchor_point and read by nothing that is scored.
    const point: AnchorPoint = {
      make, model, year, n: 0,
      ratio: typeof raw.ratio === "number" ? raw.ratio : 0,
      median_age: typeof raw.age === "number" ? raw.age : 0,
    };
    return {
      norms: { ...x.stored.norms, anchor: { ...pool, anchor_points: [point] } },
      note: `pre-v4 pool row pool_stats ${pool.id} (anchor_points null): the stored invoice's price row is the anchor's, so the recomputation reads a synthetic point ${make} ${model} ${year} (the curve is that row's own)`,
    };
  }
  return {
    norms: { ...x.stored.norms, anchor: { ...pool, anchor_points: [] } },
    note: `pre-v4 pool row pool_stats ${pool.id} (anchor_points null): the stored invoice has no anchor price row, so the recomputation reads no point`,
  };
}

type Reproduction = { ok: boolean; allowance: boolean; colorOnly: boolean };
function reproduction(got: Invoice, sto: Triple, storedEngine: number): Reproduction {
  const t = triple(got);
  const near = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) <= ROUNDING_ALLOWANCE + EPS);
  const exact = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < EPS);
  const numbers = near(t.score, sto.score) && near(t.condition_score, sto.condition_score);
  const allowance = numbers && !(exact(t.score, sto.score) && exact(t.condition_score, sto.condition_score));
  if (!numbers) return { ok: false, allowance: false, colorOnly: false };
  if (t.confidence === sto.confidence) return { ok: true, allowance, colorOnly: false };
  // §13.2 (f): a stored score from before COLOR_MISMATCH_FROM_ENGINE could not carry that item. If removing it gives
  // the stored level, the confidence move is the version's.
  if (storedEngine < COLOR_MISMATCH_FROM_ENGINE && got.confidence !== null) {
    const items = got.confidence.items;
    const withoutColor = items.filter((i) => i.kind !== "color_mismatch").length;
    if (withoutColor < items.length && confidenceLevel(withoutColor) === sto.confidence) return { ok: true, allowance, colorOnly: true };
  }
  return { ok: false, allowance: false, colorOnly: false };
}

function versionRule(x: RegressionInput, sto: Triple, bd: StoredBreakdown | null, head: string): Classified {
  const from = x.stored.engine_version as number;
  const to = x.engine_version;
  const when = x.stored.scored_at as Date;
  const detail: string[] = [`stored engine_version ${from} -> ${to}`];
  const declared = () => {
    // (c): the declared identity for the pair, unchanged.
    const v = versionExpectation({ stored_score: x.stored.score, result: x.result, input: x.input }, bd);
    for (const d of v.detail) detail.push(d);
    return { label: v.ok ? versionLabel(v) : ("UNEXPLAINED" as Label), head, detail };
  };
  const undeclared = () => {
    detail.push(`engine moved a listing; no declared identity for v${from} → v${to}`);
    return { label: "UNEXPLAINED" as Label, head, detail };
  };

  if (x.stored.missing.length > 0) {
    detail.push(`the ${x.stored.missing.join(", ")} row(s) the stored score points at are no longer in their table — the recomputation cannot be run`);
    return hasDeclaredIdentity(from, to) ? declared() : undeclared();
  }
  const { norms, note } = recomputationNorms(x, bd);
  if (note !== null) detail.push(note);
  const ids = NORM_KINDS.map((k) => `${k} ${num(normId(x.stored.norms, k))}`).join(", ");
  const got = x.scoreWith(norms, when);
  const rep = reproduction(got, sto, from);
  if (!rep.ok) {
    detail.push(`recomputed with the current engine and the STORED norm rows (${ids}) at ${when.toISOString()} -> ${showTriple(triple(got))}, not the stored ${showTriple(sto)}`);
    return hasDeclaredIdentity(from, to) ? declared() : undeclared();
  }

  // (b): the names. Rows read by the stored score whose values differ from the rows the current score used.
  const read = readNormKinds(bd);
  const names: VersionName[] = [];
  for (const k of NORM_KINDS) {
    if (!normValuesDiffer(k, x.stored.norms, x.norms)) continue;
    if (read.includes(k)) names.push(k);
    detail.push(describeMove(k, x) + (read.includes(k) ? "" : ` - not named: ${notReadBecause(k)}`));
  }
  const oldAnchor = bd !== null && anchorPriceRow(bd.rows);
  const newAnchor = anchorPriceRow(x.result.rows);
  if (oldAnchor !== newAnchor) {
    names.push("anchor gate");
    detail.push(`anchor gate: a vs_new_price price row in the ${oldAnchor ? "stored" : "current"} invoice only`);
  }
  if (rep.colorOnly) {
    names.push("confidence: color");
    detail.push(`confidence ${sto.confidence ?? "-"} -> ${triple(got).confidence ?? "-"}: the only move is the item color_mismatch, which engine ${from} could not record`);
  }
  detail.push(`identity: recomputed with the current engine and the STORED norm rows (${ids}) at the stored scored_at ${when.toISOString()} -> ${showTriple(triple(got))} = the stored values`);
  if (rep.allowance) detail.push(`reproduced within the ±${ROUNDING_ALLOWANCE} rounding allowance, not exactly`);
  return { label: versionNamedLabel(names), head, detail };
}

// ---------- the classifier ----------
/**
 * One listing -> one labelled line, or null when the stored and the recomputed score agree (no line).
 * First match wins; the order is the one Day 13 §1 fixed, Day 14 / Day 17 extended and Day 18 run 3c §13.2 (e)
 * set for a version write: NEW, DATA, the version rule, then CLOCK / DATA / NORM / UNEXPLAINED as before.
 */
export function classify(x: RegressionInput): Classified | null {
  const cur: Triple = triple(x.result);
  const sto: Triple = { score: x.stored.score, condition_score: x.stored.condition_score, confidence: x.stored.confidence };
  const head = `score ${fmt(sto.score)} -> ${fmt(cur.score)}; condition_score ${fmt(sto.condition_score)} -> ${fmt(cur.condition_score)}; confidence ${sto.confidence ?? "-"} -> ${cur.confidence}`;
  const detail: string[] = [];
  const bd = (x.stored.breakdown ?? null) as StoredBreakdown | null;

  if (x.stored.scored_at === null) {
    detail.push(`no stored score at all (scored_at null, engine_version ${x.stored.engine_version ?? "null"}): first scoring`);
    return { label: "NEW", head, detail };
  }
  const dataDiffs = bd === null ? [] : diffMaps(storedInputs(bd), currentInputs(x.input));
  if (x.stored.engine_version !== null && x.stored.engine_version !== x.engine_version) {
    // §13.2 (e): a listing whose inputs changed is DATA, version change or not — not put through the version rule.
    if (dataDiffs.length) {
      detail.push(`stored engine_version ${x.stored.engine_version} -> ${x.engine_version}`);
      for (const d of dataDiffs) detail.push(`input ${d}`);
      return { label: "DATA", head, detail };
    }
    return versionRule(x, sto, bd, head);
  }
  if (same(sto, cur)) return null; // stored and recomputed agree — no line

  // CLOCK: the same inputs and the same norm rows, only `now` moved back to scored_at.
  const then = triple(x.scoreWith(x.norms, x.stored.scored_at));
  const normDiffs = bd === null ? [] : diffMaps(storedNorm(bd), currentNorm(x.input.market));
  const cellMoved = normDiffs.some((d) => d.startsWith("sample_size") || d.startsWith("window_days") || d.startsWith("market_row"));
  if (same(then, sto)) {
    detail.push(`recomputed with now = stored scored_at ${x.stored.scored_at.toISOString()}: ${showTriple(then)} = the stored values (same inputs, same norm row as today)`);
    return { label: "CLOCK", head, detail };
  }
  if (dataDiffs.length) {
    for (const d of dataDiffs) detail.push(`input ${d}`);
    return { label: "DATA", head, detail };
  }
  if (normDiffs.length && cellMoved) {
    for (const d of normDiffs) detail.push(`norm ${d}`);
    return { label: "NORM", head, detail };
  }
  // Day 17 run 4 §2: before calling it unexplained, the composed identity — ONE recomputation with every
  // stored norm row at the stored clock. It has to reproduce the stored score, or it does not count.
  const named = composedNorm(x, sto);
  if (named.hit !== null) {
    for (const d of named.hit.detail) detail.push(d);
    return { label: named.hit.label, head, detail };
  }
  if (bd === null) detail.push(`the stored breakdown is null: neither DATA nor NORM could be checked`);
  detail.push(`at the stored scored_at ${x.stored.scored_at.toISOString()}: ${showTriple(then)} - not the stored values`);
  for (const d of normDiffs) detail.push(`norm ${d} (same sample_size and window_days: same set, different norm)`);
  for (const t of named.tried) detail.push(t);
  return { label: "UNEXPLAINED", head, detail };
}
