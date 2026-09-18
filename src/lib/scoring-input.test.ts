// Day 19 (§12.5) — priceObservedAt(): the day the listing's CURRENT price was observed.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { priceObservedAt } from "./scoring-input";

const FIRST_SEEN = new Date("2026-09-02T00:00:00.000Z");
const at = (iso: string, price = 100000) => ({ observed_at: new Date(iso), price });

describe("priceObservedAt() (Day 19 §1.2)", () => {
  it("no history row -> first_seen_at: the price it was first seen with", () => {
    assert.equal(priceObservedAt([], FIRST_SEEN).getTime(), FIRST_SEEN.getTime());
  });

  it("one row -> that row's observed_at", () => {
    assert.equal(priceObservedAt([at("2026-09-11T00:00:00.000Z")], FIRST_SEEN).toISOString(), "2026-09-11T00:00:00.000Z");
  });

  it("several rows -> the LATEST observed_at, whatever order they arrive in", () => {
    const rows = [at("2026-09-05T00:00:00.000Z"), at("2026-09-15T00:00:00.000Z"), at("2026-09-11T00:00:00.000Z")];
    assert.equal(priceObservedAt(rows, FIRST_SEEN).toISOString(), "2026-09-15T00:00:00.000Z");
    assert.equal(priceObservedAt([...rows].reverse(), FIRST_SEEN).toISOString(), "2026-09-15T00:00:00.000Z");
  });

  it("the loaders pass the latest row first; the same answer either way", () => {
    const descending = [at("2026-09-15T00:00:00.000Z"), at("2026-09-11T00:00:00.000Z"), at("2026-09-05T00:00:00.000Z")];
    assert.equal(priceObservedAt(descending, FIRST_SEEN).toISOString(), "2026-09-15T00:00:00.000Z");
  });

  it("a history row earlier than first_seen_at is still the price observation — the rows decide, not the sighting", () => {
    assert.equal(priceObservedAt([at("2026-08-20T00:00:00.000Z")], FIRST_SEEN).toISOString(), "2026-08-20T00:00:00.000Z");
  });
});
