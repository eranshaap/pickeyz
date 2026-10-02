"use client";

// The contact window (BRIEF Day 19b Run 11b §4.3) — THE CHROME AND THE THREE VIEWS, and nothing else. It
// decides no rule: the days and the hours are schedule.ts's, the errors are validate.ts's, every word is
// texts.ts's, and the state is ContactProvider's. This file places them.
//
// WHY A MODAL <dialog>, and the pattern copied from FiltersWindow.tsx (not mounted — the two windows share
// nothing but the platform): the page behind goes inert, Escape arrives as this element's own `cancel` event,
// focus moves in and returns to the button that opened it, and the window sits in the TOP LAYER, so the phone
// bar's z-20 can never come out in front of it. The fade (opacity only, WINDOW_FADE_MS each way, the dialog
// and its backdrop together) and the scroll lock on <html> are this file's, as they are there.
//
// ONE THING IT DOES THAT THE FILTERS WINDOW DELIBERATELY DOES NOT: it CLOSES ON A CLICK OUTSIDE. The document
// says so — "לחיצה מחוץ לחלון … היא ביטול". The dialog element carries no padding and the content sits in one
// inner box that fills it, so a `pointerdown` whose target is the dialog element ITSELF can only be the
// backdrop, and that is the whole test.
//
// IT DRAWS THE VIEW IT IS GIVEN, WHICH IS NOT ALWAYS THE MACHINE'S VIEW. `open` says whether the window is
// up; `view` says what to draw. While the window fades out the machine is already `closed`, and a window that
// fades out empty would be a flash of white — so the provider keeps handing the view it closed from until the
// fade is over (ContactProvider, `drawn`).
//
// Geometry and type are Tailwind; the page colour, its tint and the three board colours are inline styles,
// exactly as the car page paints itself.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { WINDOW_FADE_MS } from "@/lib/display/timing";
import { Spinner } from "@/components/search/FilterPanel";
import { israelNow, type DayOption } from "@/lib/contact/schedule";
import { firstErrorField, type FormErrors, type FormInput } from "@/lib/contact/validate";
import {
  CALLBACK,
  CALLBACK_NOTE,
  CLOSE,
  CLOSE_BUTTON,
  ERROR_TEXT,
  GONE_LINE,
  GONE_TITLE,
  INSPECTION_NOTE,
  NAME,
  NEW_REQUEST,
  PHONE,
  SEND,
  SENT_TITLE,
  VISIT,
  VISIT_NOTE,
  WHAT_SUITS,
  WHICH_DAY,
  WHICH_HOUR,
  WINDOW_TITLE,
  callbackFollowUp,
  carLine,
  dayChipLabel,
  dayLabel,
  displayPhone,
  hourLabel,
  privacyLine,
  visitFollowUp,
  visitLineParts,
} from "@/lib/contact/texts";
import type { ContactCar, ContactField, OpenContactView } from "./ContactProvider";
import type { SentRequest } from "./CarPageView";
import CarTitle from "./CarTitle";
import Photo from "./Photo";

// ---------------------------------------------------------------------------
// the palette — the site's, plus the boards' three
// ---------------------------------------------------------------------------

const DARK = "#221f1c"; // the site's black
const GREY = "#665f58"; // the label grey
const HAIRLINE = "#d8d3cb"; // the header's and the bar's rule, and an unselected control's edge
const INPUT_BORDER = "#c9c3b9"; // an input's edge, and an unselected radio circle's
const RED = "#b3261e"; // the boards' error red — the one colour the site had no token for
const CLOSED_CHIP = { border: "#e4e0d9", background: "#f4f2ee", text: "#a39d95" }; // a Saturday's chip

/** The phone board's table: the tint behind a selected option, one per page colour. */
const TINT: Record<string, string> = {
  "#6e5118": "#f8f5ee",
  "#6b1f31": "#f9f1f2",
  "#1b3f4b": "#eef3f5",
  "#303577": "#f1f2f9",
  "#221f1c": "#f4f2ee",
};
const DEFAULT_TINT = "#f4f2ee";

/**
 * The fade's length is spelled twice OF NECESSITY (the same reason as FiltersWindow §3.7): WINDOW_FADE_MS is
 * what the close path waits, and Tailwind reads a class name as a literal. The map is indexed BY the
 * constant, so moving WINDOW_FADE_MS without a class to match stops the compile.
 */
