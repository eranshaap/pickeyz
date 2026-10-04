// Opening screen, F3 — the review file as rules (BRIEF F3 §1.4), on small fixtures of real names. The Hebrew
// make spellings are looked up in words.ts by their English name (words.ts is the only file of
// src/lib/families with Hebrew letters); the Hebrew display names are placeholders ("he:...").

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  catalogKey, parseReview, planImport, ReviewFileError,
  type DbState, type ImportPlan, type ReviewFamily, type ReviewFile, type TextRow,
} from "./review";
import { MAKE_MERGES, MAKES, MAKES_HEADERS, MAKES_TAB, MODELS_HEADERS, MODELS_TAB, SPELLING_SEPARATOR } from "./words";

const heOf = (english: string): string => {
  const found = Object.keys(MAKES).find((k) => MAKES[k].english === english);
  assert.ok(found, `no MAKES entry for ${english}`);
  return found;
};
const MAZDA = heOf("MAZDA");
const HYUNDAI = heOf("HYUNDAI");
const TOYOTA = heOf("TOYOTA");
const SUZUKI = heOf("SUZUKI");
const BMW = heOf("BMW");
const MARUTI = Object.keys(MAKE_MERGES).find((k) => MAKE_MERGES[k] === SUZUKI)!;
const join = (...parts: string[]) => parts.join(SPELLING_SEPARATOR);

const [M_CATALOG_MAKE, , M_CATALOG_NAME, , , , M_MAKE, M_MODEL, M_NAME_HE] = MODELS_HEADERS;
const [K_CATALOG_MAKE, , K_NAME_EN, K_NAME_HE, K_EXTRA] = MAKES_HEADERS;

const cells = (headers: readonly string[], values: Record<string, string>): string[] => headers.map((h) => values[h] ?? "");

const modelRow = (row: number, catalogMake: string, catalogName: string, make: string, model: string, nameHe: string): TextRow => ({
  row,
  cells: cells(MODELS_HEADERS, { [M_CATALOG_MAKE]: catalogMake, [M_CATALOG_NAME]: catalogName, [M_MAKE]: make, [M_MODEL]: model, [M_NAME_HE]: nameHe }),
});

const makeRow = (row: number, catalogMake: string, nameEn: string, nameHe: string, extra = ""): TextRow => ({
  row,
  cells: cells(MAKES_HEADERS, { [K_CATALOG_MAKE]: catalogMake, [K_NAME_EN]: nameEn, [K_NAME_HE]: nameHe, [K_EXTRA]: extra }),
});

const MAKES_ROWS: TextRow[] = [
  makeRow(2, MAZDA, "MAZDA", "he:mazda"),
  makeRow(3, HYUNDAI, "HYUNDAI", "he:hyundai"),
  makeRow(4, TOYOTA, "TOYOTA", "he:toyota"),
  makeRow(5, ` ${SUZUKI}${SPELLING_SEPARATOR}${MARUTI} `, "SUZUKI", "he:suzuki", `${MARUTI}, SUZUKI`),
  makeRow(6, BMW, "BMW", "he:bmw"),
  makeRow(7, "", "MINI", "he:mini", " MINI ,, MINI COOPER "),
];

const MODELS_ROWS: TextRow[] = [
  modelRow(2, MAZDA, "MAZDA 3", "MAZDA", "3", "he:3"),
  modelRow(3, HYUNDAI, "IONIQ HYBRID", "HYUNDAI", "IONIQ", "he:ioniq"),
  modelRow(4, HYUNDAI, "IONIQ EV", "HYUNDAI", "IONIQ", "he:ioniq"),
  modelRow(5, HYUNDAI, "IONIQ", "HYUNDAI", "IONIQ", "he:ioniq"),
  // An empty part and stray spaces around the dot, to be dropped and trimmed.
  modelRow(6, TOYOTA, `TOYOTA C-HR${SPELLING_SEPARATOR}${join("", " C-HR ", "CHR", "TOYOTA CH-R", "CH-R")}`, "TOYOTA", "C-HR", "he:chr"),
  modelRow(7, join(SUZUKI, MARUTI), join("SWIFT", "SUZUKI SWIFT"), "SUZUKI", "SWIFT", "he:swift"),
  modelRow(8, BMW, join("MINI COOPER", "COOPER"), "MINI", "COOPER", "he:cooper"),
  modelRow(9, MAZDA, join("MAZDA CX-5", "CX-5", "CX5"), "MAZDA", "CX-5", "he:cx5"),
  modelRow(10, TOYOTA, "PRIUS", "TOYOTA", "", ""),
  // mergeKey keeps a glued prefix, so MAZDA3 is its own row (key "MAZDA3") of the family "3".
  modelRow(11, MAZDA, "MAZDA3", "MAZDA", "3", "he:3"),
];

