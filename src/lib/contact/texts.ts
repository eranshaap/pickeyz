// BRIEF Day 19b Run 11a §1.3 — the contact window's words. THE ONE HOME OF ITS LANGUAGE.
//
// PURE: no node:*, no next/*, no @/lib/db — the window renders from here in the browser.
//
// Every string is copied from findCar-now.md ("עמוד הרכב", "חלון הפנייה", "אחרי השליחה"). The rest of
// src/lib/contact/ holds no Hebrew letter at all, comments included, and texts.test.ts asserts it: a second
// home for the language is a second home waiting to disagree with the first.
//
// Values enter through functions, never through concatenation at the call site, so a wording change is one
// edit here and one test diff — never a silent change in a component.

import { shekel } from "@/lib/display/texts";
import { weekdayOf, type DayOption } from "./schedule";

// ---------------------------------------------------------------------------
// the page's button, both screens
// ---------------------------------------------------------------------------

export const BUTTON_CONTACT = "צור קשר עם המוכר";
export const BUTTON_CONTACT_SHORT = "צור קשר";
export const BUTTON_SENT = "הבקשה נשלחה";

// ---------------------------------------------------------------------------
// the window's frame
// ---------------------------------------------------------------------------

export const WINDOW_TITLE = "צור קשר עם המוכר";
export const CLOSE = "סגירה";

// ---------------------------------------------------------------------------
// the form
// ---------------------------------------------------------------------------

export const WHAT_SUITS = "מה נוח לך?";
export const VISIT = "לבוא לראות את הרכב";
export const VISIT_NOTE = "המוכר ישלח הודעה לוודא הגעה";
export const CALLBACK = "שיחזרו אליי";
export const CALLBACK_NOTE = "המוכר יתקשר אליך";
export const WHICH_DAY = "באיזה יום?";
export const WHICH_HOUR = "באיזו שעה?";
export const CLOSED_SUFFIX = " · סגור";
export const NAME = "שם";
export const PHONE = "טלפון";
export const SEND = "שלח למוכר";

/** The privacy line under the fields. No link: there is no policy page to link to yet. */
export function privacyLine(sellerName: string): string {
  return `הפרטים עוברים רק ל${sellerName}, ורק בשביל הבקשה הזו.`;
}

// ---------------------------------------------------------------------------
// what goes wrong
// ---------------------------------------------------------------------------

/**
 * One message per field per error. A field whose "invalid" can never be produced (a day, an hour, a name)
 * repeats its "missing" text rather than inventing a second wording nobody will ever read.
 */
export const ERROR_TEXT: Record<"day" | "hour" | "name" | "phone", Record<"missing" | "invalid", string>> = {
  day: { missing: "יש לבחור יום", invalid: "יש לבחור יום" },
  hour: { missing: "יש לבחור שעה", invalid: "יש לבחור שעה" },
  name: { missing: "יש להזין שם", invalid: "יש להזין שם" },
  phone: { missing: "יש להזין מספר טלפון", invalid: "המספר לא תקין" },
};

export const SEND_FAILED = "השליחה לא הצליחה. נסה שוב.";
export const TOO_MANY = "שלחת הרבה בקשות בשעה האחרונה, נסה שוב מאוחר יותר";

// ---------------------------------------------------------------------------
// after the send
// ---------------------------------------------------------------------------

export const SENT_TITLE = "הבקשה נשלחה";

/** The visit line in three parts: the component renders the middle one bold. */
export function visitLineParts(dayLabel: string, hour: number): { before: string; strong: string; after: string } {
  return { before: "ביקשת להגיע ביום ", strong: `${dayLabel} בשעה ${hourLabel(hour)}`, after: "." };
}

/** The follow-up after a visit, in three parts: the phone sits in its own LTR span. */
export function visitFollowUp(sellerName: string, phoneDisplay: string): { before: string; phone: string; after: string } {
  return { before: `תקבל הודעה מ${sellerName} למספר `, phone: phoneDisplay, after: ", כדי לוודא הגעה." };
}

/** The follow-up after a callback, in the same three parts. */
export function callbackFollowUp(sellerName: string, phoneDisplay: string): { before: string; phone: string; after: string } {
  return { before: `תקבל שיחה מ${sellerName} למספר `, phone: phoneDisplay, after: "." };
}

export const INSPECTION_NOTE = "לפני שקונים — כדאי לקחת את הרכב לבדיקה במכון.";
export const CLOSE_BUTTON = "סגור";
export const NEW_REQUEST = "לשלוח בקשה חדשה";

// ---------------------------------------------------------------------------
// the car that went off the site while the window was open
// ---------------------------------------------------------------------------

export const GONE_TITLE = "הרכב הזה כבר לא מוצע באתר";
export const GONE_LINE = "הוא ירד מהאתר מאז שפתחת את העמוד, ולכן הבקשה לא נשלחה.";

// ---------------------------------------------------------------------------
// days, hours, phones and the car's one line
// ---------------------------------------------------------------------------

/** Index = weekdayOf(day). The geresh is U+05F3, not an apostrophe. */
export const WEEKDAY_LETTER = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;

/** "ה׳ 24.9" — no leading zeros on either number. */
export function dayLabel(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${WEEKDAY_LETTER[weekdayOf(day)]} ${d}.${m}`;
}

/** The day chip's text: the label, and for a closed day the suffix that says why it cannot be pressed. */
export function dayChipLabel(opt: DayOption): string {
  return opt.closed ? `${dayLabel(opt.day)}${CLOSED_SUFFIX}` : dayLabel(opt.day);
}

/** "9:00", "10:00" — no leading zero. */
export function hourLabel(hour: number): string {
  return `${hour}:00`;
}

/** The digits a buyer reads back: 10 digits as 3-7, 9 digits as 2-7, anything else exactly as given. */
export function displayPhone(digits: string): string {
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

/** The one line under the car's name inside the window: price, seller, and the region when there is one. */
export function carLine(price: number, sellerName: string, region: string | null): string {
  return `${shekel(price)} · ${sellerName}` + (region ? ` · ${region}` : "");
}
