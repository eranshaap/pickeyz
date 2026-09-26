"use client";

// The filters window (BRIEF Run 2, Days 24–25, §3) — THE WINDOW'S CHROME, AND ONLY THE CHROME. What is inside
// it is FilterPanel.tsx, unchanged in logic, look and labels: the four groups, the price fields, the chips,
// the counters and the "עדכן · N" button. This file draws the frame around them and owns opening, closing and
// the fade; it decides nothing about a filter and reads no row.
//
// IT REPLACES TWO THINGS AT ONCE (§3.11): the desktop's 320 px side panel that never closed, and the phone's
// sheet that slid over the results. Filters are now edited in a window on both devices — centred and 780 px wide
// from 900 px of window width up, the whole screen below it — and the results dim only while it is open (§3.9).
//
// WHY A MODAL <dialog> (§3.1). The platform does the four things a window like this has to do, and does them
// right: it makes the page behind INERT (no tabbing into the results, no click through the dim), it delivers
// the Escape key as this element's own `cancel` event, it moves focus into the window and returns it to the
// control that opened it on close, and it puts the window in the TOP LAYER — so no z-index of the sticky white
// bar or of the question row's editor can ever come out in front of it. A hand-rolled div would need all four
// re-implemented and would get the focus return wrong.
//
// WHAT THE PLATFORM DOES NOT DO, and this file does:
//   the fade        opacity only, WINDOW_FADE_MS each way, the dialog and its backdrop together (§3.7)
//   the scroll lock `overflow: hidden` on <html> for the window's lifetime, so the page behind neither scrolls
//                   nor shifts; globals.css reserves the scrollbar's gutter at all times so that hiding it
//                   cannot widen the page (§3.8)
//
// WHAT IT DELIBERATELY DOES NOT DO (§3.6): close on a click on the dimmed area. A `<dialog>` does not do that
// by itself and no handler is added — a stray click beside the window must not throw a half-built question
// away. The close button, Escape and the browser's back are the three ways out, and all three are one cancel.

import { useEffect, useRef, useState } from "react";
import { WINDOW_FADE_MS } from "@/lib/display/timing";

const TITLE = "פילטרים";
const CLOSE = "סגור";

const DARK = "#221f1c"; // the site's black — the title
const LABEL_GREY = "#665f58"; // the label grey — the close button, black on hover
const HAIRLINE = "#e6e2db"; // §3.4 — the site's hairline, the one CarRow.tsx draws between rows

/**
 * §3.7 / §6.2 — the fade's length is spelled twice OF NECESSITY: WINDOW_FADE_MS is the number the close path
 * waits, and Tailwind reads a class name as a literal and cannot be handed `duration-[${WINDOW_FADE_MS}ms]`.
 * The map is indexed BY the constant, so changing WINDOW_FADE_MS without a class to match stops the compile.
 */
const FADE_DURATION: Record<typeof WINDOW_FADE_MS, string> = { 150: "duration-150 backdrop:duration-150" };

/** Opacity, both directions, nothing else — no slide, no scale (§3.7). */
const FADE = `transition-opacity ease-out backdrop:transition-opacity backdrop:ease-out ${FADE_DURATION[WINDOW_FADE_MS]} motion-reduce:transition-none backdrop:motion-reduce:transition-none`;

/**
 * §3.8 — puts <html>'s inline `overflow` back as it was. `held.current` is what it was before the lock, and
 * null when the page is not locked at all, so calling this twice is safe and calling it on an unlocked page
 * does nothing. A module function and not a closure: the effects below take it as a plain dependency-free call.
 */
function unlockPage(held: { current: string | null }): void {
  if (held.current === null) return;
  document.documentElement.style.overflow = held.current;
  held.current = null;
}

