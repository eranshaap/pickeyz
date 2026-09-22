"use client";

// The filters (BRIEF Days 15–16, Run 2b §5; Run 2c §7 and §12) — the drawer on mobile, the fixed panel on
// desktop. One component: the screen decides where it sits, this decides what it says.
//
// THE DRAFT vs THE QUESTION. Everything here edits the DRAFT. Nothing here asks anything — pressing "עדכן"
// is the only commit, and it is one call. The picks never update live.
//
// THE COUNTERS ARE FACTS, NOT ADVICE, and since Run 2c §12 they are a different fact: a chip's number is HOW
// MANY LISTINGS ARE IN THAT OPTION, counted within the other groups of the draft only. Tapping inside a group
// therefore never moves that group's own numbers. No arrows, no colours, no deltas, and a 0 never disables a
// chip. One template for every chip (§0.10): the label on top, the count beneath it, both centred, the width
// coming from the label, every chip carrying the count line — `0` included — so nothing grows or shrinks when
// a number changes. Tabular digits, no animation. The numbers come from filterCounts(); the last ones stay on
// screen until the new ones arrive, and there is no spinner.
//
// THE PRICE SETTLES, AND THERE IS NO TIMER (§7). EDITING = a price field has focus and its text differs from
// its last settled value; while editing the button is HELD at "עדכן · —" (§0.3) and no counter call is made.
// SETTLE = Enter, the phone keyboard's done key, or blur — including a tap on a chip or any other control,
// which is why the typed number is taken exactly as it reads on screen. The chips keep their last settled
// numbers meanwhile (§0.8), and the price block has no number of its own (§12).
//
// NO FILTER LOGIC IS HERE. This component produces a SearchFilters and nothing else; what one means is
// src/lib/search/filters.ts's business, on the server, for the search and the counters alike.

import { useEffect, useMemo, useState } from "react";
import type { FilterCountsView, ShelfView } from "@/lib/search/counts";
import type { SearchFilters } from "@/lib/search/filters";
import type { FilterName } from "@/app/actions/search";
import { FILTER_LABEL, num } from "./labels";

const UPDATE = "עדכן";
const HELD = "—"; // §0.3 — what the button reads while a price is being edited
const CLOSE = "סגירה";
const NOTHING_LEFT = "הצירוף לא משאיר רכבים";
const PRICE_MAX_LABEL = "עד";
const PRICE_MIN_LABEL = "מ-";
const KM_CHIP_PREFIX = "עד";

/** §0.12 — a UI constant, not a ledger line: both price fields stop here, and the line below says why. */
export const PRICE_CAP = 3_000_000;
const PRICE_CAP_LINE = "במחיר הזה כבר מחפשים מזראטי בגוגל.";

type PriceField = "min" | "max";
type PriceText = Record<PriceField, string>; // DIGITS ONLY — the separators are added on the way to the input

const digits = (s: string): string => s.replace(/\D/g, "");
const parsePrice = (s: string): number | undefined => (digits(s) === "" ? undefined : Number(digits(s)));
const priceTextOf = (f: SearchFilters): PriceText => ({ min: f.priceMin === undefined ? "" : String(f.priceMin), max: f.priceMax === undefined ? "" : String(f.priceMax) });
const settledPrice = (f: SearchFilters, field: PriceField): number | undefined => (field === "max" ? f.priceMax : f.priceMin);

/** §7 — what the field SHOWS while it is being typed: 8,000 / 20,000 / 76,758. */
const shownPrice = (d: string): string => (d === "" ? "" : num(Number(d)));

/** Where the caret belongs after `n` digits of `text`, so inserting a separator does not throw it to the end. */
function caretAfterDigits(text: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] >= "0" && text[i] <= "9") {
      seen++;
      if (seen === n) return i + 1;
    }
  }
  return text.length;
}

function withPrice(f: SearchFilters, t: PriceText): SearchFilters {
  const next: SearchFilters = { ...f };
  const lo = parsePrice(t.min);
  const hi = parsePrice(t.max);
  if (lo === undefined) delete next.priceMin;
  else next.priceMin = lo;
  if (hi === undefined) delete next.priceMax;
  else next.priceMax = hi;
  return next;
}

const same = (a: SearchFilters, b: SearchFilters): boolean => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

/** §5 — arrays sorted, empties dropped; the shape both the dim test and this file compare on. */
export function normalize(f: SearchFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.priceMin !== undefined) out.priceMin = f.priceMin;
  if (f.priceMax !== undefined) out.priceMax = f.priceMax;
  if (f.years !== undefined && f.years.length > 0) out.years = [...f.years].sort((a, b) => a - b);
  if (f.kmMax !== undefined) out.kmMax = f.kmMax;
  if (f.regions !== undefined && f.regions.length > 0) out.regions = [...f.regions].sort((a, b) => a.localeCompare(b));
  return out;
}

