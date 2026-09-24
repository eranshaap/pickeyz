// BRIEF Run 6b §8.1 — the four rubric decisions of §7.5, every branch. Pure: no database, no DOM; "now" is
// always an argument, never a clock this file reads.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Check } from "@/lib/scoring/types";
import { colorRubric, handRubric, kmRubric, licenceRubric, rubricStrip, testLine, wholeMonthsBetween } from "./rubrics";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

// Run 9 §6.3 — THE PAGE'S OWN TODAY, handed to the km rubric as a parameter. Every km case below is read
// against this one instant, the same one the ownership axis would be drawn against.
const TODAY = new Date("2026-09-22T09:00:00Z");

const READINGS = [
  { test_date: d(2023, 4, 12), km: 41_000 },
  { test_date: d(2024, 5, 3), km: 78_500 },
  { test_date: d(2025, 6, 20), km: 112_000 },
];

const match: Check = { check: "km", status: "match" };
const mismatchOnLast: Check = { check: "km", status: "mismatch", kind: "km_below", counts: true, declared: 90_000, official: 112_000, official_date: "2025-06-20" };
const mismatchOnEarlier: Check = { check: "km", status: "mismatch", kind: "km_below", counts: true, declared: 70_000, official: 78_500, official_date: "2024-05-03" };

describe('the ק"מ rubric (§7.5)', () => {
  it("Run 9 §6.2 — big is the declared km AS A BARE NUMBER; §6.3 — small is the last reading and how long ago", () => {
    const r = kmRubric({ km_declared: 120_000, test_readings: READINGS, km_check: match, today: TODAY });
    assert.equal(r.big, "120,000"); // §6.2 — the unit is the cell's header, never repeated in the value
    assert.equal(r.small, "בטסט לפני שנה ו-3 חודשים: 112,000");
    assert.equal(r.dark, false);
  });

  it("the last reading wins even when the readings arrive out of order", () => {
    const shuffled = [READINGS[2], READINGS[0], READINGS[1]];
    assert.equal(kmRubric({ km_declared: 120_000, test_readings: shuffled, km_check: match, today: TODAY }).small, "בטסט לפני שנה ו-3 חודשים: 112,000");
  });

  it("no reading at all -> עוד לא עבר טסט", () => {
    const r = kmRubric({ km_declared: 120_000, test_readings: [], km_check: match, today: TODAY });
    assert.equal(r.small, "עוד לא עבר טסט");
    assert.equal(r.dark, false);
  });

  it("dark exactly per the engine's cross-check verdict — never a threshold of its own", () => {
    assert.equal(kmRubric({ km_declared: 90_000, test_readings: READINGS, km_check: mismatchOnLast, today: TODAY }).dark, true);
    assert.equal(kmRubric({ km_declared: 90_000, test_readings: READINGS, km_check: match, today: TODAY }).dark, false);
    assert.equal(kmRubric({ km_declared: 90_000, test_readings: READINGS, km_check: { check: "km", status: "unavailable", reason: "no_reading" }, today: TODAY }).dark, false);
    assert.equal(kmRubric({ km_declared: 90_000, test_readings: READINGS, km_check: { check: "km", status: "skipped", reason: "possibly_sold" }, today: TODAY }).dark, false);
  });

  it("no invoice -> never dark", () => {
    assert.equal(kmRubric({ km_declared: 90_000, test_readings: READINGS, km_check: null, today: TODAY }).dark, false);
  });

  it("THE COUNTED-READING CASE: the contradiction was counted against a reading that is not the last", () => {
    const r = kmRubric({ km_declared: 70_000, test_readings: READINGS, km_check: mismatchOnEarlier, today: TODAY });
    assert.equal(r.dark, true);
    assert.equal(r.small, "בטסט לפני שנתיים ו-4 חודשים: 78,500"); // the reading that was counted, not the last test
  });

  it("a null declared km renders — and can never be dark", () => {
    const r = kmRubric({ km_declared: null, test_readings: READINGS, km_check: mismatchOnLast, today: TODAY });
    assert.equal(r.big, "—");
    assert.equal(r.dark, false);
  });
});

