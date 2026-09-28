// BRIEF Days 22–23, Run 2, §9 — the generator end to end: one describe per case of §6, then the page, the
// runner-up, the self-check and determinism.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkOutput, justify } from "./index";
import { car, fillers, search, untriggered } from "./fixtures";
import { JUSTIFICATION_GENERATOR_VERSION, RUNNER_UP_FACT_MAX_CHARS, SENTENCE_MAX_CHARS } from "./constants";
import { RULE, TAG_CHEAPER_THAN_CHEAPEST } from "./wordings";
import type { CarJustification, JustificationOutput, JustificationSearch } from "./types";

const HAND1 = { owners: [{ ym: "2021-03", type: "private" as const }], paper_hand: 1 };
const RENTAL = { owners: [{ ym: "2019-03", type: "rental" as const }, { ym: "2022-06", type: "private" as const }], paper_hand: 2 };
const RENTAL_DEDUCTION = [{ for: "rental", pct: -22, applied: -22, rule: "largest_in_full" as const }];

/** The cheapest pick every tag and every runner-up fact is measured against. */
const cheapestPick = (over = {}) => car({ id: 1, price: 100_000, median: 100_000, categories: ["cheapest"], ...over });

const rowOf = (out: JustificationOutput, listing_id: number): CarJustification => {
  const row = out.cars.find((c) => c.listing_id === listing_id);
  assert.ok(row !== undefined, `no output row for listing ${listing_id}`);
  return row;
};

// -----------------------------------------------------------------------------------------------------------
describe("§6 (1) — a rule stopped the car", () => {
  it("a cancelled car says when it was cancelled, month without a leading zero", () => {
    const out = justify(search([car({ id: 1, cancelled: "2026-03-15" })]));
    const row = out.cars[0];
    assert.equal(row.kind, "rule_cancelled");
    assert.equal(row.fact, "date");
    assert.equal(row.sentence, "בוטל ב-3/2026");
    assert.equal(row.page.price_line, null);
    assert.deepEqual(row.page.why_lines, ["בוטל ב-3/2026"]);
  });

  it("a car with no registry history says so — a thin cell included", () => {
    const out = justify(search([car({ id: 1, history_source: "typical" }), car({ id: 2, thin: true, history_source: "typical" })]));
    for (const id of [1, 2]) {
      const row = rowOf(out, id);
      assert.equal(row.kind, "rule_no_history");
      assert.equal(row.fact, "ownership");
      assert.equal(row.sentence, RULE.no_history);
      assert.equal(row.sentence, "אין היסטוריית בעלויות ממשרד התחבורה");
    }
  });

  it("the cancelled record and the invoice may not disagree", () => {
    const lying = car({ id: 1, trace: [untriggered("cancelled"), untriggered("unverified_history"), untriggered("condition_floor")], cancelled: "2026-03-15" });
    assert.throws(() => justify(search([lying])), /listing 1 .* the cancelled rule record says false/);
  });

  it("below the floor and cheaper than the cheapest pick: the tag, and the km sentence when km is the more negative", () => {
    const floored = car({ id: 2, price: 90_000, median: 100_000, price_v: 0, history: -1, typical: 0, km: -8, km_declared: 85_000, median_km: 60_000, fires: ["condition_floor"] });
    const out = justify(search([cheapestPick(), floored]));
    const row = rowOf(out, 2);
    assert.equal(row.kind, "rule_floor");
    assert.equal(row.fact, "km");
    assert.equal(row.sentence, '25 אלף ק"מ מעל הממוצע לשנתון');
    assert.equal(row.tag, TAG_CHEAPER_THAN_CHEAPEST);
    assert.equal(row.values.km, 25);
  });

  it("…and the unfavourable ownership form when ownership is the more negative", () => {
    const floored = car({ id: 2, price: 90_000, median: 100_000, price_v: 0, history: -22, typical: 0, km: -1, km_declared: 61_000, median_km: 60_000, fires: ["condition_floor"], ...RENTAL, deductions: RENTAL_DEDUCTION });
    const out = justify(search([cheapestPick(), floored]));
    const row = rowOf(out, 2);
    assert.equal(row.kind, "rule_floor");
    assert.equal(row.fact, "ownership");
    assert.equal(row.sentence, "היחיד בחיפוש שהיה רכב השכרה");
    assert.equal(row.tag, TAG_CHEAPER_THAN_CHEAPEST);
    assert.deepEqual(row.values, { one_of: 1, of: 2 });
  });

  it("…and nothing at all when neither component is writable — the tag is still kept", () => {
    const floored = car({ id: 2, price: 90_000, median: 100_000, price_v: 0, history: -8, typical: 0, km: -1, km_declared: 60_000, median_km: 60_000, fires: ["condition_floor"] });
    const out = justify(search([cheapestPick(), floored]));
    const row = rowOf(out, 2);
    assert.equal(row.kind, "rule_floor");
    assert.equal(row.fact, null);
    assert.equal(row.sentence, "");
    assert.equal(row.tag, TAG_CHEAPER_THAN_CHEAPEST);
  });

  it("below the floor but DEARER than the pick: case (3), no tag", () => {
    const floored = car({ id: 2, price: 110_000, median: 110_000, history: -1, typical: 0, km: -8, km_declared: 85_000, median_km: 60_000, fires: ["condition_floor"] });
    const out = justify(search([cheapestPick(), floored]));
    const row = rowOf(out, 2);
    assert.equal(row.kind, "max_effect");
    assert.equal(row.fact, "km");
    assert.equal(row.sentence, '25 אלף ק"מ מעל הממוצע לשנתון');
    assert.equal(row.tag, "");
  });

  it("below the floor on an uncrowned screen: case (3), no tag", () => {
    const floored = car({ id: 2, price: 90_000, median: 100_000, price_v: 0, history: -1, typical: 0, km: -8, km_declared: 85_000, median_km: 60_000, fires: ["condition_floor"] });
    const out = justify(search([floored], { crowned: false }));
    const row = rowOf(out, 2);
    assert.equal(row.kind, "max_effect");
    assert.equal(row.fact, "km");
    assert.equal(row.tag, "");
  });
});

