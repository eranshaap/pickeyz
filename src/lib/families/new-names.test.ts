// Opening screen, F3c §4 — a new name in the sheet import, on small fixtures of real names built with
// parseReview. As in review.test.ts, the Hebrew make spellings are looked up in words.ts by their English
// name (words.ts is the only file of src/lib/families with Hebrew letters); the Hebrew display names are
// placeholders ("he:...").

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CatalogRow } from "./distribution";
import { quantityKey } from "./distribution";
import { entryReason, guessDecision, newNameRow, type Guess } from "./new-names";
import { parseReview, type TextRow } from "./review";
import { MAKE_MERGES, MAKES, MAKES_HEADERS, MODELS_HEADERS, SPELLING_SEPARATOR } from "./words";

const heOf = (english: string): string => {
  const found = Object.keys(MAKES).find((k) => MAKES[k].english === english);
  assert.ok(found, `no MAKES entry for ${english}`);
  return found;
};
const MERCEDES = heOf("MERCEDES");
const MERCEDES_MERGED = Object.keys(MAKE_MERGES).find((k) => MAKE_MERGES[k] === MERCEDES)!;
const HYUNDAI = heOf("HYUNDAI");
const TOYOTA = heOf("TOYOTA");
const BMW = heOf("BMW");
const HONDA = heOf("HONDA");
const PORSCHE = heOf("PORSCHE");
const join = (...parts: string[]) => parts.join(SPELLING_SEPARATOR);

const [M_CATALOG_MAKE, M_GROUP, M_CATALOG_NAME, M_ACTIVE, M_YEARS, M_LIVE, M_MAKE, M_MODEL, M_NAME_HE] = MODELS_HEADERS;
const [K_CATALOG_MAKE, , K_NAME_EN, K_NAME_HE] = MAKES_HEADERS;

const cells = (headers: readonly string[], values: Record<string, string>): string[] => headers.map((h) => values[h] ?? "");

const modelRow = (row: number, catalogMake: string, catalogName: string, make: string, model: string, nameHe: string): TextRow => ({
  row,
  cells: cells(MODELS_HEADERS, { [M_CATALOG_MAKE]: catalogMake, [M_CATALOG_NAME]: catalogName, [M_MAKE]: make, [M_MODEL]: model, [M_NAME_HE]: nameHe }),
});

const makeRow = (row: number, catalogMake: string, nameEn: string, nameHe: string): TextRow => ({
  row,
  cells: cells(MAKES_HEADERS, { [K_CATALOG_MAKE]: catalogMake, [K_NAME_EN]: nameEn, [K_NAME_HE]: nameHe }),
});

const FILE = parseReview(
  [
    // One key per row: the family C-CLASS spans two rows.
    modelRow(2, join(MERCEDES, MERCEDES_MERGED), join("C200", "MERCEDES C200"), "MERCEDES", "C-CLASS", "he:c-class"),
    modelRow(3, MERCEDES, "C180", "MERCEDES", "C-CLASS", "he:c-class"),
    modelRow(4, HYUNDAI, join("IONIQ", "HYUNDAI IONIQ"), "HYUNDAI", "IONIQ", "he:ioniq"),
    modelRow(5, HYUNDAI, "TUCSON", "HYUNDAI", "TUCSON", "he:tucson"),
    modelRow(6, TOYOTA, join("COROLLA", "TOYOTA COROLLA"), "TOYOTA", "COROLLA", "he:corolla"),
    modelRow(7, TOYOTA, "COROLLA CROSS", "TOYOTA", "COROLLA CROSS", "he:corolla-cross"),
    modelRow(8, TOYOTA, "PRIUS", "TOYOTA", "", ""),
    modelRow(9, BMW, join("MINI COOPER", "COOPER"), "MINI", "COOPER", "he:cooper"),
    modelRow(10, HONDA, "CIVIC", "HONDA", "", ""),
  ],
  [
    makeRow(2, join(MERCEDES, MERCEDES_MERGED), "MERCEDES", "he:mercedes"),
    makeRow(3, HYUNDAI, "HYUNDAI", "he:hyundai"),
    makeRow(4, TOYOTA, "TOYOTA", "he:toyota"),
    makeRow(5, BMW, "BMW", "he:bmw"),
    makeRow(6, "", "MINI", "he:mini"),
    makeRow(7, HONDA, "HONDA", "he:honda"),
  ],
);

