// BRIEF Run 6b §8.1 — the four rubric decisions of §7.5, every branch. Pure: no database, no DOM; "now" is
// always an argument, never a clock this file reads.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Check } from "@/lib/scoring/types";
import { colorRubric, handRubric, kmRubric, licenceRubric, rubricStrip } from "./rubrics";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

const READINGS = [
  { test_date: d(2023, 4, 12), km: 41_000 },
  { test_date: d(2024, 5, 3), km: 78_500 },
  { test_date: d(2025, 6, 20), km: 112_000 },
];

const match: Check = { check: "km", status: "match" };
const mismatchOnLast: Check = { check: "km", status: "mismatch", kind: "km_below", counts: true, declared: 90_000, official: 112_000, official_date: "2025-06-20" };
const mismatchOnEarlier: Check = { check: "km", status: "mismatch", kind: "km_below", counts: true, declared: 70_000, official: 78_500, official_date: "2024-05-03" };

describe('the ק"מ rubric (§7.5)', () => {
  it("big is the declared km; small is ALWAYS the last test reading by test_date", () => {
    const r = kmRubric({ km_declared: 120_000, test_readings: READINGS, km_check: match });
    assert.equal(r.big, "120,000 ק״מ");
    assert.equal(r.small, "בטסט 20.6.2025: 112,000");
    assert.equal(r.dark, false);
  });

  it("the last reading wins even when the readings arrive out of order", () => {
    const shuffled = [READINGS[2], READINGS[0], READINGS[1]];
    assert.equal(kmRubric({ km_declared: 120_000, test_readings: shuffled, km_check: match }).small, "בטסט 20.6.2025: 112,000");
  });

  it("no reading at all -> עוד לא עבר טסט", () => {
    const r = kmRubric({ km_declared: 120_000, test_readings: [], km_check: match });
    assert.equal(r.small, "עוד לא עבר טסט");
    assert.equal(r.dark, false);
  });

  it("dark exactly per the engine's cross-check verdict — never a threshold of its own", () => {
    assert.equal(kmRubric({ km_declared: 90_000, test_readings: READINGS, km_check: mismatchOnLast }).dark, true);
    assert.equal(kmRubric({ km_declared: 90_000, test_readings: READINGS, km_check: match }).dark, false);
    assert.equal(kmRubric({ km_declared: 90_000, test_readings: READINGS, km_check: { check: "km", status: "unavailable", reason: "no_reading" } }).dark, false);
    assert.equal(kmRubric({ km_declared: 90_000, test_readings: READINGS, km_check: { check: "km", status: "skipped", reason: "possibly_sold" } }).dark, false);
  });

  it("no invoice -> never dark", () => {
    assert.equal(kmRubric({ km_declared: 90_000, test_readings: READINGS, km_check: null }).dark, false);
  });

  it("THE COUNTED-READING CASE: the contradiction was counted against a reading that is not the last", () => {
    const r = kmRubric({ km_declared: 70_000, test_readings: READINGS, km_check: mismatchOnEarlier });
    assert.equal(r.dark, true);
    assert.equal(r.small, "בטסט 3.5.2024: 78,500"); // the reading that was counted, not the last test
  });

  it("a null declared km renders — and can never be dark", () => {
    const r = kmRubric({ km_declared: null, test_readings: READINGS, km_check: mismatchOnLast });
    assert.equal(r.big, "—");
    assert.equal(r.dark, false);
  });
});

describe("the יד rubric (§7.5)", () => {
  it("declared = registry: big from the ad, small from the Ministry, grey", () => {
    assert.deepEqual(handRubric({ hand_declared: 2, registry_hand: 2, has_registry_history: true }), { big: "יד 2", small: "2 בעלויות", dark: false });
  });

  it("one owner has its own word", () => {
    assert.deepEqual(handRubric({ hand_declared: 1, registry_hand: 1, has_registry_history: true }), { big: "יד 1", small: "בעלות אחת", dark: false });
  });

  it("declared ≠ registry -> dark, and the declaration is NOT overridden", () => {
    const r = handRubric({ hand_declared: 1, registry_hand: 3, has_registry_history: true });
    assert.deepEqual(r, { big: "יד 1", small: "במשרד התחבורה: יד 3", dark: true });
  });

  it("THE NO-DECLARED-HAND CASE: the big value falls back to the registry's hand, and nothing is dark", () => {
    assert.deepEqual(handRubric({ hand_declared: null, registry_hand: 3, has_registry_history: true }), { big: "יד 3", small: "3 בעלויות", dark: false });
  });

  it("a car with no registry history -> dark לפי המוכר, לא אומת", () => {
    assert.deepEqual(handRubric({ hand_declared: 2, registry_hand: null, has_registry_history: false }), { big: "יד 2", small: "לפי המוכר, לא אומת", dark: true });
  });

  it("no declaration and no registry history -> — and never dark", () => {
    assert.deepEqual(handRubric({ hand_declared: null, registry_hand: null, has_registry_history: false }), { big: "—", small: "לפי המוכר, לא אומת", dark: false });
  });
});

describe("the צבע rubric (§7.5)", () => {
  const mismatch = { ad: "לבן", registry: "כחול", ad_family: "white", registry_family: "blue" };

  it("no fact -> the ad's colour over the plain word, grey", () => {
    assert.deepEqual(colorRubric({ color: "לבן", registry_color: "לבן", color_mismatch: undefined, color_changed_reported: false }), {
      big: "לבן",
      small: "צבע",
      dark: false,
    });
  });

  it("a colour-family contradiction -> dark, with the registry's word", () => {
    assert.deepEqual(colorRubric({ color: "לבן", registry_color: "כחול", color_mismatch: mismatch, color_changed_reported: false }), {
      big: "לבן",
      small: "במשרד התחבורה: כחול",
      dark: true,
    });
  });

  it("a reported colour change with NO contradiction -> dark דווח שינוי צבע", () => {
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

describe("the רישיון rubric (§7.5)", () => {
  const now = new Date("2026-09-22T09:00:00Z");

  it("valid -> the month over רישיון בתוקף עד, grey", () => {
    assert.deepEqual(licenceRubric({ test_expiry: d(2027, 3, 1), now }), { big: "3.2027", small: "רישיון בתוקף עד", dark: false });
  });

  it("expired -> dark הרישיון פג", () => {
    assert.deepEqual(licenceRubric({ test_expiry: d(2026, 8, 1), now }), { big: "8.2026", small: "הרישיון פג", dark: true });
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

  it("a null expiry renders — and can never be dark", () => {
    assert.deepEqual(licenceRubric({ test_expiry: null, now }), { big: "—", small: "רישיון בתוקף עד", dark: false });
  });
});

describe("the strip (§7.3, §7.4)", () => {
  it("four rubrics in the board order", () => {
    const strip = rubricStrip({
      km: { km_declared: 120_000, test_readings: READINGS, km_check: match },
      hand: { hand_declared: 2, registry_hand: 2, has_registry_history: true },
      color: { color: "לבן", registry_color: "לבן", color_mismatch: undefined, color_changed_reported: false },
      licence: { test_expiry: d(2027, 3, 1), now: new Date("2026-09-22T09:00:00Z") },
    });
    assert.deepEqual(strip.map((s) => s.heading), ['ק"מ', "יד", "צבע", "רישיון"]);
    assert.equal(strip.every((s) => !s.rubric.dark), true);
  });
});
