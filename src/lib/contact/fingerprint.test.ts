// BRIEF Day 19b Run 11a §1.6 — the phone fingerprint. A FIXED test secret: the environment's variable is
// Eran's to set, and a test that needed it would fail on a clean checkout.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PHONE_SECRET_ENV, phoneFingerprint } from "./fingerprint";

const SECRET = "test-secret-not-the-real-one";
const OTHER_SECRET = "another-test-secret";
const PHONE = "0527654321";

describe("phoneFingerprint() (§1.6)", () => {
  it("the same phone under the same secret always gives the same value", () => {
    assert.equal(phoneFingerprint(PHONE, SECRET), phoneFingerprint(PHONE, SECRET));
  });

  it("it is 64 lowercase hex characters", () => {
    assert.match(phoneFingerprint(PHONE, SECRET), /^[0-9a-f]{64}$/);
  });

  it("two secrets over one phone give different values — the key is what makes it unguessable", () => {
    assert.notEqual(phoneFingerprint(PHONE, SECRET), phoneFingerprint(PHONE, OTHER_SECRET));
  });

  it("two phones under one secret give different values", () => {
    assert.notEqual(phoneFingerprint(PHONE, SECRET), phoneFingerprint("0501234567", SECRET));
  });

  it("the digits of the phone never appear in the output", () => {
    const fp = phoneFingerprint(PHONE, SECRET);
    assert.equal(fp.includes(PHONE), false);
    assert.equal(fp.includes(PHONE.slice(3)), false);
  });

  it("the environment variable's name is the one the deployment sets", () => {
    assert.equal(PHONE_SECRET_ENV, "CONTACT_PHONE_SECRET");
  });
});
