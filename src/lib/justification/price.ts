// The justification generator — the two sentences that are made of a number (BRIEF Days 22–23, Run 2, §6.5).
//
// THE PRICE EXPRESSION. fairAmount() and fairLine() moved here from src/lib/display/texts.ts (§7) — their
// behaviour did not change at all: the same amount, the same rounding to SENTENCE_ROUND_ILS, the same three
// wordings. Only the constants moved home, from three module-private strings in texts.ts to wordings.ts, so that
// the line under the price and the generator's price sentence are ONE string, produced once.
//
// texts.ts now re-exports both names from this library, so priceBlock() and the car page are untouched.
//
// THE KM SENTENCE lives beside it: it is the other sentence the generator builds out of a number it reads off
// the invoice, and the same rule holds for both — the digits are unsigned and the direction is carried by the
// word. facts.ts stays a reader of the invoice and imports no wording.
//
// No Hebrew in this file — the language lives in wordings.ts (§3).

import { num } from "@/lib/display/texts";
import { SENTENCE_ROUND_ILS, SENTENCE_ROUND_KM } from "./constants";
import type { CarFacts } from "./facts";
import { KM, PRICE } from "./wordings";

/** The deal in shekels, rounded to SENTENCE_ROUND_ILS: `deal_score ÷ 100 × median_price` of the norm row. */
export function fairAmount(score: number, median_price: number): number {
  return Math.round(((score / 100) * median_price) / SENTENCE_ROUND_ILS) * SENTENCE_ROUND_ILS;
}

/**
 * §6.5 — the shared expression. Positive = the car is under the market by that much; negative = over it by that
 * much (the sign is carried by the word, never by the digits); rounding to 0 = at the market price.
 *
 * No band here: PRICE_ABOUT_EQUAL_BAND_PCT's only job is the "in its favour" test of §6 (2), and the text is as
 * exact as the rounding to hundreds — Eran, 28/09.
 */
export function priceExpression(deal_score: number | null, median_price: number | null): string | null {
  if (deal_score === null || median_price === null) return null;
  const amount = fairAmount(deal_score, median_price);
  if (amount === 0) return PRICE.at;
  return amount > 0 ? PRICE.below(num(amount)) : PRICE.above(num(-amount));
}

/** The amount the expression wrote, unsigned — `values.ils`. 0 for PRICE.at. */
export function priceValueIls(deal_score: number, median_price: number): number {
  return Math.abs(fairAmount(deal_score, median_price));
}

/**
 * §7 — the name texts.ts keeps, with its original non-null contract: before the move it could not receive a
 * null, and it still may not. Same output as priceExpression() for every input it accepts.
 */
export function fairLine(score: number, median_price: number): string {
  const line = priceExpression(score, median_price);
  if (line === null) throw new Error(`fairLine: score=${score}, median_price=${median_price} — both are required`);
  return line;
}

/**
 * §6.5 — the km sentence. `thousands` is the gap rounded to SENTENCE_ROUND_KM; 0 thousands is no sentence at
 * all. The DIRECTION comes from the gap's sign; whether the fact is in the car's favour comes from km_effect's
 * sign (positive = fewer km than the cell's median). The engine's slope is negative, so the two always agree;
 * a car that has them disagree is a broken invoice, said as such.
 */
export function kmSentence(facts: CarFacts, listing_id: number): { sentence: string; km: number } | null {
  if (facts.km_gap === null || facts.km_effect === null) return null;
  if (facts.km_gap > 0 && facts.km_effect > 0) {
    throw new Error(`justification: listing ${listing_id} — km_gap ${facts.km_gap} is above the median but km_effect ${facts.km_effect} is in the car's favour`);
  }
  if (facts.km_gap < 0 && facts.km_effect < 0) {
    throw new Error(`justification: listing ${listing_id} — km_gap ${facts.km_gap} is below the median but km_effect ${facts.km_effect} is against the car`);
  }
  const thousands = Math.round(facts.km_gap / SENTENCE_ROUND_KM);
  if (thousands === 0) return null;
  return { sentence: thousands > 0 ? KM.above(thousands) : KM.below(-thousands), km: thousands };
}
