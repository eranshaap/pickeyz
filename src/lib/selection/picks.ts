// The pick loop (BRIEF §4.7; part 3 §1): for each category in CATEGORY_PRIORITY, walk the eligible shown listings in the
// category's order; record double_winner and too_similar on every candidate examined; the first candidate not
// skipped wins. No candidate left → the pick is null and missing[category] = 'no_candidate'.
// Then §0.2's blocked_first (Day 14 rules v5), and the cheapest_runner_up rule (part 3 §2b), recorded on the
// cheapest pick — never acting.

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
import type { Category, DoubleWinnerEffect, MissingReason, SelectionResult, TooSimilarEffect } from "./types";
import { RULE_TYPE } from "./types";
import { cmpNullsLast, parseIso, round } from "./util";

// The candidate set for a category: exactly the shown listings eligible for it (§2; the condition floor is part of
// eligibility since §11.3, its value CONDITION_FLOOR since part 3 §2a, and from Days 22–23 rules v8 §0a it bars
// every category and not `cheapest` alone), in the category's order.
function candidatesFor(category: Category, shown: Work[]): Work[] {
  return shown.filter((w) => w.result.eligibility[category]).sort((a, b) => categoryOrder[category](a.input, b.input));
}

export function pick(
  shown: Work[],
  tooSimilarEffect: TooSimilarEffect,
  doubleWinnerEffect: DoubleWinnerEffect,
): Pick<SelectionResult, "picks" | "missing" | "runner_ups"> {
  const picks: Record<Category, number | null> = { best_value: null, peace_of_mind: null, cheapest: null };
  const missing: Partial<Record<Category, MissingReason>> = {};
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

  blockedFirst(shown, picks);
  return { picks, missing, runner_ups: { cheapest: cheapestRunnerUp(shown, picks.cheapest) } };
}

// Day 14 rules v5 (§0.2), as Days 22–23 rules v8 (§0a) generalises it — per BARRING RULE and per category, the
// counterfactual winner: the first listing in that category's order that passes every eligibility condition EXCEPT
// that rule. When it is not the actual winner, and the reason it is not is that rule (it is otherwise eligible and
// the rule is what bars it), THAT RULE's record carries blocked_first: [category, ...]. One extra read, per rule, of
// an order that already exists — no what-if machinery, no re-run. At most one listing per category PER RULE can
// carry it; one listing may carry several categories.
//
// A car barred by BOTH rules is first in NEITHER counterfactual set and carries nothing — which is the documents'
// "only the floor stopped it" read literally: the fact recorded is that this rule ALONE kept the car out.
const BARRING_RULES: readonly { rule: "unverified_history" | "condition_floor"; counterfactual: "without_unverified_history" | "without_condition_floor" }[] = [
  { rule: "unverified_history", counterfactual: "without_unverified_history" },
  { rule: "condition_floor", counterfactual: "without_condition_floor" },
];

function blockedFirst(shown: Work[], picks: Record<Category, number | null>): void {
  for (const { rule, counterfactual } of BARRING_RULES) {
    for (const category of CATEGORY_PRIORITY) {
      const first = shown
        .filter((w) => w.result.eligibility[counterfactual][category])
        .sort((a, b) => categoryOrder[category](a.input, b.input))[0];
      if (first === undefined) continue;
      if (first.input.listing_id === picks[category]) continue; // it won — nothing was blocked
      if (first.result.eligibility[category]) continue; // it is eligible and still did not win: some other rule, not this one
      const entry = first.result.trace.find((t) => t.rule === rule);
      if (entry === undefined) {
        throw new Error(`selection: listing ${first.input.listing_id} was first for ${category} but for ${rule}, and carries no record of the rule`);
      }
      const so_far = (entry.context.blocked_first as Category[] | undefined) ?? [];
      entry.context = { ...entry.context, blocked_first: [...so_far, category] };
    }
  }
}

// part 3 §2b — the runner-up of the cheapest pick C: among the shown listings eligible for cheapest, other than C's car,
// which since Day 14 rules v5 means fully pick-eligible — the thin-cell gate and unverified_history are both part of
// eligibility.cheapest (§5.5),
// AND — Days 20–21 rules v7 (§1.5) — OTHER THAN A ROW THAT WON A CATEGORY: a listing that is on the screen as a
// pick (any of the three; a double winner is one row) is never a candidate. With no candidate outside the picks
// the outcome is the same as an empty band. P1's also_won is gone with it — the case it recorded cannot occur.
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
    .filter(
      (w) =>
        w.result.eligibility.cheapest &&
        w.result.categories.length === 0 && // §1.5 — a pick is never its own runner-up, in any category
        w.input.car_id !== C.input.car_id &&
        w.input.price > C.input.price &&
        w.input.price <= ceiling,
    )
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
