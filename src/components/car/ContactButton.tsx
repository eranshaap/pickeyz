"use client";

// The car page's contact button (BRIEF Day 19b Run 11b §4.2) — ONE component, two screens, two states.
//
// BEFORE A SEND it is the button the page already had, to the class: the desktop's 48px filled button at the
// bottom of the text column and the phone bar's 46px one, both in the page colour, both saying "צור קשר עם
// המוכר" / "צור קשר". The only thing this run adds to them is the click.
//
// AFTER A SEND (`sent !== null`, from the server on the first render and from the window's own state after a
// send in this session) it turns into the board's second state: white, outlined in the page colour, the text
// in the page colour, a check before it, and "הבקשה נשלחה". IT KEEPS THE SIZE OF THE SAME SCREEN'S BUTTON
// BEFORE THE SEND — the icon takes the room the wider text needed, so the page does not move when it
// changes. And it still opens the window, on the confirmation this time (§4.1, Eran's ruling of 30/09).
//
// It draws nothing else and decides nothing: the state, the events and the window are ContactProvider's.

import { BUTTON_CONTACT, BUTTON_CONTACT_SHORT, BUTTON_SENT } from "@/lib/contact/texts";
import { useContact } from "./ContactProvider";

/** The board's check: 20×20 on both screens, the current text colour, round caps. */
function Check() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M5.5 12.5l4.2 4.2 8.8-9.2" />
    </svg>
  );
}

export default function ContactButton({ variant }: { variant: "desktop" | "phone" }) {
  const { sent, color, openWindow } = useContact();
  const phone = variant === "phone";

  // The two buttons as the page has always drawn them (CarPageView, before this run), unchanged but for the
  // click: 48px / 16px / 600 on the desktop, 46px / 15px / 600 in the phone's fixed bar.
  if (sent === null) {
    return phone ? (
      <button
        type="button"
        onClick={() => openWindow("form")}
        className="h-[46px] shrink-0 rounded-lg px-7 text-[15px] font-semibold text-white"
        style={{ background: color }}
      >
        {BUTTON_CONTACT_SHORT}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => openWindow("form")}
        className="h-12 rounded-lg px-8 text-[16px] font-semibold text-white"
        style={{ background: color }}
      >
        {BUTTON_CONTACT}
      </button>
    );
  }

  // The sent state: the same height and the same radius, padding 0 28 on the desktop and the bar's own px-7
  // on the phone, and the page colour moved from the background to the frame and the text. The inset shadow
  // is the board's second hairline — it makes the 1px frame read at the same weight as the filled state's
  // edge without changing the button's box by a pixel.
  return (
    <button
      type="button"
      onClick={() => openWindow("sent")}
      className={`flex shrink-0 items-center gap-2 rounded-lg bg-white font-bold ${phone ? "h-[46px] px-7 text-[15px]" : "h-12 px-7 text-[16px]"}`}
      style={{ border: `1px solid ${color}`, boxShadow: `inset 0 0 0 1px ${color}`, color }}
    >
      <Check />
      {BUTTON_SENT}
    </button>
  );
}
