// Day 19 (Run 5c2, §6) — two finished selections of the SAME pool, compared.
//
// The dry scoring run (scripts/score-listings.ts, §7) runs selectThree() twice over one model's pool — once
// with the stored scores, once with the scores it has just computed — and shows what a version write would
// change. This file is the comparison; the script only formats what it returns. Nothing is written anywhere.
//
// Pure, and it decides nothing: it reads two SelectionResults through the library's own types and imports
// nothing from the engine but types. The rules, the order and the picks are not this file's business.

import { CATEGORY_PRIORITY } from "./constants";
import { finishTest, type FinishTest } from "./finish";
import type { Category, ListingResult, SelectionResult } from "./types";

/** How many of the after-side ranks the rank table shows. */
export const TOP_N = 10;

/** One category's pick on both sides. `missing` is the recorded reason when the pick is null. */
export type PickChange = {
  category: Category;
  before: number | null;
  after: number | null;
  before_missing: string | null;
  after_missing: string | null;
  changed: boolean;
};

/**
 * The recorded cheapest_runner_up entry, read exactly the way scripts/select-three.ts reads it in its
 * RUNNER-UP section: the cheapest pick's one trace entry of that rule.
 *   no_pick      — there is no cheapest pick, so the rule was never evaluated
 *   not_evaluated— the entry says context.evaluated === false, with its reason
 *   recorded     — a runner-up listing, its gap, whether it triggered
 */
export type RunnerUpRead =
  | { state: "no_pick"; reason: string | null }
  | { state: "not_evaluated"; reason: string | null; triggered: boolean }
  | { state: "recorded"; listing_id: number; gap: number | null; triggered: boolean; price_over_pct: number | null };

export type RunnerUpChange = { before: RunnerUpRead; after: RunnerUpRead; changed: boolean };

/** One listing's rank on both sides. Only listings `shown` on BOTH sides get one. */
export type RankChange = { listing_id: number; before: number; after: number; move: number };

export type RankReport = {
  compared: number; // listings shown on both sides
  changed: number;
  largest: RankChange | null; // the biggest |move|; null when nothing moved or nothing is comparable
  top: RankChange[]; // the after-side top TOP_N, by after rank
  left_top: RankChange[]; // in the before top TOP_N, out of the after top TOP_N
};

/** A listing whose status differs between the sides. A listing absent from one side reads as "absent". */
export type StatusChange = { listing_id: number; before: string; after: string };

/** Per category: who gained eligibility and who lost it. Only listings present on both sides. */
export type EligibilityChange = { category: Category; gained: number[]; lost: number[] };

export type SelectionComparison = {
  picks: PickChange[];
  runner_up: RunnerUpChange;
  ranks: RankReport;
  statuses: StatusChange[];
  eligibility: EligibilityChange[];
  finish: { before: FinishTest; after: FinishTest };
  /** Listings the two sides do not agree exist. Reported, never thrown on — the sides may hold different pools. */
  only_before: number[];
  only_after: number[];
  changed: boolean; // anything at all differs
};

const byId = (res: SelectionResult): Map<number, ListingResult> => new Map(res.results.map((r) => [r.listing_id, r]));

/** The cheapest pick's recorded cheapest_runner_up entry — select-three.ts's reading, as a value. */
export function readRunnerUp(res: SelectionResult): RunnerUpRead {
  const cId = res.picks.cheapest;
  if (cId === null) return { state: "no_pick", reason: res.missing.cheapest ?? null };
  const r = byId(res).get(cId);
  if (r === undefined) throw new Error(`compareSelections: cheapest pick ${cId} is not among the results`);
  const entries = r.trace.filter((t) => t.rule === "cheapest_runner_up");
  if (entries.length !== 1) throw new Error(`compareSelections: cheapest pick ${cId}: expected exactly one cheapest_runner_up entry, found ${entries.length}`);
  const e = entries[0];
  if (e.context.evaluated === false) {
    return { state: "not_evaluated", reason: typeof e.context.reason === "string" ? e.context.reason : null, triggered: e.triggered };
  }
  return {
    state: "recorded",
    listing_id: e.context.runner_up as number,
    gap: typeof e.value === "number" ? e.value : null,
    triggered: e.triggered,
    price_over_pct: typeof e.context.price_over_pct === "number" ? e.context.price_over_pct : null,
  };
}

