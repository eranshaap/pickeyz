// Day 18 §4 — the market rule: the window predicate, one listing per car, cancelled cars out.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectMarketListings, type MarketCandidate } from "./market-listings";

const DAY = 24 * 60 * 60 * 1000;
const END = new Date("2026-09-17T00:00:00.000Z");
const W = { windowStart: new Date(END.getTime() - 90 * DAY), windowEnd: END };
const daysAgo = (n: number) => new Date(END.getTime() - n * DAY);

function l(id: number, over: Partial<Omit<MarketCandidate, "car">> & { cancelled?: boolean } = {}): MarketCandidate {
  return {
    id,
    car_id: over.car_id ?? id,
    first_seen_at: over.first_seen_at ?? daysAgo(30),
    delisted_at: over.delisted_at ?? null,
    car: { cancelled_at: over.cancelled ? daysAgo(1) : null },
  };
}
const ids = (rows: MarketCandidate[]) => rows.map((r) => r.id);

describe("selectMarketListings — the window (§4)", () => {
  it("a live listing first seen inside the window is kept", () => {
    assert.deepEqual(ids(selectMarketListings([l(1)], W)), [1]);
  });

  it("a live listing first seen BEFORE the window is kept — it is still on the market", () => {
    assert.deepEqual(ids(selectMarketListings([l(1, { first_seen_at: daysAgo(400) })], W)), [1]);
  });

  it("a listing delisted inside the window is kept — delisted listings are part of the market", () => {
    assert.deepEqual(ids(selectMarketListings([l(1, { first_seen_at: daysAgo(120), delisted_at: daysAgo(10) })], W)), [1]);
  });

  it("delisted exactly at the window's start is kept; a moment earlier is dropped", () => {
    assert.deepEqual(ids(selectMarketListings([l(1, { first_seen_at: daysAgo(200), delisted_at: W.windowStart })], W)), [1]);
    assert.deepEqual(ids(selectMarketListings([l(1, { first_seen_at: daysAgo(200), delisted_at: new Date(W.windowStart.getTime() - 1) })], W)), []);
  });

  it("a listing delisted before the window is dropped", () => {
    assert.deepEqual(ids(selectMarketListings([l(1, { first_seen_at: daysAgo(200), delisted_at: daysAgo(100) })], W)), []);
  });

  it("a listing first seen after the window's end is dropped", () => {
    assert.deepEqual(ids(selectMarketListings([l(1, { first_seen_at: new Date(END.getTime() + DAY) })], W)), []);
  });

  it("a start after the end is a stop", () => {
    assert.throws(() => selectMarketListings([], { windowStart: END, windowEnd: daysAgo(1) }), /is after end/);
  });
});

describe("selectMarketListings — a car once (§4)", () => {
  it("three listings of one car → one: the latest first_seen_at, whatever the ids", () => {
    const rows = [l(9, { car_id: 5, first_seen_at: daysAgo(60), delisted_at: daysAgo(40) }), l(3, { car_id: 5, first_seen_at: daysAgo(10) }), l(7, { car_id: 5, first_seen_at: daysAgo(30), delisted_at: daysAgo(20) })];
    assert.deepEqual(ids(selectMarketListings(rows, W)), [3]);
  });

  it("the same first_seen_at → the greatest id", () => {
    const at = daysAgo(15);
    const rows = [l(4, { car_id: 5, first_seen_at: at }), l(8, { car_id: 5, first_seen_at: at }), l(6, { car_id: 5, first_seen_at: at })];
    assert.deepEqual(ids(selectMarketListings(rows, W)), [8]);
  });

  it("the choice is made among the listings IN the window: an older in-window listing beats a newer one outside it", () => {
    const rows = [l(1, { car_id: 5, first_seen_at: daysAgo(50) }), l(2, { car_id: 5, first_seen_at: new Date(END.getTime() + DAY) })];
    assert.deepEqual(ids(selectMarketListings(rows, W)), [1]);
  });

  it("the kept row is the row itself — its price is the listing's current price, carried untouched", () => {
    type Priced = MarketCandidate & { price: number };
    const older: Priced = { ...l(1, { car_id: 5, first_seen_at: daysAgo(50), delisted_at: daysAgo(45) }), price: 100000 };
    const newer: Priced = { ...l(2, { car_id: 5, first_seen_at: daysAgo(20) }), price: 93000 };
    const kept = selectMarketListings([older, newer], W);
    assert.equal(kept.length, 1);
    assert.equal(kept[0], newer);
    assert.equal(kept[0].price, 93000);
  });

  it("different cars are all kept, ordered by listing id", () => {
    assert.deepEqual(ids(selectMarketListings([l(3), l(1), l(2)], W)), [1, 2, 3]);
  });
});

describe("selectMarketListings — cancelled cars (§4)", () => {
  it("a car with cancelled_at is on no market, live or delisted", () => {
    const rows = [l(1, { cancelled: true }), l(2, { cancelled: true, first_seen_at: daysAgo(80), delisted_at: daysAgo(5) }), l(3)];
    assert.deepEqual(ids(selectMarketListings(rows, W)), [3]);
  });
});
