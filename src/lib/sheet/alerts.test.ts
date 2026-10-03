// BRIEF Day 19b Run 22 §4 — the alert lines.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { catalogHoleLine, catalogHoles, missingSpecLine, type LiveVersion } from "./alerts";

const PETROL: LiveVersion = {
  make: "מאזדה", model: "MAZDA 3", body_type: "האצ'בק", year: 2021, engine_size: 1998,
  drive_technology: "regular", fuel_type: "בנזין", drive_type: "4X2", sub_model: "SPORT",
  degem_code: "0123-4567", horsepower: 165, doors: 5, seats: 5, transmission: "אוטומטית", airbags: 7,
};

describe("missingSpecLine (§4.2)", () => {
  it("a petrol version", () => {
    assert.equal(
      missingSpecLine(PETROL, 3),
      "חסר מפרט ידני: מאזדה \u00B7 MAZDA 3 \u00B7 האצ'בק \u00B7 2021 \u00B7 SPORT \u00B7 1998 \u00B7 בנזין \u00B7 2 \u00B7 3 רכבים",
    );
  });

  it("a hybrid 4X4 version, one car", () => {
    const v: LiveVersion = { ...PETROL, drive_technology: "hybrid", fuel_type: "חשמל/בנזין", drive_type: "4X4" };
    assert.equal(
      missingSpecLine(v, 1),
      "חסר מפרט ידני: מאזדה \u00B7 MAZDA 3 \u00B7 האצ'בק \u00B7 2021 \u00B7 SPORT \u00B7 1998 \u00B7 היברידי \u00B7 4 \u00B7 רכב אחד",
    );
  });

  it("a null-code version says the stored technology and fuel; an empty field is -", () => {
    const v: LiveVersion = { ...PETROL, fuel_type: "חשמל/בנזין", sub_model: null, drive_type: "AWD" };
    assert.equal(
      missingSpecLine(v, 2),
      "חסר מפרט ידני: מאזדה \u00B7 MAZDA 3 \u00B7 האצ'בק \u00B7 2021 \u00B7 - \u00B7 1998 \u00B7 regular / חשמל/בנזין \u00B7 AWD \u00B7 2 רכבים",
    );
  });
});

describe("catalogHoles (§4.3)", () => {
  it("a full version → []", () => {
    assert.deepEqual(catalogHoles(PETROL), []);
  });

  it("each hole alone", () => {
    const cases: [Partial<LiveVersion>, string][] = [
      [{ horsepower: null }, "כוח סוס"], [{ horsepower: 0 }, "כוח סוס"],
      [{ doors: null }, "דלתות"], [{ doors: 0 }, "דלתות"],
      [{ seats: null }, "מושבים"], [{ seats: 0 }, "מושבים"],
      [{ body_type: null }, "מרכב"], [{ body_type: " " }, "מרכב"],
      [{ engine_size: null }, "נפח מנוע"], [{ engine_size: 0 }, "נפח מנוע"],
      [{ fuel_type: "" }, "דלק"],
      [{ transmission: null }, "תיבה"],
      [{ drive_type: null }, "הנעה"],
      [{ airbags: null }, "כריות אוויר"],
    ];
    for (const [o, hole] of cases) assert.deepEqual(catalogHoles({ ...PETROL, ...o }), [hole], JSON.stringify(o));
  });

  it("engine_size 0 and no fuel on an electric → no hole", () => {
    assert.deepEqual(catalogHoles({ ...PETROL, drive_technology: "electric", engine_size: 0, fuel_type: null }), []);
  });

  it("airbags 0 → no hole; null → hole", () => {
    assert.deepEqual(catalogHoles({ ...PETROL, airbags: 0 }), []);
    assert.deepEqual(catalogHoles({ ...PETROL, airbags: null }), ["כריות אוויר"]);
  });

  it("several holes, in the listed order", () => {
    assert.deepEqual(
      catalogHoles({ ...PETROL, airbags: null, horsepower: null, transmission: "" }),
      ["כוח סוס", "תיבה", "כריות אוויר"],
    );
  });
});

describe("catalogHoleLine (§4.4)", () => {
  it("the line's shape", () => {
    assert.equal(
      catalogHoleLine(PETROL, ["כוח סוס", "תיבה"], 4),
      "חור בקטלוג: מאזדה \u00B7 MAZDA 3 \u00B7 האצ'בק \u00B7 2021 \u00B7 SPORT \u00B7 0123-4567 — חסר: כוח סוס, תיבה \u00B7 4 רכבים",
    );
    assert.match(catalogHoleLine(PETROL, ["דלתות"], 1), / \u00B7 רכב אחד$/);
  });
});