const FADE_DURATION: Record<typeof WINDOW_FADE_MS, string> = { 150: "duration-150 backdrop:duration-150" };

const FADE = `transition-opacity ease-out backdrop:transition-opacity backdrop:ease-out ${FADE_DURATION[WINDOW_FADE_MS]} motion-reduce:transition-none backdrop:motion-reduce:transition-none`;

/** The bottom bar on the phone (72, a top rule, padding 0 16); on the desktop it is the footer, unboxed. */
const BAR = "flex h-[72px] shrink-0 items-center border-t border-[#d8d3cb] px-4 md:h-auto md:border-t-0 md:px-0";

/** The filled button: the bar's full width on the phone, 48 × (0 32) on the desktop. */
const FILLED = "h-[46px] w-full shrink-0 rounded-lg text-[16px] font-bold text-white md:h-12 md:w-auto md:px-8";

/** A chip — a day or an hour. Height 36, radius 999, 14px, never wrapping. */
const CHIP = "h-9 shrink-0 whitespace-nowrap rounded-full px-2.5 text-[14px] tabular-nums disabled:cursor-default";

/** Puts <html>'s inline `overflow` back as it was (FiltersWindow §3.8 — the same one function). */
function unlockPage(held: { current: string | null }): void {
  if (held.current === null) return;
  document.documentElement.style.overflow = held.current;
  held.current = null;
}

// ---------------------------------------------------------------------------
// the pieces
// ---------------------------------------------------------------------------

/** FiltersWindow's cross, at the two sizes the boards draw: 44 on the phone, 36 on the desktop. */
function CloseCross({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={CLOSE}
      onClick={onClick}
      // The grey and the black are CLASSES and not an inline colour: an inline `color` outranks every class,
      // so the hover the board asks for would never arrive.
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#665f58] hover:text-[#221f1c] md:h-9 md:w-9"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none">
        <path d="M4.5 4.5 15.5 15.5M15.5 4.5 4.5 15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** The confirmation's check in a circle, and the gone view's info mark. 24 on the desktop, 22 on the phone. */
function TitleIcon({ kind }: { kind: "sent" | "gone" }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px] shrink-0 md:h-6 md:w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9.5" />
      {kind === "sent" ? (
        <path d="M7.8 12.3l2.8 2.8 5.6-5.8" />
      ) : (
        <>
          <path d="M12 11v5.5" />
          <path d="M12 7.6v.2" />
        </>
      )}
    </svg>
  );
}

/**
 * The car, once, at the top of every view: the photo (88×58, 72×48 on the phone), the name and the one line
 * under it. The block ends on a rule. The gone view dims the photo to 0.6 and changes nothing else.
 */
