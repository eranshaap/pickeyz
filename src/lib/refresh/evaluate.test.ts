// BRIEF §3.3 — the acceptance function, case by case. The letters are the brief's own (a) … (s).
// Three outcomes and no fourth: accept with an exact set of writes, reject with a reason, or a throw
// that stops the run.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveFromCache, evaluate, ownershipCrossCheck } from "./evaluate";
import {
  EMPTY_HISTORY, NOW, PLATE, cancelledRecord, history1, history2, history2Row,
  registryRecord, snapshot, storedCar,
} from "./fixtures";
import type { Snapshot } from "./raw";
import type { Accept, EvaluateResult, OwnershipRow, Reject, StoredCar } from "./types";

type OwnershipCode = OwnershipRow["type"];

function accepted(r: EvaluateResult): Accept {
  assert.equal(r.outcome, "accept", `expected accept, got ${r.outcome === "reject" ? `reject:${r.reason} (${r.detail})` : r.outcome}`);
  return r as Accept;
}
function rejected(r: EvaluateResult): Reject {
  assert.equal(r.outcome, "reject", "expected reject");
  return r as Reject;
}
/** The default case: the same car, the same previous snapshot, whatever fresh answer the test builds. */
function run(fresh: Snapshot, over: { stored?: Partial<StoredCar>; previous?: Snapshot } = {}): EvaluateResult {
  return evaluate(storedCar(over.stored), over.previous ?? snapshot(), fresh, NOW);
}

describe("evaluate — the identical answer (§3.3 a)", () => {
  it("accept, no flags, and no writes except the timestamp", () => {
    const a = accepted(run(snapshot()));
    assert.equal(a.status, "active");
    assert.deepEqual(a.flags, []);
    assert.deepEqual(a.writes.car, {});
    assert.equal(a.writes.reading, null);
    assert.equal(a.writes.registry_checked_at, NOW);
    assert.deepEqual(a.changes, []);
    assert.deepEqual(a.outside, []);
    assert.equal(a.history_grew, false);
  });

  it("an inactive answer with both history files empty is evaluated as usual, and says which registry answered", () => {
    // Day 18: no history-1 record -> color_changed is null on both sides
    const stored = { hand: null, ownership_history: null, km_at_last_test: null, first_registration: "2021-08-01", color_changed: null };
    const inactive: Snapshot = {
      registry: [],
      cancelled: [],
      inactive: [registryRecord()],
      ...EMPTY_HISTORY,
    };
    const a = accepted(run(inactive, { stored, previous: inactive }));
    assert.equal(a.status, "inactive");
    assert.deepEqual(a.flags, []);
    assert.deepEqual(a.writes.car, {});
  });
});