describe("entryReason", () => {
  it("a name with no row in the file: name_not_in_file", () => {
    assert.equal(entryReason(FILE, HYUNDAI, "IONIQ6"), "name_not_in_file");
  });

  it("a name whose row has an empty model: name_without_model", () => {
    assert.equal(entryReason(FILE, TOYOTA, "TOYOTA PRIUS"), "name_without_model");
  });

  it("a name whose row has a model: name_not_imported", () => {
    assert.equal(entryReason(FILE, HYUNDAI, "TUCSON"), "name_not_imported");
  });
});

describe("guessDecision", () => {
  const guess = (makeEn: string, model: string, nameHe: string): Guess => ({ makeEn, model, nameHe });

  it("C200 AMG: Mercedes C-CLASS, through its spelling C200 (under the merged make spelling too)", () => {
    assert.deepEqual(guessDecision(FILE, MERCEDES, "C200 AMG"), guess("MERCEDES", "C-CLASS", "he:c-class"));
    assert.deepEqual(guessDecision(FILE, MERCEDES_MERGED, "MERCEDES C200 AMG"), guess("MERCEDES", "C-CLASS", "he:c-class"));
  });

  it("IONIQ6 does not match IONIQ: the make's English name, model and Hebrew name empty", () => {
    assert.deepEqual(guessDecision(FILE, HYUNDAI, "IONIQ6"), guess("HYUNDAI", "", ""));
  });

  it("TUCSON N LINE: TUCSON", () => {
    assert.deepEqual(guessDecision(FILE, HYUNDAI, "TUCSON  N LINE"), guess("HYUNDAI", "TUCSON", "he:tucson"));
  });

  it("COROLLA CROSS HEV: COROLLA CROSS, not COROLLA — the longest matching name wins", () => {
    assert.deepEqual(guessDecision(FILE, TOYOTA, "TOYOTA COROLLA CROSS HEV"), guess("TOYOTA", "COROLLA CROSS", "he:corolla-cross"));
    assert.deepEqual(guessDecision(FILE, TOYOTA, "COROLLA HEV"), guess("TOYOTA", "COROLLA", "he:corolla"));
  });

  it("ACCORD under Honda: HONDA, model and Hebrew name empty (the CIVIC row has no model)", () => {
    assert.deepEqual(guessDecision(FILE, HONDA, "ACCORD"), guess("HONDA", "", ""));
    assert.deepEqual(guessDecision(FILE, HONDA, "CIVIC TYPE R"), guess("HONDA", "", ""));
  });

  it("a make outside the makes tab: all three empty", () => {
    assert.deepEqual(guessDecision(FILE, PORSCHE, "TAYCAN"), guess("", "", ""));
  });

  it("a MINI spelling under BMW's catalog make: MINI", () => {
    assert.deepEqual(guessDecision(FILE, BMW, "MINI COOPER S"), guess("MINI", "COOPER", "he:cooper"));
  });
});

