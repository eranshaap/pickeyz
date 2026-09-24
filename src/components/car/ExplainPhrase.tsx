"use client";

// The explanation phrase and its window (BRIEF Run 8c §2) — ONE component for every dotted phrase on the
// site, extracted whole from OwnershipTimeline.tsx.
//
// It renders the phrase as a real <button> styled as text — the font, size, weight and colour inherited from
// the label around it, the only mark a thin dotted underline — and the window under it, and it owns ALL of
// the open/close behaviour. The props are the phrase's text and the window's content, so a second phrase
// needs nothing but a second call: Run 9's "מעברי סוחר" window is this component with other children, and it
// gets every rule below for free.
//
// THE POINTER ACTUALLY USED DECIDES, PER EVENT (§2.2) — `pointerType` on the event itself, never a
// screen-size guess, so a touchscreen laptop works both ways:
//
//   MOUSE     the pointer RESTING on the phrase opens the window after 150 ms; a pointer merely crossing the
//             phrase on its way elsewhere opens nothing, because the timer is cleared when it leaves. It
//             stays open while the pointer is on the phrase OR inside the window — the walk down from the
//             phrase into the window cancels the close, so the text can be read and selected — and leaving
//             both closes it after 200 ms, cancelled if the pointer comes back within that time. A mouse
//             CLICK opens it at once if it is closed and never closes it: with a mouse the window belongs to
//             the hover, and a click that shut it would fight the pointer still resting on the phrase.
//   TOUCH     as Run 8b left it: a tap on the phrase opens and closes it, a tap anywhere outside the phrase
//             and the window closes it.
//   KEYBOARD  Tab onto the phrase opens it, focus leaving both the phrase and the window closes it, and Esc
//             closes it and keeps focus on the phrase.
//
// A FOCUS THAT ARRIVES WHILE A POINTER IS DOWN ON THE PHRASE IS THE POINTER'S, NOT THE KEYBOARD'S. That is
// the one thing that tells Tab apart from a click or a tap, and it is what `pointer` below is for: such a
// focus neither opens the window (a tap must reach the toggle, and a mouse click has its own rule) nor holds
// it open once the pointer leaves (§2.2). `heldByKeyboard` is set only by a focus with no pointer down, and
// only it makes the mouse leaving the phrase leave the window standing — and only it makes a focus that
// leaves close the window, so that a mouse selecting the window's text (which takes the focus off the button
// and gives it to nothing) does not close what it is trying to read.
//
// Run 8b's outside-`pointerdown` and Esc listeners stay, and stay as they were: they exist ONLY while the
// window is open, and they are scoped to THIS COPY through the root ref — the car page renders the axis twice
// (CarPageView.tsx, phone and desktop), so each copy handles only its own window and can neither close nor
// reopen the other's. Both timers are cleared on close and on unmount.
//
// §2.3 — the window's text, its place under the phrase, its look, and the phrase's font, colour and dotted
// underline are exactly what they were in OwnershipTimeline.tsx. Nothing here is a decision of its own.

import { useEffect, useRef, useState } from "react";

const DARK = "#221f1c";

// §2.2 — the two hover delays, off the board.
const OPEN_AFTER_MS = 150;
const CLOSE_AFTER_MS = 200;

type Timer = ReturnType<typeof setTimeout> | null;

/** Both timers are stopped through this one function, so "cleared on close and on unmount" is one line each. */
function stop(t: { current: Timer }): void {
  if (t.current === null) return;
  clearTimeout(t.current);
  t.current = null;
}

