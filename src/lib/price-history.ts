// listings.price changes go through here and nowhere else (BRIEF Day 11, §19.2):
// insert the observation into listing_price_history, then update listings.price.
// The first row of a listing is written at import (scripts/import-sheet.ts) with first_seen_at.

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type Client = Prisma.TransactionClient | typeof db;

export async function recordPrice(listingId: number, price: number, observedAt: Date, client: Client = db): Promise<void> {
  if (!Number.isInteger(price) || price <= 0) throw new Error(`recordPrice: listing ${listingId}: price must be a positive integer, got ${price}`);
  await client.listing_price_history.create({ data: { listing_id: listingId, price, observed_at: observedAt } });
  await client.listings.update({ where: { id: listingId }, data: { price } });
}
