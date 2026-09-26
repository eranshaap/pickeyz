"use client";

// The filters (BRIEF Days 15–16, Run 2b §5; Run 2c §7 and §12) — WHAT IS INSIDE THE FILTERS WINDOW, and only
// that: the four groups in a scrolling box, and the "עדכן · N" button under it.
//
// RUN 2 (Days 24–25) §3.2 — THE CHROME IS GONE FROM HERE. Until this run one component drew both the phone's
// sliding sheet and the desktop's 320 px side panel that never closed, and it carried their frame: its own
// title row with its own × (hidden at md, since the panel could not be closed), and the width and the side
// placement its host gave it. Filters are now edited in ONE place on both devices — FiltersWindow.tsx, a modal
// <dialog> — and the frame is that file's: the title, the close button, the 780 px, the fade, the dim, the
// scroll lock. What is left here is the two regions the window lays out, unchanged in logic, look and labels.
//
// THE DRAFT vs THE QUESTION. Everything here edits the DRAFT. Nothing here asks anything — pressing "עדכן"
// is the only commit, and it is one call. The picks never update live.
//
// THE COUNTERS ARE FACTS, NOT ADVICE, and since Run 2c §12 they are a different fact: a chip's number is HOW
// MANY LISTINGS ARE IN THAT OPTION, counted within the other groups of the draft only. Tapping inside a group
// therefore never moves that group's own numbers. No arrows, no colours, no deltas. One template for every
// chip (§0.10): the label on top, the count beneath it, both centred, the width coming from the label, every
// chip carrying the count line — `0` included — so nothing grows or shrinks when a number changes. Tabular
// digits, no animation. The numbers arrive with the window; the last ones stay on screen until the new ones
// come, and there is no spinner.
//
// RUN 8b §1.1 — THREE CHIP STATES, AND THIS FILE DECIDES NONE OF THEM. Every chip arrives carrying its state
// and its count from src/lib/search/chip-state.ts; a click is forwarded to toggleChip() and the draft that
// comes back is handed up. What is drawn:
//
//   chosen   today's chosen look, whatever the count is
//   off      today's plain look — count > 0, a click switches it on
//   off-0    a REAL `disabled` button — no handler fires, `cursor: default` — in the board's greys
//            (UNSELECTABLE below). The "0" is still shown.
//
// RUN 8's "DORMANT" CHIP IS CANCELLED (§1.1, ruled 24/09), and with it the greyed pill of option ב and the
// DORMANT style object that held it: a chosen chip an edit takes to 0 simply LEAVES the selection and is
// drawn as any other 0 chip. That release is the library's, not this file's — it comes back inside the draft
// that toggleChip() and the price settle return.
//
// The "עדכן · N" button is `disabled` while isUnchanged() is true — the SAME predicate the screen's "apply
// with no change = cancel" runs on.
//
// THE PRICE SETTLES, AND THERE IS NO TIMER (§7). EDITING = a price field has focus and its text differs from
// its last settled value; while editing the button is HELD at "עדכן · —" (§0.3) and no counter call is made.
// SETTLE = Enter, the phone keyboard's done key, or blur — including a tap on a chip or any other control,
// which is why the typed number is taken exactly as it reads on screen. The chips keep their last settled
// numbers meanwhile (§0.8), and the price block has no number of its own (§12).
//
// NO FILTER LOGIC IS HERE. This component produces a SearchFilters and nothing else; what one means is
// src/lib/search/filters.ts's business, for the search and the counters alike.

import { useEffect, useMemo, useState } from "react";
import { isUnchanged, release, toggleChip, type ChipState, type ChipView, type ResolvedFilters } from "@/lib/search/chip-state";
import { sameFilters, type Filterable, type SearchFilters } from "@/lib/search/filters";
import type { FilterName } from "@/app/actions/search";
import { FILTER_LABEL, num } from "./labels";

const UPDATE = "עדכן";
const HELD = "—"; // §0.3 — what the button reads while a price is being edited
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

// §1.3 — the canonical deep-equal. `normalize()` lived here; it is a rule about what a filters object MEANS,
// so it moved to src/lib/search/filters.ts beside the predicate that reads the same fields, and every
// comparison in the app — this file, the screen's dim test, isUnchanged() — now runs through that one copy.
const same = sameFilters;

