// The pick cards' display library (BRIEF Run 1 §1) — every decision the three big cards of the
// recommendations screen rest on, as pure functions. The components only render what comes out of here, so
// `npm test` covers the cards without a DOM (there is no component-test harness: the runner collects
// `src/lib/**/*.test.ts` only).
//
// ONE TABLE, NOT TWO (§1.1). The card's colours, its label words and its order are the CAR PAGE's — read
// from src/lib/display/texts.ts, which already held all three before this run (CATEGORY_COLOR, BRONZE,
// CATEGORY_LABEL, pageColor) and is a library module, not a component or a page, so §1.1's move to a
// colors.ts of its own is not needed and no second table is written. The three names below are the aliases
// §1.1 spells, pointing at that one table; CATEGORY_ORDER is the selection library's own CATEGORY_PRIORITY —
// the order the picks were decided in is the order they are drawn in, and a second list of the same three
// codes could only drift from it.
//
// DISPLAY ONLY. Nothing here is ever compared against; Hebrew appears in the strings and never in a test of
// a value (CLAUDE.md). Every impossible input throws rather than rendering something plausible: a card with
// no category, a runner-up that is not pricier, a tint asked for a colour that has none.

import { CATEGORY_PRIORITY } from "@/lib/selection/constants";
import type { Category } from "@/lib/selection";
import { BRONZE, CATEGORY_COLOR, CATEGORY_LABEL, num, ownershipKind, OWNERSHIP_WORD, pageColor, shekel } from "./texts";

// ---------------------------------------------------------------------------
// §1.1 — the one table, under the brief's names
// ---------------------------------------------------------------------------

/** §1.1 — the slot order: המשתלם ביותר → ראש שקט → הכי חסכוני. The selection library's own priority order. */
export const CATEGORY_ORDER: readonly Category[] = CATEGORY_PRIORITY;

/** §1.1 — the category colours, as the car page paints them. */
export { CATEGORY_COLOR };

/** §1.1 — the one colour of a card that won more than one category: the car page's bronze. */
export const MULTI_COLOR = BRONZE;

/** §1.1 — the label words, as the car page words them. */
export const LABEL_TEXT = CATEGORY_LABEL;

// ---------------------------------------------------------------------------
// §1.2 — the card's colour
// ---------------------------------------------------------------------------

/**
 * §1.2 — one category → that category's colour; two or more → the bronze; none → a throw.
 *
 * It is pageColor() with the empty case removed: the car page paints a car with no label black, and a card
 * with no label is not a card at all — the grouping never makes one (§1.6), so arriving here with an empty
 * list is a bug and not a colour.
 */
export function cardColor(categories: readonly Category[]): string {
  if (categories.length === 0) throw new Error("cardColor: a card carries at least one category");
  return pageColor([...categories]);
}

// ---------------------------------------------------------------------------
// §1.3 — the runner-up strip's tint
// ---------------------------------------------------------------------------

export type RunnerUpTint = { bg: string; border: string };

/**
 * §1.3 — the two tints, read off the boards: the indigo one for a plain "הכי חסכוני" card and the bronze one
 * for a multi-winner card that includes it. Any other colour throws — the strip is only ever drawn on a card
 * whose categories include `cheapest`, so those are the only two colours it can be asked for.
 */
const RUNNER_UP_TINT: Readonly<Record<string, RunnerUpTint>> = {
  [CATEGORY_COLOR.cheapest]: { bg: "#eef0f8", border: "#cdd3ec" }, // #303577 — indigo
  [MULTI_COLOR]: { bg: "#f8f5ee", border: "#ece2cd" }, // #6e5118 — bronze
};

export function runnerUpTint(color: string): RunnerUpTint {
  const tint = RUNNER_UP_TINT[color];
  if (tint === undefined) {
    throw new Error(`runnerUpTint: no tint for ${color} — the runner-up strip is only drawn on a card that includes cheapest`);
  }
  return tint;
}

// ---------------------------------------------------------------------------
// §1.4 — the count line
// ---------------------------------------------------------------------------

/** §1.4 — the head of the screen, in place of a headline. `num()` is the km value's own formatter. */
export function countLine(carsShown: number): string {
  return `נבחרו מתוך ${num(carsShown)} רכבים.`;
}

// ---------------------------------------------------------------------------
// §1.5 — the runner-up strip's words
// ---------------------------------------------------------------------------

