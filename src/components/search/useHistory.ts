"use client";

// Back navigation on the one route (BRIEF Days 15–16, Run 2c §8). Two findings from the phone test of 13/09:
// the browser's back left the site from the results, and left the site with the drawer open.
//
// THE URL NEVER CHANGES (§0.4). Everything here is `history.pushState` / `replaceState` / `popstate` against
// the same "/" — no query string, no hash. A refresh is therefore unchanged: the opening screen.
//
// THE STACK, three kinds of entry, each carrying only { screen, overlay } and never the question:
//   { opening, false }   the entry the page loaded on — stamped on mount
//   { results,  false }  pushed by the FIRST search; every later question replaces it (§0.4)
//   { <screen>, true }   pushed when the mobile drawer or the model editor opens
//
// NEXT.JS OWNS window.history.state ON THIS ROUTE. Its App Router keeps `__NA` and its render tree there, and
// its own popstate handler does `window.location.reload()` on any entry that has lost them (verified in
// node_modules/next/dist/client/components/app-router.js — `if (!event.state.__NA) window.location.reload()`;
// the first build of this hook overwrote the state and the browser's back reloaded the page instead of
// closing the editor). So our two fields are ADDED to whatever the entry already carries, never written over
// it. For the same reason the stamp is a RECORD, not the decision: Next rewrites the entry whenever its
// router state changes, and a back that had to read our fields back out would be that one write from silence.
//
// WHAT BACK DOES, decided from how many entries we pushed and from what is open:
//   an overlay is open        close it AS CANCEL (§8) — the drawer reverts to the asked question, the editor
//                             restores the asked model. The results stay live.
//   otherwise, above the load entry  the opening screen, fresh: empty bar, no filters, nothing asked.
//   otherwise                 nothing. That is FORWARD landing on an entry whose question is not in memory,
//                             and §0.6 says never show stale results.
// Back from the load entry itself leaves the site, which is what it should do — there is nothing below it.
//
// CLOSING AN OVERLAY ANY OTHER WAY POPS ITS ENTRY (§8): X, the backdrop, "עדכן", choosing a model, a click
// outside, Esc. history.back() is asynchronous, so popOverlay() takes what must happen AFTERWARDS as a
// callback — that is how the first search from an open drawer pushes its `results` entry onto the right
// stack instead of on top of the drawer's. The popstate that our own back() causes is counted and ignored.

import { useCallback, useEffect, useRef } from "react";

export type Screen = "opening" | "results";
export type HistoryEntry = { screen: Screen; overlay: boolean };

/** Our two fields sit under one key of their own, beside the framework's. */
const SCREEN_KEY = "__screen";

function stamp(entry: HistoryEntry, mode: "push" | "replace"): void {
  const data = { ...(window.history.state as Record<string, unknown> | null), [SCREEN_KEY]: entry };
  if (mode === "push") window.history.pushState(data, "");
  else window.history.replaceState(data, "");
}

export function useScreenHistory({ onCancelOverlay, onBackToOpening }: { onCancelOverlay: () => void; onBackToOpening: () => void }) {
  const depth = useRef(0); // entries we pushed above the one the page loaded on
  const outstanding = useRef(false); // an overlay entry of ours is the topmost of them
  const ours = useRef(0); // popstate events this hook caused itself, still to arrive
  const then = useRef<(() => void) | null>(null); // what to run once our own back() has landed
  // The two handlers close over the screen's current state, so they are kept in refs and refreshed after
  // every render: the popstate listener is registered once and must never call a stale one.
  const cancel = useRef(onCancelOverlay);
  const back = useRef(onBackToOpening);
  useEffect(() => {
    cancel.current = onCancelOverlay;
    back.current = onBackToOpening;
  });

  useEffect(() => {
    stamp({ screen: "opening", overlay: false }, "replace");

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
        depth.current = Math.max(0, depth.current - 1);
        cancel.current();
        return;
      }
      if (depth.current > 0) {
        depth.current--;
        back.current();
      }
      // else: a forward into an entry this session no longer has a question for (§0.6) — nothing happens
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** The first search: one `results` entry on top of the one the page loaded on. */
  const pushResults = useCallback(() => {
    depth.current++;
    stamp({ screen: "results", overlay: false }, "push");
  }, []);

  /** Every later question (עדכן, a model change) replaces that entry — the stack never grows per question. */
  const replaceResults = useCallback(() => {
    stamp({ screen: "results", overlay: false }, "replace");
  }, []);

  /** The mobile drawer or the model editor opened. The desktop panel never closes and never calls this. */
  const pushOverlay = useCallback((screen: Screen) => {
    outstanding.current = true;
    depth.current++;
    stamp({ screen, overlay: true }, "push");
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
    depth.current = Math.max(0, depth.current - 1);
    ours.current++;
    then.current = after ?? null;
    window.history.back();
  }, []);

  return { pushResults, replaceResults, pushOverlay, popOverlay };
}
