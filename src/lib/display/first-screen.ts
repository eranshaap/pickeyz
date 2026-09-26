// THE FIRST SCREEN OF THE RECOMMENDATIONS SCREEN (BRIEF Days 24–25, Run 3 §3) — one pure computation for the
// rule findCar-now.md states under "מתחת לכרטיסים וקו הקיפול": on every desktop screen the three cards are
// visible WHOLE and the list heading "מקום 4 והלאה — …" is visible with them; the cards start at the top; the
// photo is the largest whole 4:3 photo that still lets the heading land PICK_LANDING_PX above the window's
// bottom edge. Below the site's boundary (the phone and the iPad in portrait) the rule does not apply at all.
//
// PURE, like layout.ts: no DOM, no React, no clock. It is given a window's two numbers and a card's chrome and
// it answers with a form and a photo box. The two writers — the inline script of §4.4 and the hook of §5 —
// both go through applyFirstScreen() below, so there is ONE writer and ONE computation (work.md, "מבנה חוזר =
// מקום אחד בקוד").
//
// THE TWO FORMS ARE ONE DOM (§4): `upright` puts the photo above the text at up to the card's inner width,
// `compact` puts it beside the title and the price with the rubrics below. Which one is on is a single
// attribute on <html> — `data-pick-form` — read by the `pick-compact` Tailwind variant in globals.css; the
// photo's box is two custom properties on the same element. Nothing here knows that: this module computes, and
// applyFirstScreen() writes.
//
// EVERY NUMBER IS IN px AND EVERY NUMBER IS READ OFF A CLASS. The class each constant was read from is named
// beside it, because no test can read a component's class names (§3.3) — the eye check on the live site is the
// pin, and §5.2's one console line is what calibrates the sums.

import { DESKTOP_MIN_WIDTH_PX, RESULTS_CONTAINER_PADDING_PX, RESULTS_CONTAINER_PX } from "./layout";

// ---------------------------------------------------------------------------
// §3.1 — the frame: the row, the card's border, the stack above and below the cards
// ---------------------------------------------------------------------------

/** The gap between the three cards. MUST EQUAL `gap-6` on PickCards' root row (PickCards.tsx). */
export const PICK_ROW_GAP_PX = 24;

/** One side of a card's border: `border: 1px solid CARD_BORDER` on the <article> (PickCards.tsx). */
export const PICK_CARD_BORDER_PX = 1;

/**
 * The white top bar's height on the desktop — the sticky question row. Read from ZeroResults.tsx:29, which
 * subtracts exactly this from the window to centre its block: `md:min-h-[calc(100vh-56px)]`.
 */
export const PICK_BAR_PX = 56;

/**
 * Everything between the white bar's bottom edge and the cards' top edge, on the desktop, from SearchScreen's
 * crowned branch:
 *   32  the container's top padding — `md:pt-8`
 *   21  the count line "נבחרו מתוך X רכבים" — `md:text-[16px]` at line-height `normal`, which for Assistant
 *       is (ascent 1021 + |descent| 287 + lineGap 0) / 1000 = 1.308 → 16 × 1.308 = 20.93
 *   20  the results stack's gap between the count line and the cards — `gap-5`
 */
export const PICK_ABOVE_CARDS_PX = 73;

/**
 * The gap above the list heading plus the heading's own line box, on the desktop:
 *   24  `gap-5` (20) between <PickCards> and <ResultsList> in SearchScreen, plus ResultsList's own
 *       `marginTop: 4`
 *   26  the heading — `fontSize: 20` at line-height `normal` in ResultsList.tsx → 20 × 1.308 = 26.16
 */
export const PICK_HEADING_BLOCK_PX = 50;

/** findCar-now.md — the heading's bottom edge sits this far above the window's bottom edge. */
export const PICK_LANDING_PX = 12;

/** findCar-now.md — upright while its photo gets at least this share of the card's inner width, else compact. */
export const PICK_UPRIGHT_SHARE = 0.8;

