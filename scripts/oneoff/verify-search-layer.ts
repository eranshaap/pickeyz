// scripts/oneoff/verify-search-layer.ts — the single read-back of Days 15–16 (BRIEF Run 1 §5, Run 2b §7.2,
// Run 2c §9–§10).
//
// It proves, and prints, six things and nothing else:
//   1. runSearch() picks the same cars as a FRESH run of scripts/select-three.ts. The script is spawned per
//      model, its own output is parsed, and the two sides are compared category by category — the winner's
//      listing id AND the full set of categories that listing won. Any difference is a FAIL and the exit code
//      is 1. This is the check that the §2 extraction and the §3 action did not move a single verdict.
//   2. filterCounts() under FOUR drafts, with the Run 2c §12 rule asserted on the numbers it returns.
//   3. the `searches` rows this run wrote, read back — including `pool_count` vs `results_count` per model.
//   4. the `search_results` rows: the Run 2b invariants, plus Run 2c's trace rule and invoice pointer.
//   5. the relief case, measured through the same counters the action measures it through.
//   6. §9's read-only probe over the `models` catalog — input for the catalog-wide completion decision, which
//      is NOT implemented in this run. It writes nothing and asserts nothing; it prints tables.
//
// WHAT IT WRITES: exactly two rows in `searches`, one per runSearch() call — that is what §3.4 makes runSearch
// do, and §5 asks for them to be printed — and their `search_results` rows. It writes NOTHING else: no norms,
// no scores, no listings, no cars. There is no --write flag because there is nothing optional to write.
//   The two rows carry an explicit identity (visitor_id 'verify-search-layer') instead of a cookie: there is
//   no request here, and reading a cookie outside a request scope throws. The rows are therefore labelled as
//   what they are, and are easy to delete later.
//
// SIDE EFFECT: spawning scripts/select-three.ts rewrites REPORT-select-three.md, as that script always does.
// The last model run leaves its report behind.
//
// The models (§10.2): MAZDA 3 with no filters — 78 / 78 / 75, the fixed point of this read-back — and
// IONIQ HYBRID with kmMax 120,000, the middle km anchor: 176 -> 94 / 94 / 93. Both are asserted, not eyeballed.
//
// RUN 2c, WHAT IS NEW HERE:
//   §4  every RECOMMENDED row's trace now carries at least one non-triggered record, whatever its rank —
//       listing 192 sat at rank 11 and read `trace 0` in Run 2b, and that is the finding this asserts is gone.
//   §5  `listing_scores_id` is non-null wherever the row carries a score or a confidence, and THROUGH that
//       pointer `listing_scores.breakdown` deep-equals `listings.score_breakdown`. The invoice is no longer
//       copied into the row, so this is what proves the pointer resolves to the same invoice the copy held.
//   §12 the counters changed meaning by design, so Run 1's byte-identical check is gone. What replaces it is
//       the rule itself: a group's numbers do not move when a chip inside it is tapped, and a chip's number is
//       the cut pool of the draft with that group replaced by that one option.

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { db } from "@/lib/db";
import { CATEGORY_PRIORITY, type Category } from "@/lib/selection";
import { filterCounts } from "@/lib/search/counts";
import { runSearch, type SearchView } from "@/lib/search/run";
import type { SearchFilters } from "@/lib/search/filters";
import { TRACE_FULL_RANK } from "@/lib/search/results";
import type { SearchIdentity } from "@/lib/search/visitor";

const MAZDA = "MAZDA 3";
const IONIQ = "IONIQ HYBRID";
// §10.2 — the two legs are the fixed points of this read-back. A change here is a real change in the data or
// in the library, not a new expectation.
const MAZDA_POOL = 78;
const MAZDA_RESULTS = 75;
const IONIQ_TOTAL = 176;
const IONIQ_CUT = 94;
const IONIQ_RESULTS = 93;
const IONIQ_KM = 120000; // the middle anchor of [100000, 120000, 150000]
// §10.2 names the picks as a LIST of listing ids per leg, not as a category map — `22, 59, 19` and
// `150, 100, 192`. The set is what is asserted; the per-category assignment is printed above, because on the
// IONIQ leg the brief's order is not the category order (REPORT.md carries it as a finding).
const EXPECTED_PICKS: Record<string, number[]> = {
  [MAZDA]: [22, 59, 19],
  [IONIQ]: [150, 100, 192],
};
// §12 — the numbers read off the phone screenshot of 13/09. Printed BESIDE the computed ones; a difference is
// a finding for the report, not something to fix here.
const PHONE_YEARS_2020: Record<number, number> = { 2020: 61, 2021: 82, 2022: 33 };
const PHONE_KM_2020: Record<number, number> = { 100000: 11, 120000: 25, 150000: 47 };
const PHONE_REGIONS_2020: Record<string, number> = { אילת: 0, דרום: 10, "חיפה והקריות": 9 };
// §10.2 — the relief case: MAZDA 3 {years:[2021], priceMax:20000}, releasing the price brings 29 back.
const RELIEF_DRAFT: SearchFilters = { years: [2021], priceMax: 20000 };
const RELIEF_COUNT = 29;
// §9 — the five makes the probe prints in full, matched on the STORED spelling.
const PROBE_MAKES = ["מזדה", "יונדאי", "קיה", "טויוטה", "סקודה"];
const PROBE_YEAR_FROM = 2015;

