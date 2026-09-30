// BRIEF Day 19b Run 11a §1.1 — the days and the hours the contact window offers.
//
// PURE: no node:*, no next/*, no @/lib/db. This file is bundled into the browser, where the window builds
// its day row, and it is also read on the server, where a submitted slot is checked against the same rules.
//
// One rule for every seller (findCar-now.md, the contact window): 14 days from today inclusive, computed on
// day the window opens; the whole hours 9:00-18:00, on Friday 9:00-15:00; on the current day only the hours
// that have not yet begun; a day left with no hours is not shown at all; Saturday stays in the row, closed.
//
// EVERY DAY AND HOUR HERE IS ISRAEL'S, never the machine's zone: the server runs in UTC, the buyer's phone
// runs wherever it is, and both have to draw the same row. israelDay() is the display library's one
// definition of a calendar day in Israel, and the hour comes from the same time zone through Intl.

import { ISRAEL_TIME_ZONE, israelDay } from "@/lib/display/texts";

export const OPEN_HOUR = 9; // first slot, every open day
export const CLOSE_HOUR = 18; // last slot Sunday-Thursday
export const FRIDAY_CLOSE_HOUR = 15; // last slot on Friday
export const WINDOW_DAYS = 14; // today inclusive

const FRIDAY = 5;
const SATURDAY = 6;

/** One day in the window's row. `day` is "YYYY-MM-DD" in Israel; `weekday` 0 = Sunday ... 6 = Saturday. */
export type DayOption = { day: string; weekday: number; closed: boolean; hours: number[] };

/** The wall clock of an instant in Israel. h23, so midnight is hour 0 and not 24. */
const ISRAEL_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: ISRAEL_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The Israel calendar day and wall-clock time of an instant. */
export function israelNow(at: Date): { day: string; hour: number; minute: number } {
  const parts = ISRAEL_CLOCK.formatToParts(at);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { day: israelDay(at), hour: value("hour"), minute: value("minute") };
}

/**
 * The weekday of a "YYYY-MM-DD". A date-only value read as UTC midnight has the calendar day's own weekday
 * in every zone, which is exactly what is wanted: the string IS the Israel day already.
 */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** `n` days after `day` (negative goes back), as another "YYYY-MM-DD". */
export function addDays(day: string, n: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
}

/**
 * The hours offered on `day`, given the wall clock now. Saturday is closed; Friday ends earlier; on today
 * itself an hour that has BEGUN has passed -- 10:00 is gone at 10:30, so only h > now.hour survives.
 */
export function hoursFor(day: string, now: { day: string; hour: number; minute: number }): number[] {
  const weekday = weekdayOf(day);
  if (weekday === SATURDAY) return [];
  const last = weekday === FRIDAY ? FRIDAY_CLOSE_HOUR : CLOSE_HOUR;
  const hours: number[] = [];
  for (let h = OPEN_HOUR; h <= last; h += 1) {
    if (day === now.day && h <= now.hour) continue;
    hours.push(h);
  }
  return hours;
}

/**
 * The window's row, computed on the instant it opens: WINDOW_DAYS days from today in Israel, inclusive.
 * Saturday stays, closed and hourless. An OPEN day whose hours came out empty -- today, late enough -- is
 * dropped, so the list may hold fewer than WINDOW_DAYS entries.
 */
export function dayOptions(at: Date): DayOption[] {
  const now = israelNow(at);
  const out: DayOption[] = [];
  for (let i = 0; i < WINDOW_DAYS; i += 1) {
    const day = addDays(now.day, i);
    const weekday = weekdayOf(day);
    if (weekday === SATURDAY) {
      out.push({ day, weekday, closed: true, hours: [] });
      continue;
    }
    const hours = hoursFor(day, now);
    if (hours.length === 0) continue;
    out.push({ day, weekday, closed: false, hours });
  }
  return out;
}

/**
 * The UTC instant of hour:00 on `day` IN ISRAEL. No fixed offset is used anywhere: Israel moves between
 * summer and winter time, and a fixed offset is wrong for half the year. Start from the naive UTC value,
 * read what Israel's clock says at that instant, shift by the difference, and repeat once -- the second
 * pass is what covers the two days a year on which the first shift crosses a clock change.
 */
export function israelInstant(day: string, hour: number): Date {
  const [y, m, d] = day.split("-").map(Number);
  const wanted = Date.UTC(y, m - 1, d, hour);
  let t = wanted;
  for (let pass = 0; pass < 2; pass += 1) {
    const clock = israelNow(new Date(t));
    const [cy, cm, cd] = clock.day.split("-").map(Number);
    const got = Date.UTC(cy, cm - 1, cd, clock.hour, clock.minute);
    if (got === wanted) break;
    t += wanted - got;
  }
  return new Date(t);
}

/**
 * The SERVER's anti-tamper check of a submitted visit -- not the window's list. The client validated first,
 * so only a tampered call gets here; this asks the four things the row must satisfy to be storable:
 * on the hour, not a Saturday, inside that weekday's range, and inside the window's span.
 *
 * The span is yesterday .. today + 13, one day wider at the bottom than the row the window drew. A slot
 * that BEGAN while the buyer was filling the form is accepted on purpose: the list was right when the
 * window opened, and rejecting it would make every retry of a send fail.
 */
export function visitSlotValid(visitAt: Date, at: Date): boolean {
  const slot = israelNow(visitAt);
  if (slot.minute !== 0) return false;
  const weekday = weekdayOf(slot.day);
  if (weekday === SATURDAY) return false;
  const last = weekday === FRIDAY ? FRIDAY_CLOSE_HOUR : CLOSE_HOUR;
  if (slot.hour < OPEN_HOUR || slot.hour > last) return false;
  const today = israelNow(at).day;
  return slot.day >= addDays(today, -1) && slot.day <= addDays(today, WINDOW_DAYS - 1);
}