/** The photo box is always 4:3, in both forms and on the phone (`aspect-[4/3]`). */
export const PICK_PHOTO_RATIO = 4 / 3;

/**
 * The compact photo's height floor — what the "~540" window gets (findCar-now.md: "the compact form at its
 * floor, the heading after a small scroll"). Claude's estimate, 27/09 (decision 23); to calibrate by eye.
 */
export const PICK_PHOTO_FLOOR_H_PX = 96;

/** The compact form's text column never goes under this (findCar-plan.md, "מידות — כרטיס ההמלצה"). */
export const PICK_TEXT_COLUMN_MIN_PX = 130;

/** The compact form's photo↔text column gap. MUST EQUAL `pick-compact:gap-x-[12px]` (PickCards.tsx). */
export const PICK_COMPACT_GAP_PX = 12;

/** The upright card's side padding. MUST EQUAL `md:px-5` on the card's inner container (PickCards.tsx). */
export const PICK_PAD_UPRIGHT_SIDE_PX = 20;

/** The compact card's side padding. MUST EQUAL `pick-compact:p-4` on the same container (PickCards.tsx). */
export const PICK_PAD_COMPACT_SIDE_PX = 16;

// ---------------------------------------------------------------------------
// §3.1 — THE CHROME: a card's height WITHOUT its photo box, per form
// ---------------------------------------------------------------------------
//
// Every addend is summed from the classes §4.2 writes, with Assistant's `normal` line height taken as 1.308
// (ascent 1021 + |descent| 287, unitsPerEm 1000) wherever no `leading-*` is set. The row gap of the card's
// grid is 10 in both forms (`md:gap-y-[10px]`).
//
//   addend                      class (PickCards.tsx)                       upright   compact
//   ------------------------------------------------------------------------------------------
//   top + bottom border         `border: 1px solid CARD_BORDER`                   2         2
//   the colour strip            `h-1.5`                                           6         6
//   padding top + bottom        `md:py-4` / `pick-compact:p-4`                    32        32
//   the label's text            `md:text-[21px]` / `pick-compact:text-[20px]`
//                               at `leading-[1.2]`                                25        24
//   the bar and its gap         `md:gap-[5px]` + `height: 3`                       8         8
//   the title                   `md:text-[20px]` / `pick-compact:text-[18px]`
//                               at `leading-[1.2]`                                24         — (beside the photo)
//   the price                   `md:text-[32px]` / `pick-compact:text-[26px]`
//                               at `leading-[1.1]`                                35         — (beside the photo)
//   the rubric strip            `border-t`+`border-b` (2) · `md:py-2` (16) ·
//                               value `md:text-[16px]`/`[15px]` · `gap-0.5` (2) ·
//                               label `md:text-[12px]`/`[11px]`                   57        54
//   the button                  `md:h-10` (both desktop forms)                    40        40
//   the grid's row gaps         `md:gap-y-[10px]` × 5 (upright: labels · photo ·
//                               title · price · rubrics · bottom) / × 3
//                               (compact: labels · photo+text · rubrics ·
//                               bottom)                                           50        30
//   ------------------------------------------------------------------------------------------
//   TOTAL                                                                        279       196
//
// In the COMPACT form the title and the price sit BESIDE the photo, in the two rows the photo spans, so they
// are not addends there: the photo's own height is what those two rows come to.

/** The base chrome of the upright form — see the table above. */
export const PICK_CHROME_UPRIGHT_PX = 279;

/** The base chrome of the compact form — see the table above. */
export const PICK_CHROME_COMPACT_PX = 196;

/**
 * The runner-up strip plus the gap above it, per form:
 *   upright  2 (border) + 16 (`py-2`) + 18 (`md:text-[13px]` at `leading-[1.4]`) + 10 (`gap-2.5`)   = 46
 *   compact  2          + 16          + 17 (`pick-compact:text-[12px]` at `leading-[1.4]`) + 10     = 45
 */
