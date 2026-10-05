"use client";

// The opening screen (S3 §3–§5) — rendered by SearchScreen while there is no question, and NOT RENDERED AT ALL
// after one: nothing of it stays in the page to be clicked, to take the focus, or to sit fixed over the results.
//
// THE LAYOUT, top to bottom:
//   the top bar   the results screen's top bar — the same markup, the brand where it sits there (the 1,440
//                 container), without the question row. 52 px high on the phone. It never grows.
//   the air       40% of the free height above the group, 60% below it (two flex spacers, 2 : 3).
//   the group     centred: the headline (two lines), the grey line (at most 620 wide), the bar, the three
//                 categories (a short line in the category's colour, its name in that colour, its line; not clickable), on a
//                 soft, very light radial halo.
//   the tags      the two sentences, each after a green check; centred at the bottom, 24 px from it on the
//                 computer, one above the other on the phone. A window too low for all of it: the tags follow
//                 the categories after the bottom spacer's minimum, and the page scrolls — nothing shrinks.
//
// THE TWO FORMS. The computer (900 px and wider): the bar is ModelBar — the pill with "חפש" inside. The phone:
// the field is a pill with no button, a touch on it opens <FullScreenSearch>, and "חפש" is a wide pill fixed at
// the bottom of the screen. Pressing it with nothing chosen opens the full-screen search with "צריך לבחור דגם."
// at the top of the list (useFamilyBar's submit, which asks the bar for the focus — here, the full screen).
//
// GROWING WITH THE WINDOW. Every size under the top bar is written as `calc(N px * var(--s))`, and `--s` is
// written on this screen's root, on mount and on every resize, by openingScale() on the computer and
// phoneOpeningScale() on the phone (src/lib/opening/layout.ts). It is a style written straight onto the
// element, not React state, so a resize re-renders nothing. On the phone the content is a centred column
// 390 × s wide. The gaps inside the group are provisional — Eran tunes them on the live site.
//
// "BACK" AND THE BRAND LINK (§5). Before the first question moves to `/?s=…`, SearchScreen records the asked
// family on this screen's history entry (recordOpeningFamily, useHistory.ts); when the browser's back returns
// to that entry this screen mounts again, reads it, and puts the family's full name in the bar — the list
// closed, "חפש" black. The first click into the bar (or the first touch on the phone's field) empties it; text
// the person typed is never erased. The brand link leads to a fresh screen: a new entry carries no family, and
// on this screen itself (the same address) the link also forgets the family and starts the screen over, with
// an empty bar and a newly picked hint.
//
// S4 §2–§3 — THE SEARCH MOMENT STARTS HERE. A choice measures where the rise starts — on the computer the pill,
// its text and "חפש" (after the page is put back at its top, so the measure is the place the rise starts from);
// on the phone the full-screen search's field (or this screen's own pill, for "חפש" on a bar a "back" filled),
// before it loses the focus and the keyboard goes down — and hands that `Origin` to SearchScreen with the
// family. From then on SearchScreen runs the moment: it sets `leaving`, and this screen's headline, grey line,
// categories and tags (and the phone's "חפש") fade out over OPENING_FADE_MS, while the bar itself (the
// computer's pill, the phone's) is hidden at once, because the moment draws its own copy of the bar. The error line under the bar is gone (S4 §4): a failed search is shown on the results frame.
//
// S6 — ON THE PHONE, A CHOICE IN THE FULL-SCREEN SEARCH NEVER BRINGS THIS SCREEN BACK ON VIEW. The moment starts
// at the choice itself, with the full-screen search still open: this screen is hidden at once under it (the
// whole root, its white included, so what lies beneath is the page's background and the invisible results
// frame), and the full-screen search fades out around its field (FullScreenSearch.tsx, `leaving`) until the
// moment lands and this screen, the full-screen search with it, is removed. Its history entry is popped at the
// choice and nothing waits for the pop but the question's push (`popped`, below).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "@/lib/display/texts";
import { DESKTOP_MIN_WIDTH_PX, RESULTS_CONTAINER_CLASS } from "@/lib/display/layout";
import { fullName, hintText, type FamilyEntry } from "@/lib/opening/completion";
import { HINT_NAME_MAX_CHARS } from "@/lib/opening/constants";
import { openingScale, phoneOpeningScale } from "@/lib/opening/layout";
import { OPENING_TEXTS } from "@/lib/opening/texts";
import { OPENING_FADE_MS } from "@/lib/display/timing";
import { useFamilyBar, type FamilyBar } from "./CompletionPanel";
import { Spinner } from "./FilterPanel";
import FullScreenSearch from "./FullScreenSearch";
import ModelBar from "./ModelBar";
import { forgetOpeningFamily, openingFamily, useScreenHistory } from "./useHistory";

