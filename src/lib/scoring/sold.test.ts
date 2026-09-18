// BRIEF §14 (amended §18.3, §18.7, §18.8): sold signal — rule 1 fires only when the newest row's ym ≥
// the first-seen month; rule 3 only for a private after the LAST dealer row; a dealer after a dealer
// never fires. A fired signal skips both checks; otherwise the checks run on the full record.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { soldSignal } from "./sold";
import { handCheck, kmCheck } from "./checks";
import { input, rows } from "./fixtures";
import type { SoldSignal } from "./types";

const firstSeen = new Date("2026-06-15T00:00:00.000Z"); // first-seen month 2026-06
const NO_SIGNAL: SoldSignal = { strength: null, evidence: [] };

describe("sold signal (§6)", () => {
  it("rule 1 fires when the record grew and the newest row's ym ≥ the first-seen month", () => {
    const history = rows("leasing 2021-01, private 2021-02, dealer 2026-07");
    const s = soldSignal(input({ listing: { first_seen_at: firstSeen, owners_at_first_seen: 2 }, car: { ownership_history: history } }));
    assert.equal(s.strength, "strong");
    assert.match(s.evidence[0], /rule 1/);
  });

  it("rule 1 fires on a row in the first-seen month itself (≥)", () => {
    const history = rows("leasing 2021-01, private 2021-02, dealer 2026-06");
    const s = soldSignal(input({ listing: { first_seen_at: firstSeen, owners_at_first_seen: 2 }, car: { ownership_history: history } }));
    assert.equal(s.strength, "strong");
  });

  it("rule 1 does not fire when the newest row is before the first-seen month, even though the record grew", () => {
    const history = rows("leasing 2021-01, private 2021-02, dealer 2026-05");
    const s = soldSignal(input({ listing: { first_seen_at: firstSeen, owners_at_first_seen: 2 }, car: { ownership_history: history } }));
    // The subject is rule 1's gate: the newest row (2026-05) is before the first-seen month (2026-06), so
    // rule 1 must not fire. Day 19 (§3.4) moved the reference date the OTHER rules count back from, and that
    // changed what else this fixture reaches: the 3-month window used to be measured from the fixture clock
    // (2026-09), which put the 2026-05 dealer row 4 months out of rule 4's reach; measured from this
    // listing's own first_seen_at (2026-06) the same row is 1 month back, inside it. So rule 4 now carries
    // the case at medium. Rule 1's gate — the only thing this test is about — is unchanged and still holds.
    assert.notEqual(s.strength, "strong");
    assert.ok(!s.evidence.some((e) => e.includes("rule 1")), `rule 1 must not fire: ${s.evidence.join(" | ")}`);
    assert.equal(s.strength, "medium");
    assert.match(s.evidence[0], /rule 4/);
  });

  it("rule 1 does not fire, and nothing else does either, when every row is far behind first_seen_at", () => {
    // The companion the case above used to be: the record grew, the newest row is before the first-seen
    // month AND outside the 3-month window measured back from it, so no rule fires at all.
    const history = rows("leasing 2021-01, private 2021-02, dealer 2026-01");
    const s = soldSignal(input({ listing: { first_seen_at: firstSeen, owners_at_first_seen: 2 }, car: { ownership_history: history } }));
    assert.equal(s.strength, null);
    assert.deepEqual(s.evidence, []);
  });

  it("rule 1 does not fire when the record did not grow", () => {
    const history = rows("leasing 2021-01, private 2021-02, dealer 2026-07");
    const s = soldSignal(input({ listing: { first_seen_at: firstSeen, owners_at_first_seen: 3, seller_type: "dealer" }, car: { ownership_history: history } }));
    assert.equal(s.strength, null);
  });

  it("rule 3: dealer seller, a private row after the last dealer row within 3 months → medium", () => {
    const history = rows("private 2021-01, dealer 2026-06, private 2026-08");
    const s = soldSignal(input({ listing: { seller_type: "dealer" }, car: { ownership_history: history } }));
    assert.equal(s.strength, "medium");
    assert.match(s.evidence[0], /rule 3/);
  });

  it("rule 3: a dealer after a dealer never fires", () => {
    const history = rows("private 2021-01, dealer 2026-06, dealer 2026-08");
    const s = soldSignal(input({ listing: { seller_type: "dealer" }, car: { ownership_history: history } }));
    assert.equal(s.strength, null);
  });

  it("rule 3: a private row between two dealer rows is not after the LAST dealer row", () => {
    const history = rows("private 2021-01, dealer 2026-05, private 2026-06, dealer 2026-08");
    const s = soldSignal(input({ listing: { seller_type: "dealer" }, car: { ownership_history: history } }));
    assert.equal(s.strength, null);
  });

  it("rule 3: a private row after the last dealer row but older than 3 months does not fire", () => {
    const history = rows("private 2021-01, dealer 2026-01, private 2026-03");
    const s = soldSignal(input({ listing: { seller_type: "dealer" }, car: { ownership_history: history } }));
    assert.equal(s.strength, null);
  });

  it("rule 4: private seller, a row after the last private row within 3 months → medium", () => {
    const history = rows("leasing 2021-01, private 2021-02, dealer 2026-08");
    const s = soldSignal(input({ car: { ownership_history: history } }));
    assert.equal(s.strength, "medium");
    assert.match(s.evidence[0], /rule 4/);
  });

  it("rule 2 is inert: a fleet-company seller whose row is followed by another fires strong", () => {
    const history = rows("leasing 2021-01, private 2024-02");
    const s = soldSignal(input({ listing: { seller_type: "fleet_company" }, car: { ownership_history: history } }));
    assert.equal(s.strength, "strong");
  });

  it("no history → null, no evidence", () => {
    assert.deepEqual(soldSignal(input()), NO_SIGNAL);
  });
});

