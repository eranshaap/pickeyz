// BRIEF §14: the four history cases of §4.2 verbatim (histories from the database), the LY
// combination rule, and the zero-km window.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeHistory, combineDeductions, historyRow } from "./history";
import { scoreListing } from "./index";
import { input, NOW, rows } from "./fixtures";

describe("history row — the four known cars (§4.2)", () => {
  it("74294402: leasing 2021-10 → private 2021-10 — zero-km; users 1; [zero_km −10 full]; first hand 0 → −10", () => {
    const r = historyRow(input({ car: { hand: 2, ownership_history: rows("leasing 2021-10, private 2021-10") } }));
    assert.equal(r.status, "scored");
    assert.equal(r.source, "mot");
    assert.equal(r.value, -10);
    assert.equal(r.raw.zero_km_deal, true);
    assert.equal(r.raw.months_to_first_private, 0);
    assert.equal(r.raw.users, 1);
    assert.equal(r.raw.paper_hand, 2);
    assert.deepEqual(r.raw.deductions, [{ for: "zero_km_leasing", pct: -10, applied: -10, rule: "largest_in_full" }]);
  });

  it("79283502: leasing → dealer → private (all 2022-01) → … (hand 4) — zero-km through a dealer; users 3 → −14.5", () => {
    const history = rows(
      "leasing 2022-01, dealer 2022-01, private 2022-01, dealer 2023-04, private 2023-05, dealer 2024-03, private 2024-05, dealer 2026-05",
    );
    const r = historyRow(input({ car: { hand: 4, ownership_history: history } }));
    assert.equal(r.status, "scored");
    assert.equal(r.value, -14.5);
    assert.equal(r.raw.zero_km_deal, true);
    assert.equal(r.raw.months_to_first_private, 0);
    assert.equal(r.raw.users, 3);
    assert.equal(r.raw.paper_hand, 4);
    assert.equal(r.raw.dealer_transfers, 4);
    assert.deepEqual(r.raw.deductions, [
      { for: "zero_km_leasing", pct: -10, applied: -10, rule: "largest_in_full" },
      { for: "owners:3", pct: -9, applied: -4.5, rule: "halved" },
    ]);
  });

  it("34562903: private 2023-01 → private 2023-01 → dealer → dealer — private pair; users 1; no type deductions; first hand 0 → 0; paper_hand 2", () => {
    const r = historyRow(input({ car: { hand: 2, ownership_history: rows("private 2023-01, private 2023-01, dealer 2025-06, dealer 2025-06") } }));
    assert.equal(r.status, "scored");
    assert.equal(r.value, 0);
    assert.equal(r.raw.private_pair, true);
    assert.equal(r.raw.zero_km_deal, false);
    assert.equal(r.raw.users, 1);
    assert.equal(r.raw.paper_hand, 2);
    assert.equal(r.raw.dealer_transfers, 2);
    assert.deepEqual(r.raw.deductions, []);
  });

  it("50997203: leasing 2023-07 → dealer ×4 in 2026-08 — users 1; [leasing −21 full]; first hand 0 → −21; dealer_transfers 4", () => {
    const r = historyRow(input({ car: { hand: 1, ownership_history: rows("leasing 2023-07, dealer 2026-08, dealer 2026-08, dealer 2026-08, dealer 2026-08") } }));
    assert.equal(r.status, "scored");
    assert.equal(r.value, -21);
    assert.equal(r.raw.zero_km_deal, false);
    assert.equal(r.raw.users, 1);
    assert.equal(r.raw.dealer_transfers, 4);
    assert.deepEqual(r.raw.deductions, [{ for: "leasing", pct: -21, applied: -21, rule: "largest_in_full" }]);
  });
});