/** §1.1 — an off chip with count 0 (off-0): the board's greys, on a real disabled button. */
const UNSELECTABLE: { pill: React.CSSProperties; count: React.CSSProperties } = {
  pill: { background: "#f4f2ee", border: "1px solid #e4e0d9", color: "#a39d95", cursor: "default" },
  count: { color: "#a39d95" },
};

/** §2.3 — the greyed "עדכן": the board's disabled fill and text; the number is still shown. */
const BUTTON_DISABLED: React.CSSProperties = { background: "#d8d3cb", color: "#665f58" };

// §0.10 — one template for every chip. Two lines, centred; the width comes from the label and the min-width
// is a safety net for a long count, not the normal case; every chip carries the count line so the heights
// match whatever the numbers are. The count is never absent: the groups are resolved in render (§2.2), so
// there is no render in which a chip exists without its number.
//
// §1.1 — THE THREE STATES, drawn and not decided. `chosen` keeps today's chosen look and `off` keeps today's
// plain one, both as the Tailwind classes they always were; `off-0` is the one named style object above, on a
// REAL disabled button — its handler cannot fire at all, which is what "אינו ניתן לבחירה" means.
function Chip({ state, count, onClick, children }: { state: ChipState; count: number; onClick: () => void; children: React.ReactNode }) {
  const look =
    state === "off-0"
      ? { style: UNSELECTABLE.pill, className: "", countStyle: UNSELECTABLE.count, countClass: "" }
      : state === "chosen"
        ? { style: undefined, className: "border-neutral-900 bg-neutral-900 text-white", countStyle: undefined, countClass: "text-neutral-300" }
        : { style: undefined, className: "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400", countStyle: undefined, countClass: "text-neutral-400" };
  return (
    <button
      type="button"
      aria-pressed={state === "chosen"}
      disabled={state === "off-0"}
      onClick={onClick}
      style={look.style}
      className={`flex min-w-[4.5rem] flex-col items-center justify-center rounded-2xl border px-3 py-1.5 text-sm leading-tight ${look.className}`}
    >
      <span>{children}</span>
      <span style={look.countStyle} className={`text-xs tabular-nums ${look.countClass}`}>
        {num(count)}
      </span>
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

/**
 * Run 7 §7.3, re-cut by Run 7c §11.3 — the busy mark on an action button: disabled, plus this, for the
 * whole of the screen's pending state, which is the click, the server call, the push AND the navigation.
 */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`h-[1em] w-[1em] shrink-0 animate-spin motion-reduce:animate-none ${className}`} fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function FilterPanel({
  pool,
  resolved,
  draft,
  poolNow,
  stored,
  focus,
  onDraftChange,
  onAsk,
  busy = false,
}: {
  /**
   * §1.2 — the active model's filter rows, as the page carried them in. They are here for ONE reason: the
   * release at 0 is part of what the library returns from an edit, and the library counts over these rows.
   * Nothing in this file reads a row.
   */
  pool: Filterable[];
  /**
   * §1.1 — every chip with its state and its count, as the library resolved them. Nothing here recomputes,
   * and the shelf is not a prop of its own: which chips exist is already in these three lists.
   */
  resolved: ResolvedFilters;
  draft: SearchFilters; // the committed draft: the price in it is the SETTLED price
  poolNow: number | null; // the "עדכן · N" number — the pool under the EFFECTIVE filters
  /** §2.3 — the filters of the question the shown picks answer; null on the opening screen (nothing asked). */
  stored: SearchFilters | null;
  focus: FilterName | null; // the filter the window was opened on (§5)
  onDraftChange: (next: SearchFilters) => void;
  onAsk: (filters: SearchFilters) => void;
  /**
   * Run 7 §7.3 / Run 7c §11.3 — a commit is in flight: "עדכן" is disabled and carries a spinner from the
   * click until the NEW SCREEN IS ON. It is the screen's own pending state, the same one that puts the
   * placeholders in the cards area, so the button and the cards can never disagree about what is happening.
   */
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
  //
  // §1.2 — A SETTLED PRICE IS AN EDIT, so what is committed is the draft AFTER the release: any chosen chip
  // the new price takes to 0 leaves the selection here, in the library, and this file commits what it gets.
  // A price DELETED settles the same way, and releases nothing that is not at 0 — a chip released earlier
  // does not come back.
  function settle() {
    setFocused(null);
    commit(release(pool, current));
  }

  // §5 — opened on a rubric, the window arrives already at that filter.
  useEffect(() => {
    if (focus === null) return;
    document.getElementById(`filter-${focus}`)?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [focus]);

  // §1.2 — every click goes through toggleChip(), which returns the draft AFTER the release; this file
  // forwards what it gets back and no more. `current` is the draft AS IT READS ON SCREEN, so a chip tapped
  // while a price is half-typed keeps it — and settles it, which is why the release runs on the pair.
  const toggle = (chip: ChipView) => commit(toggleChip(pool, current, resolved, { group: chip.group, value: chip.value }));

  /** §1.4 — the button is greyed while the chosen set plus the typed values is the stored question's. */
  const unchanged = stored !== null && isUnchanged(current, stored);

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
      {/* THE BODY — the window's one scrolling region (§3.1): `overscroll-contain` so that reaching its end
          does not hand the gesture to the page behind. §3.4 — padding 24 inside the desktop window; the phone
          keeps the full-bleed body it had as a sheet, where the window IS the screen. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:p-6">
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
            {resolved.years.map((chip) => (
              <Chip key={chip.value} state={chip.state} count={chip.count} onClick={() => toggle(chip)}>
                {chip.value}
              </Chip>
            ))}
          </div>
        </Block>

        {/* ק"מ — ceiling only, single-select, chips = the latest model_stats.km_filter_anchors. No anchors, no block. */}
        {resolved.km.length > 0 && (
          <Block name="kmMax">
            <h3 className="font-medium text-neutral-900">{FILTER_LABEL.kmMax}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {resolved.km.map((chip) => (
                <Chip key={chip.value} state={chip.state} count={chip.count} onClick={() => toggle(chip)}>
                  {KM_CHIP_PREFIX} {num(chip.value)}
                </Chip>
              ))}
            </div>
          </Block>
        )}

        {/* אזור — the distinct region values present in the model pool, multi-select */}
        {resolved.regions.length > 0 && (
          <Block name="regions">
            <h3 className="font-medium text-neutral-900">{FILTER_LABEL.regions}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {resolved.regions.map((chip) => (
                <Chip key={chip.value} state={chip.state} count={chip.count} onClick={() => toggle(chip)}>
                  {chip.value}
                </Chip>
              ))}
            </div>
          </Block>
        )}

        {/* the whole draft is 0: say so, and say nothing about which filter to release (§5) */}
        {poolNow === 0 && <p className="px-4 py-4 text-neutral-600">{NOTHING_LEFT}</p>}
      </div>

      {/* "עדכן · N" — pressable at 0 (§0.10 of Run 2b, §5); held at "—" while a price is edited (§0.3).
          Run 7 §7.3, as Run 7c §11.3 re-cut it: from the click until the new screen is on it is disabled and
          carries a spinner, so the click is acknowledged on the control that was clicked and stays
          acknowledged for as long as anything is happening.
          Run 8 §2.3: it is ALSO disabled — in the board's greys, with the number still shown — while
          isUnchanged() is true. The screen's "apply with no change = cancel" runs on the same predicate, so
          an unchanged "עדכן" can never get here busy even if a click did reach the control.
          RUN 2 (Days 24–25) §3.5: this is the window's FOOTER, always visible under the scrolling body. It is
          the phone sheet's pinned bar with its own classes kept, plus the desktop window's 24px sides (§3.4).
          RUN 2b (Days 24–25) §5: its top hairline is the SITE's hairline, #e6e2db — the colour the window's own
          header draws under the title and the colour CarRow.tsx draws between rows. It was Tailwind's own
          neutral grey, a different colour, so the two lines of one window did not match. */}
      <div className="shrink-0 border-t border-[#e6e2db] p-4 md:px-6">
        <button
          type="button"
          disabled={busy || unchanged}
          aria-busy={busy}
          onClick={() => onAsk(current)}
          style={unchanged && !busy ? BUTTON_DISABLED : undefined}
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
