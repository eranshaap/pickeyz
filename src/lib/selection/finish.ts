// The finish test (BRIEF Day 12 part 3 §3, rewritten to Day 14 rules v5 §0.5). Pure: it reads a finished
// SelectionResult and nothing else, so scripts/select-three.ts prints exactly the claims the tests check.
//
// The claims, in the order they are printed:
//   1. every category is filled, or empty with a recorded reason — empty without a reason is a FAIL
//      (an empty category with a reason is a correct outcome, §0.4, never an error);
//   2. every winner is eligible for the category it won;
//   3. the best_value winner is the first ELIGIBLE listing in the list order, and every listing ranked above it
//      carries a recorded ineligibility with its reason (rules v5: an ineligible listing keeps its rank, §0.1);
//   4. the shown ranks are contiguous 1..n.
// Replaces v4's "three picks exist" and "the winner is at rank 1", both of which rules v5 makes wrong.
//
// Days 20–21 rules v7 (§1.6) — THE GATE JOINS IT, as claim 0 and as a fork in claim 3:
//   0. the crowning_threshold record sits on the rank-1 row (and only there) whenever a row is shown, it agrees
//      with the result's own `crowning`, and its `value` survives a RECOUNT over the result's own rows;
//   triggered  ⇒ every category is empty with `below_crowning_threshold`, and NO cheapest_runner_up record exists;
//   not triggered ⇒ claims 1–3 as before ("best_value = the first eligible in order" is asserted only here).
// Claim 4 (contiguous ranks) is asserted in BOTH branches: the gate moves no row.
//
// Days 22–23 rules v8 (§0c) — claim 0's recount counts and compares ALL THREE of the gate's numbers
// (with_comparison / verified / eligible), and claims 2 and 3 read "a recorded ineligibility" off the one
// INELIGIBLE_RULES list that crowning.ts counts by: a car below the condition floor, ranked above the winner, is
// explained by its own `condition_floor` record.

import { CATEGORY_PRIORITY } from "./constants";
import { INELIGIBLE_RULES } from "./crowning";
import type { ListingResult, RuleTrace, SelectionResult } from "./types";

export type FinishCheck = { claim: string; ok: boolean; detail?: string };
export type FinishTest = { checks: FinishCheck[]; pass: boolean };

/** Did this rule fire on this row with the `ineligible` effect? The row's own record is the only source. */
function firedIneligible(r: ListingResult, rule: string): boolean {
  return r.trace.some((t) => t.rule === rule && t.effect === "ineligible");
}

/** Days 22–23 rules v8 (§0c) — the one of INELIGIBLE_RULES that separates `eligible` from `verified`. */
const FLOOR_RULE: (typeof INELIGIBLE_RULES)[number] = "condition_floor";

/** Does any barring rule's own record say this row wins nothing? Claims 2 and 3 read the ineligibility off here. */
function recordedIneligible(r: ListingResult): boolean {
  return INELIGIBLE_RULES.some((rule) => firedIneligible(r, rule));
}

/**
 * §1.6, as Days 22–23 rules v8 (§0c) re-cuts it — the recount the record's counts are checked against, over the
 * RESULT's own rows. All THREE numbers are recounted and all three are compared to the record.
 *
 * "has a deal score" is read off `without_unverified_history.best_value`, which gate.ts sets to
 * `deal_score !== null && not below the floor` and to nothing else (a cancelled or a thin-cell row is false there,
 * and both have a null deal score). From v8 the floor is part of that flag, so a row the FLOOR barred is added back
 * through its own record — written on exactly the rows whose condition_vs_typical is known and below the floor, all
 * of which have a deal score (the engine derives it from the same condition_vs_typical). The result carries no
 * invoice, so this stays a reading of the invoice's own answer and re-derives nothing.
 */
function recount(res: SelectionResult): { eligible: number; verified: number; with_comparison: number } {
  let with_comparison = 0;
  let verified = 0;
  let eligible = 0;
  for (const r of res.results) {
    if (r.status !== "shown") continue;
    const floorBarred = firedIneligible(r, FLOOR_RULE);
    if (!r.eligibility.without_unverified_history.best_value && !floorBarred) continue;
    with_comparison += 1;
    if (INELIGIBLE_RULES.some((rule) => rule !== FLOOR_RULE && firedIneligible(r, rule))) continue;
    verified += 1;
    if (!floorBarred) eligible += 1;
  }
  return { eligible, verified, with_comparison };
}

/** Every crowning_threshold record in a finished result. There is at most one (§1.4). */
function crowningRecords(res: SelectionResult): { row: ListingResult; entry: RuleTrace }[] {
  const out: { row: ListingResult; entry: RuleTrace }[] = [];
  for (const r of res.results) for (const t of r.trace) if (t.rule === "crowning_threshold") out.push({ row: r, entry: t });
  return out;
}