describe("evaluate — the test reading (§3.3 b, c, d, s)", () => {
  it("(b) a newer test date with km → the two cars fields and a reading row", () => {
    const fresh = snapshot({
      registry: [registryRecord({ mivchan_acharon_dt: "2026-09-10", tokef_dt: "2027-09-09" })],
      history_km: [history1({ kilometer_test_aharon: 92100 })],
    });
    const a = accepted(run(fresh));
    assert.equal(a.writes.car.mivchan_acharon_dt, "2026-09-10");
    assert.equal(a.writes.car.km_at_last_test, 92100);
    assert.equal(a.writes.car.test_expiry, "2027-09-09");
    assert.deepEqual(a.writes.reading, { test_date: "2026-09-10", km: 92100, observed_at: NOW });
    assert.deepEqual(a.flags, []);
    assert.deepEqual(
      a.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`),
      ["test_expiry: 2027-08-28 → 2027-09-09", "mivchan_acharon_dt: 2026-09-03 → 2026-09-10", "km_at_last_test: 90195 → 92100"],
    );
  });

  it("(c) the same test date with a different km → reject", () => {
    const fresh = snapshot({ history_km: [history1({ kilometer_test_aharon: 91000 })] });
    const r = rejected(run(fresh));
    assert.equal(r.reason, "km_same_date_differs");
    assert.match(r.detail, /90195 -> 91000/);
  });

  it("(c') §10.9 — the same test date, km arriving where we hold none → accept: a FILL, with a reading", () => {
    // Plate 56247702 in run 1's 250-car dry run: the ministry held a history-1 record whose
    // kilometer_test_aharon was JSON null on the test date of 2026-09-07, and gives 89,664 now.
    // `null` is not a value and cannot contradict anything, so this is the km arriving after its date.
    const fresh = snapshot({ history_km: [history1({ kilometer_test_aharon: 89664 })] });
    const a = accepted(run(fresh, { stored: { km_at_last_test: null } }));
    assert.equal(a.writes.car.km_at_last_test, 89664);
    assert.deepEqual(a.writes.reading, { test_date: "2026-09-03", km: 89664, observed_at: NOW });
    assert.deepEqual(a.writes.car.mivchan_acharon_dt, undefined); // the date did not move: not rewritten
    assert.deepEqual(a.flags, []);
    assert.deepEqual(a.changes.map((c) => c.field), ["km_at_last_test"]);
    assert.equal(a.notes.length, 1);
    assert.match(a.notes[0], /filled in on the unchanged test date 2026-09-03/);
  });

  it("(c'') §10.9 — a stored value replaced by a different one on the same date still rejects, both values shown", () => {
    // Plate 79422402: the same test date now carries 74,000 km where we hold 44,313. The detail keeps
    // both values so the direction is visible — up may be the km leading its date, down never is.
    const up = snapshot({ history_km: [history1({ kilometer_test_aharon: 95000 })] });
    const rUp = rejected(run(up));
    assert.equal(rUp.reason, "km_same_date_differs");
    assert.match(rUp.detail, /90195 -> 95000/);

    const down = snapshot({ history_km: [history1({ kilometer_test_aharon: 80000 })] });
    const rDown = rejected(run(down));
    assert.equal(rDown.reason, "km_same_date_differs");
    assert.match(rDown.detail, /90195 -> 80000/);
  });

  it("(c''') §10.9 leaves its two neighbours alone: a NEWER date with a null km still rejects", () => {
    const fresh = snapshot({
      registry: [registryRecord({ mivchan_acharon_dt: "2026-09-10" })],
      history_km: [history1({ kilometer_test_aharon: null })],
    });
    assert.equal(rejected(run(fresh, { stored: { km_at_last_test: null } })).reason, "km_null_over_value");
  });

  it("§10.9 does not invent a reading when there is no km either side", () => {
    const fresh = snapshot({ history_km: [history1({ kilometer_test_aharon: null })] });
    const a = accepted(run(fresh, { stored: { km_at_last_test: null } }));
    assert.equal(a.writes.reading, null);
    assert.deepEqual(a.writes.car, {});
  });

  it("(d) a newer test date with a LOWER km → accept, written, flagged km_decreased", () => {
    const fresh = snapshot({
      registry: [registryRecord({ mivchan_acharon_dt: "2026-09-10" })],
      history_km: [history1({ kilometer_test_aharon: 88000 })],
    });
    const a = accepted(run(fresh));
    assert.deepEqual(a.flags, ["km_decreased"]);
    assert.equal(a.writes.car.km_at_last_test, 88000);
    assert.deepEqual(a.writes.reading, { test_date: "2026-09-10", km: 88000, observed_at: NOW });
  });

  it("(s) a test date EARLIER than the stored one → reject", () => {
    const fresh = snapshot({ registry: [registryRecord({ mivchan_acharon_dt: "2026-08-01" })] });
    const r = rejected(run(fresh));
    assert.equal(r.reason, "test_date_earlier");
  });

  it("a newer test date with no km at all → reject, nothing written", () => {
    const fresh = snapshot({
      registry: [registryRecord({ mivchan_acharon_dt: "2026-09-10" })],
      history_km: [history1({ kilometer_test_aharon: null })],
    });
    const r = rejected(run(fresh));
    assert.equal(r.reason, "km_null_over_value");
  });

  it("a km of 0 is a value, not a missing one (plate 43202703 is such a car)", () => {
    const fresh = snapshot({
      registry: [registryRecord({ mivchan_acharon_dt: "2026-09-10" })],
      history_km: [history1({ kilometer_test_aharon: 0 })],
    });
    const a = accepted(run(fresh));
    assert.equal(a.writes.car.km_at_last_test, 0);
    assert.deepEqual(a.flags, ["km_decreased"]);
  });
});

describe("evaluate — the ownership history (§3.3 e, f, g)", () => {
  it("(e) the history grew by one row → accept, written, hand recomputed", () => {
    // The sold signal as it actually arrives: a dealer row appears in history 2 and the registry's own
    // baalut has caught up to it, so there is nothing for the §0.7 cross-check to complain about.
    const fresh = snapshot({
      registry: [registryRecord({ baalut: "סוחר" })],
      history_hand: [...history2(), history2Row(202609, "סוחר", 3922705)],
    });
    const a = accepted(run(fresh));
    assert.equal(a.history_grew, true);
    assert.deepEqual(a.writes.car.ownership_history, [
      { ym: "2021-08", type: "private" },
      { ym: "2023-05", type: "private" },
      { ym: "2026-09", type: "dealer" },
    ]);
    assert.equal(a.writes.car.hand, 2); // the new row is a dealer: it does not count as a hand
    assert.deepEqual(a.flags, []);
  });

  it("(e') a grown history whose new row is a private owner moves hand too", () => {
    const fresh = snapshot({ history_hand: [...history2(), history2Row(202609, "פרטי", 3922705)] });
    const a = accepted(run(fresh));
    assert.equal(a.writes.car.hand, 3);
    assert.deepEqual(a.changes.map((c) => c.field), ["ownership_history", "hand"]);
  });

  it("(e'') a dealer row the registry has not caught up with → accept, written, flagged", () => {
    const fresh = snapshot({ history_hand: [...history2(), history2Row(202609, "סוחר", 3922705)] });
    const a = accepted(run(fresh));
    assert.equal(a.history_grew, true);
    assert.deepEqual(a.flags, ["baalut_mismatch"]);
  });

  it("(f) the history shrank → reject", () => {
    const fresh = snapshot({ history_hand: [history2Row(202108, "פרטי", 3922703)] });
    assert.equal(rejected(run(fresh)).reason, "history_shrunk");
  });

  it("(f') a row inside the stored prefix changed → reject", () => {
    const fresh = snapshot({ history_hand: [history2Row(202108, "החכר", 3922703), history2Row(202305, "פרטי", 3922704)] });
    const r = rejected(run(fresh));
    assert.equal(r.reason, "history_changed");
    assert.match(r.detail, /2021-08: the stored private row is not in the fresh answer for that month/);
  });

  it("(f'') the rows are gone → reject", () => {
    const fresh = snapshot({ history_hand: [] });
    assert.equal(rejected(run(fresh)).reason, "history_vanished");
  });

  it("(g) no rows before, rows now → accept, written, flagged history_appeared", () => {
    const a = accepted(run(snapshot(), { stored: { ownership_history: null, hand: null } }));
    assert.deepEqual(a.flags, ["history_appeared"]);
    assert.equal(a.writes.car.hand, 2);
    assert.deepEqual(a.writes.car.ownership_history, [
      { ym: "2021-08", type: "private" },
      { ym: "2023-05", type: "private" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// §10.10 — the prefix comparison is order-insensitive within one `ym`.
//
// The order of two rows inside one month was never information from the ministry: `history_hand`
// carries only `_id`, `mispar_rechev`, `baalut_dt` and `baalut`, so `_id` is the only tie-break there
// is, and the ministry re-orders it. Run 1's 250-car dry run caught it doing exactly that on five
// cars — half of every reject in the run — always the same way round, the private row moving ahead of
// the dealer rows. Those five are the fixtures here.
// ---------------------------------------------------------------------------
describe("evaluate — the ownership history, re-ordered inside one month (§10.10)", () => {
  const HEB: Record<string, string> = { private: "פרטי", dealer: "סוחר", leasing: "החכר" };
  type Row = [string, OwnershipCode];

  /** The rows as the ministry's answer, `_id` ascending in the order given (that is `interpret`'s sort). */
  const answer = (rows: Row[]) => rows.map(([ym, type], i) => history2Row(Number(ym.replace("-", "")), HEB[type], 3900000 + i));
  const stored = (rows: Row[]) => rows.map(([ym, type]) => ({ ym, type }));

  /**
   * One real car: the stored rows, the fresh rows, and everything else held still — the first
   * registration is put in the first row's month so the `hand` truncation rule does not fire, and the
   * registry's `baalut` is the fresh last row's type so §0.7's cross-check has nothing to say.
   */
  function reorder(storedRows: Row[], freshRows: Row[], storedHand: number) {
    const firstYm = storedRows[0][0];
    const reg = (rows: Row[]) => registryRecord({ moed_aliya_lakvish: firstYm, baalut: HEB[rows[rows.length - 1][1]] });
    const h1 = history1({ rishum_rishon_dt: `${firstYm}-15` });
    const previous = snapshot({ registry: [reg(storedRows)], history_km: [h1], history_hand: answer(storedRows) });
    const fresh = snapshot({ registry: [reg(freshRows)], history_km: [h1], history_hand: answer(freshRows) });
    const car = storedCar({
      ownership_history: stored(storedRows),
      hand: storedHand,
      first_registration: `${firstYm}-15`,
      current_owner_type: freshRows[freshRows.length - 1][1], // Day 18: the registry value we already hold — nothing else moves
    });
    return evaluate(car, previous, fresh, NOW);
  }

  /** §10.17: a pure re-ordering is a non-event — accept, nothing written, no flag, the stored order stays. */
  function assertNonEvent(r: EvaluateResult) {
    const a = accepted(r);
    assert.equal(a.history_grew, false);
    assert.deepEqual(a.flags, []);
    assert.deepEqual(a.writes.car, {}, "a re-ordering writes no cars field at all");
    assert.equal(a.writes.reading, null);
    assert.deepEqual(a.changes, []);
    // §11.1: these are exactly the cars whose last month holds more than one row, so the ownership
    // cross-check is undecidable and says so. A note is not a flag and writes nothing.
    for (const n of a.notes) {
      assert.ok(n.startsWith("baalut_undecidable"), `unexpected note on a re-ordering: ${n}`);
    }
    return a;
  }

  it("28211803 — 2024-11 dealer/private swapped → accept, and nothing moves (§10.17)", () => {
    assertNonEvent(reorder(
      [["2022-11", "private"], ["2024-11", "dealer"], ["2024-11", "private"]],
      [["2022-11", "private"], ["2024-11", "private"], ["2024-11", "dealer"]],
      2,
    ));
  });

  it("35903902 — 2023-10 dealer/private swapped → the same non-event", () => {
    assertNonEvent(reorder(
      [["2020-11", "private"], ["2023-10", "dealer"], ["2023-10", "private"]],
      [["2020-11", "private"], ["2023-10", "private"], ["2023-10", "dealer"]],
      2,
    ));
  });

  it("76903702 — 2024-03 dealer/private swapped, an untouched 2024-02 before them → a non-event", () => {
    assertNonEvent(reorder(
      [["2022-03", "private"], ["2024-02", "dealer"], ["2024-03", "private"], ["2024-03", "dealer"]],
      [["2022-03", "private"], ["2024-02", "dealer"], ["2024-03", "dealer"], ["2024-03", "private"]],
      2,
    ));
  });

  it("84759901 — three rows in 2024-06, the private one moved to the front → a non-event", () => {
    assertNonEvent(reorder(
      [["2020-03", "leasing"], ["2024-06", "dealer"], ["2024-06", "dealer"], ["2024-06", "private"]],
      [["2020-03", "leasing"], ["2024-06", "private"], ["2024-06", "dealer"], ["2024-06", "dealer"]],
      2,
    ));
  });

  it("56394902 — the reject that swallowed a real sale: accept, history_grew, hand 2 → 3, the fresh array written", () => {
    const a = accepted(reorder(
      [["2021-07", "leasing"], ["2025-03", "dealer"], ["2025-03", "private"]],
      [["2021-07", "leasing"], ["2025-03", "private"], ["2025-03", "dealer"], ["2026-09", "private"]],
      2,
    ));
    assert.equal(a.history_grew, true);
    assert.deepEqual(a.flags, []);
    assert.equal(a.writes.car.hand, 3);
    assert.deepEqual(a.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`), [
      "ownership_history: 2021-07:leasing → 2025-03:dealer → 2025-03:private → 2021-07:leasing → 2025-03:private → 2025-03:dealer → 2026-09:private",
      "hand: 2 → 3",
    ]);
  });

  it("a growth that does NOT re-order the last stored row raises no flag", () => {
    const a = accepted(reorder(
      [["2021-07", "leasing"], ["2025-03", "dealer"]],
      [["2021-07", "leasing"], ["2025-03", "dealer"], ["2026-09", "private"]],
      1,
    ));
    assert.equal(a.history_grew, true);
    assert.deepEqual(a.flags, []);
    assert.equal(a.writes.car.hand, 2);
  });

  it("the equality is a MULTISET, not a set: a month that lost one of two identical rows still rejects", () => {
    const r = rejected(reorder(
      [["2020-03", "leasing"], ["2024-06", "dealer"], ["2024-06", "dealer"]],
      [["2020-03", "leasing"], ["2024-06", "dealer"], ["2024-06", "private"]],
      1,
    ));
    assert.equal(r.reason, "history_changed");
    assert.match(r.detail, /2024-06: the stored dealer row is not in the fresh answer for that month/);
  });

  it("a month BEFORE one we already hold gaining a row is history rewritten behind our back → reject", () => {
    const r = rejected(reorder(
      [["2022-11", "private"], ["2024-11", "dealer"]],
      [["2022-11", "private"], ["2022-11", "dealer"], ["2024-11", "dealer"]],
      1,
    ));
    assert.equal(r.reason, "history_changed");
    assert.match(r.detail, /2022-11 gained a row behind a later month we already hold/);
  });

  it("the last stored month MAY gain a row — that is a sale inside the month we already hold", () => {
    const a = accepted(reorder(
      [["2022-11", "private"], ["2024-11", "dealer"]],
      [["2022-11", "private"], ["2024-11", "dealer"], ["2024-11", "private"]],
      1,
    ));
    assert.equal(a.history_grew, true);
    assert.deepEqual(a.flags, []); // row 2 is still the dealer row it was
    assert.equal(a.writes.car.hand, 2);
  });

  it("a month replaced by another month still rejects", () => {
    const r = rejected(reorder(
      [["2022-11", "private"], ["2024-11", "dealer"]],
      [["2022-11", "private"], ["2024-12", "dealer"]],
      1,
    ));
    assert.equal(r.reason, "history_changed");
    assert.match(r.detail, /month 2 2024-11 -> 2024-12/);
  });
});

