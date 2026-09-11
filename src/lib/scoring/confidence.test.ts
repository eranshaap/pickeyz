// BRIEF §14 (amended §18.8, §18.17): confidence 0 / 1 / 2 items, reasons counted once, possibly_sold;
// and the sums of §5 end to end through scoreListing.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { confidence, confidenceLevel } from "./confidence";
import { ENGINE_VERSION } from "./constants";
import { scoreListing } from "./index";
import type { Check, Row, SoldSignal } from "./types";
import { cell, input, modelNorm, NOW, poolNorm, rows } from "./fixtures";

const scored = (row: Row["row"]): Row => ({ row, status: "scored", source: row === "price" ? "market" : "mot", value: 0, raw: {} });
const unavailable = (row: Row["row"], reason: string): Row => ({ row, status: "unavailable", reason, raw: {} });
const match: Check[] = [{ check: "hand", status: "match" }, { check: "km", status: "match" }];
const NONE: SoldSignal = { strength: null, evidence: [] };
const MEDIUM: SoldSignal = { strength: "medium", evidence: ["rule 3"] };
const STRONG: SoldSignal = { strength: "strong", evidence: ["rule 1"] };

describe("confidence (§8)", () => {
  it("0 items → high", () => {
    const c = confidence([scored("price"), scored("history"), scored("km")], match, NONE);
    assert.deepEqual(c, { level: "high", items: [] });
  });

  it("1 item → medium (a missing row; ref = the reason)", () => {
    const c = confidence([unavailable("price", "thin_cell"), scored("history"), scored("km")], match, NONE);
    assert.equal(c.level, "medium");
    assert.deepEqual(c.items, [{ kind: "missing_row", ref: "thin_cell" }]);
  });

  it("2 items → low (a counted mismatch and an unverified source)", () => {
    const history: Row = { ...scored("history"), source: "ad" };
    const checks: Check[] = [{ check: "hand", status: "mismatch", kind: "fleet_undercount", counts: true }, { check: "km", status: "match" }];
    const c = confidence([scored("price"), history, scored("km")], checks, NONE);
    assert.equal(c.level, "low");
    assert.deepEqual(c.items, [
      { kind: "counted_mismatch", ref: "hand:fleet_undercount" },
      { kind: "unverified_source", ref: "history:ad" },
    ]);
  });

  it("§18.17: a thin cell makes price and km unavailable for the same reason → one item, medium", () => {
    const c = confidence([unavailable("price", "thin_cell"), scored("history"), unavailable("km", "thin_cell")], match, NONE);
    assert.equal(c.level, "medium");
    assert.deepEqual(c.items, [{ kind: "missing_row", ref: "thin_cell" }]);
  });

  it("§18.17: two different reasons are two items", () => {
    const c = confidence([unavailable("price", "thin_cell"), scored("history"), unavailable("km", "no_km")], match, NONE);
    assert.equal(c.level, "low");
    assert.deepEqual(c.items.map((i) => i.ref), ["thin_cell", "no_km"]);
  });

  it("§18.8: a medium sold signal is one item; skipped checks are not", () => {
    const skipped: Check[] = [{ check: "hand", status: "skipped", reason: "possibly_sold" }, { check: "km", status: "skipped", reason: "possibly_sold" }];
    const c = confidence([scored("price"), scored("history"), scored("km")], skipped, MEDIUM);
    assert.equal(c.level, "medium");
    assert.deepEqual(c.items, [{ kind: "possibly_sold", ref: "sold_signal:medium" }]);
  });

  it("§18.8: a strong sold signal adds no item", () => {
    const skipped: Check[] = [{ check: "hand", status: "skipped", reason: "sold" }, { check: "km", status: "skipped", reason: "sold" }];
    const c = confidence([scored("price"), scored("history"), scored("km")], skipped, STRONG);
    assert.deepEqual(c, { level: "high", items: [] });
  });

  // §3.6 (e)
  it("Day 14 §3.5: a 'typical' history row is one assumed_typical item and suppresses unverified_source", () => {
    const typical: Row = { ...scored("history"), source: "typical" };
    const c = confidence([scored("price"), typical, scored("km")], match, NONE);
    assert.equal(c.level, "medium");
    assert.deepEqual(c.items, [{ kind: "assumed_typical", ref: "history:typical" }]);
    assert.equal(c.items.filter((i) => i.kind === "unverified_source").length, 0);
    assert.equal(c.items.filter((i) => i.kind === "assumed_typical").length, 1);
  });

  it("a mismatch that does not count is not an item", () => {
    const checks: Check[] = [{ check: "hand", status: "match" }, { check: "km", status: "mismatch", kind: "km_implausible_growth", counts: false }];
    assert.equal(confidence([scored("price"), scored("history"), scored("km")], checks, NONE).level, "high");
  });

  it("levels by count", () => {
    assert.equal(confidenceLevel(0), "high");
    assert.equal(confidenceLevel(1), "medium");
    assert.equal(confidenceLevel(2), "low");
    assert.equal(confidenceLevel(5), "low");
  });
});

