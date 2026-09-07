// The pick loop (BRIEF §4.7): for each category in CATEGORY_PRIORITY, walk the eligible shown listings in the
// category's order; record double_winner and too_similar on every candidate examined; the first candidate not
// skipped wins. No candidate left → the pick is null and missing[category] = 'no_candidate'.

import { CATEGORY_PRIORITY, SIMILARITY_THRESHOLD } from "./constants";
import { categoryOrder } from "./order";
import type { Work } from "./rules";
import { distance } from "./similarity";
import type { Category, SelectionResult, TooSimilarEffect } from "./types";
import { RULE_TYPE } from "./types";

// The candidate set for a category: exactly the shown listings eligible for it (§2; the cheapest `>= 0` is part of
// eligibility since §11.3), in the category's order.
function candidatesFor(category: Category, shown: Work[]): Work[] {
  return shown.filter((w) => w.result.eligibility[category]).sort((a, b) => categoryOrder[category](a.input, b.input));
}

export function pick(shown: Work[], effect: TooSimilarEffect): Pick<SelectionResult, "picks" | "missing"> {
  const picks: Record<Category, number | null> = { best_value: null, peace_of_mind: null, cheapest: null };
  const missing: Partial<Record<Category, "no_candidate">> = {};
  const picked: { work: Work; category: Category }[] = []; // in category order

  for (const category of CATEGORY_PRIORITY) {
    const candidates = candidatesFor(category, shown);
    let winner: Work | null = null;
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      if (cand.result.category !== null) {
        cand.result.trace.push({
          rule: "double_winner",
          type: RULE_TYPE.double_winner,
          value: null,
          threshold: null,
          triggered: true,
          effect: "recategorized",
          context: { won: cand.result.category, considered_for: category, place_in_category: i + 1 },
        });
        continue;
      }
      let skip = false;
      for (const p of picked) {
        const d = distance(cand.input, p.work.input);
        const triggered = d !== null && d < SIMILARITY_THRESHOLD;
        cand.result.trace.push({
          rule: "too_similar",
          type: RULE_TYPE.too_similar,
          value: d,
          threshold: SIMILARITY_THRESHOLD,
          triggered,
          effect,
          context: { vs_listing_id: p.work.input.listing_id, vs_category: p.category, same_cell: d !== null },
        });
        if (effect === "excluded" && triggered) skip = true;
      }
      if (skip) continue;
      winner = cand;
      break;
    }
    if (winner === null) {
      picks[category] = null;
      missing[category] = "no_candidate";
    } else {
      winner.result.category = category;
      picks[category] = winner.input.listing_id;
      picked.push({ work: winner, category });
    }
  }
  return { picks, missing };
}
