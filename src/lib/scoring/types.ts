// Stage A scoring engine — shared shapes (BRIEF Day 11, §2, §4, §7, §9).
// Pure TypeScript: no Prisma, no database, no I/O. Inputs are plain objects.

import type { OwnershipCode } from "../mot/translator";
import type { ENGINE_VERSION } from "./constants";

// The brief calls this OwnershipType; the existing union in the repo is OwnershipCode (src/lib/mot/translator.ts).
export type OwnershipType = OwnershipCode;

export type OwnershipRow = { type: OwnershipType; ym: string }; // ym = 'YYYY-MM'

// Who is selling (§18.3). The script derives it from the joined dealers row: dealer_type 'private' →
// 'private', anything else → 'dealer'. 'fleet_company' is never produced until Day 28's classification.
export type SellerType = "dealer" | "private" | "fleet_company";

// Day 14 (§0.1): three norm levels, each keyed at its own level. The engine reads all three and the
// score points at the row it used from each. None of them is derivable from another.

// The cell: one row per (comparison_group × year). market_stats.
export type CellNorm = {
  id: number;
  median_price: number;
  median_km: number | null;
  median_history: number | null; // Day 14 (§0.2): the typical, replacing median_condition
  sample_size: number;
  window_days: number;
  group_version: number; // carried with the row; the engine does not read it — the loader checks it (§6.1)
  engine_version: number;
};

// The model: one row per (make, model). model_stats. Absent when the norms run wrote none for this model.
export type ModelNorm = {
  id: number;
  km_slope: number | null; // signed as measured (more km → negative); null when nothing could be measured
  km_slope_n: number; // listings in the regression; below KM_SLOPE_MIN_SAMPLE the engine uses the default instead
};

// Day 18 (§5): one model-year point of the fit, as pool_stats.anchor_points stores it. The engine applies the
// anchor only to a listing whose (make, model, year) is one of these points — the gate is the model-year.
export type AnchorPoint = { make: string; model: string; year: number; n: number; ratio: number; median_age: number };

// The pool: one row per norms run — the anchor curve. pool_stats. Absent before the first v3 norms run.
// All five values are null together (P4) when the curve could not be fitted.
export type PoolNorm = {
  id: number;
  anchor_ratio_intercept: number | null;
  anchor_ratio_per_year: number | null;
  anchor_error_pct: number | null;
  anchor_age_min_years: number | null; // Day 18 (§5): a description of the fit, no longer a gate
  anchor_age_max_years: number | null;
  anchor_points: AnchorPoint[] | null; // Day 18 (§5): the fitted points; null on a row written before the column existed
  anchor_n: number; // model-year POINTS the line was fitted through; the engine records it, never reads it
  anchor_listings: number; // listings behind those points — coverage, not the fit's n
};

// Day 19 (Run 5c2, §1.1) — one odometer reading the tester recorded: the car's km on the day of that test.
// car_test_readings holds every pair ever read; cars keeps only the latest one.
export type TestReading = { test_date: Date; km: number };

export type ScoringInput = {
  listing: {
    id: number;
    price: number;
    km_declared: number | null;
    hand_declared: number | null; // Day 14 (§0.4): recorded, never scored — the declared hand enters no row
    first_seen_at: Date;
    // Day 19 (§1.1) — the clock freeze: every number is paired with the car's age on the day that number was
    // observed, so the two observation dates are inputs like the numbers themselves.
    km_observed_at: Date; // listings.km_observed_at — the first sighting, then the day of each km change
    price_observed_at: Date; // the day the listing's CURRENT price was observed (its latest listing_price_history row)
    seller_type: SellerType;
    owners_at_first_seen: number | null;
    new_price: number | null; // Day 14 (§3.2): the car's new list price, the join select-three.ts uses; null when no row matches
    new_car_price_id: number | null; // the new_car_prices row new_price came from
  };
  car: {
    make: string; // Day 18 (§5): models.make — with model and year, the anchor point the listing belongs to
    model: string; // models.model
    year: number;
    hand: number | null;
    ownership_history: OwnershipRow[] | null; // oldest first
    km_at_last_test: number | null;
    mivchan_acharon_dt: Date | null;
    // Day 19 (Run 5c2, §1.1): every test reading known for the car, oldest first. OPTIONAL on purpose — when it
    // is absent the engine reads the pair above as the one known reading, so a hand-built input keeps its meaning.
    // Production never omits it: the mapper's row type requires the relation (scoring-input.ts, CarRowLike).
    test_readings?: TestReading[];
    first_registration: Date | null;
    test_expiry: Date | null;
    cancelled_at: Date | null; // Day 18 (§8): filled -> the cancelled invoice, no rows and no sums
    color: string | null; // Day 18 (§9): the ad's word (cars.color)
    registry_color: string | null; // the registry's word (cars.registry_color = tzeva_rechev)
    color_changed: boolean | null; // history 1 shnui_zeva_ind (cars.color_changed); null = unknown
    current_owner_type: OwnershipType | null; // Day 18 (§3.3): the registry's current holder, recorded as a fact; no rule reads it in v4
  };
  market: CellNorm | null;
  model_stats: ModelNorm | null;
  pool_stats: PoolNorm | null;
};

