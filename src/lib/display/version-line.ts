// The version line (BRIEF Run 6b §8.3, wording approved in §2) — the grey line under the car's name on the
// car page: "{מרכב} · {נפח} ליטר · {תיבה}[ · היברידי] · גימור {שם}".
//
// DISPLAY ONLY. The database keeps the stored values exactly as they are, and the engine, the norms and the
// cells keep reading them: nothing here exists for them (§2). These are lookup tables and pure functions,
// applied at render time and nowhere else — no comparison anywhere in the codebase reads a string from here.
//
// The standing fallback of every table below is THE STORED VALUE, uppercase and all (§2.1). A value that is
// not in a table is never invented and never guessed; where the brief says a code outside the table has no
// word at all (§2.5's gearbox, like §2.7's seller type), the segment is left out rather than printed raw.
// §10's readback is what surfaces such a row.

/** The four inputs of a version line, as `models` stores them. */
export type VersionLineInput = {
  model: string | null; // models.model — the ONLY place the hybrid fact lives (§2.3)
  body_type: string | null; // models.body_type
  engine_size: number | null; // models.engine_size, cc
  transmission: string | null; // models.transmission — code: auto | manual
  sub_model: string | null; // models.sub_model — the trim as the registry truncated it
  vehicle_class: string | null; // models.vehicle_class — 'P' private | 'M' commercial
};

// §2.1 — the trim completion table: the registry truncates ramat_gimur to 12 characters, and exactly two
// live values are cut by it. EVERY other stored trim renders exactly as stored, `FL` suffix and all.
export const TRIM_COMPLETION: Readonly<Record<string, string>> = {
  "BLACK EDITIO": "BLACK EDITION",
  "100TH ANNIVE": "100TH ANNIVERSARY",
};

// §2.4 — the body word. `הצ'בק` as the catalog stores it is missing its alef; `סדאן` is already right.
// Anything else renders as stored.
export const BODY_WORD: Readonly<Record<string, string>> = {
  "הצ'בק": "האצ'בק",
};

// §2.5 — the gearbox. Only `auto` occurs live; both words are here because the line needs both.
export const GEARBOX_WORD: Readonly<Record<string, string>> = {
  auto: "אוטומט",
  manual: "ידני",
};

const HYBRID = "היברידי"; // §2.3
const LITERS = "ליטר"; // §2.2
const TRIM = "גימור"; // §2.6
const COMMERCIAL = "מסחרי"; // §2.6 — the prefix of vehicle_class 'M'
const COMMERCIAL_CLASS = "M";
const SEPARATOR = " · ";

/**
 * §2.2 — cc to liters: `round(cc / 100) / 10`, standard rounding, ALWAYS one decimal.
 * 1998 → "2.0", 1580 → "1.6". The exact cc is shown nowhere in this run.
 */
export function liters(cc: number): string {
  return (Math.round(cc / 100) / 10).toFixed(1);
}

/**
 * §2.3 — "היברידי" is derived from the model name and from nothing else: `models.model` contains the word
 * HYBRID. `fuel_type` stores "בנזין" for both live models, the hybrid one included, and is NOT used for this.
 */
export function isHybrid(model: string | null): boolean {
  return model !== null && /\bHYBRID\b/.test(model.toUpperCase());
}

/**
 * §2.1 — the trim as it is displayed: the completion table, with the stored value as the standing fallback.
 * This is the plan's "טבלת השלמת שמות הגימור".
 */
export function trimName(sub_model: string): string {
  return TRIM_COMPLETION[sub_model] ?? sub_model;
}

/** §2.4 — the body word: the table, with the stored value as the fallback. */
export function bodyWord(body_type: string): string {
  return BODY_WORD[body_type] ?? body_type;
}

/**
 * §2.6 — the assembled line: "{מרכב} · {נפח} ליטר · {תיבה}[ · היברידי] · גימור {שם}", prefixed "מסחרי · "
 * when `vehicle_class` is 'M' (no live case; the rule stands as written).
 *
 * A segment whose stored value is null — or, for the gearbox, a code outside §2.5's table — is LEFT OUT.
 * None of these occurs in the live pool (§1 found no null in any of the six fields), and leaving the segment
 * out is the one behaviour that neither invents a word nor prints a raw code.
 */
export function versionLine(v: VersionLineInput): string {
  const parts: string[] = [];
  if (v.vehicle_class === COMMERCIAL_CLASS) parts.push(COMMERCIAL);
  if (v.body_type !== null) parts.push(bodyWord(v.body_type));
  if (v.engine_size !== null) parts.push(`${liters(v.engine_size)} ${LITERS}`);
  if (v.transmission !== null && Object.hasOwn(GEARBOX_WORD, v.transmission)) parts.push(GEARBOX_WORD[v.transmission]);
  if (isHybrid(v.model)) parts.push(HYBRID); // §2.3 — between the gearbox and the trim
  if (v.sub_model !== null) parts.push(`${TRIM} ${trimName(v.sub_model)}`);
  return parts.join(SEPARATOR);
}