describe("newNameRow", () => {
  const row = (model: string, vehicleClass: string, degemCd: string, year: number): CatalogRow => ({
    make: TOYOTA, model, vehicleClass, tozeretCd: "1", degemCd, year,
  });
  // One catalogKey (TOYOTA, COROLLACROSSHEV), every year and class, in models.id order.
  const ROWS: CatalogRow[] = [
    row("COROLLA CROSS H.E.V", "P", "100", 2014),
    row("COROLLA CROSS HEV", "P", "100", 2020),
    row("TOYOTA COROLLA CROSS HEV", "P", "101", 2021),
    row("COROLLA-CROSS HEV", "M", "102", 2022),
  ];
  const COUNTS = new Map([
    [quantityKey("1", "100", 2014), 999],
    [quantityKey("1", "100", 2020), 50],
    [quantityKey("1", "101", 2021), 120],
    [quantityKey("1", "102", 2022), 777],
  ]);
  const GUESS: Guess = { makeEn: "TOYOTA", model: "COROLLA CROSS", nameHe: "he:corolla-cross" };
  const at = (cells: (string | number)[], header: string) => cells[MODELS_HEADERS.indexOf(header as (typeof MODELS_HEADERS)[number])];

  it("the cells come out in header order, the guess last, the live column empty", () => {
    const cells = newNameRow({ make: TOYOTA, model: "COROLLA CROSS HEV", rows: ROWS, counts: COUNTS, guess: GUESS });
    assert.deepEqual(cells, [
      TOYOTA,
      "COROLLA",
      join("TOYOTA COROLLA CROSS HEV", "COROLLA CROSS HEV", "COROLLA CROSS H.E.V", "COROLLA-CROSS HEV"),
      170,
      "2020-2021",
      "",
      "TOYOTA",
      "COROLLA CROSS",
      "he:corolla-cross",
    ]);
    assert.equal(at(cells, M_GROUP), "COROLLA");
  });

  it("the spellings are joined with SPELLING_SEPARATOR, the most active first", () => {
    const cells = newNameRow({ make: TOYOTA, model: "COROLLA CROSS HEV", rows: ROWS, counts: COUNTS, guess: GUESS });
    assert.deepEqual(String(at(cells, M_CATALOG_NAME)).split(SPELLING_SEPARATOR), [
      "TOYOTA COROLLA CROSS HEV", "COROLLA CROSS HEV", "COROLLA CROSS H.E.V", "COROLLA-CROSS HEV",
    ]);
  });

  it("rows before 2015 and class-M rows are left out of the active and years columns, not out of the spellings", () => {
    const cells = newNameRow({ make: TOYOTA, model: "COROLLA CROSS HEV", rows: ROWS, counts: COUNTS, guess: GUESS });
    assert.equal(at(cells, M_ACTIVE), 170);
    assert.equal(at(cells, M_YEARS), "2020-2021");
    assert.ok(String(at(cells, M_CATALOG_NAME)).includes("COROLLA CROSS H.E.V"));
    assert.ok(String(at(cells, M_CATALOG_NAME)).includes("COROLLA-CROSS HEV"));

    const outside = newNameRow({ make: TOYOTA, model: "COROLLA CROSS HEV", rows: [ROWS[0], ROWS[3]], counts: COUNTS, guess: GUESS });
    assert.equal(at(outside, M_ACTIVE), 0);
    assert.equal(at(outside, M_YEARS), "");
    assert.equal(at(outside, M_CATALOG_NAME), join("COROLLA CROSS H.E.V", "COROLLA-CROSS HEV"));
  });

  it("the active column is empty when the counts are null; the years stay", () => {
    const cells = newNameRow({ make: TOYOTA, model: "COROLLA CROSS HEV", rows: ROWS, counts: null, guess: GUESS });
    assert.equal(at(cells, M_ACTIVE), "");
    assert.equal(at(cells, M_YEARS), "2020-2021");
    assert.equal(at(cells, M_LIVE), "");
    assert.equal(at(cells, M_CATALOG_NAME), join("COROLLA CROSS H.E.V", "COROLLA CROSS HEV", "TOYOTA COROLLA CROSS HEV", "COROLLA-CROSS HEV"));
  });

  it("no catalog rows, or a row of another catalogKey, throws", () => {
    assert.throws(() => newNameRow({ make: TOYOTA, model: "COROLLA CROSS HEV", rows: [], counts: COUNTS, guess: GUESS }), /no catalog rows/);
    assert.throws(
      () => newNameRow({ make: TOYOTA, model: "COROLLA CROSS HEV", rows: [...ROWS, row("COROLLA", "P", "103", 2020)], counts: COUNTS, guess: GUESS }),
      /another catalogKey/,
    );
  });
});
