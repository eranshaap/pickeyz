// Opening screen, F2 — stripMake and mergeKey (BRIEF §10.4).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeKey, stripMake } from "./merge";

const MAZDA = ["MAZDA"];
const BMW = ["BMW", "MINI"];

describe("stripMake", () => {
  it("drops the prefix and one space or hyphen", () => {
    assert.equal(stripMake("MAZDA CX-5", MAZDA), "CX-5");
    assert.equal(stripMake("MAZDA-CX5", MAZDA), "CX5");
  });

  it("uppercases and trims first", () => {
    assert.equal(stripMake("  mazda 3 ", MAZDA), "3");
  });

  it("keeps a name equal to a prefix", () => {
    assert.equal(stripMake("SERES", ["SERES"]), "SERES");
    assert.equal(stripMake("MINI", BMW), "MINI");
  });

  it("does not strip a prefix glued to the name", () => {
    assert.equal(stripMake("JAECOO7 PRO", ["JAECOO"]), "JAECOO7 PRO");
  });

  it("tries the longest prefix first, whatever the list order", () => {
    assert.equal(stripMake("MERCEDES-BENZ C200", ["MERCEDES", "MERCEDES-BENZ"]), "C200");
    assert.equal(stripMake("MARUTI SUZUKI SWIFT", ["SUZUKI", "MARUTI", "MARUTI SUZUKI"]), "SWIFT");
  });

  it("strips once", () => {
    assert.equal(stripMake("MAZDA MAZDA 3", MAZDA), "MAZDA 3");
  });
});

describe("mergeKey", () => {
  it("folds MAZDA CX-5, CX-5, CX5 and MAZDA CX--5 into one key", () => {
    const keys = ["MAZDA CX-5", "CX-5", "CX5", "MAZDA CX--5"].map((n) => mergeKey(n, MAZDA));
    assert.deepEqual(new Set(keys), new Set(["CX5"]));
  });

  it("MAZDA 3 -> 3", () => {
    assert.equal(mergeKey("MAZDA 3", MAZDA), "3");
  });

  it("TOYOTA COROLLA and COROLLA are one", () => {
    assert.equal(mergeKey("TOYOTA COROLLA", ["TOYOTA"]), mergeKey("COROLLA", ["TOYOTA"]));
  });

  it("a name equal to a prefix stays", () => {
    assert.equal(mergeKey("SERES", ["SERES"]), "SERES");
  });

  it("MINI ONE and ONE are one under the BMW prefixes", () => {
    assert.equal(mergeKey("MINI ONE", BMW), "ONE");
    assert.equal(mergeKey("ONE", BMW), "ONE");
  });

  it("JAECOO7 PRO is not stripped", () => {
    assert.equal(mergeKey("JAECOO7 PRO", ["JAECOO"]), "JAECOO7PRO");
  });

  it("removes spaces, hyphens, dots, apostrophes and slashes", () => {
    assert.equal(mergeKey("ID. 4 / X-'PRO", []), "ID4XPRO");
  });
});
