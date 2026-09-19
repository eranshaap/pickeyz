// Day 19 (§12.5) — priceObservedAt(): the day the listing's CURRENT price was observed.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { knownTestReadings, priceObservedAt } from "./scoring-input";

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

// Day 19 (Run 5c2, §8.2) — knownTestReadings(): the union of car_test_readings and the car's own latest pair.
describe("knownTestReadings() (Run 5c2 §2.1)", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it("the table's rows plus the car's own latest pair, oldest first", () => {
    const out = knownTestReadings(
      [
        { test_date: d("2025-05-20"), km: 45000 },
        { test_date: d("2024-01-10"), km: 20000 },
      ],
      d("2026-02-02"),
      60000,
    );
    assert.deepEqual(out, [
      { test_date: d("2024-01-10"), km: 20000 },
      { test_date: d("2025-05-20"), km: 45000 },
      { test_date: d("2026-02-02"), km: 60000 },
    ]);
  });

  it("one reading per test date — the latest pair already in the table adds nothing", () => {
    const out = knownTestReadings(
      [
        { test_date: d("2025-05-20"), km: 45000 },
        { test_date: d("2026-02-02"), km: 60000 },
      ],
      d("2026-02-02"),
      60000,
    );
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((r) => r.km), [45000, 60000]);
  });

  it("on a same-date conflict the car's own pair wins", () => {
    const out = knownTestReadings([{ test_date: d("2026-02-02"), km: 59000 }], d("2026-02-02"), 60000);
    assert.deepEqual(out, [{ test_date: d("2026-02-02"), km: 60000 }]);
  });

  it("a null latest pair adds nothing — either field missing", () => {
    const rows = [{ test_date: d("2025-05-20"), km: 45000 }];
    assert.deepEqual(knownTestReadings(rows, null, 60000), rows);
    assert.deepEqual(knownTestReadings(rows, d("2026-02-02"), null), rows);
    assert.deepEqual(knownTestReadings([], null, null), []);
  });

  it("no table rows -> the latest pair alone", () => {
    assert.deepEqual(knownTestReadings([], d("2026-02-02"), 60000), [{ test_date: d("2026-02-02"), km: 60000 }]);
  });
});
