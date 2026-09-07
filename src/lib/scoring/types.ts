// Stage A scoring engine — shared shapes (BRIEF Day 11, §2, §4, §7, §9).
// Pure TypeScript: no Prisma, no database, no I/O. Inputs are plain objects.

import type { OwnershipCode } from "../mot/translator";

// The brief calls this OwnershipType; the existing union in the repo is OwnershipCode (src/lib/mot/translator.ts).
export type OwnershipType = OwnershipCode;

export type OwnershipRow = { type: OwnershipType; ym: string }; // ym = 'YYYY-MM'

// Who is selling (§18.3). The script derives it from the joined dealers row: dealer_type 'private' →
// 'private', anything else → 'dealer'. 'fleet_company' is never produced until Day 28's classification.
export type SellerType = "dealer" | "private" | "fleet_company";

export type ScoringInput = {
  listing: {
    id: number;
    price: number;
    km_declared: number | null;
    hand_declared: number | null;
    first_seen_at: Date;
    seller_type: SellerType;
    owners_at_first_seen: number | null;
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
  market: {
    id: number;
    median_price: number;
    median_km: number | null;
    median_condition: number | null;
    sample_size: number;
    window_days: number;
  } | null;
};

export type RowName = "price" | "history" | "km";
export type RowSource = "market" | "mot" | "ad";

// Every row: percent of the car's value, positive = in the buyer's favor, rounded to ROUND_DECIMALS.
export type Row = {
  row: RowName;
  status: "scored" | "unavailable";
  source?: RowSource;
  value?: number;
  reason?: string; // when unavailable
  partial?: string[]; // what could not be included
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
export type ConfidenceItemKind = "missing_row" | "counted_mismatch" | "unverified_source" | "possibly_sold";
export type ConfidenceItem = { kind: ConfidenceItemKind; ref: string };

export type ScoreResult = {
  engine_version: 1;
  unit: "pct_of_value";
  rows: Row[]; // price, history, km — always all three, scored or unavailable
  condition_score: number | null;
  typical_condition: number | null;
  condition_vs_typical: number | null;
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
