// The observation layer (Day 17, "תצפית = דלת אחת"): one set of rules for what an observation
// of a listing changes in the database, and one place that executes it.
//
// Nothing here knows about CSV or about Prisma beyond the four listing fields it writes.
// scripts/import-sheet.ts maps sheet rows to Observation and calls decide() then apply();
// the feed adapter will call the same two functions with rows of its own.
//
// decide() is pure: (the existing listing or null, the row's observation, seen) -> the writes to
// make, or the guard violation that stops the run. apply() executes one decision inside a
// transaction. listings.price is written only through recordPrice(), never here.

import type { Prisma } from "@/generated/prisma/client";

// ---------- the sheet's contract for the column ----------
export const DELISTED_HEADER = "ירד";
export const CELL_GONE = "כן"; // the ad is gone
export const CELL_UP = "לא"; // still up

export type Cell = "gone" | "up" | "other";

/** `כן` = gone, `לא` = up; empty or anything else = "other" (a stop on an existing listing). */
export function readCell(raw: string | undefined | null): Cell {
  const t = (raw ?? "").trim();
  if (t === CELL_GONE) return "gone";
  if (t === CELL_UP) return "up";
  return "other";
}

// ---------- what an observation is, and what the database already holds ----------
export type Observation = {
  price: number | null;
  km: number | null;
  hand: number | null;
  cell: string; // the raw `ירד` cell, as the sheet has it
  // G1, narrowed 15/09: whether the feed can turn this row into a listing — it carries a price and
  // the registry backs its plate. A row it cannot import is outside the observation (see below).
  importable: boolean;
};

export type ListingState = {
  id: number;
  price: number;
  km_declared: number | null;
  hand_declared: number | null;
  last_verified_at: Date | null;
  delisted_at: Date | null;
  first_seen_at: Date;
};

// ---------- the output ----------
export type Write =
  | { field: "price"; from: number; to: number; observed_at: Date }
  | { field: "km_declared"; from: number | null; to: number }
  | { field: "hand_declared"; from: number | null; to: number }
  | { field: "last_verified_at"; from: Date | null; to: Date }
  | { field: "delisted_at"; from: null; to: Date };

export type Outcome =
  | "outside" // G1: the feed cannot import this row — it is no observation at all
  | "insert" // R1: a new row — the import inserts it exactly as it does today
  | "verified" // R4: existing, live, לא, with a price
  | "delist" // R3: existing, live, כן
  | "delist_price_removed" // R4′: existing, live, לא, and the ad has lost its asking price
  | "already_delisted"; // R2: existing with delisted_at already set

export type Decision = {
  outcome: Outcome;
  listing_id: number | null; // null for "insert" — there is no listing yet
  writes: Write[];
  finding: string | null; // R2: "delisted in DB, still up in sheet"
};

export type GuardName =
  | "bad_date"
  | "future_date"
  | "column_missing"
  | "invalid_cell"
  | "new_row_delisted"
  | "seen_before_first_seen";

export type Violation = { guard: GuardName; message: string };

export type DecideResult = { ok: true; decision: Decision } | { ok: false; violation: Violation };

function stop(guard: GuardName, message: string): { ok: false; violation: Violation } {
  return { ok: false, violation: { guard, message } };
}

// ---------- G1, the run-level guards ----------

/** `--seen YYYY-MM-DD` -> midnight UTC. Rejects a malformed date and a date after today (UTC). */
export function parseSeen(
  arg: string | undefined | null,
  today: Date,
): { ok: true; seen: Date } | { ok: false; violation: Violation } {
  const t = (arg ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return stop("bad_date", `--seen: expected YYYY-MM-DD, got ${JSON.stringify(arg ?? null)}`);
  const seen = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(seen.getTime())) return stop("bad_date", `--seen: not a real date: ${JSON.stringify(t)}`);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (seen.getTime() > todayUtc) {
    return stop("future_date", `--seen: ${t} is after today (${new Date(todayUtc).toISOString().slice(0, 10)} UTC)`);
  }
  return { ok: true, seen };
}

/** The `ירד` column must be present in the sheet when --seen is given. */
export function checkDelistedColumn(headers: readonly string[]): { ok: true } | { ok: false; violation: Violation } {
  if (headers.some((h) => (h ?? "").trim() === DELISTED_HEADER)) return { ok: true };
  return stop("column_missing", `column ${DELISTED_HEADER} missing — got: ${headers.join(", ")}`);
}

/** R5: listings the database holds for this source that the sheet no longer carries. */
export function absentFromSheet(inDb: readonly string[], inSheet: Iterable<string>): string[] {
  const sheet = new Set(inSheet);
  return inDb.filter((id) => !sheet.has(id)).sort();
}

// ---------- the decision ----------

