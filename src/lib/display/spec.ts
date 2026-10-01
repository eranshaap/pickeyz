// The "מפרט ואבזור" section (BRIEF Day 19b Run 18 §2) — the section's words and its logic, in one pure
// module. The component below it (src/components/car/SpecSection.tsx) is a renderer: it receives the rows
// already built and decides nothing.
//
// DISPLAY ONLY (§2). Nothing here is ever compared against: the engine, the norms, the cells and the
// selection rules read the STORED values and know nothing about any string in this file.
//
// Every Hebrew word of the section lives here — the heading alone is in texts.ts, next to the page's two
// other section headings. The body word, the gearbox word and the cc-to-liters conversion are the VERSION
// LINE's mapping, imported from it: one spelling of the body word and one of the gearbox word on the site,
// never a second copy. Nothing here reads `models.model`: the version line's isHybrid() stays the version
// line's, and this section's technology word comes from `drive_technology`, the catalog's own column.

import { FUEL_CO2_G_PER_LITER_DIESEL, FUEL_CO2_G_PER_LITER_PETROL, RANGE_ROUND_KM } from "./constants";
import { num } from "./texts";
import { bodyWord, GEARBOX_WORD, liters } from "./version-line";

// ---------------------------------------------------------------------------
// §2.1 — the types
// ---------------------------------------------------------------------------

export type FuelKind = "petrol" | "diesel";

/** The 15 catalog flags — OUR column names — in the section's display order: 1–12 the systems row, 13–15 the equipment row. Labels = the texts table. */
export const SYSTEM_FLAGS = [
  ["aeb_pedestrian_cyclist", "בלימת חירום מול הולכי רגל ורוכבי אופניים"],
  ["pedestrian_detection", "זיהוי הולכי רגל"],
  ["two_wheeler_detection", "זיהוי רוכבי אופנוע ואופניים"],
  ["forward_collision_warning", "התרעה על התקרבות מסוכנת לרכב שלפנים"],
  ["distance_monitoring", "ניטור מרחק מהרכב שלפנים"],
  ["lane_departure_warning", "התרעה על סטייה מנתיב"],
  ["lane_keeping", "שמירה אקטיבית על הנתיב"],
  ["blind_spot_detection", "זיהוי רכב בשטח המת"],
  ["adaptive_cruise", "בקרת שיוט אדפטיבית"],
  ["traffic_sign_recognition", "זיהוי תמרורים"],
  ["auto_high_beams", "אורות גבוהים אוטומטיים"],
  ["reverse_auto_braking", "בלימה אוטומטית בנסיעה לאחור"],
] as const;
export const EQUIPMENT_FLAGS = [
  ["sunroof", "חלון גג"],
  ["alloy_wheels", "חישוקי סגסוגת"],
  ["reverse_camera", "מצלמת רוורס"],
] as const;
type FlagName = (typeof SYSTEM_FLAGS)[number][0] | (typeof EQUIPMENT_FLAGS)[number][0];

/** The `models` row of the car's OWN version (code and year), as page.tsx selects it (§6.1). Never the comparison group's. */
export type SpecModelInput = {
  engine_size: number | null; // cc
  horsepower: number | null;
  fuel_type: string | null; // catalog delek_nm: "בנזין" | "דיזל" | "חשמל/בנזין" | "חשמל/דיזל" | other
  transmission: string | null; // code: auto | manual
  drive_type: string | null; // "4X2" | "4X4"
  drive_technology: string | null; // code: regular | hybrid | plug_in | electric
  body_type: string | null;
  doors: number | null;
  seats: number | null;
  airbags: number | null; // null = the row has no catalog spec data at all
  safety_rating: number | null; // 0–8
  co2_wltp: number | null; // g/km; null = the version did not take the WLTP test
} & Record<FlagName, boolean | null>;

/** The manual-spec row behind models.model_spec_id — null until the sheet import gives the version one. */
export type SpecSheetInput = {
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  trunk_liters: number | null;
  tank_liters: number | null;
  km_per_liter: number | null;
} | null;