const FILE = parseReview(MODELS_ROWS, MAKES_ROWS);

// The models tab with some rows replaced (same row numbers).
const withRows = (...replaced: TextRow[]): TextRow[] =>
  MODELS_ROWS.map((r) => replaced.find((x) => x.row === r.row) ?? r);

function problemsOf(models: TextRow[], makes: TextRow[] = MAKES_ROWS): string[] {
  try {
    parseReview(models, makes);
  } catch (e) {
    assert.ok(e instanceof ReviewFileError);
    return e.problems;
  }
  assert.fail("parseReview did not throw");
}

const family = (file: ReviewFile, makeEn: string, nameEn: string): ReviewFamily => {
  const f = file.families.find((x) => x.makeEn === makeEn && x.nameEn === nameEn);
  assert.ok(f, `no family ${makeEn} ${nameEn}`);
  return f;
};

describe("parseReview", () => {
  it("a left row (both cells empty) parses as left and creates no family", () => {
    const r = FILE.rows.find((x) => x.row === 10)!;
    assert.equal(r.left, true);
    assert.ok(FILE.families.every((f) => !f.rows.includes(10)));
    assert.equal(FILE.families.length, 6);
  });

  it("the model given with the Hebrew name empty, and the reverse, are problems naming the row and the column", () => {
    const problems = problemsOf(withRows(
      modelRow(9, MAZDA, join("MAZDA CX-5", "CX-5", "CX5"), "MAZDA", "CX-5", ""),
      modelRow(10, TOYOTA, "PRIUS", "TOYOTA", "", "he:prius"),
    ));
    assert.equal(problems.length, 2);
    assert.match(problems[0], new RegExp(`^${MODELS_TAB} row 9: ${M_NAME_HE}: `));
    assert.match(problems[1], new RegExp(`^${MODELS_TAB} row 10: ${M_MODEL}: `));
  });

  it("a make not in the makes tab is a problem, on a left row too", () => {
    const problems = problemsOf(withRows(
      modelRow(9, MAZDA, join("MAZDA CX-5", "CX-5", "CX5"), "MAZDDA", "CX-5", "he:cx5"),
      modelRow(10, TOYOTA, "PRIUS", "TOYOTTA", "", ""),
    ));
    assert.equal(problems.length, 2);
    assert.match(problems[0], new RegExp(`^${MODELS_TAB} row 9: ${M_MAKE}: "MAZDDA"`));
    assert.match(problems[1], new RegExp(`^${MODELS_TAB} row 10: ${M_MAKE}: "TOYOTTA"`));
  });

  it("two rows of one family with different Hebrew names are one problem naming both rows", () => {
    const problems = problemsOf(withRows(modelRow(4, HYUNDAI, "IONIQ EV", "HYUNDAI", "IONIQ", "he:other")));
    assert.equal(problems.length, 1);
    assert.match(problems[0], new RegExp(`^${MODELS_TAB} row 3: ${M_NAME_HE}: .*row 3 .*row 4 "he:other"`));
  });

  it("two rows with the same (canonical make, key) are a problem on both", () => {
    const problems = problemsOf(withRows(
      modelRow(2, MAZDA, "MAZDA 3", "MAZDA", "3", "he:3"),
      modelRow(9, MAZDA, "3", "MAZDA", "3", "he:3"),
    ));
    assert.equal(problems.length, 2);
    assert.match(problems[0], new RegExp(`^${MODELS_TAB} row 2: ${M_CATALOG_NAME}: .*row\\(s\\) 9`));
    assert.match(problems[1], new RegExp(`^${MODELS_TAB} row 9: ${M_CATALOG_NAME}: .*row\\(s\\) 2`));
  });

  it("the separator split keeps the spellings intact, trims around the dot and drops empty parts; the comma split trims", () => {
    assert.deepEqual(FILE.rows[4].spellings, ["TOYOTA C-HR", "C-HR", "CHR", "TOYOTA CH-R", "CH-R"]);
    assert.deepEqual(FILE.makes[3].catalogSpellings, [SUZUKI, MARUTI]);
    assert.deepEqual(FILE.makes[5].extraSpellings, ["MINI", "MINI COOPER"]);
  });

  it("a make with an empty catalog cell takes its aliases from the extra spellings; catalog first, then extra, duplicates dropped", () => {
    assert.deepEqual(FILE.makes[5].catalogSpellings, []);
    assert.deepEqual(FILE.makes[5].aliases, ["MINI", "MINI COOPER"]);
    assert.deepEqual(FILE.makes[3].aliases, [SUZUKI, MARUTI, "SUZUKI"]);
  });

  it("a family's aliases are its rows' spellings in row order", () => {
    assert.deepEqual(family(FILE, "HYUNDAI", "IONIQ").aliases, ["IONIQ HYBRID", "IONIQ EV", "IONIQ"]);
    assert.deepEqual(family(FILE, "HYUNDAI", "IONIQ").rows, [3, 4, 5]);
    assert.equal(family(FILE, "HYUNDAI", "IONIQ").nameHe, "he:ioniq");
  });

  it("every problem of a bad file is reported together, in one error", () => {
    const problems = problemsOf(
      withRows(
        modelRow(9, MAZDA, join("MAZDA CX-5", "CX-5", "CX5"), "MAZDA", "CX-5", ""),
        modelRow(6, TOYOTA, "", "TOYOTA", "C-HR", "he:chr"),
        modelRow(10, TOYOTA, "PRIUS", "TOYOTTA", "", ""),
      ),
      [...MAKES_ROWS, makeRow(8, "", "", "he:mazda")],
    );
    assert.deepEqual(
      problems.map((p) => p.slice(0, p.indexOf(":", p.indexOf(":") + 1))),
      [
        `${MAKES_TAB} row 8: ${K_NAME_EN}`,
        `${MAKES_TAB} row 2: ${K_NAME_HE}`,
        `${MAKES_TAB} row 8: ${K_NAME_HE}`,
        `${MODELS_TAB} row 6: ${M_CATALOG_NAME}`,
        `${MODELS_TAB} row 9: ${M_NAME_HE}`,
        `${MODELS_TAB} row 10: ${M_MAKE}`,
      ],
    );
  });
});

