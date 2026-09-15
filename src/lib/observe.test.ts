// BRIEF Day 17 §2 — one case per rule and per guard of the observation layer, on the pure function.
// No database: decide() is pure, and the one apply() test drives a fake transaction client and a
// fake recordPrice so the order and the arguments are visible.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  absentFromSheet, apply, checkDelistedColumn, decide, firstPriceObservedAt, lastVerifiedAtOnInsert, parseSeen,
  type Client, type Decision, type ListingState, type Observation, type Write,
} from "./observe";

const SEEN = new Date("2026-09-15T00:00:00Z");
const TODAY = new Date("2026-09-15T13:40:00Z");
const HEADERS = ["מספר רישוי", "מחיר", "קישור למודעה", "ירד"];

function listing(over: Partial<ListingState> = {}): ListingState {
  return {
    id: 1,
    price: 100_000,
    km_declared: 80_000,
    hand_declared: 2,
    last_verified_at: null,
    delisted_at: null,
    first_seen_at: new Date("2026-09-01T00:00:00Z"),
    ...over,
  };
}

function obs(over: Partial<Observation> = {}): Observation {
  return { price: 100_000, km: 80_000, hand: 2, cell: "לא", importable: true, ...over };
}

/** decide() must have said yes; hands back the decision. */
function ok(existing: ListingState | null, o: Observation, seen: Date = SEEN): Decision {
  const r = decide(existing, o, seen);
  assert.equal(r.ok, true, r.ok ? "" : `expected a decision, got ${r.violation.guard}: ${r.violation.message}`);
  return (r as { ok: true; decision: Decision }).decision;
}

/** decide() must have stopped; hands back the guard's name. */
function stopped(existing: ListingState | null, o: Observation, seen: Date = SEEN): string {
  const r = decide(existing, o, seen);
  assert.equal(r.ok, false, "expected a guard violation");
  return (r as { ok: false; violation: { guard: string } }).violation.guard;
}

const fields = (writes: Write[]) => writes.map((w) => w.field).sort();

describe("G1 — the guards, before any write", () => {
  it("bad date: --seen is not YYYY-MM-DD", () => {
    const r = parseSeen("15/09/2026", TODAY);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.violation.guard, "bad_date");
  });

  it("future date: --seen is after today (UTC); today itself passes and is midnight UTC", () => {
    const future = parseSeen("2027-01-01", TODAY);
    assert.equal(future.ok, false);
    assert.equal(future.ok === false && future.violation.guard, "future_date");

    const today = parseSeen("2026-09-15", TODAY);
    assert.equal(today.ok, true);
    assert.equal(today.ok === true && today.seen.toISOString(), "2026-09-15T00:00:00.000Z");
  });

  it("column missing: the sheet has no ירד column", () => {
    const without = checkDelistedColumn(["מספר רישוי", "מחיר", "קישור למודעה"]);
    assert.equal(without.ok, false);
    assert.equal(without.ok === false && without.violation.guard, "column_missing");
    assert.match(without.ok === false ? without.violation.message : "", /ירד/);

    assert.equal(checkDelistedColumn(HEADERS).ok, true);
    assert.equal(checkDelistedColumn([" ירד "]).ok, true); // the header is compared trimmed
  });

  it("existing row blank: an empty cell on an existing listing stops the run", () => {
    assert.equal(stopped(listing(), obs({ cell: "" })), "invalid_cell");
    assert.equal(stopped(listing(), obs({ cell: "   " })), "invalid_cell");
  });

  it("existing row other value: anything but כן / לא stops the run", () => {
    assert.equal(stopped(listing(), obs({ cell: "אולי" })), "invalid_cell");
    assert.equal(stopped(listing(), obs({ cell: "yes" })), "invalid_cell");
  });

  it("new row כן: an ad collected today cannot be gone", () => {
    assert.equal(stopped(null, obs({ cell: "כן" })), "new_row_delisted");
  });

  it("a row the import cannot import is outside the observation, whatever its ירד value", () => {
    // Row 72 of the walked sheet, 15/09: a plate the registry reports not_found, marked כן. It never
    // becomes a listing, so the new-row guard does not fire on it — the run counts it as skipped.
    const notImportable = obs({ cell: "כן", importable: false });
    const d = ok(null, notImportable);
    assert.equal(d.outcome, "outside");
    assert.equal(d.listing_id, null);
    assert.deepEqual(d.writes, []);
    assert.equal(d.finding, null);

    // לא and an empty cell are outside in the same way, and a row the import CAN import still stops.
    assert.equal(ok(null, obs({ cell: "לא", importable: false })).outcome, "outside");
    assert.equal(ok(null, obs({ cell: "", importable: false })).outcome, "outside");
    assert.equal(stopped(null, obs({ cell: "כן", importable: true })), "new_row_delisted");
  });

  it("seen before first_seen_at of an existing listing", () => {
    const early = listing({ first_seen_at: new Date("2026-09-20T00:00:00Z") });
    assert.equal(stopped(early, obs()), "seen_before_first_seen");
    // the same day is not earlier
    assert.equal(ok(listing({ first_seen_at: SEEN }), obs()).outcome, "verified");
  });
});

