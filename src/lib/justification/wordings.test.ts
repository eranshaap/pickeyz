// BRIEF Days 22–23, Run 2, §9 — the wordings file: the characters, the lengths, and the rule that keeps it the
// ONE home of the generator's language.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RUBRIC_HEADINGS } from "@/lib/display/rubrics";
import { SENTENCE_MAX_CHARS } from "./constants";
import {
  FAVOURABLE_OWNERSHIP_ORDER,
  FORBIDDEN_WORDS,
  KM,
  LOWEST_KM,
  OWNER_WORD,
  OWNERSHIP,
  PRICE,
  RULE,
  RULE_ORDER,
  SCOPE,
  TAG_CHEAPER_THAN_CHEAPEST,
  UNFAVOURABLE_TIE_ORDER,
} from "./wordings";

/** Every wording the file produces, rendered with sample values — the whole surface, in one list. */
function everyWording(): string[] {
  const out: string[] = [PRICE.at, RULE.no_history, TAG_CHEAPER_THAN_CHEAPEST];
  for (const ils of ["1,900", "12,300"]) out.push(PRICE.below(ils), PRICE.above(ils));
  for (const n of [1, 2, 17]) out.push(KM.above(n), KM.below(n));
  out.push(RULE.cancelled(3, 2026), RULE.cancelled(11, 2025));
  for (const scope of [SCOPE.budget, SCOPE.search]) {
    out.push(LOWEST_KM(scope));
    out.push(OWNERSHIP.only_hand1(scope), OWNERSHIP.one_of_hand1(10, scope));
    out.push(OWNERSHIP.only_all_private(scope), OWNERSHIP.one_of_all_private(10, scope));
    out.push(OWNERSHIP.only_hand_up(scope, 5), OWNERSHIP.one_of_hand_up(10, scope, 5));
    for (const word of Object.values(OWNER_WORD)) {
      out.push(OWNERSHIP.only_was_type(scope, word), OWNERSHIP.one_of_was_type(10, scope, word));
    }
  }
  return out;
}

describe("the wordings file (§3)", () => {
  it("no wording contains a forbidden word", () => {
    for (const text of everyWording()) {
      for (const word of FORBIDDEN_WORDS) {
        assert.ok(!text.includes(word), `${JSON.stringify(text)} contains the forbidden ${JSON.stringify(word)}`);
      }
    }
  });

  it('the km unit is RUBRIC_HEADINGS.km character for character — ASCII " , not the gershayim', () => {
    assert.equal(RUBRIC_HEADINGS.km, 'ק"מ'); // the anchor: ASCII U+0022
    for (const text of [KM.above(1), KM.above(17), KM.below(1), KM.below(17), LOWEST_KM(SCOPE.search)]) {
      assert.ok(text.includes(RUBRIC_HEADINGS.km), `${JSON.stringify(text)} does not carry ${JSON.stringify(RUBRIC_HEADINGS.km)}`);
      assert.ok(!text.includes("ק״מ"), `${JSON.stringify(text)} uses the gershayim U+05F4`);
    }
  });

  it("the tag is the plan's string, with ASCII quotes", () => {
    assert.equal(TAG_CHEAPER_THAN_CHEAPEST, 'זול מ"הכי חסכוני"');
    assert.equal(TAG_CHEAPER_THAN_CHEAPEST.split('"').length - 1, 2);
  });

  it("when n is 1 the digit is dropped before אלף", () => {
    assert.equal(KM.above(1), 'אלף ק"מ מעל הממוצע לשנתון');
    assert.equal(KM.below(1), 'אלף ק"מ מתחת לממוצע לשנתון');
    assert.equal(KM.above(17), '17 אלף ק"מ מעל הממוצע לשנתון');
    assert.equal(KM.below(17), '17 אלף ק"מ מתחת לממוצע לשנתון');
  });

  it("the longest ownership form — n = 10, h = 5, the budget scope — still fits SENTENCE_MAX_CHARS", () => {
    const longest = [
      OWNERSHIP.one_of_hand1(10, SCOPE.budget),
      OWNERSHIP.one_of_all_private(10, SCOPE.budget),
      OWNERSHIP.one_of_hand_up(10, SCOPE.budget, 5),
      ...Object.values(OWNER_WORD).map((w) => OWNERSHIP.one_of_was_type(10, SCOPE.budget, w)),
      OWNERSHIP.one_of_hand1(10, SCOPE.search),
      OWNERSHIP.one_of_all_private(10, SCOPE.search),
      OWNERSHIP.one_of_hand_up(10, SCOPE.search, 5),
      ...Object.values(OWNER_WORD).map((w) => OWNERSHIP.one_of_was_type(10, SCOPE.search, w)),
    ];
    for (const text of longest) {
      assert.ok(text.length <= SENTENCE_MAX_CHARS, `${JSON.stringify(text)} is ${text.length} chars > ${SENTENCE_MAX_CHARS}`);
    }
  });

  it("the month of a cancellation carries no leading zero", () => {
    assert.equal(RULE.cancelled(3, 2026), "בוטל ב-3/2026");
  });

  it("the orders are data here, not logic in the files that read them", () => {
    assert.deepEqual(RULE_ORDER, ["cancelled", "unverified_history", "condition_floor"]);
    assert.deepEqual(FAVOURABLE_OWNERSHIP_ORDER, ["hand1", "all_private"]);
    assert.deepEqual(UNFAVOURABLE_TIE_ORDER, ["rental", "leasing", "company", "hand_up"]);
  });

  it("OWNER_WORD holds exactly the three types the ledger deducts for", () => {
    assert.deepEqual(Object.keys(OWNER_WORD).sort(), ["company", "leasing", "rental"]);
  });
});

describe("the logic files hold no Hebrew at all (§3)", () => {
  // The wordings file is the one home of the language. A Hebrew letter anywhere else in the library — even in a
  // comment — is a second home waiting to disagree with the first.
  const HEBREW = /[א-ת]/;
  for (const file of ["facts.ts", "claims.ts", "price.ts", "index.ts"]) {
    it(`${file} contains no letter in U+05D0–U+05EA`, () => {
      const source = readFileSync(join(process.cwd(), "src", "lib", "justification", file), "utf8");
      const hit = HEBREW.exec(source);
      assert.equal(hit, null, hit === null ? "" : `${file} carries ${JSON.stringify(hit[0])} at index ${hit.index}`);
    });
  }
});
