// BRIEF Run 1 §1 — the pick cards' pure library. Every case the brief's test list names, and the throws.
//
// The grouping cases are the two new boards: a double winner (two labels, bronze, ONE card, the other card in
// its own slot) and a triple winner (one card). The count is the 25/09 decision: cars and not ads, over the
// rows Stage B kept.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_COLOR,
  CATEGORY_ORDER,
  LABEL_TEXT,
  MULTI_COLOR,
  cardColor,
  countLine,
  currentOwnershipType,
  groupCards,
  ownershipWord,
  runnerUpParts,
  runnerUpTint,
  shownCarsCount,
} from "./cards";
import type { Category } from "@/lib/selection";

describe("§1.1 — one table, and the numbers the brief spells", () => {
  it("the order, the colours, the bronze and the words are exactly the brief's", () => {
    assert.deepEqual([...CATEGORY_ORDER], ["best_value", "peace_of_mind", "cheapest"]);
    assert.deepEqual({ ...CATEGORY_COLOR }, { best_value: "#6b1f31", peace_of_mind: "#1b3f4b", cheapest: "#303577" });
    assert.equal(MULTI_COLOR, "#6e5118");
    assert.deepEqual({ ...LABEL_TEXT }, { best_value: "המשתלם ביותר", peace_of_mind: "ראש שקט", cheapest: "הכי חסכוני" });
  });
});

describe("§1.2 — cardColor()", () => {
  it("one category -> its own colour", () => {
    assert.equal(cardColor(["best_value"]), "#6b1f31");
    assert.equal(cardColor(["peace_of_mind"]), "#1b3f4b");
    assert.equal(cardColor(["cheapest"]), "#303577");
  });

  it("two or three categories -> the one bronze", () => {
    assert.equal(cardColor(["best_value", "cheapest"]), MULTI_COLOR);
    assert.equal(cardColor(["best_value", "peace_of_mind", "cheapest"]), MULTI_COLOR);
  });

  it("no category -> a throw, never a colour", () => {
    assert.throws(() => cardColor([]), /at least one category/);
  });
});

