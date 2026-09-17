// The ministry writes Hebrew; the code speaks English codes (schema, part E).
// Every translation from a ministry value to a code happens here and nowhere else.

export type OwnershipCode = "private" | "company" | "rental" | "leasing" | "dealer";
// The codes as a list — a stored code (cars.current_owner_type, Day 18) is checked against it, never trusted.
export const OWNERSHIP_CODES: readonly OwnershipCode[] = ["private", "company", "rental", "leasing", "dealer"];

const OWNERSHIP: Record<string, OwnershipCode> = {
  "פרטי": "private",
  "חברה": "company",
  "השכרה": "rental",
  "ליסינג": "leasing", // registry spelling
  "החכר": "leasing",   // history-2 spelling
  "סוחר": "dealer",
};

// Day 18 (§3.1, §7): the one mapping for both files — history 2's rows and the registry's current holder
// (cars.current_owner_type). No word of its own for the registry: the cache holds only פרטי / סוחר / ליסינג / חברה.
export function ownershipCode(raw: string): OwnershipCode {
  const key = clean(raw);
  if (!Object.hasOwn(OWNERSHIP, key)) {
    throw new Error(`ownership: unknown ministry value ${JSON.stringify(raw)}`);
  }
  return OWNERSHIP[key];
}

export type OriginCode =
  | "regular" | "rental" | "leasing" | "leasing_rental" | "driving_school" | "touring"
  | "government" | "diplomatic" | "personal_import" | "personal_import_used" | "importer_used";

const ORIGIN: Record<string, OriginCode> = {
  "": "regular",
  "השכרה": "rental",
  "החכר": "leasing",
  "החכר-השכרה": "leasing_rental",
  "ביס לנהיגה": "driving_school", // the ministry's value carries a stray quote; clean() removes it
  "סיור ותיור": "touring",
  "מדינת ישראל": "government",
  "דפלומטי": "diplomatic",
  "יבוא אישי": "personal_import",
  "יבוא אישי-משומש": "personal_import_used",
  "משומש מיבואן": "importer_used",
};

export function originCode(raw: string): OriginCode {
  const key = clean(raw);
  if (!Object.hasOwn(ORIGIN, key)) {
    throw new Error(`origin: unknown ministry value ${JSON.stringify(raw)}`);
  }
  return ORIGIN[key];
}

// Trim, drop quote marks, collapse spaces — the ministry's spelling noise stops here.
// Exported for the colour dictionary (Day 18, §3.2), which looks words up after the same cleaning.
export function clean(s: string): string {
  return (s ?? "").replace(/["״׳']/g, "").replace(/\s+/g, " ").trim();
}