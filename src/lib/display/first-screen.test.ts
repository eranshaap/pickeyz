// BRIEF Days 24–25, Run 3 §3.3 — the first-screen rule, on the plan's own screens. Pure: no database, no
// clock, no DOM (the script's pin builds a fake `window` and `document` of its own).
//
// WHAT IS ASSERTED AND WHAT IS NOT. The FORM is the rule and is asserted on every screen; the photo's size is
// NOT, because the chrome sums of first-screen.ts are Claude's, read off the classes §4.2 writes, and the
// brief calibrates them by eye on the live site (§5.2's one console line is the instrument). So the five
// measured screens print their computed `w×h · fit` beside the plan's numbers and the REPORT carries the
// table; what the tests hold are the form, the 4:3 box, the floor, the ceiling and the text column's minimum.
//
// NO TEST READS A COMPONENT'S CLASS NAMES. PICK_ROW_GAP_PX, the two side paddings and PICK_COMPACT_GAP_PX each
// carry a comment naming the class they must equal, and the REPORT's chrome table lists every constant beside
// the class it was summed from — the eye check is the pin.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyFirstScreen,
  firstScreen,
  FIRST_SCREEN_SCRIPT,
  innerCardWidthPx,
  pickChromePx,
  PICK_CHROME_COMPACT_PX,
  PICK_CHROME_UPRIGHT_PX,
  PICK_COMPACT_GAP_PX,
  PICK_LABEL_WRAP_EXTRA_PX,
  PICK_PHOTO_FLOOR_H_PX,
  PICK_PHOTO_RATIO,
  PICK_SENTENCE_EXTRA_PX,
  PICK_STRIP_EXTRA_PX,
  PICK_TEXT_COLUMN_MIN_PX,
  type FirstScreenResult,
  type PickChrome,
  type PickChromeInput,
} from "./first-screen";
import { DESKTOP_MIN_WIDTH_PX } from "./layout";

// ---------------------------------------------------------------------------
// the fixtures
// ---------------------------------------------------------------------------

/** One card, as pickChromePx() reads it: its categories and whether the generator gave it a sentence. */
const card = (categories: string[], sentence: string | null = null): PickChromeInput["cards"][number] => ({ categories, sentence });

/** The common case the five measured screens are computed with: three plain cards WITH a runner-up. */
const PLAIN_WITH_RUNNER_UP: PickChromeInput = {
  cards: [card(["best_value"]), card(["peace_of_mind"]), card(["cheapest"])],
  runner_up: { public_id: "p1" },
};

const COMMON: PickChrome = pickChromePx(PLAIN_WITH_RUNNER_UP);

const at = (innerWidth: number, innerHeight: number, chrome: PickChrome = COMMON): FirstScreenResult =>
  firstScreen({ innerWidth, innerHeight, chrome });

// ---------------------------------------------------------------------------
// §3.3 — the five measured screens of the plan
// ---------------------------------------------------------------------------

/** findCar-plan.md, Days 24–25, "חמשת המסכים הנמדדים" — the plan's own photo boxes, printed beside ours. */
const MEASURED = [
  { w: 1280, h: 600, form: "compact" as const, fit: null, plan: "203×152" },
  { w: 1536, h: 700, form: "compact" as const, fit: "ceiling" as const, plan: "256×192" },
  { w: 1180, h: 745, form: "upright" as const, fit: null, plan: "284×213" },
  { w: 1905, h: 919, form: "upright" as const, fit: "ceiling" as const, plan: "390×293" },
  { w: 2560, h: 1280, form: "upright" as const, fit: "ceiling" as const, plan: "390×293" },
];

describe("§3.3 — the five measured screens, with the chrome of a plain three-card answer with a runner-up", () => {
  for (const screen of MEASURED) {
    it(`${screen.w}×${screen.h} → ${screen.form}${screen.fit === null ? "" : `, ${screen.fit}`} (plan ${screen.plan})`, () => {
      const r = at(screen.w, screen.h);
      // The line the REPORT's table is copied from: ours, then the plan's.
      console.log(`  first-screen ${screen.w}×${screen.h}: ${r.photoW}×${r.photoH} · ${r.fit}   plan ${screen.plan}`);
      assert.equal(r.form, screen.form);
      if (screen.fit !== null) assert.equal(r.fit, screen.fit);
    });
  }
});

// ---------------------------------------------------------------------------
// §3.3 — the boundary, the floor and the narrow-and-low corner
// ---------------------------------------------------------------------------

describe("§3.1.1 — below the site's boundary the rule does not apply", () => {
  it("one pixel under 900 is the phone, with no box and no fit", () => {
    assert.deepEqual(at(DESKTOP_MIN_WIDTH_PX - 1, 900), { form: "phone", photoW: 0, photoH: 0, fit: "none" });
  });

  it("the boundary itself is already a desktop form", () => {
    assert.notEqual(at(DESKTOP_MIN_WIDTH_PX, 900).form, "phone");
  });
});

