// Opening screen, S3 §3–§4 — the scale of everything under the top bar.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openingScale, phoneOpeningScale } from "./layout";

const near = (actual: number, expected: number, eps = 0.005) => assert.ok(Math.abs(actual - expected) < eps, `${actual} is not about ${expected}`);

describe("openingScale — the computer", () => {
  it("is 1 on the board itself, 1,440 × 900", () => {
    assert.equal(openingScale(1440, 900, 0), 1);
    assert.equal(openingScale(1440, 900, 50), 1);
  });

  it("is 1.2 on 1,920 × 1,080 (the height ratio is the smaller)", () => {
    assert.equal(openingScale(1920, 1080, 0), 1.2);
    // with a real top bar the height ratio is a little larger, still below the width ratio 1.333
    near(openingScale(1920, 1080, 50), 1030 / 850);
  });

  it("is never below 1 in a smaller window", () => {
    assert.equal(openingScale(1280, 720, 50), 1);
    assert.equal(openingScale(900, 500, 50), 1);
    assert.equal(openingScale(1366, 768, 50), 1);
  });

  it("takes the width ratio when the window is tall and narrow", () => {
    assert.equal(openingScale(1728, 2000, 50), 1.2);
  });
});

describe("phoneOpeningScale — the phone and the iPad in portrait", () => {
  it("is 1 on the board, 390 wide and 612 under a 52 px top bar", () => {
    assert.equal(phoneOpeningScale(390, 664, 52), 1);
  });

  it("is never below 1 on a smaller phone", () => {
    assert.equal(phoneOpeningScale(360, 640, 52), 1);
    assert.equal(phoneOpeningScale(375, 667, 52), 1);
  });

  it("barely changes on a large phone", () => {
    near(phoneOpeningScale(430, 932, 52), 430 / 390);
  });

  it("grows on an iPad in portrait, by the height ratio", () => {
    near(phoneOpeningScale(768, 1024, 52), 972 / 612);
    near(phoneOpeningScale(820, 1105, 52), 1.72);
  });
});
