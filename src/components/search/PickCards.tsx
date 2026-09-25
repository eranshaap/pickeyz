"use client";

// The three big cards of the recommendations screen (BRIEF Run 1 §3, §5) — the canonical board
// «מסך ההמלצות — שלושת הכרטיסים», its two siblings for a double and a triple winner, and the recommendations
// frame of the phone board.
//
// A RENDERER ONLY. Every value on a card arrives decided: the grouping, the labels, the colour, the runner-up
// strip's words and its tint are src/lib/display/cards.ts, and the values themselves are the CAR PAGE's — the
// same model string CarTitle receives there, the same "X% ממחיר החדש", the same km, the same big hand value,
// the same current-ownership word (§2.1). Nothing here decides what a value means.
//
// WHAT A CARD IS, TOP TO BOTTOM (§3.1–§3.9): the 6px strip in its colour · the label(s), each in its OWN
// colour with a 40×3 bar · the photo · the title without a comma · the price with the new-price share · three
// rubrics with fixed grey labels · the sentence, when there is one · the runner-up strip, on the cheapest card
// only · the button, pinned to the bottom of every card so the three land on one line.
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

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { AskResult } from "@/app/actions/search";
import { CATEGORY_ORDER, LABEL_TEXT, cardColor, ownershipWord, runnerUpParts, runnerUpTint } from "@/lib/display/cards";
import { num, shekel } from "@/lib/display/texts";
import { RUBRIC_HEADINGS } from "@/lib/display/rubrics";
import CarTitle from "@/components/car/CarTitle";
import Photo from "@/components/car/Photo";

const EMPTY_POOL = "אין רכבים שעונים על ההגבלות";
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
 */
function Labels({ card }: { card: Card }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {CATEGORY_ORDER.filter((c) => card.categories.includes(c)).map((c) => (
        <div key={c} className="flex flex-col gap-1.5">
          <span className="text-[20px] font-extrabold leading-[1.2] md:text-[21px]" style={{ color: cardColor([c]) }}>
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
      <span className="text-[16px] font-semibold tabular-nums" style={{ color: DARK }}>
        {value}
      </span>
      <span className="text-[12px]" style={{ color: GREY }}>
        {label}
      </span>
    </div>
  );
}

/**
 * §3.6 — the three rubrics, in a grid of three equal columns between two hairlines. The km value carries the
 * thousands separators and no unit (the unit is the cell's label); the hand is the car page's big hand value
 * under its own word; the ownership is the word for the code the page's legend marks `הבעלות הנוכחית`.
 */
function Rubrics({ card }: { card: Card }) {
  // A LITERAL, never assembled: a class name built at runtime is a class Tailwind never sees and never emits.
  const inner = "border-s border-[#e6e2db] px-2.5 md:px-3";
  return (
    <div
      className="grid border-t border-b border-[#e6e2db] py-2.5"
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
      <span className="text-[13px] leading-[1.4]" style={{ color: DARK }}>
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

/** §3.1–§3.9 / §5 — one card. The phone values are the base classes, the desktop's are the `md:` ones. */
function PickCard({ card, runnerUp, questionPublicId }: { card: Card; runnerUp: RunnerUp | null; questionPublicId: string }) {
  // §3.8 — the strip belongs to the cheapest pick's card, whatever else that card won.
  const strip = runnerUp !== null && card.categories.includes("cheapest") ? runnerUp : null;
  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl md:w-[calc((100%-48px)/3)] md:shrink-0 md:grow-0"
      style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
    >
      {/* §3.1 — the top strip, flush with the card's edge; the ONE difference of a multi-winner card is that
          this and the button are bronze, not that the strip is there at all (findCar-now.md). */}
      <div aria-hidden className="h-1.5 shrink-0" style={{ background: card.color }} />

      <div className="flex grow flex-col gap-3 p-4 md:gap-3.5 md:p-5">
        <Labels card={card} />

        {/* §3.3 — the photo: a fixed 196px band on the desktop, a 4/3 frame on the phone. No photo → the car
            page's own placeholder box, in the same frame, without the board's caption (§3.3). */}
        <Photo src={card.image} className="block aspect-[4/3] w-full rounded-lg md:aspect-auto md:h-[196px]" />

        {/* §3.4 — the title: no comma, the 0.4em spacer comes from CarTitle itself. */}
        <div className="text-[19px] font-bold leading-[1.2] md:text-[20px]" style={{ color: DARK }}>
          <CarTitle model={card.model} year={card.year} />
        </div>

        {/* §3.5 — the price, and the new-price share beside it; with no new-price row there is NO element. */}
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-[30px] font-extrabold leading-[1.1] tabular-nums md:text-[32px]" style={{ color: DARK }}>
            {shekel(card.price)}
          </span>
          {card.new_price_pct !== null && (
            <span className="text-[13px]" style={{ color: GREY }}>
              {card.new_price_pct}
            </span>
          )}
        </div>

        <Rubrics card={card} />

        {/* §3.7 — the justification generator's line (Days 22–23). `null` → no element and no empty line, the
            way an empty "למה" section draws nothing on the car page. */}
        {card.sentence !== null && (
          <p className="m-0 text-[15px] leading-[1.5]" style={{ color: DARK }}>
            {card.sentence}
          </p>
        )}

        {/* §3.9 — the button at the BOTTOM of the card, whatever the card above it holds: `mt-auto` on the
            wrapper is what puts the three buttons on one line across a row of equal-height cards. */}
        <div className="mt-auto flex flex-col gap-2.5">
          {strip !== null && <RunnerUpStrip card={card} runnerUp={strip} questionPublicId={questionPublicId} />}
          <Link
            href={`/listing/${card.public_id}?s=${questionPublicId}`}
            className="relative flex h-[46px] items-center justify-center rounded-lg text-[15px] font-bold text-white no-underline md:h-11"
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

export default function PickCards({ answer }: { answer: AskResult }) {
  // §8 — the zero-results screen is Run 2's; its text and layout stay exactly as they are today.
  if (answer.pool_count === 0) return <p className="px-4 py-10 text-center text-lg text-neutral-700">{EMPTY_POOL}</p>;

  // §3.0 — the row: centred, stretched to one height, 24px apart, and every card at the THREE-card width
  // whether there are three, two or one (the boards «זוכה כפול» and «זוכה משולש» — the cards keep their width
  // and the row centres them; they never widen to fill it). On the phone they stack full width, which
  // `items-stretch` gives them, and the centring is moot (§5).
  return (
    <div className="flex flex-col items-stretch justify-center gap-6 md:flex-row">
      {answer.cards.map((card) => (
        <PickCard key={card.public_id} card={card} runnerUp={answer.runner_up} questionPublicId={answer.public_id} />
      ))}
    </div>
  );
}
