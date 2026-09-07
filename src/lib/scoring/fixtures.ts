// Test fixtures for src/lib/scoring/*.test.ts — a ScoringInput with every field set, overridable per test.

import type { OwnershipRow, ScoringInput } from "./types";

export const NOW = new Date("2026-09-06T12:00:00.000Z");

type Over = {
  listing?: Partial<ScoringInput["listing"]>;
  car?: Partial<ScoringInput["car"]>;
  market?: ScoringInput["market"];
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
  };
}

// "leasing 2021-10, private 2021-10" -> rows
export function rows(spec: string): OwnershipRow[] {
  return spec.split(",").map((s) => {
    const [type, ym] = s.trim().split(/\s+/);
    return { type: type as OwnershipRow["type"], ym };
  });
}
