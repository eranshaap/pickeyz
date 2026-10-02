"use client";

// The contact window's STATE, all of it, in one place (BRIEF Day 19b Run 11b §4.1) — and the only file on
// the car page that talks to the two server actions.
//
// WHAT IT OWNS. Three things live here and nowhere else:
//   the window's view      closed → form → sending → sent / gone, and back to closed
//   the form               what was typed stays for the page's life ("מה שהוקלד נשאר עד שעוזבים את העמוד"),
//                          so it cannot live inside the window's own mounted/unmounted body
//   the opening            an OPENING is the window going from closed to open. Its `contact_opened` row's id
//                          is the opening's name: every event of that opening carries it, and a request sent
//                          during it points at that row (`opened_event_id`).
//
// WHY A PROVIDER AND NOT PROPS. The two buttons that open the window sit in two different places of a
// SERVER-rendered tree — the desktop text column and the phone's fixed bar — and both have to read one
// `sent` and call one `openWindow`. The provider wraps the whole page (CarPageView §4.4), the server children
// pass through it untouched as `children`, and the buttons take those two values out of the context. That is
// the documented way a client island reaches into a server tree
// (node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md, "Crossing the boundary").
//
// THE FIVE PER-OPENING VALUES ARE REFS, NOT STATE. `openingId`, `openedAt`, `started`, `sentHere` and
// `closedWhileSending` are bookkeeping for the measurement: not one of them is ever drawn. Two of them are
// read AFTER an await — the send's continuation asks whether the window was closed while it was in flight —
// and a state variable read in an async closure is the value it had when the closure was made, not the
// current one. A ref is the value now, which is the only value those questions have an answer in.
//
// MEASUREMENT NEVER DELAYS ANYTHING (§4.5): every event is fired and forgotten, its rejection logged and
// dropped. An id that cannot be made skips that one event and changes nothing else.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { recordContactEvent, sendContactRequest } from "@/app/actions/contact";
import type { ContactEventInput } from "@/app/actions/contact";
import { newEventId } from "@/lib/contact/ids";
import { dayOptions, israelInstant, israelNow, type DayOption } from "@/lib/contact/schedule";
import { SEND_FAILED, TOO_MANY } from "@/lib/contact/texts";
import { normalizePhone, validateForm, type FormErrors, type FormInput } from "@/lib/contact/validate";
import { useScreenHistory } from "@/components/search/useHistory";
import type { ContactData, SentRequest } from "./CarPageView";
import ContactWindow from "./ContactWindow";

/** The window's one state machine. `closed` is the dialog closed; `sending` is the wait for the action. */
export type ContactView = "closed" | "form" | "sending" | "sent" | "gone";

/** What the window can DRAW. It is never "closed": a window that is closing still has its last view on it. */
export type OpenContactView = Exclude<ContactView, "closed">;

/** The two typed fields — the ones a focus marks the form as started on. */
export type ContactField = "name" | "phone";

/** The car as the window draws it: the page's own values, nothing looked up here. */
export type ContactCar = { model: string; year: number | null; imageSrc: string | null; price: number; place: string | null };

/**
 * §4.1 — what the two buttons are given. `color` is here and not a prop of ContactButton because §4.4 mounts
 * the buttons with a `variant` and nothing else, and the page colour paints both of their states: it comes
 * down the same channel as the rest.
 */
type ContactContextValue = { sent: SentRequest | null; color: string; openWindow: (view: "form" | "sent") => void };

const ContactContext = createContext<ContactContextValue | null>(null);

export function useContact(): ContactContextValue {
  const value = useContext(ContactContext);
  if (value === null) throw new Error("ContactButton must be rendered inside ContactProvider");
  return value;
}

/** The form as the window opens for the first time: a visit, and nothing typed. */
const EMPTY_FORM: FormInput = { kind: "visit", day: null, hour: null, name: "", phone: "" };

/**
 * §4.5 — an event id, or null. newEventId() falls back to getRandomValues() where randomUUID is missing
 * (plain http) and throws only where there is no crypto at all; that one event is then skipped and the
 * window carries on — measurement never stops the buyer.
 */
function makeId(): string | null {
  try {
    return newEventId();
  } catch (e) {
    console.error("[contact window]", e);
    return null;
  }
}

