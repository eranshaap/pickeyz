// The anonymous identity of a search (BRIEF Days 15–16, §3.4) — the cookie helper.
//
// searches.visitor_id and searches.session_id come from here, and nowhere else. user_id stays null: there is
// no login this month.
//
//   visitor_id  a permanent, anonymous id in an httpOnly cookie with a one-year lifetime. The same browser on
//               the same device, ACROSS visits. It is the basis of lead de-duplication ("the same person on
//               the same car = one lead") and of behaviour over time. httpOnly: no page script reads it, and
//               nothing about the person is in it — it is a random UUID, not a fingerprint.
//   session_id  one visit. Written as a SESSION cookie: no maxAge, so the browser drops it when it closes.
//
// DECISION FLAGGED FOR REVIEW IN REPORT.md: the brief asks for a "per-tab" session_id. A cookie cannot be
// per-tab — every tab of a browser shares one jar — so a true per-tab id has to be minted by the page
// (sessionStorage is per-tab) and handed to the action. findCar-schema.md §7 defines session_id as "one
// visit, resets between visits", which IS what a session cookie gives. So this file implements the
// per-visit cookie now, and runSearch() accepts an explicit identity, which is where Run 2's UI will pass a
// per-tab id from sessionStorage if that is the rule Eran wants. Nothing here has to change for that.

import { cookies } from "next/headers";

export const VISITOR_COOKIE = "fc_visitor";
export const SESSION_COOKIE = "fc_session";
export const VISITOR_MAX_AGE_SECONDS = 365 * 24 * 60 * 60; // one year

export type SearchIdentity = { visitor_id: string; session_id: string };

function newId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * The identity of the current request, minting and setting whichever cookie is missing.
 *
 * Only callable inside a request that can still set headers — a Server Function or a Route Handler. In a
 * Server Component the cookies can be read but not set, and outside a request `cookies()` throws; that throw
 * is deliberate and is never caught here. A caller with no request (a script, a read-back) passes its own
 * identity to runSearch() instead of calling this.
 */
export async function searchIdentity(): Promise<SearchIdentity> {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";

  let visitor_id = jar.get(VISITOR_COOKIE)?.value;
  if (!visitor_id) {
    visitor_id = newId();
    jar.set({ name: VISITOR_COOKIE, value: visitor_id, httpOnly: true, sameSite: "lax", path: "/", maxAge: VISITOR_MAX_AGE_SECONDS, secure });
  }

  let session_id = jar.get(SESSION_COOKIE)?.value;
  if (!session_id) {
    session_id = newId();
    // No maxAge and no expires: a session cookie, gone when the browser closes.
    jar.set({ name: SESSION_COOKIE, value: session_id, httpOnly: true, sameSite: "lax", path: "/", secure });
  }

  return { visitor_id, session_id };
}
