// The site's layout numbers (BRIEF Run 2, Days 24–25, §1.2, §2.1, §6.1) — ONE PLACE, because "מבנה חוזר =
// מקום אחד בקוד" (work.md) and because the same two numbers are spelled in two languages: CSS needs the
// boundary inside a media query and the container inside a class name, JavaScript needs them as numbers.
// src/lib/display/layout.test.ts pins each pair together, so a number can never move in one language only.
//
// Pure: no DOM, no React, no clock. Nothing here decides anything — these are measurements.

/**
 * §1.2 — the site's one phone/desktop boundary, for JavaScript: below 900 px of window width the phone
 * layout, from it up the desktop layout, on every screen the car page included. Its CSS twin is the single
 * `--breakpoint-md: 56.25rem` declaration in src/app/globals.css, which is what every `md:` class follows.
 */
export const DESKTOP_MIN_WIDTH_PX = 900;

/** §2.1 — the results screen's container: at most 1,440 px wide, centred, with symmetric margins beyond it. */
export const RESULTS_CONTAINER_PX = 1440;

/** §2.1 — the container's side padding on the desktop; `md:px-12` below is 12 × 4 px. */
export const RESULTS_CONTAINER_PADDING_PX = 48;

/** §2.1 — what the results screen actually draws into at 1,440 and wider: the container less its two sides. */
export const RESULTS_CONTENT_PX = 1344;

/**
 * §2.1 — THE ONE CLASS EVERY RESULTS-SCREEN CONTAINER CARRIES: the white bar's content, the crowned state, the
 * waiting state and the two uncrowned screens. Tailwind reads class names as literals and cannot be handed a
 * computed string, so the numbers live beside it here and the test pins them to it. The phone's own `px-4`
 * stays outside this string, because each place keeps the vertical paddings and gaps it already had.
 */
export const RESULTS_CONTAINER_CLASS = "mx-auto w-full max-w-[1440px] md:px-12";
