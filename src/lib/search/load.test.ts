// BRIEF Run 6b §3.2 — the loading rule's PURE decisions. No database: the DB-facing half of load.ts imports
// the client on use, so nothing here opens a connection.
//
// The day signal is the one that needs both of Israel's clock regimes, because a fixed offset passes a
// summer test and fails in December (or the other way round). Both pairs are here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUpdate, latestRun, storedFilters, updateSignals, type CurrentVersions, type SearchRow } from "./load";

const CURRENT: CurrentVersions = { engineVersion: 5, rulesVersion: 6 };

function row(over: Partial<SearchRow> = {}): SearchRow {
  return {
    id: 1,
    public_id: "aaaaaaaaaa",
    rerun_of: null,
    created_at: new Date("2026-09-22T09:00:00Z"),
    model_searched: "MAZDA 3",
    family_id: null,
    filters: null,
    priority: null,
    engine_version: CURRENT.engineVersion,
    rules_version: CURRENT.rulesVersion,
    results_count: 10,
    pool_count: 12,
    ...over,
  };
}

describe("latestRun() (§3.2)", () => {
  const question = row({ id: 1, created_at: new Date("2026-09-20T10:00:00Z") });

  it("no re-runs -> the question itself", () => {
    assert.equal(latestRun(question, []), question);
  });

  it("the newest by created_at wins", () => {
    const a = row({ id: 2, rerun_of: 1, created_at: new Date("2026-09-21T10:00:00Z") });
    const b = row({ id: 3, rerun_of: 1, created_at: new Date("2026-09-22T10:00:00Z") });
    assert.equal(latestRun(question, [a, b]).id, 3);
    assert.equal(latestRun(question, [b, a]).id, 3); // order of the input does not matter
  });

  it("a tie goes to the greater id", () => {
    const at = new Date("2026-09-21T10:00:00Z");
    const a = row({ id: 7, rerun_of: 1, created_at: at });
    const b = row({ id: 9, rerun_of: 1, created_at: at });
    assert.equal(latestRun(question, [a, b]).id, 9);
    assert.equal(latestRun(question, [b, a]).id, 9);
  });

  it("a re-run older than the question does not win", () => {
    const old = row({ id: 5, rerun_of: 1, created_at: new Date("2026-09-19T10:00:00Z") });
    assert.equal(latestRun(question, [old]).id, 1);
  });

  it("a tie between the question and a re-run goes to the greater id — the re-run", () => {
    const same = row({ id: 4, rerun_of: 1, created_at: question.created_at });
    assert.equal(latestRun(question, [same]).id, 4);
  });
});

describe("updateSignals() — each signal alone (§3.2)", () => {
  const run = row({ created_at: new Date("2026-09-22T09:00:00Z") });
  const now = new Date("2026-09-22T12:00:00Z"); // the same Israel day
  const before = new Date("2026-09-22T08:00:00Z");
  const after = new Date("2026-09-22T10:00:00Z");

  it("nothing fires: same day, nothing written since, versions equal", () => {
    assert.deepEqual(updateSignals(run, now, CURRENT, before, before), { data: false, day: false, version: false });
    assert.equal(isUpdate(updateSignals(run, now, CURRENT, before, before)), false);
  });

  it("data, from the listings side alone", () => {
    assert.deepEqual(updateSignals(run, now, CURRENT, after, before), { data: true, day: false, version: false });
  });

  it("data, from the dealer_commercial side alone", () => {
    assert.deepEqual(updateSignals(run, now, CURRENT, before, after), { data: true, day: false, version: false });
  });

  it("a null max on either side does not fire that side", () => {
    assert.equal(updateSignals(run, now, CURRENT, null, before).data, false);
    assert.equal(updateSignals(run, now, CURRENT, before, null).data, false);
    assert.equal(updateSignals(run, now, CURRENT, null, null).data, false);
  });

  it("a max EQUAL to created_at is not after it", () => {
    assert.equal(updateSignals(run, now, CURRENT, run.created_at, run.created_at).data, false);
  });

  it("version, from the engine alone", () => {
    assert.deepEqual(updateSignals(row({ engine_version: 4 }), now, CURRENT, before, before), { data: false, day: false, version: true });
  });

  it("version, from the rules alone", () => {
    assert.deepEqual(updateSignals(row({ rules_version: 5 }), now, CURRENT, before, before), { data: false, day: false, version: true });
  });

  it("the same instant fires nothing at all", () => {
    assert.deepEqual(updateSignals(run, run.created_at, CURRENT, null, null), { data: false, day: false, version: false });
  });

  it("an update is ANY of the three", () => {
    assert.equal(isUpdate({ data: true, day: false, version: false }), true);
    assert.equal(isUpdate({ data: false, day: true, version: false }), true);
    assert.equal(isUpdate({ data: false, day: false, version: true }), true);
    assert.equal(isUpdate({ data: false, day: false, version: false }), false);
  });
});

describe("updateSignals() — the Israel day, in BOTH clock regimes (§3.2)", () => {
  const day = (run: string, now: string) => updateSignals(row({ created_at: new Date(run) }), new Date(now), CURRENT, null, null).day;

  it("SUMMER (UTC+3): 21:00Z is already the next day in Israel", () => {
    // run 20:30Z on 1 July = 23:30 Israel; now 21:30Z = 00:30 on 2 July Israel -> a different day
    assert.equal(day("2026-07-01T20:30:00Z", "2026-07-01T21:30:00Z"), true);
    // both inside the same Israel day
    assert.equal(day("2026-07-01T09:00:00Z", "2026-07-01T20:30:00Z"), false);
  });

  it("WINTER (UTC+2): the boundary is 22:00Z, not 21:00Z", () => {
    // run 21:30Z on 1 December = 23:30 Israel; now 22:30Z = 00:30 on 2 December Israel -> a different day
    assert.equal(day("2026-12-01T21:30:00Z", "2026-12-01T22:30:00Z"), true);
    // 20:00Z and 21:30Z are 22:00 and 23:30 Israel — the SAME day, which a fixed +3 offset would get wrong
    assert.equal(day("2026-12-01T20:00:00Z", "2026-12-01T21:30:00Z"), false);
  });

  it("a whole day later always fires", () => {
    assert.equal(day("2026-09-21T09:00:00Z", "2026-09-22T09:00:00Z"), true);
  });

  it("the day signal fires on its own, with no data and no version change", () => {
    const s = updateSignals(row({ created_at: new Date("2026-09-21T09:00:00Z") }), new Date("2026-09-22T09:00:00Z"), CURRENT, null, null);
    assert.deepEqual(s, { data: false, day: true, version: false });
  });
});

describe("storedFilters() (§3.2)", () => {
  it("null is no filters", () => {
    assert.deepEqual(storedFilters(null), {});
  });

  it("an object comes back as the filters it was stored as", () => {
    assert.deepEqual(storedFilters({ priceMax: 100000, years: [2021, 2022] }), { priceMax: 100000, years: [2021, 2022] });
  });

  it("anything that is not an object is no filters", () => {
    assert.deepEqual(storedFilters([1, 2] as never), {});
    assert.deepEqual(storedFilters("x" as never), {});
  });
});
