// BRIEF Day 19b Run 18 §2 — the "מפרט ואבזור" rows. Pure: no database, no DOM, no clock.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  engineTypeCode,
  engineTypeFromWord,
  fuelKind,
  kmPerLiter,
  rangeKm,
  specRows,
  ENGINE_TYPE_WORD,
  FUEL_EXPLANATION,
  SAFETY_EXPLANATION,
  SPEC_LABELS,
  type SpecModelInput,
  type SpecRow,
  type SpecSheetInput,
} from "./spec";

// The plan's example version (Eran, 26/09) — a 1.6 petrol hybrid sedan — with all 15 flags off, so every
// test below names only the fields it is about.
function modelRow(overrides: Partial<SpecModelInput> = {}): SpecModelInput {
  return {
    engine_size: 1580,
    horsepower: 141,
    fuel_type: "בנזין",
    transmission: "auto",
    drive_type: "4X2",
    drive_technology: "hybrid",
    body_type: "סדאן",
    doors: 4,
    seats: 5,
    airbags: 6,
    safety_rating: 5,
    co2_wltp: 104,
    aeb_pedestrian_cyclist: false,
    pedestrian_detection: false,
    two_wheeler_detection: false,
    forward_collision_warning: false,
    distance_monitoring: false,
    lane_departure_warning: false,
    lane_keeping: false,
    blind_spot_detection: false,
    adaptive_cruise: false,
    traffic_sign_recognition: false,
    auto_high_beams: false,
    reverse_auto_braking: false,
    sunroof: false,
    alloy_wheels: false,
    reverse_camera: false,
    ...overrides,
  };
}

// A manual-spec row for the same version.
function sheetRow(overrides: Partial<NonNullable<SpecSheetInput>> = {}): NonNullable<SpecSheetInput> {
  return { length_mm: 4470, width_mm: 1820, height_mm: 1445, trunk_liters: 450, tank_liters: 45, km_per_liter: 18.5, ...overrides };
}

/** The value of one row, or null when the row was not returned at all. */
function value(rows: SpecRow[], label: string): string | null {
  return rows.find((r) => r.label === label)?.value ?? null;
}

// ---------------------------------------------------------------------------

describe("fuelKind (§2.3a)", () => {
  it("the four catalog strings", () => {
    assert.equal(fuelKind("בנזין"), "petrol");
    assert.equal(fuelKind("חשמל/בנזין"), "petrol");
    assert.equal(fuelKind("דיזל"), "diesel");
    assert.equal(fuelKind("חשמל/דיזל"), "diesel");
  });

  it("anything else — a gas car, an empty string, null — has no fuel we can name", () => {
    assert.equal(fuelKind("גז"), null);
    assert.equal(fuelKind(""), null);
    assert.equal(fuelKind(null), null);
  });
});

describe("kmPerLiter (§2.3b)", () => {
  it("petrol, CO2 104 -> 21.9", () => {
    assert.equal(kmPerLiter(modelRow({ co2_wltp: 104 }), null), 21.9);
  });

  it("petrol, CO2 160 -> 14.2", () => {
    assert.equal(kmPerLiter(modelRow({ co2_wltp: 160 }), null), 14.2);
  });

  it("petrol, CO2 163 -> 14 (the number; the row prints it 14.0)", () => {
    assert.equal(kmPerLiter(modelRow({ co2_wltp: 163 }), null), 14);
  });

  it("diesel, CO2 120 -> 21.9 — the diesel litre is a different number of grams", () => {
    assert.equal(kmPerLiter(modelRow({ fuel_type: "דיזל", co2_wltp: 120 }), null), 21.9);
  });

  it('"חשמל/בנזין" is petrol: CO2 104 -> 21.9', () => {
    assert.equal(kmPerLiter(modelRow({ fuel_type: "חשמל/בנזין", co2_wltp: 104 }), null), 21.9);
  });

  it("a plug-in gets no consumption, CO2 figure or not", () => {
    assert.equal(kmPerLiter(modelRow({ drive_technology: "plug_in" }), sheetRow()), null);
  });

  it("an electric car gets no consumption", () => {
    assert.equal(kmPerLiter(modelRow({ drive_technology: "electric" }), sheetRow()), null);
  });

  it("no CO2 figure -> the manual spec's own number", () => {
    assert.equal(kmPerLiter(modelRow({ co2_wltp: null }), sheetRow()), 18.5);
  });

  it("neither a CO2 figure nor a manual spec -> null", () => {
    assert.equal(kmPerLiter(modelRow({ co2_wltp: null }), null), null);
  });

  it("a CO2 figure whose fuel we cannot name -> null, and NO fall-through to the manual figure", () => {
    assert.equal(kmPerLiter(modelRow({ fuel_type: "גז" }), sheetRow()), null);
  });

  it("CO2 0 is no figure, so the manual number is used", () => {
    assert.equal(kmPerLiter(modelRow({ co2_wltp: 0 }), sheetRow()), 18.5);
  });

  it("a manual number of 0 is no figure either", () => {
    assert.equal(kmPerLiter(modelRow({ co2_wltp: null }), sheetRow({ km_per_liter: 0 })), null);
  });
});