/**
 * §1.5 — the strip's one line, in two parts: the amount, which the strip weights and colours, and the rest,
 * which it does not. `fact` is the justification generator's seam (Days 22–23) — absent today, and then the
 * line ends at the identification with no comma left hanging.
 *
 * The year is allowed on this line as part of the identification and nowhere else on the strip
 * (findCar-now.md, "פס הסגן"). A runner-up is pricier than the pick by rule (part 3 §2b: the band lies above
 * C's price), so a non-positive amount is a broken record and not a strip that reads oddly.
 */
export function runnerUpParts(input: { amount: number; model: string; year: number | null; fact: string | null }): { lead: string; rest: string } {
  if (input.amount <= 0) throw new Error(`runnerUpParts: amount ${input.amount} — the runner-up is pricier than the pick by rule`);
  const identification = input.year === null ? input.model : `${input.model} ${input.year}`;
  return {
    lead: `בעוד ${shekel(input.amount)}`,
    rest: ` — ${identification}${input.fact === null ? "" : `, ${input.fact}`}`,
  };
}

// ---------------------------------------------------------------------------
// §1.6 — the cards, in slot order
// ---------------------------------------------------------------------------

/** One card: the listing it is about, every label it carries in CATEGORY_ORDER, and its one colour. */
export type Card<L> = { listing: L; categories: Category[]; color: string };

/**
 * §1.6 — the three categories in, nought to three cards out, in slot order.
 *
 * A listing that won more than one category is ONE card carrying all its labels, sitting at the slot of its
 * FIRST label; an empty category yields no card at all — no fourth slot, no dashed placeholder, no reason
 * line. So a double winner leaves two cards and a triple winner one, and §3.0's row centres them at the
 * three-card width rather than stretching them.
 *
 * The listing reference is compared by identity, which is what makes "the same listing" one card: a listing
 * id, or one shared object per listing.
 */
export function groupCards<L>(picks: Readonly<Record<Category, L | null>>): Card<L>[] {
  const cards: Card<L>[] = [];
  const slotOf = new Map<L, Card<L>>();
  for (const category of CATEGORY_ORDER) {
    const listing = picks[category];
    if (listing === null) continue;
    const already = slotOf.get(listing);
    if (already !== undefined) {
      already.categories.push(category);
      continue;
    }
    const card: Card<L> = { listing, categories: [category], color: "" };
    slotOf.set(listing, card);
    cards.push(card);
  }
  // The colour is decided once a card's labels are final: a double winner is bronze, and that is not known
  // until the last category has been read.
  for (const card of cards) card.color = cardColor(card.categories);
  return cards;
}

// ---------------------------------------------------------------------------
// §1.7 — X, the count line's number
// ---------------------------------------------------------------------------

/**
 * §1.7 — the cars the screen displays: distinct `car_id` over the rows Stage B KEPT (findCar-now.md,
 * "ראש מסך התוצאות", 25/09 — the three picks and everything the bottom list will draw, after merging ads by
 * plate; an ad Stage B took out of the results entirely is not a car the screen shows and is not counted).
 *
 * Cars, not ads: two surviving ads of one car count once, which is what "אחרי איחוד מודעות לפי לוחית" means —
 * and `car_id` IS the plate (schema: one car = one plate).
 */
export function shownCarsCount(rows: readonly { car_id: number; shown: boolean }[]): number {
  const cars = new Set<number>();
  for (const r of rows) if (r.shown) cars.add(r.car_id);
  return cars.size;
}

// ---------------------------------------------------------------------------
// §1.8 — the ownership words
// ---------------------------------------------------------------------------

/**
 * §1.8 — the ownership-type word, from the car page's own table (texts.ts, OWNERSHIP_WORD) and read the way
 * the page's no-history line reads it: an unknown code falls back to itself rather than vanishing. The table
 * already lives in the library, so nothing moved.
 */
export function ownershipWord(code: string): string {
  return OWNERSHIP_WORD[code] ?? code;
}

/**
 * The ownership the car page's legend marks `הבעלות הנוכחית`: the LAST row of the registry history that is
 * not a dealer row (a dealer row is not an ownership and carries no hand — texts.ts, legendLine()). Its
 * CODE; turning it into a word is ownershipWord()'s job, and the comparison here is on the code, never on
 * the Hebrew (CLAUDE.md).
 *
 * null when the history holds no such row — which on a pick cannot happen: since rules v5 a listing without
 * registry ownership history is ineligible for every category.
 */
export function currentOwnershipType(history: readonly { ym: string; type: string }[]): string | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (ownershipKind(history[i].type) !== "dealer") return history[i].type;
  }
  return null;
}