// -----------------------------------------------------------------------------------------------------------
describe("§6 (2) — a pick's reason", () => {
  it("best_value: the price expression", () => {
    const out = justify(search([car({ id: 1, price: 90_000, median: 100_000, categories: ["best_value"] })]));
    const row = out.cars[0];
    assert.equal(row.kind, "pick_reason");
    assert.equal(row.fact, "price");
    assert.equal(row.sentence, "10,000 ₪ מתחת לשווי השוק");
    assert.equal(row.values.ils, 10_000);
  });

  it("best_value whose amount rounds to 0: the at-market form, still its reason", () => {
    const out = justify(search([car({ id: 1, price_v: 0.04, categories: ["best_value"] })]));
    const row = out.cars[0];
    assert.equal(row.kind, "pick_reason");
    assert.equal(row.fact, "price");
    assert.equal(row.sentence, "במחיר השוק");
    assert.equal(row.values.ils, 0);
  });

  it("peace_of_mind: the ownership fact when it contributed more (by the REALITY reading)", () => {
    const pick = car({ id: 1, categories: ["peace_of_mind"], history: 5, reality: 5, typical: 0, km: 1, ...HAND1 });
    const out = justify(search([pick, car({ id: 2 })]));
    const row = rowOf(out, 1);
    assert.equal(row.kind, "pick_reason");
    assert.equal(row.fact, "ownership");
    assert.equal(row.sentence, "היחיד בחיפוש ביד 1");
  });

  it("peace_of_mind: the km fact when km contributed more", () => {
    const pick = car({ id: 1, categories: ["peace_of_mind"], history: 1, reality: 1, typical: 0, km: 5, km_declared: 30_000, median_km: 60_000, ...HAND1 });
    const out = justify(search([pick, car({ id: 2 })]));
    const row = rowOf(out, 1);
    assert.equal(row.fact, "km");
    assert.equal(row.sentence, '30 אלף ק"מ מתחת לממוצע לשנתון');
  });

  it("peace_of_mind: the other component when the larger one has no writable form", () => {
    const pick = car({ id: 1, categories: ["peace_of_mind"], history: 5, reality: 5, typical: 0, km: 3, km_declared: 48_000, median_km: 60_000, ...RENTAL });
    const out = justify(search([pick, car({ id: 2 })]));
    const row = rowOf(out, 1);
    assert.equal(row.fact, "km");
    assert.equal(row.sentence, '12 אלף ק"מ מתחת לממוצע לשנתון');
  });

  it("peace_of_mind: nothing in its favour -> empty, and never a sentence against it", () => {
    const pick = car({ id: 1, categories: ["peace_of_mind"], history: -3, reality: -3, typical: 0, km: -2, km_declared: 75_000, median_km: 60_000, ...RENTAL, deductions: RENTAL_DEDUCTION });
    const out = justify(search([pick, car({ id: 2 })]));
    const row = rowOf(out, 1);
    assert.equal(row.kind, "empty");
    assert.equal(row.fact, null);
    assert.equal(row.sentence, "");
    assert.deepEqual(checkOutput(search([pick, car({ id: 2 })]), out), []);
  });

  it("cheapest: the price when the price is in its favour", () => {
    const out = justify(search([car({ id: 1, price: 95_000, median: 100_000, categories: ["cheapest"] })]));
    assert.equal(out.cars[0].fact, "price");
    assert.equal(out.cars[0].sentence, "5,000 ₪ מתחת לשווי השוק");
  });

  it("cheapest: at the band the price is NOT in its favour — the ladder speaks instead", () => {
    const pick = car({ id: 1, categories: ["cheapest"], price_v: 0, history: 2, typical: 0, km: 0, ...HAND1 });
    const out = justify(search([pick, car({ id: 2 })]));
    const row = rowOf(out, 1);
    assert.equal(row.fact, "ownership");
    assert.equal(row.sentence, "היחיד בחיפוש ביד 1");
  });

  it("cheapest: the ladder's last step is open and empty", () => {
    const out = justify(search([car({ id: 1, categories: ["cheapest"] })]));
    assert.equal(out.cars[0].kind, "empty");
    assert.equal(out.cars[0].sentence, "");
  });

  it("a double winner speaks as the first label in CATEGORY_PRIORITY", () => {
    const out = justify(search([car({ id: 1, price: 90_000, median: 100_000, categories: ["cheapest", "best_value"] })]));
    assert.equal(out.cars[0].fact, "price");
    assert.equal(out.cars[0].sentence, "10,000 ₪ מתחת לשווי השוק");
  });

  it("no pick ever carries the tag, even one cheaper than the cheapest pick", () => {
    const out = justify(search([cheapestPick(), car({ id: 2, price: 80_000, median: 100_000, categories: ["best_value"] })]));
    assert.equal(rowOf(out, 2).tag, "");
    assert.equal(rowOf(out, 1).tag, "");
  });
});