describe("evaluate — identity (§3.3 h, i)", () => {
  it("(h) the degem codes differ → reject", () => {
    const fresh = snapshot({ registry: [registryRecord({ degem_cd: 246 })] });
    const r = rejected(run(fresh));
    assert.equal(r.reason, "identity_model");
    assert.match(r.detail, /481-247 -> 481-246/);
  });

  it("(h) sug_degem differs → reject, the same reason", () => {
    const fresh = snapshot({ registry: [registryRecord({ sug_degem: "M" })] });
    assert.equal(rejected(run(fresh)).reason, "identity_model");
  });

  it("(h) the chassis differs → reject", () => {
    const fresh = snapshot({ registry: [registryRecord({ misgeret: "KMHC851CGNU999999" })] });
    const r = rejected(run(fresh));
    assert.equal(r.reason, "identity_chassis");
    assert.match(r.detail, /KMHC851CGNU265177 -> KMHC851CGNU999999/);
  });

  it("(h) the year differs → reject", () => {
    const fresh = snapshot({ registry: [registryRecord({ shnat_yitzur: 2022 })] });
    assert.equal(rejected(run(fresh)).reason, "identity_year");
  });

  it("the road-entry month differs → reject", () => {
    const fresh = snapshot({ registry: [registryRecord({ moed_aliya_lakvish: "2021-9" })] });
    assert.equal(rejected(run(fresh)).reason, "identity_first_registration");
  });

  it("(i) a previous snapshot with no history 1, the same year-month, the full date now → accept and written", () => {
    // The two inactive cars are exactly this: first_registration came from the registry month, day 01.
    const previous: Snapshot = { registry: [registryRecord()], ...EMPTY_HISTORY };
    const a = accepted(run(snapshot(), {
      stored: { first_registration: "2021-08-01", km_at_last_test: null, mivchan_acharon_dt: null, test_expiry: null },
      previous,
    }));
    assert.equal(a.writes.car.first_registration, "2021-08-29");
    assert.ok(a.notes.some((n) => /registry month with day 01/.test(n)));
  });

  it("(i') the same move when the previous snapshot DID carry a history-1 record → reject", () => {
    const previous = snapshot({ history_km: [history1({ rishum_rishon_dt: "2021-08-02" })] });
    const r = rejected(run(snapshot(), { stored: { first_registration: "2021-08-02" }, previous }));
    assert.equal(r.reason, "identity_first_registration");
    assert.match(r.detail, /2021-08-02 -> 2021-08-29/);
  });

  it("(i'') a previous snapshot with no history 1 but a DIFFERENT month → reject", () => {
    const previous: Snapshot = { registry: [registryRecord()], ...EMPTY_HISTORY };
    const r = rejected(run(snapshot(), { stored: { first_registration: "2021-07-01" }, previous }));
    assert.equal(r.reason, "identity_first_registration");
  });

  it("history 1 disappearing takes first_registration back to the month → reject", () => {
    const fresh = snapshot({ history_km: [] });
    const r = rejected(run(fresh));
    assert.equal(r.reason, "identity_first_registration");
    assert.match(r.detail, /2021-08-29 -> 2021-08-01/);
  });
});