describe("§1.3 — runnerUpTint()", () => {
  it("the indigo card's tint", () => {
    assert.deepEqual(runnerUpTint("#303577"), { bg: "#eef0f8", border: "#cdd3ec" });
  });

  it("the bronze card's tint", () => {
    assert.deepEqual(runnerUpTint("#6e5118"), { bg: "#f8f5ee", border: "#ece2cd" });
  });

  it("any other colour throws — the strip exists only on a card that includes cheapest", () => {
    assert.throws(() => runnerUpTint("#6b1f31"), /no tint for #6b1f31/);
    assert.throws(() => runnerUpTint("#1b3f4b"), /no tint/);
    assert.throws(() => runnerUpTint("#221f1c"), /no tint/);
  });
});

describe("§1.4 — countLine()", () => {
  it("the thousands separators are the km value's", () => {
    assert.equal(countLine(25), "נבחרו מתוך 25 רכבים.");
    assert.equal(countLine(1234), "נבחרו מתוך 1,234 רכבים.");
  });
});

describe("§1.5 — runnerUpParts()", () => {
  it("the amount carries the separators; the identification is model then year", () => {
    assert.deepEqual(runnerUpParts({ amount: 3400, model: "מאזדה 3", year: 2022, fact: null }), {
      lead: "בעוד 3,400 ₪",
      rest: " — מאזדה 3 2022",
    });
  });

  it("a fact is appended after a comma", () => {
    const parts = runnerUpParts({ amount: 3400, model: "מאזדה 3", year: 2022, fact: "יד ראשונה" });
    assert.equal(parts.rest, " — מאזדה 3 2022, יד ראשונה");
  });

  it("no year -> the model alone, and no fact -> nothing after the identification", () => {
    assert.deepEqual(runnerUpParts({ amount: 900, model: "מאזדה 3", year: null, fact: null }), {
      lead: "בעוד 900 ₪",
      rest: " — מאזדה 3",
    });
  });

  it("an amount that is not positive throws — the runner-up is pricier by rule", () => {
    assert.throws(() => runnerUpParts({ amount: 0, model: "מאזדה 3", year: 2022, fact: null }), /pricier than the pick/);
    assert.throws(() => runnerUpParts({ amount: -100, model: "מאזדה 3", year: 2022, fact: null }), /pricier than the pick/);
  });
});

describe("§1.6 — groupCards()", () => {
  const picks = (over: Partial<Record<Category, number | null>>): Record<Category, number | null> => ({
    best_value: null,
    peace_of_mind: null,
    cheapest: null,
    ...over,
  });

  it("three different winners -> three cards in slot order, each in its own colour", () => {
    const cards = groupCards(picks({ best_value: 11, peace_of_mind: 22, cheapest: 33 }));
    assert.deepEqual(
      cards.map((c) => [c.listing, c.categories, c.color]),
      [
        [11, ["best_value"], "#6b1f31"],
        [22, ["peace_of_mind"], "#1b3f4b"],
        [33, ["cheapest"], "#303577"],
      ],
    );
  });

  it("a double winner -> ONE card with both labels in CATEGORY_ORDER, bronze, at its first slot; the other card keeps its own", () => {
    const cards = groupCards(picks({ best_value: 11, peace_of_mind: 22, cheapest: 11 }));
    assert.equal(cards.length, 2);
    assert.deepEqual(cards[0], { listing: 11, categories: ["best_value", "cheapest"], color: MULTI_COLOR });
    assert.deepEqual(cards[1], { listing: 22, categories: ["peace_of_mind"], color: "#1b3f4b" });
  });

  it("a double winner of the last two categories sits at the second slot", () => {
    const cards = groupCards(picks({ best_value: 11, peace_of_mind: 22, cheapest: 22 }));
    assert.deepEqual(cards.map((c) => c.listing), [11, 22]);
    assert.deepEqual(cards[1].categories, ["peace_of_mind", "cheapest"]);
    assert.equal(cards[1].color, MULTI_COLOR);
  });

  it("a triple winner -> ONE card with three labels, bronze", () => {
    const cards = groupCards(picks({ best_value: 7, peace_of_mind: 7, cheapest: 7 }));
    assert.equal(cards.length, 1);
    assert.deepEqual(cards[0], { listing: 7, categories: ["best_value", "peace_of_mind", "cheapest"], color: MULTI_COLOR });
  });

  it("an empty middle category -> two cards, from slots 1 and 3, and no placeholder between them", () => {
    const cards = groupCards(picks({ best_value: 11, peace_of_mind: null, cheapest: 33 }));
    assert.deepEqual(
      cards.map((c) => [c.listing, c.categories]),
      [
        [11, ["best_value"]],
        [33, ["cheapest"]],
      ],
    );
  });

  it("no category answered -> no cards at all", () => {
    assert.deepEqual(groupCards(picks({})), []);
  });
});

describe("§1.7 — shownCarsCount()", () => {
  it("two surviving ads of one car count once", () => {
    const rows = [
      { car_id: 1, shown: true },
      { car_id: 1, shown: true },
      { car_id: 2, shown: true },
    ];
    assert.equal(shownCarsCount(rows), 2);
  });

  it("a row Stage B removed is not counted, not even when it is the car's only other ad", () => {
    const rows = [
      { car_id: 1, shown: true },
      { car_id: 2, shown: false }, // duplicate / sold / below floor / above new price / dealer not visible
      { car_id: 3, shown: true },
    ];
    assert.equal(shownCarsCount(rows), 2);
  });

  it("a car whose every ad was removed is not counted", () => {
    assert.equal(
      shownCarsCount([
        { car_id: 4, shown: false },
        { car_id: 4, shown: false },
      ]),
      0,
    );
  });

  it("no rows -> 0", () => {
    assert.equal(shownCarsCount([]), 0);
  });
});

describe("§1.8 — the ownership words", () => {
  it("every code of the car page's table", () => {
    assert.equal(ownershipWord("private"), "פרטית");
    assert.equal(ownershipWord("leasing"), "ליסינג");
    assert.equal(ownershipWord("rental"), "השכרה");
    assert.equal(ownershipWord("company"), "חברה");
    assert.equal(ownershipWord("government"), "ממשלתי");
    assert.equal(ownershipWord("military"), "צבאי");
    assert.equal(ownershipWord("dealer"), "סוחר");
  });

  it("an unknown code falls back to itself, as the page's line does", () => {
    assert.equal(ownershipWord("something_else"), "something_else");
  });

  it("the current ownership is the last non-dealer row — the one the legend marks", () => {
    const history = [
      { ym: "2019-03", type: "leasing" },
      { ym: "2022-01", type: "private" },
      { ym: "2026-08", type: "dealer" },
    ];
    assert.equal(currentOwnershipType(history), "private");
  });

  it("the last row when it is an ownership", () => {
    assert.equal(currentOwnershipType([{ ym: "2019-03", type: "leasing" }, { ym: "2024-05", type: "company" }]), "company");
  });

  it("no ownership row at all -> null", () => {
    assert.equal(currentOwnershipType([]), null);
    assert.equal(currentOwnershipType([{ ym: "2026-01", type: "dealer" }]), null);
  });
});