// Run 5e (§3): the runner-up verdict compares the RUNNER-UP, like the pick lines do — the state, the listing,
// whether the rule triggered, and every other recorded field. Only the GAP is left out: it is a number ABOUT
// the runner-up, not the runner-up, and the preview prints it before -> after on its own line, so a move in it
// stays visible without being called a change. `triggered` is compared explicitly here — it used to ride along
// inside the whole-object comparison, and a runner-up that appeared or disappeared must never be hidden.
function runnerUpIdentity(r: RunnerUpRead): Record<string, unknown> {
  if (r.state !== "recorded") return { ...r }; // no_pick / not_evaluated: state, reason, and triggered where it exists
  return { state: r.state, listing_id: r.listing_id, triggered: r.triggered, price_over_pct: r.price_over_pct };
}
const sameRunnerUp = (a: RunnerUpRead, b: RunnerUpRead): boolean =>
  JSON.stringify(runnerUpIdentity(a)) === JSON.stringify(runnerUpIdentity(b));

/**
 * The two selections, compared. `before` is the stored side, `after` the fresh one.
 *
 * A listing that only one side carries is reported in only_before / only_after and left out of the rank and
 * eligibility comparisons — there is nothing to compare it with. It is never a throw: in a dry run one side
 * may legitimately hold a listing the other never scored.
 */
export function compareSelections(before: SelectionResult, after: SelectionResult): SelectionComparison {
  const a = byId(before);
  const b = byId(after);

  const picks: PickChange[] = CATEGORY_PRIORITY.map((category) => {
    const p = before.picks[category];
    const q = after.picks[category];
    return {
      category,
      before: p,
      after: q,
      before_missing: before.missing[category] ?? null,
      after_missing: after.missing[category] ?? null,
      changed: p !== q,
    };
  });

  const ru_before = readRunnerUp(before);
  const ru_after = readRunnerUp(after);
  const runner_up: RunnerUpChange = { before: ru_before, after: ru_after, changed: !sameRunnerUp(ru_before, ru_after) };

  // ranks — over the listings that are `shown` on BOTH sides
  const moves: RankChange[] = [];
  for (const [id, ra] of a) {
    const rb = b.get(id);
    if (rb === undefined) continue;
    if (ra.status !== "shown" || rb.status !== "shown") continue;
    const beforeRank = ra.rank as number;
    const afterRank = rb.rank as number;
    moves.push({ listing_id: id, before: beforeRank, after: afterRank, move: afterRank - beforeRank });
  }
  const movedOnly = moves.filter((m) => m.move !== 0);
  const largest = movedOnly.length === 0 ? null : movedOnly.reduce((m, v) => (Math.abs(v.move) > Math.abs(m.move) ? v : m));
  const top = [...moves].sort((x, y) => x.after - y.after).slice(0, TOP_N);
  const beforeTop = new Set([...moves].sort((x, y) => x.before - y.before).slice(0, TOP_N).map((m) => m.listing_id));
  const afterTop = new Set(top.map((m) => m.listing_id));
  const left_top = moves.filter((m) => beforeTop.has(m.listing_id) && !afterTop.has(m.listing_id)).sort((x, y) => x.before - y.before);
  const ranks: RankReport = { compared: moves.length, changed: movedOnly.length, largest, top, left_top };

  // status changes — including a listing only one side carries, which reads as "absent"
  const statuses: StatusChange[] = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const sa = a.get(id)?.status ?? "absent";
    const sb = b.get(id)?.status ?? "absent";
    if (sa !== sb) statuses.push({ listing_id: id, before: sa, after: sb });
  }
  statuses.sort((x, y) => x.listing_id - y.listing_id);

  // eligibility, per category — only listings both sides carry
  const eligibility: EligibilityChange[] = CATEGORY_PRIORITY.map((category) => {
    const gained: number[] = [];
    const lost: number[] = [];
    for (const [id, ra] of a) {
      const rb = b.get(id);
      if (rb === undefined) continue;
      if (!ra.eligibility[category] && rb.eligibility[category]) gained.push(id);
      if (ra.eligibility[category] && !rb.eligibility[category]) lost.push(id);
    }
    gained.sort((x, y) => x - y);
    lost.sort((x, y) => x - y);
    return { category, gained, lost };
  });

  const only_before = [...a.keys()].filter((id) => !b.has(id)).sort((x, y) => x - y);
  const only_after = [...b.keys()].filter((id) => !a.has(id)).sort((x, y) => x - y);

  const finish = { before: finishTest(before), after: finishTest(after) };
  const changed =
    picks.some((p) => p.changed) ||
    runner_up.changed ||
    ranks.changed > 0 ||
    statuses.length > 0 ||
    eligibility.some((e) => e.gained.length > 0 || e.lost.length > 0) ||
    only_before.length > 0 ||
    only_after.length > 0 ||
    finish.before.pass !== finish.after.pass;

  return { picks, runner_up, ranks, statuses, eligibility, finish, only_before, only_after, changed };
}
