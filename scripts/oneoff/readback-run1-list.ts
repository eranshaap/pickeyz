// scripts/oneoff/readback-run1-list.ts — the read-back of Run 1, Days 24–25 (BRIEF §6.5).
//
// READ ONLY. It opens no transaction, writes nothing, and does NOT go through loadForAddress(): that function is
// allowed to write a re-run when it finds an update, and this script may not. It resolves each question's
// displayed run the way the loading rule resolves it (latestRun over the question and its re-runs) and then reads
// THAT run's stored `search_results` rows — nothing else. The reading code is readback-run2-gate.ts's, which Run
// 2b deleted; nothing is rewritten.
//
// ONE LINE PER PERSON-SEARCH (`searches.rerun_of` IS NULL), classified by §1 and assembled by §2 — the very
// functions the screen renders from:
//
//   s         the question's public_id — the `?s=` of its address
//   model     `searches.model_searched`, as stored
//   state     ResultsView.state as §3.1 decides it from these rows: crowned / uncrowned / zero_scored / zero
//   c         the cards the screen shows above the list (list.cardCount)
//   x         the cars the screen shows (list.x) — the count line's number
//   ranked    the rows with a displayed place
//   noPrice   the rows of the no-price group
//   cancl     the rows of the cancelled group
//   hidden    hiddenCount — what the CLOSED list holds back
//   heading   the list heading's text (§5.2)
//   link      the closing row's text (§5.3), or "—" when nothing is held back
//
// THE FOUR ASSERTIONS (§6.5), each with its own tally:
//   1  the displayed places of one search are contiguous c+1 … c+ranked
//   2  on every UNCROWNED search the displayed place of a scored row equals its stored `rank`
//   3  `x` equals today's count-line number over the same rows — Run 1's own expression, shownCarsCount() over
//      distinct `car_id` of the shown rows. This is the proof that the count line did not move.
//   4  no stored row carries the `cancelled` record (`cars.cancelled_at` is empty today)
//
// Then the ids the DONE list needs. COUNTS ARE PRINTED, NEVER CLAIMED IN ADVANCE (work.md).

import "dotenv/config";
import { db } from "@/lib/db";
import { assembleList, type ListRowData, type ListView } from "@/lib/search/list";
import { classifyRow, displayedPlaces } from "@/lib/search/places";
import { latestRun, resultsOf, resultsState, type ResultRow, type SearchRow } from "@/lib/search/load";
import { shownCarsCount } from "@/lib/display/cards";

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

/**
 * The per-row values the assembly needs. The read-back is about the SHAPE of the list — how many rows of each
 * kind, which places, which texts — so it stands in the values with the row's own identity rather than joining
 * `listings` for every row of every search. Nothing it asserts reads any of these fields.
 */
const dataOf = (listing_id: number): ListRowData => ({
  public_id: `L${listing_id}`,
  href: `/listing/L${listing_id}`,
  model: "",
  year: null,
  price: 0,
  km: null,
  hand: null,
  ownership_word: null,
  image: null,
  sentence: "",
  tag: "",
});

