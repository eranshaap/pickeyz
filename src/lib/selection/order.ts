// The orders Stage B sorts by: the Stage A order (BRIEF §4.2, also the final rank §4.6), the per-category
// candidate orders with their tie-breaks (§2), and the representative order (§4.5).
// Every order ends in listing_id, so it is total and the result is deterministic.

import { NO_DEAL_ORDER } from "./constants";
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

// §4.2 (as answered in §11.2), for the listings that HAVE a deal score: deal_score desc → condition_score desc (from the
// invoice — Day 14 run B: the listings column is gone, the sum was always the same value) → price asc → first_seen_at asc →
// listing_id asc.
const rankedOrder: Cmp = chain(byDealScoreDesc, byConditionDesc, byPriceAsc, byFirstSeenAsc, byListingIdAsc);

// Day 14 rules v5 (§0.3): the tail — the listings with no deal score — is ordered by NO_DEAL_ORDER, ties by
// first_seen_at (oldest first), then listing_id. The map makes the constant the thing that decides, not a comment.
const NO_DEAL_CMP: Readonly<Record<typeof NO_DEAL_ORDER, Cmp>> = {
  price_asc: chain(byPriceAsc, byFirstSeenAsc, byListingIdAsc),
};
const noDealOrder: Cmp = NO_DEAL_CMP[NO_DEAL_ORDER];

// The Stage A order (also the final rank, §4.6): everything with a deal score first, in rankedOrder; then the tail, in
// noDealOrder. Replaces run A's fall-through, which ordered the tail by condition_score and then price.
// The best_value pick is no longer always rank 1: a listing the rules v5 eligibility bars keeps its rank above it (§0.1).
export const stageAOrder: Cmp = (a, b) => {
  const da = a.breakdown.deal_score;
  const db = b.breakdown.deal_score;
  if (da === null && db === null) return noDealOrder(a, b);
  if (da === null) return 1;
  if (db === null) return -1;
  return rankedOrder(a, b);
};

// §2: the category key, then its tie-breaks, in order. best_value's order is the Stage A order (§11.2).
export const categoryOrder: Readonly<Record<Category, Cmp>> = {
  best_value: stageAOrder,
  peace_of_mind: chain(byRealityDesc, byPriceAsc, byFirstSeenAsc, byListingIdAsc),
  cheapest: chain(byPriceAsc, byVsTypicalDesc, byFirstSeenAsc, byListingIdAsc),
};

// §4.5: representative of a car among its surviving listings — lowest price, tie → earliest first_seen_at, tie → lowest listing_id.
export const representativeOrder: Cmp = chain(byPriceAsc, byFirstSeenAsc, byListingIdAsc);