describe("evaluate — a cancelled answer (§3.3 j)", () => {
  const cancelled = (rec = cancelledRecord()): Snapshot => ({
    registry: [], cancelled: [rec], history_km: [history1()], history_hand: history2(),
  });

  it("(j) matching identity → accept as a status: cancelled_at, the timestamp, no moving fields", () => {
    const a = accepted(run(cancelled()));
    assert.equal(a.status, "cancelled");
    assert.deepEqual(a.writes.car, { cancelled_at: "2026-09-10" });
    assert.equal(a.writes.reading, null);
    assert.equal(a.writes.registry_checked_at, NOW);
    assert.deepEqual(a.flags, []);
    assert.equal(a.colour, null); // §0.4: a cancellation record never fills cars.color
    assert.ok(a.notes.some((n) => /manual-pass item/.test(n)));
  });

  it("(j') a different model on the cancellation record → reject, a reassigned plate", () => {
    const r = rejected(run(cancelled(cancelledRecord({ degem_cd: 246 }))));
    assert.equal(r.reason, "identity_model");
    assert.match(r.detail, /reassigned plate/);
  });

  it("(j'') a different year on the cancellation record → reject", () => {
    assert.equal(rejected(run(cancelled(cancelledRecord({ shnat_yitzur: 2019 })))).reason, "identity_year");
  });

  it("(j''') a different chassis on the cancellation record → reject", () => {
    assert.equal(rejected(run(cancelled(cancelledRecord({ misgeret: "OTHER" })))).reason, "identity_chassis");
  });

  it("a cancellation date already stored, and a different one now → flag, never overwritten", () => {
    const a = accepted(run(cancelled(), { stored: { cancelled_at: "2026-09-01" } }));
    assert.deepEqual(a.flags, ["cancelled_date_changed"]);
    assert.deepEqual(a.writes.car, {});
  });

  it("the same cancellation date again → accept, nothing to write", () => {
    const a = accepted(run(cancelled(), { stored: { cancelled_at: "2026-09-10" } }));
    assert.deepEqual(a.flags, []);
    assert.deepEqual(a.writes.car, {});
  });
});

