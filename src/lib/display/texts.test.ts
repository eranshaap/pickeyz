// BRIEF Run 6b §8.2, §8.4, §8.5 — the display texts. Pure: no database, no DOM, no clock of its own
// (every function that needs "now" takes it as an argument).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  backLinkWord,
  BLACK,
  BRONZE,
  CATEGORY_COLOR,
  comparedToLine,
  duration,
  fairAmount,
  fairLine,
  hexToHsl,
  hslToHex,
  legendHead,
  legendHeadParts,
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
  RAMP_STEPS,
  scaleLabelWidth,
  scaleLayout,
  type ScaleLabel,
  SCALE_LABEL_GAP_PX,
  sellerLine,
  shadeRamp,
  thinCellLine,
  whyHeading,
  years,
  zeroKmExplanation,
  ZERO_KM_MARKER,
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

  // Run 8 §4.1 — THE DATE FIRST. Was: "עלייה לכביש · 1.2021"; is: "1.2021 · עלייה לכביש".
  it("the ends (§4.1): the DATE first, then עלייה לכביש — and היום", () => {
    const axis = ownershipAxis({
      history: [{ ym: "2021-01", type: "private" }],
      first_registration: new Date(Date.UTC(2021, 0, 15)),
      now,
      zero_km_deal: false,
    });
    assert.equal(axis.start_label, "1.2021 · עלייה לכביש");
    assert.equal(axis.end_label, "היום");
  });

  it("the ends (§4.1): no first registration keeps the caption alone", () => {
    const axis = ownershipAxis({ history: [{ ym: "2021-01", type: "private" }], first_registration: null, now, zero_km_deal: false });
    assert.equal(axis.start_label, "עלייה לכביש");
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

describe("the 0-km deal in the first hand's label (Run 8 §4.3)", () => {
  const now = new Date(Date.UTC(2026, 8, 22));
  const history = [
    { ym: "2021-01", type: "leasing" },
    { ym: "2024-01", type: "private" },
  ];
  const withFlag = ownershipAxis({ history, first_registration: new Date(Date.UTC(2021, 0, 15)), now, zero_km_deal: true });
  const withoutFlag = ownershipAxis({ history, first_registration: new Date(Date.UTC(2021, 0, 15)), now, zero_km_deal: false });

  it("with the flag: the phrase stands IN PLACE OF the ownership-type word", () => {
    assert.equal(legendLine(withFlag.segments[0]), 'יד 1 · עסקת 0 ק"מ · 3 שנים');
    assert.equal(legendHead(withFlag.segments[0]), 'יד 1 · עסקת 0 ק"מ');
  });

  it("without the flag: today's label, unchanged", () => {
    assert.equal(legendLine(withoutFlag.segments[0]), "יד 1 · ליסינג · 3 שנים");
    assert.equal(legendHead(withoutFlag.segments[0]), "יד 1 · ליסינג");
  });

  it("only the FIRST hand carries it; the rest of the row and the current suffix are untouched", () => {
    assert.equal(legendLine(withFlag.segments[1]), "יד 2 · פרטית · שנתיים ו-8 חודשים · הבעלות הנוכחית");
    assert.equal(legendLine(withFlag.segments[1]), legendLine(withoutFlag.segments[1]));
  });

  it("the head splits so that ONLY the phrase is a control, and the split loses nothing", () => {
    const parts = legendHeadParts(withFlag.segments[0]);
    assert.equal(parts.before, "יד 1 · ");
    assert.equal(parts.phrase, 'עסקת 0 ק"מ');
    assert.equal(parts.before + parts.phrase, legendHead(withFlag.segments[0]));

    const plain = legendHeadParts(withoutFlag.segments[0]);
    assert.equal(plain.phrase, null); // nothing is clickable without the flag
    assert.equal(plain.before, legendHead(withoutFlag.segments[0]));
  });

  it("the phrase's characters are the marker's own — the quote mark in ק\"מ included", () => {
    assert.equal(legendHeadParts(withFlag.segments[0]).phrase, ZERO_KM_MARKER);
    assert.ok(zeroKmExplanation(4).startsWith(ZERO_KM_MARKER));
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

// ---------------------------------------------------------------------------
// Run 7 §2.3 — one tick layout, with the collision rule
// ---------------------------------------------------------------------------

describe("the scale layout (Run 7 §2.3)", () => {
  const now = new Date(Date.UTC(2026, 8, 22)); // 2026-09
  const axis = ownershipAxis({
    history: [{ ym: "2021-01", type: "private" }],
    first_registration: new Date(Date.UTC(2021, 0, 15)),
    now,
    zero_km_deal: false,
  });

  /** The footprint of a drawn label as [near, far] distances from the RIGHT edge — the geometry §2.1 fixes. */
  const span = (l: ReturnType<typeof scaleLayout>[number], w: number): [number, number] => {
    const width = scaleLabelWidth(l.text);
    const x = l.share_from_start * w;
    if (l.kind === "start") return [x, x + width];
    if (l.kind === "end") return [x - width, x];
    return [x - width / 2, x + width / 2];
  };

  /**
   * Every YEAR label must clear every other drawn label by SCALE_LABEL_GAP_PX. The two end labels are the
   * rule's fixed points — §2.3 draws them always — so the pair (start, end) is not a collision the layout is
   * allowed to resolve; it is checked separately, at the widths a real card actually has.
   */
  const overlapFreeAt = (w: number) => {
    const drawn = scaleLayout(axis, w);
    for (let i = 0; i < drawn.length; i += 1) {
      for (let j = i + 1; j < drawn.length; j += 1) {
        if (drawn[i].kind !== "year" && drawn[j].kind !== "year") continue;
        const a = span(drawn[i], w);
        const b = span(drawn[j], w);
        const gap = Math.max(a[0] - b[1], b[0] - a[1]);
        assert.ok(gap >= SCALE_LABEL_GAP_PX, `${drawn[i].text} and ${drawn[j].text} are ${gap.toFixed(1)}px apart at width ${w}`);
      }
      const s = span(drawn[i], w);
      if (drawn[i].kind === "year") assert.ok(s[0] >= 0 && s[1] <= w, `${drawn[i].text} leaves the card at width ${w}`);
    }
    return drawn;
  };

  it("the two end labels are ALWAYS drawn, whatever the width", () => {
    for (const w of [0, 40, 120, 320, 1136]) {
      const kinds = scaleLayout(axis, w).map((l) => l.kind);
      assert.ok(kinds.includes("start"), `no start label at ${w}px`);
      assert.ok(kinds.includes("end"), `no end label at ${w}px`);
    }
  });

  it("the ends carry the axis's own words, at the two edges of the RTL geometry", () => {
    const drawn = scaleLayout(axis, 1136);
    const start = drawn.find((l) => l.kind === "start");
    const end = drawn.find((l) => l.kind === "end");
    assert.equal(start?.text, "1.2021 · עלייה לכביש"); // §4.1 — the date first
    assert.equal(start?.share_from_start, 0); // the RIGHT edge
    assert.equal(end?.text, "היום");
    assert.equal(end?.share_from_start, 1); // the LEFT edge
  });

  it("an unmeasured row (width 0) draws the two ends and no year at all", () => {
    assert.deepEqual(scaleLayout(axis, 0).map((l) => l.kind), ["start", "end"]);
  });

  it("a wide desktop card draws every year tick", () => {
    const drawn = overlapFreeAt(1136);
    assert.deepEqual(drawn.filter((l) => l.kind === "year").map((l) => l.year), [2022, 2023, 2024, 2025, 2026]);
  });

  it("a narrow phone card skips the years that do not clear — and never overlaps", () => {
    const phone = overlapFreeAt(326);
    const desktop = overlapFreeAt(1136);
    assert.ok(phone.length < desktop.length, "the phone must drop labels the desktop keeps");
  });

  it("NOTHING overlaps at any width, from 0 to 1600px", () => {
    for (let w = 0; w <= 1600; w += 8) overlapFreeAt(w);
  });

  it("the two end labels themselves clear each other at every real card width", () => {
    // The narrowest card this page ever renders in: a 320px phone, less the main's 16px gutters and the
    // ownership card's 24px padding -> 240px of scale row. Both ends are drawn there, and they clear.
    for (let w = 240; w <= 1600; w += 8) {
      const drawn = scaleLayout(axis, w);
      const s = span(drawn.find((l) => l.kind === "start") as ScaleLabel, w);
      const e = span(drawn.find((l) => l.kind === "end") as ScaleLabel, w);
      assert.ok(Math.max(s[0] - e[1], e[0] - s[1]) >= SCALE_LABEL_GAP_PX, `the two ends collide at width ${w}`);
    }
  });

  it("a skipped year loses its tick AND its label together — a year is never half-drawn", () => {
    const drawn = scaleLayout(axis, 326);
    const drawnYears = drawn.filter((l) => l.kind === "year");
    // every year entry carries both its year number (the tick) and its text (the label)
    for (const l of drawnYears) {
      assert.equal(typeof l.year, "number");
      assert.equal(l.text, String(l.year));
    }
    assert.ok(drawnYears.length < axis.ticks.length, "some year must have been skipped at phone width");
  });
});

// ---------------------------------------------------------------------------
// Run 8 §4.2 — the label-width estimate, and the 2023 tick the old one ate
// ---------------------------------------------------------------------------

describe("the scale label's estimated width (Run 8 §4.2)", () => {
  const END_LABEL = "1.2022 · עלייה לכביש";

  it("per character class, not a flat rate: the end label goes 144px -> 112.8px", () => {
    // five digits at 0.58em, one period + three spaces + one middle dot at 0.3em, ten Hebrew letters at
    // 0.5em => 9.4em at 12px. The flat 0.6em rate of Run 7 made the same twenty characters 144px.
    assert.equal(END_LABEL.length, 20);
    assert.equal(Math.round(scaleLabelWidth(END_LABEL) * 10) / 10, 112.8);
    assert.equal(END_LABEL.length * 0.6 * 12, 144); // what it used to be
  });

  it("a four-digit year and היום: digits 0.58em, Hebrew letters 0.5em", () => {
    assert.equal(Math.round(scaleLabelWidth("2023") * 100) / 100, 27.84);
    assert.equal(scaleLabelWidth("היום"), 24);
  });

  it("never an under-estimate: every class is at least Assistant's real advance at 12px", () => {
    // the real widths this replaces (Assistant 400 @ 12px, measured on the deployed build): a Hebrew letter
    // ~0.46em, a digit ~0.55em, a space ~0.26em. The estimate sits above each of them.
    assert.ok(scaleLabelWidth("א") >= 0.46 * 12);
    assert.ok(scaleLabelWidth("5") >= 0.55 * 12);
    assert.ok(scaleLabelWidth(" ") >= 0.26 * 12);
  });
});

describe("the deployed example: on-the-road 1.2022, today 23/09/2026 (Run 8 §4.2)", () => {
  const axis = ownershipAxis({
    history: [{ ym: "2022-01", type: "private" }],
    first_registration: new Date(Date.UTC(2022, 0, 1)),
    now: new Date(Date.UTC(2026, 8, 23)),
    zero_km_deal: false,
  });

  it("the axis is the deployed one: 1.2022 to היום, with 2023..2026 on the scale", () => {
    assert.equal(axis.start_label, "1.2022 · עלייה לכביש");
    assert.deepEqual(axis.ticks.map((t) => t.year), [2023, 2024, 2025, 2026]);
  });

  it("the desktop card draws EVERY year: 2023, 2024, 2025 and 2026", () => {
    // 1136px — the scale row's width at a 1280px viewport, per the board's layout: the page container's
    // 1280px less the main's 2x48px padding less the ownership card's 2x24px. The code does not take the
    // number from the layout: OwnershipTimeline measures the row (ResizeObserver) and hands the measurement
    // to scaleLayout, so 1136 is what that measurement comes to at that width.
    const years = scaleLayout(axis, 1136).filter((l) => l.kind === "year").map((l) => l.year);
    assert.deepEqual(years, [2023, 2024, 2025, 2026]);
  });

  it("the narrower window the bug was seen in: 2023 was skipped, and is drawn now", () => {
    // The deployed screenshot's clearance (~45px of real space between the two labels) puts the scale row at
    // about 790px, not at a maximised 1280px window. There the old flat estimate left 2023 with 10.9px of
    // estimated clearance — under the 12px rule — and the rule dropped it, tick and label together.
    const drawn = scaleLayout(axis, 790);
    const years = drawn.filter((l) => l.kind === "year").map((l) => l.year);
    assert.deepEqual(years, [2023, 2024, 2025, 2026]);

    // the clearance itself, in the geometry §2.1 fixes: 2023's near edge minus the end label's far edge
    const tick2023 = axis.ticks.find((t) => t.year === 2023) as { share_from_start: number };
    const x = tick2023.share_from_start * 790;
    const clearanceNow = x - scaleLabelWidth("2023") / 2 - scaleLabelWidth(axis.start_label);
    const clearanceBefore = x - (4 * 0.6 * 12) / 2 - 20 * 0.6 * 12;
    assert.ok(clearanceBefore < SCALE_LABEL_GAP_PX, `the old estimate should have skipped 2023, it left ${clearanceBefore.toFixed(1)}px`);
    assert.ok(clearanceNow >= SCALE_LABEL_GAP_PX, `the new estimate must draw 2023, it leaves ${clearanceNow.toFixed(1)}px`);
  });
});

// ---------------------------------------------------------------------------
// Run 7 §2.5 — the shade ramp
// ---------------------------------------------------------------------------

describe("the shade ramp (Run 7 §2.5)", () => {
  // §2.5 — "works for all four page colours (the three categories, bronze) and black"
  const PAGE_COLORS = [CATEGORY_COLOR.best_value, CATEGORY_COLOR.peace_of_mind, CATEGORY_COLOR.cheapest, BRONZE, BLACK];

  it("15 requested -> 15 distinct hex values, for every page colour", () => {
    for (const c of PAGE_COLORS) {
      const ramp = shadeRamp(c, RAMP_STEPS);
      assert.equal(ramp.length, RAMP_STEPS);
      assert.equal(new Set(ramp).size, RAMP_STEPS, `${c} repeated a fill inside 15 steps`);
      assert.ok(ramp.every((v) => /^#[0-9a-f]{6}$/.test(v)), `${c} produced something that is not a hex colour`);
    }
  });

  it("no two ADJACENT segments are ever equal, up to 40 owners", () => {
    for (const c of PAGE_COLORS) {
      for (let n = 2; n <= 40; n += 1) {
        const ramp = shadeRamp(c, n);
        assert.equal(ramp.length, n);
        for (let i = 1; i < n; i += 1) assert.notEqual(ramp[i], ramp[i - 1], `${c}: fills ${i - 1} and ${i} are equal at n=${n}`);
      }
    }
  });

  it("no two segments of one axis share a fill, up to the 15 the ramp guarantees", () => {
    for (const c of PAGE_COLORS) {
      for (let n = 1; n <= RAMP_STEPS; n += 1) assert.equal(new Set(shadeRamp(c, n)).size, n, `${c} repeated a fill at n=${n}`);
    }
  });

  it("the fills sit on the PAGE COLOUR'S hue and climb in lightness", () => {
    for (const c of PAGE_COLORS) {
      const hue = hexToHsl(c).h;
      const ramp = shadeRamp(c, RAMP_STEPS);
      let last = -1;
      for (const fill of ramp) {
        const { h, l } = hexToHsl(fill);
        if (hexToHsl(c).s > 0.02) assert.ok(Math.abs(h - hue) <= 4, `${fill} left ${c}'s hue (${h.toFixed(1)} vs ${hue.toFixed(1)})`);
        assert.ok(l > last, `${fill} did not climb in lightness`);
        last = l;
      }
    }
  });

  it("a single owner takes the darkest end — the page colour's own depth", () => {
    for (const c of PAGE_COLORS) assert.equal(shadeRamp(c, 1)[0], shadeRamp(c, RAMP_STEPS)[0]);
  });

  it("beyond 15 the ramp cycles WITH AN OFFSET — the 16th is not the 1st again", () => {
    for (const c of PAGE_COLORS) {
      const ramp = shadeRamp(c, 16);
      assert.notEqual(ramp[15], ramp[0], `${c} cycled without an offset`);
    }
  });

  it("nothing requested -> nothing returned", () => {
    assert.deepEqual(shadeRamp(BLACK, 0), []);
  });

  it("a colour that is not #rrggbb is a stop, never a silent grey", () => {
    assert.throws(() => shadeRamp("wine", 3), /not a "#rrggbb" colour/);
    assert.throws(() => shadeRamp("#abc", 3), /not a "#rrggbb" colour/);
  });

  it("hex -> hsl -> hex round-trips every page colour", () => {
    for (const c of PAGE_COLORS) assert.equal(hslToHex(hexToHsl(c)), c.toLowerCase());
  });
});
