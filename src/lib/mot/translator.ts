// The ministry writes Hebrew; the code speaks English codes (schema, part E).
// Every translation from a ministry value to a code happens here and nowhere else.

export type OwnershipCode = "private" | "company" | "rental" | "leasing" | "dealer";

const OWNERSHIP: Record<string, OwnershipCode> = {
  "פרטי": "private",
  "חברה": "company",
  "השכרה": "rental",
  "ליסינג": "leasing", // registry spelling
  "החכר": "leasing",   // history-2 spelling
  "סוחר": "dealer",
};

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
function clean(s: string): string {
  return (s ?? "").replace(/["״׳']/g, "").replace(/\s+/g, " ").trim();
}