function pad(s: string, n: number): string {
  // Hebrew and Latin mix in these cells; a plain length pad is enough for a terminal table.
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

const log = (s = "") => console.log(s);

type Row = {
  question: SearchRow;
  run: SearchRow;
  rows: ResultRow[];
  list: ListView;
  state: string;
  ranked: number;
  /** Today's count-line number, by Run 1's own expression: distinct car_id over the shown rows. */
  carsToday: number;
  failures: string[];
};

async function main(): Promise<void> {
  const questions = await db.searches.findMany({ where: { rerun_of: null }, select: SEARCH_COLUMNS, orderBy: { id: "asc" } });
  const reruns = await db.searches.findMany({ where: { NOT: { rerun_of: null } }, select: SEARCH_COLUMNS, orderBy: { id: "asc" } });
  const rerunsOf = new Map<number, SearchRow[]>();
  for (const r of reruns) {
    if (r.rerun_of === null) continue;
    const list = rerunsOf.get(r.rerun_of) ?? [];
    list.push(r);
    rerunsOf.set(r.rerun_of, list);
  }

  log("readback-run1-list §6.5 — every person-search, through classifyRow() + assembleList()\n");

  const header = ["s", "model", "state", "c", "x", "ranked", "noPrice", "cancl", "hidden", "heading", "link"];
  const widths = [11, 14, 12, 3, 4, 7, 8, 6, 7, 42, 28];
  log(header.map((h, i) => pad(h, widths[i])).join("| "));
  log(widths.map((w) => "-".repeat(w)).join("+-"));

  const out: Row[] = [];
  for (const question of questions) {
    const run = latestRun(question, rerunsOf.get(question.id) ?? []);
    const rows = await resultsOf(run.id);
    const list = assembleList(rows, dataOf);
    const state = resultsState(rows, { with_comparison: rows.filter((r) => r.rank !== null && r.total_score !== null).length });

    // today's count-line number, over the very same rows: the per-car merge Run 1 pinned (§1.7)
    const carIdOf = new Map<number, number>(
      (await db.listings.findMany({ where: { id: { in: rows.map((r) => r.listing_id) } }, select: { id: true, car_id: true } })).map((l) => [l.id, l.car_id]),
    );
    const carsToday = shownCarsCount(
      rows.map((r) => {
        const car_id = carIdOf.get(r.listing_id);
        if (car_id === undefined) throw new Error(`search ${question.public_id}: listing ${r.listing_id} has no listings row`);
        return { car_id, shown: r.rank !== null };
      }),
    );

    const ranked = list.cards.length + list.table.length + list.restRanked.length;
    const failures: string[] = [];

    // 1 — contiguous c+1 … c+ranked
    const places = [...list.cards, ...list.table, ...list.restRanked].map((r) => r.place);
    const expected = Array.from({ length: ranked }, (_, i) => list.cardCount + 1 + i);
    if (JSON.stringify(places) !== JSON.stringify(expected)) failures.push(`1: places ${JSON.stringify(places)} are not ${JSON.stringify(expected)}`);

    // 2 — on an uncrowned search the displayed place IS the stored rank
    if (state === "uncrowned" || state === "zero_scored") {
      const byListing = displayedPlaces(rows);
      for (const r of rows) {
        if (classifyRow(r) !== "ranked") continue;
        const place = byListing.get(r.listing_id) ?? null;
        if (place !== r.rank) failures.push(`2: listing ${r.listing_id} place ${String(place)} != rank ${String(r.rank)}`);
      }
    }

    // 3 — x is today's count-line number
    if (list.x !== carsToday) failures.push(`3: x ${list.x} != today's count ${carsToday}`);

    // 4 — no stored row carries the cancelled record
    if (list.cancelled.length > 0) failures.push(`4: ${list.cancelled.length} row(s) carry the cancelled record`);

    const cells = [
      question.public_id,
      run.model_searched,
      state,
      String(list.cardCount),
      String(list.x),
      String(ranked),
      String(list.noPrice.length),
      String(list.cancelled.length),
      String(list.hiddenCount),
      list.heading.text,
      list.moreLink ?? "—",
    ];
    log(cells.map((c, i) => pad(c, widths[i])).join("| "));
    out.push({ question, run, rows, list, state, ranked, carsToday, failures });
  }

  // -------------------------------------------------------------------------
  // the four tallies
  // -------------------------------------------------------------------------
  const failed = (n: string) => out.filter((r) => r.failures.some((f) => f.startsWith(`${n}:`)));
  log(`\nperson-searches: ${out.length}`);
  const uncrowned = out.filter((r) => r.state === "uncrowned" || r.state === "zero_scored");
  const rankedRows = out.reduce((n, r) => n + r.ranked, 0);
  const cancelledRows = out.reduce((n, r) => n + r.list.cancelled.length, 0);

  log(`assertion 1 — displayed places contiguous c+1 … c+ranked: checked ${out.length} searches / ${rankedRows} ranked rows · failures ${failed("1").length}`);
  log(`assertion 2 — on an uncrowned search the place equals the stored rank: checked ${uncrowned.length} searches · failures ${failed("2").length}`);
  log(`assertion 3 — x equals today's count-line number: checked ${out.length} searches · failures ${failed("3").length}`);
  log(`assertion 4 — no stored row carries the cancelled record: found ${cancelledRows} such row(s) · failures ${failed("4").length}`);

  const allFailures = out.flatMap((r) => r.failures.map((f) => `${r.question.public_id} — ${f}`));
  if (allFailures.length > 0) {
    log("\nFAILURES:");
    for (const f of allFailures) log(`  ${f}`);
  } else {
    log("\nall four assertions pass on every stored search.");
  }

  // -------------------------------------------------------------------------
  // the ids the DONE list needs
  // -------------------------------------------------------------------------
  const crowned = out.filter((r) => r.state === "crowned");
  const byHidden = [...crowned].sort((a, b) => b.list.hiddenCount - a.list.hiddenCount);
  const bigNoPrice = crowned.filter((r) => r.list.noPrice.length >= 3);
  const twoCards = crowned.filter((r) => r.list.cardCount === 2);
  const oneCard = crowned.filter((r) => r.list.cardCount === 1);
  const name = (r: Row | undefined): string => (r === undefined ? "—" : `${r.question.public_id} (${r.run.model_searched})`);

  log("\nfor the DONE list:");
  log(`  crowned searches: ${crowned.length}`);
  log(`  the largest hiddenCount: ${name(byHidden[0])}${byHidden[0] === undefined ? "" : ` — hidden ${byHidden[0].list.hiddenCount}, x ${byHidden[0].list.x}, c ${byHidden[0].list.cardCount}`}`);
  log(`  a no-price group of three or more: ${name(bigNoPrice[0])}${bigNoPrice[0] === undefined ? "" : ` — noPrice ${bigNoPrice[0].list.noPrice.length}`} · found ${bigNoPrice.length}`);
  log(`  two cards: ${name(twoCards[0])} · found ${twoCards.length}${twoCards.map((r) => ` [${r.question.public_id}]`).join("")}`);
  log(`  one card: ${name(oneCard[0])} · found ${oneCard.length}${oneCard.map((r) => ` [${r.question.public_id}]`).join("")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
