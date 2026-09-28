// The justification generator (BRIEF Days 22–23, Run 2) — the contract (§1).
//
// Pure: no database, no clock, no network, no randomness. The generator RECOMPUTES NO SCORE: every number it
// writes is read off the invoice the engine stored or counted over the search's own cars. The same input gives
// the same output, every time.
//
// The input is the same shape at search time (Run 5 builds it from selectThree()'s results and the candidates)
// and from stored rows (the car page builds it from search_results plus the invoice behind listing_scores_id and
// the norm behind market_stats_id).

import type { Category, RuleTrace } from "@/lib/selection";
import type { Invoice } from "@/lib/scoring/types";

/** One car of the search, as the generator reads it — the same shape at search time and from stored rows. */
export type JustificationCar = {
  listing_id: number;
  /** The stored rank. null = hidden (merged or excluded): such a car is ignored — not counted, no output row. */
  rank: number | null;
  /** recommendation_categories; empty = not a pick. */
  categories: readonly Category[];
  /** price_snapshot — the price the selection ranked; every price comparison in the library uses it. */
  price: number;
  /** km_snapshot — the km the selection saw; null when the ad states none. */
  km: number | null;
  /** The invoice the selection read (listing_scores.breakdown): scored, or the cancelled one. */
  invoice: Invoice;
  /** This car's rule records — full at search time, as stored on the car-page path; a triggered record is always present in both. */
  trace: readonly RuleTrace[];
  /** market_stats.median_price of the car's norm row — the shekel figure's second factor; null when there is no norm row. */
  median_price: number | null;
};

export type JustificationSearch = {
  /** true = three cards were crowned; false = one of the uncrowned screens (no picks, no tag, no runner-up). */
  crowned: boolean;
  /** The runner-up's listing id (what storedRunnerUpListing() answers), or null. */
  runner_up: number | null;
  /** filters.priceMax is set — "בתקציב"; otherwise "בחיפוש". */
  has_price_ceiling: boolean;
  cars: readonly JustificationCar[];
};

export type SentenceKind = "rule_cancelled" | "rule_no_history" | "rule_floor" | "pick_reason" | "max_effect" | "no_price_ownership" | "no_price_km" | "empty";
export type FactFamily = "price" | "ownership" | "km" | "date";
/** The numbers inside the sentence, for the measurement queries (Run 4 stores them as JSON). */
export type SentenceValues = { ils?: number; km?: number; one_of?: number; of?: number; hand?: number };

export type CarJustification = {
  listing_id: number;
  kind: SentenceKind;
  fact: FactFamily | null;   // null exactly when kind is "empty"
  sentence: string;          // "" when empty; never contains a newline
  tag: string;               // "" or TAG_CHEAPER_THAN_CHEAPEST, verbatim
  values: SentenceValues;
  page: {
    /** The car page's line under the price. null for a cancelled car and a thin cell — the page keeps its own texts there. */
    price_line: string | null;
    /** The "למה" section's lines, in order; empty = the section is not drawn. */
    why_lines: string[];
  };
};

export type JustificationOutput = {
  generator_version: number;
  /** One per car with rank !== null, in input order. */
  cars: CarJustification[];
  /** The fact on the "הכי חסכוני" card's bar — a fact about the runner-up; null when there is no runner-up or no fact explains most of the gap. */
  runner_up_fact: string | null;
};

export type Finding = { check: string; listing_id: number | null; detail: string };