// -----------------------------------------------------------------------------------------------------------
describe("§6 (3) — the component that decided the score the most", () => {
  it("price", () => {
    const out = justify(search([car({ id: 1, price: 90_000, median: 100_000 })]));
    assert.equal(out.cars[0].kind, "max_effect");
    assert.equal(out.cars[0].fact, "price");
    assert.equal(out.cars[0].sentence, "10,000 ₪ מתחת לשווי השוק");
  });

  it("ownership, in the sign's direction", () => {
    const against = car({ id: 1, price_v: 0, history: -22, typical: 0, km: 0, ...RENTAL, deductions: RENTAL_DEDUCTION });
    const out = justify(search([against, car({ id: 2 })]));
    assert.equal(rowOf(out, 1).fact, "ownership");
    assert.equal(rowOf(out, 1).sentence, "היחיד בחיפוש שהיה רכב השכרה");

    const forIt = car({ id: 3, price_v: 0, history: 6, typical: 0, km: 0, ...HAND1 });
    const out2 = justify(search([forIt, car({ id: 4 })]));
    assert.equal(rowOf(out2, 3).sentence, "היחיד בחיפוש ביד 1");
  });

  it("km", () => {
    const out = justify(search([car({ id: 1, price_v: 0, history: 0, typical: 0, km: -8, km_declared: 85_000, median_km: 60_000 })]));
    assert.equal(out.cars[0].fact, "km");
    assert.equal(out.cars[0].sentence, '25 אלף ק"מ מעל הממוצע לשנתון');
  });

  it("under JUSTIFICATION_MIN_EFFECT_PCT nothing is worth saying", () => {
    const out = justify(search([car({ id: 1, price_v: 1, history: 1, typical: 0, km: 1, km_declared: 55_000, median_km: 60_000 })]));
    assert.equal(out.cars[0].kind, "empty");
    assert.equal(out.cars[0].fact, null);
  });

  it("ownership over the 'one of n' limit is empty — the km fact does NOT step in", () => {
    const spec = { price_v: 0, history: -22, typical: 0, km: -3, km_declared: 69_000, median_km: 60_000, ...RENTAL, deductions: RENTAL_DEDUCTION };
    const out = justify(search([car({ id: 1, ...spec }), car({ id: 2, ...spec }), car({ id: 3, ...spec })]));
    for (const row of out.cars) {
      assert.equal(row.kind, "empty");
      assert.equal(row.sentence, "");
    }
  });

  it("a km gap that rounds to 0 thousands is empty", () => {
    const out = justify(search([car({ id: 1, price_v: 0, history: 0, typical: 0, km: -6, km_declared: 60_400, median_km: 60_000 })]));
    assert.equal(out.cars[0].kind, "empty");
  });

  it("ties go price -> ownership -> km", () => {
    const out = justify(search([car({ id: 1, price_v: 4, history: 4, typical: 0, km: 0, ...HAND1 })]));
    assert.equal(out.cars[0].fact, "price");
    assert.equal(out.cars[0].sentence, "8,000 ₪ מתחת לשווי השוק");
  });
});

