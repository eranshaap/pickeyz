// BRIEF Day 19b Run 22 §5 — THE FAILED-CARS FILE, pure: the cars of the sheet the import could not enter,
// one reason each, as a CSV Excel opens with its Hebrew intact (UTF-8 with a BOM, CRLF, RFC 4180 quoting).
// The script writes it in every run, so it holds only the last import's failures.

/** The project folder; the script joins it to process.cwd(). */
export const FAILED_CARS_PATH = "failed-cars.csv";

/** The reasons: key (the counter's suffix) → the text written in the file. */
export const FAILED_REASON = {
  area_empty: "אזור ריק",
  city_unknown: "העיר אינה בקובץ היישובים",
  plate_not_in_registry: "לוחית לא נמצאה ברישוי",
  no_degem_code: "בלי קוד דגם ברישוי",
  unexpected_model: "דגם שאינו מהדגמים הצפויים",
  year_mismatch: "השנתון במודעה שונה מהרישוי",
  version_not_in_catalog: "הגרסה אינה בקטלוג של המשרד",
  catalog_translation: "תרגום שורת הקטלוג נכשל",
  catalog_row_broken: "בעיה בשורת הקטלוג של המשרד",
  ministry_down: "המשרד לא ענה",
  name_not_in_file: "השם לא בקובץ",
  name_without_model: "השם בקובץ בלי דגם",
  name_not_imported: "השם בקובץ אבל עוד לא יובא",
} as const;

export type FailedReason = keyof typeof FAILED_REASON;

export type FailedCar = {
  plate: string; link: string; registry_model: string | null; registry_year: number | null;
  reason: FailedReason; details: string; not_tried: boolean;
};

/** Day 19b Run 22b — the details of a year_mismatch row: the ad's year, then the registry's. */
export function yearMismatchDetails(adYear: number, registryYear: number): string {
  return `במודעה ${adYear}, ברישוי ${registryYear}`;
}

const HEADER = ["מספר רישוי", "קישור למודעה", "דגם ברישוי", "שנה ברישוי", "סיבה", "פרטים", "לא נוסה"];

/** RFC 4180: a field holding a comma, a quote or a line break is quoted, its quotes doubled. */
function field(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** §5.4 — the file's whole text. Zero rows → the BOM and the header line only. */
export function failedCarsCsv(rows: FailedCar[]): string {
  const lines = [HEADER.map(field).join(",")];
  for (const r of rows) {
    lines.push([
      r.plate,
      r.link,
      r.registry_model ?? "",
      r.registry_year === null ? "" : String(r.registry_year),
      FAILED_REASON[r.reason],
      r.details,
      r.not_tried ? "כן" : "",
    ].map(field).join(","));
  }
  return "\uFEFF" + lines.map((l) => l + "\r\n").join("");
}
