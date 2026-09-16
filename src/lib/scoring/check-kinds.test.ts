// BRIEF Day 17 run 6 §1.3 — one case per key shape that appears in today's `by check kind` block, plus
// a tally over several invoices. No database and no engine: the invoices are written out here exactly
// as listings.score_breakdown / listing_scores.breakdown hold them.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkKindKeys, tallyCheckKinds, type CheckKindInvoice } from "./check-kinds";

type StoredCheck = NonNullable<CheckKindInvoice["checks"]>[number] & { declared?: number; official?: number };

/** An invoice carrying just the checks a case is about — the rest of the breakdown is not read. */
const invoice = (...checks: StoredCheck[]): CheckKindInvoice => ({ checks });

describe("checkKindKeys() — the key of one invoice (§1.1)", () => {
  it("match carries neither kind nor reason", () => {
    assert.deepEqual(checkKindKeys(invoice({ check: "km", status: "match" })), ["km: match"]);
  });

  it("mismatch names its kind", () => {
    assert.deepEqual(
      checkKindKeys(invoice({ check: "hand", status: "mismatch", kind: "fleet_undercount", declared: 1, official: 2 })),
      ["hand: mismatch:fleet_undercount"],
    );
  });

  it("skipped names its reason", () => {
    assert.deepEqual(checkKindKeys(invoice({ check: "km", status: "skipped", reason: "sold" })), ["km: skipped:sold"]);
    assert.deepEqual(
      checkKindKeys(invoice({ check: "hand", status: "skipped", reason: "possibly_sold" })),
      ["hand: skipped:possibly_sold"],
    );
  });

  it("unavailable names its reason", () => {
    assert.deepEqual(
      checkKindKeys(invoice({ check: "hand", status: "unavailable", reason: "no_history" })),
      ["hand: unavailable:no_history"],
    );
    assert.deepEqual(
      checkKindKeys(invoice({ check: "km", status: "unavailable", reason: "no_official_km" })),
      ["km: unavailable:no_official_km"],
    );
  });

  it("both checks of one invoice, in the invoice's own order", () => {
    assert.deepEqual(
      checkKindKeys(invoice({ check: "hand", status: "match" }, { check: "km", status: "mismatch", kind: "km_below" })),
      ["hand: match", "km: mismatch:km_below"],
    );
  });

  it("a check absent from the invoice yields no key — nothing is filled in", () => {
    assert.deepEqual(checkKindKeys(invoice({ check: "km", status: "match" })), ["km: match"]);
    assert.deepEqual(checkKindKeys(invoice()), []);
    assert.deepEqual(checkKindKeys({}), []);
    assert.deepEqual(checkKindKeys({ checks: null }), []);
  });
});

describe("tallyCheckKinds() — the block's order (§1.1)", () => {
  it("counts every key over many invoices, most frequent first, ties by key", () => {
    const invoices: CheckKindInvoice[] = [
      invoice({ check: "hand", status: "match" }, { check: "km", status: "match" }),
      invoice({ check: "hand", status: "match" }, { check: "km", status: "match" }),
      invoice({ check: "hand", status: "match" }, { check: "km", status: "mismatch", kind: "km_below" }),
      invoice({ check: "hand", status: "mismatch", kind: "fleet_undercount" }, { check: "km", status: "match" }),
      invoice({ check: "hand", status: "skipped", reason: "sold" }, { check: "km", status: "skipped", reason: "sold" }),
      invoice({ check: "km", status: "unavailable", reason: "no_official_km" }),
    ];
    assert.deepEqual(tallyCheckKinds(invoices), [
      ["hand: match", 3],
      ["km: match", 3],
      ["hand: mismatch:fleet_undercount", 1],
      ["hand: skipped:sold", 1],
      ["km: mismatch:km_below", 1],
      ["km: skipped:sold", 1],
      ["km: unavailable:no_official_km", 1],
    ]);
  });

  it("no invoices, and invoices with no checks, tally to nothing", () => {
    assert.deepEqual(tallyCheckKinds([]), []);
    assert.deepEqual(tallyCheckKinds([invoice(), {}]), []);
  });
});