// -----------------------------------------------------------------------------------------------------------
describe("§6 — a thin cell", () => {
  const thin = { thin: true };

  it("the unfavourable ownership fact comes first, before hand 1", () => {
    // hand 1 AND a rental row: the unfavourable fact is the one that gets written.
    const cell = car({ id: 1, ...thin, owners: [{ ym: "2021-03", type: "rental" }], paper_hand: 1, deductions: RENTAL_DEDUCTION });
    const out = justify(search([cell]));
    assert.equal(out.cars[0].kind, "no_price_ownership");
    assert.equal(out.cars[0].fact, "ownership");
    assert.equal(out.cars[0].sentence, "היחיד בחיפוש שהיה רכב השכרה");
  });

  it("then hand 1, then all-private", () => {
    const h1 = justify(search([car({ id: 1, ...thin, ...HAND1 })]));
    assert.equal(h1.cars[0].sentence, "היחיד בחיפוש ביד 1");

    const ap = justify(
      search([car({ id: 1, ...thin, owners: [{ ym: "2019-03", type: "private" }, { ym: "2022-06", type: "private" }], paper_hand: 2 })]),
    );
    assert.equal(ap.cars[0].kind, "no_price_ownership");
    assert.equal(ap.cars[0].sentence, "היחיד בחיפוש שכל בעליו פרטיים");
  });

  it("no ownership fact -> the lowest km, if it is the lowest", () => {
    const noFact = { ...thin, owners: [{ ym: "2019-03", type: "company" as const }, { ym: "2022-06", type: "private" as const }], paper_hand: 2 };
    const out = justify(search([car({ id: 1, ...noFact, km_snapshot: 30_000 }), car({ id: 2, km_snapshot: 90_000 })]));
    assert.equal(rowOf(out, 1).kind, "no_price_km");
    assert.equal(rowOf(out, 1).fact, "km");
    assert.equal(rowOf(out, 1).sentence, 'הק"מ הנמוך ביותר מבין הרכבים בחיפוש');
  });

  it("no ownership fact and not the lowest km -> nothing, and never a price", () => {
    const noFact = { ...thin, owners: [{ ym: "2019-03", type: "company" as const }, { ym: "2022-06", type: "private" as const }], paper_hand: 2 };
    const out = justify(search([car({ id: 1, ...noFact, km_snapshot: 90_000 }), car({ id: 2, km_snapshot: 30_000 })]));
    assert.equal(rowOf(out, 1).kind, "empty");
    assert.equal(rowOf(out, 1).sentence, "");
    assert.equal(rowOf(out, 1).page.price_line, null);
  });

  it("without a registry reading there is no ownership fact to write", () => {
    // In production such a car is stopped by unverified_history first (the case above); the trace is overridden
    // here so that the ladder's own guard is what the assertion sees.
    const cell = car({
      id: 1,
      ...thin,
      history_source: "typical",
      km_snapshot: 90_000,
      trace: [untriggered("cancelled"), untriggered("unverified_history"), untriggered("condition_floor")],
    });
    const out = justify(search([cell, car({ id: 2, km_snapshot: 30_000 })]));
    assert.equal(rowOf(out, 1).kind, "empty");
  });

  it("an unverified thin cell says the rule, not a km fact", () => {
    const out = justify(search([car({ id: 1, ...thin, history_source: "typical", km_snapshot: 30_000 }), car({ id: 2, km_snapshot: 90_000 })]));
    assert.equal(rowOf(out, 1).kind, "rule_no_history");
  });
});

