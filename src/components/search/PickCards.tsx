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

import type { AskResult } from "@/app/actions/search";
import { CATEGORY_LABEL, km, sellerKind, shekel } from "./labels";

const NO_RECOMMENDATION = "אין המלצה";
const EMPTY_POOL = "אין רכבים שעונים על ההגבלות";

export default function PickCards({ answer }: { answer: AskResult }) {
  if (answer.pool_count === 0) return <p className="px-4 py-10 text-center text-lg text-neutral-700">{EMPTY_POOL}</p>;

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {answer.picks.map((p) => (
        <article key={p.listing_id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
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
        </article>
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