describe("§3.1.4 — the floor and the corner", () => {
  it("a low window (1280×500) → compact at its floor, the photo 96 tall", () => {
    const r = at(1280, 500);
    assert.equal(r.form, "compact");
    assert.equal(r.fit, "floor");
    assert.equal(r.photoH, PICK_PHOTO_FLOOR_H_PX);
  });

  it("the narrow-and-low corner (960×540): the text column keeps its 130 and the photo goes under the floor", () => {
    const r = at(960, 540);
    assert.equal(r.form, "compact");
    assert.equal(r.fit, "ceiling"); // the column's minimum wins over the photo's floor (decision 23)
    assert.ok(r.photoH < PICK_PHOTO_FLOOR_H_PX, `${r.photoH}`);
    assert.equal(r.photoW, Math.round(r.photoW)); // whole
    assert.ok(Math.abs(r.photoW - r.photoH * PICK_PHOTO_RATIO) <= 1);
    assert.equal(r.photoW + PICK_COMPACT_GAP_PX + PICK_TEXT_COLUMN_MIN_PX, innerCardWidthPx(960, "compact"));
  });
});

// ---------------------------------------------------------------------------
// §3.3 — what holds on EVERY desktop screen
// ---------------------------------------------------------------------------

/** The grid the two sweeps below share: the brief's own widths and heights (§3.3). */
const WIDTHS: number[] = [];
for (let w = 800; w <= 2560; w += 160) WIDTHS.push(w);
const HEIGHTS: number[] = [];
for (let h = 480; h <= 1300; h += 100) HEIGHTS.push(h);

/** The three chrome variants of §3.3: the bare card, the common case, and everything a card can carry. */
const CHROMES: PickChrome[] = [
  pickChromePx({ cards: [card(["best_value"])], runner_up: null }),
  COMMON,
  pickChromePx({
    cards: [card(["best_value", "peace_of_mind", "cheapest"], "משפט")],
    runner_up: { public_id: "p1" },
  }),
];

