// Opening screen, S1 §3–§4 — completionPanel, exactModel and hintText on a three-make fixture.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { completionPanel, exactModel, fullName, hintText, moveMark, panelModels, type FamilyEntry, type MakeEntry, type PanelGroup } from "./completion";

const MAZDA: MakeEntry = { id: 1, nameHe: "מאזדה", nameEn: "MAZDA", aliases: ["מזדה", "mazda"] };
const HYUNDAI: MakeEntry = { id: 2, nameHe: "יונדאי", nameEn: "HYUNDAI", aliases: [] };
const JEEP: MakeEntry = { id: 3, nameHe: "ג'יפ", nameEn: "JEEP", aliases: [] };

const MAZDA_3: FamilyEntry = { id: 11, make: MAZDA, nameHe: "3", nameEn: "3", aliases: ["MAZDA 3", "MAZDA3"], live: true };
const CX_5: FamilyEntry = { id: 12, make: MAZDA, nameHe: "CX-5", nameEn: "CX-5", aliases: [], live: false };
const IONIQ: FamilyEntry = { id: 21, make: HYUNDAI, nameHe: "איוניק", nameEn: "IONIQ", aliases: ["IONIQ HYBRID", "IONIQ ELECTRIC"], live: true };
const TUCSON: FamilyEntry = { id: 22, make: HYUNDAI, nameHe: "טוסון", nameEn: "TUCSON", aliases: [], live: false };
const CHEROKEE: FamilyEntry = { id: 31, make: JEEP, nameHe: "צ'רוקי", nameEn: "CHEROKEE", aliases: [], live: true };

const ALL: FamilyEntry[] = [MAZDA_3, CX_5, IONIQ, TUCSON, CHEROKEE];

// Ten more live families under a fourth make: 13 live in all, one past LIVE_MODELS_LIST_MAX.
const TOYOTA: MakeEntry = { id: 4, nameHe: "טויוטה", nameEn: "TOYOTA", aliases: [] };
const THIRTEEN_LIVE: FamilyEntry[] = [
  ...ALL,
  ...Array.from({ length: 10 }, (_, i): FamilyEntry => ({ id: 41 + i, make: TOYOTA, nameHe: `דגם ${i + 1}`, nameEn: `MODEL ${i + 1}`, aliases: [], live: true })),
];

const g = (make: MakeEntry, ...models: FamilyEntry[]): PanelGroup => ({
  make: { id: make.id, nameHe: make.nameHe },
  models: models.map((f) => ({ id: f.id, nameHe: f.nameHe, fullName: fullName(f) })),
});

// ג'יפ, יונדאי, מאזדה — the makes in "he" order.
const HAVE: PanelGroup[] = [g(JEEP, CHEROKEE), g(HYUNDAI, IONIQ), g(MAZDA, MAZDA_3)];
const ONLY_MAZDA_3 = { kind: "list", notice: null, groups: [g(MAZDA, MAZDA_3)] };

describe("completionPanel — the empty bar", () => {
  it("lists every live model, three groups in he order, no notice", () => {
    assert.deepEqual(completionPanel(ALL, ""), { kind: "list", notice: null, groups: HAVE });
  });

  it("adds the notice with needModel", () => {
    assert.deepEqual(completionPanel(ALL, "  ", true), { kind: "list", notice: "צריך לבחור דגם.", groups: HAVE });
  });

  it("orders models within a make by nameHe", () => {
    const panel = completionPanel([{ ...CX_5, live: true, nameHe: "סי איקס 5" }, MAZDA_3, { ...MAZDA_3, id: 13, nameHe: "2" }], "");
    assert.deepEqual(panel.kind === "list" ? panel.groups[0].models.map((m) => m.nameHe) : null, ["2", "3", "סי איקס 5"]);
  });

  it("is closed with 13 live families", () => {
    assert.deepEqual(completionPanel(THIRTEEN_LIVE, ""), { kind: "closed" });
  });

  it("is the notice alone with 13 live families and needModel", () => {
    assert.deepEqual(completionPanel(THIRTEEN_LIVE, "", true), { kind: "list", notice: "צריך לבחור דגם.", groups: [] });
  });
});

describe("completionPanel — a match", () => {
  for (const typed of ["מא", "מזדה", "nt"]) {
    it(`${typed} offers only מאזדה 3 (CX-5 is not live)`, () => {
      assert.deepEqual(completionPanel(ALL, typed), ONLY_MAZDA_3);
    });
  }

  it("איו offers איוניק under יונדאי", () => {
    assert.deepEqual(completionPanel(ALL, "איו"), { kind: "list", notice: null, groups: [g(HYUNDAI, IONIQ)] });
  });

  for (const typed of ["mazda 3", "MAZDA3", "מאזדה  3"]) {
    it(`${typed} offers מאזדה 3`, () => {
      assert.deepEqual(completionPanel(ALL, typed), ONLY_MAZDA_3);
    });
  }

  it("the geresh typed as U+05F3 finds צ'רוקי under ג'יפ", () => {
    const typed = "ג" + String.fromCharCode(0x5f3) + "י";
    assert.deepEqual(completionPanel(ALL, typed), { kind: "list", notice: null, groups: [g(JEEP, CHEROKEE)] });
  });

  it("keeps the notice on a match with needModel", () => {
    assert.deepEqual(completionPanel(ALL, "מא", true), { ...ONLY_MAZDA_3, notice: "צריך לבחור דגם." });
  });
});