// §0.10 — one template for every chip. Two lines, centred; the width comes from the label and the min-width
// is a safety net for a long count, not the normal case; every chip carries the count line so the heights
// match whatever the numbers are. A null count (before the first payload arrives) keeps the line's height
// with a non-breaking space rather than collapsing the chip.
function Chip({ selected, count, onClick, children }: { selected: boolean; count: number | null; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-w-[4.5rem] flex-col items-center justify-center rounded-2xl border px-3 py-1.5 text-sm leading-tight ${selected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400"}`}
    >
      <span>{children}</span>
      <span className={`text-xs tabular-nums ${selected ? "text-neutral-300" : "text-neutral-400"}`}>{count === null ? " " : num(count)}</span>
    </button>
  );
}

function Block({ name, children }: { name: FilterName; children: React.ReactNode }) {
  return (
    <section id={`filter-${name}`} className="border-b border-neutral-200 px-4 py-4 last:border-b-0">
      {children}
    </section>
  );
}

/** Run 7 §7.3 — the busy mark on an action button: disabled, plus this, from the click until the push. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`h-[1em] w-[1em] shrink-0 animate-spin motion-reduce:animate-none ${className}`} fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function FilterPanel({
  shelf,
  draft,
  counts,
  poolNow,
  focus,
  onDraftChange,
  onAsk,
  onCancel,
  persistentOnDesktop,
  busy = false,
}: {
  shelf: ShelfView;
  draft: SearchFilters; // the committed draft: the price in it is the SETTLED price
  counts: FilterCountsView | null; // the last numbers that arrived; null before the first answer
  poolNow: number | null; // the "עדכן · N" number
  focus: FilterName | null; // the filter the drawer was opened on (§5)
  onDraftChange: (next: SearchFilters) => void;
  onAsk: (filters: SearchFilters) => void;
  onCancel: (() => void) | null;
  /** true once this is the desktop panel (§5): it never closes there, so it carries no close control at md. */
  persistentOnDesktop: boolean;
  /** Run 7 §7.3 — a commit is in flight: "עדכן" is disabled and carries a spinner until the push. */
  busy?: boolean;
}) {
  const [priceText, setPriceText] = useState<PriceText>(() => priceTextOf(draft));
  const [focused, setFocused] = useState<PriceField | null>(null);
  const [capped, setCapped] = useState<PriceField | null>(null);

  // The draft AS IT READS ON SCREEN — the committed draft with whatever is typed in the price fields. Every
  // change is built from this, so a chip toggled while a price is half-typed does not throw the price away.
  const current = useMemo(() => withPrice(draft, priceText), [draft, priceText]);

  // §7 — EDITING, and nothing else, is what holds the button. A focused field whose text is already the
  // settled value is not editing: nothing is pending.
  const editing = focused !== null && parsePrice(priceText[focused]) !== settledPrice(draft, focused);

  function commit(next: SearchFilters) {
    if (!same(next, draft)) onDraftChange(next);
  }

  // §7 — every keystroke, with the cap and the separators. A refused digit changes no state, so the DOM value
  // is written back by hand; an accepted one re-renders to the very string just written and the caret stays.
  function onPriceInput(field: PriceField, e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const caret = el.selectionStart ?? el.value.length;
    const before = digits(el.value.slice(0, caret)).length;
    const typed = digits(el.value);
    const refused = typed !== "" && Number(typed) > PRICE_CAP;
    const shown = shownPrice(refused ? priceText[field] : typed);
    el.value = shown;
    const pos = caretAfterDigits(shown, refused ? before - 1 : before);
    el.setSelectionRange(pos, pos);
    setCapped(refused ? field : null); // it disappears as soon as the value is within the cap (§7)
    if (!refused) setPriceText((t) => ({ ...t, [field]: typed }));
  }

  // §7 — SETTLE. Blur covers the phone keyboard's done key, a tap on a chip, and a tap on "עדכן" alike;
  // Enter settles by blurring, so there is one path and not two.
  function settle() {
    setFocused(null);
    commit(current);
  }

  // §5 — opened on a rubric, the drawer arrives already at that filter.
  useEffect(() => {
    if (focus === null) return;
    document.getElementById(`filter-${focus}`)?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [focus]);

  const yearCount = (year: number) => counts?.years.find((y) => y.year === year)?.count ?? null;
  const kmCount = (max: number) => counts?.km.chips.find((k) => k.km_max === max)?.count ?? null;
  const regionCount = (region: string) => counts?.regions.find((r) => r.region === region)?.count ?? null;

  const chosenYears = current.years ?? [];
  const chosenRegions = current.regions ?? [];

  const priceField = (field: PriceField, label: string, big: boolean) => (
    <div>
      {capped === field && <p className="pb-1 text-xs text-red-600">{PRICE_CAP_LINE}</p>}
      <label className="flex items-center gap-2">
        <span className={big ? "w-10 text-neutral-900" : "w-10 text-sm text-neutral-500"}>{label}</span>
        <input
          type="text"
          inputMode="numeric"
          aria-label={`${FILTER_LABEL.price} ${label}`}
          value={shownPrice(priceText[field])}
          onChange={(e) => onPriceInput(field, e)}
          onFocus={() => setFocused(field)}
          onBlur={settle}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            e.currentTarget.blur(); // §7 — Enter settles, by the same path blur does
          }}
          className={`w-full rounded-xl border border-neutral-300 px-3 outline-none focus:border-neutral-900 ${big ? "py-2.5 text-lg text-neutral-900" : "py-2 text-sm text-neutral-700"}`}
        />
      </label>
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-neutral-900">פילטרים</h2>
        {onCancel !== null && (
          <button
            type="button"
            aria-label={CLOSE}
            className={`rounded-full px-3 py-1 text-2xl leading-none text-neutral-500 hover:bg-neutral-100 ${persistentOnDesktop ? "md:hidden" : ""}`}
            onClick={onCancel}
          >
            ×
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* מחיר — two text fields, "עד" first and prominent, no slider, and NO number of its own (§12) */}
        <Block name="price">
          <h3 className="font-medium text-neutral-900">{FILTER_LABEL.price}</h3>
          <div className="mt-3 flex flex-col gap-2">
            {priceField("max", PRICE_MAX_LABEL, true)}
            {priceField("min", PRICE_MIN_LABEL, false)}
          </div>
        </Block>

        {/* שנתון — only years with stock in the model pool, multi-select */}
        <Block name="years">
          <h3 className="font-medium text-neutral-900">{FILTER_LABEL.years}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {shelf.years.map((year) => {
              const selected = chosenYears.includes(year);
              return (
                <Chip
                  key={year}
                  selected={selected}
                  count={yearCount(year)}
                  onClick={() => {
                    const years = selected ? chosenYears.filter((y) => y !== year) : [...chosenYears, year];
                    commit({ ...current, years });
                  }}
                >
                  {year}
                </Chip>
              );
            })}
          </div>
        </Block>

        {/* ק"מ — ceiling only, single-select, chips = the latest model_stats.km_filter_anchors. No anchors, no block. */}
        {shelf.km_anchors !== null && shelf.km_anchors.length > 0 && (
          <Block name="kmMax">
            <h3 className="font-medium text-neutral-900">{FILTER_LABEL.kmMax}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {shelf.km_anchors.map((max) => {
                const selected = current.kmMax === max;
                return (
                  <Chip
                    key={max}
                    selected={selected}
                    count={kmCount(max)}
                    onClick={() => {
                      const next = { ...current };
                      if (selected) delete next.kmMax;
                      else next.kmMax = max;
                      commit(next);
                    }}
                  >
                    {KM_CHIP_PREFIX} {num(max)}
                  </Chip>
                );
              })}
            </div>
          </Block>
        )}

        {/* אזור — the distinct region values present in the model pool, multi-select */}
        {shelf.regions.length > 0 && (
          <Block name="regions">
            <h3 className="font-medium text-neutral-900">{FILTER_LABEL.regions}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {shelf.regions.map((region) => {
                const selected = chosenRegions.includes(region);
                return (
                  <Chip
                    key={region}
                    selected={selected}
                    count={regionCount(region)}
                    onClick={() => {
                      const regions = selected ? chosenRegions.filter((r) => r !== region) : [...chosenRegions, region];
                      commit({ ...current, regions });
                    }}
                  >
                    {region}
                  </Chip>
                );
              })}
            </div>
          </Block>
        )}

        {/* the whole draft is 0: say so, and say nothing about which filter to release (§5) */}
        {poolNow === 0 && <p className="px-4 py-4 text-neutral-600">{NOTHING_LEFT}</p>}
      </div>

      {/* "עדכן · N" — always pressable, 0 included (§0.10 of Run 2b); held at "—" while a price is edited (§0.3).
          Run 7 §7.3: from the click until the push it is disabled and carries a spinner, so the click is
          acknowledged on the control that was clicked. An unchanged "עדכן" never gets here busy: §1.3 turns
          it into a cancel before anything is asked. */}
      <div className="border-t border-neutral-200 p-4">
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => onAsk(current)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3.5 text-lg font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-500"
        >
          {busy && <Spinner />}
          <span>
            {UPDATE}
            {editing ? ` · ${HELD}` : poolNow !== null ? ` · ${num(poolNow)}` : ""}
          </span>
        </button>
      </div>
    </>
  );
}