export const PICK_STRIP_EXTRA_PX = { upright: 46, compact: 45 } as const;

/**
 * A second row of labels (a triple winner) plus the labels' own row gap `gap-y-1.5` (6):
 *   upright  25 + 8 + 6 = 39      compact  24 + 8 + 6 = 38
 */
export const PICK_LABEL_WRAP_EXTRA_PX = { upright: 39, compact: 38 } as const;

/**
 * One sentence line plus the grid's row gap (10). The generator's card sentence is ONE line (findCar-now.md):
 *   upright  23 (`md:text-[15px]` at `leading-[1.5]`) + 10 = 33
 *   compact  21 (`pick-compact:text-[14px]` at `leading-[1.5]`) + 10 = 31
 */
export const PICK_SENTENCE_EXTRA_PX = { upright: 33, compact: 31 } as const;

// ---------------------------------------------------------------------------
// §3.1 — the card's inner width, per form
// ---------------------------------------------------------------------------

export type PickForm = "phone" | "upright" | "compact";
export type PickFit = "edge" | "ceiling" | "floor" | "none";

/**
 * The width the card's content is drawn into, at a given window width: the results container less its two
 * paddings, split three ways across the row's two gaps, less the card's two borders and the form's two side
 * paddings. A WHOLE pixel, because every other number here is one and because the compact form's ceiling is
 * measured against it.
 */
export function innerCardWidthPx(innerWidth: number, form: "upright" | "compact"): number {
  const content = Math.min(innerWidth, RESULTS_CONTAINER_PX) - 2 * RESULTS_CONTAINER_PADDING_PX;
  const card = (content - 2 * PICK_ROW_GAP_PX) / 3;
  const side = form === "upright" ? PICK_PAD_UPRIGHT_SIDE_PX : PICK_PAD_COMPACT_SIDE_PX;
  return Math.round(card - 2 * PICK_CARD_BORDER_PX - 2 * side);
}

// ---------------------------------------------------------------------------
// §3.1 — the chrome of ONE answer
// ---------------------------------------------------------------------------

/** Exactly what pickChromePx() reads off an AskResult — nothing more, so this module imports no view type. */
export type PickChromeInput = {
  readonly cards: readonly { readonly categories: readonly string[]; readonly sentence: string | null }[];
  readonly runner_up: unknown;
};

export type PickChrome = { upright: number; compact: number };

/**
 * The base chrome plus the three increments this answer earns. The runner-up condition is the one `PickCard`
 * itself uses (§3.8): a recorded runner-up AND a card that includes `cheapest`.
 */
export function pickChromePx(answer: PickChromeInput): PickChrome {
  let upright = PICK_CHROME_UPRIGHT_PX;
  let compact = PICK_CHROME_COMPACT_PX;

  if (answer.runner_up !== null && answer.cards.some((c) => c.categories.includes("cheapest"))) {
    upright += PICK_STRIP_EXTRA_PX.upright;
    compact += PICK_STRIP_EXTRA_PX.compact;
  }
  if (answer.cards.some((c) => c.categories.length >= 3)) {
    upright += PICK_LABEL_WRAP_EXTRA_PX.upright;
    compact += PICK_LABEL_WRAP_EXTRA_PX.compact;
  }
  if (answer.cards.some((c) => c.sentence !== null)) {
    upright += PICK_SENTENCE_EXTRA_PX.upright;
    compact += PICK_SENTENCE_EXTRA_PX.compact;
  }
  return { upright, compact };
}

// ---------------------------------------------------------------------------
// §3.1 — the computation
// ---------------------------------------------------------------------------

export type FirstScreenResult = {
  form: PickForm;
  photoW: number;
  photoH: number;
  fit: PickFit;
};

