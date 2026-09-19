// Day 18 (§4) — one market for the three norms ("שוק אחד לשלוש הנורמות").
//
// The cell medians, the model's km slope and the pool's anchor curve are all measured on the SAME listings,
// and this file is the one place that says which listings those are. For a model and a window [start, end]:
//
//   first_seen_at <= windowEnd AND (delisted_at IS NULL OR delisted_at >= windowStart)
//                                      a listing that was on the market at some moment of the window —
//                                      delisted ones included, one first seen after the window excluded
//   cars.cancelled_at IS NULL          a car cancelled at the registry is not on any market
//   one listing per car_id             the greatest first_seen_at, tie -> the greatest id; its price is
//                                      listings.price. A car relisted three times is one car, not three.
//
// selectMarketListings() is the rule as a pure function (tested without a database); marketListings() loads a
// model's rows under the same predicate and hands them to it, so the database filter and the rule can never
// disagree about which row is kept. Nothing here computes a norm. The database client is imported inside the two
// loaders, so the rule's tests run without a DATABASE_URL.

import type { Prisma } from "@/generated/prisma/client";

export type ModelKey = { make: string; model: string };
export type MarketWindow = { windowStart: Date; windowEnd: Date };

/** The least a row must carry for the rule. */
export type MarketCandidate = {
  id: number;
  car_id: number;
  first_seen_at: Date;
  delisted_at: Date | null;
  car: { cancelled_at: Date | null };
};

/** In the window: first seen by its end, and not delisted before its start. */
export function inMarketWindow(l: MarketCandidate, w: MarketWindow): boolean {
  return l.first_seen_at.getTime() <= w.windowEnd.getTime() && (l.delisted_at === null || l.delisted_at.getTime() >= w.windowStart.getTime());
}

/** The rule: window, cancelled cars out, one listing per car (latest first_seen_at, then highest id). Ordered by listing id. */
export function selectMarketListings<T extends MarketCandidate>(rows: T[], w: MarketWindow): T[] {
  if (w.windowStart.getTime() > w.windowEnd.getTime()) {
    throw new Error(`market window: start ${w.windowStart.toISOString()} is after end ${w.windowEnd.toISOString()}`);
  }
  const byCar = new Map<number, T>();
  for (const l of rows) {
    if (!inMarketWindow(l, w)) continue;
    if (l.car.cancelled_at !== null) continue;
    const kept = byCar.get(l.car_id);
    if (
      kept === undefined ||
      l.first_seen_at.getTime() > kept.first_seen_at.getTime() ||
      (l.first_seen_at.getTime() === kept.first_seen_at.getTime() && l.id > kept.id)
    ) {
      byCar.set(l.car_id, l);
    }
  }
  return [...byCar.values()].sort((a, b) => a.id - b.id);
}

// What the three computations need: the listing (price, km_declared, first_seen_at, km_observed_at, the
// scoring subject's fields), the car (year, first_registration, the ownership record), its models row (make,
// model, sub_model, the comparison-group fields, degem_code + vehicle_class for the new-price join), the
// seller's dealer_type — and, Day 19 (§1.3, §6.1), the listing's latest price-history row, which is where the
// day its CURRENT price was observed comes from. scoringSubject() requires the relation, so a market listing
// loaded without it fails to compile rather than being scored at a date that is silently wrong.
// Day 19 (Run 5c2, §A0.1): and the car's test readings (car_test_readings) — the km cross-check reads the last
// reading dated on or before the day the ad's km was observed, not the car's latest pair. scoringSubject()
// requires the relation, so a market listing loaded without it fails to compile too.
const INCLUDE = {
  car: { include: { model: true, test_readings: { select: { test_date: true, km: true } } } },
  dealer: { select: { dealer_type: true } },
  price_history: { orderBy: [{ observed_at: "desc" }, { id: "desc" }], take: 1, select: { observed_at: true, price: true } },
} as const satisfies Prisma.listingsInclude;

export type MarketListing = Prisma.listingsGetPayload<{ include: typeof INCLUDE }>;

/** The market listings of one model in one window — §4's predicate, loaded and then decided by the rule above. */
export async function marketListings({ modelKey, windowStart, windowEnd }: { modelKey: ModelKey } & MarketWindow): Promise<MarketListing[]> {
  const { db } = await import("@/lib/db");
  const rows = await db.listings.findMany({
    where: {
      first_seen_at: { lte: windowEnd },
      OR: [{ delisted_at: null }, { delisted_at: { gte: windowStart } }],
      car: { cancelled_at: null, model: { make: modelKey.make, model: modelKey.model } },
    },
    include: INCLUDE,
    orderBy: { id: "asc" },
  });
  return selectMarketListings(rows, { windowStart, windowEnd });
}

/** The (make, model) pairs that have at least one listing in the window, before the rule — the models to ask about. */
export async function marketModels({ windowStart, windowEnd }: MarketWindow): Promise<ModelKey[]> {
  const { db } = await import("@/lib/db");
  const rows = await db.listings.findMany({
    where: { first_seen_at: { lte: windowEnd }, OR: [{ delisted_at: null }, { delisted_at: { gte: windowStart } }] },
    select: { car: { select: { model: { select: { make: true, model: true } } } } },
  });
  const seen = new Map<string, ModelKey>();
  for (const r of rows) {
    const { make, model } = r.car.model;
    if (make === null || model === null) throw new Error(`market models: a listing's models row has make ${JSON.stringify(make)}, model ${JSON.stringify(model)}`);
    seen.set(`${make}|${model}`, { make, model });
  }
  return [...seen.values()].sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model));
}
