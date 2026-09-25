// scripts/oneoff/readback-run1-cards.ts — the read-back of Run 1, Days 20–21 (BRIEF §10).
//
// READ ONLY. It opens no transaction, writes nothing, and does NOT go through loadForAddress(): that function
// is allowed to write a re-run when it finds an update, and this script may not. It resolves each question's
// displayed run the way the loading rule resolves it (latestRun over the question and its re-runs) and then
// reads THAT run's stored `search_results` rows — nothing else.
//
// One line per person-search (`searches.rerun_of` IS NULL), through the SAME resultsView() the screen renders
// from, so the table is what the screen would draw today:
//
//   s            the question's public_id — the `?s=` of its address
//   model        `searches.model_searched`, as stored
//   filters      the active filters in short; "—" when the question carries none
//   X            cars_shown — the count line's number
//   cards        the cards as their categories: `bv | pm | ch`, `bv+pm | ch`, `bv+pm+ch`, `—` for none
//   runner-up    the strip's amount in shekels, or "—" when none was recorded
//   scored       shown rows carrying a `total_score`
//   eligible     of those, the rows whose trace holds no `unverified_history` record with the `ineligible`
//                effect — i.e. the rows that MAY win a category (rules v5)
//
// WHY IT EXISTS: it previews Run 2's gate (which searches have fewer than 8 eligible cars) and shows how many
// recorded searches have fewer than three cards today. It claims no number in advance. It stays in the tree
// until Run 2 deletes it.

import "dotenv/config";
import { db } from "@/lib/db";
import { latestRun, resultsOf, resultsView, storedFilters, type SearchRow } from "@/lib/search/load";
import { activeFilterNames, type SearchFilters } from "@/lib/search/filters";
import type { RuleTrace } from "@/lib/selection";

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

/** The active filters in one short cell. Values, not just names: the gate will be read against them. */
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

/** rules v5 — a car with an `ineligible` unverified_history record can never win a category. */
const mayWin = (json: unknown): boolean => !trace(json).some((t) => t.rule === "unverified_history" && t.effect === "ineligible");

function pad(s: string, n: number): string {
  // Hebrew and Latin mix in these cells; a plain length pad is enough for a terminal table.
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main() {
  console.log("readback-run1-cards — every person-search, through resultsView() (BRIEF Run 1 §10)\n");

  const questions = await db.searches.findMany({ where: { rerun_of: null }, select: SEARCH_COLUMNS, orderBy: { id: "asc" } });
  const reruns = await db.searches.findMany({ where: { NOT: { rerun_of: null } }, select: SEARCH_COLUMNS, orderBy: { id: "asc" } });
  const rerunsOf = new Map<number, SearchRow[]>();
  for (const r of reruns) {
    if (r.rerun_of === null) continue;
    const list = rerunsOf.get(r.rerun_of) ?? [];
    list.push(r);
    rerunsOf.set(r.rerun_of, list);
  }

  const header = ["s", "model", "filters", "X", "cards", "runner-up", "scored", "eligible", "run"];
  const widths = [11, 14, 74, 4, 14, 10, 7, 9, 5];
  console.log(header.map((h, i) => pad(h, widths[i])).join("| "));
  console.log(widths.map((w) => "-".repeat(w)).join("+-"));

  let underThree = 0;
  let underEight = 0;
  let withRunnerUp = 0;
  const onARerun: string[] = [];

  for (const question of questions) {
    const run = latestRun(question, rerunsOf.get(question.id) ?? []);
    const rows = await resultsOf(run.id);
    const view = await resultsView(question.public_id, rows);

    const shown = rows.filter((r) => r.rank !== null);
    const scoredRows = shown.filter((r) => r.total_score !== null);
    const eligible = scoredRows.filter((r) => mayWin(r.stage_b_trace));

    const cards = view.cards.length === 0 ? "—" : view.cards.map((c) => c.categories.map((x) => SHORT[x]).join("+")).join(" | ");
    const runnerUp = view.runner_up === null ? "—" : num(view.runner_up.amount);

    if (view.cards.length < 3) underThree += 1;
    if (eligible.length < 8) underEight += 1;
    if (view.runner_up !== null) withRunnerUp += 1;
    if (run.id !== question.id) onARerun.push(`${question.public_id} -> run ${run.id}`);

    const cells = [
      question.public_id,
      run.model_searched,
      shortFilters(storedFilters(question.filters)),
      String(view.cars_shown),
      cards,
      runnerUp,
      String(scoredRows.length),
      String(eligible.length),
      run.id === question.id ? "own" : String(run.id),
    ];
    console.log(cells.map((c, i) => pad(c, widths[i])).join("| "));
  }

  console.log(
    `\nperson-searches: ${questions.length} · with fewer than three cards: ${underThree}` +
      ` · with a recorded runner-up: ${withRunnerUp} · with fewer than 8 eligible cars: ${underEight}`,
  );
  console.log(`displaying a re-run rather than their own run: ${onARerun.length === 0 ? "none" : onARerun.join(" · ")}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exitCode = 1;
});
