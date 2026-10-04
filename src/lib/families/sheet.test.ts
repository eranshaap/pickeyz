// Opening screen, F2 — the review sheet's rows (BRIEF §10.6), on fixture tables with Latin make names
// (the real tables are Hebrew and live only in words.ts; their shape is checked at the end).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSheet, canonicalMake, liveKey, makeKey, missingMakeEntries, type ActiveRow, type SheetInput } from "./sheet";
import { MAKE_MERGES, MAKES } from "./words";

let seq = 0;
const row = (make: string, model: string, year: number, active: number): ActiveRow => ({
  make, model, year, active, vehicleClass: "P", tozeretCd: "1", degemCd: String(++seq),
});

const ROWS: ActiveRow[] = [
  row("MAZDA CO", "MAZDA CX-5", 2016, 60),
  row("MAZDA INC", "CX5", 2020, 50), // a merged make spelling and a merged name
  row("MAZDA CO", "MAZDA 3", 2015, 40),
  row("MAZDA CO", "3", 2018, 70),
  row("MAZDA CO", "MX 5", 2017, 30), // group MX5: 30, below the bar — dropped whole
  row("MAZDA CO", "CX-30", 2021, 20),
  row("TOYOTA CO", "YARIS", 2015, 80),
  row("TOYOTA CO", "YARIS CROSS", 2022, 30), // below the bar on its own, inside a kept group
  row("TOYOTA CO", "COROLLA", 2019, 300),
  row("SERES", "SERES 5", 2023, 90), // no MAKES entry (grouped with no prefixes), no kept group: not a stop
];

const input = (over: Partial<SheetInput> = {}): SheetInput => ({
  rows: ROWS,
  live: new Set([liveKey("MAZDA INC", "CX5"), liveKey("TOYOTA CO", "YARIS CROSS")]),
  makeMerges: { "MAZDA INC": "MAZDA CO" },
  makes: {
    "MAZDA CO": { english: "MAZDA", prefixes: ["MAZDA"] },
    "TOYOTA CO": { english: "TOYOTA", prefixes: ["TOYOTA"] },
  },
  minActive: 100,
  ...over,
});

describe("buildSheet", () => {
  const sheet = buildSheet(input());

  it("orders makes, groups and names by active; keeps every name of a kept group; drops small groups whole", () => {
    assert.deepEqual(
      sheet.models.map((m) => [m.catalogMake, m.group, m.catalogName, m.active, m.years]),
      [
        ["TOYOTA CO", "COROLLA", "COROLLA", 300, "2019-2019"],
        ["TOYOTA CO", "YARIS", "YARIS", 80, "2015-2015"],
        ["TOYOTA CO", "YARIS", "YARIS CROSS", 30, "2022-2022"],
        ["MAZDA CO · MAZDA INC", "CX5", "MAZDA CX-5 · CX5", 110, "2016-2020"],
        ["MAZDA CO · MAZDA INC", "3", "3 · MAZDA 3", 110, "2015-2018"],
      ],
    );
  });

  it("a group passes as the sum of its names (YARIS 80 + 30)", () => {
    assert.ok(sheet.models.filter((m) => m.group === "YARIS").every((m) => m.active < 100));
  });

  it("the live flag is set when any catalog row of the merged name is live", () => {
    assert.deepEqual(
      sheet.models.map((m) => [m.catalogName, m.live]),
      [["COROLLA", false], ["YARIS", false], ["YARIS CROSS", true], ["MAZDA CX-5 · CX5", true], ["3 · MAZDA 3", false]],
    );
  });

  it("fills the English make and the spellings array", () => {
    assert.deepEqual(sheet.models.map((m) => m.englishMake), ["TOYOTA", "TOYOTA", "TOYOTA", "MAZDA", "MAZDA"]);
    assert.deepEqual(sheet.models[3].spellings, ["MAZDA CX-5", "CX5"]);
  });

  it("one make row per make with a kept group; its active counts all its rows", () => {
    assert.deepEqual(
      sheet.makes.map((m) => [m.catalogSpellings, m.active, m.english]),
      [
        ["TOYOTA CO", 410, "TOYOTA"],
        ["MAZDA CO · MAZDA INC", 270, "MAZDA"],
      ],
    );
  });

  it("a shown-spelling tie keeps the first seen in row order", () => {
    const s = buildSheet(input({ rows: [row("TOYOTA CO", "TOYOTA COROLLA", 2015, 100), row("TOYOTA CO", "COROLLA", 2016, 100)] }));
    assert.equal(s.models[0].catalogName, "TOYOTA COROLLA · COROLLA");
  });
});

describe("missingMakeEntries", () => {
  it("is empty when every make with a kept group has an entry", () => {
    assert.deepEqual(missingMakeEntries(input()), []);
  });

  it("names a make with a kept group and no entry, with its kept groups; buildSheet throws", () => {
    const rows = [...ROWS, row("SERES", "SERES 5 PRO", 2024, 20)];
    assert.deepEqual(missingMakeEntries(input({ rows })), [{ make: "SERES", groups: [{ key: "SERES5", total: 110 }] }]);
    assert.throws(() => buildSheet(input({ rows })), /SERES/);
  });
});

describe("makeKey / canonicalMake", () => {
  it("trims, collapses whitespace, maps U+05F3 and U+2019 to U+0027", () => {
    const rightQuote = String.fromCharCode(0x2019);
    const geresh = String.fromCharCode(0x05f3);
    assert.equal(makeKey(`  A${rightQuote}B  \t C${geresh} `), "A'B C'");
  });

  it("folds through the merges after the key", () => {
    assert.equal(canonicalMake(" MAZDA  INC ", { "MAZDA INC": "MAZDA CO" }), "MAZDA CO");
    assert.equal(canonicalMake("OTHER", { "MAZDA INC": "MAZDA CO" }), "OTHER");
    assert.equal(canonicalMake("constructor", {}), "constructor");
  });
});

describe("words.ts tables", () => {
  it("hold 8 merges and 60 makes", () => {
    assert.equal(Object.keys(MAKE_MERGES).length, 8);
    assert.equal(Object.keys(MAKES).length, 60);
  });

  it("are written in the compared form", () => {
    for (const [from, to] of Object.entries(MAKE_MERGES)) {
      assert.equal(makeKey(from), from);
      assert.equal(makeKey(to), to);
    }
    for (const make of Object.keys(MAKES)) assert.equal(makeKey(make), make);
  });

  it("every merge target has a MAKES entry, no merge source has one", () => {
    for (const [from, to] of Object.entries(MAKE_MERGES)) {
      assert.ok(Object.hasOwn(MAKES, to), `target ${to}`);
      assert.ok(!Object.hasOwn(MAKES, from), `source ${from}`);
    }
  });

  // The lists are kept as the brief gives them (not all longest first): stripMake sorts by length itself.
  it("english names are set; prefixes are uppercase and trimmed", () => {
    for (const { english, prefixes } of Object.values(MAKES)) {
      assert.ok(english.length > 0);
      for (const p of prefixes) assert.equal(p, p.trim().toUpperCase());
    }
  });
});