describe("completionPanel — the grey line", () => {
  it("יונדאי טו is a catalog model we do not have: the line, the have line and all three groups", () => {
    assert.deepEqual(completionPanel(ALL, "יונדאי טו"), { kind: "grey", line: "אין לנו דגם כזה בינתיים.", haveLine: "כרגע יש אצלנו רק את אלה:", groups: HAVE });
  });

  for (const typed of ["סובארו", "מאזדה 3x"]) {
    it(`${typed} is nothing in the catalog`, () => {
      assert.deepEqual(completionPanel(ALL, typed), { kind: "grey", line: "לא מצאנו דגם כזה.", haveLine: "כרגע יש אצלנו רק את אלה:", groups: HAVE });
    });
  }

  it("needModel adds nothing to the grey line", () => {
    assert.deepEqual(completionPanel(ALL, "סובארו", true), completionPanel(ALL, "סובארו"));
  });

  it("is the line alone with 13 live families", () => {
    assert.deepEqual(completionPanel(THIRTEEN_LIVE, "סובארו"), { kind: "grey", line: "לא מצאנו דגם כזה.", haveLine: null, groups: [] });
  });
});

describe("exactModel", () => {
  for (const typed of ["מאזדה 3", "MAZDA 3", "ntzsv 3"]) {
    it(`${typed} is מאזדה 3`, () => {
      assert.equal(exactModel(ALL, typed), MAZDA_3);
    });
  }

  for (const typed of ["מאזדה", "3", "יונדאי טוסון"]) {
    it(`${typed} is null`, () => {
      assert.equal(exactModel(ALL, typed), null);
    });
  }

  it("is null when two live families share the spelling", () => {
    assert.equal(exactModel([...ALL, { ...MAZDA_3, id: 99 }], "מאזדה 3"), null);
  });
});

describe("hintText", () => {
  it("a fixed random picks the expected model", () => {
    // The live families in ALL's order: מאזדה 3, יונדאי איוניק, ג'יפ צ'רוקי — 0.5 picks the second.
    assert.equal(hintText(ALL, 100, () => 0.5), "איזה דגם? למשל יונדאי איוניק");
    assert.equal(hintText(ALL, 100, () => 0), "איזה דגם? למשל מאזדה 3");
  });

  it("is the question alone when maxChars is too small for every name", () => {
    assert.equal(hintText(ALL, 6), "איזה דגם?");
  });

  it("never picks a family that is not live", () => {
    const live = new Set([MAZDA_3, IONIQ, CHEROKEE].map((f) => `איזה דגם? למשל ${fullName(f)}`));
    for (let r = 0; r < 1; r += 0.05) assert.ok(live.has(hintText(ALL, 100, () => r)));
    assert.equal(hintText([CX_5, TUCSON], 100, () => 0), "איזה דגם?");
  });
});

describe("fullName — S2 §3", () => {
  it("takes any make-and-name pair, not only a FamilyEntry", () => {
    assert.equal(fullName({ make: { nameHe: "מאזדה" }, nameHe: "3" }), "מאזדה 3");
    assert.equal(fullName(MAZDA_3), "מאזדה 3");
  });
});

describe("panelModels — S2 §5", () => {
  it("is the model rows in list order, without headers", () => {
    assert.deepEqual(panelModels(completionPanel(ALL, "")).map((m) => m.id), [CHEROKEE.id, IONIQ.id, MAZDA_3.id]);
  });

  it("is the grey panel's models under its lines", () => {
    assert.deepEqual(panelModels(completionPanel(ALL, "סובארו")).map((m) => m.id), [CHEROKEE.id, IONIQ.id, MAZDA_3.id]);
  });

  it("is empty for a closed panel and for the notice alone", () => {
    assert.deepEqual(panelModels({ kind: "closed" }), []);
    assert.deepEqual(panelModels(completionPanel(THIRTEEN_LIVE, "", true)), []);
  });
});

describe("moveMark — S2 §5", () => {
  const rows = panelModels(completionPanel(ALL, ""));

  it("down from nothing marks the first row, up from nothing the last", () => {
    assert.equal(moveMark(rows, null, 1), CHEROKEE.id);
    assert.equal(moveMark(rows, null, -1), MAZDA_3.id);
  });

  it("moves one row at a time and stops at either end", () => {
    assert.equal(moveMark(rows, CHEROKEE.id, 1), IONIQ.id);
    assert.equal(moveMark(rows, IONIQ.id, -1), CHEROKEE.id);
    assert.equal(moveMark(rows, MAZDA_3.id, 1), MAZDA_3.id);
    assert.equal(moveMark(rows, CHEROKEE.id, -1), CHEROKEE.id);
  });

  it("a mark no longer in the list counts as none; no rows, no mark", () => {
    assert.equal(moveMark(rows, 999, 1), CHEROKEE.id);
    assert.equal(moveMark([], null, 1), null);
  });
});
