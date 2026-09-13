// scripts/oneoff/verify-search-layer.ts — the single read-back of Days 15–16 Run 1 (BRIEF §5).
//
// It proves three things and prints nothing else:
//   1. runSearch() picks the same cars as a FRESH run of scripts/select-three.ts. The script is spawned per
//      model, its own output is parsed, and the two sides are compared category by category — the winner's
//      listing id AND the full set of categories that listing won. Any difference is a FAIL and the exit code
//      is 1. This is the check that the §2 extraction and the §3 action did not move a single verdict.
//   2. filterCounts() answers, for one model, with the whole payload printed as it comes back.
//   3. the `searches` rows this run wrote are read back from the database and printed — including
//      `pool_count` vs `results_count` per model (Run 1d, §2): the cut pool that entered selectThree against
//      the listings that got a rank, each checked against what runSearch returned for the same call.
//
// WHAT IT WRITES: exactly two rows in `searches`, one per runSearch() call — that is what §3.4 makes runSearch
// do, and §5 asks for them to be printed. It writes NOTHING else: no norms, no scores, no listings, no cars.
// There is no --write flag because there is nothing optional to write.
//   The two rows carry an explicit identity (visitor_id 'verify-search-layer') instead of a cookie: there is
//   no request here, and reading a cookie outside a request scope throws. The rows are therefore labelled as
//   what they are, and are easy to delete later.
//
// SIDE EFFECT: spawning scripts/select-three.ts rewrites REPORT-select-three.md, as that script always does.
// The last model run leaves its report behind.
//
// The models (§5): MAZDA 3 with no filters, and IONIQ HYBRID with kmMax = the MIDDLE km anchor once the
// anchors exist. They do not exist until `compute-market-stats --write` runs, so today the IONIQ search runs
// with no filters too — and the script says which of the two it did.

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { db } from "@/lib/db";
import { CATEGORY_PRIORITY, type Category } from "@/lib/selection";
import { filterCounts } from "@/lib/search/counts";
import { runSearch, type SearchView } from "@/lib/search/run";
import type { SearchFilters } from "@/lib/search/filters";
import type { SearchIdentity } from "@/lib/search/visitor";

const MAZDA = "MAZDA 3";
const IONIQ = "IONIQ HYBRID";
const IDENTITY: SearchIdentity = { visitor_id: "verify-search-layer", session_id: `run-${new Date().toISOString()}` };

let failures = 0;
function fail(line: string) {
  failures++;
  console.log(`FAIL  ${line}`);
}
function ok(line: string) {
  console.log(`ok    ${line}`);
}

// ---------- the reference: one fresh run of scripts/select-three.ts ----------
type ScriptPick = { winner: number | null; categories: Category[]; missing: string | null };

// THE THREE prints, per category, either "  no pick: <reason>" or "  winner[ (also a + b)]" followed by
// "  plate P | listing N | ...". Nothing else in the block starts with "  plate ".
function parseSelectThree(stdout: string, model: string): Record<Category, ScriptPick> {
  const lines = stdout.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith("===== THE THREE"));
  if (start < 0) throw new Error(`select-three (${model}): no "THE THREE" section in the output — the run did not get that far`);
  const out = {} as Record<Category, ScriptPick>;
  for (const c of CATEGORY_PRIORITY) {
    const at = lines.findIndex((l, i) => i > start && l.trim() === `--- ${c}`);
    if (at < 0) throw new Error(`select-three (${model}): category ${c} is not in THE THREE`);
    let winner: number | null = null;
    let categories: Category[] = [];
    let missing: string | null = null;
    for (let i = at + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith("---") || l.startsWith("=====")) break;
      const none = /^\s{2}no pick: (.+)$/.exec(l);
      if (none) {
        missing = none[1].trim();
        break;
      }
      const won = /^\s{2}winner(?: \(also (.+)\))?\s*$/.exec(l);
      if (won) categories = [c, ...(won[1] ? (won[1].split(" + ").map((x) => x.trim()) as Category[]) : [])];
      const line = /^\s{2}plate \S+ \| listing (\d+) \|/.exec(l);
      if (line) {
        winner = Number(line[1]);
        break;
      }
    }
    out[c] = { winner, categories, missing };
  }
  return out;
}