export type RowName = "price" | "history" | "km";
// 'anchor'  — Day 14 (§0.5): the price row of a thin cell, against the new-car price through the pool curve.
// 'typical' — Day 14 (§0.4): the history row of a car with no registry history, taken from the cell's median.
export type RowSource = "market" | "mot" | "ad" | "anchor" | "typical";

// Every row: percent of the car's value, positive = in the buyer's favor, rounded to ROUND_DECIMALS.
export type Row = {
  row: RowName;
  status: "scored" | "unavailable";
  source?: RowSource;
  value?: number;
  value_by_reality?: number; // history row only (Day 12 §2): the reality reading; absent exactly when value is absent
  reason?: string; // when unavailable
  partial?: string[]; // what could not be included
  note?: string; // Day 14 (§0.4, §0.5, §9.9): how a substituted row must be shown, as a CODE the display layer maps to text: 'assumed_typical' | 'vs_new_price'. The error percentage the second one needs is raw.error_pct.
  raw: Record<string, unknown>;
};

export type DeductionRule = "largest_in_full" | "halved" | "bonus";
export type Deduction = { for: string; pct: number; applied: number; rule: DeductionRule };

export type Check = {
  check: "hand" | "km";
  status: "match" | "mismatch" | "unavailable" | "skipped"; // skipped (§18.8): the sold signal fired — reason sold | possibly_sold
  kind?: string; // on mismatch
  counts?: boolean; // on mismatch — from the KINDS tables
  reason?: string; // on unavailable or skipped
  declared?: number;
  official?: number;
  diff?: number;
  official_date?: string; // km: the test date of the reading the check used (Run 5c2 §1.4 — the chosen reading, not necessarily the latest test)
  raw?: Record<string, unknown>;
};

export type SoldStrength = "strong" | "medium" | null;
export type SoldSignal = { strength: SoldStrength; evidence: string[] };

export type ConfidenceLevel = "high" | "medium" | "low";
// 'assumed_typical' — Day 14 (§3.5): the history row was taken from the cell's typical, not from the car's
// own record. It replaces 'unverified_source' for that car; the two never appear together.
// 'color_mismatch' — Day 18 (§9): the ad's colour family and the registry's are both known and differ.
export type ConfidenceItemKind = "missing_row" | "counted_mismatch" | "unverified_source" | "possibly_sold" | "assumed_typical" | "color_mismatch";
export type ConfidenceItem = { kind: ConfidenceItemKind; ref: string };

export type ScoreResult = {
  engine_version: typeof ENGINE_VERSION;
  unit: "pct_of_value";
  rows: Row[]; // price, history, km — always all three, scored or unavailable
  condition_score: number | null;
  condition_by_reality: number | null; // Day 12 §2: history value_by_reality + km, same formula as condition_score; null whenever condition_score is null
  typical_history: number | null; // Day 14 §3.4: the cell's median_history — the typical, replacing typical_condition
  condition_vs_typical: number | null; // Day 14 §3.4: (history − typical_history) + km — the km row is already a deviation and is not centred again
  price_advantage: number | null;
  deal_score: number | null;
  partial?: string[];
  checks: Check[]; // hand, km — always both
  sold_signal: SoldSignal;
  facts: {
    dealer_transfers: number | null;
    months_since_test: number | null;
    km_per_month_since_test: number | null;
    test_expiry: string | null; // Day 19 (§3.7): the months-left fact LEFT the invoice — the one fact that depends on
    // the day of viewing, so the invoice keeps the date and the display layer counts the months.
    current_owner_registry: OwnershipType | null; // Day 18 (§3.3): cars.current_owner_type as the engine received it; null = unknown
    color_changed_reported?: true; // Day 18 (§9): present only when history 1 says the colour was changed
    color_mismatch?: ColorMismatch; // Day 18 (§9): present only when both families are known and differ
  };
  confidence: { level: ConfidenceLevel; items: ConfidenceItem[] };
};

export type ColorMismatch = { ad: string; registry: string; ad_family: string; registry_family: string };

// Day 18 (§8, §3.5): a car finally cancelled at the registry. A recorded outcome, not a skipped listing: no
// comparison rows, no sums, no confidence. The sums are carried as null (not left out) so every reader of
// deal_score / condition_* sees "no score" exactly as it does for a thin cell; checks, the sold signal and the
// facts are not carried at all, and are declared absent so a reader must narrow before it reads them.
export type CancelledResult = {
  engine_version: typeof ENGINE_VERSION;
  reason: "cancelled";
  cancelled_at: string; // 'YYYY-MM-DD', cars.cancelled_at
  rows: Row[]; // always empty
  condition_score: null;
  condition_by_reality: null;
  typical_history: null;
  condition_vs_typical: null;
  price_advantage: null;
  deal_score: null;
  confidence: null;
  unit?: undefined;
  partial?: undefined;
  checks?: undefined;
  sold_signal?: undefined;
  facts?: undefined;
};

// What the engine returns and what listings.score_breakdown stores: a scored invoice, or the cancelled one.
export type Invoice = ScoreResult | CancelledResult;

export function isCancelled(invoice: Invoice): invoice is CancelledResult {
  return (invoice as { reason?: unknown }).reason === "cancelled";
}
