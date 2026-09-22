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

import type { FilterName } from "@/app/actions/search";

// Run 6b §8: the category labels and the number formats moved into the display library, where every wording
// and display decision of §6–§7 lives and is tested. They are re-exported from here so that everything that
// already reads them keeps reading them from one place — there is ONE implementation, not two, and the
// server render and the client render cannot disagree about a separator.
export { CATEGORY_LABEL, km, num, shekel } from "@/lib/display/texts";

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

