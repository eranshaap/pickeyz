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

// Day 14 (§3.2, §6.1, ALLOWED by §9.2): the new-car price row the anchor is built on — the latest
// published_at row of new_car_prices on the car's three-column key (degem_code, sug_degem, shnat_yitzur),
// the join scripts/select-three.ts already does. null when no row matches; the engine's price row then
// reports the thin cell with raw.anchor_unavailable = 'no_new_price'.
export type NewCarPriceLike = { id: number; mehir: number };

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

// listing + car parts of the input; the caller attaches `market` and, when it has them, the two other
// norm rows. Day 14: the three norm levels come back null here and the caller overrides them — this file
// knows how a row looks, not which norms run is current (that is the loader's business, §6.1).
// `new_car_price` is the joined new_car_prices row; omit it where the anchor cannot matter (a caller that
// only uses the history and km rows), and the price row will report 'no_new_price'.
export function scoringSubject(
  listing: ListingRowLike,
  car: CarRowLike,
  dealer_type: string,
  new_car_price: NewCarPriceLike | null = null,
): Omit<ScoringInput, "market"> {
  const plate = car.license_plate ?? "?";
  if (car.year === null) throw new Error(`listing ${listing.id} (car ${plate}): cars.year is null`);
  if (new_car_price !== null && new_car_price.mehir <= 0) {
    throw new Error(`listing ${listing.id} (car ${plate}): new_car_prices ${new_car_price.id} has mehir ${new_car_price.mehir}`);
  }
  return {
    listing: {
      id: listing.id,
      price: listing.price,
      km_declared: listing.km_declared,
      hand_declared: listing.hand_declared,
      first_seen_at: listing.first_seen_at,
      seller_type: sellerTypeOf(dealer_type),
      owners_at_first_seen: listing.owners_at_first_seen,
      new_price: new_car_price === null ? null : new_car_price.mehir,
      new_car_price_id: new_car_price === null ? null : new_car_price.id,
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
    // The caller replaces these with the rows of the current norms run (§6.1). Left null here so a caller
    // that scores nothing against a model or a pool — the norms run's own history/km rows — needs no rows.
    model_stats: null,
    pool_stats: null,
  };
}
