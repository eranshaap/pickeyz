"use client";

// The filters (BRIEF Days 15–16, Run 2b §5) — the drawer on mobile, the fixed panel on desktop. One
// component: the screen decides where it sits, this decides what it says.
//
// THE DRAFT vs THE QUESTION. Everything here edits the DRAFT. Nothing here asks anything — pressing "עדכן"
// is the only commit, and it is one call. The picks never update live.
//
// THE COUNTERS ARE FACTS, NOT ADVICE (§5). On every chip: a uniform grey number = the pool after toggling
// that chip with the rest of the draft as is, and a small grey arrow when that is larger or smaller than the
// draft's own pool. No colours, no deltas, no ranking, no recommendation, and a count of 0 never disables a
// chip — the order in which someone fills a form is not the order of importance. The numbers come from
// filterCounts(); the last ones stay on screen until the new ones arrive, and there is no spinner.
//
// THE PRICE BLOCK SETTLES (§0.8): "עד" first and prominent, "מ-" secondary, no slider, and its grey number
// (the pool in the typed range) updates on blur, on a move to the other field, or after a ~500 ms pause —
// never per keystroke. Every other control reports its change at once.
//
// NO FILTER LOGIC IS HERE. This component produces a SearchFilters and nothing else; what one means is
// src/lib/search/filters.ts's business, on the server, for the search and the counters alike.

import { useEffect, useMemo, useRef, useState } from "react";
import type { FilterCountsView, ShelfView } from "@/lib/search/counts";
import type { SearchFilters } from "@/lib/search/filters";
import type { FilterName } from "@/app/actions/search";
import { FILTER_LABEL, num } from "./labels";

/** The pause after the last keystroke that counts as the price having settled (§0.8). */
export const PRICE_SETTLE_MS = 500;

const UPDATE = "עדכן";
const CLOSE = "סגירה";
const NOTHING_LEFT = "הצירוף לא משאיר רכבים";
const PRICE_MAX_LABEL = "עד";
const PRICE_MIN_LABEL = "מ-";
const KM_CHIP_PREFIX = "עד";

type PriceText = { min: string; max: string };

const digits = (s: string): string => s.replace(/\D/g, "");
const parsePrice = (s: string): number | undefined => (digits(s) === "" ? undefined : Number(digits(s)));
const priceTextOf = (f: SearchFilters): PriceText => ({ min: f.priceMin === undefined ? "" : String(f.priceMin), max: f.priceMax === undefined ? "" : String(f.priceMax) });

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

