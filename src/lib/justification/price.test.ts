// BRIEF Days 22–23, Run 2, §9 — the price expression and the km sentence. The first four cases are the ones
// that used to live in src/lib/display/texts.test.ts:43-48: the function moved (§7), its behaviour did not.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fairAmount, fairLine, kmSentence, priceExpression, priceValueIls } from "./price";
import { PRICE } from "./wordings";
import { carFacts } from "./facts";
import { car } from "./fixtures";

describe("fairAmount() — the moved function, unchanged (§7)", () => {
  it("rounds the deal to the nearest 100", () => {
    assert.equal(fairAmount(10, 100_000), 10_000);
    assert.equal(fairAmount(3.7, 100_000), 3_700);
    assert.equal(fairAmount(1.234, 100_000), 1_200); // 1,234 -> 1,200
    assert.equal(fairAmount(1.267, 100_000), 1_300); // 1,267 -> 1,300
  });
});

describe("priceExpression() (§6.5)", () => {
  it("rounding to 0 is its own sentence, with no number at all", () => {
    assert.equal(priceExpression(0.04, 100_000), PRICE.at); // 40 -> 0
    assert.equal(priceExpression(0.04, 100_000), "במחיר השוק");
    assert.equal(priceExpression(0, 100_000), "במחיר השוק");
  });

  it("positive = under the market, negative = over it, the digits always unsigned", () => {
    assert.equal(priceExpression(2, 100_000), "2,000 ₪ מתחת לשווי השוק");
    assert.equal(priceExpression(-1.9, 100_000), "1,900 ₪ מעל לשווי השוק");
  });

  it("either input null -> no expression at all", () => {
    assert.equal(priceExpression(null, 100_000), null);
    assert.equal(priceExpression(2, null), null);
    assert.equal(priceExpression(null, null), null);
  });

  it("values.ils is the amount, unsigned, and 0 for the at-market form", () => {
    assert.equal(priceValueIls(2, 100_000), 2_000);
    assert.equal(priceValueIls(-1.9, 100_000), 1_900);
    assert.equal(priceValueIls(0.04, 100_000), 0);
  });

  it("fairLine() keeps its non-null contract (§7)", () => {
    assert.equal(fairLine(5, 100_000), "5,000 ₪ מתחת לשווי השוק");
    // @ts-expect-error — the contract is non-null; only untyped callers can reach this
    assert.throws(() => fairLine(null, 100_000), /both are required/);
  });
});

describe("the km sentence (§6.5)", () => {
  const facts = (spec: Parameters<typeof car>[0]) => carFacts(car(spec));

  it("above the cell's median -> KM.above, below it -> KM.below, signed in values.km", () => {
    assert.deepEqual(kmSentence(facts({ id: 1, km: -3, km_declared: 78_000, median_km: 60_000 }), 1), {
      sentence: '18 אלף ק"מ מעל הממוצע לשנתון',
      km: 18,
    });
    assert.deepEqual(kmSentence(facts({ id: 2, km: 3, km_declared: 42_000, median_km: 60_000 }), 2), {
      sentence: '18 אלף ק"מ מתחת לממוצע לשנתון',
      km: -18,
    });
  });

  it("a gap that rounds to 0 thousands is no sentence", () => {
    assert.equal(kmSentence(facts({ id: 3, km: 0, km_declared: 60_400, median_km: 60_000 }), 3), null);
    assert.equal(kmSentence(facts({ id: 4, km: 0, km_declared: 60_000, median_km: 60_000 }), 4), null);
  });

  it("the n = 1 form drops the digit", () => {
    assert.equal(kmSentence(facts({ id: 5, km: -1, km_declared: 61_000, median_km: 60_000 }), 5)?.sentence, 'אלף ק"מ מעל הממוצע לשנתון');
  });

  it("an unavailable km row -> nothing to say", () => {
    assert.equal(kmSentence(facts({ id: 6, km: null }), 6), null);
  });

  it("a gap and an effect that disagree are a broken invoice, said as such", () => {
    assert.throws(() => kmSentence(facts({ id: 7, km: 4, km_declared: 78_000, median_km: 60_000 }), 7), /listing 7/);
    assert.throws(() => kmSentence(facts({ id: 8, km: -4, km_declared: 42_000, median_km: 60_000 }), 8), /listing 8/);
  });
});
