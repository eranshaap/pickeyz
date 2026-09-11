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

// The pool: one row per norms run — the anchor curve. pool_stats. Absent before the first v3 norms run.
// All five values are null together (P4) when the curve could not be fitted.
export type PoolNorm = {
  id: number;
  anchor_ratio_intercept: number | null;
  anchor_ratio_per_year: number | null;
  anchor_error_pct: number | null;
  anchor_age_min_years: number | null;
  anchor_age_max_years: number | null;
  anchor_n: number; // model-year POINTS the line was fitted through; the engine records it, never reads it
  anchor_listings: number; // listings behind those points — coverage, not the fit's n
};

export type ScoringInput = {
  listing: {
    id: number;
    price: number;
    km_declared: number | null;
    hand_declared: number | null; // Day 14 (§0.4): recorded, never scored — the declared hand enters no row
    first_seen_at: Date;
    seller_type: SellerType;
    owners_at_first_seen: number | null;
    new_price: number | null; // Day 14 (§3.2): the car's new list price, the join select-three.ts uses; null when no row matches
    new_car_price_id: number | null; // the new_car_prices row new_price came from
  };
  car: {
    year: number;
    hand: number | null;
    ownership_history: OwnershipRow[] | null; // oldest first
    km_at_last_test: number | null;
    mivchan_acharon_dt: Date | null;
    first_registration: Date | null;
    test_expiry: Date | null;
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
  official_date?: string; // km: mivchan_acharon_dt
  raw?: Record<string, unknown>;
};

export type SoldStrength = "strong" | "medium" | null;
export type SoldSignal = { strength: SoldStrength; evidence: string[] };

export type ConfidenceLevel = "high" | "medium" | "low";
// 'assumed_typical' — Day 14 (§3.5): the history row was taken from the cell's typical, not from the car's
// own record. It replaces 'unverified_source' for that car; the two never appear together.
export type ConfidenceItemKind = "missing_row" | "counted_mismatch" | "unverified_source" | "possibly_sold" | "assumed_typical";
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
    test_expiry: string | null;
    months_left: number | null; // to test_expiry from now, floored at 0
  };
  confidence: { level: ConfidenceLevel; items: ConfidenceItem[] };
};
