// BRIEF Day 19 Run 6a §1 — the public id minter. No database: newPublicId() is pure randomness
// over a fixed alphabet, so every claim here is checked on the function itself.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPublicId, newPublicId, PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH } from "./public-id";

const SAMPLE_SIZE = 10_000;

describe("newPublicId()", () => {
  it("one id: length 10, every character in the alphabet", () => {
    const id = newPublicId();
    assert.equal(id.length, PUBLIC_ID_LENGTH);
    for (const c of id) {
      assert.ok(PUBLIC_ID_ALPHABET.includes(c), `character ${JSON.stringify(c)} is not in the alphabet`);
    }
  });

  it(`${SAMPLE_SIZE.toLocaleString("en-US")} ids: every one well-formed, all distinct`, () => {
    const ids = Array.from({ length: SAMPLE_SIZE }, newPublicId);
    for (const id of ids) {
      assert.ok(isPublicId(id), `not a public id: ${JSON.stringify(id)}`);
    }
    assert.equal(new Set(ids).size, SAMPLE_SIZE);
  });

  it("over those ids every one of the 36 characters appears, and no other", () => {
    const seen = new Set<string>();
    for (let i = 0; i < SAMPLE_SIZE; i += 1) {
      for (const c of newPublicId()) seen.add(c);
    }
    // Misses an off-by-one such as randomInt(35): the last character of the alphabet would never appear.
    for (const c of PUBLIC_ID_ALPHABET) {
      assert.ok(seen.has(c), `the alphabet's ${JSON.stringify(c)} never appeared`);
    }
    for (const c of seen) {
      assert.ok(PUBLIC_ID_ALPHABET.includes(c), `character ${JSON.stringify(c)} is outside the alphabet`);
    }
    assert.equal(seen.size, PUBLIC_ID_ALPHABET.length);
  });
});

describe("isPublicId()", () => {
  it("accepts a minted id", () => {
    assert.equal(isPublicId(newPublicId()), true);
  });

  it("rejects anything that is not the shape", () => {
    assert.equal(isPublicId("abcdefghi"), false, "9 characters");
    assert.equal(isPublicId("abcdefghijk"), false, "11 characters");
    assert.equal(isPublicId("Abcdefghij"), false, "an uppercase letter");
    assert.equal(isPublicId("אbcdefghij"), false, "a Hebrew letter");
    assert.equal(isPublicId("abcde fghi"), false, "a space");
    assert.equal(isPublicId("abcde-fghi"), false, "a dash");
    assert.equal(isPublicId(""), false, "the empty string");
    assert.equal(isPublicId(1234567890), false, "a number");
    assert.equal(isPublicId(null), false, "null");
    assert.equal(isPublicId(undefined), false, "undefined");
  });
});