describe("§3.3 — every desktop result is a whole 4:3 box that leaves the text column its minimum", () => {
  it("over the whole grid, in all three chromes", () => {
    for (const chrome of CHROMES) {
      for (const w of WIDTHS) {
        for (const h of HEIGHTS) {
          const r = at(w, h, chrome);
          if (r.form === "phone") continue;
          const where = `${w}×${h} ${r.form}`;
          assert.equal(r.photoW, Math.round(r.photoW), where);
          assert.equal(r.photoH, Math.round(r.photoH), where);
          assert.ok(Math.abs(r.photoW - r.photoH * PICK_PHOTO_RATIO) <= 1, `${where}: ${r.photoW}×${r.photoH}`);
          if (r.form === "compact") {
            assert.ok(
              r.photoW + PICK_COMPACT_GAP_PX + PICK_TEXT_COLUMN_MIN_PX <= innerCardWidthPx(w, "compact"),
              `${where}: ${r.photoW} + ${PICK_COMPACT_GAP_PX} + ${PICK_TEXT_COLUMN_MIN_PX} > ${innerCardWidthPx(w, "compact")}`,
            );
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §3.3 — pickChromePx(): each increment, on and off
// ---------------------------------------------------------------------------

describe("§3.1 — pickChromePx()", () => {
  const base: PickChromeInput = { cards: [card(["best_value"])], runner_up: null };

  it("a bare card is the base chrome of each form", () => {
    assert.deepEqual(pickChromePx(base), { upright: PICK_CHROME_UPRIGHT_PX, compact: PICK_CHROME_COMPACT_PX });
  });

  it("a recorded runner-up WITHOUT a cheapest card adds nothing — the strip is the cheapest card's", () => {
    assert.deepEqual(pickChromePx({ cards: base.cards, runner_up: { public_id: "p1" } }), pickChromePx(base));
  });

  it("a recorded runner-up AND a cheapest card add the strip, per form", () => {
    const withStrip = pickChromePx({ cards: [card(["cheapest"])], runner_up: { public_id: "p1" } });
    assert.deepEqual(withStrip, {
      upright: PICK_CHROME_UPRIGHT_PX + PICK_STRIP_EXTRA_PX.upright,
      compact: PICK_CHROME_COMPACT_PX + PICK_STRIP_EXTRA_PX.compact,
    });
  });

  it("a cheapest card WITHOUT a recorded runner-up adds nothing", () => {
    assert.deepEqual(pickChromePx({ cards: [card(["cheapest"])], runner_up: null }), pickChromePx(base));
  });

  it("three categories on one card add the second labels row, per form", () => {
    assert.deepEqual(pickChromePx({ cards: [card(["best_value", "peace_of_mind", "cheapest"])], runner_up: null }), {
      upright: PICK_CHROME_UPRIGHT_PX + PICK_LABEL_WRAP_EXTRA_PX.upright,
      compact: PICK_CHROME_COMPACT_PX + PICK_LABEL_WRAP_EXTRA_PX.compact,
    });
  });

  it("two categories do not wrap", () => {
    assert.deepEqual(pickChromePx({ cards: [card(["best_value", "peace_of_mind"])], runner_up: null }), pickChromePx(base));
  });

  it("one card with a sentence adds one line, per form", () => {
    assert.deepEqual(pickChromePx({ cards: [card(["best_value"]), card(["cheapest"], "משפט")], runner_up: null }), {
      upright: PICK_CHROME_UPRIGHT_PX + PICK_SENTENCE_EXTRA_PX.upright,
      compact: PICK_CHROME_COMPACT_PX + PICK_SENTENCE_EXTRA_PX.compact,
    });
  });

  it("all three increments together", () => {
    assert.deepEqual(pickChromePx({ cards: [card(["best_value", "peace_of_mind", "cheapest"], "משפט")], runner_up: { public_id: "p1" } }), {
      upright: PICK_CHROME_UPRIGHT_PX + PICK_STRIP_EXTRA_PX.upright + PICK_LABEL_WRAP_EXTRA_PX.upright + PICK_SENTENCE_EXTRA_PX.upright,
      compact: PICK_CHROME_COMPACT_PX + PICK_STRIP_EXTRA_PX.compact + PICK_LABEL_WRAP_EXTRA_PX.compact + PICK_SENTENCE_EXTRA_PX.compact,
    });
  });
});

// ---------------------------------------------------------------------------
// §3.3 — THE PIN: the inline script IS firstScreen() + applyFirstScreen()
// ---------------------------------------------------------------------------

/** What the writer leaves behind, from either road, in a comparable shape. */
type Written = { pickForm: string | undefined; w: string | null; h: string | null };

/** A <html> that records rather than renders. */
function fakeRoot(): { root: Written & { dataset: { pickForm?: string }; style: { setProperty(p: string, v: string): void; removeProperty(p: string): string } }; read: () => Written } {
  const props = new Map<string, string>();
  const dataset: { pickForm?: string } = {};
  const root = {
    dataset,
    style: {
      setProperty(p: string, v: string) {
        props.set(p, v);
      },
      removeProperty(p: string): string {
        const had = props.get(p) ?? "";
        props.delete(p);
        return had;
      },
    },
  };
  return {
    root: root as never,
    read: () => ({ pickForm: dataset.pickForm, w: props.get("--pick-photo-w") ?? null, h: props.get("--pick-photo-h") ?? null }),
  };
}

/** Run the script string against a fake window and document, and read back what it wrote. */
function runScript(innerWidth: number, innerHeight: number, chrome: PickChrome): Written {
  const { root, read } = fakeRoot();
  const parentElement = { dataset: { pickChromeUpright: String(chrome.upright), pickChromeCompact: String(chrome.compact) } };
  const doc = { currentScript: { parentElement }, documentElement: root };
  new Function("window", "document", FIRST_SCREEN_SCRIPT)({ innerWidth, innerHeight }, doc);
  return read();
}

/** The same window through the module's two functions. */
function runModule(innerWidth: number, innerHeight: number, chrome: PickChrome): Written {
  const { root, read } = fakeRoot();
  applyFirstScreen(firstScreen({ innerWidth, innerHeight, chrome }), root);
  return read();
}

describe("§3.2 / §3.3 — the inline script and the module are ONE computation", () => {
  it("they agree on every window of the grid, in all three chromes", () => {
    let checked = 0;
    for (const chrome of CHROMES) {
      for (const w of WIDTHS) {
        for (const h of HEIGHTS) {
          assert.deepEqual(runScript(w, h, chrome), runModule(w, h, chrome), `${w}×${h} chrome ${chrome.upright}/${chrome.compact}`);
          checked += 1;
        }
      }
    }
    assert.equal(checked, CHROMES.length * WIDTHS.length * HEIGHTS.length);
  });

  it("on the phone both write the form and REMOVE the two properties", () => {
    assert.deepEqual(runScript(800, 900, COMMON), { pickForm: "phone", w: null, h: null });
    assert.deepEqual(runModule(800, 900, COMMON), { pickForm: "phone", w: null, h: null });
  });

  it("the script leaves no global behind and names no import", () => {
    assert.ok(!FIRST_SCREEN_SCRIPT.includes("import"), FIRST_SCREEN_SCRIPT);
    assert.match(FIRST_SCREEN_SCRIPT, /^\(function\(\)\{/);
    assert.match(FIRST_SCREEN_SCRIPT, /\}\)\(\);$/);
  });
});