describe("catalogKey and familyOf", () => {
  it("MAZDA 3 and MAZDA3 give the keys of the rows listing them, both of the family 3; the CX-5 and the I20 spellings give one key each", () => {
    const row2 = FILE.rows.find((r) => r.row === 2)!;
    const row11 = FILE.rows.find((r) => r.row === 11)!;
    assert.deepEqual(catalogKey(MAZDA, "MAZDA 3"), { canonicalMake: row2.canonicalMake, key: row2.key });
    assert.deepEqual(catalogKey(MAZDA, "MAZDA3"), { canonicalMake: row11.canonicalMake, key: row11.key });
    assert.deepEqual([row2.key, row11.key], ["3", "MAZDA3"]);
    assert.equal(FILE.familyOf(catalogKey(MAZDA, "MAZDA 3")), family(FILE, "MAZDA", "3"));
    assert.equal(FILE.familyOf(catalogKey(MAZDA, "MAZDA3")), family(FILE, "MAZDA", "3"));
    const cx5 = ["MAZDA CX-5", "CX-5", "CX5"].map((m) => catalogKey(MAZDA, m).key);
    assert.deepEqual(new Set(cx5).size, 1);
    assert.equal(catalogKey(HYUNDAI, "I20").key, catalogKey(HYUNDAI, "HYUNDAI I20").key);
  });

  it("the merged Suzuki make spellings give one canonical make", () => {
    assert.equal(catalogKey(MARUTI, "SWIFT").canonicalMake, catalogKey(SUZUKI, "SWIFT").canonicalMake);
    assert.equal(FILE.familyOf(catalogKey(MARUTI, "SWIFT")), family(FILE, "SUZUKI", "SWIFT"));
  });

  it("a catalog row under the BMW make whose spelling a MINI row lists finds the MINI family", () => {
    assert.equal(FILE.familyOf(catalogKey(BMW, "MINI COOPER")), family(FILE, "MINI", "COOPER"));
  });

  it("an unknown spelling gives undefined; a left row's spelling gives \"left\"", () => {
    assert.equal(FILE.familyOf(catalogKey(TOYOTA, "COROLLA")), undefined);
    assert.equal(FILE.familyOf(catalogKey(TOYOTA, "PRIUS")), "left");
    const k = catalogKey(TOYOTA, "PRIUS");
    assert.equal(FILE.familyOf(k.canonicalMake, k.key), "left");
  });
});

