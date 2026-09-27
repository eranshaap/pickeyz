"use client";

// The three big cards of the recommendations screen (BRIEF Run 1 §3, §5; Days 24–25 Run 3 §4, §5) — the
// canonical board «מסך ההמלצות — שלושת הכרטיסים», its two siblings for a double and a triple winner, and the
// recommendations frame of the phone board.
//
// A RENDERER ONLY. Every value on a card arrives decided: the grouping, the labels, the colour, the runner-up
// strip's words and its tint are src/lib/display/cards.ts, and the values themselves are the CAR PAGE's — the
// same model string CarTitle receives there, the same "X% ממחיר החדש", the same km, the same big hand value,
// the same current-ownership word (§2.1). Nothing here decides what a value means.
//
// WHAT A CARD IS, TOP TO BOTTOM (§3.1–§3.9): the 6px strip in its colour · the label(s), each in its OWN
// colour with a 40×3 bar · the photo · the title without a comma and the price with the new-price share, the two
// as ONE block (Run 3b §3.1, decision 25) · three rubrics with fixed grey labels · the sentence, when there is
// one · the runner-up strip, on the cheapest card only · the button, pinned to the bottom of every card so the
// three land on one line.
//
// RUN 3 §4 — ONE DOM, TWO DESKTOP LAYOUTS. Those components, in that order, are the card on every screen; what
// changes above the site's boundary is only where the photo sits and how big it is:
//   upright   (the plain `md:` state)  the photo above the text, at up to the card's inner width
//   compact   (the `pick-compact:` variant of globals.css §4.1)  the photo beside the title and the price, at
//             the inline start, with the rubrics and everything below it across both columns
// Below the boundary the base classes draw the phone as they always did: upright, the photo at the card's
// width, the cards stacked. Nothing is sized in vw/vh and no text grows with the window (findCar-now.md,
// "מתחת לכרטיסים וקו הקיפול": text at a fixed size on every screen).
//
// WHICH FORM AND WHAT SIZE is src/lib/display/first-screen.ts's one computation, written onto <html> as one
// attribute and two custom properties by ONE writer, from two places:
//   the inline script (§4.4)  runs while the browser is still parsing this wrapper, so the SERVER-RENDERED
//                             first paint is already right and hydration moves nothing
//   the hook (§5)             the same write on mount — which on a server-rendered page equals the script's —
//                             and again on every resize, at most once per animation frame. A client render
//                             (after "עדכן", a navigation) has no running script, so the hook is the only
//                             writer there, and it writes before paint.
//
// WHAT IS NOT ON A CARD (§3.11), all of it deleted and none of it hidden: the category chips, the green
// "נתונים מאומתים מול משרד התחבורה" line, "N מודעות לרכב הזה", the seller kind, the version / sub-model line,
// the dashed placeholders of a category nobody won, and any link under the cards. No Ministry small lines and
// no contradiction marks ever reach a pick card — that detail lives on the car page alone (findCar-now.md).
//
// CLICKS (§3.10, findCar-now.md "לחיצות במסך התוצאות"): exactly two things navigate — the button, to the
// pick's page, and the runner-up strip, to the runner-up's. The body of the card is not a link, has no
// onClick and keeps the default cursor. Run 6b's whole-card anchor is gone.
//
// Run 7 §7.1 — a click is acknowledged ON THE ELEMENT CLICKED, immediately: from the click until the
// navigation commits it dims to ~60% and shows a small spinner. That is the framework's own link-status
// mechanism (`useLinkStatus`, from "next/link"), which only works INSIDE a <Link> subtree — hence LinkPending,
// a child of the anchor rather than a wrapper around it, and hence `relative` on both anchors.

import { useLayoutEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { AskResult } from "@/app/actions/search";
import { CATEGORY_ORDER, LABEL_TEXT, cardColor, ownershipWord, runnerUpParts, runnerUpTint } from "@/lib/display/cards";
import {
  applyFirstScreen,
  firstScreen,
  FIRST_SCREEN_SCRIPT,
  pickChromePx,
  PICK_PHOTO_H_VAR,
  PICK_PHOTO_W_VAR,
  type PickChrome,
} from "@/lib/display/first-screen";
import { num, shekel } from "@/lib/display/texts";
import { RUBRIC_HEADINGS } from "@/lib/display/rubrics";
import CarTitle from "@/components/car/CarTitle";
import Photo from "@/components/car/Photo";

const TO_CAR_PAGE = "לעמוד הרכב";

const CARD_BG = "#ffffff";
const CARD_BORDER = "#d8d3cb";
const GREY = "#665f58";
const DARK = "#221f1c";
// The rubric strip's two hairlines and its cell dividers are #e6e2db. It is written as a literal Tailwind
// class (`border-[#e6e2db]`) at every use below rather than as a constant, for the reason the car page states:
// a class name assembled at runtime is a class Tailwind never sees and never emits.

/** §3.6 — the three fixed grey labels. The km one is the car page's own rubric header: one convention. */
const RUBRIC_LABEL = { km: RUBRIC_HEADINGS.km, hand: "מספר בעלויות", ownership: "סוג בעלות נוכחית" } as const;

/** The page's "—": what a rubric prints when the value behind it is not there (src/lib/display/rubrics.ts). */
const EMPTY_VALUE = "—";

/**
 * §5.2 — the mark the self-check finds the photo box by. It is NOT a utility and Tailwind emits nothing for
 * it: `Photo` takes a className and no other prop, and the measurement needs to tell the photo's box from the
 * rest of the card without a second element around it.
 */
const PHOTO_BOX_MARK = "pick-photo-box";

/**
 * §4.2 — THE PHOTO'S BOX, in one string.
 *   phone     `aspect-[4/3] w-full` — the card's width, as it has always been.
 *   desktop   the two custom properties the one writer sets. With BOTH width and height given the aspect
 *             ratio stands aside and the box is exactly what first-screen.ts computed; with NEITHER set — the
 *             no-script case, before any writer has run — the fallbacks are `100%` and `auto`, which is the
 *             full inner width at 4:3, the same box the phone gets.
 *   upright   centred in its column when it is narrower than it (decision 23).
 *   compact   the first column of ONE row — Run 3b §3.1: the title and the price are now one block beside it in
 *             that same row, so the photo no longer spans two rows that grow apart.
 * Run 1's `md:aspect-auto` and its fixed desktop band are both gone: that band is what this run replaces.
 */
const PHOTO_BOX =
  `${PHOTO_BOX_MARK} block aspect-[4/3] w-full rounded-lg ` +
  "md:h-[var(--pick-photo-h,auto)] md:w-[var(--pick-photo-w,100%)] md:max-w-full md:justify-self-center " +
  "pick-compact:col-start-1";

/**
 * §4.2 / Run 3b §3.1 — THE CARD'S GRID, as written. The children stay in today's DOM order — labels · photo ·
 * [title · price] · rubrics · sentence (when present) · bottom, the title and the price being ONE block element
 * in every form (TITLE_PRICE_BLOCK below) — and the two forms place them differently:
 *
 *   upright   one column; the rows in that order; padding 16 top and bottom and 20 at the sides; row gap 10.
 *   compact   two columns, `var(--pick-photo-w) minmax(130px, 1fr)` — the photo column at the inline START,
 *             which in RTL is the right edge, like the "מקום N" card (decision 23) — with a column gap of 12
 *             (PICK_COMPACT_GAP_PX) and padding 16 on every side. The labels, the rubrics, the sentence and
 *             the bottom go across both columns; the photo takes column 1 of ONE row and the block column 2 of
 *             that same row, centred on it (decision 25).
 *
 * The LAST row is `1fr` in both, which is what pins the button to the bottom of the card whatever the card
 * above it holds, so the three buttons land on one line across a row of equal-height cards. The number of
 * rows is the only thing the sentence changes, so both templates come in two literals — Tailwind reads class
 * names as literals and can never be handed a computed one.
 */
const GRID_BASE = "flex grow flex-col gap-3 p-4 md:grid md:grid-cols-1 md:gap-x-0 md:gap-y-[10px] md:px-5 md:py-4 pick-compact:grid-cols-[var(--pick-photo-w,1fr)_minmax(130px,1fr)] pick-compact:gap-x-[12px] pick-compact:p-4";
/** labels · photo · the title-and-price block · rubrics · bottom */
const GRID_UPRIGHT_ROWS = "md:grid-rows-[auto_auto_auto_auto_1fr]";
/** … with the sentence between the rubrics and the bottom */
const GRID_UPRIGHT_ROWS_SENTENCE = "md:grid-rows-[auto_auto_auto_auto_auto_1fr]";
/** labels · (photo beside the title-and-price block, one row) · rubrics · bottom */
const GRID_COMPACT_ROWS = "pick-compact:grid-rows-[auto_auto_auto_1fr]";
/** … with the sentence between the rubrics and the bottom */
const GRID_COMPACT_ROWS_SENTENCE = "pick-compact:grid-rows-[auto_auto_auto_auto_1fr]";

/** §4.2 — everything that is not the photo and not the title-and-price block goes across both compact columns. */
const FULL_ROW = "pick-compact:col-span-2";

/**
 * Run 3b §3.1 (decision 25) — THE TITLE AND THE PRICE AS ONE BLOCK, the same DOM in every form.
 *
 * A flex column carrying the distance the grid's row gap used to give the two lines: 12 on the phone (`gap-3`,
 * the base grid's own gap, so the phone renders exactly as it did) and 10 on both desktop forms (`md:gap-[10px]`,
 * the grid's `md:gap-y-[10px]`). The grid therefore has one row fewer than it had, and nothing moves: in the
 * upright form the 10 px simply crossed from a grid gap into this element's gap (§3.2 — the chrome sum stays).
 *
 * In the COMPACT form it is column 2 of the photo's one row, `self-center`: the row is `auto`, so its height is
 * the taller of the two, and the block sits in the middle of it with the same air above and below. That is the
 * whole of decision 25 — before it, the photo spanned two `auto` rows which grew apart, pinning the title to the
 * photo's top edge and the price near its middle.
 */
const TITLE_PRICE_BLOCK = "flex flex-col gap-3 md:gap-[10px] pick-compact:self-center";

type Card = AskResult["cards"][number];
type RunnerUp = NonNullable<AskResult["runner_up"]>;

/**
 * Run 7 §7.1 — the pending state of the <Link> this sits inside, painted on that link and nowhere else.
 * It dims its own anchor (via a full-cover overlay in the page background) and puts a spinner in the corner.
 * Nothing global: no top bar, no page-wide veil.
 *
 * It is exported from here, rather than from a file of its own, because Run 7's ALLOWED list added exactly
 * one new file and this is the component that needed it first. The car page's back link imports it from here.
 */
export function LinkPending({ compact = false }: { compact?: boolean }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      {/* ~60% opacity, done as a cover rather than by changing the anchor's own opacity: the anchor is a
          server-rendered tree this client component cannot reach up into. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] bg-[#eeece8] opacity-40" />
      {/* The corner of a card; for a text link, just outside its inline end, in the gap that is already
          there — a spinner laid over two words would hide them rather than dim them. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute z-20 ${compact ? "top-1/2 -end-4 -translate-y-1/2" : "end-2 top-2"}`}
      >
        <svg viewBox="0 0 16 16" className={`animate-spin motion-reduce:animate-none text-[#665f58] ${compact ? "h-3 w-3" : "h-4 w-4"}`} fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
          <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    </>
  );
}

/**
 * §3.2 / §5 — one label per category the card won, in CATEGORY_ORDER, each in ITS OWN colour (never the
 * bronze — the bronze is the strip's and the button's) with a 40×3 bar under it. A triple winner's three
 * labels wrap to a second row, as drawn.
 *
 * §4.2 — 21 upright, 20 compact, and the bar 5 below the label text on both desktop forms (today 6, which the
 * phone keeps).
 */
function Labels({ card }: { card: Card }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1.5 ${FULL_ROW}`}>
      {CATEGORY_ORDER.filter((c) => card.categories.includes(c)).map((c) => (
        <div key={c} className="flex flex-col gap-1.5 md:gap-[5px]">
          <span className="text-[20px] font-extrabold leading-[1.2] md:text-[21px] pick-compact:text-[20px]" style={{ color: cardColor([c]) }}>
            {LABEL_TEXT[c]}
          </span>
          <span aria-hidden className="block rounded-sm" style={{ width: 40, height: 3, background: cardColor([c]) }} />
        </div>
      ))}
    </div>
  );
}

/** §3.6 / §5 — one rubric cell: the value, then the fixed grey label. No small line, ever. */
function RubricCell({ value, label, className }: { value: string; label: string; className: string }) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {/* §4.2 — the value 16 upright, 15 compact; the label 12 and 11. */}
      <span className="text-[16px] font-semibold tabular-nums pick-compact:text-[15px]" style={{ color: DARK }}>
        {value}
      </span>
      <span className="text-[12px] pick-compact:text-[11px]" style={{ color: GREY }}>
        {label}
      </span>
    </div>
  );
}

/**
 * §3.6 — the three rubrics, in a grid of three equal columns between two hairlines. The km value carries the
 * thousands separators and no unit (the unit is the cell's label); the hand is the car page's big hand value
 * under its own word; the ownership is the word for the code the page's legend marks `הבעלות הנוכחית`.
 *
 * §4.2 — the strip's vertical padding is 8 on both desktop forms (today 10, which the phone keeps).
 */
function Rubrics({ card }: { card: Card }) {
  // A LITERAL, never assembled: a class name built at runtime is a class Tailwind never sees and never emits.
  const inner = "border-s border-[#e6e2db] px-2.5 md:px-3";
  return (
    <div
      className={`grid border-t border-b border-[#e6e2db] py-2.5 md:py-2 ${FULL_ROW}`}
      style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
    >
      <RubricCell value={card.km === null ? EMPTY_VALUE : num(card.km)} label={RUBRIC_LABEL.km} className="px-1" />
      <RubricCell value={card.hand === null ? EMPTY_VALUE : `יד ${num(card.hand)}`} label={RUBRIC_LABEL.hand} className={inner} />
      <RubricCell
        value={card.ownership_type === null ? EMPTY_VALUE : ownershipWord(card.ownership_type)}
        label={RUBRIC_LABEL.ownership}
        className={inner}
      />
    </div>
  );
}

/**
 * §3.8 — the runner-up strip, under the rubrics, on the card whose categories include `cheapest` and only when
 * a runner-up was recorded. The tint is the card's own (indigo on a plain "הכי חסכוני" card, bronze on a
 * multi-winner card that includes it) and the amount and the chevron carry the card's colour.
 *
 * §4.2 — its text is 13 upright and 12 compact.
 */
function RunnerUpStrip({ card, runnerUp, questionPublicId }: { card: Card; runnerUp: RunnerUp; questionPublicId: string }) {
  const tint = runnerUpTint(card.color);
  const { lead, rest } = runnerUpParts({ amount: runnerUp.amount, model: runnerUp.model, year: runnerUp.year, fact: runnerUp.fact });
  return (
    <Link
      href={`/listing/${runnerUp.public_id}?s=${questionPublicId}`}
      className="relative flex items-center justify-between gap-2 rounded-lg px-3 py-2 no-underline"
      style={{ background: tint.bg, border: `1px solid ${tint.border}` }}
    >
      <LinkPending />
      <span className="text-[13px] leading-[1.4] pick-compact:text-[12px]" style={{ color: DARK }}>
        <span className="font-bold" style={{ color: card.color }}>
          {lead}
        </span>
        {rest}
      </span>
      {/* RTL: the chevron points to the inline end, which is the left. */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={card.color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </Link>
  );
}

/** §3.1–§3.9 / §4.2 — one card. The phone values are the base classes; `md:` is upright and `pick-compact:` compact. */
function PickCard({ card, runnerUp, questionPublicId }: { card: Card; runnerUp: RunnerUp | null; questionPublicId: string }) {
  // §3.8 — the strip belongs to the cheapest pick's card, whatever else that card won.
  const strip = runnerUp !== null && card.categories.includes("cheapest") ? runnerUp : null;
  // §4.2 — the sentence is the only thing that changes how many rows the grid has.
  const rows = card.sentence !== null ? `${GRID_UPRIGHT_ROWS_SENTENCE} ${GRID_COMPACT_ROWS_SENTENCE}` : `${GRID_UPRIGHT_ROWS} ${GRID_COMPACT_ROWS}`;
  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl md:w-[calc((100%-48px)/3)] md:shrink-0 md:grow-0"
      style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
    >
      {/* §3.1 — the top strip, flush with the card's edge; the ONE difference of a multi-winner card is that
          this and the button are bronze, not that the strip is there at all (findCar-now.md). */}
      <div aria-hidden className="h-1.5 shrink-0" style={{ background: card.color }} />

      <div className={`${GRID_BASE} ${rows}`}>
        <Labels card={card} />

        {/* §3.3 / §4.2 — the photo, in the box first-screen.ts sized. No photo → the car page's own
            placeholder box, in the same frame, without the board's caption (§3.3). `Photo` draws the image
            `cover` and centred, so a 4:3 listing photo comes whole and a vertical one shows its middle strip
            (findCar-now.md). */}
        <Photo src={card.image} className={PHOTO_BOX} />

        {/* Run 3b §3.1 — the title and the price as ONE block: one grid row, centred on the photo's height in
            the compact form. */}
        <div className={TITLE_PRICE_BLOCK}>
          {/* §3.4 — the title: no comma, the 0.4em spacer comes from CarTitle itself. §4.2 — 20 / 18. */}
          <div className="text-[19px] font-bold leading-[1.2] md:text-[20px] pick-compact:text-[18px]" style={{ color: DARK }}>
            <CarTitle model={card.model} year={card.year} />
          </div>

          {/* §3.5 — the price, and the new-price share beside it; with no new-price row there is NO element.
              §4.2 — the price 32 / 26, its share line 13 in both. */}
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <span
              className="text-[30px] font-extrabold leading-[1.1] tabular-nums md:text-[32px] pick-compact:text-[26px]"
              style={{ color: DARK }}
            >
              {shekel(card.price)}
            </span>
            {card.new_price_pct !== null && (
              <span className="text-[13px]" style={{ color: GREY }}>
                {card.new_price_pct}
              </span>
            )}
          </div>
        </div>

        <Rubrics card={card} />

        {/* §3.7 — the justification generator's line (Days 22–23). `null` → no element and no empty line, the
            way an empty "למה" section draws nothing on the car page. §4.2 — 15 / 14. */}
        {card.sentence !== null && (
          <p className={`m-0 text-[15px] leading-[1.5] pick-compact:text-[14px] ${FULL_ROW}`} style={{ color: DARK }}>
            {card.sentence}
          </p>
        )}

        {/* §3.9 / §4.2 — the button at the BOTTOM of the card, whatever the card above it holds: on the phone
            `mt-auto` in the flex column, on the desktop the same `mt-auto` inside the grid's last `1fr` row.
            §4.2 — the button is 40 tall on both desktop forms (today `md:h-11`); the phone keeps its 46. */}
        <div className={`mt-auto flex flex-col gap-2.5 ${FULL_ROW}`}>
          {strip !== null && <RunnerUpStrip card={card} runnerUp={strip} questionPublicId={questionPublicId} />}
          <Link
            href={`/listing/${card.public_id}?s=${questionPublicId}`}
            className="relative flex h-[46px] items-center justify-center rounded-lg text-[15px] font-bold text-white no-underline md:h-10"
            style={{ background: card.color }}
          >
            {TO_CAR_PAGE}
            <LinkPending />
          </Link>
        </div>
      </div>
    </article>
  );
}

/**
 * §5.2 — THE CALIBRATION LINE, always on. After the first layout it measures the real chrome — the tallest
 * card's rendered height less its photo box's — and says ONE thing if it is more than 2 px from the constant
 * the form was computed with. NOTHING IS CORRECTED FROM THE MEASUREMENT: the constants of first-screen.ts are
 * the truth and the eye check on the live site is what moves them. This line is what Eran pastes back.
 */
const SELF_CHECK_TOLERANCE_PX = 2;

function selfCheck(wrap: HTMLDivElement | null, chrome: PickChrome, form: string | undefined): void {
  if (wrap === null || (form !== "upright" && form !== "compact")) return;
  let tallest: Element | null = null;
  let tallestHeight = 0;
  for (const article of wrap.querySelectorAll("article")) {
    const height = article.getBoundingClientRect().height;
    if (height > tallestHeight) {
      tallestHeight = height;
      tallest = article;
    }
  }
  if (tallest === null) return;
  const photo = tallest.querySelector(`.${PHOTO_BOX_MARK}`);
  const measured = Math.round(tallestHeight - (photo === null ? 0 : photo.getBoundingClientRect().height));
  const constant = form === "upright" ? chrome.upright : chrome.compact;
  if (Math.abs(measured - constant) <= SELF_CHECK_TOLERANCE_PX) return;
  console.warn(
    `first-screen: ${form} chrome is ${constant}px in the code and ${measured}px on the screen ` +
      `(${measured - constant > 0 ? "+" : ""}${measured - constant}). Nothing was corrected — move the constant by eye.`,
  );
}

/**
 * §5.1 — THE CLIENT'S WRITER. A layout effect, so that on a client render (after "עדכן", a navigation) the
 * form and the box are on <html> BEFORE the browser paints — a script inserted by the DOM never runs, so the
 * script of §4.4 does nothing there. On a server-rendered page the script has already written, and this
 * first write puts down exactly the same three things: nothing visible changes.
 *
 * It then follows the window: one listener, and at most one re-run per animation frame, with one frame
 * pending at a time. On unmount it unsubscribes and takes the attribute and the two properties off again —
 * the car page and the two uncrowned screens never carry them.
 */
function usePickFirstScreen(chrome: PickChrome, wrap: React.RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const write = () => {
      frame = 0;
      applyFirstScreen(firstScreen({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, chrome }), root);
    };

    write();
    selfCheck(wrap.current, chrome, root.dataset.pickForm);

    const onResize = () => {
      if (frame === 0) frame = window.requestAnimationFrame(write);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      delete root.dataset.pickForm;
      root.style.removeProperty(PICK_PHOTO_W_VAR);
      root.style.removeProperty(PICK_PHOTO_H_VAR);
    };
  }, [chrome, wrap]);
}

export default function PickCards({ answer }: { answer: AskResult }) {
  // Run 2 §7.1 — the Day 15 line that stood here for an empty pool is GONE from this file: the zero-results
  // screen is its own component now (ZeroResults.tsx), the string lives once in src/lib/display/edge-screens.ts
  // (NO_CARS_AT_ALL), and SearchScreen decides by `answer.state` which screen to draw. This component is only
  // ever reached on a `crowned` search, so it has nothing to test for and no early return.

  // §5.1 — ONE chrome per answer, not one per resize event. It is what the script reads off the wrapper's two
  // data attributes and what the hook hands to firstScreen().
  const chrome = useMemo(() => pickChromePx(answer), [answer]);
  const wrap = useRef<HTMLDivElement>(null);
  usePickFirstScreen(chrome, wrap);

  // §3.0 — the row: centred, stretched to one height, 24px apart, and every card at the THREE-card width
  // whether there are three, two or one (the boards «זוכה כפול» and «זוכה משולש» — the cards keep their width
  // and the row centres them; they never widen to fill it). On the phone they stack full width, which
  // `items-stretch` gives them, and the centring is moot (§5).
  return (
    <div
      ref={wrap}
      className="flex flex-col items-stretch justify-center gap-6 md:flex-row"
      data-pick-chrome-upright={chrome.upright}
      data-pick-chrome-compact={chrome.compact}
    >
      {/* §4.4 — THE FIRST CHILD, and the reason the first paint of a server-rendered page is already right:
          the parser runs this script when it reaches it, before the cards after it are painted, and it reads
          its chrome off the two attributes on the element it sits in. A <script> is `display: none`, so it is
          not a flex item of this row in any visible sense. */}
      <script dangerouslySetInnerHTML={{ __html: FIRST_SCREEN_SCRIPT }} />
      {answer.cards.map((card) => (
        <PickCard key={card.public_id} card={card} runnerUp={answer.runner_up} questionPublicId={answer.public_id} />
      ))}
    </div>
  );
}
