// BRIEF Run 8 §1.4 — the drawer's rules, on small synthetic pools. Pure: no database, no clock, no DOM.
//
// Every case is one of the thirteen §1.4 names. The pools are hand-built so that the arithmetic can be read
// off the rows: a "car" here is the Filterable the search itself cuts with (filters.ts), which is exactly
// what resolveDrawer() consumes in the page and in the action.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyFilters, draftFromQuestion, isUnchanged, resolveDrawer, toggleChip, type DrawerShelf, type ResolvedDrawer } from "./chip-state";
import type { Filterable, SearchFilters } from "./filters";

const car = (price: number, year: number, km: number | null, region: string | null): Filterable => ({ price, year, km_declared: km, region });

/** The shelf of the pool below: the years with stock, three km anchors, the regions present. */
const SHELF: DrawerShelf = { years: [2021, 2022], km_anchors: [60_000, 90_000], regions: ["צפון", "מרכז"] };

/**
 * Six cars, chosen so that each rule of §1.2 has a case:
 *   north is expensive (both cars over 100,000), centre is cheap
 *   2021 lives only in the north, 2022 lives in both
 */
const POOL: Filterable[] = [
  car(120_000, 2021, 50_000, "צפון"),
  car(130_000, 2022, 70_000, "צפון"),
  car(80_000, 2022, 50_000, "מרכז"),
  car(85_000, 2022, 95_000, "מרכז"),
  car(90_000, 2022, 40_000, "מרכז"),
  car(140_000, 2021, 30_000, "צפון"),
];

const resolve = (draft: SearchFilters, pool: Filterable[] = POOL, shelf: DrawerShelf = SHELF) => resolveDrawer(pool, shelf, draft);

const chip = (r: ResolvedDrawer, group: "years" | "kmMax" | "regions", value: number | string) =>
  (group === "years" ? r.years : group === "kmMax" ? r.km : r.regions).find((c) => c.value === value);

// ---------------------------------------------------------------------------