// ---------------------------------------------------------------- planImport

let catalogSeq = 0;
const cat = (make: string | null, model: string | null, family_id: number | null = null): DbState["catalog"][number] => ({
  id: ++catalogSeq, make, model, family_id, vehicle_class: "P", year: 2020,
});

const CATALOG: DbState["catalog"] = [
  cat(MAZDA, "MAZDA 3"), cat(MAZDA, "MAZDA3"),
  cat(HYUNDAI, "IONIQ HYBRID"), cat(HYUNDAI, "IONIQ EV"), cat(HYUNDAI, "IONIQ"),
  cat(TOYOTA, "C-HR"), cat(TOYOTA, "CH-R"),
  cat(MARUTI, "SWIFT"), cat(SUZUKI, "SUZUKI SWIFT"),
  cat(BMW, "MINI COOPER"),
  cat(MAZDA, "CX5"),
  cat(TOYOTA, "PRIUS"), // the left row: outside
  cat(TOYOTA, "COROLLA"), // not in the file: outside
  cat(null, "COROLLA"), // no make: outside
  cat(TOYOTA, null), // no model: outside
];
const EMPTY: DbState = { makes: [], families: [], catalog: CATALOG, searches: new Map() };

// What the write does, on a copy of the state: new rows get the next id.
function applyPlan(state: DbState, plan: ImportPlan): DbState {
  assert.deepEqual(plan.stops, []);
  let nextId = 1000;
  const makes = state.makes.map((m) => ({ ...m, aliases: [...m.aliases] }));
  const families = state.families.map((f) => ({ ...f, aliases: [...f.aliases] }));
  const searches = new Map(state.searches);
  const newMake = new Map<string, number>();
  const newFamily = new Map<string, number>();
  for (const c of plan.makeCreates) {
    const id = ++nextId;
    makes.push({ id, name_en: c.nameEn, name_he: c.nameHe, aliases: c.aliases });
    newMake.set(`new:${c.nameEn}`, id);
  }
  for (const u of plan.makeUpdates) {
    const m = makes.find((x) => x.id === u.id)!;
    if (u.nameHe) m.name_he = u.nameHe.after;
    if (u.aliases) m.aliases = u.aliases.after;
  }
  for (const c of plan.familyCreates) {
    const id = ++nextId;
    const make_id = typeof c.makeId === "number" ? c.makeId : newMake.get(c.makeId)!;
    families.push({ id, make_id, name_en: c.nameEn, name_he: c.nameHe, aliases: c.aliases });
    newFamily.set(`new:${c.key}`, id);
  }
  for (const u of plan.familyUpdates) {
    const f = families.find((x) => x.id === u.id)!;
    if (u.nameHe) f.name_he = u.nameHe.after;
    if (u.aliases) f.aliases = u.aliases.after;
  }
  const resolve = (ref: number | string | null) => (ref === null || typeof ref === "number" ? ref : newFamily.get(ref)!);
  const catalog = state.catalog.map((c) => ({ ...c }));
  for (const w of plan.catalogWrites) {
    for (const id of w.ids) catalog.find((c) => c.id === id)!.family_id = resolve(w.familyId);
  }
  for (const d of plan.familyDeletes) {
    if (d.move) {
      const to = resolve(d.move.toId)!;
      searches.set(to, (searches.get(to) ?? 0) + (searches.get(d.id) ?? 0));
    }
    searches.delete(d.id);
    families.splice(families.findIndex((f) => f.id === d.id), 1);
  }
  for (const d of plan.makeDeletes) makes.splice(makes.findIndex((m) => m.id === d.id), 1);
  return { makes, families, catalog, searches };
}

