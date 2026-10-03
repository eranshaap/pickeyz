// BRIEF Day 19b Run 22 §4 — THE ALERT LIST's lines, pure. Two kinds, for every version of a car with a live
// listing: a version no manual-spec row describes ("חסר מפרט ידני"), and a version whose catalog row lacks a
// value the car page shows ("חור בקטלוג"). The values are copy-ready for the "מפרט ידני" tab: the engine word,
// the drive digit, the model's spelling as stored. The separator is " · " (U+00B7).

import { ENGINE_TYPE_WORD, engineTypeCode } from "@/lib/display/spec";
import type { SpecMatchModel } from "./spec-match";

/** §4.1 — what the script loads for every version of a car with a live listing. */
export type LiveVersion = SpecMatchModel & {
  degem_code: string | null; horsepower: number | null; doors: number | null; seats: number | null;
  transmission: string | null; airbags: number | null;
};

const SEP = " \u00B7 ";

/** A stored value as the line shows it: an empty or missing one is "-". */
function shown(v: string | number | null): string {
  if (v === null) return "-";
  const t = String(v).trim();
  return t === "" ? "-" : t;
}

function carCount(cars: number): string {
  return cars === 1 ? "רכב אחד" : `${cars} רכבים`;
}

function head(v: LiveVersion): string[] {
  return [shown(v.make), shown(v.model), shown(v.body_type), shown(v.year), shown(v.sub_model)];
}

/** §4.2 */
export function missingSpecLine(v: LiveVersion, cars: number): string {
  const code = engineTypeCode(v.drive_technology, v.fuel_type);
  // A null code says why the version cannot match: the stored technology and fuel, as they are.
  const engine = code !== null ? ENGINE_TYPE_WORD[code] : `${shown(v.drive_technology)} / ${shown(v.fuel_type)}`;
  const drive = v.drive_type === "4X2" ? "2" : v.drive_type === "4X4" ? "4" : shown(v.drive_type);
  return `חסר מפרט ידני: ${[...head(v), shown(v.engine_size), engine, drive, carCount(cars)].join(SEP)}`;
}

const emptyText = (s: string | null) => s === null || s.trim() === "";
const emptyNumber = (n: number | null) => n === null || n === 0;

/**
 * §4.3 — the catalog values the page shows that this version lacks (findCar-now.md, "המפרט — אין "אין נתון""),
 * in this order. Not checked: safety_rating, co2_wltp, the 15 flags. airbags 0 is a value ("no airbags").
 */
export function catalogHoles(v: LiveVersion): string[] {
  const electric = engineTypeCode(v.drive_technology, v.fuel_type) === "electric";
  const holes: string[] = [];
  if (emptyNumber(v.horsepower)) holes.push("כוח סוס");
  if (emptyNumber(v.doors)) holes.push("דלתות");
  if (emptyNumber(v.seats)) holes.push("מושבים");
  if (emptyText(v.body_type)) holes.push("מרכב");
  if (!electric && emptyNumber(v.engine_size)) holes.push("נפח מנוע");
  if (!electric && emptyText(v.fuel_type)) holes.push("דלק");
  if (emptyText(v.transmission)) holes.push("תיבה");
  if (emptyText(v.drive_type)) holes.push("הנעה");
  if (v.airbags === null) holes.push("כריות אוויר");
  return holes;
}

/** §4.4 */
export function catalogHoleLine(v: LiveVersion, holes: string[], cars: number): string {
  return `חור בקטלוג: ${[...head(v), shown(v.degem_code)].join(SEP)} — חסר: ${holes.join(", ")}${SEP}${carCount(cars)}`;
}