describe("R1 — a new row is inserted exactly as today", () => {
  it("new + empty cell: insert, no observation writes", () => {
    const d = ok(null, obs({ cell: "" }));
    assert.equal(d.outcome, "insert");
    assert.equal(d.listing_id, null);
    assert.deepEqual(d.writes, []);
    assert.equal(d.finding, null);
  });

  it("new + לא: insert, no observation writes — last_verified_at stays null", () => {
    const d = ok(null, obs({ cell: "לא" }));
    assert.equal(d.outcome, "insert");
    assert.deepEqual(d.writes, []);
  });
});

describe("R1 — the first price row of an inserted listing", () => {
  it("in a --seen run the price was observed on seen; first_seen_at stays the viewing date", () => {
    const viewed = new Date("2026-09-02T00:00:00Z"); // the row's תאריך צפייה
    assert.equal(firstPriceObservedAt(viewed, SEEN).toISOString(), "2026-09-15T00:00:00.000Z");
    assert.equal(viewed.toISOString(), "2026-09-02T00:00:00.000Z"); // untouched: first_seen_at is the viewing date

    // without --seen nothing changes: the price was observed when the row was viewed.
    assert.equal(firstPriceObservedAt(viewed, null).toISOString(), "2026-09-02T00:00:00.000Z");
  });

  it("last_verified_at on insert: seen in a --seen run, null without one", () => {
    assert.equal(lastVerifiedAtOnInsert(SEEN)?.toISOString(), "2026-09-15T00:00:00.000Z");
    assert.equal(lastVerifiedAtOnInsert(null), null);
  });
});

describe("R2 — a listing already delisted is never written again", () => {
  const delisted = () => listing({ delisted_at: new Date("2026-09-10T00:00:00Z") });

  it("כן: skipped, counted already delisted, no finding", () => {
    const d = ok(delisted(), obs({ cell: "כן" }));
    assert.equal(d.outcome, "already_delisted");
    assert.deepEqual(d.writes, []);
    assert.equal(d.finding, null);
  });

  it("לא: a finding, still nothing written — delisted_at is never cleared", () => {
    const d = ok(delisted(), obs({ cell: "לא", price: 90_000, km: 90_000 }));
    assert.equal(d.outcome, "already_delisted");
    assert.deepEqual(d.writes, []);
    assert.equal(d.finding, "delisted in DB, still up in sheet");
  });
});

describe("R3 — existing, live, כן", () => {
  it("delisted_at = seen and nothing else, whatever the row's price and km say", () => {
    const d = ok(listing(), obs({ cell: "כן", price: 90_000, km: 90_000, hand: 3 }));
    assert.equal(d.outcome, "delist");
    assert.equal(d.listing_id, 1);
    assert.deepEqual(d.writes, [{ field: "delisted_at", from: null, to: SEEN }]);
  });
});

describe("R4 — existing, live, לא", () => {
  it("same price, same km, same hand: only last_verified_at", () => {
    const d = ok(listing(), obs());
    assert.equal(d.outcome, "verified");
    assert.deepEqual(d.writes, [{ field: "last_verified_at", from: null, to: SEEN }]);
  });

  it("a new price: one price write carrying seen as the observed date, then last_verified_at", () => {
    const d = ok(listing(), obs({ price: 92_000 }));
    assert.deepEqual(d.writes, [
      { field: "price", from: 100_000, to: 92_000, observed_at: SEEN },
      { field: "last_verified_at", from: null, to: SEEN },
    ]);
  });

  it("km present and different: written", () => {
    const d = ok(listing(), obs({ km: 84_500 }));
    assert.deepEqual(fields(d.writes), ["km_declared", "last_verified_at"]);
    assert.deepEqual(d.writes[0], { field: "km_declared", from: 80_000, to: 84_500 });
  });

  it("km blank: nothing — a missing cell is not an observation", () => {
    const d = ok(listing(), obs({ km: null }));
    assert.deepEqual(fields(d.writes), ["last_verified_at"]);
  });

  it("km null in the DB and a value in the sheet: filled", () => {
    const d = ok(listing({ km_declared: null }), obs({ km: 80_000 }));
    assert.deepEqual(d.writes[0], { field: "km_declared", from: null, to: 80_000 });
  });

  it("hand present and different: written", () => {
    const d = ok(listing(), obs({ hand: 3 }));
    assert.deepEqual(d.writes[0], { field: "hand_declared", from: 2, to: 3 });
  });

  it("hand blank: nothing; hand null in the DB and a value in the sheet: filled", () => {
    assert.deepEqual(fields(ok(listing(), obs({ hand: null })).writes), ["last_verified_at"]);
    const d = ok(listing({ hand_declared: null }), obs({ hand: 2 }));
    assert.deepEqual(d.writes[0], { field: "hand_declared", from: null, to: 2 });
  });
});

