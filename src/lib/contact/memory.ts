// BRIEF Day 19b Run 11a §1.4 — the button that remembers.
//
// PURE: no node:*, no next/*, no @/lib/db. The page decides on the server whether the car page's button
// says "sent", and the window decides the same thing in the browser after a send; one rule, one file.
//
// A request is IN FORCE while it still describes something that has not happened yet:
//   a visit    -- until the end of the meeting day in Israel. At 21:00 on the day of an 11:00 visit the
//                 button still says the request was sent; the next morning it is an ordinary button again.
//   a callback -- for CALLBACK_MEMORY_DAYS from the moment it was sent. A callback has no day of its own,
//                 so it is measured from its own creation and not from a calendar.

import { israelDay } from "@/lib/display/texts";

export type RememberedRequest = { kind: "visit" | "callback"; visit_at: Date | null; created_at: Date };

export const CALLBACK_MEMORY_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether the latest request on this listing still holds at `now`. */
export function requestInForce(r: RememberedRequest, now: Date): boolean {
  if (r.kind === "visit") {
    // A visit row without an instant is a row that cannot be reasoned about: it remembers nothing.
    if (r.visit_at === null) return false;
    return israelDay(r.visit_at) >= israelDay(now);
  }
  return now.getTime() - r.created_at.getTime() < CALLBACK_MEMORY_DAYS * DAY_MS;
}
