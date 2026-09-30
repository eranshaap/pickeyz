// BRIEF Day 19b Run 11a §2.1 — the database behind the contact window. SERVER ONLY (@/lib/db): never
// import this from a client component.
//
// THIN CALLS. One function per question, each holding the one rule its own comment states and no other:
// the decisions -- whether a listing is still shown, whether the hourly limit is reached, which pointers
// survive -- are the action's (§2.2), and they are made there, in the order the document fixes.

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The newest request this browser sent on this listing. "Several requests on one ad -- the last one
 * decides": the page's button and the window's memory both read this one row and no other.
 */
export function latestRequestFor(
  visitor_id: string,
  listing_id: number,
): Promise<{ kind: string; visit_at: Date | null; created_at: Date; buyer_name: string | null; buyer_phone: string | null } | null> {
  return db.contact_requests.findFirst({
    where: { visitor_id, listing_id },
    orderBy: { created_at: "desc" },
    select: { kind: true, visit_at: true, created_at: true, buyer_name: true, buyer_phone: true },
  });
}

/** The search_results row of this listing inside this search -- the place and label the buyer saw. */
export async function searchResultIdFor(search_id: number, listing_id: number): Promise<number | null> {
  const row = await db.search_results.findFirst({ where: { search_id, listing_id }, select: { id: true } });
  return row?.id ?? null;
}

/** How many requests this browser has sent since `since` -- the hourly limit's count. */
export function countRequestsSince(visitor_id: string, since: Date): Promise<number> {
  return db.contact_requests.count({ where: { visitor_id, created_at: { gte: since } } });
}

/**
 * The seller's agreement row in force at `now`. The predicate is assemble.ts:163's, the very one the
 * visibility rule uses: open = agreement_end is null or later than now; agreement_status plays no part.
 * Newest by id, because one dealer has one row per agreement period.
 */
export async function openAgreementId(dealer_id: number, now: Date): Promise<number | null> {
  const row = await db.dealer_commercial.findFirst({
    where: { dealer_id, OR: [{ agreement_end: null }, { agreement_end: { gt: now } }] },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** The listing a search_results row belongs to; null when there is no such row. */
export async function searchResultListingId(id: number): Promise<number | null> {
  const row = await db.search_results.findUnique({ where: { id }, select: { listing_id: true } });
  return row?.listing_id ?? null;
}

/** The listing_id of a contact_opened events row; null when no such row was recorded. */
export async function openingListingId(id: string): Promise<number | null> {
  const row = await db.events.findFirst({ where: { id, event_type: "contact_opened" }, select: { listing_id: true } });
  return row?.listing_id ?? null;
}

export type EventRow = {
  id: string;
  event_type: string;
  visitor_id: string | null;
  session_id: string | null;
  search_id: number | null;
  car_id: number | null;
  listing_id: number | null;
  car_rank: number | null;
  was_recommended: boolean | null;
  /** A plain object the caller has already checked; the cast to Prisma's JSON type is made below. */
  details: Record<string, unknown> | null;
};

/**
 * One event row. createMany with skipDuplicates is Prisma's ON CONFLICT DO NOTHING, and events.id is made
 * in the browser (findCar-schema.md §D9): a retried call writes no second row, which is what lets the
 * window fire and forget.
 *
 * A null `details` is passed as undefined -- Prisma spells "the column's own NULL" that way, and a Json?
 * field does not take a JavaScript null. This is the one place that speaks Prisma's JSON type: the caller
 * has already established that the value is a plain object small enough to store.
 */
export async function insertEvent(row: EventRow): Promise<void> {
  await db.events.createMany({ data: [{ ...row, details: (row.details ?? undefined) as Prisma.InputJsonObject | undefined }], skipDuplicates: true });
}

export type RequestRow = {
  listing_id: number;
  agreement_id: number | null;
  kind: string;
  visit_at: Date | null;
  price_at_send: number | null;
  search_result_id: number | null;
  opened_event_id: string | null;
  buyer_name: string;
  buyer_phone: string;
  buyer_phone_fp: string;
  visitor_id: string | null;
  session_id: string | null;
};

/** The lead itself. One insert, no transaction -- there is nothing for it to be atomic with. */
export function insertRequest(row: RequestRow): Promise<{ id: number; created_at: Date }> {
  return db.contact_requests.create({ data: row, select: { id: true, created_at: true } });
}