/**
 * The form and the photo box for one window.
 *
 *   1. below the site's boundary there is no rule at all — the phone's own base classes draw the cards
 *   2. the budget: the height the tallest card may take so that the list heading still lands
 *   3. upright while the photo it allows gets at least PICK_UPRIGHT_SHARE of the card's inner width; on a
 *      large screen the photo hits the inner width and stops there (`ceiling`), which is where the start of
 *      the list shows under the heading
 *   4. else compact: the photo takes what the budget leaves, never under its floor, and never so wide that
 *      the text column loses its PICK_TEXT_COLUMN_MIN_PX — the column's minimum wins over the photo's floor
 *      (decision 23), which is the narrow-and-low corner
 *   5. the box is ALWAYS 4:3: the width is rounded first and the height follows from it
 */
export function firstScreen({
  innerWidth,
  innerHeight,
  chrome,
}: {
  innerWidth: number;
  innerHeight: number;
  chrome: PickChrome;
}): FirstScreenResult {
  if (innerWidth < DESKTOP_MIN_WIDTH_PX) return { form: "phone", photoW: 0, photoH: 0, fit: "none" };

  const budget = innerHeight - PICK_BAR_PX - PICK_ABOVE_CARDS_PX - PICK_HEADING_BLOCK_PX - PICK_LANDING_PX;

  const uprightInner = innerCardWidthPx(innerWidth, "upright");
  const uprightW = (budget - chrome.upright) * PICK_PHOTO_RATIO;
  if (uprightW >= PICK_UPRIGHT_SHARE * uprightInner) {
    const capped = uprightW > uprightInner;
    const photoW = Math.round(Math.min(uprightW, uprightInner));
    return { form: "upright", photoW, photoH: Math.round(photoW / PICK_PHOTO_RATIO), fit: capped ? "ceiling" : "edge" };
  }

  const compactInner = innerCardWidthPx(innerWidth, "compact");
  const free = budget - chrome.compact;
  const floored = free < PICK_PHOTO_FLOOR_H_PX;
  const h = floored ? PICK_PHOTO_FLOOR_H_PX : free;
  const ceilW = compactInner - PICK_TEXT_COLUMN_MIN_PX - PICK_COMPACT_GAP_PX;
  const want = h * PICK_PHOTO_RATIO;
  const capped = want > ceilW;
  const photoW = Math.round(Math.min(want, ceilW));
  return {
    form: "compact",
    photoW,
    photoH: Math.round(photoW / PICK_PHOTO_RATIO),
    fit: capped ? "ceiling" : floored ? "floor" : "edge",
  };
}

// ---------------------------------------------------------------------------
// §3.1 — THE ONE WRITER
// ---------------------------------------------------------------------------

/** What applyFirstScreen() needs of <html>: the two things it writes, and nothing else. */
export type FirstScreenRoot = {
  dataset: { pickForm?: string };
  style: { setProperty(property: string, value: string): void; removeProperty(property: string): string };
};

/** The two custom properties the writer sets on <html>; the form goes on the `data-pick-form` attribute. */
export const PICK_PHOTO_W_VAR = "--pick-photo-w";
export const PICK_PHOTO_H_VAR = "--pick-photo-h";

/**
 * The ONE place the result reaches the document: the inline script's twin (§4.4) and the hook (§5) both write
 * through this, so a server-rendered first paint and every later resize put down exactly the same three
 * things. Pure over its arguments — `root` is any object with a `dataset` and a `style`.
 */
export function applyFirstScreen(result: FirstScreenResult, root: FirstScreenRoot): void {
  root.dataset.pickForm = result.form;
  if (result.form === "phone") {
    root.style.removeProperty(PICK_PHOTO_W_VAR);
    root.style.removeProperty(PICK_PHOTO_H_VAR);
    return;
  }
  root.style.setProperty(PICK_PHOTO_W_VAR, `${result.photoW}px`);
  root.style.setProperty(PICK_PHOTO_H_VAR, `${result.photoH}px`);
}

// ---------------------------------------------------------------------------
// §3.2 — the same computation, as ONE self-contained script
// ---------------------------------------------------------------------------