describe("the יד rubric (§7.5, Run 7 §6)", () => {
  it("Run 9 §6.2 — the big value is the NUMBER ALONE; AGREEMENT -> no small line (§6)", () => {
    assert.deepEqual(handRubric({ hand_declared: 2, registry_hand: 2, has_registry_history: true }), { big: "2", small: null, dark: false });
  });

  it("one owner loses its caption too — agreement is agreement whatever the number (§6)", () => {
    assert.deepEqual(handRubric({ hand_declared: 1, registry_hand: 1, has_registry_history: true }), { big: "1", small: null, dark: false });
  });

  it("MISMATCH -> the existing dark line, and the declaration is NOT overridden (§6)", () => {
    const r = handRubric({ hand_declared: 1, registry_hand: 3, has_registry_history: true });
    assert.deepEqual(r, { big: "1", small: "במשרד התחבורה: יד 3", dark: true });
  });

  it("THE NO-DECLARED-HAND CASE: the big value falls back to the registry's hand — nothing declared, so nothing contradicts, so no small line", () => {
    assert.deepEqual(handRubric({ hand_declared: null, registry_hand: 3, has_registry_history: true }), { big: "3", small: null, dark: false });
  });

  it("a car with no registry history keeps its dark לפי המוכר, לא אומת — neither agreement nor mismatch (§6, see REPORT.md)", () => {
    assert.deepEqual(handRubric({ hand_declared: 2, registry_hand: null, has_registry_history: false }), { big: "2", small: "לפי המוכר, לא אומת", dark: true });
  });

  it("history rows but no registry hand -> the same unverified line", () => {
    assert.deepEqual(handRubric({ hand_declared: 2, registry_hand: null, has_registry_history: true }), { big: "2", small: "לפי המוכר, לא אומת", dark: true });
  });

  it("no declaration and no registry history -> — and never dark", () => {
    assert.deepEqual(handRubric({ hand_declared: null, registry_hand: null, has_registry_history: false }), { big: "—", small: "לפי המוכר, לא אומת", dark: false });
  });

  it("no declaration, history rows, no registry hand -> — and never dark", () => {
    assert.deepEqual(handRubric({ hand_declared: null, registry_hand: null, has_registry_history: true }), { big: "—", small: "לפי המוכר, לא אומת", dark: false });
  });
});

describe("the צבע rubric (§7.5, Run 7 §6)", () => {
  const mismatch = { ad: "לבן", registry: "כחול", ad_family: "white", registry_family: "blue" };

  it("AGREEMENT -> NO SMALL LINE AT ALL: the \"צבע\" caption is gone (§6)", () => {
    assert.deepEqual(colorRubric({ color: "לבן", registry_color: "לבן", color_mismatch: undefined, color_changed_reported: false }), {
      big: "לבן",
      small: null,
      dark: false,
    });
  });

  it("MISMATCH -> dark, with the registry's word (§6)", () => {
    assert.deepEqual(colorRubric({ color: "לבן", registry_color: "כחול", color_mismatch: mismatch, color_changed_reported: false }), {
      big: "לבן",
      small: "במשרד התחבורה: כחול",
      dark: true,
    });
  });

  it("a reported colour change with NO contradiction keeps its dark line — neither agreement nor mismatch (§6, see REPORT.md)", () => {
    assert.deepEqual(colorRubric({ color: "לבן", registry_color: "לבן", color_mismatch: undefined, color_changed_reported: true }), {
      big: "לבן",
      small: "דווח שינוי צבע",
      dark: true,
    });
  });

  it("a contradiction wins over a reported change — one small line, not two", () => {
    assert.equal(colorRubric({ color: "לבן", registry_color: "כחול", color_mismatch: mismatch, color_changed_reported: true }).small, "במשרד התחבורה: כחול");
  });

  it("a null colour renders — and can never be dark", () => {
    const r = colorRubric({ color: null, registry_color: "כחול", color_mismatch: mismatch, color_changed_reported: true });
    assert.equal(r.big, "—");
    assert.equal(r.dark, false);
  });
});

