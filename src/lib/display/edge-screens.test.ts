// BRIEF Days 20–21, Run 2 §2 — every function of edge-screens.ts with the plural, the singular and the
// throwing inputs; dataLine with 34,000 and with a null hand; uncrownedHead at the boundary.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CROWNING_THRESHOLD } from "@/lib/selection/constants";
import { RUBRIC_HEADINGS } from "./rubrics";
import { cancelledGroupHead, dataLine, groupHead, noComparisonLine, placeLabel, uncrownedHead, zeroScoredHead } from "./edge-screens";

const T = CROWNING_THRESHOLD;

describe("uncrownedHead() — reason A: too few cars with a price comparison (§2.1)", () => {
  it("the plural", () => {
    assert.deepEqual(uncrownedHead({ with_comparison: 6, verified: 6, eligible: 6, threshold: T }), {
      title: "רק 6 רכבים עם השוואת מחיר עונים על מה שביקשת. הנה כולם.",
      line: "כשנשארים מעט רכבים לא בוחרים מהם שלושה.",
    });
  });

  it("the singular at one — the line unchanged (§2.5)", () => {
    assert.deepEqual(uncrownedHead({ with_comparison: 1, verified: 1, eligible: 1, threshold: T }), {
      title: "רק רכב אחד עם השוואת מחיר עונה על מה שביקשת. הנה הוא.",
      line: "כשנשארים מעט רכבים לא בוחרים מהם שלושה.",
    });
  });

  it("reason A also when fewer of them are eligible: N is what the head counts", () => {
    assert.equal(uncrownedHead({ with_comparison: 5, verified: 2, eligible: 2, threshold: T }).title, "רק 5 רכבים עם השוואת מחיר עונים על מה שביקשת. הנה כולם.");
  });

  it("the thousands separator is the site's", () => {
    assert.equal(uncrownedHead({ with_comparison: 1200, verified: 3, eligible: 3, threshold: 2000 }).title.includes("1,200"), true);
  });
});

describe("uncrownedHead() — reason B: enough with a comparison, too few with registry history (§2.1)", () => {
  const LINE = "ממליצים רק על רכב עם היסטוריית בעלויות, וכשיש מעט כאלה לא בוחרים מהם שלושה.";

  it("the plural", () => {
    assert.deepEqual(uncrownedHead({ with_comparison: 14, verified: 3, eligible: 3, threshold: T }), {
      title: "14 רכבים עונים על מה שביקשת, ורק ל-3 מהם יש היסטוריית בעלויות במשרד התחבורה. הנה כולם.",
      line: LINE,
    });
  });

  it("one eligible car (§2.5)", () => {
    assert.deepEqual(uncrownedHead({ with_comparison: 14, verified: 1, eligible: 1, threshold: T }), {
      title: "14 רכבים עונים על מה שביקשת, ורק לאחד מהם יש היסטוריית בעלויות במשרד התחבורה. הנה כולם.",
      line: LINE,
    });
  });

  it("no eligible car at all (§2.5)", () => {
    assert.deepEqual(uncrownedHead({ with_comparison: 14, verified: 0, eligible: 0, threshold: T }), {
      title: "14 רכבים עונים על מה שביקשת, ולאף אחד מהם אין היסטוריית בעלויות במשרד התחבורה. הנה כולם.",
      line: LINE,
    });
  });

  // rules v8 (§0d): reason B counts `verified`, not `eligible` — the cars below the floor HAVE registry history and
  // this headline is not about them.
  it("M is `verified`: the cars below the floor do not change this headline", () => {
    assert.equal(
      uncrownedHead({ with_comparison: 14, verified: 3, eligible: 1, threshold: T }).title,
      "14 רכבים עונים על מה שביקשת, ורק ל-3 מהם יש היסטוריית בעלויות במשרד התחבורה. הנה כולם.",
    );
  });
});

