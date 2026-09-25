// scripts/oneoff/readback-run2-gate.ts — the read-back of Run 2, Days 20–21 (BRIEF §10).
//
// READ ONLY. It opens no transaction, writes nothing, and does NOT go through loadForAddress(): that function
// is allowed to write a re-run when it finds an update, and this script may not. It resolves each question's
// displayed run the way the loading rule resolves it (latestRun over the question and its re-runs) and then
// reads THAT run's stored `search_results` rows — nothing else. It carries the reading code of Run 1's
// readback-run1-cards.ts, which §7.3 deletes; nothing is rewritten.
//
// §10.1 — ONE LINE PER PERSON-SEARCH (`searches.rerun_of` IS NULL), through the SAME resultsViewFrom() the
// screen renders from:
//
//   s            the question's public_id — the `?s=` of its address
//   model        `searches.model_searched`, as stored
//   filters      the active filters in short; "—" when the question carries none
//   X            counts.cars — the crowned screen's count line number
//   N            counts.with_comparison — the shown rows with a price comparison
//   M            counts.eligible — of those, the rows ELIGIBLE TO WIN (rules v7 §1.2)
//   src          counts.source: `record` when the rank-1 row carries the gate's record, `recount` when it does
//                not. Every stored row today was written under version 6, so `recount` is the expectation.
//   cards        the STORED cards as their categories: `bv | pm | ch`, `bv+pm | ch`, `bv+pm+ch`, `—` for none
//   ru           the STORED runner-up's amount in shekels, or `—`; marked `pick` when the stored record carries
//                P1's `also_won` (the case rules v7 §1.5 abolishes)
//   now          `ResultsView.state` as §3.1 decides it FROM THESE ROWS, which is what the address draws right
//                now: the rows were written under version 6 and carry no gate record, so §3.1's last clause
//                reads a search with stored cards as `crowned`
//   verdict      WHAT VERSION 7 SAYS about the same cars — the gate applied to the counts, by §2.1's reasons and
//                §3.1's order: crowned / uncrowned A / uncrowned B / zero scored / zero results. This is the
//                column that says what the first load after deploy will draw, and it is where it differs from
//                `now` that the deploy changes a screen.
//   ru v7        the runner-up under version 7: `same` (a stored runner-up not marked `pick`), `changes` (one
//                that is), `—` (none, or the search is not crowned under version 7)
//
// §10.2 — then two fresh selections, version 7, one per live model, through the same call select-three makes.
//
// PURPOSE: this table is the map of what the first load of each address will show after deploy. It claims no
// number in advance. It stays in the tree until the next run deletes it.

import "dotenv/config";
import { db } from "@/lib/db";
import { activeFilterNames, type SearchFilters } from "@/lib/search/filters";
import {
  latestRun,
  resultsOf,
  resultsView,
  storedFilters,
  type ResultRow,
  type ResultsView,
  type SearchRow,
} from "@/lib/search/load";
import { assemblePool } from "@/lib/search/assemble";
import { CROWNING_THRESHOLD, crowningLine, selectThree, type Category, type RuleTrace, type SelectionResult } from "@/lib/selection";

const SEARCH_COLUMNS = {
  id: true,
  public_id: true,
  rerun_of: true,
  created_at: true,
  model_searched: true,
  family_id: true,
  filters: true,
  priority: true,
  engine_version: true,
  rules_version: true,
  results_count: true,
  pool_count: true,
} as const;

/** The three category codes, short, as the table prints them. */
const SHORT = { best_value: "bv", peace_of_mind: "pm", cheapest: "ch" } as const;

const num = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** The active filters in one short cell. Values, not just names: the gate is read against them. */
function shortFilters(f: SearchFilters): string {
  const active = activeFilterNames(f);
  if (active.length === 0) return "—";
  const parts: string[] = [];
  for (const name of active) {
    if (name === "price") parts.push(`price ${f.priceMin ?? ""}-${f.priceMax ?? ""}`);
    else if (name === "years") parts.push(`years ${(f.years ?? []).join("/")}`);
    else if (name === "kmMax") parts.push(`km<=${f.kmMax}`);
    else if (name === "regions") parts.push(`regions ${(f.regions ?? []).join("/")}`);
  }
  return parts.join(" · ");
}

