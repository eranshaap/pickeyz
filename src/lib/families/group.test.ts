// Opening screen, F2 — groupKey (BRIEF §10.5).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupKey } from "./group";

const all = (names: string[]) => new Set(names.map(groupKey));

describe("groupKey", () => {
  it("joins a letters-only token and a digits-only token", () => {
    assert.equal(groupKey("MX 5"), "MX5");
    assert.equal(groupKey("MX-5"), "MX5");
    assert.equal(groupKey("RAV 4"), "RAV4");
    assert.equal(groupKey("C 200"), "C");
    assert.equal(groupKey("MODEL 3"), "MODEL3");
  });

  it("MODEL Y stays two tokens", () => {
    assert.equal(groupKey("MODEL Y"), "MODEL");
  });

  it("removes hyphens, dots, apostrophes and slashes inside the first token", () => {
    assert.equal(groupKey("C-HR"), "CHR");
    assert.equal(groupKey("ID.4"), "ID4");
  });

  it("letters + three digits or more + letters -> the leading letters", () => {
    assert.equal(groupKey("C180"), "C");
    assert.equal(groupKey("GLA200"), "GLA");
    assert.equal(groupKey("E300"), "E");
    assert.equal(groupKey("NX300H"), "NX");
  });

  it("any other token is the key itself", () => {
    for (const t of ["X1", "I20", "XC60", "318I", "208", "COROLLA", "YARIS"]) assert.equal(groupKey(t), t);
  });

  it("YARIS, YARIS HYBRID, YARIS CROSS HSD, YARIS CROSS HEV -> YARIS", () => {
    assert.deepEqual(all(["YARIS", "YARIS HYBRID", "YARIS CROSS HSD", "YARIS CROSS HEV"]), new Set(["YARIS"]));
  });

  it("C180, C200 D, C220D, C300, C300 E -> C", () => {
    assert.deepEqual(all(["C180", "C200 D", "C220D", "C300", "C300 E"]), new Set(["C"]));
  });

  it("X1 SDRIVE 18I, X1 SDRIVE 20I -> X1", () => {
    assert.deepEqual(all(["X1 SDRIVE 18I", "X1 SDRIVE 20I"]), new Set(["X1"]));
  });

  it("318I and 320I are two groups (the documented gap)", () => {
    assert.deepEqual(all(["318I", "320I"]), new Set(["318I", "320I"]));
  });

  it("SANTA FE and SANTA FE HYBRID -> SANTA", () => {
    assert.deepEqual(all(["SANTA FE", "SANTA FE HYBRID"]), new Set(["SANTA"]));
  });
});
