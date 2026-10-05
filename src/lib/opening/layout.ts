// Opening screen, S3 §3–§4 — how much everything under the top bar grows with the window.
//
// The screen is drawn on two boards: the computer's 1,440 × 900 (the top bar included) and the phone's 390 wide
// and 612 under the top bar. A larger window grows the drawing in the board's proportions, by the smaller of the
// two ratios so that it always fits, and never shrinks it below the drawing: a laptop and a phone see no change,
// a 1,920 × 1,080 screen about 1.2 times, an iPad in portrait about 1.6–1.8 depending on its visible height.
// The top bar never grows, which is why its height comes off both sides of the height ratio.

/** The computer's board: the whole window, top bar included. */
export const OPENING_BOARD = { width: 1440, height: 900 } as const;

/** The phone's board: its width, and the height under the top bar. */
export const PHONE_OPENING_BOARD = { width: 390, underTopBar: 612 } as const;

/** S3 §3 — `max(1, min(width / 1440, (height − topBar) / (900 − topBar)))`. */
export function openingScale(width: number, height: number, topBar: number): number {
  return Math.max(1, Math.min(width / OPENING_BOARD.width, (height - topBar) / (OPENING_BOARD.height - topBar)));
}

/** S3 §4 — the phone's: `max(1, min(width / 390, (height − topBar) / 612))`. */
export function phoneOpeningScale(width: number, height: number, topBar: number): number {
  return Math.max(1, Math.min(width / PHONE_OPENING_BOARD.width, (height - topBar) / PHONE_OPENING_BOARD.underTopBar));
}
