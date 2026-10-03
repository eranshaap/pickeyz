// BRIEF Day 19b Run 22 §5 — the failed-cars file.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FAILED_CARS_PATH, FAILED_REASON, failedCarsCsv, type FailedCar } from "./failed-cars";

const HEADER = "מספר רישוי,קישור למודעה,דגם ברישוי,שנה ברישוי,סיבה,פרטים,לא נוסה";
const LINK = "https://www.yad2.co.il/vehicles/item/abc123";

const ROW: FailedCar = {
  plate: "1234567", link: LINK, registry_model: "MAZDA MAZDA 3", registry_year: 2021,
  reason: "city_unknown", details: "קריית ביאליק", not_tried: false,
};

describe("failedCarsCsv (§5.4)", () => {
  it("the path is the project folder's failed-cars.csv", () => {
    assert.equal(FAILED_CARS_PATH, "failed-cars.csv");
  });

  it("starts with the BOM, then the header", () => {
    const text = failedCarsCsv([]);
    assert.equal(text.charCodeAt(0), 0xfeff);
    assert.equal(text.slice(1).split("\r\n")[0], HEADER);
  });

  it("zero rows → the BOM and the header line only", () => {
    assert.equal(failedCarsCsv([]), `\uFEFF${HEADER}\r\n`);
  });

  it("a row with a Hebrew city in details", () => {
    assert.equal(
      failedCarsCsv([ROW]),
      `\uFEFF${HEADER}\r\n1234567,${LINK},MAZDA MAZDA 3,2021,${FAILED_REASON.city_unknown},קריית ביאליק,\r\n`,
    );
  });

  it("a field with a comma and one with a quote → quoted, the quote doubled", () => {
    const line = failedCarsCsv([{ ...ROW, registry_model: "KIA, MOTORS", details: 'say "hi"' }]).split("\r\n")[1];
    assert.equal(line, `1234567,${LINK},"KIA, MOTORS",2021,${FAILED_REASON.city_unknown},"say ""hi""",`);
  });

  it("not_tried → כן; nulls → empty fields", () => {
    const line = failedCarsCsv([{ ...ROW, registry_model: null, registry_year: null, reason: "ministry_down", details: "", not_tried: true }]).split("\r\n")[1];
    assert.equal(line, `1234567,${LINK},,,המשרד לא ענה,,כן`);
  });

  it("\\r\\n line ends, no bare \\n", () => {
    const text = failedCarsCsv([ROW, { ...ROW, plate: "7654321" }]);
    assert.equal(text.split("\r\n").length, 4); // header, two rows, the empty tail
    assert.equal(text.replace(/\r\n/g, "").includes("\n"), false);
  });

  it("the nine reasons", () => {
    assert.deepEqual(Object.keys(FAILED_REASON), [
      "area_empty", "city_unknown", "plate_not_in_registry", "no_degem_code", "unexpected_model",
      "year_mismatch", "version_not_in_catalog", "catalog_translation", "ministry_down",
    ]);
  });
});
