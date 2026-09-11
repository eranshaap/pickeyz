// Test fixtures for src/lib/scoring/*.test.ts — a ScoringInput with every field set, overridable per test.

import { ENGINE_VERSION } from "./constants";
import type { CellNorm, ModelNorm, OwnershipRow, PoolNorm, ScoringInput } from "./types";

export const NOW = new Date("2026-09-06T12:00:00.000Z");

type Over = {
  listing?: Partial<ScoringInput["listing"]>;
  car?: Partial<ScoringInput["car"]>;
  market?: ScoringInput["market"];
  model_stats?: ScoringInput["model_stats"];
  pool_stats?: ScoringInput["pool_stats"];
};

export function input(over: Over = {}): ScoringInput {
  return {
    listing: {
      id: 1,
      price: 100000,
      km_declared: null,
      hand_declared: null,
      first_seen_at: new Date("2026-08-01T00:00:00.000Z"),
      seller_type: "private",
      owners_at_first_seen: null,
      new_price: null,
      new_car_price_id: null,
      ...over.listing,
    },
    car: {
      year: 2021,
      hand: null,
      ownership_history: null,
      km_at_last_test: null,
      mivchan_acharon_dt: null,
      first_registration: null,
      test_expiry: null,
      ...over.car,
    },
    market: over.market ?? null,
    model_stats: over.model_stats ?? null,
    pool_stats: over.pool_stats ?? null,
  };
}

// Day 14: the three norm rows, each with its own defaults. A test names only what it is about.
export function cell(over: Partial<CellNorm> = {}): CellNorm {
  return {
    id: 7,
    median_price: 100000,
    median_km: 40000,
    median_history: null,
    sample_size: 8,
    window_days: 90,
    group_version: 1,
    engine_version: ENGINE_VERSION,
    ...over,
  };
}

export function modelNorm(over: Partial<ModelNorm> = {}): ModelNorm {
  return { id: 3, km_slope: null, km_slope_n: 0, ...over };
}

// A round curve for the tests: ratio = 0.83 − 0.041 × age over ages 3 … 6. The numbers are Day 13's
// shape, not the norms run's output — the tests are about the arithmetic, not about the pool.
export function poolNorm(over: Partial<PoolNorm> = {}): PoolNorm {
  return {
    id: 5,
    anchor_ratio_intercept: 0.83,
    anchor_ratio_per_year: -0.041,
    anchor_error_pct: 6.5,
    anchor_age_min_years: 3,
    anchor_age_max_years: 6,
    anchor_n: 6,
    anchor_listings: 254,
    ...over,
  };
}

// "leasing 2021-10, private 2021-10" -> rows
export function rows(spec: string): OwnershipRow[] {
  return spec.split(",").map((s) => {
    const [type, ym] = s.trim().split(/\s+/);
    return { type: type as OwnershipRow["type"], ym };
  });
}