describe("checks and the sold signal (§18.8)", () => {
  it("strong → both checks skipped, reason sold", () => {
    const history = rows("leasing 2021-01, private 2021-02, dealer 2026-07");
    const inp = input({
      listing: { first_seen_at: firstSeen, owners_at_first_seen: 2, hand_declared: 1, km_declared: 50000 },
      car: { ownership_history: history, km_at_last_test: 40000, mivchan_acharon_dt: new Date("2026-01-01T00:00:00.000Z") },
    });
    const s = soldSignal(inp);
    assert.equal(s.strength, "strong");
    assert.deepEqual(handCheck(inp, s), { check: "hand", status: "skipped", reason: "sold" });
    assert.deepEqual(kmCheck(inp, s), { check: "km", status: "skipped", reason: "sold" });
  });

  it("medium (rule 3) → both checks skipped, reason possibly_sold", () => {
    const history = rows("private 2021-01, dealer 2026-06, private 2026-08");
    const inp = input({ listing: { seller_type: "dealer", hand_declared: 1, km_declared: 50000 }, car: { hand: 2, ownership_history: history } });
    const s = soldSignal(inp);
    assert.equal(s.strength, "medium");
    assert.deepEqual(handCheck(inp, s), { check: "hand", status: "skipped", reason: "possibly_sold" });
    assert.deepEqual(kmCheck(inp, s), { check: "km", status: "skipped", reason: "possibly_sold" });
  });

  it("null → the hand check runs on the full record", () => {
    const history = rows("private 2021-01, dealer 2026-06, dealer 2026-08");
    const inp = input({ listing: { seller_type: "dealer", hand_declared: 1 }, car: { hand: 1, ownership_history: history } });
    const s = soldSignal(inp);
    assert.equal(s.strength, null);
    assert.equal(handCheck(inp, s).status, "match");
  });
});

