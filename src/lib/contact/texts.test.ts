// BRIEF Day 19b Run 11a §1.3 — the window's words. One literal-against-literal assertion per string, so a
// later edit of a wording shows up as a test diff and never as a silent change on the screen.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dayOptions } from "./schedule";
import {
  BUTTON_CONTACT,
  BUTTON_CONTACT_SHORT,
  BUTTON_SENT,
  CALLBACK,
  CALLBACK_NOTE,
  CLOSE,
  CLOSE_BUTTON,
  CLOSED_SUFFIX,
  EMAIL,
  EMAIL_NOTE,
  ERROR_TEXT,
  GONE_LINE,
  GONE_TITLE,
  INSPECTION_NOTE,
  NAME,
  NEW_REQUEST,
  PHONE,
  SEND,
  SEND_FAILED,
  SENT_TITLE,
  TOO_MANY,
  VISIT,
  VISIT_NOTE,
  WEEKDAY_LETTER,
  WHAT_SUITS,
  WHICH_DAY,
  WHICH_HOUR,
  WINDOW_TITLE,
  callbackFollowUp,
  carLine,
  dayChipLabel,
  dayLabel,
  displayPhone,
  hourLabel,
  privacyLine,
  visitFollowUp,
  visitLineParts,
} from "./texts";

describe("the page's button and the window's frame (§1.3)", () => {
  it("the three button texts", () => {
    assert.equal(BUTTON_CONTACT, "צור קשר עם המוכר");
    assert.equal(BUTTON_CONTACT_SHORT, "צור קשר");
    assert.equal(BUTTON_SENT, "הבקשה נשלחה");
  });

  it("the window's title and the X's label", () => {
    assert.equal(WINDOW_TITLE, "צור קשר עם המוכר");
    assert.equal(CLOSE, "סגירה");
  });
});

describe("the form's words (§1.3)", () => {
  it("the two options and their notes", () => {
    assert.equal(WHAT_SUITS, "מה נוח לך?");
    assert.equal(VISIT, "לבוא לראות את הרכב");
    assert.equal(VISIT_NOTE, "המוכר ישלח הודעה לוודא הגעה");
    assert.equal(CALLBACK, "שיחזרו אליי");
    assert.equal(CALLBACK_NOTE, "המוכר יתקשר אליך");
  });

  it("the two headings and the closed-day suffix", () => {
    assert.equal(WHICH_DAY, "באיזה יום?");
    assert.equal(WHICH_HOUR, "באיזו שעה?");
    assert.equal(CLOSED_SUFFIX, " · סגור");
  });

  it("the three labels, the e-mail's note and the send button", () => {
    assert.equal(NAME, "שם");
    assert.equal(PHONE, "טלפון");
    assert.equal(EMAIL, "מייל");
    assert.equal(EMAIL_NOTE, "מבטיחים לא לחפור במייל");
    assert.equal(SEND, "שלח למוכר");
  });

  it("the privacy line carries the seller's name and no link", () => {
    assert.equal(privacyLine("אוטו דיל"), "הפרטים עוברים רק לאוטו דיל, ורק בשביל הבקשה הזו.");
    assert.equal(privacyLine("אוטו דיל").includes("http"), false);
  });
});

describe("what goes wrong (§1.3)", () => {
  it("the five fields' seven messages", () => {
    assert.equal(ERROR_TEXT.day.missing, "יש לבחור יום");
    assert.equal(ERROR_TEXT.hour.missing, "יש לבחור שעה");
    assert.equal(ERROR_TEXT.name.missing, "יש להזין שם");
    assert.equal(ERROR_TEXT.phone.missing, "יש להזין מספר טלפון");
    assert.equal(ERROR_TEXT.phone.invalid, "המספר לא תקין");
    assert.equal(ERROR_TEXT.email.missing, "יש להזין מייל");
    assert.equal(ERROR_TEXT.email.invalid, "המייל לא תקין");
  });

  it("an 'invalid' that is never produced repeats the 'missing' text", () => {
    for (const field of ["day", "hour", "name"] as const) {
      assert.equal(ERROR_TEXT[field].invalid, ERROR_TEXT[field].missing, field);
    }
  });

  it("every field has both keys and there are exactly five fields", () => {
    assert.deepEqual(Object.keys(ERROR_TEXT).sort(), ["day", "email", "hour", "name", "phone"]);
  });

  it("the two lines above the send button", () => {
    assert.equal(SEND_FAILED, "השליחה לא הצליחה. נסה שוב.");
    assert.equal(TOO_MANY, "שלחת הרבה בקשות בשעה האחרונה, נסה שוב מאוחר יותר");
  });
});