// The grey arrow of one option: ▲ when that option would leave a larger pool than the draft's, ▼ smaller,
// nothing when equal (§5). It is a direction, not a delta, and it has no colour.
function Counter({ count, direction }: { count: number | null; direction: "up" | "down" | "same" | null }) {
  if (count === null) return null;
  return (
    <span className="ms-2 text-sm text-neutral-400 tabular-nums">
      {num(count)}
      {direction === "up" && <span aria-hidden> ▲</span>}
      {direction === "down" && <span aria-hidden> ▼</span>}
    </span>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-sm ${selected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400"}`}
    >
      {children}
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
}) {
  const [priceText, setPriceText] = useState<PriceText>(() => priceTextOf(draft));
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The draft AS IT READS ON SCREEN — the committed draft with whatever is typed in the price fields. Every
  // change is built from this, so a chip toggled while a price is half-typed does not throw the price away.
  const current = useMemo(() => withPrice(draft, priceText), [draft, priceText]);

  function commit(next: SearchFilters) {
    if (settle.current !== null) clearTimeout(settle.current);
    if (!same(next, draft)) onDraftChange(next);
  }

  // §0.8 — the price settles after a pause. Blur and a move to the other field settle it at once, below.
  useEffect(() => {
    const next = withPrice(draft, priceText);
    if (same(next, draft)) return;
    settle.current = setTimeout(() => onDraftChange(next), PRICE_SETTLE_MS);
    return () => {
      if (settle.current !== null) clearTimeout(settle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceText.min, priceText.max]);

  // §5 — opened on a rubric, the drawer arrives already at that filter.
  useEffect(() => {
    if (focus === null) return;
    document.getElementById(`filter-${focus}`)?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [focus]);

  const yearCount = (year: number) => counts?.years.find((y) => y.year === year) ?? null;
  const kmCount = (max: number) => counts?.km.chips.find((k) => k.km_max === max) ?? null;
  const regionCount = (region: string) => counts?.regions.find((r) => r.region === region) ?? null;

  const chosenYears = current.years ?? [];
  const chosenRegions = current.regions ?? [];

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
        {/* מחיר — two number fields, "עד" first and prominent, no slider (§5) */}
        <Block name="price">
          <div className="flex items-baseline justify-between">
            <h3 className="font-medium text-neutral-900">{FILTER_LABEL.price}</h3>
            <Counter count={counts?.price.in_range ?? null} direction={null} />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <span className="w-10 text-neutral-900">{PRICE_MAX_LABEL}</span>
              <input
                type="text"
                inputMode="numeric"
                value={priceText.max}
                onChange={(e) => setPriceText((t) => ({ ...t, max: digits(e.target.value) }))}
                onBlur={() => commit(current)}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-lg text-neutral-900 outline-none focus:border-neutral-900"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-10 text-sm text-neutral-500">{PRICE_MIN_LABEL}</span>
              <input
                type="text"
                inputMode="numeric"
                value={priceText.min}
                onChange={(e) => setPriceText((t) => ({ ...t, min: digits(e.target.value) }))}
                onBlur={() => commit(current)}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-neutral-900"
              />
            </label>
          </div>
        </Block>

        {/* שנתון — only years with stock in the model pool, multi-select */}
        <Block name="years">
          <h3 className="font-medium text-neutral-900">{FILTER_LABEL.years}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {shelf.years.map((year) => {
              const c = yearCount(year);
              const selected = chosenYears.includes(year);
              return (
                <Chip
                  key={year}
                  selected={selected}
                  onClick={() => {
                    const years = selected ? chosenYears.filter((y) => y !== year) : [...chosenYears, year];
                    commit({ ...current, years });
                  }}
                >
                  {year}
                  <Counter count={c?.count ?? null} direction={c?.direction ?? null} />
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
                const c = kmCount(max);
                const selected = current.kmMax === max;
                return (
                  <Chip
                    key={max}
                    selected={selected}
                    onClick={() => {
                      const next = { ...current };
                      if (selected) delete next.kmMax;
                      else next.kmMax = max;
                      commit(next);
                    }}
                  >
                    {KM_CHIP_PREFIX} {num(max)}
                    <Counter count={c?.count ?? null} direction={c?.direction ?? null} />
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
                const c = regionCount(region);
                const selected = chosenRegions.includes(region);
                return (
                  <Chip
                    key={region}
                    selected={selected}
                    onClick={() => {
                      const regions = selected ? chosenRegions.filter((r) => r !== region) : [...chosenRegions, region];
                      commit({ ...current, regions });
                    }}
                  >
                    {region}
                    <Counter count={c?.count ?? null} direction={c?.direction ?? null} />
                  </Chip>
                );
              })}
            </div>
          </Block>
        )}

        {/* the whole draft is 0: say so, and say nothing about which filter to release (§5) */}
        {poolNow === 0 && <p className="px-4 py-4 text-neutral-600">{NOTHING_LEFT}</p>}
      </div>

      {/* "עדכן · N" — always pressable, 0 included (§0.10) */}
      <div className="border-t border-neutral-200 p-4">
        <button
          type="button"
          onClick={() => onAsk(current)}
          className="w-full rounded-2xl bg-neutral-900 px-4 py-3.5 text-lg font-medium text-white hover:bg-neutral-800"
        >
          {UPDATE}
          {poolNow !== null && ` · ${num(poolNow)}`}
        </button>
      </div>
    </>
  );
}
