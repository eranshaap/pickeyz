// BRIEF Run 6b §8.2, §8.4, §8.5 — the display texts. Pure: no database, no DOM, no clock of its own
// (every function that needs "now" takes it as an argument).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  backLinkWord,
  comparedToLine,
  duration,
  fairAmount,
  fairLine,
  legendLine,
  months,
  noHistoryView,
  ownershipAxis,
  ownershipKind,
  OWNERSHIP_WORD,
  pageColor,
  percentOfNewLine,
  placeWord,
  priceBlock,
  sellerLine,
  thinCellLine,
  whyHeading,
  years,
  zeroKmExplanation,
} from "./texts";
import { OWNERSHIP_CODES } from "@/lib/mot/translator";

describe("the fair number (§8.2)", () => {
  it("rounds the deal to the nearest 100", () => {
    assert.equal(fairAmount(10, 100_000), 10_000);
    assert.equal(fairAmount(3.7, 100_000), 3_700);
    assert.equal(fairAmount(1.234, 100_000), 1_200); // 1,234 -> 1,200
    assert.equal(fairAmount(1.267, 100_000), 1_300); // 1,267 -> 1,300
  });

  it("positive = under the market, with the digits unsigned", () => {
    assert.equal(fairLine(5, 100_000), "5,000 ₪ מתחת לשווי השוק של רכבים כאלה");
  });

  it("negative = over the market, with the digits unsigned", () => {
    assert.equal(fairLine(-5, 100_000), "5,000 ₪ מעל לשווי השוק של רכבים כאלה");
  });

  it("rounding to 0 is its own sentence, with no number at all", () => {
    assert.equal(fairLine(0, 100_000), "במחיר השוק של רכבים כאלה");
    assert.equal(fairLine(0.04, 100_000), "במחיר השוק של רכבים כאלה"); // 40 -> 0
  });
});

describe("the compared-to and thin-cell lines (§8.2)", () => {
  it("carries the norm row's sample size and window", () => {
    assert.equal(comparedToLine(23, 90), "הושווה ל-23 רכבים דומים שהוצעו למכירה ב-90 הימים האחרונים");
    assert.equal(comparedToLine(7, 180), "הושווה ל-7 רכבים דומים שהוצעו למכירה ב-180 הימים האחרונים");
  });

  it("the thin-cell line is fixed", () => {
    assert.equal(thinCellLine(), "אין השוואת מחיר — פחות מ-5 רכבים דומים הוצעו למכירה");
  });
});

describe("priceBlock() (§8.2)", () => {
  const scored = { score: 5, thin_cell: false, median_price: 100_000, sample_size: 23, window_days: 90 };

  it("a scored listing gets the fair number and the compared-to line", () => {
    assert.deepEqual(priceBlock(scored), {
      fair: "5,000 ₪ מתחת לשווי השוק של רכבים כאלה",
      compared: "הושווה ל-23 רכבים דומים שהוצעו למכירה ב-90 הימים האחרונים",
    });
  });

  it("a thin cell gets its single line instead", () => {
    assert.deepEqual(priceBlock({ ...scored, thin_cell: true }), { thin: thinCellLine() });
  });

  it("an unscored listing gets NOTHING under the % row — no fair, no compared, no thin line", () => {
    assert.equal(priceBlock({ ...scored, score: null }), null);
    assert.equal(priceBlock({ ...scored, median_price: null }), null);
    assert.equal(priceBlock({ ...scored, sample_size: null }), null);
  });
});

describe("percentOfNewLine() (§7.3)", () => {
  it("a whole percent of the car's new list price", () => {
    assert.equal(percentOfNewLine(78_000, 100_000), "‎78% ממחיר החדש");
  });
});

describe("the page colour (§7.2)", () => {
  it("one category -> that category's colour", () => {
    assert.equal(pageColor(["best_value"]), "#6b1f31");
    assert.equal(pageColor(["peace_of_mind"]), "#1b3f4b");
    assert.equal(pageColor(["cheapest"]), "#303577");
  });

  it("more than one -> the fixed bronze", () => {
    assert.equal(pageColor(["best_value", "cheapest"]), "#6e5118");
  });

  it("none -> black", () => {
    assert.equal(pageColor([]), "#221f1c");
  });
});