const FIRST = planImport(FILE, EMPTY);
const AFTER_FIRST = applyPlan(EMPTY, FIRST);
const idOf = (state: DbState, makeEn: string, nameEn: string): number => {
  const make = state.makes.find((m) => m.name_en === makeEn)!;
  return state.families.find((f) => f.make_id === make.id && f.name_en === nameEn)!.id;
};
const catalogIds = (...models: string[]) => CATALOG.filter((c) => c.model !== null && models.includes(c.model) && c.make !== null).map((c) => c.id);

describe("planImport", () => {
  it("first import into an empty database: every make and family is a create; the catalog rows map", () => {
    assert.deepEqual(FIRST.stops, []);
    assert.deepEqual(FIRST.makeCreates.map((m) => m.nameEn), ["MAZDA", "HYUNDAI", "TOYOTA", "SUZUKI", "BMW", "MINI"]);
    assert.deepEqual(FIRST.familyCreates.map((f) => f.key), ["MAZDA 3", "HYUNDAI IONIQ", "TOYOTA C-HR", "SUZUKI SWIFT", "MINI COOPER", "MAZDA CX-5"]);
    assert.equal(FIRST.familyCreates[4].makeId, "new:MINI");
    assert.deepEqual(FIRST.counts, { catalog: 15, setFromNull: 11, moved: 0, cleared: 0, unchanged: 0, outside: 4, outsideInScope: 4 });
    assert.deepEqual(FIRST.familyRows.map((r) => r.rows), [2, 3, 2, 2, 1, 1]);
    assert.deepEqual(FIRST.familyDeletes, []);
    assert.deepEqual(FIRST.makeDeletes, []);
  });

  it("the same file against the state the first import produced changes nothing", () => {
    const again = planImport(FILE, AFTER_FIRST);
    assert.deepEqual(
      [again.makeCreates, again.makeUpdates, again.makeDeletes, again.familyCreates, again.familyUpdates, again.familyDeletes, again.catalogWrites, again.stops],
      [[], [], [], [], [], [], [], []],
    );
    assert.equal(again.counts.unchanged, 11);
  });

  it("a Hebrew name changed in the file is one family update, same id", () => {
    const file = parseReview(withRows(
      modelRow(2, MAZDA, "MAZDA 3", "MAZDA", "3", "he:three"),
      modelRow(11, MAZDA, "MAZDA3", "MAZDA", "3", "he:three"),
    ), MAKES_ROWS);
    const plan = planImport(file, AFTER_FIRST);
    assert.deepEqual(plan.familyUpdates, [
      { id: idOf(AFTER_FIRST, "MAZDA", "3"), key: "MAZDA 3", nameHe: { before: "he:3", after: "he:three" } },
    ]);
    assert.deepEqual([plan.familyCreates, plan.familyDeletes, plan.catalogWrites], [[], [], []]);
  });

  it("a model's rows moved to another family: the old family vanishes, its searches follow, the rows are moved", () => {
    const file = parseReview(withRows(modelRow(9, MAZDA, join("MAZDA CX-5", "CX-5", "CX5"), "MAZDA", "3", "he:3")), MAKES_ROWS);
    const cx5 = idOf(AFTER_FIRST, "MAZDA", "CX-5");
    const mazda3 = idOf(AFTER_FIRST, "MAZDA", "3");
    const plan = planImport(file, { ...AFTER_FIRST, searches: new Map([[cx5, 4]]) });
    assert.deepEqual(plan.stops, []);
    assert.deepEqual(plan.familyDeletes, [{ id: cx5, key: "MAZDA CX-5", move: { fromId: cx5, toId: mazda3, toKey: "MAZDA 3", searchesMoved: 4 } }]);
    assert.deepEqual(plan.catalogWrites, [{ familyId: mazda3, ids: catalogIds("CX5") }]);
    assert.equal(plan.counts.moved, 1);
    assert.deepEqual(plan.familyUpdates.map((u) => [u.key, u.aliases?.after]), [["MAZDA 3", ["MAZDA 3", "MAZDA CX-5", "CX-5", "CX5", "MAZDA3"]]]);
  });

  it("a vanished family whose rows split over two families, one row each, is a stop", () => {
    const file = parseReview(withRows(
      modelRow(3, HYUNDAI, "IONIQ HYBRID", "HYUNDAI", "IONIQ HYBRID", "he:a"),
      modelRow(4, HYUNDAI, "IONIQ EV", "HYUNDAI", "IONIQ EV", "he:b"),
      modelRow(5, HYUNDAI, "IONIQ", "HYUNDAI", "", ""),
    ), MAKES_ROWS);
    const plan = planImport(file, AFTER_FIRST);
    assert.equal(plan.stops.length, 1);
    assert.match(plan.stops[0], /^HYUNDAI IONIQ: its names went to HYUNDAI IONIQ HYBRID \(1 catalog rows\), HYUNDAI IONIQ EV \(1 catalog rows\) — /);
    const ioniq = idOf(AFTER_FIRST, "HYUNDAI", "IONIQ");
    assert.deepEqual(plan.familyDeletes, [{ id: ioniq, key: "HYUNDAI IONIQ", move: null, split: true }]);
  });

  it("an unequal split (20 rows to one family, 1 to another) is a stop naming both targets with their counts, with or without searches", () => {
    const file = parseReview(withRows(
      modelRow(3, HYUNDAI, "IONIQ HYBRID", "HYUNDAI", "IONIQ HYBRID", "he:a"),
      modelRow(4, HYUNDAI, "IONIQ EV", "HYUNDAI", "IONIQ EV", "he:b"),
      modelRow(5, HYUNDAI, "IONIQ", "HYUNDAI", "", ""),
    ), MAKES_ROWS);
    const ioniq = idOf(AFTER_FIRST, "HYUNDAI", "IONIQ");
    const more = Array.from({ length: 19 }, () => cat(HYUNDAI, "IONIQ HYBRID", ioniq));
    const state: DbState = { ...AFTER_FIRST, catalog: [...AFTER_FIRST.catalog, ...more] };
    const expected =
      "HYUNDAI IONIQ: its names went to HYUNDAI IONIQ HYBRID (20 catalog rows), HYUNDAI IONIQ EV (1 catalog rows) — " +
      "the import does not choose who inherits the searches; keep the old name on the part that should keep them, then run again";
    const noMove = [{ id: ioniq, key: "HYUNDAI IONIQ", move: null, split: true }];
    for (const plan of [planImport(file, state), planImport(file, { ...state, searches: new Map([[ioniq, 6]]) })]) {
      assert.deepEqual(plan.stops, [expected]);
      assert.deepEqual(plan.familyDeletes, noMove);
    }
  });

  it("a vanished family whose rows went to one family and to null moves its searches to that family", () => {
    const file = parseReview(withRows(
      modelRow(3, HYUNDAI, "IONIQ HYBRID", "HYUNDAI", "IONIQ HYBRID", "he:a"),
      modelRow(4, HYUNDAI, "IONIQ EV", "HYUNDAI", "IONIQ HYBRID", "he:a"),
      modelRow(5, HYUNDAI, "IONIQ", "HYUNDAI", "", ""),
    ), MAKES_ROWS);
    const ioniq = idOf(AFTER_FIRST, "HYUNDAI", "IONIQ");
    const state: DbState = { ...AFTER_FIRST, searches: new Map([[ioniq, 3]]) };
    const plan = planImport(file, state);
    assert.deepEqual(plan.stops, []);
    assert.deepEqual(plan.familyDeletes, [
      { id: ioniq, key: "HYUNDAI IONIQ", move: { fromId: ioniq, toId: "new:HYUNDAI IONIQ HYBRID", toKey: "HYUNDAI IONIQ HYBRID", searchesMoved: 3 } },
    ]);
    const after = applyPlan(state, plan);
    assert.equal(after.searches.get(idOf(after, "HYUNDAI", "IONIQ HYBRID")), 3);
  });

  it("a family whose rows were all emptied: with searches a stop; without, deleted and its rows cleared", () => {
    const file = parseReview(withRows(
      modelRow(3, HYUNDAI, "IONIQ HYBRID", "HYUNDAI", "", ""),
      modelRow(4, HYUNDAI, "IONIQ EV", "HYUNDAI", "", ""),
      modelRow(5, HYUNDAI, "IONIQ", "HYUNDAI", "", ""),
    ), MAKES_ROWS);
    const ioniq = idOf(AFTER_FIRST, "HYUNDAI", "IONIQ");

    const withSearches = planImport(file, { ...AFTER_FIRST, searches: new Map([[ioniq, 2]]) });
    assert.equal(withSearches.stops.length, 1);
    assert.match(withSearches.stops[0], /HYUNDAI IONIQ .*rows were all emptied .*2 searches — ask Eran/);

    const without = planImport(file, AFTER_FIRST);
    assert.deepEqual(without.stops, []);
    assert.deepEqual(without.familyDeletes, [{ id: ioniq, key: "HYUNDAI IONIQ", move: null }]);
    assert.deepEqual(without.catalogWrites, [{ familyId: null, ids: catalogIds("IONIQ HYBRID", "IONIQ EV", "IONIQ") }]);
    assert.equal(without.counts.cleared, 3);
  });

  it("a make's English name changed: a new make, its families anew, the old families vanish with their searches, the old make deleted", () => {
    const rename = (r: TextRow): TextRow => ({ row: r.row, cells: r.cells.map((c) => (c === "MAZDA" ? "MAZDA MOTOR" : c)) });
    const file = parseReview(MODELS_ROWS.map(rename), MAKES_ROWS.map(rename));
    const mazda3 = idOf(AFTER_FIRST, "MAZDA", "3");
    const cx5 = idOf(AFTER_FIRST, "MAZDA", "CX-5");
    const plan = planImport(file, { ...AFTER_FIRST, searches: new Map([[mazda3, 5]]) });
    assert.deepEqual(plan.stops, []);
    assert.deepEqual(plan.makeCreates.map((m) => m.nameEn), ["MAZDA MOTOR"]);
    assert.deepEqual(plan.familyCreates.map((f) => [f.key, f.makeId]), [["MAZDA MOTOR 3", "new:MAZDA MOTOR"], ["MAZDA MOTOR CX-5", "new:MAZDA MOTOR"]]);
    assert.deepEqual(plan.familyDeletes, [
      { id: mazda3, key: "MAZDA 3", move: { fromId: mazda3, toId: "new:MAZDA MOTOR 3", toKey: "MAZDA MOTOR 3", searchesMoved: 5 } },
      { id: cx5, key: "MAZDA CX-5", move: { fromId: cx5, toId: "new:MAZDA MOTOR CX-5", toKey: "MAZDA MOTOR CX-5", searchesMoved: 0 } },
    ]);
    assert.deepEqual(plan.makeDeletes, [{ id: AFTER_FIRST.makes.find((m) => m.name_en === "MAZDA")!.id, nameEn: "MAZDA" }]);
    assert.equal(plan.counts.moved, 3);
    const after = applyPlan({ ...AFTER_FIRST, searches: new Map([[mazda3, 5]]) }, plan);
    assert.equal(after.searches.get(idOf(after, "MAZDA MOTOR", "3")), 5);
  });

  it("a file row that no catalog row maps to is a stop", () => {
    const plan = planImport(FILE, { ...EMPTY, catalog: CATALOG.filter((c) => c.model !== "MINI COOPER") });
    assert.equal(plan.stops.length, 1);
    assert.match(plan.stops[0], new RegExp(`^${MODELS_TAB} row 8 .*no catalog row maps to it`));
  });

  it("catalog rows with make or model null count as outside and are never written", () => {
    const nulls = CATALOG.filter((c) => c.make === null || c.model === null).map((c) => c.id);
    assert.equal(nulls.length, 2);
    for (const w of FIRST.catalogWrites) assert.ok(w.ids.every((id) => !nulls.includes(id)));
    assert.ok(nulls.every((id) => FIRST.targetOf.get(id) === null));
  });
});
