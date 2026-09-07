// The price row (BRIEF §4.1): the asking price against the cell's median, as % of value.
// Positive = cheaper than the median = in the buyer's favor.

import { MIN_SAMPLE } from "./constants";
import type { Row, ScoringInput } from "./types";
import { round } from "./util";

export function priceRow(input: ScoringInput): Row {
  const { listing, market } = input;
  if (market === null) {
    return { row: "price", status: "unavailable", reason: "no_market_row", raw: { price: listing.price } };
  }
  const raw = {
    price: listing.price,
    median_price: market.median_price,
    market_stats_id: market.id,
    sample_size: market.sample_size,
    window_days: market.window_days,
  };
  if (market.sample_size < MIN_SAMPLE) return { row: "price", status: "unavailable", reason: "thin_cell", raw };
  if (market.median_price <= 0) throw new Error(`price row: market_stats ${market.id} has median_price ${market.median_price}`);
  const value = (-100 * (listing.price - market.median_price)) / market.median_price;
  return { row: "price", status: "scored", source: "market", value: round(value), raw };
}
