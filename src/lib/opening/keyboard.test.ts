// Opening screen, S1 §2 — fromEnglishLayout: the Latin side of the Israeli layout to Hebrew, nothing else.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fromEnglishLayout } from "./keyboard";

describe("fromEnglishLayout", () => {
  it("turns nt into מא", () => {
    assert.equal(fromEnglishLayout("nt"), "מא");
  });

  it("turns hubsth into יונדאי", () => {
    assert.equal(fromEnglishLayout("hubsth"), "יונדאי");
  });

  it("maps upper case the same as lower case", () => {
    assert.equal(fromEnglishLayout("NT"), "מא");
  });

  it("leaves spaces and digits as they are", () => {
    assert.equal(fromEnglishLayout("nt 3"), "מא 3");
  });

  it("returns Hebrew text unchanged", () => {
    assert.equal(fromEnglishLayout("מאזדה 3"), "מאזדה 3");
  });
});
