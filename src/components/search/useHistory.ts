"use client";

// In-page back (BRIEF Days 15–16, Run 2c §8; narrowed by Run 6b §5).
//
// ITS JOB IS NOW EXACTLY ONE THING, and only it: AN OPEN DRAWER OR AN OPEN SEARCH BAR CLOSES AS CANCEL ON
// BACK. Everything it used to do besides that — standing in for a URL, remembering which screen an entry
// was, sending back from the results to a fresh opening screen — is gone, because Run 6b gave every question
// a real address (`/?s=<public_id>`, §5). The browser's own back now moves between questions, between the
// first question and the opening screen, and from a car page to the results it was opened from; this hook
// must not compete with it, and it does not: with nothing open it does nothing at all and the browser
// navigates as it should.
//
// THE ENTRY. Opening an overlay pushes ONE entry on the SAME url, carrying { screen, overlay } under a key
// of our own.
//
// NEXT.JS OWNS window.history.state ON THIS ROUTE. Its App Router keeps `__NA` and its render tree there,
// and its own popstate handler does `window.location.reload()` on any entry that has lost them (verified in
// node_modules/next/dist/client/components/app-router.js — `if (!event.state.__NA) window.location.reload()`).
// So our field is ADDED to whatever the entry already carries, never written over it.
//
// CLOSING AN OVERLAY ANY OTHER WAY POPS ITS ENTRY (§8): X, the backdrop, "עדכן", choosing a model, a click
// outside, Esc. history.back() is asynchronous, so popOverlay() takes what must happen AFTERWARDS as a
// callback — that is how a search from an open drawer pushes its new address onto the right stack instead of
// on top of the drawer's. The popstate that our own back() causes is counted and ignored.
//
// MORE THAN ONE INSTANCE IS FINE. The results screen has one for its drawer and the question row has one for
// its search bar. A back reaches both listeners, and the one with no overlay outstanding does nothing.

import { useCallback, useEffect, useRef } from "react";

export type HistoryEntry = { overlay: true };

/** Our field sits under one key of its own, beside the framework's. */
const SCREEN_KEY = "__screen";

function stamp(entry: HistoryEntry): void {
  window.history.pushState({ ...(window.history.state as Record<string, unknown> | null), [SCREEN_KEY]: entry }, "");
}

export function useScreenHistory({ onCancelOverlay }: { onCancelOverlay: () => void }) {
  const outstanding = useRef(false); // an overlay entry of ours is on the stack
  const ours = useRef(0); // popstate events this hook caused itself, still to arrive
  const then = useRef<(() => void) | null>(null); // what to run once our own back() has landed
  // The handler closes over the caller's current state, so it is kept in a ref and refreshed after every
  // render: the popstate listener is registered once and must never call a stale one.
  const cancel = useRef(onCancelOverlay);
  useEffect(() => {
    cancel.current = onCancelOverlay;
  });

  useEffect(() => {
    const onPop = () => {
      if (ours.current > 0) {
        ours.current--;
        const run = then.current;
        then.current = null;
        run?.();
        return;
      }
      if (outstanding.current) {
        outstanding.current = false;
        cancel.current();
      }
      // else: nothing of ours is open — the browser is moving between addresses and that is its business.
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** The mobile drawer or the question row's search bar opened. The desktop panel never closes and never calls this. */
  const pushOverlay = useCallback(() => {
    outstanding.current = true;
    stamp({ overlay: true });
  }, []);

  /**
   * The overlay was closed by something other than back. Pops its entry so the stack stays consistent and
   * back never has to be pressed twice. `after` runs once the pop has landed — or at once when there was no
   * entry to pop (the desktop panel, or an overlay that was never pushed).
   */
  const popOverlay = useCallback((after?: () => void) => {
    if (!outstanding.current) {
      after?.();
      return;
    }
    outstanding.current = false;
    ours.current++;
    then.current = after ?? null;
    window.history.back();
  }, []);

  return { pushOverlay, popOverlay };
}