/** One row of the section. `explanation` is non-null on exactly one row — the fuel row — and the component draws ExplainPhrase for it. */
export type SpecRow = { label: string; value: string; explanation: string | null };

// ---------------------------------------------------------------------------
// §2.2 — the words
// ---------------------------------------------------------------------------

/** The nine labels, in display order. The row order of specRows() IS this order. */
export const SPEC_LABELS = [
  "צריכת דלק וטווח",
  "כריות אוויר",
  "מערכות עזר לנהג",
  "רמת אבזור בטיחותי",
  "אבזור",
  "מנוע",
  "מרכב",
  "מידות",
  "תא מטען",
] as const;

/** The answer to "which systems does it have", when it has none. It is never the answer to "is there data": a row with no data is not drawn. */
export const NONE_WORD = "אין";

/**
 * ONE table for the five engine words: the engine row reads its technology word and its fuel word from it,
 * and the sheet import (a later run) translates the manual-spec tab's "סוג מנוע" with the same five words.
 *
 * The engine-type CODE function — matching a `models` row to a manual-spec row, and the alert line — is NOT
 * here: Eran's ruling (01/10) is that it is written in the sheet-import run, its only caller, and checked
 * there against the data.
 */
export const ENGINE_TYPE_WORD: Readonly<Record<FuelKind | "hybrid" | "plug_in" | "electric", string>> = {
  petrol: "בנזין",
  diesel: "דיזל",
  hybrid: "היברידי",
  plug_in: "היברידי נטען",
  electric: "חשמלי",
};

/**
 * The catalog's `fuel_type` text → the fuel. THE FUEL IS ALWAYS READ FROM THIS COLUMN, never from the
 * technology: the catalog holds diesel hybrids and diesel plug-ins, and a litre of petrol and a litre of
 * diesel are different numbers of grams.
 */
export const FUEL_KIND: Readonly<Record<string, FuelKind>> = {
  "בנזין": "petrol",
  "חשמל/בנזין": "petrol",
  "דיזל": "diesel",
  "חשמל/דיזל": "diesel",
};

/** The catalog's `drive_type` → the word. A value outside the table has no word and the part is left out. */
export const DRIVE_WORD: Readonly<Record<string, string>> = {
  "4X2": "הנעה לשני גלגלים",
  "4X4": "הנעה לארבעה גלגלים",
};

/** One wording, whatever the consumption's source — the ministry's CO2 figure or the manual spec's own number. */
export const FUEL_EXPLANATION =
  "צריכת דלק וטווח — הצריכה הרשמית של הדגם בבדיקת התקן, והטווח הוא נפח מיכל הדלק כפול הצריכה. אלה נתוני מעבדה להשוואה בין רכבים: בכביש הצריכה בדרך כלל גבוהה יותר והטווח קצר יותר.";

// The unit words, and the separator between the parts of one value — the version line's own " · ".
const SEPARATOR = " · ";
const LITERS = "ליטר";
const HORSEPOWER = "כ״ס";
const DOORS = "דלתות";
const SEATS = "מושבים";
const MM = "מ״מ";
const KM_PER_LITER = "ק״מ לליטר";
const KM_PER_TANK = "ק״מ למיכל";
const OF = "מתוך";
const LENGTH = "אורך";
const WIDTH = "רוחב";
const HEIGHT = "גובה";
const ABOUT = "כ-"; // the range is rounded to RANGE_ROUND_KM, so it is spoken as an approximation

/** The ministry's safety-equipment scale — a fact of the measurement, like MONTHS_PER_YEAR, not a ledger line. */
const SAFETY_SCALE = 8;

// ---------------------------------------------------------------------------
// §2.3 — the functions
// ---------------------------------------------------------------------------

/**
 * A number that is actually there. Every number this section shows is missing when it is null AND when it is
 * 0 — a 0 cc displacement, 0 horsepower, 0 doors, 0 seats, a 0 CO2 figure, a 0 tank, a 0 trunk and a 0
 * dimension are all "no figure", in the catalog and in the sheet alike (§2.4). `airbags` and `safety_rating`
 * are the two exceptions and carry their own rules, below.
 */
