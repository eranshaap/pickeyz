// BRIEF Day 19b Run 11a §1.2 — the contact window's two typed fields, and the day and the hour above them.
//
// PURE: no node:*, no next/*, no @/lib/db. The window validates in the browser BEFORE the send, and the
// action validates again on the server; both call these functions, so the two answers cannot disagree.
//
// The day and the hour are judged only for a visit, and the hour only once a day is chosen -- without a
// chosen day the hours are not on screen at all, so "no hour" is not yet a mistake the buyer made.

export type FieldError = "missing" | "invalid";
export type FormInput = { kind: "visit" | "callback"; day: string | null; hour: number | null; name: string; phone: string };
export type FormErrors = Partial<Record<"day" | "hour" | "name" | "phone", FieldError>>;

/**
 * Digits only, and an international prefix folded back to the local form: "+972 52-765-4321" is the same
 * number as "052-7654321" and must fingerprint, de-duplicate and dial the same. The rule is the one
 * scripts/import-sheet.ts:121 applies to the sheet's phone columns, copied here because that function is
 * private to the script and the script is not a library.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("972") ? "0" + digits.slice(3) : digits;
}

/**
 * BRIEF Day 19b Run 12b §1.1 -- an Israeli number by the numbering plan. After normalisation: a mobile
 * (05) or an 07 number of TEN digits, or a landline (02, 03, 04, 08, 09) of NINE. Nothing else: there is
 * no 06 and no 01, and a nine-digit number starting 05 is a mobile one digit short, not a landline.
 * The argument is normalizePhone()'s output -- digits only, a leading 972 already turned into 0.
 */
export function isIsraeliPhone(digits: string): boolean {
  return /^0[57]\d{8}$/.test(digits) || /^0[23489]\d{7}$/.test(digits);
}

/** The errors of one filled form. An empty object is a valid form. */
export function validateForm(f: FormInput): FormErrors {
  const errors: FormErrors = {};

  if (f.kind === "visit") {
    if (f.day === null) errors.day = "missing";
    else if (f.hour === null) errors.hour = "missing";
  }

  if (f.name.trim() === "") errors.name = "missing";

  const phone = f.phone.trim();
  if (phone === "") errors.phone = "missing";
  else if (!isIsraeliPhone(normalizePhone(phone))) errors.phone = "invalid";

  return errors;
}

// ---------------------------------------------------------------------------
// BRIEF Day 19b Run 12 §2.1 — which note the window scrolls to
// ---------------------------------------------------------------------------

export type FormField = "day" | "hour" | "name" | "phone";

/** The screen's order, top to bottom: the day, the hour, then the two typed fields. */
export const FIELD_ORDER: readonly FormField[] = ["day", "hour", "name", "phone"];

/**
 * The first field of FIELD_ORDER that has an error, or null when there is none. The window scrolls to that
 * one after a click on the send button, so a note below the visible area is seen; the order is the screen's,
 * not the order Object.keys happens to give.
 */
export function firstErrorField(errors: FormErrors): FormField | null {
  for (const field of FIELD_ORDER) {
    if (errors[field] !== undefined) return field;
  }
  return null;
}