const IDENTITY: SearchIdentity = { visitor_id: "verify-search-layer", session_id: `run-${new Date().toISOString()}` };

let failures = 0;
function fail(line: string) {
  failures++;
  console.log(`FAIL  ${line}`);
}
function ok(line: string) {
  console.log(`ok    ${line}`);
}
function check(cond: boolean, okLine: string, failLine: string) {
  if (cond) ok(okLine);
  else fail(failLine);
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

// §10.2 — the picks are named, not merely compared against a second run of the same library. The three
// distinct picked listings must be the three the brief names; which category each won is printed beside it.
function assertExpectedPicks(model: string, search: SearchView): void {
  const want = [...EXPECTED_PICKS[model]].sort((a, b) => a - b);
  const got = [...new Set(CATEGORY_PRIORITY.map((c) => search.picks[c]?.listing_id ?? null).filter((v): v is number => v !== null))].sort((a, b) => a - b);
  const byCategory = CATEGORY_PRIORITY.map((c) => `${c} ${search.picks[c]?.listing_id ?? "none"}`).join(" · ");
  check(
    got.join(",") === want.join(","),
    `${model}: the picked listings are ${got.join(", ")} — the three §10.2 names (${byCategory})`,
    `${model}: the picked listings are ${got.join(", ") || "none"}, §10.2 names ${want.join(", ")} (${byCategory})`,
  );
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

// ---------- 2. the counters (§12) ----------
type Counts = Awaited<ReturnType<typeof filterCounts>>;

function printCounts(title: string, c: Counts): void {
  console.log(`\n--- ${title}`);
  console.log(`model ${c.model} (key ${c.model_key}) | pool_total ${c.pool_total} | pool_now ${c.pool_now}  <- the "עדכן · N" number`);
  console.log(`years:   ${c.years.map((y) => `${y.year}: ${y.count}${y.selected ? " [selected]" : ""}`).join(" · ") || "none"}`);
  console.log(`km:      available ${c.km.available}${c.km.note ? ` — ${c.km.note}` : ""}`);
  if (c.km.chips.length) console.log(`         ${c.km.chips.map((k) => `<= ${k.km_max}: ${k.count}${k.selected ? " [selected]" : ""}`).join(" · ")}`);
  console.log(`regions: ${c.regions.map((r) => `${r.region}: ${r.count}${r.selected ? " [selected]" : ""}`).join(" · ") || "none in the pool"}`);
  console.log(`price:   no number of its own (§12) — the payload carries none`);
}

async function main() {
  console.log(`verify-search-layer — ${new Date().toISOString()}`);
  console.log(`identity written on the searches rows: visitor_id '${IDENTITY.visitor_id}', session_id '${IDENTITY.session_id}'`);

  // the IONIQ filter (§10.2): the middle km anchor, which must be 120,000
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
  if (anchors === null || anchors.length === 0) {
    throw new Error(`${IONIQ}: model_stats row ${ioniqStats?.id ?? "none"} carries no km_filter_anchors — §10.2's leg cannot be run`);
  }
  const ioniqFilters: SearchFilters = { kmMax: anchors[Math.floor(anchors.length / 2)] };
  console.log(
    `\n===== 0. THE TWO SEARCHES =====\n` +
      `${MAZDA}: no filters\n` +
      `${IONIQ}: kmMax = ${ioniqFilters.kmMax} (the middle of [${anchors.join(", ")}], model_stats row ${ioniqStats?.id})`,
  );
  check(ioniqFilters.kmMax === IONIQ_KM, `${IONIQ}: the middle anchor is ${IONIQ_KM}, as §10.2 expects`, `${IONIQ}: the middle anchor is ${ioniqFilters.kmMax}, §10.2 expects ${IONIQ_KM}`);

  console.log(`\n===== 1. PICKS vs A FRESH select-three.ts RUN =====`);
  const mazdaSearch = await runSearch({ model: MAZDA, identity: IDENTITY });
  comparePicks(MAZDA, mazdaSearch, selectThreeReference(MAZDA));
  assertExpectedPicks(MAZDA, mazdaSearch);
  printSearch(mazdaSearch);

  const ioniqSearch = await runSearch({ model: IONIQ, filters: ioniqFilters, identity: IDENTITY });
  // With a km ceiling the cut pool is smaller than select-three's, so the picks are not expected to match and
  // the comparison is not run: it would be comparing two different questions. The named picks are asserted.
  console.log(`\n--- ${IONIQ}: ran with kmMax = ${ioniqFilters.kmMax}, so its pool is a CUT of select-three's — the two are different questions and are not compared.`);
  console.log(`    pool ${ioniqSearch.pool_total} -> cut ${ioniqSearch.pool_cut} -> ${ioniqSearch.results_count} shown`);
  for (const c of CATEGORY_PRIORITY) {
    const p = ioniqSearch.picks[c];
    console.log(`    ${c}: ${p === null ? `none (${ioniqSearch.missing[c] ?? "-"})` : `${p.plate} listing ${p.listing_id}, price ${p.price}, km ${p.km_declared ?? "-"}`}`);
  }
  assertExpectedPicks(IONIQ, ioniqSearch);
  printSearch(ioniqSearch);

  check(
    mazdaSearch.pool_total === MAZDA_POOL && mazdaSearch.pool_cut === MAZDA_POOL && mazdaSearch.results_count === MAZDA_RESULTS,
    `${MAZDA}: ${MAZDA_POOL} / ${MAZDA_POOL} / ${MAZDA_RESULTS}, as Run 2b`,
    `${MAZDA}: ${mazdaSearch.pool_total} / ${mazdaSearch.pool_cut} / ${mazdaSearch.results_count} — §10.2 expects ${MAZDA_POOL} / ${MAZDA_POOL} / ${MAZDA_RESULTS}`,
  );
  check(
    ioniqSearch.pool_total === IONIQ_TOTAL && ioniqSearch.pool_cut === IONIQ_CUT && ioniqSearch.results_count === IONIQ_RESULTS,
    `${IONIQ}: ${IONIQ_TOTAL} -> ${IONIQ_CUT} / ${IONIQ_RESULTS}, as Run 2b`,
    `${IONIQ}: ${ioniqSearch.pool_total} -> ${ioniqSearch.pool_cut} / ${ioniqSearch.results_count} — §10.2 expects ${IONIQ_TOTAL} -> ${IONIQ_CUT} / ${IONIQ_RESULTS}`,
  );

  // ---------- 2. the counters, Run 2c §12 ----------
  console.log(`\n===== 2. filterCounts — THE FOUR DRAFTS (§12) =====`);
  const mazdaEmpty = await filterCounts({ model: MAZDA });
  const ioniqEmpty = await filterCounts({ model: IONIQ });
  const ioniq2020 = await filterCounts({ model: IONIQ, draft: { years: [2020] } });
  const ioniq2020km = await filterCounts({ model: IONIQ, draft: { years: [2020], kmMax: 100000 } });
  printCounts(`${MAZDA}, empty draft`, mazdaEmpty);
  printCounts(`${IONIQ}, empty draft`, ioniqEmpty);
  printCounts(`${IONIQ}, draft {years:[2020]}`, ioniq2020);
  printCounts(`${IONIQ}, draft {years:[2020], kmMax:100000}`, ioniq2020km);

  console.log(`\n--- §12's rule, asserted`);
  for (const [name, c, pool] of [
    [MAZDA, mazdaEmpty, MAZDA_POOL],
    [IONIQ, ioniqEmpty, IONIQ_TOTAL],
  ] as const) {
    const yearSum = c.years.reduce((n, y) => n + y.count, 0);
    check(yearSum === pool, `${name}, empty draft: the year counts sum to the pool (${yearSum})`, `${name}, empty draft: the year counts sum to ${yearSum}, the pool is ${pool} — with no other group active the years partition it`);
    const regionSum = c.regions.reduce((n, r) => n + r.count, 0);
    check(regionSum <= c.pool_total, `${name}, empty draft: the region counts sum to ${regionSum} <= the pool ${c.pool_total} (a null region is in no chip)`, `${name}, empty draft: the region counts sum to ${regionSum}, above the pool ${c.pool_total}`);
    const km = c.km.chips;
    const rising = km.every((k, i) => i === 0 || k.count >= km[i - 1].count);
    check(rising, `${name}, empty draft: the km counts never fall as the ceiling rises (${km.map((k) => k.count).join(" <= ")})`, `${name}, empty draft: the km counts fall with a rising ceiling — ${km.map((k) => `${k.km_max}:${k.count}`).join(" · ")}`);
  }

  // the year counts do not move when a year chip is tapped — the whole of §12
  const emptyYears = new Map(ioniqEmpty.years.map((y) => [y.year, y.count]));
  const draftYears = new Map(ioniq2020.years.map((y) => [y.year, y.count]));
  const yearsUnchanged = [...emptyYears].every(([y, n]) => draftYears.get(y) === n) && emptyYears.size === draftYears.size;
  check(
    yearsUnchanged,
    `${IONIQ}: the year counts under {years:[2020]} are the empty draft's, chip for chip (${ioniq2020.years.map((y) => `${y.year}:${y.count}`).join(" · ")})`,
    `${IONIQ}: the year counts moved when a year was tapped — empty ${[...emptyYears].map(([y, n]) => `${y}:${n}`).join(" · ")} vs {years:[2020]} ${[...draftYears].map(([y, n]) => `${y}:${n}`).join(" · ")}`,
  );

  // the three spot checks: a chip's number IS the cut pool of the draft with that group replaced by it
  console.log(`\n--- the spot checks: a chip's count = the cut pool of {years:[2020], <the chip alone>}`);
  console.log("chip | counter | the cut pool of the composed draft | 13/09 phone");
  for (const chip of ioniq2020.km.chips) {
    const composed = (await filterCounts({ model: IONIQ, draft: { years: [2020], kmMax: chip.km_max } })).pool_now;
    const phone = PHONE_KM_2020[chip.km_max];
    console.log(`km <= ${chip.km_max} | ${chip.count} | ${composed} | ${phone ?? "-"}`);
    check(chip.count === composed, `${IONIQ} {years:[2020]} km <= ${chip.km_max}: the counter is the composed cut pool (${composed})`, `${IONIQ} {years:[2020]} km <= ${chip.km_max}: counter ${chip.count} vs composed cut pool ${composed}`);
  }
  for (const chip of ioniq2020.regions) {
    const composed = (await filterCounts({ model: IONIQ, draft: { years: [2020], regions: [chip.region] } })).pool_now;
    const phone = PHONE_REGIONS_2020[chip.region];
    console.log(`region ${chip.region} | ${chip.count} | ${composed} | ${phone ?? "-"}`);
    check(chip.count === composed, `${IONIQ} {years:[2020]} region ${chip.region}: the counter is the composed cut pool (${composed})`, `${IONIQ} {years:[2020]} region ${chip.region}: counter ${chip.count} vs composed cut pool ${composed}`);
  }

  // §12 — the 13/09 phone numbers beside the computed ones. A difference is a FINDING FOR THE REPORT, printed
  // and never asserted: the phone was a different database state and the brief says not to force it.
  console.log(`\n--- the 13/09 phone screenshot beside today's numbers (${IONIQ}, draft {years:[2020]}) — a difference is a finding, not a failure`);
  console.log("group | option | phone 13/09 | computed now | same");
  for (const [year, phone] of Object.entries(PHONE_YEARS_2020)) {
    const got = draftYears.get(Number(year)) ?? null;
    console.log(`years | ${year} | ${phone} | ${got ?? "-"} | ${got === phone ? "yes" : "NO"}`);
  }
  for (const [max, phone] of Object.entries(PHONE_KM_2020)) {
    const got = ioniq2020.km.chips.find((k) => k.km_max === Number(max))?.count ?? null;
    console.log(`km | <= ${max} | ${phone} | ${got ?? "-"} | ${got === phone ? "yes" : "NO"}`);
  }
  for (const [region, phone] of Object.entries(PHONE_REGIONS_2020)) {
    const got = ioniq2020.regions.find((r) => r.region === region)?.count ?? null;
    console.log(`regions | ${region} | ${phone} | ${got ?? "-"} | ${got === phone ? "yes" : "NO"}`);
  }

  // the counters and the search must agree about the same question
  check(mazdaEmpty.pool_total === mazdaSearch.pool_total, `filterCounts and runSearch agree on the ${MAZDA} pool: ${mazdaEmpty.pool_total}`, `filterCounts pool_total ${mazdaEmpty.pool_total} != runSearch pool_total ${mazdaSearch.pool_total}`);
  check(mazdaEmpty.pool_now === mazdaSearch.pool_cut, `filterCounts pool_now = runSearch pool_cut on the empty draft: ${mazdaEmpty.pool_now}`, `filterCounts pool_now ${mazdaEmpty.pool_now} != runSearch pool_cut ${mazdaSearch.pool_cut} on the same (empty) draft`);
  const ioniqKmDraft = await filterCounts({ model: IONIQ, draft: ioniqFilters });
  check(ioniqKmDraft.pool_now === ioniqSearch.pool_cut, `${IONIQ}: the "עדכן" number under kmMax ${IONIQ_KM} is the search's cut pool (${ioniqKmDraft.pool_now})`, `${IONIQ}: filterCounts pool_now ${ioniqKmDraft.pool_now} != runSearch pool_cut ${ioniqSearch.pool_cut}`);

  // §10.2 — the relief case, measured through the counters the action measures it through: each ACTIVE filter
  // removed in turn, the largest returning pool wins, ties by the display order (מחיר, שנתון, ק"מ, אזור).
  console.log(`\n--- the relief case: ${MAZDA} {years:[2021], priceMax:20000}`);
  const reliefNow = await filterCounts({ model: MAZDA, draft: RELIEF_DRAFT });
  const withoutPrice = (await filterCounts({ model: MAZDA, draft: { years: RELIEF_DRAFT.years } })).pool_now;
  const withoutYears = (await filterCounts({ model: MAZDA, draft: { priceMax: RELIEF_DRAFT.priceMax } })).pool_now;
  console.log(`draft pool ${reliefNow.pool_now} | without price ${withoutPrice} | without years ${withoutYears}`);
  check(reliefNow.pool_now === 0, `the relief draft leaves nothing (${reliefNow.pool_now}) — which is when the suggestion is computed at all`, `the relief draft leaves ${reliefNow.pool_now}, not 0 — the suggestion would never be computed`);
  check(
    withoutPrice === RELIEF_COUNT && withoutPrice >= withoutYears,
    `relief: "הסרת מחיר תחזיר ${withoutPrice} רכבים" — price is the largest single release`,
    `relief: without price ${withoutPrice} (expected ${RELIEF_COUNT}), without years ${withoutYears} — the suggestion is not "מחיר ${RELIEF_COUNT}"`,
  );

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

  // Day 15 Run 2b (§7.2) and Run 2c (§4–§5): the rows runSearch wrote beside each of those two searches.
  // Everything below is read back OUT OF THE DATABASE — the point is what landed, not what the caller was
  // handed.
  console.log(`\n===== 4. THE search_results ROWS THIS RUN WROTE (§4–§5) =====`);
  console.log("search | model | pool_count | rows | ranked rows | results_count | recommended rows | best_value rank | ranks 1..N");
  let invoiceChecked = 0;
  let invoiceMismatch = 0;
  for (const search of [mazdaSearch, ioniqSearch]) {
    const rows = await db.search_results.findMany({
      where: { search_id: search.search_id },
      orderBy: { id: "asc" },
      select: {
        listing_id: true,
        rank: true,
        total_score: true,
        confidence: true,
        recommendation_categories: true,
        price_snapshot: true,
        km_snapshot: true,
        market_stats_id: true,
        model_stats_id: true,
        pool_stats_id: true,
        new_car_price_id: true,
        listing_scores_id: true,
        stage_b_trace: true,
      },
    });
    const ranked = rows.filter((r) => r.rank !== null).map((r) => r.rank as number).sort((a, b) => a - b);
    const contiguous = ranked.every((v, i) => v === i + 1);
    const recommended = rows.filter((r) => r.recommendation_categories.length > 0).map((r) => r.listing_id).sort((a, b) => a - b);
    const picked = [...new Set(Object.values(search.picks).filter((p): p is NonNullable<typeof p> => p !== null).map((p) => p.listing_id))].sort((a, b) => a - b);
    const bestValue = search.picks.best_value;
    const bestValueRank = bestValue === null ? null : (rows.find((r) => r.listing_id === bestValue.listing_id)?.rank ?? null);
    console.log(
      `${search.search_id} | ${search.model} | ${search.pool_cut} | ${rows.length} | ${ranked.length} | ${search.results_count} | ${recommended.length} | ${bestValueRank ?? "-"} | ${contiguous ? "yes" : "NO"}`,
    );

    if (rows.length !== search.pool_cut) fail(`${search.model}: ${rows.length} search_results row(s) for a cut pool of ${search.pool_cut} — §4 wants one row per listing of the cut pool`);
    else ok(`${search.model}: ${rows.length} rows = pool_count`);
    if (ranked.length !== search.results_count) fail(`${search.model}: ${ranked.length} row(s) with a rank vs results_count ${search.results_count}`);
    else ok(`${search.model}: ${ranked.length} rows with a rank = results_count`);
    if (!contiguous) fail(`${search.model}: the ranks are not 1..${ranked.length} contiguous — ${ranked.join(", ")}`);
    else ok(`${search.model}: the ranks are 1..${ranked.length}, contiguous`);
    if (recommended.join(",") !== picked.join(",")) fail(`${search.model}: recommended rows ${recommended.join(", ") || "none"} vs the picked listings ${picked.join(", ") || "none"}`);
    else ok(`${search.model}: the recommended rows are exactly the ${picked.length} distinct picked listing(s)`);
    if (bestValue !== null && bestValueRank !== 1) fail(`${search.model}: the best_value winner (listing ${bestValue.listing_id}) has rank ${bestValueRank ?? "null"}, not 1`);
    else if (bestValue !== null) ok(`${search.model}: the best_value winner is rank 1`);

    // the snapshot columns, on the picked rows — the numbers a later reader would reconstruct the answer from
    const traceOf = (v: unknown): { length: number; untriggered: number } | null =>
      Array.isArray(v) ? { length: v.length, untriggered: (v as { triggered?: boolean }[]).filter((t) => t.triggered !== true).length } : null;
    for (const id of picked) {
      const r = rows.find((x) => x.listing_id === id);
      if (r === undefined) {
        fail(`${search.model}: picked listing ${id} has no search_results row`);
        continue;
      }
      const t = traceOf(r.stage_b_trace);
      console.log(
        `    listing ${id} | rank ${r.rank ?? "-"} | ${r.recommendation_categories.join(" + ")} | score ${r.total_score ?? "null"} | confidence ${r.confidence ?? "null"} | price ${r.price_snapshot} | km ${r.km_snapshot ?? "null"} | norms ${r.market_stats_id ?? "-"}/${r.model_stats_id ?? "-"}/${r.pool_stats_id ?? "-"} | new_car_price ${r.new_car_price_id ?? "-"} | listing_scores ${r.listing_scores_id ?? "-"} | trace ${t === null ? "NOT AN ARRAY" : `${t.length} record(s), ${t.untriggered} untriggered`}`,
      );
      if (t === null) fail(`${search.model}: picked listing ${id} has a non-array stage_b_trace`);
    }

    // Run 2c §4 — a recommended row carries the FULL record set whatever its rank. The proof that it is full
    // and not the triggered subset: it holds at least one record that did NOT trigger. This is the Run 2b
    // finding (listing 192, rank 11, `trace 0`) turned into an assertion.
    for (const r of rows.filter((x) => x.recommendation_categories.length > 0)) {
      const t = traceOf(r.stage_b_trace);
      if (t === null) continue; // already failed above
      check(
        t.untriggered > 0,
        `${search.model}: recommended listing ${r.listing_id} (rank ${r.rank ?? "-"}) carries ${t.length} record(s), ${t.untriggered} of them untriggered — the full set`,
        `${search.model}: recommended listing ${r.listing_id} (rank ${r.rank ?? "-"}) carries ${t.length} record(s) and NONE untriggered — its trace was truncated to the triggered ones`,
      );
    }

    // Run 2c §5 — the invoice pointer. A row that carries a score or a confidence was scored, so it must point
    // at the listing_scores row that carried them.
    const scoredRows = rows.filter((r) => r.total_score !== null || r.confidence !== null);
    const pointerless = scoredRows.filter((r) => r.listing_scores_id === null);
    check(
      pointerless.length === 0,
      `${search.model}: all ${scoredRows.length} row(s) with a score or a confidence carry a listing_scores_id`,
      `${search.model}: ${pointerless.length} row(s) with a score or a confidence carry no listing_scores_id — listings ${pointerless.map((r) => r.listing_id).join(", ")}`,
    );

    // …and the pointer resolves to the same invoice the copy used to hold: listing_scores.breakdown deep-equals
    // listings.score_breakdown, for every row of the leg.
    const withPointer = rows.filter((r) => r.listing_scores_id !== null);
    const scores = await db.listing_scores.findMany({ where: { id: { in: withPointer.map((r) => r.listing_scores_id as number) } }, select: { id: true, listing_id: true, breakdown: true } });
    const scoreById = new Map(scores.map((s) => [s.id, s]));
    const listings = await db.listings.findMany({ where: { id: { in: withPointer.map((r) => r.listing_id) } }, select: { id: true, score_breakdown: true } });
    const breakdownOf = new Map(listings.map((l) => [l.id, l.score_breakdown]));
    let legMismatch = 0;
    for (const r of withPointer) {
      const s = scoreById.get(r.listing_scores_id as number);
      if (s === undefined) {
        fail(`${search.model}: listing ${r.listing_id} points at listing_scores ${r.listing_scores_id}, which does not exist`);
        continue;
      }
      if (s.listing_id !== r.listing_id) {
        fail(`${search.model}: listing ${r.listing_id} points at listing_scores ${s.id}, which belongs to listing ${s.listing_id}`);
        continue;
      }
      invoiceChecked++;
      if (!isDeepStrictEqual(s.breakdown, breakdownOf.get(r.listing_id) ?? null)) {
        legMismatch++;
        invoiceMismatch++;
        if (legMismatch <= 3) fail(`${search.model}: listing ${r.listing_id} — listing_scores ${s.id}.breakdown differs from listings.score_breakdown`);
      }
    }
    check(
      legMismatch === 0,
      `${search.model}: through the pointer, listing_scores.breakdown = listings.score_breakdown on all ${withPointer.length} pointed row(s)`,
      `${search.model}: ${legMismatch} of ${withPointer.length} pointed row(s) resolve to a different invoice`,
    );

    // §4 — the trace sizes, printed rather than eyeballed. A recommended row is now in the "full" bucket
    // whatever its rank, so the two buckets are named by the rule and not by the rank alone.
    const full = rows.filter((r) => r.rank !== null && (r.rank <= TRACE_FULL_RANK || r.recommendation_categories.length > 0));
    const shallow = rows.filter((r) => r.rank !== null && r.rank > TRACE_FULL_RANK && r.recommendation_categories.length === 0);
    const unranked = rows.filter((r) => r.rank === null);
    const len = (v: unknown): number => (Array.isArray(v) ? v.length : -1);
    console.log(
      `    trace size (§4): full ${full.length} row(s), ${full.map((r) => len(r.stage_b_trace)).join("/") || "-"} records | triggered-only ${shallow.length} row(s), min ${Math.min(...shallow.map((r) => len(r.stage_b_trace)), Infinity)} max ${Math.max(...shallow.map((r) => len(r.stage_b_trace)), -Infinity)} | rank null ${unranked.length} row(s), ${unranked.map((r) => len(r.stage_b_trace)).join("/") || "-"}`,
    );
    if (rows.some((r) => len(r.stage_b_trace) < 0)) fail(`${search.model}: a stage_b_trace is not an array`);
    if (unranked.some((r) => len(r.stage_b_trace) === 0)) fail(`${search.model}: a row with rank null has an empty trace — the reason it lost its rank is unrecorded`);
  }
  ok(`the invoice pointer was resolved on ${invoiceChecked} row(s) over the two legs; ${invoiceMismatch} mismatch(es) — expected 0`);

  const totalRows = await db.search_results.count({ where: { search_id: { in: [mazdaSearch.search_id, ioniqSearch.search_id] } } });
  const expectedRows = mazdaSearch.pool_cut + ioniqSearch.pool_cut;
  if (totalRows !== expectedRows) fail(`${totalRows} search_results rows over the two searches, expected ${expectedRows}`);
  else ok(`${totalRows} search_results rows over the two searches = ${mazdaSearch.pool_cut} + ${ioniqSearch.pool_cut}`);

  await catalogProbe();

  console.log(`\n===== VERDICT =====`);
  console.log(failures === 0 ? "PASS — every check above is ok" : `FAIL — ${failures} check(s) failed; see the FAIL lines above`);
  if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

// ---------- 5. §9 — the catalog's model list (READ-ONLY, no assertion) ----------
//
// Input for the decision on catalog-wide completion, which is NOT implemented in this run. It reads `models`
// and `listings` and writes nothing. Nothing here fails the run: the numbers are the point.
async function catalogProbe(): Promise<void> {
  console.log(`\n===== 5. §9 — THE CATALOG'S MODEL LIST (read-only probe) =====`);

  const rows = await db.models.findMany({ select: { make: true, model: true, year: true } });
  const nullMake = rows.filter((r) => r.make === null).length;
  const nullModel = rows.filter((r) => r.model === null).length;
  const named = rows.filter((r): r is { make: string; model: string; year: number | null } => r.make !== null && r.model !== null);

  const pairKey = (make: string, model: string) => `${make} ${model}`;
  const allPairs = new Set(named.map((r) => pairKey(r.make, r.model)));
  const recentPairs = new Set(named.filter((r) => r.year !== null && r.year >= PROBE_YEAR_FROM).map((r) => pairKey(r.make, r.model)));
  const makes = new Set(named.map((r) => r.make));

  console.log(`\n--- totals`);
  console.log("measure | count");
  console.log(`rows in models | ${rows.length}`);
  console.log(`rows with a null make | ${nullMake}`);
  console.log(`rows with a null model | ${nullModel}`);
  console.log(`distinct (make, model) pairs, all years | ${allPairs.size}`);
  console.log(`distinct (make, model) pairs, year >= ${PROBE_YEAR_FROM} | ${recentPairs.size}`);
  console.log(`distinct makes | ${makes.size}`);

  const perMake = new Map<string, Set<string>>();
  for (const r of named) {
    const set = perMake.get(r.make) ?? new Set<string>();
    set.add(r.model);
    perMake.set(r.make, set);
  }
  const byPairs = [...perMake.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
  console.log(`\n--- pairs per make, top 20 of ${byPairs.length}`);
  console.log("make | pairs");
  for (const [make, set] of byPairs.slice(0, 20)) console.log(`${make} | ${set.size}`);

  // near-duplicates: same make, model values that coincide once lowercased and stripped of everything that is
  // not a letter or a digit (spaces, hyphens, punctuation)
  const strip = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const groups = new Map<string, Set<string>>();
  for (const [make, set] of perMake) {
    for (const model of set) {
      const k = `${make} ${strip(model)}`;
      const g = groups.get(k) ?? new Set<string>();
      g.add(model);
      groups.set(k, g);
    }
  }
  const near = [...groups.entries()].filter(([, g]) => g.size > 1);
  console.log(`\n--- near-duplicates (same make, same model after lowercasing and removing spaces, hyphens and punctuation): ${near.length}`);
  console.log("make | normalised | the stored spellings");
  for (const [k, g] of near.sort((a, b) => a[0].localeCompare(b[0]))) {
    const [make, normalised] = k.split(" ");
    console.log(`${make} | ${normalised} | ${[...g].sort().join(" · ")}`);
  }

  // how many pairs have at least one live listing
  const live = await db.listings.findMany({ where: { delisted_at: null }, select: { car: { select: { model: { select: { make: true, model: true } } } } } });
  const livePairs = new Set(live.filter((l) => l.car.model.make !== null && l.car.model.model !== null).map((l) => pairKey(l.car.model.make as string, l.car.model.model as string)));
  console.log(`\n--- pairs with at least one LIVE listing: ${livePairs.size} (§9 expects 2)`);
  console.log("make | model | live listings");
  const liveCount = new Map<string, number>();
  for (const l of live) {
    const { make, model } = l.car.model;
    if (make === null || model === null) continue;
    const k = pairKey(make, model);
    liveCount.set(k, (liveCount.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...liveCount.entries()].sort((a, b) => b[1] - a[1])) {
    const [make, model] = k.split(" ");
    console.log(`${make} | ${model} | ${n}`);
  }

  // the five makes, matched on the STORED spelling
  console.log(`\n--- the five makes of §9, matched on the stored spelling`);
  console.log("asked for | present in models | pairs | the models");
  for (const make of PROBE_MAKES) {
    const set = perMake.get(make);
    console.log(`${make} | ${set === undefined ? "NO — no row stores this spelling" : "yes"} | ${set?.size ?? 0} | ${set === undefined ? "-" : [...set].sort().join(" · ")}`);
  }
  console.log(`\n--- every make spelling stored in models (${byPairs.length}), so the five above can be placed`);
  console.log([...perMake.keys()].sort().join(" · "));
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