// -----------------------------------------------------------------------------------------------------------
describe("§6 — the recognition tag", () => {
  it("every non-pick under the cheapest pick's price wears it, whatever its sentence says", () => {
    const out = justify(
      search([
        cheapestPick(),
        car({ id: 2, price: 90_000, median: 100_000, price_v: 0 }),
        car({ id: 3, price: 90_000, cancelled: "2026-03-15" }),
        car({ id: 4, price: 90_000, median: 100_000, price_v: 0, history_source: "typical" }),
        car({ id: 5, price: 120_000, median: 100_000, price_v: 0 }),
      ]),
    );
    assert.equal(rowOf(out, 2).tag, TAG_CHEAPER_THAN_CHEAPEST);
    assert.equal(rowOf(out, 3).tag, TAG_CHEAPER_THAN_CHEAPEST);
    assert.equal(rowOf(out, 3).kind, "rule_cancelled");
    assert.equal(rowOf(out, 4).tag, TAG_CHEAPER_THAN_CHEAPEST);
    assert.equal(rowOf(out, 4).kind, "rule_no_history");
    assert.equal(rowOf(out, 5).tag, "");
  });

  it("no tag on an uncrowned screen", () => {
    const cars = [cheapestPick({ categories: [] }), car({ id: 2, price: 90_000, median: 100_000, price_v: 0 })];
    const out = justify(search(cars, { crowned: false }));
    for (const row of out.cars) assert.equal(row.tag, "");
    assert.equal(out.runner_up_fact, null);
  });
});