describe("scoreListing (§5, §9)", () => {
  const market = cell({ median_history: -12 });

  it("74294402-shaped listing: price +10, history −10, km +6 → condition −4, vs typical +8, deal +18", () => {
    const r = scoreListing(
      input({
        listing: { price: 90000, km_declared: 20000, hand_declared: 1 },
        car: {
          hand: 2,
          ownership_history: rows("leasing 2021-10, private 2021-10"),
          first_registration: new Date("2024-09-06T12:00:00.000Z"),
          km_at_last_test: 19000,
          mivchan_acharon_dt: new Date("2026-01-27T00:00:00.000Z"),
          test_expiry: new Date("2027-01-27T00:00:00.000Z"),
        },
        market,
      }),
      NOW,
    );
    assert.equal(r.engine_version, ENGINE_VERSION);
    assert.equal(r.unit, "pct_of_value");
    assert.deepEqual(r.rows.map((x) => [x.row, x.status, x.value]), [["price", "scored", 10], ["history", "scored", -10], ["km", "scored", 6]]);
    assert.equal(r.price_advantage, 10);
    assert.equal(r.condition_score, -4);
    assert.equal(r.typical_history, -12);
    assert.equal(r.condition_vs_typical, 8); // (history −10 − typical −12) + km +6
    assert.equal(r.deal_score, 18);
    assert.equal(r.partial, undefined);
    assert.deepEqual(r.checks.map((c) => [c.check, c.status, c.kind]), [["hand", "mismatch", "zero_km_undercount"], ["km", "match", undefined]]);
    assert.deepEqual(r.sold_signal, { strength: null, evidence: [] });
    assert.deepEqual(r.facts, { dealer_transfers: 0, months_since_test: 8, km_per_month_since_test: 125, test_expiry: "2027-01-27", months_left: 4 });
    assert.deepEqual(r.confidence, { level: "medium", items: [{ kind: "counted_mismatch", ref: "hand:zero_km_undercount" }] });
  });

  it("km unavailable, history scored → condition = history alone, partial ['km']", () => {
    const r = scoreListing(input({ listing: { price: 100000 }, car: { hand: 2, ownership_history: rows("private 2021-01, private 2023-01") }, market }), NOW);
    assert.equal(r.condition_score, -4);
    assert.deepEqual(r.partial, ["km"]);
    assert.equal(r.rows[2].reason, "no_km");
    assert.equal(r.condition_vs_typical, 8);
    assert.equal(r.deal_score, 8);
  });

  it("history unavailable → condition, vs typical and deal are null; price stands alone", () => {
    // Day 14: a car with no record takes the cell's typical, so "history unavailable" now needs a cell
    // that has no typical either.
    const r = scoreListing(input({ listing: { price: 80000 }, market: cell({ median_history: null }) }), NOW);
    assert.equal(r.price_advantage, 20);
    assert.equal(r.condition_score, null);
    assert.equal(r.condition_vs_typical, null);
    assert.equal(r.deal_score, null);
    assert.equal(r.typical_history, null);
  });

  // §9.7: a thin cell is ONE root cause. Both rows say 'thin_cell', so the two dedupe into one item and
  // the listing is medium — never low for being thin.
  it("thin cell, no new price → no typical_history, no deal; both rows thin_cell → one item, medium", () => {
    // P1: a thin cell carries no median_history — fewer than MIN_SAMPLE listings in total.
    const r = scoreListing(input({ listing: { km_declared: 10000 }, car: { ownership_history: rows("private 2023-01"), first_registration: new Date("2023-01-01T00:00:00.000Z") }, market: cell({ median_history: null, sample_size: 3 }) }), NOW);
    assert.equal(r.typical_history, null);
    assert.equal(r.deal_score, null);
    assert.deepEqual(r.rows.map((x) => x.reason), ["thin_cell", undefined, "thin_cell"]);
    assert.equal(r.rows[0].raw.anchor_unavailable, "no_new_price");
    assert.deepEqual(r.confidence, { level: "medium", items: [{ kind: "missing_row", ref: "thin_cell" }] });
  });

  it("medium sold signal → checks skipped, possibly_sold item", () => {
    const r = scoreListing(input({ listing: { seller_type: "dealer", hand_declared: 1, km_declared: 1 }, car: { ownership_history: rows("private 2021-01, dealer 2026-06, private 2026-08") }, market }), NOW);
    assert.equal(r.sold_signal.strength, "medium");
    assert.deepEqual(r.checks.map((c) => [c.status, c.reason]), [["skipped", "possibly_sold"], ["skipped", "possibly_sold"]]);
    assert.deepEqual(r.confidence.items.filter((i) => i.kind === "possibly_sold"), [{ kind: "possibly_sold", ref: "sold_signal:medium" }]);
  });

  it("always three rows and two checks, in order", () => {
    const r = scoreListing(input(), NOW);
    assert.deepEqual(r.rows.map((x) => x.row), ["price", "history", "km"]);
    assert.deepEqual(r.checks.map((c) => c.check), ["hand", "km"]);
    // price: no_market_row; history: no_typical_history; km: no_km (km_declared is checked before the market)
    assert.deepEqual(r.confidence.items.map((i) => i.ref), ["no_market_row", "no_typical_history", "no_km"]);
    assert.equal(r.confidence.level, "low");
  });

  // §3.6 (e), end to end: the car has no record, so its history row is the typical and it costs exactly
  // one confidence item — assumed_typical, never unverified_source.
  it("a car with no registry record: history from the typical, one assumed_typical item, deal still scores", () => {
    const r = scoreListing(
      input({
        listing: { price: 90000, km_declared: 20000, hand_declared: 3 },
        car: { first_registration: new Date("2024-09-06T12:00:00.000Z") },
        market,
      }),
      NOW,
    );
    assert.equal(r.rows[1].source, "typical");
    assert.equal(r.rows[1].note, "assumed_typical"); // §9.9: a code, not prose
    assert.equal(r.typical_history, -12);
    assert.equal(r.condition_vs_typical, 6); // (typical −12 − typical −12) + km +6
    assert.equal(r.deal_score, 16);
    assert.deepEqual(r.confidence.items, [{ kind: "assumed_typical", ref: "history:typical" }]);
    assert.equal(r.confidence.level, "medium");
  });

  // §3.6 (d). Same inputs, both engines: v2 was price + (history + km − typical_condition), v3 is
  // price + (history − median_history) + km. The whole difference is the change of the typical.
  it("identity: for a car with a record on the default slope, deal_v3 − deal_v2 = typical_condition_v2 − median_history", () => {
    const TYPICAL_V2 = -4; // whatever the v2 cell carried in median_condition
    const MEDIAN_HISTORY = -12;
    const r = scoreListing(
      input({
        listing: { price: 90000, km_declared: 20000 },
        car: { hand: 2, ownership_history: rows("leasing 2021-10, private 2021-10"), first_registration: new Date("2024-09-06T12:00:00.000Z") },
        market: cell({ median_history: MEDIAN_HISTORY }),
        model_stats: modelNorm({ km_slope: -1.19, km_slope_n: 99 }), // below the floor → the default slope, as v2 used
      }),
      NOW,
    );
    assert.equal(r.rows[2].raw.slope_source, "default");

    // v2 rebuilt from the very same rows
    const history = r.rows[1].value as number;
    const km = r.rows[2].value as number;
    const price = r.price_advantage as number;
    const deal_v2 = price + (history + km - TYPICAL_V2);

    assert.equal((r.deal_score as number) - deal_v2, TYPICAL_V2 - MEDIAN_HISTORY);
  });

  // §3.6 (f), the other half of km.test.ts's: a thin cell WITH an anchor still ends with no deal score.
  it("thin cell with an anchor: the price row scores, the deal does not", () => {
    const r = scoreListing(
      input({
        listing: { price: 133200, new_price: 200000, new_car_price_id: 900, km_declared: 20000 },
        car: { hand: 1, ownership_history: rows("private 2022-09"), first_registration: new Date(NOW.getTime() - 4 * 365.25 * 24 * 60 * 60 * 1000) },
        // P1: a thin cell can never carry a median_history — it has fewer than MIN_SAMPLE listings in total.
        market: cell({ median_history: null, sample_size: 3 }),
        pool_stats: poolNorm(),
      }),
      NOW,
    );
    assert.equal(r.rows[0].status, "scored");
    assert.equal(r.rows[0].source, "anchor");
    assert.equal(r.price_advantage, 0);
    assert.equal(r.typical_history, null);
    assert.equal(r.deal_score, null);
  });
});