const INK = "#221f1c"; // BLACK in src/lib/display/texts.ts — the site's ink
const GREY = "#665f58"; // the site's label grey
const CHECK_GREEN = "#2e7d32"; // S3 §3: the site has no "verified" green of its own (§0.4)

const CATEGORIES = [
  { code: "best_value", line: OPENING_TEXTS.categoryLines.bestValue },
  { code: "peace_of_mind", line: OPENING_TEXTS.categoryLines.peaceOfMind },
  { code: "cheapest", line: OPENING_TEXTS.categoryLines.cheapest },
] as const;

const isDesktop = () => window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`).matches;

/**
 * S4 §2 — the fade's length is spelled twice OF NECESSITY (FiltersWindow.tsx's rule): the map is indexed BY
 * OPENING_FADE_MS, so changing it without a class to match stops the compile.
 */
const FADE_DURATION: Record<typeof OPENING_FADE_MS, string> = { 150: "duration-150" };
const FADE = `transition-opacity ease-out ${FADE_DURATION[OPENING_FADE_MS]} motion-reduce:transition-none`;

/** A box in the window's coordinates, as getBoundingClientRect() gives it. */
export type Box = { left: number; top: number; width: number; height: number };

/** Where a line of text sits and how it is drawn: its inline-start edge (the right, in RTL) and its middle. */
export type TextMark = { right: number; midY: number; fontSize: number; fontWeight: string; lineHeight: string };

/** S4 §2 / §3 — where the search moment's rise starts: the bar (or the phone's field), its text, and "חפש". */
export type Origin = {
  /** "pill": white, round, a soft shadow (the computer's bar, the phone's opening field); "field": the full-screen search's bordered field */
  look: "pill" | "field";
  box: Box;
  text: TextMark;
  /** the computer's "חפש", inside the pill; the phone's field has none */
  button: { box: Box; fontSize: number } | null;
};

export function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** The text's start edge is the box's right less its right padding and border (the page is RTL). */
export function textMarkOf(el: HTMLElement): TextMark {
  const r = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);
  return {
    right: r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth),
    midY: r.top + r.height / 2,
    fontSize: parseFloat(cs.fontSize),
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight,
  };
}

type Props = {
  /** S2 §5 — barFamilies(): what the bar offers. */
  families: FamilyEntry[];
  /** A question is on its way (SearchScreen's commit state). */
  pending: boolean;
  /** S4 §2 — the search moment is running: the screen fades out and the computer's bar is hidden. */
  leaving: boolean;
  /**
   * A model was chosen: ask it, from zero. `origin` is where the rise starts; `popped` resolves once the
   * full-screen search's history entry is gone — the question's address may not be pushed before it (S6).
   */
  onAsk: (familyId: number, origin: Origin, popped: Promise<void>) => void;
};

export default function OpeningScreen(props: Props) {
  // §5 — the brand link on this screen starts it over: a new generation is a fresh mount.
  const [generation, setGeneration] = useState(0);
  return (
    <Opening
      key={generation}
      {...props}
      onFresh={() => {
        forgetOpeningFamily();
        setGeneration((g) => g + 1);
      }}
    />
  );
}

function Opening({ families, pending, leaving, onAsk, onFresh }: Props & { onFresh: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const topBar = useRef<HTMLDivElement>(null);
  const desktopPill = useRef<HTMLDivElement>(null);
  const desktopButton = useRef<HTMLButtonElement>(null);
  const desktopInput = useRef<HTMLInputElement>(null);
  const phoneField = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);

  // §4 — the phone's full-screen search is open. It is an overlay with its own history entry, so the phone's
  // back closes it as a cancel and stays on the opening screen (the question row's mechanism).
  const [full, setFull] = useState(false);
  const history = useScreenHistory({ onCancelOverlay: () => setFull(false) });

  // §5 — the bar holds the asked model, put there by a "back"; the first click into it empties it.
  const prefilled = useRef(false);

  // One choice asks once: a second tap while the full screen's entry is still being popped is not a second search.
  const asking = useRef(false);

  const bar = useFamilyBar(families, {
    // A choice asks at once. The full screen's entry is popped first, so the question's address is pushed
    // onto the opening screen's own entry (useHistory.ts: popOverlay runs `after` once the pop has landed).
    // S4 §2 / §3 — the rise's start is measured first; on the phone the field then loses the focus (the
    // keyboard goes down) and the full screen closes in the same batch the moment starts, so the name is never
    // off the screen between the two.
    onChoose: (id) => {
      if (asking.current) return;
      asking.current = true;
      const origin = originNow();
      phoneInput.current?.blur();
      // S6 — the phone's full-screen search: the moment starts now, from it, and it stays open until the moment
      // lands; its entry is popped beside the moment, and only the question's push waits for that.
      if (origin.look === "field") {
        onAsk(id, origin, new Promise((resolve) => history.popOverlay(resolve)));
        return;
      }
      history.popOverlay(() => {
        setFull(false);
        onAsk(id, origin, Promise.resolve());
      });
    },
    // "חפש" / Enter with no model: the bar takes the focus — on the phone, that is the full-screen search.
    focus: () => {
      if (isDesktop()) desktopInput.current?.focus();
      else openFull();
    },
  });
  const { reset } = bar;

  /** S4 §2 / §3 — the rise's start, as drawn right now. Every element named here is mounted when a choice is made. */
  function originNow(): Origin {
    if (isDesktop()) {
      window.scrollTo(0, 0); // the page goes to its top at the search (as SearchScreen's commit does) — first, so the measure is the start
      const pill = desktopPill.current;
      const input = desktopInput.current;
      const button = desktopButton.current;
      if (pill === null || input === null || button === null) throw new Error("[opening screen] a choice on the computer with the bar not mounted");
      return { look: "pill", box: boxOf(pill), text: textMarkOf(input), button: { box: boxOf(button), fontSize: parseFloat(window.getComputedStyle(button).fontSize) } };
    }
    // The phone: the full-screen search's field — or, for "חפש" pressed on a bar that a "back" filled (§5), the
    // opening screen's own pill, where the name is then drawn.
    const field = phoneInput.current;
    if (field !== null) return { look: "field", box: boxOf(field), text: textMarkOf(field), button: null };
    const pill = phoneField.current;
    if (pill === null) throw new Error("[opening screen] a choice on the phone with neither field mounted");
    return { look: "pill", box: boxOf(pill), text: textMarkOf(pill), button: null };
  }

  function clearPrefill() {
    if (!prefilled.current) return;
    prefilled.current = false;
    reset("");
  }

  function openFull() {
    clearPrefill();
    if (full) return;
    setFull(true);
    history.pushOverlay("search");
  }

  /** "ביטול": the full screen closes and the list with it; the text stays. */
  function cancelFull() {
    setFull(false);
    bar.closeList();
    history.popOverlay();
  }

  // §4 — the full screen arrives with the focus in its field.
  useEffect(() => {
    if (full) phoneInput.current?.focus();
  }, [full]);

  // §5 — the hint, picked ONCE on mount and put on both fields. Set on the elements themselves so no render
  // can pick it again (a pick made during the server render would differ from the browser's).
  useEffect(() => {
    const hint = hintText(families, HINT_NAME_MAX_CHARS);
    for (const el of [desktopInput.current, phoneField.current]) if (el !== null) el.placeholder = hint;
  }, [families]);

  // §5 — "back": the entry this screen mounted on remembers the family that was asked from it.
  useEffect(() => {
    const id = openingFamily();
    if (id === null) return;
    const f = families.find((x) => x.id === id);
    if (f === undefined) {
      console.error(`[opening screen] the history entry names family ${id}, which is not among the bar's families — the bar stays empty`);
      return;
    }
    reset(fullName(f));
    prefilled.current = true;
  }, [families, reset]);

  // §3 / §4 — the scale, on mount and on every resize; written onto the root as `--s`.
  useLayoutEffect(() => {
    const apply = () => {
      const el = root.current;
      const top = topBar.current;
      if (el === null || top === null) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = isDesktop() ? openingScale(w, h, top.offsetHeight) : phoneOpeningScale(w, h, top.offsetHeight);
      el.style.setProperty("--s", String(s));
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  // §5 — the computer's field: the first click (or focus) into a "back" bar empties it, then behaves as always.
  const desktopInputProps: FamilyBar["input"] = {
    ...bar.input,
    onPointerDown: () => {
      clearPrefill();
      bar.input.onPointerDown();
    },
    onFocus: () => {
      clearPrefill();
      bar.input.onFocus();
    },
  };

  const dark = !(bar.inUse && bar.exact === null);

  // S6 — the moment started from the full-screen search (only the phone's choice there leaves it open while the
  // moment runs): this screen is hidden at once under it, and never on view again.
  const underFull = leaving && full;

  return (
    <div ref={root} inert={leaving} className={`flex min-h-[100dvh] flex-col bg-white [--s:1] ${underFull ? "invisible" : ""}`}>
      {/* §3 — the results screen's top bar, the same markup, without the question row. */}
      <div ref={topBar} className="sticky top-0 z-30 border-b border-[#d8d3cb] bg-white">
        <div className={`${RESULTS_CONTAINER_CLASS} flex h-[52px] items-center gap-4 px-4 md:h-auto md:py-3`}>
          <Link href="/" onClick={onFresh} className="shrink-0 whitespace-nowrap text-[17px] font-extrabold text-[#221f1c]">
            {BRAND.name}
          </Link>
        </div>
      </div>

      {/* S4 §2 — everything under the top bar fades out when the search moment starts */}
      <div className={`${FADE} ${leaving ? "opacity-0" : "opacity-100"} flex flex-1 flex-col items-center overflow-x-clip px-[calc(16px*var(--s))] pb-[calc(16px_+_72px*var(--s))] md:px-[calc(48px*var(--s))] md:pb-0`}>
        {/* the air above: 40% of the free height */}
        <div aria-hidden className="min-h-[calc(16px*var(--s))] w-full grow-2 md:min-h-[calc(24px*var(--s))]" />

        <section className="relative isolate flex w-full max-w-[calc(390px*var(--s))] flex-col items-center text-center md:max-w-none">
          {/* the halo: a soft, very light radial gradient behind the group */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[calc(560px*var(--s))] w-[calc(560px*var(--s))] -translate-x-1/2 -translate-y-1/2 md:h-[calc(760px*var(--s))] md:w-[calc(1240px*var(--s))]"
            style={{ background: "radial-gradient(closest-side, rgba(236, 231, 223, 0.75), rgba(236, 231, 223, 0))" }}
          />

          <h1 className="m-0 text-[calc(34px*var(--s))] leading-[1.15] font-bold md:text-[calc(58px*var(--s))]" style={{ color: INK }}>
            {OPENING_TEXTS.headline.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h1>

          <p className="m-0 mt-[calc(12px*var(--s))] max-w-[calc(620px*var(--s))] text-[calc(17px*var(--s))] leading-[1.45] md:mt-[calc(20px*var(--s))] md:text-[calc(20px*var(--s))]" style={{ color: GREY }}>
            {OPENING_TEXTS.subline}
          </p>

          <div className="mt-[calc(24px*var(--s))] flex w-full justify-center md:mt-[calc(36px*var(--s))]">
            {/* the computer: the pill with "חפש" inside */}
            {/* S4 §2 — hidden at once when the moment starts: the moment draws its copy in this very place */}
            <div className={`hidden md:block ${leaving ? "invisible" : ""}`}>
              <ModelBar bar={bar} input={desktopInputProps} inputRef={desktopInput} pillRef={desktopPill} buttonRef={desktopButton} pending={pending} />
            </div>

            {/* the phone: a pill with no button; a touch opens the full-screen search */}
            <input
              ref={phoneField}
              type="text"
              readOnly
              value={bar.text}
              placeholder={OPENING_TEXTS.hintAlone}
              aria-label={OPENING_TEXTS.hintAlone}
              onClick={() => {
                openFull();
                bar.openList();
              }}
              className={`${leaving ? "invisible" : ""} h-[calc(56px*var(--s))] w-full cursor-pointer rounded-full bg-white px-[calc(22px*var(--s))] text-[calc(18px*var(--s))] text-[#221f1c] shadow-[0_4px_20px_rgba(34,31,28,0.12),0_1px_3px_rgba(34,31,28,0.08)] outline-none placeholder:text-[#8a837b] md:hidden`}
            />
          </div>

          {/* the three categories — not clickable */}
          <div className="mt-[calc(32px*var(--s))] grid w-full grid-cols-3 gap-[calc(8px*var(--s))] md:mt-[calc(40px*var(--s))] md:max-w-[calc(880px*var(--s))] md:gap-[calc(24px*var(--s))]">
            {CATEGORIES.map(({ code, line }) => (
              <div key={code} className="flex flex-col items-center">
                <span aria-hidden className="block h-[calc(3px*var(--s))] w-[calc(44px*var(--s))]" style={{ background: CATEGORY_COLOR[code] }} />
                <span className="mt-[calc(12px*var(--s))] text-[calc(16px*var(--s))] font-extrabold md:text-[calc(22px*var(--s))]" style={{ color: CATEGORY_COLOR[code] }}>
                  {CATEGORY_LABEL[code]}
                </span>
                <span className="mt-[calc(4px*var(--s))] text-[calc(14px*var(--s))] leading-snug md:text-[calc(17px*var(--s))]" style={{ color: GREY }}>
                  {line}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* the air below: 60% of the free height; its minimum is the gap a low window keeps before the tags */}
        <div aria-hidden className="min-h-[calc(32px*var(--s))] w-full grow-3 md:min-h-[calc(40px*var(--s))]" />

        {/* the tags — plain sentences, not clickable */}
        <ul className="m-0 flex list-none flex-col items-center gap-[calc(6px*var(--s))] p-0 md:mb-[calc(24px*var(--s))] md:flex-row md:gap-[calc(32px*var(--s))]">
          {OPENING_TEXTS.tags.map((tag) => (
            <li key={tag} className="flex items-center gap-[calc(6px*var(--s))] text-[calc(15px*var(--s))]" style={{ color: GREY }}>
              <Check />
              {tag}
            </li>
          ))}
        </ul>
      </div>

      {/* §4 — the phone's "חפש": a wide pill fixed at the bottom, above the browser's bar; black on arrival. */}
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={bar.submit}
        className={`${FADE} ${leaving ? "opacity-0" : "opacity-100"} fixed bottom-4 left-1/2 z-10 flex h-[calc(56px*var(--s))] -translate-x-1/2 items-center justify-center gap-2 rounded-full text-[calc(18px*var(--s))] font-bold text-white disabled:bg-neutral-300 md:hidden ${dark ? "bg-[#221f1c]" : "bg-neutral-300"}`}
        style={{ width: "calc(min(100vw, 390px * var(--s)) - 32px * var(--s))" }}
      >
        {pending && <Spinner />}
        <span>{OPENING_TEXTS.search}</span>
      </button>

      {/* §4 — the full-screen search: no "new search" helper line here */}
      {full && <FullScreenSearch bar={bar} inputRef={phoneInput} disabled={pending} leaving={underFull} onCancel={cancelFull} />}
    </div>
  );
}

/** The tags' check, in the verified green. */
function Check() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-[calc(16px*var(--s))] w-[calc(16px*var(--s))] shrink-0" fill="none" stroke={CHECK_GREEN} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}