// -----------------------------------------------------------------------------------------------------------
describe("§6.6 — the car page", () => {
  it("price_line for a scored car, null for a cancelled one and for a thin cell", () => {
    const out = justify(search([car({ id: 1, price: 90_000, median: 100_000 }), car({ id: 2, cancelled: "2026-03-15" }), car({ id: 3, thin: true })]));
    assert.equal(rowOf(out, 1).page.price_line, "10,000 ₪ מתחת לשווי השוק");
    assert.equal(rowOf(out, 2).page.price_line, null);
    assert.equal(rowOf(out, 3).page.price_line, null);
  });

  it("a best_value pick starts with its extra facts — the section never repeats the number under the price", () => {
    const pick = car({ id: 1, price: 90_000, median: 100_000, price_v: 10, history: 4, typical: 0, km: -3, km_declared: 69_000, median_km: 60_000, categories: ["best_value"], ...HAND1 });
    const out = justify(search([pick, car({ id: 2 })]));
    const row = rowOf(out, 1);
    assert.equal(row.sentence, "11,000 ₪ מתחת לשווי השוק");
    assert.equal(row.page.price_line, "11,000 ₪ מתחת לשווי השוק");
    assert.deepEqual(row.page.why_lines, ["היחיד בחיפוש ביד 1", '9 אלף ק"מ מעל הממוצע לשנתון']);
  });

  it("a cheapest pick whose reason is the price, and a ranked car whose sentence is the price, do the same", () => {
    const cheapest = car({ id: 1, price: 90_000, median: 100_000, price_v: 10, history: 4, typical: 0, km: 0, categories: ["cheapest"], ...HAND1 });
    // The ranked car's ownership fact is a claim TWO of the two cars satisfy, so it is not writable; its km
    // fact is, and the price line is still not repeated in the section.
    const ranked = car({ id: 2, price: 90_000, median: 100_000, price_v: 10, history: 4, typical: 0, km: -4, km_declared: 72_000, median_km: 60_000, owners: [{ ym: "2019-03", type: "private" }, { ym: "2022-06", type: "private" }], paper_hand: 2 });
    const out = justify(search([cheapest, ranked]));
    assert.equal(rowOf(out, 1).fact, "price");
    assert.deepEqual(rowOf(out, 1).page.why_lines, ["היחיד בחיפוש ביד 1"]);
    assert.equal(rowOf(out, 2).fact, "price");
    assert.deepEqual(rowOf(out, 2).page.why_lines, ['12 אלף ק"מ מעל הממוצע לשנתון']);
  });

  it("the extras are ordered by |effect|, both directions, and skip the first line's family", () => {
    // ownership +4, km −9: the first line is the km sentence (the largest component), so the section's extra is
    // the ownership fact and the km fact is not repeated.
    const ranked = car({ id: 1, price_v: 0, history: 4, typical: 0, km: -9, km_declared: 87_000, median_km: 60_000, ...HAND1 });
    const out = justify(search([ranked, car({ id: 2 })]));
    const row = rowOf(out, 1);
    assert.equal(row.fact, "km");
    assert.deepEqual(row.page.why_lines, ['27 אלף ק"מ מעל הממוצע לשנתון', "היחיד בחיפוש ביד 1"]);
  });

  it("a fact under JUSTIFICATION_MIN_EFFECT_PCT is not an extra", () => {
    const ranked = car({ id: 1, price: 90_000, median: 100_000, price_v: 10, history: 1, typical: 0, km: -1, km_declared: 69_000, median_km: 60_000, ...HAND1 });
    const out = justify(search([ranked, car({ id: 2 })]));
    assert.deepEqual(rowOf(out, 1).page.why_lines, []);
  });

  it("an unverified car gets its rule line and its km fact, never an ownership fact", () => {
    // history_source 'typical' with an effect of its own is not something the engine writes; it is built here so
    // that the "only with a registry reading" guard is what the assertion sees.
    const unverified = car({ id: 1, price_v: 0, history_source: "typical", history: -6, typical: 0, km: -5, km_declared: 75_000, median_km: 60_000 });
    const out = justify(search([unverified]));
    const row = rowOf(out, 1);
    assert.equal(row.kind, "rule_no_history");
    assert.deepEqual(row.page.why_lines, [RULE.no_history, '15 אלף ק"מ מעל הממוצע לשנתון']);
  });

  it("a cancelled car gets its one line and no facts; a thin cell gets no section at all", () => {
    const out = justify(search([car({ id: 1, cancelled: "2026-03-15" }), car({ id: 2, thin: true, ...HAND1 })]));
    assert.deepEqual(rowOf(out, 1).page.why_lines, ["בוטל ב-3/2026"]);
    assert.deepEqual(rowOf(out, 2).page.why_lines, []);
  });
});

// -----------------------------------------------------------------------------------------------------------
describe("§6.7 — the runner-up's fact", () => {
  const withRunnerUp = (runner: Parameters<typeof car>[0]): JustificationSearch =>
    search([cheapestPick(), car(runner)], { runner_up: runner.id });

  it("the price, when the price explains most of the gap", () => {
    const out = justify(withRunnerUp({ id: 2, price: 95_000, median: 100_000 }));
    assert.equal(out.runner_up_fact, "5,000 ₪ מתחת לשווי השוק");
  });

  it("the ownership fact, when ownership does", () => {
    const out = justify(withRunnerUp({ id: 2, price_v: 0, history: 6, typical: 0, km: 0, ...HAND1 }));
    assert.equal(out.runner_up_fact, "היחיד בחיפוש ביד 1");
  });

  it("the km fact, when km does", () => {
    const out = justify(withRunnerUp({ id: 2, price_v: 0, history: 0, typical: 0, km: 6, km_declared: 59_000, median_km: 60_000 }));
    assert.equal(out.runner_up_fact, 'אלף ק"מ מתחת לממוצע לשנתון');
  });

  it("null when no single component exceeds half the gap", () => {
    const out = justify(withRunnerUp({ id: 2, price_v: 2, history: 2, typical: 0, km: 2, km_declared: 54_000, median_km: 60_000, ...HAND1 }));
    assert.equal(out.runner_up_fact, null);
  });

  it("null when the ownership form the component asks for is not writable", () => {
    const out = justify(withRunnerUp({ id: 2, price_v: 0, history: 6, typical: 0, km: 0, ...RENTAL }));
    assert.equal(out.runner_up_fact, null);
  });

  it("null with no runner-up, and null on an uncrowned search", () => {
    assert.equal(justify(search([cheapestPick(), car({ id: 2, price: 95_000, median: 100_000 })])).runner_up_fact, null);
    const uncrowned = search([cheapestPick({ categories: [] }), car({ id: 2, price: 95_000, median: 100_000 })], { runner_up: 2, crowned: false });
    assert.equal(justify(uncrowned).runner_up_fact, null);
  });

  it("the bar's fact is not shortened — a fact over RUNNER_UP_FACT_MAX_CHARS is reported, not suppressed", () => {
    const input = withRunnerUp({ id: 2, price_v: 0, history: 0, typical: 0, km: 6, km_declared: 42_000, median_km: 60_000 });
    const out = justify(input);
    assert.equal(out.runner_up_fact, '18 אלף ק"מ מתחת לממוצע לשנתון');
    assert.ok((out.runner_up_fact?.length ?? 0) > RUNNER_UP_FACT_MAX_CHARS);
    const findings = checkOutput(input, out);
    assert.deepEqual(
      findings.map((f) => f.check),
      ["too_long"],
    );
  });
});