function selectThreeReference(model: string): Record<Category, ScriptPick> {
  // shell: true is needed for npx on Windows. The whole command is ONE string (node deprecates passing an
  // args array with shell: true, DEP0190), and the model is quoted inside it: it contains a space, and
  // without the quotes 'MAZDA 3' reaches the script as 'MAZDA'.
  const r = spawnSync(`npx tsx scripts/select-three.ts --model="${model}"`, { encoding: "utf8", shell: true });
  if (r.status !== 0) {
    console.log(r.stdout ?? "");
    console.log(r.stderr ?? "");
    throw new Error(`select-three (${model}) exited ${r.status} — the reference run failed; nothing was compared`);
  }
  return parseSelectThree(r.stdout, model);
}

// ---------- 1. the comparison ----------
function comparePicks(model: string, search: SearchView, reference: Record<Category, ScriptPick>): void {
  console.log(`\n--- ${model}: runSearch picks vs a fresh select-three.ts run`);
  console.log(`    pool ${search.pool_total} -> cut ${search.pool_cut} -> ranked ${search.ranked.length} + tail ${search.tail.length} = ${search.results_count} shown`);
  console.log("category | runSearch winner | select-three winner | runSearch categories | select-three categories");
  for (const c of CATEGORY_PRIORITY) {
    const mine = search.picks[c];
    const theirs = reference[c];
    const mineId = mine === null ? null : mine.listing_id;
    const mineCats = mine === null ? [] : [...mine.categories].sort();
    const theirCats = [...theirs.categories].sort();
    console.log(
      `${c} | ${mineId === null ? `none (${search.missing[c] ?? "-"})` : `${mine?.plate} listing ${mineId}`} | ${theirs.winner === null ? `none (${theirs.missing ?? "-"})` : `listing ${theirs.winner}`} | ${mineCats.join(" + ") || "-"} | ${theirCats.join(" + ") || "-"}`,
    );
    if (mineId !== theirs.winner) fail(`${model} / ${c}: winner ${mineId ?? "none"} (runSearch) vs ${theirs.winner ?? "none"} (select-three)`);
    else if (mineCats.join("+") !== theirCats.join("+")) fail(`${model} / ${c}: categories ${mineCats.join("+") || "-"} vs ${theirCats.join("+") || "-"}`);
    else ok(`${model} / ${c}: ${mineId === null ? "empty on both sides, same reason" : "same winner, same categories"}`);
  }
}

function printSearch(search: SearchView): void {
  const ru = search.runner_up;
  console.log(`    runner-up (cheapest): ${ru === null ? "none recorded" : `${ru.listing.plate} listing ${ru.listing.listing_id}, gap ${ru.gap}, +${ru.price_over_pct}%, triggered ${ru.triggered}, also_won ${ru.also_won.join(" + ") || "-"}`}`);
  console.log(`    blocked_first: ${search.blocked_first.length === 0 ? "none — in every category the counterfactual winner is the actual winner" : search.blocked_first.map((b) => `${b.category}: ${b.plate} listing ${b.listing_id} (rank ${b.rank ?? "-"}, history ${b.history_source ?? "-"})`).join(" · ")}`);
  const labelled = [...search.ranked, ...search.tail].filter((l) => l.labels.length > 0);
  console.log(`    gate labels: ${labelled.length === 0 ? "none" : labelled.map((l) => `${l.plate} [${l.labels.join(", ")}]`).join(" · ")}`);
  console.log(`    tail (${search.tail.length}): ${search.tail.map((l) => `${l.plate} rank ${l.rank} price ${l.price}`).join(" · ") || "empty"}`);
  console.log(`    finish test: ${search.finish_test.pass ? "PASS" : "FAIL"}`);
  for (const c of search.finish_test.checks) console.log(`      ${c.ok ? "ok  " : "FAIL"} ${c.claim}${c.detail ? ` — ${c.detail}` : ""}`);
  if (!search.finish_test.pass) fail(`${search.model}: finish test FAIL`);
}

