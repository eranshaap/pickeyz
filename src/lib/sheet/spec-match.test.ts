// BRIEF Day 19b Run 22 §3 — the models↔spec match (findCar-schema.md §18).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { specCandidateWhere, specMatches, type SpecMatchModel } from "./spec-match";
import type { ManualSpec } from "./spec-tab";

const SPEC: ManualSpec = {
  n: 2, make: "מאזדה", model: "MAZDA 3", body_type: "האצ'בק", year: 2021, engine_size: 1998,
  engine_type: "petrol", drive_type: "4X2", sub_models: ["SPORT", "PREMIUM"],
  length_mm: 4460, width_mm: 1795, height_mm: 1435, trunk_liters: 358, tank_liters: 51,
  km_per_liter: 15.6, carzone_url: "https://www.carzone.co.il/x", source_date: "2026-10-01",
};

const ROW: SpecMatchModel = {
  make: "מאזדה", model: "MAZDA 3", body_type: "האצ'בק", year: 2021, engine_size: 1998,
  drive_technology: "regular", fuel_type: "בנזין", drive_type: "4X2", sub_model: "PREMIUM",
};

describe("specMatches (§3.2)", () => {
  it("a matching row", () => {
    assert.equal(specMatches(ROW, SPEC), true);
  });

  it("each of the nine fields off, one at a time → no match", () => {
    const off: Partial<SpecMatchModel>[] = [
      { make: "טויוטה" }, { model: "MAZDA 6" }, { body_type: "סדאן" }, { year: 2022 }, { engine_size: 2488 },
      { drive_technology: "hybrid" }, { fuel_type: "דיזל" }, { drive_type: "4X4" }, { sub_model: "LUXURY" },
    ];
    for (const o of off) assert.equal(specMatches({ ...ROW, ...o }, SPEC), false, JSON.stringify(o));
  });

  it("a null on the row's side never matches", () => {
    for (const k of Object.keys(ROW) as (keyof SpecMatchModel)[]) {
      assert.equal(specMatches({ ...ROW, [k]: null }, SPEC), false, k);
    }
  });

  it("regular + בנזין vs petrol → match; regular + חשמל/בנזין vs petrol → no match (the code is null)", () => {
    assert.equal(specMatches({ ...ROW, drive_technology: "regular", fuel_type: "בנזין" }, SPEC), true);
    assert.equal(specMatches({ ...ROW, drive_technology: "regular", fuel_type: "חשמל/בנזין" }, SPEC), false);
  });

  it("hybrid vs hybrid whatever the fuel", () => {
    const hybrid: ManualSpec = { ...SPEC, engine_type: "hybrid" };
    assert.equal(specMatches({ ...ROW, drive_technology: "hybrid", fuel_type: "חשמל/בנזין" }, hybrid), true);
    assert.equal(specMatches({ ...ROW, drive_technology: "hybrid", fuel_type: "בנזין" }, hybrid), true);
    assert.equal(specMatches({ ...ROW, drive_technology: "hybrid", fuel_type: null }, hybrid), true);
  });

  it("the trim in the list vs not", () => {
    assert.equal(specMatches({ ...ROW, sub_model: "SPORT" }, SPEC), true);
    assert.equal(specMatches({ ...ROW, sub_model: "SPORT PREMIUM" }, SPEC), false);
  });

  it("padded text on the row's side matches; letters are not folded", () => {
    const padded: SpecMatchModel = {
      ...ROW, make: " מאזדה ", model: "MAZDA 3 ", body_type: " האצ'בק", drive_technology: " regular ",
      fuel_type: " בנזין ", drive_type: "4X2 ", sub_model: " SPORT ",
    };
    assert.equal(specMatches(padded, SPEC), true);
    assert.equal(specMatches({ ...ROW, model: "Mazda 3" }, SPEC), false);
    assert.equal(specMatches({ ...ROW, drive_type: "4x2" }, SPEC), false);
  });
});

describe("specCandidateWhere (§3.3)", () => {
  it("the Prisma-shaped filter, no engine field", () => {
    assert.deepEqual(specCandidateWhere(SPEC), {
      make: "מאזדה", model: "MAZDA 3", body_type: "האצ'בק", year: 2021, engine_size: 1998,
      drive_type: "4X2", sub_model: { in: ["SPORT", "PREMIUM"] },
    });
  });
});
