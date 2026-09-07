// The per-listing rules (BRIEF §4.3 below_threshold, §4.4 dealer_not_visible) and the merge by car (§4.5).
// Each function works on the mutable working record of a listing and appends to its trace.

import { BELOW_THRESHOLD_FLOOR_PCT, BELOW_THRESHOLD_ROUND_DECIMALS } from "./constants";
import { representativeOrder } from "./order";
import type { CandidateListing, ListingResult, RuleTrace } from "./types";
import { RULE_TYPE } from "./types";
import { round } from "./util";

// The working record: the input listing plus the result being built for it.
export type Work = { input: CandidateListing; result: ListingResult };

// §4.3 — value = round(price / median_price * 100, 1); triggered = value < floor → excluded. No median → not evaluated.
export function belowThreshold(w: Work): void {
  const { input, result } = w;
  const entry: RuleTrace = {
    rule: "below_threshold",
    type: RULE_TYPE.below_threshold,
    value: null,
    threshold: BELOW_THRESHOLD_FLOOR_PCT,
    triggered: false,
    effect: "none",
    context: {},
  };
  if (input.median_price === null) {
    entry.context = { evaluated: false, reason: "no_median_price" };
  } else {
    const value = round((input.price / input.median_price) * 100, BELOW_THRESHOLD_ROUND_DECIMALS);
    entry.value = value;
    entry.triggered = value < BELOW_THRESHOLD_FLOOR_PCT;
    entry.context = { evaluated: true, price: input.price, median_price: input.median_price };
    if (entry.triggered) {
      entry.effect = "excluded";
      if (result.status !== "excluded") {
        result.status = "excluded";
        result.excluded_by = "below_threshold";
      }
    }
  }
  result.trace.push(entry);
}

// §4.4 — seller_visible === false → excluded; value = the Stage A place the listing had. Hides a listing, never a car.
export function dealerNotVisible(w: Work): void {
  const { input, result } = w;
  const triggered = input.seller_visible === false;
  const entry: RuleTrace = {
    rule: "dealer_not_visible",
    type: RULE_TYPE.dealer_not_visible,
    value: result.stage_a_place,
    threshold: null,
    triggered,
    effect: triggered ? "excluded" : "none",
    context: { evaluated: true, seller_visible: input.seller_visible },
  };
  if (triggered && result.status !== "excluded") {
    result.status = "excluded";
    result.excluded_by = "dealer_not_visible";
  }
  result.trace.push(entry);
}

// §4.5 — group the survivors by car_id; the representative is the lowest price (tie → earliest first_seen_at → lowest listing_id).
// The other listings of the car are merged into it. Returns the representatives, one per car.
export function mergeByCar(survivors: Work[]): Work[] {
  const byCar = new Map<number, Work[]>();
  for (const w of survivors) {
    const list = byCar.get(w.input.car_id);
    if (list) list.push(w);
    else byCar.set(w.input.car_id, [w]);
  }
  const representatives: Work[] = [];
  for (const group of byCar.values()) {
    const sorted = [...group].sort((a, b) => representativeOrder(a.input, b.input));
    const rep = sorted[0];
    const rest = sorted.slice(1);
    representatives.push(rep);
    if (rest.length === 0) continue; // a car with a single surviving listing: no duplicate entry (§3, §4.5)
    rep.result.trace.push({
      rule: "duplicate",
      type: RULE_TYPE.duplicate,
      value: null,
      threshold: null,
      triggered: false,
      effect: "none",
      context: { absorbed: rest.map((r) => r.input.listing_id) },
    });
    for (const r of rest) {
      r.result.status = "merged";
      r.result.rank = null;
      r.result.trace.push({
        rule: "duplicate",
        type: RULE_TYPE.duplicate,
        value: null,
        threshold: null,
        triggered: true,
        effect: "merged",
        context: { merged_into: rep.input.listing_id },
      });
    }
  }
  return representatives;
}