/**
 * §4.1 — the day row is recomputed on every opening, so a day or an hour the NEW row does not offer is
 * cleared: the window may have been closed over midnight, or past 18:00 of the day that was chosen.
 */
function clampToDays(f: FormInput, days: DayOption[]): FormInput {
  if (f.day === null) return f.hour === null ? f : { ...f, hour: null };
  const chosen = days.find((d) => d.day === f.day && !d.closed);
  if (chosen === undefined) return { ...f, day: null, hour: null };
  if (f.hour !== null && !chosen.hours.includes(f.hour)) return { ...f, hour: null };
  return f;
}

/**
 * §4.3 — ONE field's note, re-checked as that field changes. It can only GO AWAY here: as soon as the field
 * is valid its note and red frame are dropped, and while it is not valid the note stays exactly as it was —
 * it never changes wording while typing, and a new note appears only on the next click on "שלח".
 */
function recheck(errors: FormErrors, next: FormInput, field: keyof FormErrors): FormErrors {
  if (errors[field] === undefined) return errors;
  if (validateForm(next)[field] !== undefined) return errors;
  const out = { ...errors };
  delete out[field];
  return out;
}

export default function ContactProvider({
  contact,
  color,
  backHref,
  backWord,
  car,
  children,
}: {
  contact: ContactData;
  color: string;
  backHref: string;
  backWord: string;
  car: ContactCar;
  children: ReactNode;
}) {
  const router = useRouter();

  const [view, setView] = useState<ContactView>("closed");
  const [form, setForm] = useState<FormInput>(EMPTY_FORM);
  const [days, setDays] = useState<DayOption[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [failLine, setFailLine] = useState<string | null>(null);
  const [sent, setSent] = useState<SentRequest | null>(contact.sent);

  // Run 12 §2.2 — HOW MANY CLICKS ON "שלח" HAVE FAILED THE VALIDATION, over the page's whole life. A
  // COUNTER AND NOT A FLAG: the window scrolls to the first missing field on every one of them, including
  // two clicks that produce the very same errors, and a flag's second write would be no write at all.
  // Nothing resets it — openWindow(), newRequest() and close() leave it where it is, and the window's own
  // effect remembers the value it mounted on, so a reopening never scrolls by itself (§2.3).
  const [errorClick, setErrorClick] = useState(0);

  // What the window keeps drawing while it fades out. The machine is `closed` from the click, but the fade
  // lasts WINDOW_FADE_MS after it and a window that faded out empty would be a flash of white; close() is the
  // only path to `closed`, so this is written there and read only while the view IS `closed`.
  const [drawn, setDrawn] = useState<OpenContactView>("form");

  // The opening's bookkeeping — see the head of this file for why these five are refs.
  const openingId = useRef<string | null>(null);
  const openedAt = useRef(0);
  const started = useRef(false);
  const sentHere = useRef(false);
  const closedWhileSending = useRef(false);

  // §4.3 — the anti-bot field is UNCONTROLLED and read from the element itself at the send, not mirrored in
  // state: a bot that sets `.value` without firing an event, and a browser that fills the field by itself,
  // both have to be caught, and only the DOM node knows what is really in it.
  const honeypot = useRef<HTMLInputElement>(null);

  // "אחורה" has to reach close(), and close() has to reach popOverlay() — so one of the two goes through a
  // ref. The hook keeps its own callback in a ref and refreshes it after every render for the same reason.
  const closeRef = useRef<(how: "button" | "back") => void>(() => {});
  const { pushOverlay, popOverlay } = useScreenHistory({ onCancelOverlay: () => closeRef.current("back") });

  /** One event row, fired and forgotten. Every row carries the five measurement values of ContactData. */
  const fire = useCallback(
    (event_type: ContactEventInput["event_type"], id: string, details: Record<string, unknown>) => {
      void recordContactEvent({
        id,
        event_type,
        listing_id: contact.listingId,
        car_id: contact.carId,
        search_id: contact.searchId,
        car_rank: contact.carRank,
        was_recommended: contact.wasRecommended,
        details,
      }).catch((err) => console.error("[contact window]", err));
    },
    [contact],
  );

  /**
   * §4.1 — AN OPENING, and the only thing that makes one. `"form"` is the page's button before a send,
   * `"sent"` after one: Eran's ruling of 30/09 — reopening the confirmation is an opening too, and the
   * `contact_opened` row says which it was in `details.view`.
   */
  const openWindow = useCallback(
    (next: "form" | "sent") => {
      if (view !== "closed") return;
      const id = makeId();
      openingId.current = id;
      openedAt.current = Date.now();
      started.current = false;
      sentHere.current = false;
      closedWhileSending.current = false;
      if (next === "form") {
        const row = dayOptions(new Date());
        setDays(row);
        setForm((f) => clampToDays(f, row));
      }
      setView(next);
      if (id !== null) fire("contact_opened", id, { view: next });
      pushOverlay("contact");
    },
    [view, fire, pushOverlay],
  );

  /**
   * §4.1 — "לשלוח בקשה חדשה". THE SAME OPENING CONTINUES: no event, no history entry, only the form filled
   * back in from the request that was just sent. A day or an hour the new row does not offer is left empty.
   */
  const newRequest = useCallback(() => {
    if (view !== "sent" || sent === null) return;
    const row = dayOptions(new Date());
    const slot = sent.visitAt === null ? null : israelNow(new Date(sent.visitAt));
    setDays(row);
    setForm(
      clampToDays(
        {
          kind: sent.kind,
          day: slot === null ? null : slot.day,
          hour: slot === null ? null : slot.hour,
          name: sent.name,
          phone: sent.phone,
        },
        row,
      ),
    );
    setErrors({});
    setFailLine(null);
    setView("form");
  }, [view, sent]);

  /** §4.5 — the first interaction of an opening with one of the four fields. Once per opening. */
  const markStarted = useCallback(() => {
    if (started.current) return;
    started.current = true;
    const id = makeId();
    if (id !== null) fire("contact_form_started", id, { opening: openingId.current, kind: form.kind });
  }, [fire, form.kind]);

  /**
   * §4.1 — the send. The window validates FIRST, so a server that refuses the fields is answering a tampered
   * call and throws; every outcome a buyer can actually reach comes back typed, and each is drawn its own way.
   *
   * THE WINDOW MAY BE GONE BY THE TIME THE ANSWER ARRIVES — "אחורה" cannot be refused mid-flight. A request
   * that did go out then updates the page's button and nothing else: the window stays closed.
   */
  const send = useCallback(async () => {
    if (view !== "form") return;

    const found = validateForm(form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setErrorClick((n) => n + 1);
      for (const field of Object.keys(found) as (keyof FormErrors)[]) {
        const id = makeId();
        if (id !== null) fire("contact_form_error", id, { opening: openingId.current, field, error: found[field], kind: form.kind });
      }
      return;
    }

    setView("sending");
    setFailLine(null);
    const visit_at = form.kind === "visit" && form.day !== null && form.hour !== null ? israelInstant(form.day, form.hour).toISOString() : null;

    try {
      const result = await sendContactRequest({
        listing_public_id: contact.listingPublicId,
        search_result_id: contact.searchResultId,
        opened_event_id: openingId.current,
        kind: form.kind,
        visit_at,
        name: form.name,
        phone: form.phone,
        honeypot: honeypot.current?.value ?? "",
      });

      if (result.status === "sent") {
        setSent({
          kind: result.kind,
          visitAt: result.visit_at,
          name: result.name,
          phone: result.phone,
          createdAt: result.created_at,
        });
      } else if (result.status === "dropped") {
        // The document: a filled honeypot is thrown away in silence, with no message and no row. The window
        // therefore behaves EXACTLY as after a send, and the confirmation is built from the form — there is
        // no row to read it back from. The phone goes through normalizePhone() so the confirmation reads it
        // back in the same shape a real send does.
        setSent({
          kind: form.kind,
          visitAt: visit_at,
          name: form.name.trim(),
          phone: normalizePhone(form.phone.trim()),
          createdAt: new Date().toISOString(),
        });
      }

      if (closedWhileSending.current) return;

      switch (result.status) {
        case "sent":
        case "dropped":
          sentHere.current = true;
          setView("sent");
          break;
        case "too_many":
          setView("form");
          setFailLine(TOO_MANY);
          break;
        case "gone":
          setView("gone");
          break;
      }
    } catch (e) {
      // A real failure: everything typed is kept and the line above the button says so. A window that was
      // closed on "אחורה" while this was in flight stays closed — re-opening it here would be the window
      // coming back by itself, minutes later.
      console.error("[contact window]", e);
      if (closedWhileSending.current) return;
      setView("form");
      setFailLine(SEND_FAILED);
    }
  }, [view, form, contact, fire]);

  /**
   * §4.1 — the one close path. `"button"` is the X, Esc, a click outside, "סגור" and the gone view's button;
   * `"back"` is "אחורה", through the history hook.
   *
   * `after` runs once our own back() has landed, and the gone view's button is the only caller that passes
   * one: §4.3's button closes the window AND leaves the page, and popOverlay() is what knows when the
   * window's own history entry is off the stack and a push is safe.
   */
  const close = useCallback(
    (how: "button" | "back", after?: () => void) => {
      if (view === "closed") return;

      // Mid-flight: the X, Esc and an outside click do nothing — the window waits for the answer. "אחורה"
      // cannot be refused, so the window goes, and the answer, when it comes, only updates the page's button.
      if (view === "sending") {
        if (how === "button") return;
        closedWhileSending.current = true;
        setDrawn(view);
        setView("closed");
        return;
      }

      // No `contact_closed` for the confirmation of a send made in THIS opening: the request row tells it.
      if (!(view === "sent" && sentHere.current)) {
        const id = makeId();
        if (id !== null) {
          fire("contact_closed", id, {
            opening: openingId.current,
            open_ms: Date.now() - openedAt.current,
            started: started.current,
            kind: form.kind,
            view,
            sent_here: sentHere.current,
          });
        }
      }

      setDrawn(view);
      setView("closed");
      if (how === "button") popOverlay(after);
    },
    [view, form.kind, fire, popOverlay],
  );

  useEffect(() => {
    closeRef.current = close;
  });

  /**
   * §4.5 — the kind switch is NOT a field: it marks nothing as started. It does drop a day or hour note,
   * because §4.3 lets a note appear only on a click on "שלח" and those two headings are off screen for a
   * callback: a note that survived the round trip would be a note nobody asked for.
   */
  const chooseKind = useCallback((kind: "visit" | "callback") => {
    setForm((f) => (f.kind === kind ? f : { ...f, kind }));
    setErrors((e) => {
      if (e.day === undefined && e.hour === undefined) return e;
      const out = { ...e };
      delete out.day;
      delete out.hour;
      return out;
    });
  }, []);

  /** §4 point 4 — choosing a day clears a chosen hour that the new day does not offer. */
  const chooseDay = useCallback(
    (day: string) => {
      markStarted();
      const opt = days.find((d) => d.day === day);
      const hour = form.hour !== null && opt !== undefined && opt.hours.includes(form.hour) ? form.hour : null;
      const next: FormInput = { ...form, day, hour };
      setForm(next);
      setErrors(recheck(errors, next, "day"));
    },
    [days, form, errors, markStarted],
  );

  const chooseHour = useCallback(
    (hour: number) => {
      markStarted();
      const next: FormInput = { ...form, hour };
      setForm(next);
      setErrors(recheck(errors, next, "hour"));
    },
    [form, errors, markStarted],
  );

  const changeField = useCallback(
    (field: ContactField, value: string) => {
      const next: FormInput = { ...form, [field]: value };
      setForm(next);
      setErrors(recheck(errors, next, field));
    },
    [form, errors],
  );

  const value = useMemo<ContactContextValue>(() => ({ sent, color, openWindow }), [sent, color, openWindow]);

  return (
    <ContactContext.Provider value={value}>
      {children}
      <ContactWindow
        open={view !== "closed"}
        view={view === "closed" ? drawn : view}
        form={form}
        days={days}
        errors={errors}
        errorClick={errorClick}
        failLine={failLine}
        sent={sent}
        color={color}
        car={car}
        sellerName={contact.sellerName}
        backWord={backWord}
        honeypotRef={honeypot}
        onKind={chooseKind}
        onDay={chooseDay}
        onHour={chooseHour}
        onField={changeField}
        onFieldFocus={markStarted}
        onSend={send}
        onNewRequest={newRequest}
        onClose={close}
        onLeave={() => close("button", () => router.push(backHref))}
      />
    </ContactContext.Provider>
  );
}