describe("rangeKm (§2.3c)", () => {
  it("the worked example: 21.9 km/l on a 45 litre tank -> 990", () => {
    assert.equal(rangeKm(21.9, 45), 990);
  });

  it("no tank -> no range", () => {
    assert.equal(rangeKm(21.9, null), null);
  });

  it("a tank of 0 is no tank", () => {
    assert.equal(rangeKm(21.9, 0), null);
  });

  it("14.2 on 51 -> 720", () => {
    assert.equal(rangeKm(14.2, 51), 720);
  });

  it("10 on 55 -> 550", () => {
    assert.equal(rangeKm(10, 55), 550);
  });

  it("10.5 on 55 -> 580", () => {
    assert.equal(rangeKm(10.5, 55), 580);
  });

  it("a tie rounds UP: 11.5 on 50 is 575 km -> 580", () => {
    assert.equal(rangeKm(11.5, 50), 580);
  });
});

describe("specRows: the order of the section (§2.4)", () => {
  it("a full catalog row and a full sheet row -> exactly the nine labels, in SPEC_LABELS' order", () => {
    const rows = specRows(modelRow(), sheetRow());
    assert.deepEqual(
      rows.map((r) => r.label),
      [...SPEC_LABELS],
    );
  });
});

describe('specRows: "צריכת דלק וטווח" (§2.4 row 1)', () => {
  it("with a tank: the consumption and the range", () => {
    assert.equal(value(specRows(modelRow(), sheetRow()), "צריכת דלק וטווח"), "21.9 ק״מ לליטר · כ-990 ק״מ למיכל");
  });

  it("no sheet row: the consumption alone", () => {
    assert.equal(value(specRows(modelRow(), null), "צריכת דלק וטווח"), "21.9 ק״מ לליטר");
  });

  it("the fuel row carries FUEL_EXPLANATION, the safety row SAFETY_EXPLANATION; every other row has none", () => {
    const rows = specRows(modelRow(), sheetRow());
    const fuel = rows.find((r) => r.label === "צריכת דלק וטווח");
    assert.equal(fuel?.explanation, FUEL_EXPLANATION);
    const safety = rows.find((r) => r.label === "רמת אבזור בטיחותי");
    assert.equal(safety?.explanation, SAFETY_EXPLANATION);
    for (const r of rows.filter((r) => r.label !== "צריכת דלק וטווח" && r.label !== "רמת אבזור בטיחותי")) {
      assert.equal(r.explanation, null);
    }
  });
});

describe('specRows: "כריות אוויר" (§2.4 row 2)', () => {
  it("airbags null = the row has no catalog spec data at all -> NO SECTION", () => {
    assert.deepEqual(specRows(modelRow({ airbags: null }), sheetRow()), []);
  });

  it("airbags 0 -> no airbags row, and every other row still drawn", () => {
    const rows = specRows(modelRow({ airbags: 0 }), sheetRow());
    assert.equal(value(rows, "כריות אוויר"), null);
    assert.deepEqual(
      rows.map((r) => r.label),
      SPEC_LABELS.filter((l) => l !== "כריות אוויר"),
    );
  });

  it("airbags 6 -> the count", () => {
    assert.equal(value(specRows(modelRow(), sheetRow()), "כריות אוויר"), "6");
  });
});

describe('specRows: "מערכות עזר לנהג" (§2.4 row 3)', () => {
  it("nothing fitted -> אין, and the row is still drawn", () => {
    assert.equal(value(specRows(modelRow(), sheetRow()), "מערכות עזר לנהג"), "אין");
  });

  it("flags 9 and 1 fitted -> both labels, in TABLE order and not the order they were set", () => {
    const rows = specRows(modelRow({ adaptive_cruise: true, aeb_pedestrian_cyclist: true }), sheetRow());
    assert.equal(value(rows, "מערכות עזר לנהג"), "בלימת חירום מול הולכי רגל ורוכבי אופניים · בקרת שיוט אדפטיבית");
  });
});

