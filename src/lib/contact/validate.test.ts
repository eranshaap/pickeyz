// BRIEF Day 19b Run 11a §1.2 — the three fields, the phone's normalisation, and the seven errors.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isEmail, isIsraeliPhone, normalizePhone, validateForm, type FormInput } from "./validate";

const FILLED: FormInput = { kind: "callback", day: null, hour: null, name: "Dana", phone: "052-7654321", email: "dana@example.com" };

describe("normalizePhone() — every spelling of one number (§1.2)", () => {
  it("the four spellings of the same mobile all come out as 0527654321", () => {
    for (const raw of ["052-7654321", "0527654321", "+972 52-765-4321", "052 765 4321"]) {
      assert.equal(normalizePhone(raw), "0527654321", raw);
    }
  });

  it("a number that does not begin with 972 keeps its digits", () => {
    assert.equal(normalizePhone("03-1234567"), "031234567");
    assert.equal(normalizePhone("+1 555 123 4567"), "15551234567");
  });

  it("an empty value stays empty", () => {
    assert.equal(normalizePhone(""), "");
    assert.equal(normalizePhone("   "), "");
  });
});

describe("isIsraeliPhone() — 9 or 10 digits after normalisation (§1.2)", () => {
  it("accepts a 10-digit mobile and a 9-digit landline", () => {
    assert.equal(isIsraeliPhone("0527654321"), true);
    assert.equal(isIsraeliPhone("031234567"), true);
  });

  it("refuses what is too short, has no leading zero, or is foreign", () => {
    for (const d of ["12345", "05271", "15551234567", "", "0"]) {
      assert.equal(isIsraeliPhone(d), false, d);
    }
  });

  it("refuses a second zero after the leading one", () => {
    assert.equal(isIsraeliPhone("0012345678"), false);
  });
});

describe("isEmail() — the shape and nothing more (§1.2)", () => {
  it("an ordinary address passes, with or without surrounding spaces", () => {
    assert.equal(isEmail("dana@example.com"), true);
    assert.equal(isEmail("  dana@example.com  "), true);
  });

  it("refuses a missing host, a missing @ and an empty value", () => {
    for (const s of ["dana@", "dana example.com", "", "@example.com", "dana@example"]) {
      assert.equal(isEmail(s), false, JSON.stringify(s));
    }
  });
});

describe("validateForm() (§1.2)", () => {
  it("a filled callback is valid: {}", () => {
    assert.deepEqual(validateForm(FILLED), {});
  });

  it("a filled visit with a day and an hour is valid", () => {
    assert.deepEqual(validateForm({ ...FILLED, kind: "visit", day: "2026-09-24", hour: 11 }), {});
  });

  it("a visit with no day is missing its day, and the hour is NOT judged — the hours are not on screen yet", () => {
    assert.deepEqual(validateForm({ ...FILLED, kind: "visit", day: null, hour: null }), { day: "missing" });
  });

  it("a visit with a day and no hour is missing its hour", () => {
    assert.deepEqual(validateForm({ ...FILLED, kind: "visit", day: "2026-09-24", hour: null }), { hour: "missing" });
  });

  it("a callback is never judged on a day or an hour, even when it carries them", () => {
    assert.deepEqual(validateForm({ ...FILLED, day: null, hour: null }), {});
    assert.deepEqual(validateForm({ ...FILLED, day: "2026-09-24", hour: 11 }), {});
  });

  it("a name of spaces alone is missing", () => {
    assert.deepEqual(validateForm({ ...FILLED, name: "   " }), { name: "missing" });
  });

  it("an empty phone is missing; a badly shaped one is invalid", () => {
    assert.deepEqual(validateForm({ ...FILLED, phone: "" }), { phone: "missing" });
    assert.deepEqual(validateForm({ ...FILLED, phone: "05271" }), { phone: "invalid" });
  });

  it("an empty e-mail is missing; a badly shaped one is invalid", () => {
    assert.deepEqual(validateForm({ ...FILLED, email: "" }), { email: "missing" });
    assert.deepEqual(validateForm({ ...FILLED, email: "dana@" }), { email: "invalid" });
  });

  it("every field can be wrong at once", () => {
    assert.deepEqual(validateForm({ kind: "visit", day: null, hour: null, name: "", phone: "", email: "" }), {
      day: "missing",
      name: "missing",
      phone: "missing",
      email: "missing",
    });
  });

  it("each of the seven messages of §1.3 is reachable from some form", () => {
    const reached = new Set<string>();
    const forms: FormInput[] = [
      { kind: "visit", day: null, hour: null, name: "", phone: "", email: "" },
      { ...FILLED, kind: "visit", day: "2026-09-24", hour: null },
      { ...FILLED, phone: "05271" },
      { ...FILLED, email: "dana@" },
    ];
    for (const f of forms) for (const [field, error] of Object.entries(validateForm(f))) reached.add(`${field}.${error}`);
    assert.deepEqual([...reached].sort(), ["day.missing", "email.invalid", "email.missing", "hour.missing", "name.missing", "phone.invalid", "phone.missing"]);
  });
});