// BRIEF Days 22–23, Run 1b §0d — THE THIRD HEADLINE: enough cars with a comparison and enough with registry
// history, and the condition floor is what emptied the screen.
describe("uncrownedHead() — reason C: the cars below the condition floor (§0d)", () => {
  const LINE = "רכב כזה לא מקבל תווית, וכשנשארים מעט רכבים לא בוחרים מהם שלושה.";

  it("K = 1 -> the singular form of K; N has no singular here (N >= threshold)", () => {
    assert.deepEqual(uncrownedHead({ with_comparison: 8, verified: 8, eligible: 7, threshold: T }), {
      title: '8 רכבים עונים על מה שביקשת, אבל לאחד מהם בעלויות או ק"מ נמוכים בהרבה מהממוצע לשנתון. הנה כולם.',
      line: LINE,
    });
  });

  it("K = 4, and both numbers go through the site's num()", () => {
    assert.deepEqual(uncrownedHead({ with_comparison: 13, verified: 9, eligible: 5, threshold: T }), {
      title: '13 רכבים עונים על מה שביקשת, אבל ל-4 מהם בעלויות או ק"מ נמוכים בהרבה מהממוצע לשנתון. הנה כולם.',
      line: LINE,
    });
  });

  it("the km unit is the car page's own rubric heading, never a glyph chosen here", () => {
    assert.equal(uncrownedHead({ with_comparison: 13, verified: 9, eligible: 5, threshold: T }).title.includes(RUBRIC_HEADINGS.km), true);
  });

  it("the thousands separator is the site's, on N and on K", () => {
    const title = uncrownedHead({ with_comparison: 4000, verified: 4000, eligible: 2200, threshold: 4000 }).title;
    assert.equal(title.includes("4,000"), true);
    assert.equal(title.includes("1,800"), true);
  });
});

describe("uncrownedHead() — the boundary and the throws (§2.1, §0d)", () => {
  it("N: 7 -> reason A", () => {
    assert.equal(uncrownedHead({ with_comparison: 7, verified: 7, eligible: 7, threshold: T }).line, "כשנשארים מעט רכבים לא בוחרים מהם שלושה.");
  });

  it("N: 6, all six eligible -> reason A (unchanged)", () => {
    assert.equal(uncrownedHead({ with_comparison: 6, verified: 6, eligible: 6, threshold: T }).line, "כשנשארים מעט רכבים לא בוחרים מהם שלושה.");
  });

  it("N: 8, verified 7 -> reason B", () => {
    assert.equal(
      uncrownedHead({ with_comparison: 8, verified: 7, eligible: 7, threshold: T }).line,
      "ממליצים רק על רכב עם היסטוריית בעלויות, וכשיש מעט כאלה לא בוחרים מהם שלושה.",
    );
  });

  it("N: 9, verified 7, eligible 5 -> reason B: the history count is the one below the threshold", () => {
    assert.equal(
      uncrownedHead({ with_comparison: 9, verified: 7, eligible: 5, threshold: T }).line,
      "ממליצים רק על רכב עם היסטוריית בעלויות, וכשיש מעט כאלה לא בוחרים מהם שלושה.",
    );
  });

  it("N: 8, verified 8, eligible 8 -> a throw: the screen is not uncrowned", () => {
    assert.throws(() => uncrownedHead({ with_comparison: 8, verified: 8, eligible: 8, threshold: T }), /crowned/);
  });

  it("eligible is the count the guard reads: 8 of them throws even with a smaller with_comparison", () => {
    assert.throws(() => uncrownedHead({ with_comparison: 8, verified: 9, eligible: 8, threshold: T }), /crowned/);
  });

  it("N: 0 -> a throw: that is the zero-scored screen", () => {
    assert.throws(() => uncrownedHead({ with_comparison: 0, verified: 0, eligible: 0, threshold: T }), /zero-scored/);
  });
});

