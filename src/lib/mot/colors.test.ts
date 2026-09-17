// Day 18 §9 — the colour dictionary of §3.2: every listed spelling, the cleaning, and the unknown side.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { colorFamily } from "./colors";

describe("colorFamily (§3.2)", () => {
  it("every registry word of §3.2 maps to its family", () => {
    const registry: [string, string][] = [
      ["שנהב לבן", "white"], ["שחור", "black"], ["שחור מטלי", "black"],
      ["כסף", "grey"], ["כסף מטלי", "grey"], ["כסוף כהה", "grey"], ["אפור", "grey"], ["אפור כהה מטלי", "grey"],
      ["כחול", "blue"], ["כחול מטל", "blue"], ["זהוב", "brown"],
    ];
    for (const [word, family] of registry) assert.equal(colorFamily(word), family, word);
  });

  it("every ad word of §3.2 maps to its family", () => {
    const ad: [string, string][] = [
      ["לבן", "white"], ["שחור", "black"], ["שחור מטאלי", "black"],
      ["כסוף", "grey"], ["כסוף מטאלי", "grey"], ["כסף מטאלי", "grey"], ["אפור", "grey"], ["אפור מטאלי", "grey"], ["אפור עכבר", "grey"],
      ["כחול", "blue"], ["כחול מטאלי", "blue"],
    ];
    for (const [word, family] of ad) assert.equal(colorFamily(word), family, word);
  });

  it("silver is grey: the registry's כסף and the ad's כסוף are one family", () => {
    assert.equal(colorFamily("כסף"), colorFamily("כסוף"));
  });

  it("the lookup runs after translator.ts's clean(): quotes dropped, spaces collapsed, trimmed", () => {
    assert.equal(colorFamily("  שנהב   לבן "), "white");
    assert.equal(colorFamily('אפור" עכבר'), "grey");
  });

  it("an unknown word, an empty word and null are all null — never a throw", () => {
    assert.equal(colorFamily("סגול"), null);
    assert.equal(colorFamily("בורדו"), null); // a family member by definition, but not a listed spelling
    assert.equal(colorFamily(""), null);
    assert.equal(colorFamily("   "), null);
    assert.equal(colorFamily(null), null);
  });
});