describe("history row — sources and failures", () => {
  it("no history, hand_declared present → source 'ad', users = hand_declared, partial owner_types", () => {
    const r = historyRow(input({ listing: { hand_declared: 2 } }));
    assert.equal(r.status, "scored");
    assert.equal(r.source, "ad");
    assert.equal(r.value, -4);
    assert.deepEqual(r.partial, ["owner_types"]);
    assert.equal(r.raw.users, 2);
    assert.equal(r.raw.dealer_transfers, null);
  });

  it("no history, no hand_declared → unavailable no_history", () => {
    const r = historyRow(input());
    assert.equal(r.status, "unavailable");
    assert.equal(r.reason, "no_history");
  });

  it("no history, hand_declared 0 → unavailable invalid_declaration, no throw (§18.7)", () => {
    const r = historyRow(input({ listing: { hand_declared: 0 } }));
    assert.equal(r.status, "unavailable");
    assert.equal(r.reason, "invalid_declaration");
  });

  it("history present, hand_declared 0 → the row is computed from the history as usual (§18.7)", () => {
    const r = historyRow(input({ listing: { hand_declared: 0 }, car: { hand: 1, ownership_history: rows("leasing 2023-07, dealer 2026-08") } }));
    assert.equal(r.status, "scored");
    assert.equal(r.value, -21);
  });

  it("no history, hand_declared 1 → first hand is 0, no entry", () => {
    const r = historyRow(input({ listing: { hand_declared: 1 } }));
    assert.equal(r.value, 0);
    assert.deepEqual(r.raw.deductions, []);
  });

  it("an ownership type with no table row throws with the type in the message", () => {
    const history = rows("private 2021-01, private 2023-01");
    (history[1] as { type: string }).type = "diplomatic";
    assert.throws(() => historyRow(input({ car: { ownership_history: history } })), /diplomatic/);
  });

  it("a record that is not oldest-first throws", () => {
    assert.throws(() => historyRow(input({ car: { ownership_history: rows("private 2023-01, leasing 2021-01") } })), /oldest-first/);
  });

  it("5+ users use the 4 row", () => {
    const r = historyRow(input({ car: { ownership_history: rows("private 2019-01, private 2020-01, private 2021-01, private 2022-01, private 2023-01, private 2024-01") } }));
    assert.equal(r.raw.users, 6);
    assert.equal(r.value, -12);
  });
});

describe("LY combination rule (§4.2)", () => {
  it("−21, −21, −9 → −21 −10.5 −4.5 = −36", () => {
    const c = combineDeductions([{ for: "leasing", pct: -21 }, { for: "company", pct: -21 }, { for: "owners:3", pct: -9 }], null);
    assert.equal(c.value, -36);
    assert.deepEqual(c.deductions.map((d) => d.applied), [-21, -10.5, -4.5]);
    assert.deepEqual(c.deductions.map((d) => d.rule), ["largest_in_full", "halved", "halved"]);
  });

  it("five deductions that exceed −40 are floored at −40", () => {
    const five = [
      { for: "rental", pct: -22 }, { for: "leasing", pct: -21 }, { for: "leasing", pct: -21 },
      { for: "company", pct: -21 }, { for: "owners:5", pct: -12 },
    ];
    const c = combineDeductions(five, null);
    assert.equal(c.sum_before_cap, -22 - 10.5 - 10.5 - 10.5 - 6);
    assert.equal(c.value, -40);
  });

  it("the +1 bonus survives the floor", () => {
    const c = combineDeductions([{ for: "rental", pct: -22 }, { for: "leasing", pct: -21 }, { for: "leasing", pct: -21 }, { for: "company", pct: -21 }], { for: "owners:1", pct: 1 });
    assert.equal(c.value, -39);
    assert.equal(c.deductions.at(-1)?.rule, "bonus");
  });

  it("sorts by magnitude, largest first", () => {
    const c = combineDeductions([{ for: "owners:2", pct: -4 }, { for: "leasing", pct: -21 }], null);
    assert.deepEqual(c.deductions.map((d) => d.for), ["leasing", "owners:2"]);
    assert.equal(c.value, -23);
  });
});

describe("zero-km window (§4.2 detector 1)", () => {
  it("12 months in", () => {
    const a = analyzeHistory(rows("leasing 2020-01, private 2021-01"));
    assert.equal(a.zero_km_deal, true);
    assert.equal(a.months_to_first_private, 12);
    assert.equal(a.users, 1);
  });

  it("13 months out", () => {
    const a = analyzeHistory(rows("leasing 2020-01, private 2021-02"));
    assert.equal(a.zero_km_deal, false);
    assert.equal(a.months_to_first_private, 13);
    assert.equal(a.users, 2);
  });

  it("a non-dealer, non-private row between leasing and private blocks the detector", () => {
    const a = analyzeHistory(rows("leasing 2020-01, rental 2020-02, private 2020-03"));
    assert.equal(a.zero_km_deal, false);
    assert.equal(a.months_to_first_private, null);
    assert.equal(a.users, 3);
  });

  it("dealer rows between leasing and private are skipped", () => {
    const a = analyzeHistory(rows("dealer 2020-01, leasing 2020-01, dealer 2020-02, private 2020-03"));
    assert.equal(a.zero_km_deal, true);
    assert.equal(a.months_to_first_private, 2);
    assert.equal(a.dealer_transfers, 2);
  });

  it("rental first does not qualify", () => {
    const a = analyzeHistory(rows("rental 2020-01, private 2020-02"));
    assert.equal(a.zero_km_deal, false);
  });
});