describe("R4′ — existing, live, לא, and the ad has lost its asking price", () => {
  it("delisted_at = seen and nothing else — no last_verified_at, no km/hand", () => {
    const d = ok(listing(), obs({ cell: "לא", price: null, km: 84_500, hand: 3 }));
    assert.equal(d.outcome, "delist_price_removed");
    assert.equal(d.listing_id, 1);
    assert.deepEqual(d.writes, [{ field: "delisted_at", from: null, to: SEEN }]);
    assert.equal(d.finding, null);

    // and it does not come back: the second run sees delisted_at set (R2), and a לא row with no
    // price on a delisted listing is that same ad, not a contradiction — no finding.
    const second = ok(listing({ delisted_at: SEEN }), obs({ cell: "לא", price: null }));
    assert.equal(second.outcome, "already_delisted");
    assert.deepEqual(second.writes, []);
    assert.equal(second.finding, null);

    // only a restored price makes it the R2 finding.
    const restored = ok(listing({ delisted_at: SEEN }), obs({ cell: "לא", price: 95_000 }));
    assert.equal(restored.finding, "delisted in DB, still up in sheet");
    assert.deepEqual(restored.writes, []);
  });

  it("כן wins over a missing price: it is a plain R3 delisting", () => {
    const d = ok(listing(), obs({ cell: "כן", price: null }));
    assert.equal(d.outcome, "delist");
    assert.deepEqual(d.writes, [{ field: "delisted_at", from: null, to: SEEN }]);
  });
});

describe("R5 — listings in the DB, absent from the sheet", () => {
  it("counted and listed by external_id, sorted; nothing is decided for them", () => {
    assert.deepEqual(absentFromSheet(["c", "a", "b"], ["b"]), ["a", "c"]);
    assert.deepEqual(absentFromSheet(["a", "b"], ["a", "b", "z"]), []);
    assert.deepEqual(absentFromSheet([], ["a"]), []);
  });
});

describe("R6 — idempotent", () => {
  it("the same decision twice with the same seen: the second yields no writes", () => {
    const before = listing({ km_declared: null, last_verified_at: null });
    const first = ok(before, obs({ price: 92_000, km: 84_500 }));
    assert.deepEqual(fields(first.writes), ["km_declared", "last_verified_at", "price"]);

    // the database as those writes leave it
    const after = listing({ price: 92_000, km_declared: 84_500, last_verified_at: SEEN });
    const second = ok(after, obs({ price: 92_000, km: 84_500 }));
    assert.equal(second.outcome, "verified");
    assert.deepEqual(second.writes, []);
  });

  it("a delisting run twice: the second sees delisted_at set and writes nothing", () => {
    const first = ok(listing(), obs({ cell: "כן" }));
    assert.deepEqual(fields(first.writes), ["delisted_at"]);
    const second = ok(listing({ delisted_at: SEEN }), obs({ cell: "כן" }));
    assert.equal(second.outcome, "already_delisted");
    assert.deepEqual(second.writes, []);
  });
});

describe("apply() — one decision, one transaction", () => {
  function fake() {
    const order: string[] = [];
    const priceCalls: { listingId: number; price: number; observedAt: Date; client: unknown }[] = [];
    const updates: { where: { id: number }; data: Record<string, unknown> }[] = [];
    const client = {
      listings: {
        update: async (arg: { where: { id: number }; data: Record<string, unknown> }) => {
          order.push("listings.update");
          updates.push(arg);
        },
      },
    } as unknown as Client;
    const deps = {
      recordPrice: async (listingId: number, price: number, observedAt: Date, c: Client) => {
        order.push("recordPrice");
        priceCalls.push({ listingId, price, observedAt, client: c });
      },
    };
    return { client, deps, order, priceCalls, updates };
  }

  it("recordPrice gets seen as the observed date and the transaction's own client, before the rest", async () => {
    const f = fake();
    const decision = ok(listing({ km_declared: null }), obs({ price: 92_000, km: 84_500 }));
    await apply(f.client, decision, f.deps);

    assert.deepEqual(f.priceCalls, [{ listingId: 1, price: 92_000, observedAt: SEEN, client: f.client }]);
    assert.equal(f.priceCalls[0].client, f.client, "recordPrice must run on the transaction client");
    assert.deepEqual(f.order, ["recordPrice", "listings.update"]);
    assert.deepEqual(f.updates, [{ where: { id: 1 }, data: { km_declared: 84_500, last_verified_at: SEEN } }]);
  });

  it("a decision with no writes touches nothing", async () => {
    const f = fake();
    await apply(f.client, { outcome: "already_delisted", listing_id: 1, writes: [], finding: null }, f.deps);
    await apply(f.client, ok(null, obs({ cell: "" })), f.deps);
    assert.deepEqual(f.order, []);
  });
});
