// Day 19 (§2) — the one age helper: the arithmetic, and the fact that it does not floor.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ageYears, YEAR_MS } from "./age";

const d = (iso: string) => new Date(iso);

describe("ageYears() (Day 19 §2)", () => {
  it("YEAR_MS is the Julian year the engine has always used", () => {
    assert.equal(YEAR_MS, 365.25 * 24 * 60 * 60 * 1000);
  });

  it("whole years", () => {
    const from = d("2020-09-06T12:00:00.000Z");
    assert.equal(ageYears(from, new Date(from.getTime() + 4 * YEAR_MS)), 4);
    assert.equal(ageYears(from, new Date(from.getTime() + 0.5 * YEAR_MS)), 0.5);
  });

  it("years with decimals — a span of days", () => {
    const from = d("2021-03-01T00:00:00.000Z");
    const at = d("2026-09-18T00:00:00.000Z");
    assert.equal(ageYears(from, at), (at.getTime() - from.getTime()) / YEAR_MS);
  });

  it("the same moment is zero", () => {
    const t = d("2026-09-18T00:00:00.000Z");
    assert.equal(ageYears(t, t), 0);
  });

  it("a negative span stays negative — the floor is kmRow's business, not the helper's", () => {
    const from = d("2026-09-18T00:00:00.000Z");
    const at = d("2026-03-18T00:00:00.000Z");
    const got = ageYears(from, at);
    assert.ok(got < 0, `expected a negative span, got ${got}`);
    assert.equal(got, (at.getTime() - from.getTime()) / YEAR_MS);
  });

  it("is antisymmetric", () => {
    const a = d("2022-01-01T00:00:00.000Z");
    const b = d("2026-07-01T00:00:00.000Z");
    assert.equal(ageYears(a, b), -ageYears(b, a));
  });
});