describe("the רישיון rubric (§7.5, Run 7 §6)", () => {
  const now = new Date("2026-09-22T09:00:00Z");

  it("VALID -> the date alone, NO small line (§6 — the caption moved into the header)", () => {
    assert.deepEqual(licenceRubric({ test_expiry: d(2027, 3, 1), now }), { big: "3.2027", small: null, dark: false });
  });

  it("EXPIRED -> dark פג תוקף (§6)", () => {
    assert.deepEqual(licenceRubric({ test_expiry: d(2026, 8, 1), now }), { big: "8.2026", small: "פג תוקף", dark: true });
  });

  it("today itself is not expired", () => {
    assert.equal(licenceRubric({ test_expiry: d(2026, 9, 22), now }).dark, false);
  });

  it("the day is taken in ISRAEL time, not UTC", () => {
    // 2026-09-22T21:30Z is already the 23rd in Israel (summer time, UTC+3), so a licence expiring on the
    // 22nd has expired — while in UTC it would still be the 22nd and valid.
    assert.equal(licenceRubric({ test_expiry: d(2026, 9, 22), now: new Date("2026-09-22T21:30:00Z") }).dark, true);
    // The same instant in the winter regime (UTC+2): 22:30Z is the 23rd, 21:30Z is still the 22nd.
    assert.equal(licenceRubric({ test_expiry: d(2026, 12, 1), now: new Date("2026-12-01T21:30:00Z") }).dark, false);
    assert.equal(licenceRubric({ test_expiry: d(2026, 12, 1), now: new Date("2026-12-01T22:30:00Z") }).dark, true);
  });

  it("a null expiry renders — with no small line, and can never be dark", () => {
    assert.deepEqual(licenceRubric({ test_expiry: null, now }), { big: "—", small: null, dark: false });
  });
});

describe("the test line (Run 9 §1.3)", () => {
  const READING = 75_068;

  it("45 days -> one whole month", () => {
    assert.equal(testLine(READING, d(2026, 8, 8), d(2026, 9, 22)), "בטסט לפני חודש: 75,068");
  });

  it("14 days -> no whole month yet: THIS month", () => {
    assert.equal(testLine(READING, d(2026, 9, 8), d(2026, 9, 22)), "בטסט החודש: 75,068");
  });

  it("400 days -> a year and a month, in the axis's own words", () => {
    assert.equal(testLine(READING, d(2025, 8, 12), d(2026, 9, 16)), "בטסט לפני שנה וחודש: 75,068");
  });

  it("no reading, or a reading with no date -> עוד לא עבר טסט", () => {
    assert.equal(testLine(null, d(2026, 8, 8), d(2026, 9, 22)), "עוד לא עבר טסט");
    assert.equal(testLine(READING, null, d(2026, 9, 22)), "עוד לא עבר טסט");
  });

  it("the month count is DAY-AWARE — a month completes on the same day of the next month", () => {
    assert.equal(wholeMonthsBetween(d(2026, 8, 22), d(2026, 9, 21)), 0); // one day short
    assert.equal(wholeMonthsBetween(d(2026, 8, 22), d(2026, 9, 22)), 1); // exactly on the day
    assert.equal(wholeMonthsBetween(d(2025, 8, 12), d(2026, 9, 16)), 13); // 400 days
    assert.equal(wholeMonthsBetween(d(2026, 9, 8), d(2026, 9, 22)), 0); // 14 days
  });

  it("the reading carries thousands separators and NO unit (§6.2)", () => {
    const line = testLine(1_234_567, d(2026, 8, 8), d(2026, 9, 22));
    assert.ok(line.endsWith(": 1,234,567"), line);
    assert.ok(!line.includes("ק"), line.slice(-20));
  });
});

describe("the strip (§7.3, §7.4)", () => {
  it("four rubrics in the board order", () => {
    const strip = rubricStrip({
      km: { km_declared: 120_000, test_readings: READINGS, km_check: match, today: TODAY },
      hand: { hand_declared: 2, registry_hand: 2, has_registry_history: true },
      color: { color: "לבן", registry_color: "לבן", color_mismatch: undefined, color_changed_reported: false },
      licence: { test_expiry: d(2027, 3, 1), now: TODAY },
    });
    assert.deepEqual(strip.map((s) => s.heading), ['ק"מ', "יד", "צבע", "רישיון בתוקף עד"]); // §6 — the רישיון header carries the words
    assert.equal(strip.every((s) => !s.rubric.dark), true);
    // §6 — an all-agreement car says nothing under three of the four: only ק"מ always has its reading line.
    assert.deepEqual(strip.map((s) => s.rubric.small), ["בטסט לפני שנה ו-3 חודשים: 112,000", null, null, null]);
  });
});