describe("evaluate — not found (§3.3 k)", () => {
  it("(k) the plate is in none of the registries → reject", () => {
    const r = rejected(run({ registry: [], cancelled: [], inactive: [], history_km: [], history_hand: [] }));
    assert.equal(r.reason, "not_found");
  });
});

describe("evaluate — null over a stored value (§3.3 l)", () => {
  it("(l) test_expiry → reject", () => {
    const fresh = snapshot({ registry: [registryRecord({ tokef_dt: "" })] });
    const r = rejected(run(fresh));
    assert.equal(r.reason, "null_over_value");
    assert.match(r.detail, /test_expiry/);
  });

  it("(l') mivchan_acharon_dt → reject", () => {
    const fresh = snapshot({ registry: [registryRecord({ mivchan_acharon_dt: "" })] });
    const r = rejected(run(fresh));
    assert.equal(r.reason, "null_over_value");
    assert.match(r.detail, /mivchan_acharon_dt/);
  });

  it("(l'') km_at_last_test on an unchanged test date → reject", () => {
    const fresh = snapshot({ history_km: [history1({ kilometer_test_aharon: null })] });
    assert.equal(rejected(run(fresh)).reason, "km_null_over_value");
  });

  it("(l''') the ownership rows → reject", () => {
    assert.equal(rejected(run(snapshot({ history_hand: [] }))).reason, "history_vanished");
  });
});