describe("the back link (§7.3)", () => {
  it("a label -> back to the three recommendations", () => {
    assert.equal(backLinkWord({ hasQuestion: true, labels: ["best_value"] }), "חזרה לשלוש ההמלצות");
  });

  it("a place, or black with a search behind it -> back to the results", () => {
    assert.equal(backLinkWord({ hasQuestion: true, labels: [] }), "חזרה לתוצאות");
  });

  it("no question behind the page -> to the search", () => {
    assert.equal(backLinkWord({ hasQuestion: false, labels: ["best_value"] }), "לחיפוש");
    assert.equal(backLinkWord({ hasQuestion: false, labels: [] }), "לחיפוש");
  });
});

describe("the why heading and its guard (§7.7)", () => {
  const lines = ["a line"];

  it("one label", () => {
    assert.equal(whyHeading({ labels: ["best_value"], rank: 1, lines }), "למה הרכב הזה הוא המשתלם ביותר");
  });

  it("more than one label, joined with וגם", () => {
    assert.equal(whyHeading({ labels: ["best_value", "cheapest"], rank: 1, lines }), "למה הרכב הזה הוא המשתלם ביותר וגם הכי חסכוני");
  });

  it("no label but a place", () => {
    assert.equal(whyHeading({ labels: [], rank: 4, lines }), "למה הרכב הזה הוא מקום 4");
  });

  it("AN EMPTY LIST RENDERS NOTHING AT ALL — this run's only case", () => {
    assert.equal(whyHeading({ labels: ["best_value"], rank: 1, lines: [] }), null);
    assert.equal(whyHeading({ labels: [], rank: 4, lines: [] }), null);
  });

  it("no label and no place never renders the section, even with lines", () => {
    assert.equal(whyHeading({ labels: [], rank: null, lines }), null);
  });

  it("placeWord", () => {
    assert.equal(placeWord(12), "מקום 12");
  });
});

describe("the seller line (§8.4)", () => {
  it("lot -> name · מגרש · region", () => {
    assert.equal(sellerLine({ dealer_type: "lot", dealer_name: "אוטו כהן", listing_region: "מרכז", dealer_region: null }), "אוטו כהן · מגרש · מרכז");
  });

  it("private -> מוכר פרטי · region, with NO name", () => {
    assert.equal(sellerLine({ dealer_type: "private", dealer_name: "ישראל ישראלי", listing_region: "חיפה והקריות", dealer_region: null }), "מוכר פרטי · חיפה והקריות");
  });

  it("the region falls back to the dealer's when the listing has none", () => {
    assert.equal(sellerLine({ dealer_type: "lot", dealer_name: "אוטו כהן", listing_region: null, dealer_region: "צפון" }), "אוטו כהן · מגרש · צפון");
  });

  it("both regions null -> the line renders without the region segment", () => {
    assert.equal(sellerLine({ dealer_type: "lot", dealer_name: "אוטו כהן", listing_region: null, dealer_region: null }), "אוטו כהן · מגרש");
    assert.equal(sellerLine({ dealer_type: "private", dealer_name: "ישראל ישראלי", listing_region: null, dealer_region: null }), "מוכר פרטי");
  });

  it("a type outside §2.7 renders name · region — never an invented word, never the raw code", () => {
    const line = sellerLine({ dealer_type: "leasing", dealer_name: "אלבר", listing_region: "מרכז", dealer_region: null });
    assert.equal(line, "אלבר · מרכז");
    assert.ok(!line.includes("leasing"));
  });
});

