// BRIEF Run 6b §8.3 — the version line, against §2's approved mapping. Pure: no database, no DOM.
// The worked examples of §2.6 are the live pool's own two models, so they are tested by name.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bodyWord, isHybrid, liters, trimName, versionLine, type VersionLineInput } from "./version-line";

// The live pool's two models (§1's print), as `models` stores them.
const IONIQ: VersionLineInput = {
  model: "IONIQ HYBRID",
  body_type: "הצ'בק",
  engine_size: 1580,
  transmission: "auto",
  sub_model: "PREMIUM FL",
  vehicle_class: "P",
};
const MAZDA: VersionLineInput = {
  model: "MAZDA 3",
  body_type: "סדאן",
  engine_size: 1998,
  transmission: "auto",
  sub_model: "COMFORT",
  vehicle_class: "P",
};

describe("liters() (§2.2)", () => {
  it("the two live values: 1998 -> 2.0, 1580 -> 1.6", () => {
    assert.equal(liters(1998), "2.0");
    assert.equal(liters(1580), "1.6");
  });

  it("always one decimal, even on a round number", () => {
    assert.equal(liters(2000), "2.0");
    assert.equal(liters(1000), "1.0");
  });

  it("standard rounding of cc/100, then a tenth", () => {
    assert.equal(liters(1549), "1.5"); // 15.49 -> 15
    assert.equal(liters(1550), "1.6"); // 15.50 -> 16, half up
    assert.equal(liters(1649), "1.6");
  });
});

describe("isHybrid() (§2.3)", () => {
  it("the word HYBRID in models.model, and nothing else, makes it true", () => {
    assert.equal(isHybrid("IONIQ HYBRID"), true);
    assert.equal(isHybrid("MAZDA 3"), false);
  });

  it("case-insensitive, and a null model is not hybrid", () => {
    assert.equal(isHybrid("ioniq hybrid"), true);
    assert.equal(isHybrid(null), false);
  });

  it("HYBRID as part of a longer word is not the word", () => {
    assert.equal(isHybrid("HYBRIDIZER"), false);
  });
});

describe("trimName() (§2.1)", () => {
  it("the two truncated values are completed", () => {
    assert.equal(trimName("BLACK EDITIO"), "BLACK EDITION");
    assert.equal(trimName("100TH ANNIVE"), "100TH ANNIVERSARY");
  });

  it("every other live trim renders exactly as stored, FL suffix and all", () => {
    for (const stored of ["PREMIUM FL", "SUPREME FL", "INTENSE FL", "COMFORT", "SPIRIT", "PREMIUM"]) {
      assert.equal(trimName(stored), stored);
    }
  });

  it("an unmapped value renders as stored — the standing fallback", () => {
    assert.equal(trimName("SOMETHING NEW"), "SOMETHING NEW");
  });
});

describe("bodyWord() (§2.4)", () => {
  it("the stored הצ'בק gains its alef; סדאן renders as stored", () => {
    assert.equal(bodyWord("הצ'בק"), "האצ'בק");
    assert.equal(bodyWord("סדאן"), "סדאן");
  });

  it("any other stored body value renders as stored", () => {
    assert.equal(bodyWord("ג'יפ"), "ג'יפ");
  });
});

describe("versionLine() (§2.6)", () => {
  it("IONIQ HYBRID, PREMIUM FL — היברידי between the gearbox and the trim", () => {
    assert.equal(versionLine(IONIQ), "האצ'בק · 1.6 ליטר · אוטומט · היברידי · גימור PREMIUM FL");
  });

  it("MAZDA 3 sedan, COMFORT — no היברידי", () => {
    assert.equal(versionLine(MAZDA), "סדאן · 2.0 ליטר · אוטומט · גימור COMFORT");
  });

  it("MAZDA 3, BLACK EDITIO — the trim is completed in the assembled line", () => {
    assert.equal(versionLine({ ...MAZDA, sub_model: "BLACK EDITIO" }), "סדאן · 2.0 ליטר · אוטומט · גימור BLACK EDITION");
  });

  it("manual renders ידני (no live case; the word is in the table)", () => {
    assert.equal(versionLine({ ...MAZDA, transmission: "manual" }), "סדאן · 2.0 ליטר · ידני · גימור COMFORT");
  });

  it("vehicle_class M prefixes מסחרי (no live case; the rule stands as written)", () => {
    assert.equal(versionLine({ ...MAZDA, vehicle_class: "M" }), "מסחרי · סדאן · 2.0 ליטר · אוטומט · גימור COMFORT");
  });

  it("a null segment is left out — never invented, never a raw code", () => {
    assert.equal(versionLine({ ...MAZDA, body_type: null }), "2.0 ליטר · אוטומט · גימור COMFORT");
    assert.equal(versionLine({ ...MAZDA, engine_size: null }), "סדאן · אוטומט · גימור COMFORT");
    assert.equal(versionLine({ ...MAZDA, sub_model: null }), "סדאן · 2.0 ליטר · אוטומט");
  });

  it("a gearbox code outside §2.5's table is left out, never printed raw", () => {
    assert.equal(versionLine({ ...MAZDA, transmission: "cvt" }), "סדאן · 2.0 ליטר · גימור COMFORT");
  });
});