describe("zeroScoredHead() (§2.2)", () => {
  it("the plural, with the grey line of §2.3", () => {
    assert.deepEqual(zeroScoredHead(9), {
      title: "נמצאו 9 רכבים. לאף אחד מהם עוד אין השוואת מחיר.",
      line: "אין מספיק רכבים דומים כדי להשוות את המחיר שלהם, ולכן אין להם ציון.",
    });
  });

  it("the singular at one — the line too (§2.5)", () => {
    assert.deepEqual(zeroScoredHead(1), {
      title: "נמצא רכב אחד. עוד אין לו השוואת מחיר.",
      line: "אין מספיק רכבים דומים כדי להשוות את המחיר שלו, ולכן אין לו ציון.",
    });
  });

  it("a separator on a big count", () => {
    assert.equal(zeroScoredHead(1200).title, "נמצאו 1,200 רכבים. לאף אחד מהם עוד אין השוואת מחיר.");
  });

  it("0 -> a throw: that is the zero-results screen", () => {
    assert.throws(() => zeroScoredHead(0), /zero-results/);
  });
});

describe("noComparisonLine() (§2.3, §2.5)", () => {
  it("the plural and the singular", () => {
    assert.equal(noComparisonLine(3), "אין מספיק רכבים דומים כדי להשוות את המחיר שלהם, ולכן אין להם ציון.");
    assert.equal(noComparisonLine(1), "אין מספיק רכבים דומים כדי להשוות את המחיר שלו, ולכן אין לו ציון.");
    assert.equal(noComparisonLine(0), noComparisonLine(3)); // no special form at nought; groupHead is what throws
  });
});

describe("groupHead() (§2.4, §2.5)", () => {
  it("the plural", () => {
    assert.deepEqual(groupHead(3), {
      title: "3 רכבים בלי השוואת מחיר",
      line: "אין מספיק רכבים דומים כדי להשוות את המחיר שלהם, ולכן אין להם ציון.",
    });
  });

  it("the singular at one", () => {
    assert.deepEqual(groupHead(1), {
      title: "רכב אחד בלי השוואת מחיר",
      line: "אין מספיק רכבים דומים כדי להשוות את המחיר שלו, ולכן אין לו ציון.",
    });
  });

  it("0 -> a throw: no group object without rows", () => {
    assert.throws(() => groupHead(0), /never drawn empty/);
  });
});

// BRIEF Days 24–25, Run 1 §5.1 / §6.3 — the cancelled group's object: the same two-line shape, its own words.
describe("cancelledGroupHead() (Days 24–25 §5.1)", () => {
  it("the plural", () => {
    assert.deepEqual(cancelledGroupHead(3), {
      title: "3 רכבים בביטול סופי",
      line: "הרישום שלהם במשרד התחבורה בוטל לצמיתות — הם ירדו מהכביש.",
    });
  });

  it("the singular at one — both lines change", () => {
    assert.deepEqual(cancelledGroupHead(1), {
      title: "רכב אחד בביטול סופי",
      line: "הרישום שלו במשרד התחבורה בוטל לצמיתות — הוא ירד מהכביש.",
    });
  });

  it("the site's thousands separator on a big count", () => {
    assert.equal(cancelledGroupHead(1200).title, "1,200 רכבים בביטול סופי");
  });

  it("0 -> a throw: no group object without rows", () => {
    assert.throws(() => cancelledGroupHead(0), /never drawn empty/);
  });
});

describe("placeLabel() (§2.4)", () => {
  it("the place, with the site's separator on a big one", () => {
    assert.equal(placeLabel(1), "מקום 1");
    assert.equal(placeLabel(12), "מקום 12");
    assert.equal(placeLabel(1200), "מקום 1,200");
  });
});

describe("dataLine() (§2.4)", () => {
  it("34,000 km, hand 2, a word — the km unit is the car page's own rubric heading", () => {
    assert.equal(dataLine({ km: 34000, hand: 2, word: "פרטית" }), `34,000 ${RUBRIC_HEADINGS.km} · יד 2 · פרטית`);
    assert.equal(dataLine({ km: 34000, hand: 2, word: "פרטית" }), '34,000 ק"מ · יד 2 · פרטית');
  });

  it("a null hand -> the rubric's — in its own slot", () => {
    assert.equal(dataLine({ km: 34000, hand: null, word: "פרטית" }), '34,000 ק"מ · יד — · פרטית');
  });

  it("a null km and a null word -> — in their own slots, the unit where it is", () => {
    assert.equal(dataLine({ km: null, hand: 2, word: null }), '— ק"מ · יד 2 · —');
  });
});
