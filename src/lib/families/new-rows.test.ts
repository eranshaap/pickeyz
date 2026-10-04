// Opening screen, F3b — the family of a new catalog row (BRIEF F3b §1), on real names. The Hebrew make
// spellings are looked up in words.ts by their English name, as review.test.ts does.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFamilyIndex, familiesForNewRows, FamilyConflictError, familyForNewRow } from "./new-rows";
import { MAKES } from "./words";

const heOf = (english: string): string => {
  const found = Object.keys(MAKES).find((k) => MAKES[k].english === english);
  assert.ok(found, `no MAKES entry for ${english}`);
  return found;
};
const MAZDA = heOf("MAZDA");
const HYUNDAI = heOf("HYUNDAI");
const TOYOTA = heOf("TOYOTA");

const INDEX = buildFamilyIndex([
  { make: MAZDA, model: "CX-5", family_id: 7 },
  { make: MAZDA, model: "CX-5", family_id: 7 },
  { make: MAZDA, model: "MAZDA 3", family_id: 3 },
  { make: HYUNDAI, model: "IONIQ HYBRID", family_id: null },
  { make: null, model: "COROLLA", family_id: 9 },
  { make: TOYOTA, model: null, family_id: 9 },
]);

function conflictsOf(f: () => unknown): FamilyConflictError["conflicts"] {
  try {
    f();
  } catch (e) {
    assert.ok(e instanceof FamilyConflictError);
    return e.conflicts;
  }
  assert.fail("no FamilyConflictError");
}

describe("familyForNewRow", () => {
  it("a known name gets its family", () => {
    assert.equal(familyForNewRow(INDEX, MAZDA, "MAZDA 3"), 3);
    assert.equal(familyForNewRow(INDEX, MAZDA, "CX-5"), 7);
  });

  it("a spelling the chain merges gets the same family: MAZDA CX-5 when the index was built from CX-5", () => {
    assert.equal(familyForNewRow(INDEX, MAZDA, "MAZDA CX-5"), 7);
    assert.equal(familyForNewRow(INDEX, MAZDA, "CX5"), 7);
  });

  it("a name whose rows all have family_id null gets null", () => {
    assert.equal(familyForNewRow(INDEX, HYUNDAI, "IONIQ HYBRID"), null);
  });

  it("an unknown name gets null", () => {
    assert.equal(familyForNewRow(INDEX, TOYOTA, "COROLLA"), null);
  });

  it("a null make or model gets null", () => {
    assert.equal(familyForNewRow(INDEX, null, "COROLLA"), null);
    assert.equal(familyForNewRow(INDEX, TOYOTA, null), null);
    assert.equal(familyForNewRow(INDEX, null, null), null);
  });

  it("one key with two families throws FamilyConflictError listing both ids", () => {
    const index = buildFamilyIndex([
      { make: MAZDA, model: "CX-5", family_id: 12 },
      { make: MAZDA, model: "MAZDA CX-5", family_id: 7 },
    ]);
    assert.deepEqual(conflictsOf(() => familyForNewRow(index, MAZDA, "CX5")), [{ name: `${MAZDA} CX5`, familyIds: [7, 12] }]);
  });
});

describe("familiesForNewRows", () => {
  it("returns the ids in order", () => {
    assert.deepEqual(
      familiesForNewRows(INDEX, [
        { make: MAZDA, model: "MAZDA CX-5" }, { make: TOYOTA, model: "COROLLA" }, { make: MAZDA, model: "MAZDA 3" }, { make: null, model: "3" },
      ]),
      [7, null, 3, null],
    );
  });

  it("reports every conflict at once", () => {
    const index = buildFamilyIndex([
      { make: MAZDA, model: "CX-5", family_id: 7 },
      { make: MAZDA, model: "CX5", family_id: 8 },
      { make: HYUNDAI, model: "IONIQ", family_id: 20 },
      { make: HYUNDAI, model: "HYUNDAI IONIQ", family_id: 21 },
      { make: MAZDA, model: "MAZDA 3", family_id: 3 },
    ]);
    const conflicts = conflictsOf(() =>
      familiesForNewRows(index, [
        { make: MAZDA, model: "MAZDA CX-5" }, { make: MAZDA, model: "MAZDA 3" }, { make: HYUNDAI, model: "IONIQ" },
      ]),
    );
    assert.deepEqual(conflicts, [
      { name: `${MAZDA} MAZDA CX-5`, familyIds: [7, 8] },
      { name: `${HYUNDAI} IONIQ`, familyIds: [20, 21] },
    ]);
  });
});