describe("durations (§8.5)", () => {
  it("the month forms", () => {
    assert.equal(months(1), "חודש");
    assert.equal(months(2), "חודשיים");
    assert.equal(months(6), "6 חודשים");
  });

  it("the year forms", () => {
    assert.equal(years(1), "שנה");
    assert.equal(years(2), "שנתיים");
    assert.equal(years(3), "3 שנים");
  });

  it("whole years", () => {
    assert.equal(duration(12), "שנה");
    assert.equal(duration(24), "שנתיים");
    assert.equal(duration(36), "3 שנים");
  });

  it("under a year", () => {
    assert.equal(duration(1), "חודש");
    assert.equal(duration(2), "חודשיים");
    assert.equal(duration(11), "11 חודשים");
  });

  it("§8.5's three combined examples, verbatim", () => {
    assert.equal(duration(42), "3 שנים ו-6 חודשים");
    assert.equal(duration(30), "שנתיים ו-6 חודשים");
    assert.equal(duration(37), "3 שנים וחודש");
  });

  it("the connector is ו- before a numeral and ו before a word", () => {
    assert.equal(duration(38), "3 שנים וחודשיים");
    assert.equal(duration(15), "שנה ו-3 חודשים");
  });

  it("a span inside one month takes the table's smallest form", () => {
    assert.equal(duration(0), "חודש");
  });
});

describe("the ownership-type words (§8.5, §2.8)", () => {
  it("VERIFY: every code the codebase produces is in the table — an extra code would stop the run", () => {
    const extra = OWNERSHIP_CODES.filter((c) => !Object.hasOwn(OWNERSHIP_WORD, c));
    assert.deepEqual(extra, [], `ownership codes with no word in §8.5's table: ${extra.join(", ")}`);
  });

  it("the five live codes carry their words", () => {
    assert.equal(OWNERSHIP_WORD.private, "פרטית");
    assert.equal(OWNERSHIP_WORD.leasing, "ליסינג");
    assert.equal(OWNERSHIP_WORD.rental, "השכרה");
    assert.equal(OWNERSHIP_WORD.company, "חברה");
    assert.equal(OWNERSHIP_WORD.dealer, "סוחר");
  });

  it("the two reserved codes stay in the table", () => {
    assert.equal(OWNERSHIP_WORD.government, "ממשלתי");
    assert.equal(OWNERSHIP_WORD.military, "צבאי");
  });

  it("the three kinds the axis paints", () => {
    assert.equal(ownershipKind("private"), "private");
    assert.equal(ownershipKind("dealer"), "dealer");
    for (const c of ["leasing", "rental", "company", "government", "military"]) assert.equal(ownershipKind(c), "institutional");
  });
});