describe("Run 8 §1.4 — the chip-state library", () => {
  it("1. an off chip with count 0: toggleChip returns the draft unchanged", () => {
    // under a 90,000 ceiling on price, no 2021 car survives (both northern 2021s cost 120k and 140k)
    const draft: SearchFilters = { priceMax: 90_000 };
    const r = resolve(draft);
    const y2021 = chip(r, "years", 2021);
    assert.equal(y2021?.state, "off");
    assert.equal(y2021?.count, 0);
    assert.equal(y2021?.selectable, false);

    const next = toggleChip(draft, r, { group: "years", value: 2021 });
    assert.equal(next, draft); // the very same object: nothing happened, and nothing is sent
  });

  it("2. an awake chip whose count drops to 0 through a typed price -> dormant, not in effective, not in total", () => {
    const awake = resolve({ regions: ["צפון"] });
    assert.equal(chip(awake, "regions", "צפון")?.state, "awake");

    const draft: SearchFilters = { regions: ["צפון"], priceMax: 90_000 };
    const r = resolve(draft);
    assert.equal(chip(r, "regions", "צפון")?.state, "dormant");
    assert.equal(chip(r, "regions", "צפון")?.count, 0);
    assert.deepEqual(r.effective, { priceMax: 90_000 }); // the region is not in the filters
    assert.equal(r.total, 3); // the three centre cars under 90,000 — the price-only pool
    assert.equal(r.emptyCombination, false);
  });

  it("3. the same draft with the price removed -> awake again, with no click", () => {
    const r = resolve({ regions: ["צפון"] });
    assert.equal(chip(r, "regions", "צפון")?.state, "awake");
    assert.equal(chip(r, "regions", "צפון")?.count, 3);
    assert.deepEqual(r.effective, { regions: ["צפון"] });
    assert.equal(r.total, 3);
  });

  it("4. click on an awake chip -> off; a later count change does not wake it", () => {
    const draft: SearchFilters = { regions: ["צפון"] };
    const r = resolve(draft);
    const off = toggleChip(draft, r, { group: "regions", value: "צפון" });
    assert.deepEqual(off, {}); // the group is cleared, not left as an empty array
    assert.equal(chip(resolve(off), "regions", "צפון")?.state, "off");

    // the count changes under it (a price is typed and then deleted) and it stays off — the memory is gone
    assert.equal(chip(resolve({ ...off, priceMax: 90_000 }), "regions", "צפון")?.state, "off");
    assert.equal(chip(resolve(off), "regions", "צפון")?.state, "off");
  });

  it("5. isUnchanged: the stored question, one chip toggled, a price typed, the price deleted, a dormant chip on open", () => {
    const stored: SearchFilters = { years: [2022], regions: ["מרכז"] };

    assert.equal(isUnchanged(draftFromQuestion(stored), stored), true); // its own chips and bounds
    assert.equal(isUnchanged({ years: [2022] }, stored), false); // one chip toggled
    assert.equal(isUnchanged({ ...stored, priceMax: 90_000 }, stored), false); // a price typed
    assert.equal(isUnchanged(stored, stored), true); // the price deleted again

    // a stored chip that is dormant on open (the market changed) and nothing else touched -> still unchanged
    const marketChanged: SearchFilters = { regions: ["צפון"], priceMax: 90_000 };
    const r = resolve(marketChanged);
    assert.equal(chip(r, "regions", "צפון")?.state, "dormant");
    assert.equal(isUnchanged(draftFromQuestion(marketChanged), marketChanged), true);
  });

  it("6. applyFilters with a dormant chip -> the dormant chip absent from the sent filters", () => {
    const r = resolve({ regions: ["צפון"], priceMax: 90_000 });
    assert.deepEqual(applyFilters(r), { priceMax: 90_000 });
  });

  it("7. opening on a question whose chip has 0 cars now -> dormant from the first render, isUnchanged true", () => {
    // the pool lost every northern car since the question was stored; the shelf no longer offers the region
    const pool = POOL.filter((c) => c.region === "מרכז");
    const shelf: DrawerShelf = { years: [2022], km_anchors: [60_000, 90_000], regions: ["מרכז"] };
    const stored: SearchFilters = { regions: ["צפון"] };
    const draft = draftFromQuestion(stored);

    const r = resolve(draft, pool, shelf);
    assert.deepEqual(r.effective, {}); // the chosen region is dormant, so it filters nothing
    assert.equal(r.total, 3);
    assert.equal(isUnchanged(draft, stored), true); // nothing was done, so the button stays greyed
    assert.equal(chip(r, "regions", "צפון"), undefined); // and the shelf has no chip to draw for it

    // the same thing with a chip the shelf DOES still offer: dormant, drawn, count 0
    const onShelf = resolve({ regions: ["צפון"], priceMax: 90_000 });
    assert.equal(chip(onShelf, "regions", "צפון")?.state, "dormant");
    assert.equal(chip(onShelf, "regions", "צפון")?.count, 0);
  });

  it("8. multi-select: {2021, 2022} + a region + a price -> 2021 dormant, 2022 awake, region awake", () => {
    // ceiling 130,000: the north keeps one 2021 (120k) and one 2022 (130k) — so add a region+price where
    // 2021 has nothing and 2022 has cars: the centre under 130,000 is 2022 only.
    const draft: SearchFilters = { years: [2021, 2022], regions: ["מרכז"], priceMax: 130_000 };
    const r = resolve(draft);

    assert.equal(chip(r, "years", 2021)?.state, "dormant");
    assert.equal(chip(r, "years", 2021)?.count, 0);
    assert.equal(chip(r, "years", 2022)?.state, "awake");
    assert.equal(chip(r, "years", 2022)?.count, 3);
    assert.equal(chip(r, "regions", "מרכז")?.state, "awake");

    assert.deepEqual(r.effective, { priceMax: 130_000, years: [2022], regions: ["מרכז"] });
    assert.equal(r.total, 3); // the three centre 2022 cars
    assert.equal(r.emptyCombination, false);
  });

  it("9. the empty combination: two chips of different groups, each with cars alone, none together", () => {
    // 2021 exists (north only) and מרכז exists (2022 only); together they are nothing, and neither is a culprit
    const draft: SearchFilters = { years: [2021], regions: ["מרכז"] };
    const r = resolve(draft);

    assert.equal(chip(r, "years", 2021)?.state, "awake");
    assert.equal(chip(r, "regions", "מרכז")?.state, "awake");
    assert.equal(chip(r, "years", 2021)?.count, 0);
    assert.equal(chip(r, "regions", "מרכז")?.count, 0);
    assert.equal(r.total, 0);
    assert.equal(r.emptyCombination, true);
    assert.deepEqual(r.effective, { years: [2021], regions: ["מרכז"] }); // nothing was put to sleep
  });

  it("10. two chips that the price alone empties (different groups) -> both dormant, total = the price-only pool", () => {
    // under 100,000 there is no 2021 car and no northern car at all
    const draft: SearchFilters = { years: [2021], regions: ["צפון"], priceMax: 100_000 };
    const r = resolve(draft);

    assert.equal(chip(r, "years", 2021)?.state, "dormant");
    assert.equal(chip(r, "regions", "צפון")?.state, "dormant");
    assert.deepEqual(r.effective, { priceMax: 100_000 });
    assert.equal(r.total, 3);
    assert.equal(r.emptyCombination, false);
  });

  it("11. click on a dormant chip -> off (memory cleared)", () => {
    const draft: SearchFilters = { regions: ["צפון"], priceMax: 90_000 };
    const r = resolve(draft);
    assert.equal(chip(r, "regions", "צפון")?.state, "dormant");

    const next = toggleChip(draft, r, { group: "regions", value: "צפון" });
    assert.deepEqual(next, { priceMax: 90_000 });
    assert.equal(chip(resolve(next), "regions", "צפון")?.state, "off");
    // and deleting the price no longer wakes it: the chosen set does not carry it any more
    assert.equal(chip(resolve({}), "regions", "צפון")?.state, "off");
  });

  it("12. a single-select group: choosing a second km chip replaces the first", () => {
    const first = toggleChip({}, resolve({}), { group: "kmMax", value: 60_000 });
    assert.deepEqual(first, { kmMax: 60_000 });

    const second = toggleChip(first, resolve(first), { group: "kmMax", value: 90_000 });
    assert.deepEqual(second, { kmMax: 90_000 }); // the first's memory is cleared, not kept beside it

    const cleared = toggleChip(second, resolve(second), { group: "kmMax", value: 90_000 });
    assert.deepEqual(cleared, {}); // clicking the chosen one switches the group off
  });

  it("13. counts keep today's definition: toggling a chip inside a group does not change that group's numbers", () => {
    const before = resolve({ regions: ["מרכז"] });
    const after = resolve({ regions: ["מרכז", "צפון"] });
    // the REGION group's own numbers are taken with the region group ignored, so they are identical
    assert.deepEqual(
      before.regions.map((c) => [c.value, c.count]),
      after.regions.map((c) => [c.value, c.count]),
    );
    // and the years, which ARE in another group, do move with it
    assert.deepEqual(before.years.map((c) => c.count), [0, 3]);
    assert.deepEqual(after.years.map((c) => c.count), [2, 4]);
  });
});
