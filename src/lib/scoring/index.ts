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
// Day 18 (§8): a car with cancelled_at is not scored — the invoice is the cancelled one (types.ts,
// CancelledResult): the date, no rows, no sums, no confidence. It is a recorded outcome, not a skip.
//
// Day 18 (§3.3, §9) facts: current_owner_registry = car.current_owner_type as received (no rule reads it);
// color_changed_reported when history 1 says the colour changed; color_mismatch when the ad's colour family
// and the registry's are both known and differ — also one confidence item. An unknown side (null, or a word
// not in src/lib/mot/colors.ts) is no comparison.
//
// Day 19 (§3) — the clock freeze: scoreListing takes no clock. Every number is paired with the car's age on
// the day that number was observed, and each site reads its own date off the input: the km row and the
// months since the last test at listing.km_observed_at, the anchor price row at listing.price_observed_at,
// the sold window back from listing.first_seen_at. The months-left fact is gone — it is the one fact that
// depends on the day of viewing, so the invoice keeps facts.test_expiry and the display layer counts.
//
// Pure: no Prisma, no database, no I/O. The result object is what listings.score_breakdown stores.

import { colorFamily } from "../mot/colors";
import { handCheck, kmCheck, kmFacts } from "./checks";
import { confidence } from "./confidence";
import { ENGINE_VERSION } from "./constants";
import { historyRow } from "./history";
import { kmRow } from "./km";
import { priceRow } from "./price";
import { soldSignal } from "./sold";
import type { CancelledResult, ColorMismatch, Invoice, Row, ScoreResult, ScoringInput } from "./types";
import { dateToIso, round } from "./util";

export type { AnchorPoint, CancelledResult, Check, ConfidenceItem, ConfidenceLevel, Deduction, Invoice, OwnershipRow, OwnershipType, Row, ScoreResult, ScoringInput, SellerType, SoldSignal } from "./types";
export { isCancelled } from "./types";
export { historyRow } from "./history";
export { kmRow } from "./km";
export { priceRow } from "./price";

function valueOf(row: Row): number | null {
  return row.status === "scored" && typeof row.value === "number" ? row.value : null;
}

// Day 18 (§9): the colour comparison — null when either side's family is unknown.
export function colorMismatch(car: ScoringInput["car"]): ColorMismatch | null {
  const adFamily = colorFamily(car.color);
  const registryFamily = colorFamily(car.registry_color);
  if (adFamily === null || registryFamily === null || adFamily === registryFamily) return null;
  return { ad: car.color as string, registry: car.registry_color as string, ad_family: adFamily, registry_family: registryFamily };
}

export function scoreListing(input: ScoringInput): Invoice {
  // §8: a cancelled car — no rows, no sums, no confidence.
  if (input.car.cancelled_at !== null) {
    const cancelled: CancelledResult = {
      engine_version: ENGINE_VERSION,
      reason: "cancelled",
      cancelled_at: dateToIso(input.car.cancelled_at),
      rows: [],
      condition_score: null,
      condition_by_reality: null,
      typical_history: null,
      condition_vs_typical: null,
      price_advantage: null,
      deal_score: null,
      confidence: null,
    };
    return cancelled;
  }
  return scoreRows(input);
}

function scoreRows(input: ScoringInput): ScoreResult {
  const price = priceRow(input);
  const history = historyRow(input);
  const km = kmRow(input);
  const rows: Row[] = [price, history, km];

  // §18.8: a fired sold signal skips both checks; otherwise they run on the full record.
  const sold = soldSignal(input);
  const checks = [handCheck(input, sold), kmCheck(input, sold)];

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
  const kf = kmFacts(input);
  const dealer_transfers = history.status === "scored" && typeof history.raw.dealer_transfers === "number" ? history.raw.dealer_transfers : null;
  const facts: ScoreResult["facts"] = {
    dealer_transfers,
    months_since_test: kf.months_since_test,
    km_per_month_since_test: kf.km_per_month_since_test === null ? null : round(kf.km_per_month_since_test),
    // Day 19 (§3.7): the date, not a count of months from today — the months left are computed at display.
    test_expiry: input.car.test_expiry === null ? null : dateToIso(input.car.test_expiry),
    current_owner_registry: input.car.current_owner_type,
  };
  if (input.car.color_changed === true) facts.color_changed_reported = true;
  const mismatch = colorMismatch(input.car);
  if (mismatch !== null) facts.color_mismatch = mismatch;

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
    confidence: confidence(rows, checks, sold, mismatch !== null),
  };
  if (partial.length) result.partial = partial;
  return result;
}
