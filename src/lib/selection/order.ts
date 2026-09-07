// The orders Stage B sorts by: the Stage A order (BRIEF §4.2, also the final rank §4.6), the per-category
// candidate orders with their tie-breaks (§2), and the representative order (§4.5).
// Every order ends in listing_id, so it is total and the result is deterministic.

import type { CandidateListing, Category } from "./types";
import { cmpNullsLast, parseIso } from "./util";

type Cmp = (a: CandidateListing, b: CandidateListing) => number;

const byPriceAsc: Cmp = (a, b) => a.price - b.price;
const byFirstSeenAsc: Cmp = (a, b) => parseIso(a.first_seen_at, a.listing_id) - parseIso(b.first_seen_at, b.listing_id);
const byListingIdAsc: Cmp = (a, b) => a.listing_id - b.listing_id;
const byDealScoreDesc: Cmp = (a, b) => cmpNullsLast(a.breakdown.deal_score, b.breakdown.deal_score, "desc");
const byConditionDesc: Cmp = (a, b) => cmpNullsLast(a.breakdown.condition_score, b.breakdown.condition_score, "desc");
const byRealityDesc: Cmp = (a, b) => cmpNullsLast(a.breakdown.condition_by_reality, b.breakdown.condition_by_reality, "desc");
const byVsTypicalDesc: Cmp = (a, b) => cmpNullsLast(a.breakdown.condition_vs_typical, b.breakdown.condition_vs_typical, "desc");

function chain(...cmps: Cmp[]): Cmp {
  return (a, b) => {
    for (const c of cmps) {
      const r = c(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
}

// §4.2 (as answered in §11.2): the same tie-breaks as best_value — deal_score desc → condition_score desc → price asc →
// first_seen_at asc → listing_id asc; nulls last at each nullable step, so the null deal_scores are ordered among themselves
// by condition_score desc → price → first_seen_at → listing_id. Consequence: the best_value pick is always rank 1 among shown.
export const stageAOrder: Cmp = chain(byDealScoreDesc, byConditionDesc, byPriceAsc, byFirstSeenAsc, byListingIdAsc);

// §2: the category key, then its tie-breaks, in order. best_value's order is the Stage A order (§11.2).
export const categoryOrder: Readonly<Record<Category, Cmp>> = {
  best_value: stageAOrder,
  peace_of_mind: chain(byRealityDesc, byPriceAsc, byFirstSeenAsc, byListingIdAsc),
  cheapest: chain(byPriceAsc, byVsTypicalDesc, byFirstSeenAsc, byListingIdAsc),
};

// §4.5: representative of a car among its surviving listings — lowest price, tie → earliest first_seen_at, tie → lowest listing_id.
export const representativeOrder: Cmp = chain(byPriceAsc, byFirstSeenAsc, byListingIdAsc);