function has(n: number | null): n is number {
  return n !== null && n > 0;
}

/** §2.3 — one decimal, half up. */
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** A text value that is actually there: null and the empty string are both missing. */
function hasText(s: string | null): s is string {
  return s !== null && s !== "";
}

/**
 * (a) §2.3 — the catalog's fuel text → the fuel, or null for anything else (null included). Exact strings:
 * the catalog translation (src/lib/mot/catalog.ts) already trims.
 */
export function fuelKind(fuel_type: string | null): FuelKind | null {
  if (fuel_type === null) return null;
  return FUEL_KIND[fuel_type] ?? null;
}

/**
 * (b) §2.3 — the consumption the section shows, km per liter, one decimal.
 *
 * THE MINISTRY'S NUMBER ALWAYS WINS, and when the ministry has a number but we cannot name its fuel nothing
 * is shown at all — there is no fall-through to the manual figure (the plan's rule as written). A plug-in
 * and an electric car get no consumption row at all.
 */
export function kmPerLiter(model: SpecModelInput, spec: SpecSheetInput): number | null {
  if (model.drive_technology === "plug_in" || model.drive_technology === "electric") return null;
  if (has(model.co2_wltp)) {
    const kind = fuelKind(model.fuel_type);
    if (kind === null) return null;
    const gramsPerLiter = kind === "petrol" ? FUEL_CO2_G_PER_LITER_PETROL : FUEL_CO2_G_PER_LITER_DIESEL;
    return round1(gramsPerLiter / model.co2_wltp);
  }
  const manual = spec === null ? null : spec.km_per_liter;
  if (has(manual)) return round1(manual);
  return null;
}

/**
 * (c) §2.3 — the range: the tank times the SHOWN consumption, rounded to a multiple of RANGE_ROUND_KM, a tie
 * upwards. No tank, no range.
 *
 * INTEGER ARITHMETIC ONLY, because `21.9 * 45` in floating point is not exactly 985.5 and the rounding would
 * then turn on the bits: the consumption is taken in tenths of a km per liter, which makes the product an
 * integer number of tenths of a km. Worked: 219 × 45 = 9855; (9855 + 50) ÷ 100 = 99.05 → 99 → 9900 → 990.
 */
export function rangeKm(shownKmPerLiter: number, tankLiters: number | null): number | null {
  if (!has(tankLiters)) return null;
  const tenths = Math.round(shownKmPerLiter * 10) * tankLiters;
  const unit = RANGE_ROUND_KM * 10;
  return (Math.floor((tenths + unit / 2) / unit) * unit) / 10;
}

/** The labels of the flags that are fitted, in table order; none fitted → "אין". A null flag counts as not fitted. */
function flagLine(model: SpecModelInput, flags: readonly (readonly [FlagName, string])[]): string {
  const fitted = flags.filter(([name]) => model[name] === true).map(([, label]) => label);
  return fitted.length === 0 ? NONE_WORD : fitted.join(SEPARATOR);
}

/** The engine row's parts (§2.4 row 6) — the displacement, the power, the engine words, the gearbox, the drive. */
function engineParts(model: SpecModelInput): string[] {
  const parts: string[] = [];
  if (has(model.engine_size)) parts.push(`${liters(model.engine_size)} ${LITERS}`);
  if (has(model.horsepower)) parts.push(`${model.horsepower} ${HORSEPOWER}`);
  // An electric car's word stands IN PLACE OF both the technology and the fuel: "חשמלי" and nothing else.
  if (model.drive_technology === "electric") {
    parts.push(ENGINE_TYPE_WORD.electric);
  } else {
    // "regular", null — and any code outside the table — get no technology word, and none is invented.
    if (model.drive_technology === "hybrid") parts.push(ENGINE_TYPE_WORD.hybrid);
    else if (model.drive_technology === "plug_in") parts.push(ENGINE_TYPE_WORD.plug_in);
    const kind = fuelKind(model.fuel_type);
    if (kind !== null) parts.push(ENGINE_TYPE_WORD[kind]);
  }
  if (model.transmission !== null && Object.hasOwn(GEARBOX_WORD, model.transmission)) parts.push(GEARBOX_WORD[model.transmission]);
  if (model.drive_type !== null && Object.hasOwn(DRIVE_WORD, model.drive_type)) parts.push(DRIVE_WORD[model.drive_type]);
  return parts;
}