describe('specRows: "רמת אבזור בטיחותי" (§2.4 row 4)', () => {
  it("0 is a real reading on the ministry's scale and is shown", () => {
    assert.equal(value(specRows(modelRow({ safety_rating: 0 }), sheetRow()), "רמת אבזור בטיחותי"), "0 מתוך 8");
  });

  it("5 -> 5 מתוך 8", () => {
    assert.equal(value(specRows(modelRow(), sheetRow()), "רמת אבזור בטיחותי"), "5 מתוך 8");
  });

  it("null -> no row", () => {
    assert.equal(value(specRows(modelRow({ safety_rating: null }), sheetRow()), "רמת אבזור בטיחותי"), null);
  });

  // The window's text itself — character for character. No command checks it; this test is how it is verified.
  it("SAFETY_EXPLANATION is the text of the ruling, word for word", () => {
    assert.equal(
      SAFETY_EXPLANATION,
      "רמת אבזור בטיחותי — הדירוג של משרד התחבורה לפי מערכות בטיחות מתקדמות. הרשימה מחמירה כל שנה, ולכן רכב משנים קודמות מקבל היום בדרך כלל רמה נמוכה יותר מכשהיה חדש.",
    );
  });
});

describe('specRows: "אבזור" (§2.4 row 5)', () => {
  it("nothing fitted -> אין, and the row is still drawn", () => {
    assert.equal(value(specRows(modelRow(), sheetRow()), "אבזור"), "אין");
  });

  it("all three fitted -> the three labels in table order", () => {
    const rows = specRows(modelRow({ sunroof: true, alloy_wheels: true, reverse_camera: true }), sheetRow());
    assert.equal(value(rows, "אבזור"), "חלון גג · חישוקי סגסוגת · מצלמת רוורס");
  });
});

describe('specRows: "מנוע" (§2.4 row 6)', () => {
  it("the plan's example, word for word", () => {
    assert.equal(value(specRows(modelRow(), sheetRow()), "מנוע"), "1.6 ליטר · 141 כ״ס · היברידי · בנזין · אוטומט · הנעה לשני גלגלים");
  });

  it("electric: חשמלי stands in place of BOTH the technology and the fuel, and there is no displacement", () => {
    const model = modelRow({ engine_size: 0, horsepower: 150, drive_technology: "electric", transmission: "auto", drive_type: "4X2" });
    assert.equal(value(specRows(model, sheetRow()), "מנוע"), "150 כ״ס · חשמלי · אוטומט · הנעה לשני גלגלים");
  });

  it('"regular" gets NO technology word — the fuel word alone', () => {
    const model = modelRow({ drive_technology: "regular", fuel_type: "דיזל", transmission: "manual", drive_type: "4X4" });
    const engine = value(specRows(model, sheetRow()), "מנוע");
    assert.equal(engine?.endsWith("· דיזל · ידני · הנעה לארבעה גלגלים"), true);
    assert.equal(engine?.includes("היברידי"), false);
  });

  it("a diesel plug-in: the technology word, then the fuel read from fuel_type", () => {
    const model = modelRow({ drive_technology: "plug_in", fuel_type: "חשמל/דיזל" });
    assert.equal(value(specRows(model, sheetRow()), "מנוע")?.includes("היברידי נטען · דיזל"), true);
  });

  it("a gearbox code and a drive value outside their tables are left out, not printed raw", () => {
    const model = modelRow({ transmission: "cvt", drive_type: "6X6" });
    assert.equal(value(specRows(model, sheetRow()), "מנוע"), "1.6 ליטר · 141 כ״ס · היברידי · בנזין");
  });

  it("horsepower null -> that part alone is left out", () => {
    const rows = specRows(modelRow({ horsepower: null }), sheetRow());
    assert.equal(value(rows, "מנוע"), "1.6 ליטר · היברידי · בנזין · אוטומט · הנעה לשני גלגלים");
  });

  it("every engine field null or 0 -> no engine row at all", () => {
    const model = modelRow({ engine_size: 0, horsepower: null, fuel_type: null, transmission: null, drive_type: null, drive_technology: null });
    assert.equal(value(specRows(model, sheetRow()), "מנוע"), null);
  });
});

describe('specRows: "מרכב" (§2.4 row 7)', () => {
  it("the body word, the doors and the seats", () => {
    assert.equal(value(specRows(modelRow(), sheetRow()), "מרכב"), "סדאן · 4 דלתות · 5 מושבים");
  });

  it("doors 0 is no figure -> the part is left out", () => {
    assert.equal(value(specRows(modelRow({ doors: 0 }), sheetRow()), "מרכב"), "סדאן · 5 מושבים");
  });

  it("the body word is the VERSION LINE's own table — the catalog's spelling is completed", () => {
    assert.equal(value(specRows(modelRow({ body_type: "הצ'בק" }), sheetRow()), "מרכב")?.startsWith("האצ'בק"), true);
  });

  it("an empty body_type is missing -> the doors and the seats alone", () => {
    assert.equal(value(specRows(modelRow({ body_type: "" }), sheetRow()), "מרכב"), "4 דלתות · 5 מושבים");
  });
});