const trace = (json: unknown): RuleTrace[] => (Array.isArray(json) ? (json as unknown as RuleTrace[]) : []);

/**
 * §10.1 — the STORED runner-up record's P1 mark. `also_won` is gone from version 7's records, but the rows in
 * the database were written under version 6 and some carry it: those are exactly the searches whose runner-up
 * changes. Read off the row that carries the `cheapest` category.
 */
function storedRunnerUpIsPick(rows: readonly ResultRow[]): boolean {
  const cheapest = rows.find((r) => r.recommendation_categories.includes("cheapest"));
  if (cheapest === undefined) return false;
  const entry = trace(cheapest.stage_b_trace).find((t) => t.rule === "cheapest_runner_up");
  if (entry === undefined || entry.context.evaluated === false) return false;
  const also = entry.context.also_won;
  return Array.isArray(also) && also.length > 0;
}

/**
 * §10.1 — THE VERDICT UNDER VERSION 7, from the same rows, in §3.1's order with §2.1's two reasons.
 *
 * It is computed from the COUNTS and not read off `view.state`, and that is the point of the column. Every
 * stored row in the database today was written under version 6, so it carries no `crowning_threshold` record,
 * and §3.1's last clause then reads a search WITH stored cards as `crowned` — which is what the screen draws
 * from those rows right now, before the refresh. What the first load after deploy will draw is the gate applied
 * to the same cars, and that is this column.
 */
function verdictOf(view: ResultsView): string {
  const { cars, with_comparison: N, eligible: M, threshold } = view.counts;
  if (cars === 0) return "zero results";
  if (N === 0) return "zero scored";
  if (M >= threshold) return "crowned";
  return N < threshold ? "uncrowned A" : "uncrowned B";
}