function CarBlock({ car, sellerName, dim }: { car: ContactCar; sellerName: string; dim: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[#d8d3cb] pb-4 md:pb-[14px]">
      <Photo
        src={car.imageSrc}
        className={`h-12 w-[72px] shrink-0 rounded-md md:h-[58px] md:w-[88px] ${dim ? "opacity-60" : ""}`}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-[16px] font-bold" style={{ color: DARK }}>
          <CarTitle model={car.model} year={car.year} />
        </div>
        <div className="text-[13px] tabular-nums md:text-[14px]" style={{ color: GREY }}>
          {carLine(car.price, sellerName, car.place)}
        </div>
      </div>
    </div>
  );
}

/**
 * A heading, and — after a click on "שלח" with that field empty — its note IN THE SAME ROW (§4.3): nothing
 * moves, because the row the note joins is a row that is already there.
 */
function HeadingRow({ text, error }: { text: string; error?: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-[14px] font-bold" style={{ color: DARK }}>
        {text}
      </span>
      {error !== undefined && (
        <span role="alert" className="text-[13px] font-semibold" style={{ color: RED }}>
          {error}
        </span>
      )}
    </div>
  );
}

/** A day's or an hour's chip. A closed day is disabled and carries the boards' three closed-day colours. */
function Chip({
  label,
  selected,
  closed = false,
  color,
  onClick,
}: {
  label: string;
  selected: boolean;
  closed?: boolean;
  color: string;
  onClick: () => void;
}) {
  const style = closed
    ? { border: `1px solid ${CLOSED_CHIP.border}`, background: CLOSED_CHIP.background, color: CLOSED_CHIP.text }
    : selected
      ? { border: `1px solid ${color}`, background: color, color: "#ffffff", fontWeight: 600 }
      : { border: `1px solid ${HAIRLINE}`, background: "#ffffff", color: DARK };
  return (
    <button type="button" aria-pressed={selected} disabled={closed} onClick={onClick} className={CHIP} style={style}>
      {label}
    </button>
  );
}

/** One of the two option cards: a radio circle and two lines, the whole card the control. */
function OptionCard({
  selected,
  title,
  note,
  color,
  tint,
  onClick,
}: {
  selected: boolean;
  title: string;
  note: string;
  color: string;
  tint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-right"
      style={
        selected
          ? { border: `1px solid ${color}`, boxShadow: `inset 0 0 0 1px ${color}`, background: tint }
          : { border: `1px solid ${HAIRLINE}`, background: "#ffffff" }
      }
    >
      <span
        aria-hidden
        className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
        style={{ border: `2px solid ${selected ? color : INPUT_BORDER}` }}
      >
        {selected && <span className="block h-2 w-2 rounded-full" style={{ background: color }} />}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-[16px] font-bold" style={{ color: DARK }}>
          {title}
        </span>
        <span className="text-[13px]" style={{ color: GREY }}>
          {note}
        </span>
      </span>
    </button>
  );
}

/**
 * One of the two text fields. The label row holds the label and the field's note; the input in error takes
 * `aria-invalid` and the red frame, and loses both the moment it is valid again (§4.3).
 *
 * `blockRef` is Run 12 §2.3's: the whole block — the label row and the input — is what the window scrolls
 * to when this is the first field a failed click on "שלח" found empty.
 */
function TextField({
  field,
  label,
  value,
  error,
  type,
  ltr = false,
  autoComplete,
  blockRef,
  onChange,
  onFocus,
}: {
  field: ContactField;
  label: string;
  value: string;
  error?: "missing" | "invalid";
  type: string;
  ltr?: boolean;
  autoComplete: string;
  blockRef: RefObject<HTMLDivElement | null>;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  const id = `fc-contact-${field}`;
  const bad = error !== undefined;
  return (
    <div ref={blockRef} className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <label htmlFor={id} className="text-[13px] font-semibold" style={{ color: DARK }}>
          {label}
        </label>
        {bad && (
          <span role="alert" className="text-[13px] font-semibold" style={{ color: RED }}>
            {ERROR_TEXT[field][error]}
          </span>
        )}
      </div>
      <input
        id={id}
        type={type}
        dir={ltr ? "ltr" : undefined}
        autoComplete={autoComplete}
        value={value}
        aria-invalid={bad ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        className={`h-11 rounded-lg px-3.5 text-[16px] ${ltr ? "text-right" : ""}`}
        style={{
          border: `1px solid ${bad ? RED : INPUT_BORDER}`,
          background: "#ffffff",
          color: DARK,
          boxShadow: bad ? `inset 0 0 0 1px ${RED}` : undefined,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// the window
// ---------------------------------------------------------------------------

export default function ContactWindow({
  open,
  view,
  form,
  days,
  errors,
  errorClick,
  failLine,
  sent,
  color,
  car,
  sellerName,
  backWord,
  honeypotRef,
  onKind,
  onDay,
  onHour,
  onField,
  onFieldFocus,
  onSend,
  onNewRequest,
  onClose,
  onLeave,
}: {
  open: boolean;
  view: OpenContactView;
  form: FormInput;
  days: DayOption[];
  errors: FormErrors;
  /** §2.2 — how many clicks on "שלח" have failed the validation. A counter, never reset: see the effect below. */
  errorClick: number;
  failLine: string | null;
  sent: SentRequest | null;
  color: string;
  car: ContactCar;
  sellerName: string;
  backWord: string;
  honeypotRef: RefObject<HTMLInputElement | null>;
  onKind: (kind: "visit" | "callback") => void;
  onDay: (day: string) => void;
  onHour: (hour: number) => void;
  onField: (field: ContactField, value: string) => void;
  onFieldFocus: () => void;
  onSend: () => Promise<void>;
  onNewRequest: () => void;
  onClose: (how: "button" | "back") => void;
  onLeave: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  /** The content is mounted while the window is open, and through the closing fade — then it unmounts. */
  const [mounted, setMounted] = useState(false);

  /** What <html>'s inline `overflow` was before the lock; null = the page is not locked. */
  const locked = useRef<string | null>(null);

  // Run 12 §2.3 — the four field blocks, in the screen's order. Each is the whole block, heading row and
  // all, because the note the buyer has to read sits in that heading row.
  const dayBlock = useRef<HTMLDivElement>(null);
  const hourBlock = useRef<HTMLDivElement>(null);
  const nameBlock = useRef<HTMLDivElement>(null);
  const phoneBlock = useRef<HTMLDivElement>(null);

  /** The errorClick this component came up on. Set ON MOUNT: see the effect below. */
  const handled = useRef(errorClick);

  /** Run 12 §3.2 — the scroll box, and whether anything is still below its visible area. */
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  // THE ONE OPEN/CLOSE SEQUENCE, FiltersWindow's (§3.7), and every close path goes down it because every one
  // of them does the same single thing: it sets `open` to false.
  //   open   showModal(), lock the page, mount the content, and only THEN the fade's attribute
  //   close  drop the attribute, wait WINDOW_FADE_MS, then close(), unlock the page, unmount the content
  // Two frames on the way in: the content is laid out on the first and the fade starts on the second, so the
  // only thing that moves while the window appears is the opacity.
  useEffect(() => {
    const el = dialog.current;
    if (el === null) return;

    if (open) {
      if (!el.open) el.showModal();
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

  // The gone view's button navigates away in the same click, so this component can go with the old page
  // before the fade's timer fires. The lock is the PAGE'S: it has to come off whatever takes the window away.
  useEffect(() => () => unlockPage(locked), []);

  // Run 12 §2.3 — AFTER A CLICK ON "שלח" THAT FAILED, THE WINDOW SCROLLS TO THE FIRST MISSING DETAIL, so
  // that its note is seen even when it sits below the visible area. The notes themselves appear where they
  // already live (§4.3) and nothing jumps; this is the one deliberate movement, after them.
  //
  // WHAT MAKES IT RUN IS THE COUNTER, NOT THE ERRORS. Two clicks that find the very same missing fields
  // leave `errors` identical, and the second click has to scroll as the first one did. `handled` carries the
  // counter this component came up on and is moved forward only here, so nothing but a NEW failed click ever
  // scrolls: an opening leaves the counter where it is, and the window that comes back up stays where the
  // buyer left it. Nothing here fires an event.
  //
  // `block: "nearest"` moves the scroll box only as far as it must, and not at all when the block is
  // already fully in view: on a tall desktop screen nothing moves.
  useEffect(() => {
    if (errorClick === handled.current) return;
    handled.current = errorClick;
    const field = firstErrorField(errors);
    if (field === null) return;
    const el = { day: dayBlock, hour: hourBlock, name: nameBlock, phone: phoneBlock }[field].current;
    if (el === null) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [errorClick]); // eslint-disable-line react-hooks/exhaustive-deps -- the counter alone decides; `errors` is read at that moment

  /** §3.2 — is anything left below the visible area? One pixel of slack, for the sub-pixel heights. */
  const measure = useCallback(() => {
    const el = box.current;
    setMore(el !== null && el.scrollHeight - el.scrollTop - el.clientHeight > 1);
  }, []);

  // The scroll and the window's resize. Both are put on with the mounted content and taken off with it, so
  // nothing listens while the window is closed; the scroll listener is passive because it only reads.
  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [mounted, measure]);

  // AFTER EVERY RENDER, with no dependency list: a chosen day adds the hours, a kind switch removes them
  // and a view replaces everything, and not one of those is a scroll or a resize. setMore with the value it
  // already holds re-renders nothing, so a measurement that finds no change costs one read.
  //
  // The ResizeObserver is re-pointed here too, over the box and everything in it: a size that changes with
  // no render behind it is the one thing this effect cannot see by itself.
  useEffect(() => {
    measure();
    const el = box.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  });

  const sending = view === "sending";
  const isForm = view === "form" || sending;
  const tint = TINT[color] ?? DEFAULT_TINT;

  // The chosen day's own hours — the very list hoursFor() returned when the window opened. Asking hoursFor()
  // again here would need a second `new Date()`, minutes later than the row on screen, and could offer an
  // hour the row does not.
  const chosenDay = form.day === null ? undefined : days.find((d) => d.day === form.day);

  // The confirmation reads the slot back out of the stored instant, in Israel — the browser's own zone plays
  // no part in what it says.
  const slot = sent !== null && sent.visitAt !== null ? israelNow(new Date(sent.visitAt)) : null;
  const visitLine = slot === null ? null : visitLineParts(dayLabel(slot.day), slot.hour);
  const followUp =
    sent === null
      ? null
      : sent.kind === "visit"
        ? visitFollowUp(sellerName, displayPhone(sent.phone))
        : callbackFollowUp(sellerName, displayPhone(sent.phone));

  const title = view === "sent" ? SENT_TITLE : view === "gone" ? GONE_TITLE : WINDOW_TITLE;

  const sendButton = (
    <button
      type="button"
      onClick={() => void onSend()}
      disabled={sending}
      aria-busy={sending}
      className={`flex items-center justify-center gap-2 ${FILLED} ${sending ? "opacity-60" : ""}`}
      style={{ background: color }}
    >
      {sending && <Spinner />}
      {SEND}
    </button>
  );

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      // Escape arrives here as the dialog's own `cancel` event. It is prevented so the platform cannot close
      // the element behind our back: the fade has to play and the window's history entry has to be popped,
      // which is what the one close path does. Mid-send it is refused there, and does nothing.
      onCancel={(e) => {
        e.preventDefault();
        onClose("button");
      }}
      // The click outside. The content fills the dialog, so the element itself can only be the backdrop.
      onPointerDown={(e) => {
        if (e.target === dialog.current) onClose("button");
      }}
      className={[
        // the UA's dialog styles reset: its border, its padding and its own max-width
        "m-auto max-h-none max-w-none border-0 p-0",
        // `flex` only while the element is open — an unconditional display would beat the UA's
        // `dialog:not([open]) { display: none }` and the window would stand there on every screen.
        "[&[open]]:flex flex-col overflow-hidden bg-white",
        // the phone (< 900): the whole screen, no radius, no shadow — every view, unchanged
        "fixed inset-0 h-full w-full rounded-none",
        // the desktop (≥ 900): 720 wide, centred across by the platform's `inset: 0` and the `m-auto` above,
        // at most the VISIBLE height less 80 — `dvh`, not `vh`: on the iPad, Safari's `100vh` is the height
        // with the toolbar hidden, taller than what is on screen, which is what made the box touch both edges.
        "md:max-h-[calc(100dvh-80px)] md:w-[720px] md:rounded-[14px] md:shadow-[0_20px_48px_rgba(34,31,28,0.24)]",
        // Run 12c §1 — THE DESKTOP'S HEIGHT AND THE FORM'S PLACE: plain positioning, the height from the
        // content, and NO INTRINSIC-SIZE KEYWORD anywhere in it.
        //
        // With `top` set and both `bottom` and `height` auto, the height is the content's and the max-height
        // above then clamps it (CSS 2.1 §10.6.4, rule 3). Run 12b asked for the same height with
        // `height: fit-content`, which Chrome drew right and this Safari did not: fit-content is an
        // intrinsic-size keyword, and in Safari's intrinsic-size pass the `flex: 1 1 0%` basis of the items
        // below counted as zero, so the inner box came out at its 20+20 padding and the `overflow-hidden` on
        // this element clipped everything else — the 40px strip Eran saw on the iPad. §2 takes the zero basis
        // off that path as well; between them no view asks the browser for an intrinsic height.
        "md:bottom-auto md:h-auto",
        // The form's top edge sits 40 from the top of the screen, so opening a day's hours or switching to
        // "שיחזרו אליי" grows and shrinks the box at its BOTTOM edge only — the title never moves. The sent
        // and the gone views put their top edge at the middle of the screen and are pulled up by half their
        // own height: centred at their content height. Across, both stay centred by the base `m-auto` against
        // `left`/`right` 0 from `inset-0` and the 720 width; with `bottom: auto` the two vertical auto margins
        // resolve to 0. The max-height still holds in every view, and the middle keeps
        // `min-h-0 flex-auto overflow-y-auto`, so a low window scrolls it.
        isForm ? "md:top-10" : "md:top-1/2 md:-translate-y-1/2",
        "backdrop:bg-[rgba(34,31,28,0.42)]",
        FADE,
        "opacity-0 backdrop:opacity-0 [&[data-shown]]:opacity-100 [&[data-shown]]:backdrop:opacity-100",
      ].join(" ")}
    >
      {mounted && (
        // The inner box: it fills the dialog (so a click on the element itself is the backdrop and nothing
        // else), carries the desktop's padding 20 28 and the 14 between its blocks, and is the positioned,
        // clipping ancestor the anti-bot field is parked 9999px outside of.
        <div className="relative flex min-h-0 w-full flex-auto flex-col overflow-hidden md:gap-[14px] md:px-7 md:py-5">
          {/* The header stays while the middle scrolls. On the phone it is a 56px bar on a rule, padding
              0 16 0 8 (the X's own 44 box carries the rest); on the desktop it is a plain row. */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#d8d3cb] pr-4 pl-2 md:h-auto md:border-b-0 md:p-0">
            <h2
              className="m-0 flex items-center gap-2 text-[17px] font-extrabold md:gap-2.5 md:text-[20px]"
              style={{ color: view === "gone" ? DARK : color }}
            >
              {view === "sent" && <TitleIcon kind="sent" />}
              {view === "gone" && <TitleIcon kind="gone" />}
              {title}
            </h2>
            <CloseCross onClick={() => onClose("button")} />
          </div>

          {/* Run 12 §3.1 — the wrapper takes the place the scroll box had in the column, so the header, the
              footer and the bar sit exactly where they sat; it is the fade's positioned ancestor and nothing
              else. EVERY VIEW GOES THROUGH THE ONE SCROLL BOX, so every view has the fade — on the two short
              ones it simply never shows. */}
          <div className="relative flex min-h-0 flex-auto flex-col">
            {/* The middle: the only region that scrolls, on both screens. */}
            <div ref={box} className="flex min-h-0 flex-auto flex-col gap-4 overflow-y-auto p-4 md:gap-[14px] md:p-0">
              <CarBlock car={car} sellerName={sellerName} dim={view === "gone"} />

              {isForm && (
                <>
                  <div className="flex flex-col gap-2">
                    <HeadingRow text={WHAT_SUITS} />
                    <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
                      <OptionCard
                        selected={form.kind === "visit"}
                        title={VISIT}
                        note={VISIT_NOTE}
                        color={color}
                        tint={tint}
                        onClick={() => onKind("visit")}
                      />
                      <OptionCard
                        selected={form.kind === "callback"}
                        title={CALLBACK}
                        note={CALLBACK_NOTE}
                        color={color}
                        tint={tint}
                        onClick={() => onKind("callback")}
                      />
                    </div>
                  </div>

                  {form.kind === "visit" && (
                    <div ref={dayBlock} className="flex flex-col gap-2">
                      <HeadingRow text={WHICH_DAY} error={errors.day === undefined ? undefined : ERROR_TEXT.day[errors.day]} />
                      {/* The phone's row does not wrap: it scrolls sideways and reaches the screen's edge
                          through the negative inline-end margin (the body's own 16px padding, cancelled). */}
                      <div className="-me-4 flex flex-nowrap gap-2 overflow-x-auto md:me-0 md:flex-wrap md:overflow-x-visible">
                        {days.map((d) => (
                          <Chip
                            key={d.day}
                            label={dayChipLabel(d)}
                            selected={form.day === d.day}
                            closed={d.closed}
                            color={color}
                            onClick={() => onDay(d.day)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {form.kind === "visit" && chosenDay !== undefined && (
                    <div ref={hourBlock} className="flex flex-col gap-2">
                      <HeadingRow text={WHICH_HOUR} error={errors.hour === undefined ? undefined : ERROR_TEXT.hour[errors.hour]} />
                      <div className="flex flex-wrap gap-2">
                        {chosenDay.hours.map((h) => (
                          <Chip key={h} label={hourLabel(h)} selected={form.hour === h} color={color} onClick={() => onHour(h)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Run 12 §1.8 — the desktop keeps its two columns: the name and the phone side by side,
                      one row, nothing spanning both. The phone stacks the two, gap 12 as before. */}
                  <div className="flex flex-col gap-3 md:grid md:grid-cols-2">
                    <TextField
                      field="name"
                      label={NAME}
                      value={form.name}
                      error={errors.name}
                      type="text"
                      autoComplete="name"
                      blockRef={nameBlock}
                      onChange={(v) => onField("name", v)}
                      onFocus={onFieldFocus}
                    />
                    <TextField
                      field="phone"
                      label={PHONE}
                      value={form.phone}
                      error={errors.phone}
                      type="tel"
                      ltr
                      autoComplete="tel"
                      blockRef={phoneBlock}
                      onChange={(v) => onField("phone", v)}
                      onFocus={onFieldFocus}
                    />
                  </div>

                  <p className="text-[13px]" style={{ color: GREY, lineHeight: 1.5 }}>
                    {privacyLine(sellerName)}
                  </p>

                  {/* The phone's copy of the failed-send line: the end of the body, above the bar. */}
                  {failLine !== null && (
                    <p role="alert" className="text-[14px] font-semibold md:hidden" style={{ color: RED }}>
                      {failLine}
                    </p>
                  )}
                </>
              )}

              {view === "sent" && sent !== null && followUp !== null && (
                <>
                  {/* The visit's own line, then the follow-up; a callback has the follow-up alone. */}
                  {sent.kind === "visit" && visitLine !== null && (
                    <p className="text-[16px]" style={{ color: DARK, lineHeight: 1.5 }}>
                      {visitLine.before}
                      <strong className="font-bold tabular-nums">{visitLine.strong}</strong>
                      {visitLine.after}
                    </p>
                  )}
                  <p className="text-[16px]" style={{ color: DARK, lineHeight: 1.5 }}>
                    {followUp.before}
                    <span dir="ltr">{followUp.phone}</span>
                    {followUp.after}
                  </p>

                  <p className="text-[14px]" style={{ color: GREY, lineHeight: 1.5 }}>
                    {INSPECTION_NOTE}
                  </p>

                  {/* On the phone "לשלוח בקשה חדשה" is the body's last line; on the desktop it sits in the
                      footer beside "סגור". */}
                  <button
                    type="button"
                    onClick={onNewRequest}
                    className="self-start text-[15px] font-semibold underline underline-offset-[3px] md:hidden"
                    style={{ color: DARK }}
                  >
                    {NEW_REQUEST}
                  </button>
                </>
              )}

              {view === "gone" && (
                <p className="text-[16px]" style={{ color: DARK, lineHeight: 1.5 }}>
                  {GONE_LINE}
                </p>
              )}
            </div>

            {/* Run 12 §3.1 — THE FADE AT THE BOTTOM: white to transparent over the scroll box's last 40px,
                on while there is content below the visible area and off the moment the end is reached. It
                sits ON the box's bottom edge — on the desktop above the footer's send button, on the phone
                above the bar — takes no pointer and does not scroll with the content. It fades in and out
                over the window's own WINDOW_FADE_MS. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 transition-opacity"
              style={{
                background: "linear-gradient(to top, #ffffff, rgba(255,255,255,0))",
                opacity: more ? 1 : 0,
                transitionDuration: `${WINDOW_FADE_MS}ms`,
              }}
            />
          </div>

          {/* The footer stays put too. Its content is the view's one action; on the phone it is the bar. */}
          {isForm && (
            <div className={`${BAR} md:flex-col md:items-start md:gap-2`}>
              {/* The desktop's copy of the failed-send line: directly above the button. */}
              {failLine !== null && (
                <p role="alert" className="hidden text-[14px] font-semibold md:block" style={{ color: RED }}>
                  {failLine}
                </p>
              )}
              {sendButton}
            </div>
          )}

          {view === "sent" && (
            <div className={`${BAR} md:gap-6`}>
              <button type="button" onClick={() => onClose("button")} className={FILLED} style={{ background: color }}>
                {CLOSE_BUTTON}
              </button>
              <button
                type="button"
                onClick={onNewRequest}
                className="hidden text-[15px] font-semibold underline underline-offset-[3px] md:inline-block"
                style={{ color: DARK }}
              >
                {NEW_REQUEST}
              </button>
            </div>
          )}

          {view === "gone" && (
            <div className={BAR}>
              <button type="button" onClick={onLeave} className={FILLED} style={{ background: color }}>
                {backWord}
              </button>
            </div>
          )}

          {/* THE ANTI-BOT FIELD (§4.3). Off screen, never `display: none` — a field a bot cannot see is a
              field it does not fill. Its name, its id and its attributes are nothing a browser autofills by
              itself, because a real buyer whose browser filled it would be dropped in silence. It is read
              from the element at the send, never mirrored in state, and it is a child of the clipping inner
              box so that 9999px cannot become a scrollbar anywhere. */}
          <input
            ref={honeypotRef}
            type="text"
            name="fc_extra"
            id="fc_extra"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{ position: "absolute", left: -9999, top: 0 }}
          />
        </div>
      )}
    </dialog>
  );
}