describe("the ownership axis (§7.6)", () => {
  const now = new Date(Date.UTC(2026, 8, 22)); // 2026-09

  it("a leasing-then-private car: hands counted over the non-dealer rows, widths proportional", () => {
    const axis = ownershipAxis({
      history: [
        { ym: "2021-01", type: "leasing" },
        { ym: "2021-07", type: "dealer" },
        { ym: "2021-09", type: "private" },
      ],
      first_registration: new Date(Date.UTC(2021, 0, 15)),
      now,
      zero_km_deal: false,
    });
    assert.equal(axis.segments.length, 3);
    assert.deepEqual(axis.segments.map((s) => s.hand), [1, null, 2]); // the dealer row carries no hand
    assert.deepEqual(axis.segments.map((s) => s.months), [6, 2, 60]);
    assert.equal(axis.total_months, 68);
    assert.ok(Math.abs(axis.segments.reduce((a, s) => a + s.share, 0) - 1) < 1e-9);
    assert.deepEqual(axis.segments.map((s) => s.current), [false, false, true]);
  });

  it("the ends: עלייה לכביש with the first registration, and היום", () => {
    const axis = ownershipAxis({
      history: [{ ym: "2021-01", type: "private" }],
      first_registration: new Date(Date.UTC(2021, 0, 15)),
      now,
      zero_km_deal: false,
    });
    assert.equal(axis.start_label, "עלייה לכביש · 1.2021");
    assert.equal(axis.end_label, "היום");
  });

  it("one tick per calendar year inside the axis", () => {
    const axis = ownershipAxis({
      history: [{ ym: "2021-01", type: "private" }],
      first_registration: new Date(Date.UTC(2021, 0, 15)),
      now,
      zero_km_deal: false,
    });
    assert.deepEqual(axis.ticks.map((t) => t.year), [2022, 2023, 2024, 2025, 2026]);
  });

  it("the zero-km marker sits on the first row, and only when the invoice's fact says so", () => {
    const history = [
      { ym: "2021-01", type: "leasing" },
      { ym: "2021-05", type: "private" },
    ];
    const on = ownershipAxis({ history, first_registration: null, now, zero_km_deal: true });
    assert.deepEqual(on.segments.map((s) => s.zero_km), [true, false]);
    const off = ownershipAxis({ history, first_registration: null, now, zero_km_deal: false });
    assert.deepEqual(off.segments.map((s) => s.zero_km), [false, false]);
  });

  it("the legend lines (§7.6)", () => {
    const axis = ownershipAxis({
      history: [
        { ym: "2021-01", type: "leasing" },
        { ym: "2024-01", type: "dealer" },
        { ym: "2024-03", type: "private" },
      ],
      first_registration: new Date(Date.UTC(2021, 0, 15)),
      now,
      zero_km_deal: false,
    });
    assert.equal(legendLine(axis.segments[0]), "יד 1 · ליסינג · 3 שנים");
    assert.equal(legendLine(axis.segments[1]), 'סוחר · חודשיים · לא נספר כיד');
    assert.equal(legendLine(axis.segments[2]), "יד 2 · פרטית · שנתיים ו-6 חודשים · הבעלות הנוכחית");
  });

  it("an empty history is a stop, not a silent empty bar", () => {
    assert.throws(() => ownershipAxis({ history: [], first_registration: null, now, zero_km_deal: false }), /empty history/);
  });

  it("a malformed ym is a stop", () => {
    assert.throws(() => ownershipAxis({ history: [{ ym: "2021", type: "private" }], first_registration: null, now, zero_km_deal: false }), /YYYY-MM/);
  });
});

describe("the zero-km explanation (§7.6)", () => {
  it("carries the invoice's own duration", () => {
    assert.equal(
      zeroKmExplanation(4),
      'עסקת 0 ק"מ — הרכב נרשם תחילה על שם חברת ליסינג, ועבר לבעלות פרטית אחרי 4 חודשים. חוזה ליסינג רגיל נמשך שלוש שנים ויותר.',
    );
  });
});

describe("no registry history (§7.6)", () => {
  it("a pre-2017 car gets the pre-2017 reason", () => {
    const v = noHistoryView({ first_registration: new Date(Date.UTC(2015, 4, 1)), current_owner_type: "private", hand_declared: 2 });
    assert.equal(v.reason, "היסטוריית בעלויות לא זמינה לרכבים שנרשמו לפני 2017");
    assert.equal(v.current, "הבעלות הנוכחית לפי משרד התחבורה: פרטית");
    assert.equal(v.declared, "במודעה: יד 2 — לפי המוכר, לא אומת");
  });

  it("any other car gets the general reason", () => {
    const v = noHistoryView({ first_registration: new Date(Date.UTC(2020, 4, 1)), current_owner_type: "dealer", hand_declared: 1 });
    assert.equal(v.reason, "היסטוריית בעלויות לא זמינה במשרד התחבורה לרכב הזה");
    assert.equal(v.current, "הבעלות הנוכחית לפי משרד התחבורה: סוחר");
  });

  it("an empty current_owner_type omits the first part", () => {
    const v = noHistoryView({ first_registration: null, current_owner_type: null, hand_declared: 1 });
    assert.equal(v.current, null);
    assert.equal(v.declared, "במודעה: יד 1 — לפי המוכר, לא אומת");
  });

  it("no declared hand omits the declared line", () => {
    assert.equal(noHistoryView({ first_registration: null, current_owner_type: null, hand_declared: null }).declared, null);
  });
});