/**
 * Every constant the script needs, inlined into the string at module load. They are never retyped: the object
 * below is built from the exports above and JSON.stringify'd, so a number can only ever move in one place.
 */
const SCRIPT_CONSTANTS = {
  min: DESKTOP_MIN_WIDTH_PX,
  container: RESULTS_CONTAINER_PX,
  pad: RESULTS_CONTAINER_PADDING_PX,
  rowGap: PICK_ROW_GAP_PX,
  border: PICK_CARD_BORDER_PX,
  padUpright: PICK_PAD_UPRIGHT_SIDE_PX,
  padCompact: PICK_PAD_COMPACT_SIDE_PX,
  bar: PICK_BAR_PX,
  above: PICK_ABOVE_CARDS_PX,
  heading: PICK_HEADING_BLOCK_PX,
  landing: PICK_LANDING_PX,
  share: PICK_UPRIGHT_SHARE,
  ratio: PICK_PHOTO_RATIO,
  floor: PICK_PHOTO_FLOOR_H_PX,
  textMin: PICK_TEXT_COLUMN_MIN_PX,
  gap: PICK_COMPACT_GAP_PX,
  wVar: PICK_PHOTO_W_VAR,
  hVar: PICK_PHOTO_H_VAR,
};

/**
 * §3.2 / §4.4 — WHAT MAKES THE SERVER-RENDERED FIRST PAINT RIGHT. An immediately invoked function, no
 * imports, no global left behind: the browser runs it while it is still parsing the HTML, before the cards
 * that follow it are painted, so the first paint is already the right form at the right size and hydration
 * changes nothing. It reads the window's two numbers and the chrome pair off the element it sits in, and
 * writes exactly what applyFirstScreen() writes onto <html>.
 *
 * It does NOT subscribe to resize — that is the hook's job (§5), and the hook is also what does this work on a
 * client render, where a script inserted by the DOM never runs.
 *
 * src/lib/display/first-screen.test.ts evaluates this string against a fake window and document over a grid of
 * widths, heights and chromes and asserts it agrees with firstScreen() + applyFirstScreen() everywhere. THAT
 * TEST IS WHAT KEEPS THE TWO ONE COMPUTATION.
 */
export const FIRST_SCREEN_SCRIPT: string = [
  "(function(){",
  `var C=${JSON.stringify(SCRIPT_CONSTANTS)};`,
  "var s=document.currentScript;if(!s)return;",
  "var d=s.parentElement.dataset;",
  "var cu=Number(d.pickChromeUpright),cc=Number(d.pickChromeCompact);",
  "var W=window.innerWidth,H=window.innerHeight;",
  "var inner=function(f){",
  "var content=Math.min(W,C.container)-2*C.pad;",
  "var card=(content-2*C.rowGap)/3;",
  "return Math.round(card-2*C.border-2*(f==='upright'?C.padUpright:C.padCompact));};",
  "var form,pw=0,ph=0;",
  "if(W<C.min){form='phone';}else{",
  "var budget=H-C.bar-C.above-C.heading-C.landing;",
  "var ui=inner('upright');var uw=(budget-cu)*C.ratio;",
  "if(uw>=C.share*ui){form='upright';pw=Math.round(Math.min(uw,ui));}",
  "else{form='compact';",
  "var ci=inner('compact');var free=budget-cc;",
  "var h=free<C.floor?C.floor:free;",
  "var cap=ci-C.textMin-C.gap;",
  "pw=Math.round(Math.min(h*C.ratio,cap));}",
  "ph=Math.round(pw/C.ratio);}",
  "var r=document.documentElement;",
  "r.dataset.pickForm=form;",
  "if(form==='phone'){r.style.removeProperty(C.wVar);r.style.removeProperty(C.hVar);}",
  "else{r.style.setProperty(C.wVar,pw+'px');r.style.setProperty(C.hVar,ph+'px');}",
  "})();",
].join("");