async function main() {
  console.log(`verify-search-layer — ${new Date().toISOString()}`);
  console.log(`identity written on the searches rows: visitor_id '${IDENTITY.visitor_id}', session_id '${IDENTITY.session_id}'`);

  // the IONIQ filter (§5): the middle km anchor, once the anchors exist
  const ioniqLive = await db.listings.findFirst({
    where: { delisted_at: null, car: { model: { model: IONIQ } } },
    select: { car: { select: { model: { select: { make: true, model: true } } } } },
  });
  if (ioniqLive === null) throw new Error(`no live listing of ${IONIQ} — the read-back has nothing to run`);
  const ioniqStats = await db.model_stats.findFirst({
    where: { make: ioniqLive.car.model.make as string, model: ioniqLive.car.model.model as string },
    orderBy: [{ computed_at: "desc" }, { id: "desc" }],
    select: { id: true, km_filter_anchors: true, computed_at: true },
  });
  const stored = ioniqStats?.km_filter_anchors ?? null;
  const anchors: number[] | null = Array.isArray(stored) ? stored.filter((v): v is number => typeof v === "number") : null;
  const ioniqFilters: SearchFilters = anchors !== null && anchors.length > 0 ? { kmMax: anchors[Math.floor(anchors.length / 2)] } : {};
  console.log(
    `\n===== 0. THE TWO SEARCHES =====\n` +
      `${MAZDA}: no filters\n` +
      `${IONIQ}: ${anchors === null ? `no filters — model_stats row ${ioniqStats?.id ?? "none"} carries no km_filter_anchors yet (the norms --write has not run)` : `kmMax = ${ioniqFilters.kmMax} (the middle of [${anchors.join(", ")}], model_stats row ${ioniqStats?.id})`}`,
  );

  console.log(`\n===== 1. PICKS vs A FRESH select-three.ts RUN =====`);
  const mazdaSearch = await runSearch({ model: MAZDA, identity: IDENTITY });
  comparePicks(MAZDA, mazdaSearch, selectThreeReference(MAZDA));
  printSearch(mazdaSearch);

  const ioniqSearch = await runSearch({ model: IONIQ, filters: Object.keys(ioniqFilters).length ? ioniqFilters : undefined, identity: IDENTITY });
  // With a km ceiling the cut pool is smaller than select-three's, so the picks are not expected to match and
  // the comparison is not run: it would be comparing two different questions. Without one, they must match.
  if (Object.keys(ioniqFilters).length === 0) {
    comparePicks(IONIQ, ioniqSearch, selectThreeReference(IONIQ));
  } else {
    console.log(`\n--- ${IONIQ}: ran with kmMax = ${ioniqFilters.kmMax}, so its pool is a CUT of select-three's — the two are different questions and are not compared.`);
    console.log(`    pool ${ioniqSearch.pool_total} -> cut ${ioniqSearch.pool_cut} -> ${ioniqSearch.results_count} shown`);
    for (const c of CATEGORY_PRIORITY) {
      const p = ioniqSearch.picks[c];
      console.log(`    ${c}: ${p === null ? `none (${ioniqSearch.missing[c] ?? "-"})` : `${p.plate} listing ${p.listing_id}, price ${p.price}, km ${p.km_declared ?? "-"}`}`);
    }
  }
  printSearch(ioniqSearch);

  console.log(`\n===== 2. filterCounts (${MAZDA}, empty draft) =====`);
  const counts = await filterCounts({ model: MAZDA });
  console.log(`model ${counts.model} (key ${counts.model_key}) | pool_total ${counts.pool_total} | pool_now ${counts.pool_now}  <- the "עדכן · N" number`);
  console.log(`years (with stock): ${counts.years.map((y) => `${y.year}: ${y.count} ${y.direction}${y.selected ? " [selected]" : ""}`).join(" · ")}`);
  console.log(`km: available ${counts.km.available}${counts.km.note ? ` — ${counts.km.note}` : ""}`);
  if (counts.km.chips.length) console.log(`  chips: ${counts.km.chips.map((k) => `<= ${k.km_max}: ${k.count} ${k.direction}${k.selected ? " [selected]" : ""}`).join(" · ")}`);
  console.log(`regions: ${counts.regions.map((r) => `${r.region}: ${r.count} ${r.direction}${r.selected ? " [selected]" : ""}`).join(" · ") || "none in the pool"}`);
  console.log(`price: min ${counts.price.min ?? "-"} max ${counts.price.max ?? "-"} | toggled count ${counts.price.count} ${counts.price.direction} | in_range ${counts.price.in_range}`);
  if (counts.pool_total !== mazdaSearch.pool_total) fail(`filterCounts pool_total ${counts.pool_total} != runSearch pool_total ${mazdaSearch.pool_total} — the two disagree about the model's pool`);
  else ok(`filterCounts and runSearch agree on the ${MAZDA} pool: ${counts.pool_total}`);
  if (counts.pool_now !== mazdaSearch.pool_cut) fail(`filterCounts pool_now ${counts.pool_now} != runSearch pool_cut ${mazdaSearch.pool_cut} on the same (empty) draft`);
  else ok(`filterCounts pool_now = runSearch pool_cut on the empty draft: ${counts.pool_now}`);

  console.log(`\n===== 3. THE searches ROWS THIS RUN WROTE =====`);
  const written = await db.searches.findMany({ where: { session_id: IDENTITY.session_id }, orderBy: { id: "asc" } });
  console.log(`rows: ${written.length} (expected 2 — one per runSearch call)`);
  console.log("id | created_at | model_searched | filters | engine_version | rules_version | pool_count | results_count | visitor_id | session_id | user_id | priority");
  for (const r of written) {
    console.log(
      `${r.id} | ${r.created_at.toISOString()} | ${r.model_searched} | ${r.filters === null ? "null" : JSON.stringify(r.filters)} | ${r.engine_version} | ${r.rules_version} | ${r.pool_count ?? "null"} | ${r.results_count} | ${r.visitor_id} | ${r.session_id} | ${r.user_id ?? "null"} | ${r.priority ?? "null"}`,
    );
  }

  // Run 1d (§2): pool_count vs results_count per model. pool_count is the cut pool — what entered selectThree,
  // the "עדכן" number; results_count is what got a rank (ranked + tail). The gap is the listings the gate and
  // the listing rules took out (sold strong, duplicate in a plate, below_threshold, above_new_price,
  // dealer_not_visible), so pool_count >= results_count always, and the row must agree with what runSearch
  // returned for the very same call.
  console.log(`\n--- pool_count vs results_count, per model`);
  console.log("model | pool_count | results_count | not shown | searches row");
  for (const search of [mazdaSearch, ioniqSearch]) {
    const r = written.find((w) => w.id === search.search_id);
    if (r === undefined) {
      fail(`${search.model}: searches row ${search.search_id} is not among the rows this run wrote — nothing to compare`);
      continue;
    }
    console.log(`${search.model} | ${r.pool_count ?? "null"} | ${r.results_count} | ${search.pool_cut - search.results_count} | row ${r.id}`);
    if (r.pool_count !== search.pool_cut) fail(`${search.model}: searches.pool_count ${r.pool_count ?? "null"} != the cut pool runSearch reported (${search.pool_cut})`);
    else if (r.results_count !== search.results_count) fail(`${search.model}: searches.results_count ${r.results_count} != the ranked+tail runSearch reported (${search.results_count})`);
    else if (r.pool_count < r.results_count) fail(`${search.model}: pool_count ${r.pool_count} < results_count ${r.results_count} — the cut pool cannot be smaller than what got a rank`);
    else ok(`${search.model}: pool_count ${r.pool_count} = the cut pool, results_count ${r.results_count} = ranked ${search.ranked.length} + tail ${search.tail.length}`);
  }
  if (written.length !== 2) fail(`expected 2 searches rows, found ${written.length}`);
  else ok("2 searches rows, one per runSearch call");
  const ids = [mazdaSearch.search_id, ioniqSearch.search_id];
  if (written.map((r) => r.id).join(",") !== ids.join(",")) fail(`the ids runSearch returned (${ids.join(", ")}) are not the rows found (${written.map((r) => r.id).join(", ")})`);
  else ok(`the ids runSearch returned are the rows in the table: ${ids.join(", ")}`);

  console.log(`\n===== VERDICT =====`);
  console.log(failures === 0 ? "PASS — every check above is ok" : `FAIL — ${failures} check(s) failed; see the FAIL lines above`);
  if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