export function finishTest(res: SelectionResult): FinishTest {
  const shown = res.results.filter((r) => r.status === "shown").sort((a, b) => (a.rank as number) - (b.rank as number));
  const byId = new Map(res.results.map((r) => [r.listing_id, r]));
  const at = (id: number): ListingResult => {
    const r = byId.get(id);
    if (r === undefined) throw new Error(`finish test: pick ${id} is not among the results`);
    return r;
  };

  // 0. §1.6 — THE GATE'S RECORD: on the rank-1 row and on no other whenever a row is shown, agreeing with the
  //    result's own `crowning`, and with a `value` that survives a recount over the result's own rows.
  const found = crowningRecords(res);
  const rankOne = shown.find((r) => r.rank === 1) ?? null;
  const record = found.length === 1 ? found[0] : null;
  const counted = recount(res);
  const recordProblems: string[] = [];
  if (found.length > 1) recordProblems.push(`${found.length} crowning_threshold records — the gate is measured once`);
  if (rankOne === null && found.length > 0) recordProblems.push("a crowning_threshold record with no shown row to carry it");
  if (rankOne !== null && found.length === 0) recordProblems.push("no crowning_threshold record, though a row is shown");
  if (record !== null && rankOne !== null && record.row.listing_id !== rankOne.listing_id) {
    recordProblems.push(`the crowning_threshold record sits on listing ${record.row.listing_id}, not on the rank-1 row ${rankOne.listing_id}`);
  }
  if (record !== null) {
    if (record.entry.effect !== "none") recordProblems.push(`the crowning_threshold record acts (effect ${record.entry.effect}) — the rule moves no row`);
    if (record.entry.value !== counted.eligible) recordProblems.push(`the record says eligible ${String(record.entry.value)}; a recount over the rows says ${counted.eligible}`);
    if (record.entry.context.with_comparison !== counted.with_comparison) {
      recordProblems.push(`the record says with_comparison ${String(record.entry.context.with_comparison)}; a recount says ${counted.with_comparison}`);
    }
    // §0c — the third count is checked like the other two: the record carries it, so the recount must agree with it.
    if (record.entry.context.verified !== counted.verified) {
      recordProblems.push(`the record says verified ${String(record.entry.context.verified)}; a recount says ${counted.verified}`);
    }
    if (record.entry.context.eligible !== counted.eligible) {
      recordProblems.push(`the record's context says eligible ${String(record.entry.context.eligible)}; a recount says ${counted.eligible}`);
    }
    if (record.entry.threshold !== res.crowning.threshold) recordProblems.push("the record's threshold and the result's crowning.threshold disagree");
    if (record.entry.triggered === res.crowning.crowned) recordProblems.push("the record's `triggered` and the result's crowning.crowned disagree");
  }
  if (res.crowning.eligible !== counted.eligible || res.crowning.verified !== counted.verified || res.crowning.with_comparison !== counted.with_comparison) {
    recordProblems.push(
      `crowning says ${res.crowning.eligible}/${res.crowning.verified}/${res.crowning.with_comparison}; a recount says ${counted.eligible}/${counted.verified}/${counted.with_comparison}`,
    );
  }
  const crowningRecorded: FinishCheck = {
    claim: "the crowning gate is recorded on the rank-1 row, once, and its counts survive a recount",
    ok: recordProblems.length === 0,
    detail:
      recordProblems.length > 0
        ? recordProblems.join("; ")
        : `eligible ${counted.eligible} of ${counted.with_comparison}, threshold ${res.crowning.threshold} -> ${res.crowning.crowned ? "crowned" : "uncrowned"}`,
  };

  // §1.6 — THE FORK. The gate triggered ("uncrowned") ⇒ nothing was picked and nothing was evaluated.
  const gated = !res.crowning.crowned;
  const gateProblems: string[] = [];
  if (gated) {
    for (const c of CATEGORY_PRIORITY) {
      if (res.picks[c] !== null) gateProblems.push(`${c} has a pick (listing ${res.picks[c]}) though nothing is crowned`);
      else if (res.missing[c] !== "below_crowning_threshold") gateProblems.push(`${c} is empty with the reason ${res.missing[c] ?? "none"}, not below_crowning_threshold`);
    }
    if (res.runner_ups.cheapest !== null) gateProblems.push("a runner-up was recorded though nothing is crowned");
    const ru = res.results.filter((r) => r.trace.some((t) => t.rule === "cheapest_runner_up"));
    if (ru.length > 0) gateProblems.push(`a cheapest_runner_up record on listing(s) ${ru.map((r) => r.listing_id).join(", ")} though nothing is crowned`);
    const tracked = res.results.filter((r) => r.trace.some((t) => t.rule === "double_winner" || t.rule === "too_similar"));
    if (tracked.length > 0) gateProblems.push(`a pick-loop record on listing(s) ${tracked.map((r) => r.listing_id).join(", ")} though no pick was made`);
  } else {
    for (const c of CATEGORY_PRIORITY) {
      if (res.picks[c] === null && res.missing[c] === "below_crowning_threshold") gateProblems.push(`${c} is empty for the gate's reason, but the search IS crowned`);
    }
  }
  const gateHeld: FinishCheck = {
    claim: "nothing is crowned below the threshold: no pick, no runner-up, no pick-loop record",
    ok: gateProblems.length === 0,
    detail: gateProblems.length > 0 ? gateProblems.join("; ") : gated ? "uncrowned: three empty categories, no runner-up" : "crowned: the picks were made",
  };

  // 1. filled, or empty with a reason
  const unanswered = CATEGORY_PRIORITY.filter((c) => res.picks[c] === null && res.missing[c] === undefined);
  const answered: FinishCheck = {
    claim: "every category is filled, or empty with a recorded reason",
    ok: unanswered.length === 0,
    detail:
      unanswered.length > 0
        ? `empty with no reason: ${unanswered.join(", ")}`
        : CATEGORY_PRIORITY.filter((c) => res.picks[c] === null)
            .map((c) => `${c} empty (${res.missing[c]})`)
            .join("; ") || undefined,
  };

  // 2. a winner that is not eligible is a FAIL — and, from rules v8 (§0c), so is a winner carrying a recorded
  //    ineligibility: the eligibility flag and the rules' own records must say the same thing about a pick.
  const badWinners = CATEGORY_PRIORITY.filter(
    (c) => res.picks[c] !== null && (!at(res.picks[c] as number).eligibility[c] || recordedIneligible(at(res.picks[c] as number))),
  );
  const winnersEligible: FinishCheck = {
    claim: "every winner is eligible for the category it won",
    ok: badWinners.length === 0,
    detail: badWinners.length > 0 ? badWinners.map((c) => `${c}: listing ${res.picks[c]} is not eligible`).join("; ") : undefined,
  };

  // 3. the best_value winner is the first eligible listing in the list order, and everything above it is
  //    recorded as ineligible with a reason.
  const firstEligible = shown.find((r) => r.eligibility.best_value) ?? null;
  const above = firstEligible === null ? shown : shown.filter((r) => (r.rank as number) < (firstEligible.rank as number));
  // §0c — "a recorded ineligibility" is either the row's own reasons or an `ineligible` verdict from one of
  // INELIGIBLE_RULES: from rules v8 a below-floor car ranked above the winner is explained by its condition_floor
  // record, exactly as an unverified one is explained by its unverified_history record.
  const unexplainedAbove = above.filter((r) => r.eligibility.best_value || (r.eligibility.reasons.length === 0 && !recordedIneligible(r)));
  const isFirst = res.picks.best_value !== null && firstEligible !== null && firstEligible.listing_id === res.picks.best_value;
  const bestValueFirst: FinishCheck = {
    claim: "best_value winner is the first eligible listing in the list order; every listing above it is recorded ineligible with a reason",
    // §1.6 — asserted only in the crowned branch: below the threshold there is no winner to be first.
    ok: gated || ((res.picks.best_value === null ? firstEligible === null : isFirst) && unexplainedAbove.length === 0),
    detail: gated
      ? "not asserted: nothing is crowned"
      : res.picks.best_value === null
        ? firstEligible === null
          ? "no best_value pick and no eligible listing"
          : `no best_value pick, but listing ${firstEligible.listing_id} (rank ${firstEligible.rank}) is eligible`
        : `winner listing ${res.picks.best_value} at rank ${res.picks.best_value === null ? "-" : at(res.picks.best_value).rank}` +
          (above.length > 0 ? `; ${above.length} ineligible listing(s) above it: ${above.map((r) => `${r.listing_id} (${r.eligibility.reasons.join("+") || "no reason"})`).join(", ")}` : "; none above it") +
          (unexplainedAbove.length > 0 ? `; UNEXPLAINED above it: ${unexplainedAbove.map((r) => r.listing_id).join(", ")}` : ""),
  };

  // 4. contiguous ranks
  const ranks = shown.map((r) => r.rank as number);
  const contiguous: FinishCheck = {
    claim: "shown ranks contiguous 1..n",
    ok: ranks.every((v, i) => v === i + 1),
    detail: undefined,
  };

  const checks = [crowningRecorded, gateHeld, answered, winnersEligible, bestValueFirst, contiguous];
  return { checks, pass: checks.every((c) => c.ok) };
}
