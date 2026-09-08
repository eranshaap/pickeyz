// The pick loop (BRIEF §4.7; part 3 §1): for each category in CATEGORY_PRIORITY, walk the eligible shown listings in the
// category's order; record double_winner and too_similar on every candidate examined; the first candidate not
// skipped wins. No candidate left → the pick is null and missing[category] = 'no_candidate'.
// Then the cheapest_runner_up rule (part 3 §2b), recorded on the cheapest pick — never acting.

import {
  CATEGORY_PRIORITY,
  RUNNER_UP_DEAL_GAP,
  RUNNER_UP_PRICE_BAND_PCT,
  RUNNER_UP_ROUND_DECIMALS,
  SIMILARITY_THRESHOLD,
} from "./constants";
import { categoryOrder } from "./order";
import type { Work } from "./rules";
import { distance } from "./similarity";
import type { Category, DoubleWinnerEffect, SelectionResult, TooSimilarEffect } from "./types";
import { RULE_TYPE } from "./types";
import { cmpNullsLast, parseIso, round } from "./util";

// The candidate set for a category: exactly the shown listings eligible for it (§2; the cheapest bar is part of
// eligibility since §11.3, its value CHEAPEST_CONDITION_FLOOR since part 3 §2a), in the category's order.
function candidatesFor(category: Category, shown: Work[]): Work[] {
  return shown.filter((w) => w.result.eligibility[category]).sort((a, b) => categoryOrder[category](a.input, b.input));
}

export function pick(
  shown: Work[],
  tooSimilarEffect: TooSimilarEffect,
  doubleWinnerEffect: DoubleWinnerEffect,
): Pick<SelectionResult, "picks" | "missing" | "runner_ups"> {
  const picks: Record<Category, number | null> = { best_value: null, peace_of_mind: null, cheapest: null };
  const missing: Partial<Record<Category, "no_candidate">> = {};
  const picked: { work: Work; category: Category }[] = []; // in category order

  for (const category of CATEGORY_PRIORITY) {
    const candidates = candidatesFor(category, shown);
    let winner: Work | null = null;
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      let skip = false;
      if (cand.result.categories.length > 0) {
        // part 3 §1: recorded either way; under 'none' the car wins this category too, under 'recategorized' it is skipped.
        cand.result.trace.push({
          rule: "double_winner",
          type: RULE_TYPE.double_winner,
          value: null,
          threshold: null,
          triggered: true,
          effect: doubleWinnerEffect,
          context: { won: [...cand.result.categories], considered_for: category, place_in_category: i + 1 },
        });
        if (doubleWinnerEffect === "recategorized") continue;
      }
      for (const p of picked) {
        if (p.work === cand) continue; // the same listing: compared against itself as self, no distance recorded (part 3 §1)
        const d = distance(cand.input, p.work.input);
        const triggered = d !== null && d < SIMILARITY_THRESHOLD;
        cand.result.trace.push({
          rule: "too_similar",
          type: RULE_TYPE.too_similar,
          value: d,
          threshold: SIMILARITY_THRESHOLD,
          triggered,
          effect: tooSimilarEffect,
          context: { vs_listing_id: p.work.input.listing_id, vs_category: p.category, same_cell: d !== null },
        });
        if (tooSimilarEffect === "excluded" && triggered) skip = true;
      }
      if (skip) continue;
      winner = cand;
      break;
    }
    if (winner === null) {
      picks[category] = null;
      missing[category] = "no_candidate";
    } else {
      winner.result.categories.push(category);
      picks[category] = winner.input.listing_id;
      picked.push({ work: winner, category });
    }
  }

  return { picks, missing, runner_ups: { cheapest: cheapestRunnerUp(shown, picks.cheapest) } };
}

// part 3 §2b — the runner-up of the cheapest pick C: among the shown listings eligible for cheapest, other than C's car,
// priced in (C.price, C.price * (1 + band/100)], the one with the highest deal_score (ties → lower price → earlier
// first_seen_at → lower listing_id). Recorded on C; value = its deal_score − C's, threshold RUNNER_UP_DEAL_GAP. Never acts.
function cheapestRunnerUp(shown: Work[], cheapestId: number | null): SelectionResult["runner_ups"]["cheapest"] {
  if (cheapestId === null) return null; // no C → not evaluated, nothing recorded
  const C = shown.find((w) => w.input.listing_id === cheapestId);
  if (!C) throw new Error(`selection: cheapest pick ${cheapestId} is not among the shown listings`);
  const dealOf = (w: Work): number => {
    const d = w.input.breakdown.deal_score;
    if (d === null) throw new Error(`selection: listing ${w.input.listing_id} is eligible for cheapest but has no deal_score`);
    return d;
  };
  const ceiling = C.input.price * (1 + RUNNER_UP_PRICE_BAND_PCT / 100);
  const candidates = shown
    .filter((w) => w.result.eligibility.cheapest && w.input.car_id !== C.input.car_id && w.input.price > C.input.price && w.input.price <= ceiling)
    .sort(
      (a, b) =>
        cmpNullsLast(dealOf(a), dealOf(b), "desc") ||
        a.input.price - b.input.price ||
        parseIso(a.input.first_seen_at, a.input.listing_id) - parseIso(b.input.first_seen_at, b.input.listing_id) ||
        a.input.listing_id - b.input.listing_id,
    );
  if (candidates.length === 0) {
    C.result.trace.push({
      rule: "cheapest_runner_up",
      type: RULE_TYPE.cheapest_runner_up,
      value: null,
      threshold: RUNNER_UP_DEAL_GAP,
      triggered: false,
      effect: "none",
      context: { evaluated: false, reason: "no_candidate_in_band", band_pct: RUNNER_UP_PRICE_BAND_PCT },
    });
    return null;
  }
  const ru = candidates[0];
  const gap = round(dealOf(ru) - dealOf(C), RUNNER_UP_ROUND_DECIMALS);
  const price_over_pct = round(((ru.input.price - C.input.price) / C.input.price) * 100, RUNNER_UP_ROUND_DECIMALS);
  const triggered = gap >= RUNNER_UP_DEAL_GAP;
  C.result.trace.push({
    rule: "cheapest_runner_up",
    type: RULE_TYPE.cheapest_runner_up,
    value: gap,
    threshold: RUNNER_UP_DEAL_GAP,
    triggered,
    effect: "none",
    context: { runner_up: ru.input.listing_id, price_over_pct, band_pct: RUNNER_UP_PRICE_BAND_PCT },
  });
  return { listing_id: ru.input.listing_id, gap, price_over_pct, triggered };
}