export default function ExplainPhrase({
  phrase,
  children,
}: {
  /** The dotted phrase itself, as the label spells it. */
  phrase: string;
  /** The window's content. null / undefined = there is no explanation to show, and no window is rendered. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const root = useRef<HTMLSpanElement>(null);
  const phraseEl = useRef<HTMLButtonElement>(null);

  // §2.2 — the two timers: one per direction, each its own ref, both stopped by stop() above.
  const openTimer = useRef<Timer>(null);
  const closeTimer = useRef<Timer>(null);

  // The pointer that is currently down on the phrase, read from the event: "mouse", "touch", "pen" — and
  // null for a keyboard activation, which has no pointer at all.
  const pointer = useRef<string | null>(null);

  // Whether the window is being held open by the keyboard's focus rather than by a pointer.
  const heldByKeyboard = useRef(false);

  function close() {
    stop(openTimer);
    stop(closeTimer);
    setOpen(false);
  }

  function openAtOnce() {
    stop(openTimer);
    stop(closeTimer);
    setOpen(true);
  }

  /** Mouse only: the pointer came to rest on the phrase, or back inside the window. */
  function pointerIn(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    stop(closeTimer); // it came back inside the 200 ms, so the close is off
    if (open || openTimer.current !== null) return;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      setOpen(true);
    }, OPEN_AFTER_MS);
  }

  /** Mouse only: the pointer left the phrase, or left the window. */
  function pointerOut(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    stop(openTimer); // a pointer that only crossed the phrase opens nothing
    if (heldByKeyboard.current) return; // the keyboard is holding it open; the mouse does not take it away
    stop(closeTimer);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, CLOSE_AFTER_MS);
  }

  function onClick() {
    const by = pointer.current;
    pointer.current = null;
    if (by === "mouse") {
      if (!open) openAtOnce(); // §2.2 — a mouse click opens it at once and NEVER closes it
      return;
    }
    if (open) close(); // touch, and a keyboard Enter / Space: the toggle, exactly as in Run 8b
    else openAtOnce();
  }

  /** Enter and Space activate a button: dropping the pointer here is what makes that click the keyboard's. */
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") pointer.current = null;
  }

  function onFocus() {
    if (pointer.current !== null) return; // the pointer's focus, not the keyboard's — see the head comment
    heldByKeyboard.current = true;
    openAtOnce(); // §2.2 — Tab onto the phrase opens it
  }

  /** §2.2 — focus leaving both the phrase and the window closes it, when it was focus holding it open. */
  function onBlur(e: React.FocusEvent<HTMLSpanElement>) {
    if (!heldByKeyboard.current) return;
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    heldByKeyboard.current = false;
    close();
  }

  // Run 8b §4, unchanged in what it does: WHILE THE WINDOW IS OPEN, a click or tap anywhere outside this
  // copy's phrase and window closes it (`pointerdown`, so the phone's tap counts and so does a drag that
  // starts outside), and Esc closes it. A pointerdown INSIDE falls through to the button's own onClick, which
  // is what keeps the touch toggle from re-opening what it just shut.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (root.current?.contains(target) === true) return;
      stop(openTimer);
      stop(closeTimer);
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // "keeps focus on the phrase": when a reader pressed Esc from the keyboard the focus is already there,
      // so this only makes sure of it. When the window was opened by hover and the focus is somewhere else
      // entirely, the focus is NOT moved — moving it would fire onFocus and re-open what Esc just closed.
      const inside = root.current?.contains(document.activeElement) === true;
      heldByKeyboard.current = false;
      stop(openTimer);
      stop(closeTimer);
      setOpen(false);
      if (inside) phraseEl.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // §2.2 — and on unmount: a card that leaves the page takes its timers with it.
  useEffect(
    () => () => {
      stop(openTimer);
      stop(closeTimer);
    },
    [],
  );

  return (
    <span ref={root} className="relative inline-block" onBlur={onBlur}>
      {/* Run 8 §4.3, unchanged — a real button STYLED AS TEXT: the font, size, weight and colour are the
          label's own (inherited), and the only mark it carries is the thin dotted underline. The rest of the
          label carries none. Click / Enter / Space all reach it, and `aria-expanded` says which way it is. */}
      <button
        ref={phraseEl}
        type="button"
        aria-expanded={open}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onPointerDown={(e) => {
          pointer.current = e.pointerType;
        }}
        onPointerEnter={pointerIn}
        onPointerLeave={pointerOut}
        className="cursor-pointer border-0 bg-transparent p-0"
        style={{
          font: "inherit",
          color: "inherit",
          textDecoration: "underline dotted",
          textDecorationThickness: 1,
          textUnderlineOffset: 3,
          textDecorationColor: "currentColor",
        }}
      >
        {phrase}
      </button>

      {/* the window — §2.3: the same place under the phrase and the same look it has always had. It carries
          the mouse handlers too, which is what lets the pointer walk down into it and read. */}
      {open && children !== null && children !== undefined && (
        <p
          className="absolute z-10 mt-1 w-64 rounded-lg border border-[#d8d3cb] bg-white p-3 text-[13px] font-normal shadow-lg"
          style={{ color: DARK, top: "100%", insetInlineStart: 0 }}
          onPointerEnter={pointerIn}
          onPointerLeave={pointerOut}
        >
          {children}
        </p>
      )}
    </span>
  );
}
