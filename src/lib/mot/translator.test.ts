// Day 18 §7 — the baalut -> code table serves both files: history 2's rows and the registry's current holder
// (cars.current_owner_type). An unknown word is a structural failure.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OWNERSHIP_CODES, ownershipCode } from "./translator";

describe("ownershipCode (§3.1, §7)", () => {
  it("the registry's four words, as the cache holds them", () => {
    assert.equal(ownershipCode("פרטי"), "private");
    assert.equal(ownershipCode("סוחר"), "dealer");
    assert.equal(ownershipCode("ליסינג"), "leasing");
    assert.equal(ownershipCode("חברה"), "company");
  });

  it("history 2's own spellings map to the same codes", () => {
    assert.equal(ownershipCode("החכר"), "leasing");
    assert.equal(ownershipCode("השכרה"), "rental");
  });

  it("an unknown word throws — never a silent default", () => {
    assert.throws(() => ownershipCode("קיבוץ"), /ownership: unknown ministry value/);
    assert.throws(() => ownershipCode(""), /ownership: unknown ministry value/);
  });

  it("every code the table produces is in OWNERSHIP_CODES", () => {
    for (const w of ["פרטי", "סוחר", "ליסינג", "חברה", "החכר", "השכרה"]) assert.ok(OWNERSHIP_CODES.includes(ownershipCode(w)), w);
  });
});