export function decide(existing: ListingState | null, obs: Observation, seen: Date): DecideResult {
  const cell = readCell(obs.cell);

  // R1 / G1: a new row is an ad collected today — it cannot already be gone. The guard asks about a
  // row that WOULD be inserted: one the feed cannot import (no price, or a plate the registry reports
  // cancelled / not_found) never becomes a listing, so it is outside the observation whatever its
  // `ירד` value — the caller counts and lists it among its skipped rows (Run 2b decision, 15/09).
  if (existing === null) {
    if (!obs.importable) return { ok: true, decision: { outcome: "outside", listing_id: null, writes: [], finding: null } };
    if (cell === "gone") return stop("new_row_delisted", `a new listing cannot be marked ${CELL_GONE}`);
    return { ok: true, decision: { outcome: "insert", listing_id: null, writes: [], finding: null } };
  }

  // G1: every existing-listing row carries כן or לא.
  if (cell === "other") {
    return stop("invalid_cell", `column ${DELISTED_HEADER}: expected ${CELL_GONE} or ${CELL_UP}, got ${JSON.stringify(obs.cell ?? "")}`);
  }
  // G1: seen is not earlier than the listing's first_seen_at.
  if (seen.getTime() < existing.first_seen_at.getTime()) {
    return stop(
      "seen_before_first_seen",
      `--seen ${seen.toISOString().slice(0, 10)} is earlier than first_seen_at ` +
        `${existing.first_seen_at.toISOString().slice(0, 10)} of listing ${existing.id}`,
    );
  }

  // R2: delisted_at is never cleared, and a delisted listing is never written again.
  if (existing.delisted_at !== null) {
    return {
      ok: true,
      decision: {
        outcome: "already_delisted",
        listing_id: existing.id,
        writes: [],
        finding: cell === "up" && obs.price !== null ? "delisted in DB, still up in sheet" : null,
      },
    };
  }

  // R3: gone — delisted_at and nothing else.
  if (cell === "gone") {
    return {
      ok: true,
      decision: {
        outcome: "delist",
        listing_id: existing.id,
        writes: [{ field: "delisted_at", from: null, to: seen }],
        finding: null,
      },
    };
  }

  // R4′: still up, but the ad has lost its asking price. The pool holds priced ads only — an ad
  // enters with a price and leaves when it loses it. delisted_at and nothing else: there is no
  // price to verify, so no last_verified_at either.
  if (obs.price === null) {
    return {
      ok: true,
      decision: {
        outcome: "delist_price_removed",
        listing_id: existing.id,
        writes: [{ field: "delisted_at", from: null, to: seen }],
        finding: null,
      },
    };
  }

  // R4: still up, with a price.
  const writes: Write[] = [];
  if (obs.price !== existing.price) {
    writes.push({ field: "price", from: existing.price, to: obs.price, observed_at: seen });
  }
  if (obs.km !== null && obs.km !== existing.km_declared) {
    writes.push({ field: "km_declared", from: existing.km_declared, to: obs.km });
  }
  if (obs.hand !== null && obs.hand !== existing.hand_declared) {
    writes.push({ field: "hand_declared", from: existing.hand_declared, to: obs.hand });
  }
  // R6: a last_verified_at already equal to seen is not a write.
  if (existing.last_verified_at === null || existing.last_verified_at.getTime() !== seen.getTime()) {
    writes.push({ field: "last_verified_at", from: existing.last_verified_at, to: seen });
  }
  return { ok: true, decision: { outcome: "verified", listing_id: existing.id, writes, finding: null } };
}

/**
 * R1, the first price row of a listing the run inserts. Without `--seen` it is the row's viewing
 * date, as it has always been. In a `--seen` run the walk is the observation that confirmed the
 * price, so the price was observed on `seen` — while `first_seen_at` stays the viewing date (a row
 * viewed without a price and priced later keeps its true dates on both sides).
 */
export function firstPriceObservedAt(firstSeenAt: Date, seen: Date | null): Date {
  return seen ?? firstSeenAt;
}

/**
 * R1, the `last_verified_at` of a listing the run inserts. A `--seen` run walked the ad and found it
 * up with its price, so the insert is itself an observation of `seen` — exactly what R4 writes for a
 * listing that already existed. Without `--seen` the run makes no claim about today, and the field
 * stays null as it has always been.
 */
export function lastVerifiedAtOnInsert(seen: Date | null): Date | null {
  return seen;
}

// ---------- applying one decision ----------
export type Client = Prisma.TransactionClient;
export type RecordPrice = (listingId: number, price: number, observedAt: Date, client: Client) => Promise<void>;
export type ApplyDeps = { recordPrice: RecordPrice };

// Loaded on use, not on import: this module stays free of the database so the rules can be tested
// (and the feed adapter reasoned about) without a connection. recordPrice() itself is never changed.
const defaultDeps: ApplyDeps = {
  recordPrice: async (listingId, price, observedAt, client) => {
    const { recordPrice } = await import("./price-history");
    await recordPrice(listingId, price, observedAt, client);
  },
};

/**
 * Executes one decision. The caller opens the transaction and passes its client, so every write of
 * one listing lands together; recordPrice() gets that same client and the observation's date.
 */
export async function apply(client: Client, decision: Decision, deps: ApplyDeps = defaultDeps): Promise<void> {
  if (decision.listing_id === null || decision.writes.length === 0) return;
  const patch: Record<string, Date | number> = {};
  for (const w of decision.writes) {
    if (w.field === "price") await deps.recordPrice(decision.listing_id, w.to, w.observed_at, client);
    else patch[w.field] = w.to;
  }
  if (Object.keys(patch).length > 0) {
    await client.listings.update({ where: { id: decision.listing_id }, data: patch });
  }
}