describe("hand check (§7)", () => {
  it("declared = official − 1 with a zero-km deal → zero_km_undercount, counts", () => {
    const c = handCheck(input({ listing: { hand_declared: 1 }, car: { hand: 2, ownership_history: rows("leasing 2021-10, private 2021-10") } }), NO_SIGNAL);
    assert.equal(c.status, "mismatch");
    assert.equal(c.kind, "zero_km_undercount");
    assert.equal(c.counts, true);
    assert.equal(c.diff, -1);
  });

  it("declared = official − 1 with a fleet row (no zero-km) → fleet_undercount", () => {
    const c = handCheck(input({ listing: { hand_declared: 1 }, car: { ownership_history: rows("leasing 2020-01, private 2023-01") } }), NO_SIGNAL);
    assert.equal(c.kind, "fleet_undercount");
  });

  it("declared = official − 1 with a private pair → private_pair, does not count", () => {
    const c = handCheck(input({ listing: { hand_declared: 1 }, car: { ownership_history: rows("private 2023-01, private 2023-01") } }), NO_SIGNAL);
    assert.equal(c.kind, "private_pair");
    assert.equal(c.counts, false);
  });

  it("any other difference → other", () => {
    const c = handCheck(input({ listing: { hand_declared: 3 }, car: { ownership_history: rows("private 2023-01") } }), NO_SIGNAL);
    assert.equal(c.kind, "other");
  });

  it("unavailable: no_declaration | invalid_declaration | no_history", () => {
    assert.equal(handCheck(input({ car: { ownership_history: rows("private 2023-01") } }), NO_SIGNAL).reason, "no_declaration");
    assert.equal(handCheck(input({ listing: { hand_declared: 0 }, car: { ownership_history: rows("private 2023-01") } }), NO_SIGNAL).reason, "invalid_declaration");
    assert.equal(handCheck(input({ listing: { hand_declared: 1 } }), NO_SIGNAL).reason, "no_history");
  });
});

describe("km check (§7)", () => {
  const test = new Date("2026-01-27T00:00:00.000Z"); // 8 months before NOW

  it("declared more than 5,000 below the last test → km_below, counts", () => {
    const c = kmCheck(input({ listing: { km_declared: 100000 }, car: { km_at_last_test: 106000, mivchan_acharon_dt: test } }), NO_SIGNAL);
    assert.equal(c.status, "mismatch");
    assert.equal(c.kind, "km_below");
    assert.equal(c.counts, true);
    assert.equal(c.official_date, "2026-01-27");
  });

  it("within 5,000 below → match", () => {
    const c = kmCheck(input({ listing: { km_declared: 102000 }, car: { km_at_last_test: 106000, mivchan_acharon_dt: test } }), NO_SIGNAL);
    assert.equal(c.status, "match");
  });

  it("growth above 5,000 per month → km_implausible_growth, does not count", () => {
    const c = kmCheck(input({ listing: { km_declared: 150000 }, car: { km_at_last_test: 100000, mivchan_acharon_dt: test } }), NO_SIGNAL);
    assert.equal(c.kind, "km_implausible_growth");
    assert.equal(c.counts, false);
    assert.equal(c.raw?.months_since_test, 8);
    assert.equal(c.raw?.km_per_month_since_test, 6250);
  });

  it("official 0 → unavailable official_is_intake", () => {
    const c = kmCheck(input({ listing: { km_declared: 1 }, car: { km_at_last_test: 0, mivchan_acharon_dt: test } }), NO_SIGNAL);
    assert.equal(c.reason, "official_is_intake");
  });

  it("unavailable: no_declaration | no_official_km | no_test_date (§18.5)", () => {
    assert.equal(kmCheck(input(), NO_SIGNAL).reason, "no_declaration");
    assert.equal(kmCheck(input({ listing: { km_declared: 1 } }), NO_SIGNAL).reason, "no_official_km");
    assert.equal(kmCheck(input({ listing: { km_declared: 1 }, car: { km_at_last_test: 1 } }), NO_SIGNAL).reason, "no_test_date");
  });
});
