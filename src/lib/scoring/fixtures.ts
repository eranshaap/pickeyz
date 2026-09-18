// Test fixtures for src/lib/scoring/*.test.ts — a ScoringInput with every field set, overridable per test.

import { ENGINE_VERSION } from "./constants";
import { scoreListing } from "./index";
import { isCancelled, type AnchorPoint, type CellNorm, type ModelNorm, type OwnershipRow, type PoolNorm, type ScoreResult, type ScoringInput } from "./types";

// Day 19: the engine reads no run clock any more, so this date is no longer a `now` passed in — it is the
// fixture listing's OBSERVATION date, the default for km_observed_at and price_observed_at. Every expected
// number in the existing tests therefore stands unchanged: the same date reaches the same three sites.
export const NOW = new Date("2026-09-06T12:00:00.000Z");
export const FIXTURE_MAKE = "MAKE";
export const FIXTURE_MODEL = "MODEL";

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
      km_observed_at: NOW,
      price_observed_at: NOW,
      seller_type: "private",
      owners_at_first_seen: null,
      new_price: null,
      new_car_price_id: null,
      ...over.listing,
    },
    car: {
      make: FIXTURE_MAKE,
      model: FIXTURE_MODEL,
      year: 2021,
      hand: null,
      ownership_history: null,
      km_at_last_test: null,
      mivchan_acharon_dt: null,
      first_registration: null,
      test_expiry: null,
      cancelled_at: null,
      color: null,
      registry_color: null,
      color_changed: null,
      current_owner_type: null,
      ...over.car,
    },
    market: over.market ?? null,
    model_stats: over.model_stats ?? null,
    pool_stats: over.pool_stats ?? null,
  };
}

// Day 18 (§8): scoreListing returns the cancelled invoice too. A test about a scored invoice reads it through
// this, which fails the test loudly if the input turned out to be a cancelled car.
export function scoreScored(i: ScoringInput): ScoreResult {
  const r = scoreListing(i);
  if (isCancelled(r)) throw new Error("fixture: expected a scored invoice, got the cancelled one");
  return r;
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
// Day 18 (§5): the fixture car's own model-year (MAKE MODEL 2021) is a point, so the default input is anchored;
// a test about the gate names the points it wants.
export function poolNorm(over: Partial<PoolNorm> = {}): PoolNorm {
  return {
    id: 5,
    anchor_ratio_intercept: 0.83,
    anchor_ratio_per_year: -0.041,
    anchor_error_pct: 6.5,
    anchor_age_min_years: 3,
    anchor_age_max_years: 6,
    anchor_points: [anchorPoint()],
    anchor_n: 6,
    anchor_listings: 254,
    ...over,
  };
}

export function anchorPoint(over: Partial<AnchorPoint> = {}): AnchorPoint {
  return { make: FIXTURE_MAKE, model: FIXTURE_MODEL, year: 2021, n: 12, ratio: 0.666, median_age: 4, ...over };
}

// "leasing 2021-10, private 2021-10" -> rows
export function rows(spec: string): OwnershipRow[] {
  return spec.split(",").map((s) => {
    const [type, ym] = s.trim().split(/\s+/);
    return { type: type as OwnershipRow["type"], ym };
  });
}
