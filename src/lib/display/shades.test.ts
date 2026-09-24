// BRIEF Run 9 §1.1 — the shade ladder. Pure: no DOM, no clock, no database.
//
// The conversion anchors below PIN THE MATRICES: shades.ts writes out sRGB -> OKLab by hand (no dependency
// is allowed), so the two published anchors — white's lightness and red's full triple — are what says the
// arithmetic is Ottosson's and not a typo.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hexToOklab, LIGHT_END, oklabToHex, shadeFor } from "./shades";

const PAGE_COLORS = Object.keys(LIGHT_END);

/** The lightness of a rendered shade, read back out of its hex — how "lighter" is asserted below. */
const lightnessOf = (hex: string): number => hexToOklab(hex).L;

describe("the two ends (§1.1)", () => {
  it("2 owners: index 1 is the light end and index 0 the page colour, both VERBATIM, for all five colours", () => {
    for (const c of PAGE_COLORS) {
      assert.equal(shadeFor(0, 2, c), c);
      assert.equal(shadeFor(1, 2, c), LIGHT_END[c]);
    }
  });

  it("1 owner -> the page colour", () => {
    for (const c of PAGE_COLORS) assert.equal(shadeFor(0, 1, c), c);
  });

  it("the CURRENT ownership is the page colour for every owner count", () => {
    for (const c of PAGE_COLORS) {
      for (let n = 1; n <= 20; n += 1) assert.equal(shadeFor(0, n, c), c, `${c} at n=${n}`);
    }
  });
});

describe("the rungs between them (§1.1)", () => {
  it("3 owners: three distinct values, the ends verbatim, the middle strictly between them in lightness", () => {
    for (const c of PAGE_COLORS) {
      const ladder = [shadeFor(0, 3, c), shadeFor(1, 3, c), shadeFor(2, 3, c)];
      assert.equal(new Set(ladder).size, 3, `${c} repeated a shade at 3 owners`);
      assert.equal(ladder[0], c);
      assert.equal(ladder[2], LIGHT_END[c]);
      assert.ok(lightnessOf(ladder[0]) < lightnessOf(ladder[1]), `${c}: the middle rung is not lighter than the page colour`);
      assert.ok(lightnessOf(ladder[1]) < lightnessOf(ladder[2]), `${c}: the middle rung is not darker than the light end`);
    }
  });

  it("8 owners: eight distinct values, lightness strictly increasing with the index, the ends verbatim", () => {
    for (const c of PAGE_COLORS) {
      const ladder = Array.from({ length: 8 }, (_, i) => shadeFor(i, 8, c));
      assert.equal(new Set(ladder).size, 8, `${c} repeated a shade at 8 owners`);
      assert.equal(ladder[0], c);
      assert.equal(ladder[7], LIGHT_END[c]);
      for (let i = 1; i < 8; i += 1) {
        assert.ok(lightnessOf(ladder[i]) > lightnessOf(ladder[i - 1]), `${c}: rung ${i} is not lighter than rung ${i - 1}`);
      }
      assert.ok(ladder.every((v) => /^#[0-9a-f]{6}$/.test(v)), `${c} produced something that is not a lower-case hex colour`);
    }
  });

  it("9 owners: the ladder repeats — index 8, the oldest ownership, is the page colour again", () => {
    for (const c of PAGE_COLORS) {
      assert.equal(shadeFor(8, 9, c), c);
      assert.equal(shadeFor(0, 9, c), c);
      assert.equal(shadeFor(7, 9, c), LIGHT_END[c]); // the eighth rung is still the light end
    }
  });
});

describe("the page colour is a closed set (§1.1)", () => {
  it("an unknown page colour throws — it never falls back to a shade of something else", () => {
    assert.throws(() => shadeFor(1, 3, "#123456"), /not one of the five page colours/);
    assert.throws(() => shadeFor(1, 3, "wine"), /not one of the five page colours/);
    assert.throws(() => shadeFor(1, 3, "#6B1F31"), /not one of the five page colours/); // the keys are lower-case
  });
});

describe("the OKLab conversion anchors (§1.1)", () => {
  it("sRGB #ffffff -> L = 1.000, a = b = 0", () => {
    const w = hexToOklab("#ffffff");
    assert.ok(Math.abs(w.L - 1) < 0.001, `L was ${w.L}`);
    assert.ok(Math.abs(w.a) < 0.001, `a was ${w.a}`);
    assert.ok(Math.abs(w.b) < 0.001, `b was ${w.b}`);
  });

  it("sRGB #ff0000 -> L 0.628, a 0.225, b 0.126", () => {
    const r = hexToOklab("#ff0000");
    assert.ok(Math.abs(r.L - 0.628) < 0.002, `L was ${r.L}`);
    assert.ok(Math.abs(r.a - 0.225) < 0.002, `a was ${r.a}`);
    assert.ok(Math.abs(r.b - 0.126) < 0.002, `b was ${r.b}`);
  });

  it("every key and every value of LIGHT_END round-trips hex -> OKLab -> hex to the same string", () => {
    for (const [dark, light] of Object.entries(LIGHT_END)) {
      assert.equal(oklabToHex(hexToOklab(dark)), dark);
      assert.equal(oklabToHex(hexToOklab(light)), light);
    }
  });

  it("a colour that is not #rrggbb is a stop, never a silent grey", () => {
    assert.throws(() => hexToOklab("#abc"), /not a "#rrggbb" colour/);
    assert.throws(() => hexToOklab("wine"), /not a "#rrggbb" colour/);
  });
});
