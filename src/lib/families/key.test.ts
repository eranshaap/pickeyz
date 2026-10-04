// Opening screen, F1 — spellingKey: trim, uppercase, one space per whitespace run. Nothing else.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spellingKey } from "./key";

describe("spellingKey", () => {
  it("uppercases a lowercase name", () => {
    assert.equal(spellingKey("corolla"), "COROLLA");
  });

  it("trims both ends", () => {
    assert.equal(spellingKey("  MAZDA 3 \n"), "MAZDA 3");
  });

  it("collapses double spaces and tabs to one space", () => {
    assert.equal(spellingKey("IONIQ  HYBRID"), "IONIQ HYBRID");
    assert.equal(spellingKey("IONIQ\tHYBRID"), "IONIQ HYBRID");
    assert.equal(spellingKey("IONIQ \t  HYBRID"), "IONIQ HYBRID");
  });

  it("keeps the spaces, letters and signs it is not told to touch", () => {
    assert.equal(spellingKey("MAZDA3"), "MAZDA3");
    assert.equal(spellingKey("MAZDA 3"), "MAZDA 3");
    assert.equal(spellingKey("C-HR"), "C-HR");
    assert.equal(spellingKey("i-20"), "I-20");
  });

  it("gives an empty key for a blank name", () => {
    assert.equal(spellingKey(" \t "), "");
  });
});