export default function FiltersWindow({ open, onCancel, children }: { open: boolean; onCancel: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);

  /** The body is mounted: while the window is open, and through the closing fade (§3.7 — then it unmounts). */
  const [mounted, setMounted] = useState(false);

  /** §3.8 — what <html>'s inline `overflow` was before the lock; null = the page is not locked. */
  const locked = useRef<string | null>(null);

  // THE ONE OPEN/CLOSE SEQUENCE (§3.7), and every close path in §3.6 and §4.1 goes down it, because every one
  // of them does the same single thing: it sets `open` to false.
  //   open   showModal(), lock the page, mount the body, and only THEN the fade's attribute
  //   close  drop the attribute, wait WINDOW_FADE_MS, then close(), unlock the page, unmount the body
  //
  // THE FADE IS AN ATTRIBUTE ON THE ELEMENT (`data-shown`) AND NOT A PIECE OF REACT STATE, for two reasons: a
  // ::backdrop cannot be styled from an inline style and so has to be reached by a selector, and the close
  // begins in this effect's body, where setting state is a cascading render (and this project's lint says so).
  // A DOM write is what an effect is for.
  //
  // TWO FRAMES ON THE WAY IN, not one: the body is laid out on the first and the fade starts on the second, so
  // the only thing that moves while the window appears is the opacity (§3.7) — an empty box for a frame would
  // otherwise grow to its real height with the fade under way.
  useEffect(() => {
    const el = dialog.current;
    if (el === null) return;

    if (open) {
      if (!el.open) el.showModal();
      // §3.8 — `overflow: hidden` on the root does NOT move the scroll position, so the place the user was
      // reading is still there when the window is cancelled; after "עדכן" the screen puts the page at the top
      // itself (§4.1).
      if (locked.current === null) {
        locked.current = document.documentElement.style.overflow;
        document.documentElement.style.overflow = "hidden";
      }
      let second = 0;
      const first = requestAnimationFrame(() => {
        setMounted(true);
        second = requestAnimationFrame(() => {
          el.dataset.shown = "true";
        });
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }

    if (!el.open) return;
    delete el.dataset.shown;
    const timer = setTimeout(() => {
      el.close();
      unlockPage(locked);
      setMounted(false);
    }, WINDOW_FADE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // "עדכן" closes the window and navigates in the same click (§4.1), so the new screen can commit BEFORE the
  // fade's timer fires and this component can go with the old one. The lock is the PAGE'S, not the window's:
  // it has to come off whatever takes the window away.
  useEffect(() => () => unlockPage(locked), []);

  return (
    <dialog
      ref={dialog}
      aria-label={TITLE}
      // §3.6 — Escape arrives here as the dialog's own `cancel` event. It is prevented so the platform cannot
      // close the element behind our back: the fade has to play and the window's history entry has to be
      // popped, which is exactly what the one close path does.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className={[
        // the UA's dialog styles reset (§3.4): its border, its padding and its own max-width
        "m-auto max-h-none max-w-none border-0 p-0",
        // `flex` only while the element is open — an unconditional display would beat the UA's
        // `dialog:not([open]) { display: none }` (author styles outrank the UA sheet) and the window would
        // stand there on every screen.
        "[&[open]]:flex flex-col overflow-hidden bg-white",
        // §3.5 — the phone (< 900): the whole screen, no radius, no shadow
        "fixed inset-0 h-full w-full rounded-none",
        // §3.4 — the desktop (≥ 900): 780 wide, centred on both axes by the platform's own `inset: 0` + the
        // `m-auto` above; at most the window's height less 96, the recommendation cards' own radius
        // (`rounded-xl`, PickCards.tsx), no border.
        "md:h-auto md:max-h-[calc(100vh-96px)] md:w-[780px] md:rounded-xl md:shadow-[0_16px_48px_rgba(34,31,28,0.25)]",
        // §3.4 — the dim: the results present, not readable
        "backdrop:bg-[rgba(34,31,28,0.55)]",
        FADE,
        // §3.7 — the two ends of the fade. `data-shown` is written by the effect above, one frame after the
        // window is on screen, and dropped at the start of every close.
        "opacity-0 backdrop:opacity-0 [&[data-shown]]:opacity-100 [&[data-shown]]:backdrop:opacity-100",
      ].join(" ")}
    >
      {mounted && (
        <>
          {/* §3.1 — the header is always visible; direction is inherited (rtl), so the title is at the start
              side and the close button at the end side without either being placed by hand. §3.4 / §3.5 — 60
              tall on the desktop, 56 on the phone, padding 0 24, a bottom hairline. */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-6 md:h-[60px]" style={{ borderColor: HAIRLINE }}>
            <h2 className="text-[20px]" style={{ margin: 0, fontWeight: 700, color: DARK }}>
              {TITLE}
            </h2>
            <button
              type="button"
              aria-label={CLOSE}
              onClick={onCancel}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:text-[#221f1c]"
              style={{ color: LABEL_GREY }}
            >
              <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none">
                <path d="M4.5 4.5 15.5 15.5M15.5 4.5 4.5 15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* The body and the footer are FilterPanel's own two regions: the groups in a scrolling box and the
              "עדכן · N" button under it. Only the body scrolls; the footer stays visible (§3.1). */}
          {children}
        </>
      )}
    </dialog>
  );
}
