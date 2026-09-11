// Stage A scoring engine (BRIEF Day 11): one listing -> one invoice.
//
// Every row is in the same unit — percent of the car's value, positive = in the buyer's favor —
// and the sums are plain additions. No normalization, no weights. A row that cannot be computed is
// unavailable with a reason; nothing is ever substituted for it.
//
// Sums (§5, as amended Day 14 §3.4):
//   condition_score      = history + km              (null if history unavailable; history alone, partial ['km'], if km unavailable)
//   condition_by_reality = history.value_by_reality + km   (Day 12 §2: same formula, the reality history in place of the paper one; null whenever condition_score is null)
//   typical_history      = market.median_history     (only when the price row is available and the value is not null)
//   condition_vs_typical = (history - typical_history) + km
//   price_advantage      = price row value
//   deal_score           = price_advantage + condition_vs_typical
//
// Day 14 (§0.2): the typical is the median HISTORY row, not the median condition. The km row is already a
// deviation from the cell's median_km, so it is not centred a second time — it enters condition_vs_typical
// as it is, and only the history row is measured against the typical.
//
// Pure: no Prisma, no database, no I/O. The result object is what listings.score_breakdown stores.

import { handCheck, kmCheck, kmFacts } from "./checks";
import { confidence } from "./confidence";
import { ENGINE_VERSION } from "./constants";
import { historyRow } from "./history";
import { kmRow } from "./km";
import { priceRow } from "./price";
import { soldSignal } from "./sold";
import type { Row, ScoreResult, ScoringInput } from "./types";
import { dateToIso, monthsBetween, round } from "./util";

export type { Check, ConfidenceItem, ConfidenceLevel, Deduction, OwnershipRow, OwnershipType, Row, ScoreResult, ScoringInput, SellerType, SoldSignal } from "./types";
export { historyRow } from "./history";
export { kmRow } from "./km";
export { priceRow } from "./price";

function valueOf(row: Row): number | null {
  return row.status === "scored" && typeof row.value === "number" ? row.value : null;
}

export function scoreListing(input: ScoringInput, now: Date): ScoreResult {
  const price = priceRow(input, now);
  const history = historyRow(input);
  const km = kmRow(input, now);
  const rows: Row[] = [price, history, km];

  // §18.8: a fired sold signal skips both checks; otherwise they run on the full record.
  const sold = soldSignal(input, now);
  const checks = [handCheck(input, sold), kmCheck(input, now, sold)];

  // §5 sums
  const historyValue = valueOf(history);
  const kmValue = valueOf(km);
  const partial: string[] = [];
  let condition_score: number | null = null;
  if (historyValue !== null) {
    if (kmValue !== null) condition_score = round(historyValue + kmValue);
    else {
      condition_score = round(historyValue);
      partial.push("km");
    }
  }
  // Day 12 §2: the reality sum follows condition_score exactly — same km handling, null when it is null.
  let condition_by_reality: number | null = null;
  if (condition_score !== null) {
    if (typeof history.value_by_reality !== "number") {
      throw new Error(`scoreListing: history row is scored (value ${historyValue}) but has no value_by_reality`);
    }
    condition_by_reality = kmValue !== null ? round(history.value_by_reality + kmValue) : round(history.value_by_reality);
  }
  const price_advantage = valueOf(price);
  // §3.4: the typical is the cell's median history row. A thin cell has a price row (the anchor) but no
  // median_history, so its listings get no typical, no condition_vs_typical and no deal score (§0.5).
  const typical_history =
    price_advantage !== null && input.market !== null && input.market.median_history !== null ? round(input.market.median_history) : null;
  // (history − typical) + km, in one rounding: the km row is a deviation already and is not centred again.
  const condition_vs_typical =
    historyValue !== null && typical_history !== null ? round(historyValue - typical_history + (kmValue ?? 0)) : null;
  const deal_score = price_advantage !== null && condition_vs_typical !== null ? round(price_advantage + condition_vs_typical) : null;

  // §9 facts
  const kf = kmFacts(input, now);
  const dealer_transfers = history.status === "scored" && typeof history.raw.dealer_transfers === "number" ? history.raw.dealer_transfers : null;
  const facts: ScoreResult["facts"] = {
    dealer_transfers,
    months_since_test: kf.months_since_test,
    km_per_month_since_test: kf.km_per_month_since_test === null ? null : round(kf.km_per_month_since_test),
    test_expiry: input.car.test_expiry === null ? null : dateToIso(input.car.test_expiry),
    months_left: input.car.test_expiry === null ? null : Math.max(monthsBetween(now, input.car.test_expiry), 0),
  };

  const result: ScoreResult = {
    engine_version: ENGINE_VERSION,
    unit: "pct_of_value",
    rows,
    condition_score,
    condition_by_reality,
    typical_history,
    condition_vs_typical,
    price_advantage,
    deal_score,
    checks,
    sold_signal: sold,
    facts,
    confidence: confidence(rows, checks, sold),
  };
  if (partial.length) result.partial = partial;
  return result;
}