describe("evaluate — the cross-checks (§3.3 m, n)", () => {
  it("(m) registry baalut ≠ the last history-2 row → accept + baalut_mismatch", () => {
    const fresh = snapshot({ registry: [registryRecord({ baalut: "סוחר" })] });
    const a = accepted(run(fresh));
    assert.deepEqual(a.flags, ["baalut_mismatch"]);
    // Day 18 (§7): the registry's holder is a database field now, so the new value is written; the flag is unchanged
    assert.deepEqual(a.writes.car, { current_owner_type: "dealer" });
    assert.ok(a.notes.some((n) => /the two files lag each other/.test(n)));
  });

  // §11.1 — the cross-check runs only where the file decides something. The order of two rows inside
  // one month is not information, so "the last row" is only a fact when the last month holds one row.
  const HEB2: Record<string, string> = { private: "פרטי", dealer: "סוחר", leasing: "החכר" };
  const HEB_REG: Record<string, string> = { private: "פרטי", dealer: "סוחר", leasing: "ליסינג" };
  type Row2 = [string, OwnershipCode];

  /** A car whose record is exactly these rows, and a registry saying `baalut`. Nothing else moves. */
  function crossCheck(rowsIn: Row2[], baalut: OwnershipCode) {
    const firstYm = rowsIn[0][0];
    const fresh = snapshot({
      registry: [registryRecord({ baalut: HEB_REG[baalut], moed_aliya_lakvish: firstYm })],
      history_km: [history1({ rishum_rishon_dt: `${firstYm}-15` })],
      history_hand: rowsIn.map(([ym, t], i) => history2Row(Number(ym.replace("-", "")), HEB2[t], 3910000 + i)),
    });
    const car = storedCar({
      ownership_history: rowsIn.map(([ym, type]) => ({ ym, type })),
      hand: rowsIn.filter(([, t]) => t !== "dealer").length,
      first_registration: `${firstYm}-15`,
    });
    return accepted(evaluate(car, fresh, fresh, NOW));
  }

  const undecidable = (a: Accept) => a.notes.filter((n) => n.startsWith("baalut_undecidable"));

  it("(m') the last month holds {dealer, private} and the registry says private → a note, no flag", () => {
    const a = crossCheck([["2022-11", "private"], ["2024-11", "dealer"], ["2024-11", "private"]], "private");
    assert.deepEqual(a.flags, []);
    assert.equal(undecidable(a).length, 1);
    assert.match(undecidable(a)[0], /last month 2024-11 holds 2 rows; the registry's private is among them/);
  });

  it("(m'') the last month holds {dealer, private} and the registry says leasing → a flag, no note", () => {
    const a = crossCheck([["2022-11", "private"], ["2024-11", "dealer"], ["2024-11", "private"]], "leasing");
    assert.deepEqual(a.flags, ["baalut_mismatch"]);
    assert.equal(undecidable(a).length, 0);
    assert.ok(a.notes.some((n) => /holds 2 rows, none of them leasing/.test(n)));
  });

  it("(m''') the three real shapes of Q17 → a note and no flag on each", () => {
    // The arrays as `cars` holds them; the result is the same before and after 11.2's revert, because
    // the rule reads the last month's multiset and never its order.
    const shapes: { plate: string; rows: Row2[] }[] = [
      { plate: "28211803", rows: [["2022-11", "private"], ["2024-11", "dealer"], ["2024-11", "private"]] },
      { plate: "35903902", rows: [["2020-11", "private"], ["2023-10", "dealer"], ["2023-10", "private"]] },
      { plate: "84759901", rows: [["2020-03", "leasing"], ["2024-06", "dealer"], ["2024-06", "dealer"], ["2024-06", "private"]] },
    ];
    for (const { plate, rows: shape } of shapes) {
      const a = crossCheck(shape, "private");
      assert.deepEqual(a.flags, [], `${plate} should not be flagged`);
      assert.equal(undecidable(a).length, 1, `${plate} should carry the undecidable note`);
      // …and the reversed month gives the identical answer.
      const swapped = [...shape];
      swapped.reverse();
      const b = crossCheck(swapped.sort((x, y) => x[0].localeCompare(y[0])), "private");
      assert.deepEqual(b.flags, []);
    }
  });

  it("a single-row last month still decides, in both directions", () => {
    assert.deepEqual(crossCheck([["2021-08", "leasing"], ["2023-05", "private"]], "private").flags, []);
    assert.deepEqual(crossCheck([["2021-08", "leasing"], ["2023-05", "private"]], "dealer").flags, ["baalut_mismatch"]);
  });

  it("ownershipCrossCheck is the gate's own rule, and says which case it took", () => {
    assert.deepEqual(ownershipCrossCheck(null, "private"), { kind: "no_rows" });
    assert.deepEqual(ownershipCrossCheck([], "private"), { kind: "no_rows" });
    assert.deepEqual(ownershipCrossCheck([{ ym: "2024-11", type: "private" }], "private"), { kind: "match", month: "2024-11", rows: 1 });
    assert.deepEqual(
      ownershipCrossCheck([{ ym: "2024-11", type: "dealer" }, { ym: "2024-11", type: "private" }], "leasing"),
      { kind: "mismatch", month: "2024-11", rows: 2, registry: "leasing", last: null },
    );
    assert.deepEqual(
      ownershipCrossCheck([{ ym: "2024-11", type: "dealer" }, { ym: "2024-11", type: "private" }], "private"),
      { kind: "undecidable", month: "2024-11", rows: 2, registry: "private" },
    );
  });

  it("the registry's 'ליסינג' and history 2's 'החכר' are one code, so they never look like a mismatch", () => {
    const fresh = snapshot({
      registry: [registryRecord({ baalut: "ליסינג" })],
      history_hand: [history2Row(202108, "פרטי", 1), history2Row(202305, "החכר", 2)],
    });
    const r = rejected(run(fresh)); // the stored row 2 was private, so this is history_changed, not a mismatch
    assert.equal(r.reason, "history_changed");
    const a = accepted(run(fresh, { stored: { ownership_history: [{ ym: "2021-08", type: "private" }, { ym: "2023-05", type: "leasing" }], hand: 2 } }));
    assert.deepEqual(a.flags, []);
  });

  it("(n) history 1 carrying a test date of its own that differs from the registry's → reject", () => {
    // The resource carries no such field today (REPORT.md §1.4). The rule is in place for the day it does.
    const fresh = snapshot({ history_km: [history1({ mivchan_acharon_dt: "2026-08-20" })] });
    const r = rejected(run(fresh));
    assert.equal(r.reason, "pairing_broken");
    assert.match(r.detail, /2026-08-20/);
  });

  it("(n') the same field agreeing with the registry → accept", () => {
    const fresh = snapshot({ history_km: [history1({ mivchan_acharon_dt: "2026-09-03" })] });
    const a = accepted(run(fresh));
    assert.deepEqual(a.flags, []);
    // it is not a field the brief names, so its arrival is reported outside the database
    assert.ok(a.outside.some((c) => c.field === "history_km.mivchan_acharon_dt"));
  });
});

describe("evaluate — colour (§3.3 o)", () => {
  it("(o) an empty stored colour and a ministry colour → written", () => {
    const a = accepted(run(snapshot(), { stored: { color: null } }));
    assert.equal(a.writes.car.color, "שחור מטלי");
    assert.deepEqual(a.colour, { stored: null, ministry: "שחור מטלי", written: true });
    assert.deepEqual(a.changes.map((c) => c.field), ["color"]);
  });

  it("(o') a stored colour and a different ministry colour → not written, listed", () => {
    const a = accepted(run(snapshot()));
    assert.deepEqual(a.writes.car, {});
    assert.deepEqual(a.colour, { stored: "שחור", ministry: "שחור מטלי", written: false });
  });
});

describe("evaluate — fields outside the database (§3.3 p)", () => {
  it("(p) an unnamed field changed → accept, and it is listed", () => {
    const fresh = snapshot({ registry: [registryRecord({ kvutzat_zihum: 4, zmig_kidmi: "215/50R17" })] });
    const a = accepted(run(fresh));
    assert.deepEqual(a.writes.car, {});
    assert.deepEqual(a.flags, []);
    assert.deepEqual(
      a.outside.map((c) => `${c.field}: ${c.from} → ${c.to}`),
      ["registry.kvutzat_zihum: 3 → 4", "registry.zmig_kidmi: 225/45R17 → 215/50R17"],
    );
  });

  it("Day 18 (§7): baalut reaches the database — a change to it is written as current_owner_type, not listed outside", () => {
    const fresh = snapshot({
      registry: [registryRecord({ baalut: "חברה" })],
      history_hand: [history2Row(202108, "פרטי", 1), history2Row(202305, "חברה", 2)],
    });
    const a = accepted(run(fresh, { stored: { ownership_history: [{ ym: "2021-08", type: "private" }, { ym: "2023-05", type: "company" }] } }));
    assert.deepEqual(a.writes.car, { current_owner_type: "company" });
    assert.deepEqual(a.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`), ["current_owner_type: private → company"]);
    assert.deepEqual(a.outside, []);
  });

  it("_id is an API artifact: a change to it is invisible", () => {
    const fresh = snapshot({
      registry: [registryRecord({ _id: 999999 })],
      history_km: [history1({ _id: 888888 })],
    });
    const a = accepted(run(fresh));
    assert.deepEqual(a.outside, []);
  });

  it("three of the four change indicators are information only; shnui_zeva_ind reaches the database (Day 18)", () => {
    const other = accepted(run(snapshot({ history_km: [history1({ shinui_mivne_ind: 1, gapam_ind: 1, shinui_zmig_ind: 1 })] })));
    assert.deepEqual(other.writes.car, {});
    assert.deepEqual(other.outside.map((c) => c.field), ["history_km.gapam_ind", "history_km.shinui_mivne_ind", "history_km.shinui_zmig_ind"]);
    const colour = accepted(run(snapshot({ history_km: [history1({ shnui_zeva_ind: 1 })] })));
    assert.deepEqual(colour.writes.car, { color_changed: true });
    assert.deepEqual(colour.outside, []);
  });
});

describe("evaluate — the expiry (§3.3 q)", () => {
  it("(q) the expiry moved backwards → accept, written, flagged", () => {
    const fresh = snapshot({ registry: [registryRecord({ tokef_dt: "2027-07-01" })] });
    const a = accepted(run(fresh));
    assert.deepEqual(a.flags, ["expiry_backward"]);
    assert.equal(a.writes.car.test_expiry, "2027-07-01");
  });

  it("the expiry moving forward on its own → accept, written, no flag", () => {
    const fresh = snapshot({ registry: [registryRecord({ tokef_dt: "2028-08-28" })] });
    const a = accepted(run(fresh));
    assert.deepEqual(a.flags, []);
    assert.equal(a.writes.car.test_expiry, "2028-08-28");
  });
});

describe("evaluate — structural failures stop the run (§3.3 r, §0.3)", () => {
  it("(r) an owner-type value the mapping does not know → throws", () => {
    const fresh = snapshot({ history_hand: [history2Row(202108, "פרטי", 1), history2Row(202305, "שותפות", 2)] });
    assert.throws(() => run(fresh), /ownership: unknown ministry value/);
  });

  it("an unknown owner-type on the registry record itself → throws", () => {
    const fresh = snapshot({ registry: [registryRecord({ baalut: "קיבוץ" })] });
    assert.throws(() => run(fresh), /ownership: unknown ministry value/);
  });

  it("the plate returned is not the plate asked for → throws", () => {
    const fresh = snapshot({ registry: [registryRecord({ mispar_rechev: 11111111 })] });
    assert.throws(() => run(fresh), /the plate returned is 11111111, not the plate asked for/);
  });

  it("a field the gate reads is gone → throws, with the field named", () => {
    const rec = registryRecord();
    delete rec.misgeret;
    assert.throws(() => run(snapshot({ registry: [rec] })), /missing: \[misgeret\]/);
  });

  it("a date the ministry gives in a shape we do not know → throws", () => {
    const fresh = snapshot({ registry: [registryRecord({ tokef_dt: "27/08/2028" })] });
    assert.throws(() => run(fresh), /not a date the ministry writes/);
  });

  it("an origin value the mapping does not know → throws", () => {
    const fresh = snapshot({ history_km: [history1({ mkoriut_nm: "יבוא מקביל" })] });
    assert.throws(() => run(fresh), /origin: unknown ministry value/);
  });

  it("a registry record resolved with a history file never asked for → throws", () => {
    assert.throws(
      () => run({ registry: [registryRecord()], history_km: [history1()] }),
      /a history file was not asked for/,
    );
  });
});

describe("evaluate — the three registry fields (Day 18, §7)", () => {
  it("the identical answer with the three stored → nothing written", () => {
    assert.deepEqual(accepted(run(snapshot())).writes.car, {});
  });

  it("nothing stored yet → all three filled, one change line each", () => {
    const a = accepted(run(snapshot(), { stored: { current_owner_type: null, registry_color: null, color_changed: null } }));
    assert.deepEqual(a.writes.car, { current_owner_type: "private", registry_color: "שחור מטלי", color_changed: false });
    assert.deepEqual(
      a.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`),
      ["current_owner_type: null → private", "registry_color: null → שחור מטלי", "color_changed: null → false"],
    );
    assert.deepEqual(a.flags, []);
  });

  it("a changed registry colour is written to registry_color — and cars.color (the ad's word) is still never overwritten", () => {
    const a = accepted(run(snapshot({ registry: [registryRecord({ tzeva_rechev: "כסף" })] })));
    assert.deepEqual(a.writes.car, { registry_color: "כסף" });
    assert.deepEqual(a.colour, { stored: "שחור", ministry: "כסף", written: false });
  });

  it("the ministry gives nothing where we hold a value → reject null_over_value, nothing written", () => {
    const noColour = rejected(run(snapshot({ registry: [registryRecord({ tzeva_rechev: "" })] })));
    assert.equal(noColour.reason, "null_over_value");
    assert.match(noColour.detail, /registry_color שחור מטלי -> null/);
    const noHistory1 = rejected(run(snapshot({ history_km: [] }), { stored: { first_registration: "2021-08-01", km_at_last_test: null } }));
    assert.equal(noHistory1.reason, "null_over_value");
    assert.match(noHistory1.detail, /color_changed false -> null/);
  });

  it("a shnui_zeva_ind that is not 0 or 1 → throws", () => {
    assert.throws(() => run(snapshot({ history_km: [history1({ shnui_zeva_ind: 2 })] })), /shnui_zeva_ind is 2/);
  });

  it("a history-1 record without shnui_zeva_ind → throws, with the field named", () => {
    const h1 = history1();
    delete h1.shnui_zeva_ind;
    assert.throws(() => run(snapshot({ history_km: [h1] })), /missing: \[shnui_zeva_ind\]/);
  });

  it("an unknown baalut word on the registry is still a structural failure", () => {
    assert.throws(() => run(snapshot({ registry: [registryRecord({ baalut: "שותפות" })] })), /ownership: unknown ministry value/);
  });
});

