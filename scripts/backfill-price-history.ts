// scripts/backfill-price-history.ts
// One-time backfill (BRIEF Day 11, §19.2): one listing_price_history row per listing with its current
// price and its first_seen_at. Justification: no price has been updated since import, so the current
// price is the price at first sight. Skips listings that already have a row (re-runnable). Prints the count.
// `--dry-run` counts and writes nothing.

import "dotenv/config";
import { db } from "@/lib/db";

const DRY = process.argv.includes("--dry-run");

async function main() {
  const listings = await db.listings.findMany({
    where: { price_history: { none: {} } },
    select: { id: true, price: true, first_seen_at: true },
    orderBy: { id: "asc" },
  });
  const total = await db.listings.count();
  console.log(`${DRY ? "[DRY RUN] " : ""}backfill-price-history: ${total} listings, ${listings.length} without a price row`);
  for (const l of listings) {
    if (!Number.isInteger(l.price) || l.price <= 0) throw new Error(`listing ${l.id}: price ${l.price} is not a positive integer — stopped, nothing written`);
  }
  if (DRY) {
    console.log("[DRY RUN] nothing written");
    return;
  }
  const res = await db.listing_price_history.createMany({
    data: listings.map((l) => ({ listing_id: l.id, price: l.price, observed_at: l.first_seen_at })),
  });
  console.log(`inserted ${res.count} listing_price_history rows`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