describe("private pair — chained (§18.6)", () => {
  it("three private rows in one month → users −= 2", () => {
    const a = analyzeHistory(rows("private 2023-01, private 2023-01, private 2023-01"));
    assert.equal(a.private_pairs, 2);
    assert.equal(a.users, 1);
  });

  it("two pairs separated by a dealer row are two pairs", () => {
    const a = analyzeHistory(rows("private 2021-01, private 2021-02, dealer 2022-01, private 2022-02, private 2022-02"));
    assert.equal(a.private_pairs, 2);
    assert.equal(a.users, 2);
  });

  it("a month gap of 2 is not a pair", () => {
    const a = analyzeHistory(rows("private 2023-01, private 2023-03"));
    assert.equal(a.private_pairs, 0);
    assert.equal(a.users, 2);
  });
});

// BRIEF Day 12 §1–§2, §5: the reality reading of the history row (value_by_reality) and the reality
// sum (condition_by_reality). The paper reading — every expectation above — is untouched.
describe("reality reading (Day 12 §1, §5)", () => {
  const market = { id: 7, median_price: 100000, median_km: 40000, median_condition: -12, sample_size: 8, window_days: 90 };
  // a km row that scores: 20,000 km declared on a 2023-01 car against a 40,000 median
  const kmScored = { listing: { km_declared: 20000 }, car: { first_registration: new Date("2023-01-01T00:00:00.000Z") } };

  it("§5.1 zero-km car, one private user: paper [zero_km −10] → −10; reality [] → 0", () => {
    const r = historyRow(input({ car: { hand: 2, ownership_history: rows("leasing 2021-10, private 2021-10") } }));
    assert.equal(r.raw.zero_km_deal, true);
    assert.equal(r.raw.users, 1);
    assert.equal(r.value, -10);
    assert.equal(r.value_by_reality, 0);
    // the paper deductions are recorded as before
    assert.deepEqual(r.raw.deductions, [{ for: "zero_km_leasing", pct: -10, applied: -10, rule: "largest_in_full" }]);
  });

  it("§5.2 zero-km car, second private user (users 2): paper [zero_km −10 full, owners:2 −4 halved] → −12; reality [owners:2 −4 full] → −4", () => {
    const r = historyRow(input({ car: { hand: 3, ownership_history: rows("leasing 2021-10, private 2021-10, private 2023-05") } }));
    assert.equal(r.raw.zero_km_deal, true);
    assert.equal(r.raw.users, 2);
    assert.equal(r.value, -12);
    assert.equal(r.value_by_reality, -4);
    assert.deepEqual(r.raw.deductions, [
      { for: "zero_km_leasing", pct: -10, applied: -10, rule: "largest_in_full" },
      { for: "owners:2", pct: -4, applied: -2, rule: "halved" },
    ]);
  });

  // Every history used by the tests in this directory that has no zero-km deal (fixtures.ts holds no
  // fixture list — only input() and rows(); the histories live in the tests).
  const NO_ZERO_KM: { name: string; over: NonNullable<Parameters<typeof input>[0]> }[] = [
    { name: "34562903: private pair, two dealers", over: { car: { hand: 2, ownership_history: rows("private 2023-01, private 2023-01, dealer 2025-06, dealer 2025-06") } } },
    { name: "50997203: leasing, four dealers", over: { car: { hand: 1, ownership_history: rows("leasing 2023-07, dealer 2026-08, dealer 2026-08, dealer 2026-08, dealer 2026-08") } } },
    { name: "source ad, hand_declared 2", over: { listing: { hand_declared: 2 } } },
    { name: "source ad, hand_declared 1", over: { listing: { hand_declared: 1 } } },
    { name: "six private users", over: { car: { ownership_history: rows("private 2019-01, private 2020-01, private 2021-01, private 2022-01, private 2023-01, private 2024-01") } } },
    { name: "leasing → private 13 months out", over: { car: { ownership_history: rows("leasing 2020-01, private 2021-02") } } },
    { name: "leasing → rental → private", over: { car: { ownership_history: rows("leasing 2020-01, rental 2020-02, private 2020-03") } } },
    { name: "rental first", over: { car: { ownership_history: rows("rental 2020-01, private 2020-02") } } },
    { name: "two private, two years apart", over: { car: { hand: 2, ownership_history: rows("private 2021-01, private 2023-01") } } },
    { name: "one private", over: { car: { ownership_history: rows("private 2023-01") } } },
    { name: "private → dealer → private", over: { car: { ownership_history: rows("private 2021-01, dealer 2026-06, private 2026-08") } } },
    { name: "three private in one month", over: { car: { ownership_history: rows("private 2023-01, private 2023-01, private 2023-01") } } },
    { name: "two pairs separated by a dealer", over: { car: { ownership_history: rows("private 2021-01, private 2021-02, dealer 2022-01, private 2022-02, private 2022-02") } } },
    { name: "private gap of 2 months", over: { car: { ownership_history: rows("private 2023-01, private 2023-03") } } },
  ];

  for (const f of NO_ZERO_KM) {
    it(`§5.3 no zero-km deal — ${f.name}: value_by_reality === value and condition_by_reality === condition_score`, () => {
      const r = historyRow(input(f.over));
      assert.equal(r.status, "scored");
      assert.equal(r.raw.zero_km_deal, false);
      assert.equal(typeof r.value, "number");
      assert.equal(r.value_by_reality, r.value);

      const s = scoreListing(input({ listing: { ...kmScored.listing, ...f.over.listing }, car: { ...kmScored.car, ...f.over.car }, market }), NOW);
      assert.notEqual(s.condition_score, null);
      assert.equal(s.condition_by_reality, s.condition_score);
    });
  }

  it("§5.4 history row unavailable: no value_by_reality; condition_by_reality is null", () => {
    for (const over of [{}, { listing: { hand_declared: 0 } }] as NonNullable<Parameters<typeof input>[0]>[]) {
      const r = historyRow(input(over));
      assert.equal(r.status, "unavailable");
      assert.equal("value" in r, false);
      assert.equal("value_by_reality" in r, false);

      const s = scoreListing(input({ listing: { ...kmScored.listing, ...over.listing }, car: kmScored.car, market }), NOW);
      assert.equal(s.condition_score, null);
      assert.equal(s.condition_by_reality, null);
    }
  });

  it("§5.5 zero-km car, km row unavailable: condition_score −10 (partial km), condition_by_reality 0 — not null", () => {
    const s = scoreListing(input({ car: { hand: 2, ownership_history: rows("leasing 2021-10, private 2021-10") }, market }), NOW);
    assert.equal(s.rows[2].status, "unavailable");
    assert.deepEqual(s.partial, ["km"]);
    assert.equal(s.condition_score, -10);
    assert.equal(s.condition_by_reality, 0);
  });

  it("§5.5 no history, km row unavailable: condition_by_reality is null exactly when condition_score is null", () => {
    const s = scoreListing(input({ market }), NOW);
    assert.equal(s.condition_score, null);
    assert.equal(s.condition_by_reality, null);
  });

  it("§5.6 74294402 (zero-km, users 1): paper −10, reality 0; with km +6: condition −4, condition_by_reality +6", () => {
    const r = historyRow(input({ car: { hand: 2, ownership_history: rows("leasing 2021-10, private 2021-10") } }));
    assert.equal(r.value, -10);
    assert.equal(r.value_by_reality, 0);
    const s = scoreListing(
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
    assert.equal(s.engine_version, 2);
    assert.equal(s.condition_score, -4);
    assert.equal(s.condition_by_reality, 6);
    // everything else in the invoice is the paper reading, unchanged
    assert.equal(s.condition_vs_typical, 8);
    assert.equal(s.deal_score, 18);
  });

  it("§5.6 79283502 (zero-km through a dealer, users 3): paper [zero_km −10 full, owners:3 −9 halved] → −14.5; reality [owners:3 −9 full] → −9", () => {
    const history = rows(
      "leasing 2022-01, dealer 2022-01, private 2022-01, dealer 2023-04, private 2023-05, dealer 2024-03, private 2024-05, dealer 2026-05",
    );
    const r = historyRow(input({ car: { hand: 4, ownership_history: history } }));
    assert.equal(r.value, -14.5);
    assert.equal(r.value_by_reality, -9);
  });
});