describe("deriveFromCache — the --from-cache reading (Day 18, §7)", () => {
  const car = (over: Partial<StoredCar> = {}) => storedCar(over);

  it("everything already stored → unchanged on all three", () => {
    const d = deriveFromCache(car(), snapshot());
    assert.equal(d.status, "active");
    assert.deepEqual(Object.values(d.columns).map((c) => c.outcome), ["unchanged", "unchanged", "unchanged"]);
  });

  it("nothing stored → fill on all three, with the values", () => {
    const d = deriveFromCache(car({ current_owner_type: null, registry_color: null, color_changed: null }), snapshot());
    assert.deepEqual(d.columns, {
      current_owner_type: { outcome: "fill", from: null, to: "private" },
      registry_color: { outcome: "fill", from: null, to: "שחור מטלי" },
      color_changed: { outcome: "fill", from: null, to: false },
    });
  });

  it("a stored value the cache contradicts → change, old → new", () => {
    const d = deriveFromCache(car({ current_owner_type: "dealer", registry_color: "כסף" }), snapshot({ history_km: [history1({ shnui_zeva_ind: 1 })] }));
    assert.deepEqual(d.columns.current_owner_type, { outcome: "change", from: "dealer", to: "private" });
    assert.deepEqual(d.columns.registry_color, { outcome: "change", from: "כסף", to: "שחור מטלי" });
    assert.deepEqual(d.columns.color_changed, { outcome: "change", from: false, to: true });
  });

  it("an inactive car reads from the inactive record; no history-1 record → color_changed null", () => {
    const inactive: Snapshot = { registry: [], cancelled: [], inactive: [registryRecord({ baalut: "חברה", tzeva_rechev: "כחול" })], ...EMPTY_HISTORY };
    const d = deriveFromCache(car({ current_owner_type: null, registry_color: null, color_changed: null }), inactive);
    assert.equal(d.status, "inactive");
    assert.deepEqual(d.values, { current_owner_type: "company", registry_color: "כחול", color_changed: null });
    assert.equal(d.columns.color_changed.outcome, "unchanged");
  });

  it("a cancellation-only snapshot, an unknown word, or a missing field → throws", () => {
    assert.throws(() => deriveFromCache(car(), { registry: [], cancelled: [cancelledRecord()] }), /cancellation record/);
    assert.throws(() => deriveFromCache(car(), snapshot({ registry: [registryRecord({ baalut: "קיבוץ" })] })), /ownership: unknown ministry value/);
    const rec = registryRecord();
    delete rec.baalut;
    assert.throws(() => deriveFromCache(car(), snapshot({ registry: [rec] })), /missing: \[baalut\]/);
  });
});

describe("evaluate — the plate is the car's own", () => {
  it("the fixtures are the one plate throughout", () => {
    assert.equal(storedCar().license_plate, PLATE);
    assert.equal(registryRecord().mispar_rechev, Number(PLATE));
  });
});
