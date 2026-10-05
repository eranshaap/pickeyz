// Is this listing shown on the site at all? (BRIEF Run 6b §3.3)
//
// The product rule (findCar-now.md): a listing that would not appear in results gets "לא נמצא" at its
// address. EXACTLY these reasons, nothing more:
//
//   no listing carries that public_id
//   delisted_at is set
//   the dealer has no open agreement          (the dealer_not_visible rule — its own helper, not restated here)
//   sold_signal is STRONG                     (the gate)
//   price < 50% of the cell median            (below_threshold)
//   price >= 100% of the car's new price      (above_new_price)
//
// AND NOTHING ELSE. A merge (`duplicate`), a thin cell, `unverified_history` and `cancelled` do NOT hide a
// page: a cancelled car and an unranked car are shown on the site and get pages, and a duplicate is a live
// ad whose page is per listing. Visibility does not depend on whether a search id is in the address.
//
// NO RULE IS RE-IMPLEMENTED HERE. The three "out of results entirely" verdicts are taken from the selection
// library itself: the current UNFILTERED pool of the listing's family is assembled through the existing path
// (assembleFamilyPool + pool scores; S2 §2) and run through selectThree(), and this listing's verdicts are read off its
// own result. That is the same gate, the same rules and the same constants the search uses — if a threshold
// moves, this file moves with it because it never knew the threshold.
//
// Split pure / DB exactly like load.ts: decideVisibility() is the decision and needs no database.

import type { ListingResult } from "@/lib/selection";

export type NotShownReason = "no_listing" | "delisted" | "dealer_not_visible" | "sold_strong" | "below_threshold" | "above_new_price";

export type Visibility = { shown: true } | { shown: false; reason: NotShownReason };

export const SHOWN: Visibility = { shown: true };

/** The facts the decision is made on — every one of them a verdict someone else reached. */
export type VisibilityFacts = {
  exists: boolean; // a listing carries that public_id
  delisted: boolean; // listings.delisted_at is set
  dealer_not_visible: boolean; // the dealer_not_visible rule triggered on the current pool
  sold_strong: boolean; // the gate excluded it: sold_signal strength 'strong'
  below_threshold: boolean; // the below_threshold rule triggered
  above_new_price: boolean; // the above_new_price rule triggered AND is acting (effect 'excluded')
};

/**
 * §3.3 — the decision, in the order the brief lists the reasons. The FIRST reason that holds is the one
 * reported; the page shows "לא נמצא" either way, and §10.3 counts by reason.
 */
export function decideVisibility(f: VisibilityFacts): Visibility {
  if (!f.exists) return { shown: false, reason: "no_listing" };
  if (f.delisted) return { shown: false, reason: "delisted" };
  if (f.dealer_not_visible) return { shown: false, reason: "dealer_not_visible" };
  if (f.sold_strong) return { shown: false, reason: "sold_strong" };
  if (f.below_threshold) return { shown: false, reason: "below_threshold" };
  if (f.above_new_price) return { shown: false, reason: "above_new_price" };
  return SHOWN;
}

/**
 * The three pool verdicts of ONE listing, read off the result selectThree() produced for it.
 *
 * A listing the gate excluded as sold_strong has NO rule entries at all — the gate stops before 4.3 runs —
 * so its other three flags come back false. That is the library's own order, not a gap here: the listing is
 * out on the first reason, and §10.3's counts say so.
 */
export function poolVerdicts(result: ListingResult): Pick<VisibilityFacts, "dealer_not_visible" | "sold_strong" | "below_threshold" | "above_new_price"> {
  const fired = (rule: string, actingOnly = false): boolean =>
    result.trace.some((t) => t.rule === rule && t.triggered && (!actingOnly || t.effect === "excluded"));
  return {
    sold_strong: result.excluded_by === "sold_strong",
    dealer_not_visible: fired("dealer_not_visible"),
    below_threshold: fired("below_threshold"),
    above_new_price: fired("above_new_price", true),
  };
}

// ---------------------------------------------------------------------------
// the DB glue — the client and the pool are imported on use
// ---------------------------------------------------------------------------

/** What the car page needs beside the verdict: the listing it resolved, and the pool item behind it. */
export type ResolvedListing = {
  visibility: Visibility;
  listing_id: number | null;
  /** The pool item of this listing in the current unfiltered pool — null when it is not in that pool. */
  item: import("./assemble").PoolItem | null;
  /** Its selectThree result on that pool — null for the same reason. */
  result: ListingResult | null;
};

/**
 * §3.3 — resolve one address to a verdict.
 *
 * A listing that exists and is live is measured against the CURRENT unfiltered pool of its own model — the
 * same pool the search would assemble, with no filters applied, because visibility is a fact about the
 * listing and not about anybody's question.
 */
export async function resolveListing(publicId: string): Promise<ResolvedListing> {
  const { db } = await import("@/lib/db");
  const listing = await db.listings.findUnique({
    where: { public_id: publicId },
    select: { id: true, delisted_at: true, car: { select: { model: { select: { family_id: true } } } } },
  });
  if (listing === null) return { visibility: decideVisibility({ exists: false, delisted: false, dealer_not_visible: false, sold_strong: false, below_threshold: false, above_new_price: false }), listing_id: null, item: null, result: null };
  if (listing.delisted_at !== null) {
    return { visibility: { shown: false, reason: "delisted" }, listing_id: listing.id, item: null, result: null };
  }
  // S2 §2 — the pool is the listing's own FAMILY's, through the site's path.
  const familyId = listing.car.model.family_id;
  if (familyId === null) throw new Error(`resolveListing: listing ${listing.id}'s catalog row has no family — the pool is cut by family and cannot be assembled for it`);

  const { assembleFamilyPool } = await import("./assemble");
  const { selectThree } = await import("@/lib/selection");
  const pool = await assembleFamilyPool(familyId);
  const res = selectThree({ listings: pool.items.map((p) => p.candidate) });

  const item = pool.items.find((p) => p.listing_id === listing.id) ?? null;
  const result = res.results.find((r) => r.listing_id === listing.id) ?? null;
  if (item === null || result === null) {
    throw new Error(`resolveListing: live listing ${listing.id} is not in the current unfiltered pool of family ${familyId} — the pool assembly and the listings table disagree`);
  }

  return {
    visibility: decideVisibility({ exists: true, delisted: false, ...poolVerdicts(result) }),
    listing_id: listing.id,
    item,
    result,
  };
}