describe('specRows: "מידות" (§2.4 row 8)', () => {
  it("the three dimensions, and מ״מ once at the end", () => {
    assert.equal(value(specRows(modelRow(), sheetRow()), "מידות"), "אורך 4,470 · רוחב 1,820 · גובה 1,445 מ״מ");
  });

  it("height null -> two parts, the unit still once at the end", () => {
    assert.equal(value(specRows(modelRow(), sheetRow({ height_mm: null })), "מידות"), "אורך 4,470 · רוחב 1,820 מ״מ");
  });

  it("width 0 is missing too", () => {
    assert.equal(value(specRows(modelRow(), sheetRow({ width_mm: 0 })), "מידות"), "אורך 4,470 · גובה 1,445 מ״מ");
  });

  it("no sheet row -> no dimensions row", () => {
    assert.equal(value(specRows(modelRow(), null), "מידות"), null);
  });
});

describe('specRows: "תא מטען" (§2.4 row 9)', () => {
  it("450 -> 450 ליטר", () => {
    assert.equal(value(specRows(modelRow(), sheetRow()), "תא מטען"), "450 ליטר");
  });

  it("null -> no row", () => {
    assert.equal(value(specRows(modelRow(), sheetRow({ trunk_liters: null })), "תא מטען"), null);
  });

  it("0 -> no row", () => {
    assert.equal(value(specRows(modelRow(), sheetRow({ trunk_liters: 0 })), "תא מטען"), null);
  });
});

// ---------------------------------------------------------------------------
// BRIEF Day 19b Run 21 §5 — the engine-type code, for matching a `models` row to a manual-spec row
// ---------------------------------------------------------------------------

describe("engineTypeCode (Run 21 §5)", () => {
  it("regular + the petrol word -> petrol", () => {
    assert.equal(engineTypeCode("regular", "בנזין"), "petrol");
  });

  it("regular + the diesel word -> diesel", () => {
    assert.equal(engineTypeCode("regular", "דיזל"), "diesel");
  });

  it("hybrid -> hybrid, whatever the fuel", () => {
    assert.equal(engineTypeCode("hybrid", "בנזין"), "hybrid");
    assert.equal(engineTypeCode("hybrid", "דיזל"), "hybrid");
    assert.equal(engineTypeCode("hybrid", null), "hybrid");
  });

  it("plug_in -> plug_in, whatever the fuel", () => {
    assert.equal(engineTypeCode("plug_in", "חשמל/בנזין"), "plug_in");
    assert.equal(engineTypeCode("plug_in", "חשמל/דיזל"), "plug_in");
    assert.equal(engineTypeCode("plug_in", null), "plug_in");
  });

  it("electric -> electric", () => {
    assert.equal(engineTypeCode("electric", null), "electric");
    assert.equal(engineTypeCode("electric", "חשמל"), "electric");
  });

  it("both inputs are trimmed", () => {
    assert.equal(engineTypeCode("  regular ", " בנזין  "), "petrol");
    assert.equal(engineTypeCode(" hybrid ", null), "hybrid");
  });

  it("regular + a compound fuel word is NO MATCH: the car goes on the alert list", () => {
    assert.equal(engineTypeCode("regular", "חשמל/בנזין"), null);
    assert.equal(engineTypeCode("regular", "חשמל/דיזל"), null);
  });

  it("regular with no fuel at all -> null", () => {
    assert.equal(engineTypeCode("regular", null), null);
    assert.equal(engineTypeCode("regular", "   "), null);
  });

  it("a null or unknown technology -> null", () => {
    assert.equal(engineTypeCode(null, "בנזין"), null);
    assert.equal(engineTypeCode("gas", "בנזין"), null);
    assert.equal(engineTypeCode("", "בנזין"), null);
  });
});

describe("engineTypeFromWord (Run 21 §5)", () => {
  it("each of the five words", () => {
    assert.equal(engineTypeFromWord(ENGINE_TYPE_WORD.petrol), "petrol");
    assert.equal(engineTypeFromWord(ENGINE_TYPE_WORD.diesel), "diesel");
    assert.equal(engineTypeFromWord(ENGINE_TYPE_WORD.hybrid), "hybrid");
    assert.equal(engineTypeFromWord(ENGINE_TYPE_WORD.plug_in), "plug_in");
    assert.equal(engineTypeFromWord(ENGINE_TYPE_WORD.electric), "electric");
  });

  it("the word is trimmed", () => {
    assert.equal(engineTypeFromWord(`  ${ENGINE_TYPE_WORD.plug_in} `), "plug_in");
  });

  it("an unknown word -> null", () => {
    assert.equal(engineTypeFromWord("גז"), null);
    assert.equal(engineTypeFromWord(""), null);
    assert.equal(engineTypeFromWord("petrol"), null);
  });

  it("is the exact inverse of ENGINE_TYPE_WORD", () => {
    for (const [code, word] of Object.entries(ENGINE_TYPE_WORD)) {
      assert.equal(engineTypeFromWord(word), code);
    }
  });
});
