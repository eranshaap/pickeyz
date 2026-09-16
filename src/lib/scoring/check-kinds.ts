// BRIEF Day 17 run 6 §1 — the check-kind key of a stored invoice, and the tally over many of them.
//
// Decision (Eran, 16/09; plan, Day 17 block; work.md): a self-check compares two live readings of the
// same data — never a count typed into the code on one day. Both readings have to derive the key the
// same way, so the derivation lives here and nowhere else: scripts/score-listings.ts prints its
// `by check kind` block through it, and scripts/measure-constants.ts builds M7's reference from it.
//
// The key is the line score-listings.ts has always printed — `check: status[:kind|reason]`:
//   km: match · hand: mismatch:fleet_undercount · km: skipped:sold · hand: unavailable:no_history
// A mismatch names its kind, an unavailable or skipped names its reason, a match carries neither. A
// check that is absent from the invoice yields no key at all — the invoice is read as it stands, never
// filled in.
//
// No database, no engine: one stored invoice in, its keys out.

/** An invoice, as loosely as both callers hold one: a ScoreResult, or the classifier's StoredBreakdown. */
export type CheckKindInvoice = {
  checks?: { check?: string; status?: string; kind?: string; reason?: string }[] | null;
};

/** The check-kind keys of one invoice, in the invoice's own order of checks. */
export function checkKindKeys(invoice: CheckKindInvoice): string[] {
  return (invoice.checks ?? []).map((c) => `${c.check}: ${c.status}${c.kind ? ":" + c.kind : c.reason ? ":" + c.reason : ""}`);
}

/**
 * The tally of those keys over many invoices, in the order the block prints them: most frequent first,
 * ties by key.
 */
export function tallyCheckKinds(invoices: CheckKindInvoice[]): [string, number][] {
  const m = new Map<string, number>();
  for (const invoice of invoices) for (const key of checkKindKeys(invoice)) m.set(key, (m.get(key) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
