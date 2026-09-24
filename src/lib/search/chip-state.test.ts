// BRIEF Run 8b §6 — the drawer's rules, on small synthetic pools. Pure: no database, no clock, no DOM.
//
// Every case is one of the fifteen §6 names. Run 8's thirteen are replaced, not dropped: the four that were
// about the DORMANT chip (a chip that went grey at 0, stayed in the chosen set and woke by itself) are gone
// with the state itself, and cases 2, 3, 6 and 8 below cover the rule that replaced it — a chosen chip an
// edit takes to 0 LEAVES the selection and never comes back by itself.
//
// The pools are hand-built so that the arithmetic can be read off the rows: a "car" here is the Filterable
// the search itself cuts with (filters.ts), which is exactly what the page, the model-rows action and the
// browser all hand to resolveDrawer().

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyFilters,
  draftFromQuestion,
  isUnchanged,
  release,
  resolveDrawer,
  shelfOf,
  toggleChip,
  type DrawerShelf,
  type ModelRows,
  type ResolvedDrawer,
} from "./chip-state";
import type { Filterable, SearchFilters } from "./filters";

const car = (price: number, year: number, km: number | null, region: string | null): Filterable => ({ price, year, km_declared: km, region });

/**
 * Six cars, chosen so that each rule of §1 has a case:
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

const ANCHORS = [60_000, 90_000];

/** The shelf of the pool above: the years with stock, the two km anchors, the regions present. */
const SHELF: DrawerShelf = { years: [2021, 2022], km_anchors: ANCHORS, regions: ["צפון", "מרכז"] };

/** One model's rows, as §2.1 carries them to the browser. */
const rowsOf = (rows: Filterable[], km_anchors: number[] | null = ANCHORS): ModelRows => ({
  model: "TEST 3",
  model_key: "TEST3",
  rows,
  km_anchors,
  km_note: null,
});

const resolve = (draft: SearchFilters, pool: Filterable[] = POOL, shelf: DrawerShelf = SHELF) => resolveDrawer(pool, shelf, draft);

const chip = (r: ResolvedDrawer, group: "years" | "kmMax" | "regions", value: number | string) =>
  (group === "years" ? r.years : group === "kmMax" ? r.km : r.regions).find((c) => c.value === value);

/** What a settled price does: the draft with the new bounds, then the release (§1.2) — FilterPanel's settle(). */
const settlePrice = (draft: SearchFilters, price: Partial<Pick<SearchFilters, "priceMin" | "priceMax">>, pool: Filterable[] = POOL) => {
  const next: SearchFilters = { ...draft };
  for (const field of ["priceMin", "priceMax"] as const) {
    if (!(field in price)) continue;
    const value = price[field];
    if (value === undefined) delete next[field];
    else next[field] = value;
  }
  return release(pool, next);
};

// ---------------------------------------------------------------------------