// -----------------------------------------------------------------------------------------------------------
describe("§8 — the self-check", () => {
  const plain: CarJustification = {
    listing_id: 1,
    kind: "max_effect",
    fact: "price",
    sentence: "10,000 ₪ מתחת לשווי השוק",
    tag: "",
    values: {},
    page: { price_line: "10,000 ₪ מתחת לשווי השוק", why_lines: [] },
  };
  const outputOf = (cars: CarJustification[], runner_up_fact: string | null = null): JustificationOutput => ({
    generator_version: JUSTIFICATION_GENERATOR_VERSION,
    cars,
    runner_up_fact,
  });
  const searchOf = (ids: number[], picks: number[] = [], over: Partial<JustificationSearch> = {}) =>
    search(
      ids.map((id) => car({ id, categories: picks.includes(id) ? ["best_value"] : [] })),
      over,
    );

  it("forbidden_word — positive and negative", () => {
    const bad = { ...plain, sentence: "מצב טוב" };
    assert.deepEqual(
      checkOutput(searchOf([1]), outputOf([bad])).map((f) => f.check),
      ["forbidden_word"],
    );
    assert.deepEqual(checkOutput(searchOf([1]), outputOf([plain])), []);
  });

  it("too_long — positive and negative", () => {
    const long = { ...plain, sentence: "א".repeat(SENTENCE_MAX_CHARS + 1) };
    assert.deepEqual(
      checkOutput(searchOf([1]), outputOf([long])).map((f) => f.check),
      ["too_long"],
    );
    const exact = { ...plain, sentence: "א".repeat(SENTENCE_MAX_CHARS) };
    assert.deepEqual(checkOutput(searchOf([1]), outputOf([exact])), []);
  });

  it("pick_against — a pick that says something other than its reason, or wears the tag", () => {
    assert.deepEqual(
      checkOutput(searchOf([1], [1]), outputOf([plain])).map((f) => f.check),
      ["pick_against"],
    );
    assert.deepEqual(
      checkOutput(searchOf([1], [1]), outputOf([{ ...plain, kind: "pick_reason", tag: TAG_CHEAPER_THAN_CHEAPEST }])).map((f) => f.check),
      ["pick_against"],
    );
    assert.deepEqual(checkOutput(searchOf([1], [1]), outputOf([{ ...plain, kind: "pick_reason" }])), []);
    assert.deepEqual(checkOutput(searchOf([1], [1]), outputOf([{ ...plain, kind: "empty", fact: null, sentence: "" }])), []);
  });

  it("one_sentence — a newline is never one sentence", () => {
    assert.deepEqual(
      checkOutput(searchOf([1]), outputOf([{ ...plain, sentence: "שורה\nשנייה" }])).map((f) => f.check),
      ["one_sentence"],
    );
  });

  it("identical_for_all — a pool where every car that speaks says the same thing", () => {
    const cars = [1, 2, 3].map((id) => ({ ...plain, listing_id: id, kind: "rule_no_history" as const, fact: "ownership" as const, sentence: RULE.no_history }));
    // Three sentences: too small a pool for `repeated_sentence`, so this check is the only one that speaks.
    assert.deepEqual(
      checkOutput(searchOf([1, 2, 3]), outputOf(cars)).map((f) => f.check),
      ["identical_for_all"],
    );
    const mixed = [{ ...plain, listing_id: 1 }, { ...plain, listing_id: 2, sentence: "במחיר השוק" }];
    assert.deepEqual(checkOutput(searchOf([1, 2]), outputOf(mixed)), []);
  });

  it("repeated_sentence — 2 of 8 passes, 3 of 8 reports, 2 of 3 is too small a pool to judge", () => {
    const pool = (same: number, total: number): CarJustification[] =>
      Array.from({ length: total }, (_, i) => ({ ...plain, listing_id: i + 1, sentence: i < same ? "במחיר השוק" : `${i} ₪ מתחת לשווי השוק` }));
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    assert.deepEqual(checkOutput(searchOf(ids(8)), outputOf(pool(2, 8))), []);
    const three = checkOutput(searchOf(ids(8)), outputOf(pool(3, 8)));
    assert.deepEqual(
      three.map((f) => f.check),
      ["repeated_sentence"],
    );
    assert.match(three[0].detail, /3 of 8/);
    assert.deepEqual(checkOutput(searchOf(ids(3)), outputOf(pool(2, 3))), []);
  });

  it("tag_on_uncrowned — a tag or a bar fact where nothing was crowned", () => {
    const uncrowned = searchOf([1], [], { crowned: false });
    assert.deepEqual(
      checkOutput(uncrowned, outputOf([{ ...plain, tag: TAG_CHEAPER_THAN_CHEAPEST }])).map((f) => f.check),
      ["tag_on_uncrowned"],
    );
    assert.deepEqual(
      checkOutput(uncrowned, outputOf([plain], "במחיר השוק")).map((f) => f.check),
      ["tag_on_uncrowned"],
    );
    assert.deepEqual(checkOutput(uncrowned, outputOf([plain])), []);
  });

  it("the generator's own output on a full pool reports nothing", () => {
    const input = search(
      [
        cheapestPick(),
        car({ id: 2, price: 90_000, median: 100_000, price_v: 0, history: -22, typical: 0, km: -1, km_declared: 61_000, median_km: 60_000, fires: ["condition_floor"], ...RENTAL, deductions: RENTAL_DEDUCTION }),
        car({ id: 3, price: 105_000, median: 100_000, categories: ["best_value"], history: 4, typical: 0, km: 0, ...HAND1 }),
        car({ id: 4, cancelled: "2026-03-15", price: 120_000 }),
        car({ id: 5, thin: true, km_snapshot: 20_000 }),
        ...fillers(6, 100),
      ],
      { runner_up: 3 },
    );
    assert.deepEqual(checkOutput(input, justify(input)), []);
  });
});

