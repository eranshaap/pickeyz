// From database rows to the engine's input (BRIEF Day 11, §11 step 2; §18.3 for seller_type).
// The engine (src/lib/scoring) is pure and takes plain objects; this is the one place that knows how
// the rows look. Structural types, no Prisma import — the scripts pass their loaded rows in.
// Fails loudly: a car without a year, or an ownership_history that is not an array of { ym, type },
// stops the caller with the plate in the message. It never fills a value in.

import type { OwnershipRow, ScoringInput, SellerType } from "@/lib/scoring";

export type ListingRowLike = {
  id: number;
  price: number;
  km_declared: number | null;
  hand_declared: number | null;
  first_seen_at: Date;
  owners_at_first_seen: number | null;
};

export type CarRowLike = {
  license_plate: string | null;
  year: number | null;
  hand: number | null;
  ownership_history: unknown; // Prisma Json
  km_at_last_test: number | null;
  mivchan_acharon_dt: Date | null;
  first_registration: Date | null;
  test_expiry: Date | null;
};

// §18.3: dealer_type 'private' → 'private', anything else → 'dealer'. 'fleet_company' arrives with Day 28.
export function sellerTypeOf(dealer_type: string): SellerType {
  return dealer_type === "private" ? "private" : "dealer";
}

export function parseOwnershipHistory(json: unknown, plate: string): OwnershipRow[] | null {
  if (json === null || json === undefined) return null;
  if (!Array.isArray(json)) throw new Error(`car ${plate}: ownership_history is not an array`);
  if (json.length === 0) throw new Error(`car ${plate}: ownership_history is [] — an empty record is stored as null`);
  return json.map((e, i) => {
    if (typeof e !== "object" || e === null) throw new Error(`car ${plate}: ownership_history[${i}] is not an object`);
    const { ym, type } = e as { ym?: unknown; type?: unknown };
    if (typeof ym !== "string" || !/^\d{4}-\d{2}$/.test(ym)) throw new Error(`car ${plate}: ownership_history[${i}].ym = ${JSON.stringify(ym)}`);
    if (typeof type !== "string") throw new Error(`car ${plate}: ownership_history[${i}].type = ${JSON.stringify(type)}`);
    return { ym, type: type as OwnershipRow["type"] };
  });
}

// listing + car parts of the input; the caller attaches `market`.
export function scoringSubject(listing: ListingRowLike, car: CarRowLike, dealer_type: string): Omit<ScoringInput, "market"> {
  const plate = car.license_plate ?? "?";
  if (car.year === null) throw new Error(`listing ${listing.id} (car ${plate}): cars.year is null`);
  return {
    listing: {
      id: listing.id,
      price: listing.price,
      km_declared: listing.km_declared,
      hand_declared: listing.hand_declared,
      first_seen_at: listing.first_seen_at,
      seller_type: sellerTypeOf(dealer_type),
      owners_at_first_seen: listing.owners_at_first_seen,
    },
    car: {
      year: car.year,
      hand: car.hand,
      ownership_history: parseOwnershipHistory(car.ownership_history, plate),
      km_at_last_test: car.km_at_last_test,
      mivchan_acharon_dt: car.mivchan_acharon_dt,
      first_registration: car.first_registration,
      test_expiry: car.test_expiry,
    },
  };
}