describe("Run 8b §6 — the chip-state library", () => {
  it("1. an off chip with count 0: toggleChip returns the draft unchanged", () => {
    // under a 90,000 ceiling no 2021 car survives (both northern 2021s cost 120k and 140k)
    const draft: SearchFilters = { priceMax: 90_000 };
    const r = resolve(draft);
    assert.equal(chip(r, "years", 2021)?.state, "off-0");
    assert.equal(chip(r, "years", 2021)?.count, 0);

    const next = toggleChip(POOL, draft, r, { group: "years", value: 2021 });
    assert.equal(next, draft); // the very same object: nothing happened, nothing released, nothing sent
  });

  it("2. a chosen chip that a typed price takes to 0 -> released, and drawn off-0", () => {
    const chosen: SearchFilters = { regions: ["צפון"] };
    assert.equal(chip(resolve(chosen), "regions", "צפון")?.state, "chosen");
    assert.equal(chip(resolve(chosen), "regions", "צפון")?.count, 3);

    const settled = settlePrice(chosen, { priceMax: 90_000 });
    assert.deepEqual(settled, { priceMax: 90_000 }); // the region left the draft

    const r = resolve(settled);
    assert.equal(chip(r, "regions", "צפון")?.state, "off-0");
    assert.equal(chip(r, "regions", "צפון")?.count, 0);
    assert.equal(r.total, 3); // the three centre cars under 90,000
  });

  it("3. the same price deleted -> the chip stays off, now with its number, clickable — no return", () => {
    const released = settlePrice({ regions: ["צפון"] }, { priceMax: 90_000 });
    const deleted = settlePrice(released, { priceMax: undefined });
    assert.deepEqual(deleted, {}); // the price is gone and the region did NOT come back with it

    const r = resolve(deleted);
    assert.equal(chip(r, "regions", "צפון")?.state, "off"); // clickable, not chosen
    assert.equal(chip(r, "regions", "צפון")?.count, 3);
    assert.equal(r.total, 6);
  });

  it("4. click on a chosen chip -> off", () => {
    const draft: SearchFilters = { regions: ["צפון"] };
    const off = toggleChip(POOL, draft, resolve(draft), { group: "regions", value: "צפון" });
    assert.deepEqual(off, {}); // the group is cleared, not left as an empty array
    assert.equal(chip(resolve(off), "regions", "צפון")?.state, "off");
  });

  it("5. isUnchanged: the stored question, a chip toggled, a price typed, a price typed and deleted both ways", () => {
    const stored: SearchFilters = { years: [2022], regions: ["מרכז"] };

    assert.equal(isUnchanged(draftFromQuestion(stored), stored), true); // its own chips and bounds
    assert.equal(isUnchanged({ years: [2022] }, stored), false); // one chip toggled
    assert.equal(isUnchanged({ ...stored, priceMax: 200_000 }, stored), false); // a price typed

    // typed and deleted with NOTHING released -> unchanged again, the button greyed again
    const typed = settlePrice(stored, { priceMax: 200_000 });
    assert.deepEqual(typed, { ...stored, priceMax: 200_000 }); // nothing was at 0, so nothing left the draft
    assert.equal(isUnchanged(settlePrice(typed, { priceMax: undefined }), stored), true);

    // typed, RELEASING a chip, then deleted -> NOT unchanged: the chip does not come back, so the button stays lit
    const north: SearchFilters = { regions: ["צפון"] };
    const afterRelease = settlePrice(north, { priceMax: 90_000 });
    assert.deepEqual(afterRelease, { priceMax: 90_000 });
    assert.equal(isUnchanged(settlePrice(afterRelease, { priceMax: undefined }), north), false);
  });

  it("6. opening on a stored question whose chip is 0 now -> chosen with count 0, isUnchanged true; the first edit releases it", () => {
    // the pool lost every northern car since the question was stored; §3 keeps the region on the shelf anyway
    const model = rowsOf(POOL.filter((c) => c.region === "מרכז"));
    const stored: SearchFilters = { regions: ["צפון"] };
    const shelf = shelfOf(model, stored);
    assert.deepEqual(shelf.regions, ["מרכז", "צפון"]); // the stored value joined, so it has a chip to be drawn on

    const draft = draftFromQuestion(stored);
    const r = resolve(draft, model.rows, shelf);
    assert.equal(chip(r, "regions", "צפון")?.state, "chosen"); // drawn as it was stored — nothing is released on open
    assert.equal(chip(r, "regions", "צפון")?.count, 0);
    assert.equal(r.total, 0);
    assert.equal(isUnchanged(draft, stored), true); // nothing was done, so the button stays greyed

    // and the FIRST edit releases it, like any chosen chip at 0
    const edited = settlePrice(draft, { priceMax: 100_000 }, model.rows);
    assert.deepEqual(edited, { priceMax: 100_000 });
    assert.equal(chip(resolve(edited, model.rows, shelf), "regions", "צפון")?.state, "off-0");
  });

  it("7. multi-select: {2021, 2022} + a region + a price where 2021 is 0 -> 2021 released, 2022 kept", () => {
    // the centre under 130,000 is 2022 only, so 2021 has nothing there and 2022 has three cars
    const released = settlePrice({ years: [2021, 2022], regions: ["מרכז"] }, { priceMax: 130_000 });
    assert.deepEqual(released, { priceMax: 130_000, years: [2022], regions: ["מרכז"] });

    const r = resolve(released);
    assert.equal(chip(r, "years", 2021)?.state, "off-0");
    assert.equal(chip(r, "years", 2021)?.count, 0);
    assert.equal(chip(r, "years", 2022)?.state, "chosen");
    assert.equal(chip(r, "years", 2022)?.count, 3);
    assert.equal(chip(r, "regions", "מרכז")?.state, "chosen");
    assert.equal(r.total, 3);
  });

  it("8. two chosen chips of different groups, 0 together, each > 0 alone -> both released, each then showing its count", () => {
    // 2021 is northern only and the centre under 130,000 is 2022 only: neither is a culprit on its own, and
    // Run 8 kept both awake with total 0 (`emptyCombination`). The rule now is that BOTH are released.
    const draft: SearchFilters = { years: [2021], regions: ["מרכז"], priceMax: 130_000 };
    assert.equal(resolve(draft).total, 0);

    const released = release(POOL, draft);
    assert.deepEqual(released, { priceMax: 130_000 });

    const r = resolve(released);
    assert.equal(chip(r, "years", 2021)?.state, "off");
    assert.equal(chip(r, "years", 2021)?.count, 1); // the 120,000 northern 2021
    assert.equal(chip(r, "regions", "מרכז")?.state, "off");
    assert.equal(chip(r, "regions", "מרכז")?.count, 3);
    assert.equal(r.total, 5); // everything under 130,000 — the 140,000 northern 2021 is the only car out
  });

  it("9. a price that leaves the whole model nothing -> every chosen chip released, total 0", () => {
    const draft: SearchFilters = { years: [2022], kmMax: 90_000, regions: ["מרכז"] };
    const released = settlePrice(draft, { priceMax: 10_000 });
    assert.deepEqual(released, { priceMax: 10_000 });

    const r = resolve(released);
    assert.equal(r.total, 0); // the button reads "עדכן · 0"
    for (const c of [...r.years, ...r.km, ...r.regions]) assert.equal(c.state, "off-0");
  });

  it("10. a single-select group: choosing a second km chip replaces the first", () => {
    const first = toggleChip(POOL, {}, resolve({}), { group: "kmMax", value: 60_000 });
    assert.deepEqual(first, { kmMax: 60_000 });

    const second = toggleChip(POOL, first, resolve(first), { group: "kmMax", value: 90_000 });
    assert.deepEqual(second, { kmMax: 90_000 }); // replaced, not kept beside it

    const cleared = toggleChip(POOL, second, resolve(second), { group: "kmMax", value: 90_000 });
    assert.deepEqual(cleared, {}); // clicking the chosen one switches the group off
  });

  it("11. counts keep today's definition: toggling a chip inside a group does not change that group's numbers", () => {
    const before = resolve({ regions: ["מרכז"] });
    const added = toggleChip(POOL, { regions: ["מרכז"] }, before, { group: "regions", value: "צפון" });
    assert.deepEqual(added, { regions: ["מרכז", "צפון"] }); // nothing was released by the click
    const after = resolve(added);

    // the REGION group's own numbers are taken with the region group ignored, so they are identical
    assert.deepEqual(
      before.regions.map((c) => [c.value, c.count]),
      after.regions.map((c) => [c.value, c.count]),
    );
    // and the years, which ARE another group, do move with it
    assert.deepEqual(
      before.years.map((c) => c.count),
      [0, 3],
    );
    assert.deepEqual(
      after.years.map((c) => c.count),
      [2, 4],
    );
  });

  it("12. a model change is an edit: chosen chips at 0 in the new model's rows are released", () => {
    const draft: SearchFilters = { years: [2021], regions: ["צפון"] };
    assert.equal(release(POOL, draft), draft); // in THIS model both chips have cars, so nothing is released

    const other = rowsOf(POOL.filter((c) => c.region === "מרכז")); // no northern car and no 2021 at all
    assert.deepEqual(release(other.rows, draft), {});
  });

  it("13. after any release no chosen chip has count 0 — the one-pass property", () => {
    const years: (number[] | undefined)[] = [undefined, [2021], [2022], [2021, 2022]];
    const regions: (string[] | undefined)[] = [undefined, ["צפון"], ["מרכז"], ["צפון", "מרכז"]];
    const kms: (number | undefined)[] = [undefined, 60_000, 90_000];
    const prices: (number | undefined)[] = [undefined, 10_000, 82_000, 90_000, 100_000, 130_000];

    let checked = 0;
    for (const y of years)
      for (const rg of regions)
        for (const km of kms)
          for (const priceMax of prices) {
            const draft: SearchFilters = {};
            if (y !== undefined) draft.years = y;
            if (rg !== undefined) draft.regions = rg;
            if (km !== undefined) draft.kmMax = km;
            if (priceMax !== undefined) draft.priceMax = priceMax;

            const released = release(POOL, draft);
            const r = resolve(released);
            for (const c of [...r.years, ...r.km, ...r.regions]) {
              if (c.state !== "chosen") continue;
              assert.ok(c.count > 0, `${JSON.stringify(draft)} -> ${JSON.stringify(released)}: ${c.group} ${c.value} is chosen at 0`);
            }
            // one pass is the whole rule: a second pass has nothing left to do
            assert.equal(release(POOL, released), released);
            checked++;
          }
    assert.equal(checked, years.length * regions.length * kms.length * prices.length);
  });

  it("14. the shelf: a stored value with no stock appears with count 0; a draft-only value without stock does not join", () => {
    const model = rowsOf(POOL.filter((c) => c.region === "מרכז")); // three centre 2022 cars
    const stored: SearchFilters = { years: [2019], kmMax: 120_000, regions: ["צפון"] };

    const shelf = shelfOf(model, stored);
    assert.deepEqual(shelf.years, [2019, 2022]); // the stored year joined, ascending
    assert.deepEqual(shelf.regions, ["מרכז", "צפון"]); // the stored region joined, by name
    assert.deepEqual(shelf.km_anchors, [60_000, 90_000, 120_000]); // the stored ceiling joined the anchors

    const r = resolve(draftFromQuestion(stored), model.rows, shelf);
    assert.equal(chip(r, "years", 2019)?.state, "chosen");
    assert.equal(chip(r, "years", 2019)?.count, 0);
    assert.equal(chip(r, "regions", "צפון")?.count, 0);
    assert.equal(chip(r, "kmMax", 120_000)?.count, 0);

    // the DRAFT's own values do not join: only the on-screen question's do
    const bare = shelfOf(model, null);
    assert.deepEqual(bare.years, [2022]);
    assert.deepEqual(bare.regions, ["מרכז"]);
    assert.deepEqual(bare.km_anchors, [60_000, 90_000]);
    assert.equal(chip(resolveDrawer(model.rows, bare, { years: [2019] }), "years", 2019), undefined);

    // a model with no anchors at all has no km group, as it always did
    assert.equal(shelfOf(rowsOf(model.rows, null), stored).km_anchors, null);
    assert.deepEqual(resolveDrawer(model.rows, shelfOf(rowsOf(model.rows, null), null), {}).km, []);
  });

  it("15. applyFilters after an edit never contains a chip at 0", () => {
    const sent = applyFilters(settlePrice({ years: [2021, 2022], regions: ["מרכז"] }, { priceMax: 130_000 }));
    assert.deepEqual(sent, { priceMax: 130_000, years: [2022], regions: ["מרכז"] });

    const r = resolve(sent);
    for (const c of [...r.years, ...r.km, ...r.regions]) if (c.state === "chosen") assert.ok(c.count > 0);

    // and the unchanged stored question is returned as it stands — the screen cancels on it, it is not sent
    const stored: SearchFilters = { years: [2022], regions: ["מרכז"] };
    assert.deepEqual(applyFilters(draftFromQuestion(stored)), stored);
  });
});