// -----------------------------------------------------------------------------------------------------------
describe("the generator's shape and its determinism (§9)", () => {
  const input = search([
    car({ id: 1, price: 90_000, median: 100_000, categories: ["best_value"] }),
    car({ id: 2, rank: null, price: 50_000, median: 100_000 }),
    car({ id: 3, price_v: 0, history: 6, typical: 0, km: 0, ...HAND1 }),
  ]);

  it("the same input gives the same output", () => {
    assert.deepEqual(justify(input), justify(input));
  });

  it("the output carries the generator's version and keeps the input's order", () => {
    const out = justify(input);
    assert.equal(out.generator_version, JUSTIFICATION_GENERATOR_VERSION);
    assert.deepEqual(
      out.cars.map((c) => c.listing_id),
      [1, 3],
    );
  });

  it("a hidden car yields no row and is counted in no claim", () => {
    const out = justify(input);
    assert.equal(out.cars.length, 2);
    // x = 2, so the hand-1 car is "the only one" of TWO cars, not of three.
    assert.equal(rowOf(out, 3).values.of, 2);
  });

  it("the scope word follows the price ceiling", () => {
    const hand1 = car({ id: 1, price_v: 0, history: 6, typical: 0, km: 0, ...HAND1 });
    assert.equal(justify(search([hand1], { has_price_ceiling: true })).cars[0].sentence, "היחיד בתקציב ביד 1");
    assert.equal(justify(search([hand1])).cars[0].sentence, "היחיד בחיפוש ביד 1");
  });
});
