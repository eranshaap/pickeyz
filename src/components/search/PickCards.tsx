"use client";

// The results area (BRIEF Days 15–16, Run 2b §5, §0.6) — the three RAW picks, each under its category label.
//
// §0.6 is a list of what a card may say, and it is short on purpose: the category label(s), the year, the
// sub-model, the price, the km and the seller kind. No justification sentence, no confidence tag, no
// runner-up, no "מועמד לא מאומת" label, no bottom list and no link to a car page — those are Days 17 and
// 19–23, and the payload this component receives does not carry them.
//
// A car that won two categories is ONE card with both labels (the server already deduped it). A category
// nobody won prints its label and the RAW reason code selectThree gave: the wording of that reason is a
// product decision, and this run does not take it.
//
// The whole area swaps as one unit on every answer, and dims as one unit while the draft differs from the
// question (§5) — the dimming is applied by the screen, on the wrapper, not per card.
//
// Run 7 §7.1 — a click on a card must be acknowledged ON THE CARD, immediately: from the click until the
// navigation commits the card dims to ~60% and shows a small spinner in its corner. That is the framework's
// own link-status mechanism (`useLinkStatus`, from "next/link"), which only works INSIDE a <Link> subtree —
// hence LinkPending, a child of the anchor rather than a wrapper around it.

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { AskResult } from "@/app/actions/search";
import { CATEGORY_LABEL, km, sellerKind, shekel } from "./labels";

const NO_RECOMMENDATION = "אין המלצה";
const EMPTY_POOL = "אין רכבים שעונים על ההגבלות";

/**
 * Run 7 §7.1 — the pending state of the <Link> this sits inside, painted on that link and nowhere else.
 * It dims its own anchor (via a full-cover overlay in the page background) and puts a spinner in the corner.
 * Nothing global: no top bar, no page-wide veil.
 *
 * It is exported from here, rather than from a file of its own, because Run 7's ALLOWED list adds exactly
 * one new file (`src/app/loading.tsx`) and this is the component that needs it first. The car page's back
 * link imports it from here.
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

export default function PickCards({ answer }: { answer: AskResult }) {
  if (answer.pool_count === 0) return <p className="px-4 py-10 text-center text-lg text-neutral-700">{EMPTY_POOL}</p>;

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {answer.picks.map((p) => (
        // Run 6b §9: the whole card is the link to its car page — a real anchor, so it is a NEW history
        // entry and the browser's back returns to these results. The card's LOOK is untouched.
        <Link
          key={p.listing_id}
          href={`/listing/${p.public_id}?s=${answer.public_id}`}
          className="relative block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:border-neutral-300"
        >
          <LinkPending />
          <div className="flex flex-wrap gap-2">
            {p.categories.map((c) => (
              <span key={c} className="rounded-full bg-neutral-900 px-3 py-1 text-sm font-medium text-white">
                {CATEGORY_LABEL[c]}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xl font-semibold text-neutral-900">{shekel(p.price)}</p>
          <p className="mt-1 text-neutral-700">
            {p.year}
            {p.sub_model !== null && ` · ${p.sub_model}`}
            {p.km_declared !== null && ` · ${km(p.km_declared)}`}
            {` · ${sellerKind(p.dealer_type)}`}
          </p>
        </Link>
      ))}

      {answer.empties.map((e) => (
        <article key={e.category} className="rounded-2xl border border-dashed border-neutral-300 p-4">
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-600">{CATEGORY_LABEL[e.category]}</span>
          <p className="mt-3 text-neutral-500">
            {NO_RECOMMENDATION} — <code className="text-neutral-600">{e.reason}</code>
          </p>
        </article>
      ))}
    </div>
  );
}
