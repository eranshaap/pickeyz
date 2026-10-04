// Opening screen, F3c §5 — the active counts of the quantities records. The request itself is not tested.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { quantityKey } from "@/lib/families/distribution";
import { activeCountsFromRecords } from "./quantities";

const record = (sug: unknown, tozeret: unknown, degem: unknown, year: unknown, active: unknown): Record<string, unknown> => ({
  _id: 1, sug_degem: sug, tozeret_cd: tozeret, degem_cd: degem, shnat_yitzur: year,
  mispar_rechavim_pailim: active, mispar_rechavim_le_pailim: 7,
});

describe("activeCountsFromRecords", () => {
  it("keeps the P rows only", () => {
    const counts = activeCountsFromRecords([record("P", 413, 588, 2021, 10), record("M", 413, 588, 2021, 99)]);
    assert.deepEqual([...counts], [[quantityKey("413", "588", 2021), 10]]);
  });

  it("codes as strings and as numbers give the same key", () => {
    const counts = activeCountsFromRecords([record("P", 413, 588, 2021, 10), record("P", " 413 ", "589", "2022", "4")]);
    assert.deepEqual([...counts], [
      [quantityKey("413", "588", 2021), 10],
      [quantityKey("413", "589", 2022), 4],
    ]);
  });

  it("two rows of the same key are summed", () => {
    const counts = activeCountsFromRecords([record("P", 413, 588, 2021, 10), record("P", "413", "588", 2021, 5)]);
    assert.deepEqual([...counts], [[quantityKey("413", "588", 2021), 15]]);
  });

  it("a value that is not what its field promises throws, naming the record", () => {
    assert.throws(() => activeCountsFromRecords([record("P", "41A", 588, 2021, 10)]), /record 0: tozeret_cd/);
    assert.throws(() => activeCountsFromRecords([record("P", 413, 588, 2021, -1)]), /record 0: mispar_rechavim_pailim/);
    assert.throws(() => activeCountsFromRecords([record(null, 413, 588, 2021, 1)]), /record 0: sug_degem/);
  });
});
