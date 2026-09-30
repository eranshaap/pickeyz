// BRIEF Day 19b Run 11a §1.2 — the contact window's three fields.
//
// PURE: no node:*, no next/*, no @/lib/db. The window validates in the browser BEFORE the send, and the
// action validates again on the server; both call these functions, so the two answers cannot disagree.
//
// The day and the hour are judged only for a visit, and the hour only once a day is chosen -- without a
// chosen day the hours are not on screen at all, so "no hour" is not yet a mistake the buyer made.

export type FieldError = "missing" | "invalid";
export type FormInput = { kind: "visit" | "callback"; day: string | null; hour: number | null; name: string; phone: string; email: string };
export type FormErrors = Partial<Record<"day" | "hour" | "name" | "phone" | "email", FieldError>>;

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

/** An Israeli number after normalisation: a 0, then a non-zero non-one digit, then 7 or 8 more. */
export function isIsraeliPhone(digits: string): boolean {
  return /^0[2-9]\d{7,8}$/.test(digits);
}

/** Deliberately the loose shape check and nothing more: an address is proved by mail, not by a regex. */
export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
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

  const email = f.email.trim();
  if (email === "") errors.email = "missing";
  else if (!isEmail(email)) errors.email = "invalid";

  return errors;
}