function pad(s: string, n: number): string {
  // Hebrew and Latin mix in these cells; a plain length pad is enough for a terminal table.
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

const lines: string[] = [];
const log = (s = "") => {
  lines.push(s);
  console.log(s);
};

// ---------------------------------------------------------------------------
// §10.1 — the table
// ---------------------------------------------------------------------------

type Row = { question: SearchRow; run: SearchRow; rows: ResultRow[]; view: ResultsView; ruIsPick: boolean; verdict: string; ruV7: string };

async function table(): Promise<Row[]> {
  log("readback-run2-gate §10.1 — every person-search, through resultsViewFrom(), under rules version 7\n");
  log(`CROWNING_THRESHOLD = ${CROWNING_THRESHOLD}\n`);

  const questions = await db.searches.findMany({ where: { rerun_of: null }, select: SEARCH_COLUMNS, orderBy: { id: "asc" } });
  const reruns = await db.searches.findMany({ where: { NOT: { rerun_of: null } }, select: SEARCH_COLUMNS, orderBy: { id: "asc" } });
  const rerunsOf = new Map<number, SearchRow[]>();
  for (const r of reruns) {
    if (r.rerun_of === null) continue;
    const list = rerunsOf.get(r.rerun_of) ?? [];
    list.push(r);
    rerunsOf.set(r.rerun_of, list);
  }

  const header = ["s", "model", "filters", "X", "N", "M", "src", "cards", "ru", "now", "verdict", "ru v7", "run"];
  const widths = [11, 14, 50, 4, 4, 4, 8, 14, 12, 12, 12, 8, 5];
  log(header.map((h, i) => pad(h, widths[i])).join("| "));
  log(widths.map((w) => "-".repeat(w)).join("+-"));

  const out: Row[] = [];
  for (const question of questions) {
    const run = latestRun(question, rerunsOf.get(question.id) ?? []);
    const rows = await resultsOf(run.id);
    const view = await resultsView(question.public_id, rows);
    const ruIsPick = storedRunnerUpIsPick(rows);

    const cards = view.cards.length === 0 ? "—" : view.cards.map((c) => c.categories.map((x) => SHORT[x]).join("+")).join(" | ");
    const storedRu = view.runner_up === null ? "—" : `${num(view.runner_up.amount)}${ruIsPick ? " pick" : ""}`;
    const verdict = verdictOf(view);
    // §10.1 — the runner-up under version 7: it only exists on a search that is still crowned, and a stored one
    // marked `pick` is exactly the one the new rule replaces or drops.
    const ruV7 = verdict !== "crowned" || view.runner_up === null ? "—" : ruIsPick ? "changes" : "same";

    const cells = [
      question.public_id,
      run.model_searched,
      shortFilters(storedFilters(question.filters)),
      String(view.counts.cars),
      String(view.counts.with_comparison),
      String(view.counts.eligible),
      view.counts.source,
      cards,
      storedRu,
      view.state, // what THESE rows read as today (§3.1's last clause, with no record to go on)
      verdict,
      ruV7,
      run.id === question.id ? "own" : String(run.id),
    ];
    log(cells.map((c, i) => pad(c, widths[i])).join("| "));
    out.push({ question, run, rows, view, ruIsPick, verdict, ruV7 });
  }

  const count = (p: (r: Row) => boolean) => out.filter(p).length;
  log(
    `\nperson-searches: ${out.length} · crowned: ${count((r) => r.verdict === "crowned")}` +
      ` · uncrowned A: ${count((r) => r.verdict === "uncrowned A")}` +
      ` · uncrowned B: ${count((r) => r.verdict === "uncrowned B")}` +
      ` · zero scored: ${count((r) => r.verdict === "zero scored")}` +
      ` · zero results: ${count((r) => r.verdict === "zero results")}` +
      ` · runner-up changes: ${count((r) => r.ruV7 === "changes")}`,
  );
  log(`with fewer than ${CROWNING_THRESHOLD} cars eligible to win: ${count((r) => r.verdict.startsWith("uncrowned"))} of ${out.length}`);
  log(`reading as crowned from their STORED rows today but uncrowned under version 7: ${count((r) => r.view.state === "crowned" && r.verdict.startsWith("uncrowned"))}`);
  const sources = [...new Set(out.map((r) => r.view.counts.source))].sort();
  log(`counts.source over every search: ${sources.join(", ") || "-"}`);
  const onARerun = out.filter((r) => r.run.id !== r.question.id).map((r) => `${r.question.public_id} -> run ${r.run.id}`);
  log(`displaying a re-run rather than their own run: ${onARerun.length === 0 ? "none" : onARerun.join(" · ")}`);
  return out;
}

// ---------------------------------------------------------------------------
// §10.2 — two fresh selections, version 7, one per live model
// ---------------------------------------------------------------------------

/** §3.2's recount, applied to a FRESH SelectionResult's own rows — the self-check the block must pass. */
function recountFresh(res: SelectionResult): { eligible: number; with_comparison: number } {
  let with_comparison = 0;
  let eligible = 0;
  for (const r of res.results) {
    if (r.status !== "shown") continue;
    if (!r.eligibility.without_unverified_history.best_value) continue; // deal_score !== null, and nothing else
    with_comparison += 1;
    const barred = r.trace.some((t) => (t.rule === "unverified_history" || t.rule === "cancelled") && t.effect === "ineligible");
    if (!barred) eligible += 1;
  }
  return { eligible, with_comparison };
}

async function freshSelections(stored: Row[]): Promise<void> {
  log("\n\nreadback-run2-gate §10.2 — a fresh, unfiltered selection per live model, under rules version 7\n");

  const live = await db.listings.findMany({
    where: { delisted_at: null },
    select: { car: { select: { model: { select: { model: true } } } } },
  });
  const models = [...new Set(live.map((l) => l.car.model.model).filter((m): m is string => m !== null))].sort();
  if (models.length === 0) {
    log("no live listing at all — nothing to select");
    return;
  }

  for (const model of models) {
    log(`\n--- ${model}`);
    const pool = await assemblePool(model);
    const res = selectThree({ listings: pool.items.map((p) => p.candidate) });
    const plateOf = new Map(pool.items.map((p) => [p.listing_id, p.plate]));
    const P = (id: number) => plateOf.get(id) ?? "?";

    log(`pool: ${pool.items.length} listing(s)`);
    log(`  ${crowningLine(res.crowning)}`);
    for (const c of ["best_value", "peace_of_mind", "cheapest"] as Category[]) {
      const id = res.picks[c];
      log(`  ${c}: ${id === null ? `none (${res.missing[c] ?? "-"})` : `${P(id)} (listing ${id})`}`);
    }
    const ru = res.runner_ups.cheapest;
    log(`  runner-up: ${ru === null ? "none" : `${P(ru.listing_id)} (listing ${ru.listing_id}), gap ${ru.gap}, +${ru.price_over_pct}%`}`);

    // the self-check: the record's counts against §3.2's recount over the SAME fresh rows
    const counted = recountFresh(res);
    if (counted.eligible !== res.crowning.eligible || counted.with_comparison !== res.crowning.with_comparison) {
      throw new Error(
        `${model}: the gate's record says eligible ${res.crowning.eligible} of ${res.crowning.with_comparison}, a recount over the same rows says ${counted.eligible} of ${counted.with_comparison}`,
      );
    }
    log(`  self-check: record ${res.crowning.eligible}/${res.crowning.with_comparison} = recount ${counted.eligible}/${counted.with_comparison} — equal`);

    // §10.2 — against the model's latest UNFILTERED person-search
    const key = model.toUpperCase().replace(/\s+/g, "");
    const unfiltered = stored
      .filter((r) => r.run.model_searched.toUpperCase().replace(/\s+/g, "") === key && activeFilterNames(storedFilters(r.question.filters)).length === 0)
      .sort((a, b) => a.run.created_at.getTime() - b.run.created_at.getTime());
    const latest = unfiltered[unfiltered.length - 1];
    if (latest === undefined) {
      log("  no unfiltered person-search of this model to compare with");
      continue;
    }
    const storedRuId = storedRunnerUpListingOf(latest.rows);
    log(`  latest unfiltered person-search: ${latest.question.public_id} (run ${latest.run.id}) — stored runner-up ${storedRuId ?? "none"}${latest.ruIsPick ? " (marked pick)" : ""}`);
    if (latest.ruIsPick) {
      if (ru !== null && ru.listing_id === storedRuId) {
        throw new Error(`${model}: the stored runner-up ${storedRuId} is marked pick, yet version 7 names the same listing — §1.5 was not applied`);
      }
      log(`  verdict: CHANGES, as expected — the stored runner-up was a pick; version 7 names ${ru === null ? "none" : `listing ${ru.listing_id}`}`);
    } else if (storedRuId === null) {
      log(`  verdict: the stored search recorded no runner-up; version 7 names ${ru === null ? "none" : `listing ${ru.listing_id}`}`);
    } else if (ru !== null && ru.listing_id === storedRuId) {
      log("  verdict: same");
    } else {
      // a finding, not a stop: a listing that changed since the search ran explains it
      const listing = await db.listings.findUnique({ where: { id: storedRuId }, select: { updated_at: true } });
      log(
        `  FINDING: the stored runner-up is listing ${storedRuId} and version 7 names ${ru === null ? "none" : `listing ${ru.listing_id}`}` +
          ` — listings.updated_at ${listing?.updated_at.toISOString() ?? "?"} against searches.created_at ${latest.run.created_at.toISOString()}`,
      );
    }
  }
}

/** The stored runner-up's listing id, read the way load.ts's storedRunnerUpListing() reads it. */
function storedRunnerUpListingOf(rows: readonly ResultRow[]): number | null {
  const cheapest = rows.find((r) => r.recommendation_categories.includes("cheapest"));
  if (cheapest === undefined) return null;
  const entry = trace(cheapest.stage_b_trace).find((t) => t.rule === "cheapest_runner_up");
  if (entry === undefined || entry.context.evaluated === false) return null;
  const id = entry.context.runner_up;
  return typeof id === "number" ? id : null;
}

async function main() {
  const stored = await table();
  await freshSelections(stored);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exitCode = 1;
});