/**
 * (d) §2.3 — the section's rows, in SPEC_LABELS' order.
 *
 * THE ROWS THAT EXIST ARE THE ROWS THAT HAVE SOMETHING TO SAY. A part whose value is missing is left out; a
 * row left with no part is not returned at all. There is never an "אין נתון" and never an empty value —
 * that is the whole rule of the section (findCar-now.md, "המפרט — אין 'אין נתון'").
 *
 * `airbags === null` means the `models` row carries no catalog spec data at all, so there is nothing to draw
 * and the caller gets [] — the section is not drawn.
 */
export function specRows(model: SpecModelInput, spec: SpecSheetInput): SpecRow[] {
  if (model.airbags === null) return [];

  const rows: SpecRow[] = [];
  const row = (label: string, parts: string[], explanation: string | null = null) => {
    if (parts.length === 0) return;
    rows.push({ label, value: parts.join(SEPARATOR), explanation });
  };

  // 1 — the consumption, and the range when there is a tank. The one row that carries an explanation.
  const consumption = kmPerLiter(model, spec);
  if (consumption !== null) {
    const parts = [`${consumption.toFixed(1)} ${KM_PER_LITER}`];
    const range = rangeKm(consumption, spec === null ? null : spec.tank_liters);
    if (range !== null) parts.push(`${ABOUT}${num(range)} ${KM_PER_TANK}`);
    row(SPEC_LABELS[0], parts, FUEL_EXPLANATION);
  }

  // 2 — the airbags. 0 is no row.
  if (model.airbags > 0) row(SPEC_LABELS[1], [String(model.airbags)]);

  // 3, 5 — the two flag rows are ALWAYS returned: with nothing fitted they say "אין", which is an answer.
  row(SPEC_LABELS[2], [flagLine(model, SYSTEM_FLAGS)]);

  // 4 — the safety level. null is no row; 0 is a real reading on the ministry's scale and is shown.
  if (model.safety_rating !== null) row(SPEC_LABELS[3], [`${model.safety_rating} ${OF} ${SAFETY_SCALE}`]);

  row(SPEC_LABELS[4], [flagLine(model, EQUIPMENT_FLAGS)]);

  // 6, 7 — the engine and the body.
  row(SPEC_LABELS[5], engineParts(model));
  const body: string[] = [];
  if (hasText(model.body_type)) body.push(bodyWord(model.body_type));
  if (has(model.doors)) body.push(`${model.doors} ${DOORS}`);
  if (has(model.seats)) body.push(`${model.seats} ${SEATS}`);
  row(SPEC_LABELS[6], body);

  // 8, 9 — the manual spec's own two rows. No sheet row yet → neither is drawn.
  if (spec !== null) {
    // The unit is written ONCE, at the end of the whole value, and not after each dimension.
    const dimensions: string[] = [];
    if (has(spec.length_mm)) dimensions.push(`${LENGTH} ${num(spec.length_mm)}`);
    if (has(spec.width_mm)) dimensions.push(`${WIDTH} ${num(spec.width_mm)}`);
    if (has(spec.height_mm)) dimensions.push(`${HEIGHT} ${num(spec.height_mm)}`);
    if (dimensions.length > 0) row(SPEC_LABELS[7], [`${dimensions.join(SEPARATOR)} ${MM}`]);
    if (has(spec.trunk_liters)) row(SPEC_LABELS[8], [`${num(spec.trunk_liters)} ${LITERS}`]);
  }

  return rows;
}
