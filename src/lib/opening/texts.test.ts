// Opening screen, S1 §5 — the texts keep the site's punctuation rule: a full sentence ends with a period,
// a label has none, a sentence that introduces a list ends with a colon.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GERSHAYIM, OPENING_TEXTS as T } from "./texts";

describe("OPENING_TEXTS", () => {
  it("ends every full sentence with a period", () => {
    for (const s of [...T.headline, T.subline, T.needModel, T.greyNotOurs, T.greyNotFound, T.loadFailed]) {
      assert.ok(s.endsWith("."), s);
    }
  });

  it("ends no label with a period or a colon", () => {
    const { bestValue, peaceOfMind, cheapest } = T.categoryLines;
    for (const s of [T.search, bestValue, peaceOfMind, cheapest, ...T.tags, T.retry, T.phoneCancel]) {
      assert.ok(!s.endsWith(".") && !s.endsWith(":"), s);
    }
  });

  it("ends the line that introduces the list with a colon", () => {
    assert.ok(T.haveLine.endsWith(":"));
  });

  it("writes the peace-of-mind line with the gershayim 0x5f4", () => {
    assert.equal(GERSHAYIM.charCodeAt(0), 0x5f4);
    assert.ok(T.categoryLines.peaceOfMind.includes(String.fromCharCode(0x5f4)));
  });
});
