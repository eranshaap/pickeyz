// The screen's two timings (BRIEF Run 2, Days 24–25, §6.2). Both are CALIBRATION numbers — named here so they
// can be moved by eye on the live site instead of hunted through a component.

/**
 * §4.3 — the placeholders appear ONLY if the new results take longer than this. A timer starts on the click of
 * "עדכן"; until it fires the old results stay on screen exactly as they were, so a fast answer is never
 * preceded by three grey cards (findCar-now.md, "תמונת 'עדכן'").
 */
export const PLACEHOLDER_DELAY_MS = 400;

/**
 * §3.7 — the filters window's fade, the same in both directions and opacity only: the dialog and its backdrop
 * together. The close path waits this long before `close()`, so the fade finishes before the window goes.
 */
export const WINDOW_FADE_MS = 150;
