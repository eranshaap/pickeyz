// The screen's display strings and formats (BRIEF Days 15–16, Run 2b §5).
//
// SCHEMA PART E: every field with a closed set of values stores a short ENGLISH CODE. Hebrew exists only
// here, in display. Nothing in this file is ever compared against — it is read on the way out and no code
// path reads it back in. One object per coded field, so that a missing code is visible as a hole in one map
// and not as a stray string somewhere in a component.
//
// The wording of an empty category's reason is NOT here: §5 says the raw code from selectThree is shown as
// it comes (the wording is Days 20–23), and a translation table for it would be exactly the product decision
// this run is told not to take.

import type { Category } from "@/lib/selection";
import type { FilterName } from "@/app/actions/search";

// listing_scores / search_results recommendation_categories (§5)
export const CATEGORY_LABEL: Readonly<Record<Category, string>> = {
  best_value: "המשתלם ביותר",
  peace_of_mind: "ראש שקט",
  cheapest: "הכי חסכוני",
};

// dealers.dealer_type (§0.6): private is a person, anything else is a lot.
export function sellerKind(dealer_type: string): string {
  return dealer_type === "private" ? "פרטי" : "מגרש";
}

// The four filters, in the display order §0.5 breaks its ties by.
export const FILTER_LABEL: Readonly<Record<FilterName, string>> = {
  price: "מחיר",
  years: "שנתון",
  kmMax: 'ק"מ',
  regions: "אזור",
};

// Thousands separators, done here rather than through Intl: the same string has to come out of the server
// render and the client render, and a locale lookup is the classic way for those two to disagree.
export function num(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const shekel = (n: number): string => `${num(n)} ₪`;
export const km = (n: number): string => `${num(n)} ק״מ`;
