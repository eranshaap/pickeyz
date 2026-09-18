// From database rows to the engine's input (BRIEF Day 11, §11 step 2; §18.3 for seller_type).
// The engine (src/lib/scoring) is pure and takes plain objects; this is the one place that knows how
// the rows look. Structural types, no Prisma import — the scripts pass their loaded rows in.
// Fails loudly: a car without a year, or an ownership_history that is not an array of { ym, type },
// stops the caller with the plate in the message. It never fills a value in.

import type { OwnershipRow, OwnershipType, ScoringInput, SellerType } from "@/lib/scoring";
import { OWNERSHIP_CODES } from "@/lib/mot/translator";

// Day 19 (§1.2): the listing's price history, latest row first. REQUIRED, not optional — the engine pairs the
// ad's price with the car's age on the day that price was observed, and a caller that does not load the relation
// must fail to compile rather than fall back to a date that is silently wrong. One row (the latest) is enough.
export type PriceHistoryRowLike = { observed_at: Date; price: number };

export type ListingRowLike = {
  id: number;
  price: number;
  km_declared: number | null;
  hand_declared: number | null;
  first_seen_at: Date;
  km_observed_at: Date; // Day 19 (§1.1): listings.km_observed_at
  owners_at_first_seen: number | null;
  price_history: PriceHistoryRowLike[];
};

/**
 * Day 19 (§1.2) — the day the listing's CURRENT price was observed: the latest observed_at among its
 * listing_price_history rows. A listing with no history row has never had a price change recorded, so the
 * price it carries is the one it was first seen with — first_seen_at.
 */
export function priceObservedAt(history: readonly PriceHistoryRowLike[], first_seen_at: Date): Date {
  let latest: Date | null = null;
  for (const r of history) {
    if (latest === null || r.observed_at.getTime() > latest.getTime()) latest = r.observed_at;
  }
  return latest ?? first_seen_at;
}

export type CarRowLike = {
  license_plate: string | null;
  year: number | null;
  hand: number | null;
  ownership_history: unknown; // Prisma Json
  km_at_last_test: number | null;
  mivchan_acharon_dt: Date | null;
  first_registration: Date | null;
  test_expiry: Date | null;
  // Day 18 (§3.4): the engine's new inputs. make / model come from the models row the car points at, exactly as
  // the loaders already include it (car: { include: { model: true } }).
  model: { make: string | null; model: string | null };
  cancelled_at: Date | null;
  color: string | null;
  registry_color: string | null;
  color_changed: boolean | null;
  current_owner_type: string | null;
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

// Day 18 (§3.3): cars.current_owner_type holds a code of translator.ts or null. Anything else is not a value we
// wrote, and stops the caller — it is never read as "unknown".
export function parseOwnerType(value: string | null, plate: string): OwnershipType | null {
  if (value === null) return null;
  if (!(OWNERSHIP_CODES as readonly string[]).includes(value)) throw new Error(`car ${plate}: current_owner_type = ${JSON.stringify(value)} is not an ownership code`);
  return value as OwnershipType;
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
  if (car.model.make === null) throw new Error(`listing ${listing.id} (car ${plate}): models.make is null`);
  if (car.model.model === null) throw new Error(`listing ${listing.id} (car ${plate}): models.model is null`);
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
      km_observed_at: listing.km_observed_at,
      price_observed_at: priceObservedAt(listing.price_history, listing.first_seen_at),
      seller_type: sellerTypeOf(dealer_type),
      owners_at_first_seen: listing.owners_at_first_seen,
      new_price: new_car_price === null ? null : new_car_price.mehir,
      new_car_price_id: new_car_price === null ? null : new_car_price.id,
    },
    car: {
      make: car.model.make,
      model: car.model.model,
      year: car.year,
      hand: car.hand,
      ownership_history: parseOwnershipHistory(car.ownership_history, plate),
      km_at_last_test: car.km_at_last_test,
      mivchan_acharon_dt: car.mivchan_acharon_dt,
      first_registration: car.first_registration,
      test_expiry: car.test_expiry,
      cancelled_at: car.cancelled_at,
      color: car.color,
      registry_color: car.registry_color,
      color_changed: car.color_changed,
      current_owner_type: parseOwnerType(car.current_owner_type, plate),
    },
    // The caller replaces these with the rows of the current norms run (§6.1). Left null here so a caller
    // that scores nothing against a model or a pool — the norms run's own history/km rows — needs no rows.
    model_stats: null,
    pool_stats: null,
  };
}