describe("after the send (§1.3)", () => {
  it("the confirmation's title, note and two buttons", () => {
    assert.equal(SENT_TITLE, "הבקשה נשלחה");
    assert.equal(INSPECTION_NOTE, "לפני שקונים — כדאי לקחת את הרכב לבדיקה במכון.");
    assert.equal(CLOSE_BUTTON, "סגור");
    assert.equal(NEW_REQUEST, "לשלוח בקשה חדשה");
  });

  it("the visit line joins to one sentence, with the day and hour in its middle part", () => {
    const p = visitLineParts("ה׳ 24.9", 11);
    assert.deepEqual(p, { before: "ביקשת להגיע ביום ", strong: "ה׳ 24.9 בשעה 11:00", after: "." });
    assert.equal(p.before + p.strong + p.after, "ביקשת להגיע ביום ה׳ 24.9 בשעה 11:00.");
  });

  it("the visit's follow-up names the seller and puts the phone in its own part", () => {
    const p = visitFollowUp("אוטו דיל", "052-7654321");
    assert.deepEqual(p, { before: "תקבל הודעה מאוטו דיל למספר ", phone: "052-7654321", after: ", כדי לוודא הגעה." });
    assert.equal(p.before + p.phone + p.after, "תקבל הודעה מאוטו דיל למספר 052-7654321, כדי לוודא הגעה.");
  });

  it("the callback's follow-up does the same with a call", () => {
    const p = callbackFollowUp("אוטו דיל", "03-1234567");
    assert.deepEqual(p, { before: "תקבל שיחה מאוטו דיל למספר ", phone: "03-1234567", after: "." });
    assert.equal(p.before + p.phone + p.after, "תקבל שיחה מאוטו דיל למספר 03-1234567.");
  });
});

describe("the car that went off the site (§1.3)", () => {
  it("its two lines", () => {
    assert.equal(GONE_TITLE, "הרכב הזה כבר לא מוצע באתר");
    assert.equal(GONE_LINE, "הוא ירד מהאתר מאז שפתחת את העמוד, ולכן הבקשה לא נשלחה.");
  });
});

describe("days, hours, phones and the car's line (§1.3)", () => {
  it("the seven weekday letters, with the geresh U+05F3", () => {
    assert.deepEqual([...WEEKDAY_LETTER], ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"]);
    assert.equal(WEEKDAY_LETTER[0].charCodeAt(1), 0x05f3);
  });

  it("dayLabel carries no leading zero on either number", () => {
    assert.equal(dayLabel("2026-09-24"), "ה׳ 24.9");
    assert.equal(dayLabel("2026-10-01"), "ה׳ 1.10");
    assert.equal(dayLabel("2026-09-06"), "א׳ 6.9");
  });

  it("a closed day's chip says so; an open one does not", () => {
    const days = dayOptions(new Date("2026-09-23T07:30:00Z"));
    const saturday = days.find((d) => d.day === "2026-09-26");
    const thursday = days.find((d) => d.day === "2026-09-24");
    assert.equal(dayChipLabel(saturday!), "ש׳ 26.9 · סגור");
    assert.equal(dayChipLabel(thursday!), "ה׳ 24.9");
  });

  it("hourLabel carries no leading zero", () => {
    assert.equal(hourLabel(9), "9:00");
    assert.equal(hourLabel(10), "10:00");
    assert.equal(hourLabel(18), "18:00");
  });

  it("displayPhone groups ten digits 3-7 and nine digits 2-7, and leaves anything else alone", () => {
    assert.equal(displayPhone("0527654321"), "052-7654321");
    assert.equal(displayPhone("031234567"), "03-1234567");
    assert.equal(displayPhone("12345"), "12345");
    assert.equal(displayPhone(""), "");
  });

  it("carLine drops the region when there is none", () => {
    assert.equal(carLine(94000, "אוטו דיל", "מרכז"), "94,000 ₪ · אוטו דיל · מרכז");
    assert.equal(carLine(94000, "אוטו דיל", null), "94,000 ₪ · אוטו דיל");
    assert.equal(carLine(94000, "אוטו דיל", ""), "94,000 ₪ · אוטו דיל");
  });
});

describe("texts.ts is the one home of the window's language (§1)", () => {
  // The same rule src/lib/justification/wordings.test.ts:103-114 keeps over the generator's library.
  const HEBREW = /[א-ת]/;
  for (const file of ["schedule.ts", "validate.ts", "memory.ts", "ids.ts", "fingerprint.ts", "store.ts"]) {
    it(`${file} contains no letter in U+05D0–U+05EA`, () => {
      const source = readFileSync(join(process.cwd(), "src", "lib", "contact", file), "utf8");
      const hit = HEBREW.exec(source);
      assert.equal(hit, null, hit === null ? "" : `${file} carries ${JSON.stringify(hit[0])} at index ${hit.index}`);
    });
  }
});
