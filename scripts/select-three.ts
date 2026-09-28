// scripts/select-three.ts
// One search over the live pool with the Stage B selection library (BRIEF Day 12 part 2, §9). Reads the
// engine's invoices from listings.score_breakdown, calls selectThree(), and writes REPORT-select-three.md.
// It NEVER writes to the database — there is no --write.
//
// Arguments: --model=<value> (the search's model; see below), --max-price=<n> (optional), --years=<from>-<to> or --years=<y>
// (optional). Default filters: the whole live pool of that model.
//   --model    the model the search is for (Days 13–14 take it from the search screen; the script takes it as a flag).
//              Matched against models.model the way scripts/import-sheet.ts matches --expect-model: both sides uppercased
//              and with whitespace removed, exact. Required whenever the live listings span more than one model — missing
//              or unknown value stops the run, printing the models present with their listing counts, before any search.
//
// Loading (the Prisma pattern of scripts/score-listings.ts): live listings (delisted_at is null) with their car
// (car_id, plate, year), the model's comparison_group, the norm row via market_stats_id, the seller and its
// dealer_commercial rows. Then the search's filters (budget, years) → the pool.
//   version check   every live listing and every norm row must be at ENGINE_VERSION — anything else stops.
//   median_price    the norm row's median_price; null when the listing's price row is not 'scored'.
//   seller_visible  the seller has an OPEN dealer_commercial row = agreement_end is null OR later than this run's `now`
//                   (§13.3: a trial born with a known end date is open until that date arrives). agreement_status is not
//                   part of "open" (the demo sellers sit on rows in status demo). The preflight line prints the definition.
//
// Preflight, printed first: sellers in the pool · sellers with an open row · listings whose seller is visible.
// Zero visible listings → STOP (the report carries the preflight and the stop; exit 1). A FAIL in the finish test → STOP.
//
// THE THREE (§9.2 as answered in §13.4): under each pick, the top 5 of that category by its own order (categoryOrder from
// the library) among the shown listings eligible for it — plate, price, the category's key value, winner / winner here too
// (also won X) / double winner (won X) / skipped (too_similar) / not examined — then its distance() to each pick, null when
// not the same cell, and whether it would fire at SIMILARITY_THRESHOLD. This shows what the too_similar rule would have done.
// Rules v2 (part 3): a car may win more than one category (double_winner records, it does not act). After THE THREE:
//   RUNNER-UP for cheapest     the recorded cheapest_runner_up entry, then every cheapest-eligible shown listing priced above
//                              the cheapest pick by up to RUNNER_UP_TUNING_WINDOW_PCT, for tuning the band and the gap.
//   CHEAPEST BAR tuning        who would win cheapest under each bar in CHEAPEST_BAR_TUNING (the constant in force is -5).
//   PEACE OF MIND FLOOR tuning who would win peace_of_mind under each floor in PEACE_FLOOR_TUNING (in force: -10), then the
//                              listings whose recorded `overpriced` entry is triggered, with their place in the peace_of_mind order.
// Rules v3 (part 4 §1): peace_of_mind is condition alone; the deal floor is recorded (`overpriced`, effect PEACE_OF_MIND_FLOOR_EFFECT)
// and does not bar, so ELIGIBILITY reports it as its own count line, not as a reason.
// The finish test is the library's finishTest() (src/lib/selection/finish.ts), printed here in Day 14 rules v5's
// claims (§0.5); distinct cars and double wins stay reported, not failed.
// Rules v5 (Day 14 run B, §0.1–§0.4, P5): a pick requires registry ownership history — a listing whose invoice
// history row is not sourced 'mot' stays listed and keeps its rank, wins nothing, and cannot be the runner-up. This
// script adds: UNVERIFIED HISTORY (who the rule barred, and every blocked_first fact — the counterfactual winner the
// rule kept out of a category) and the NO-DEAL TAIL in its new order. The reader is unchanged: it never selected
// listings.condition_score or listings.confidence — Stage B has always read the sums out of the invoice.
// Rules v8 (Days 22–23, §0): the condition floor (CONDITION_FLOOR, renamed from CHEAPEST_CONDITION_FLOOR) bars ALL
// THREE categories and the runner-up, and the crowning gate counts the cars at or above it. This script adds: the
// CONDITION FLOOR tuning section under its new name (its sweep unchanged); the `condition_floor blocked_first` facts
// under UNVERIFIED HISTORY; and the history key of every NO-DEAL TAIL row — NO_DEAL_ORDER = history_desc, the
// registry reading best first, rows without one after them by price, ties price then first_seen_at then listing_id.
// Rules v4 (part 5 §3–§4): each listing gets new_price = the latest published_at row of new_car_prices on the car's key. Since part 6
// the key is three columns, no split: new_car_prices.degem_code = models.degem_code (the same makeDegemCode string), sug_degem =
// models.vehicle_class, shnat_yitzur = cars.year; null when no row matches. The library's above_new_price rule (out at >= PRICE_VS_NEW_CEILING_PCT, effect ABOVE_NEW_PRICE_EFFECT) is reported as:
//   each pick's line gains `price / new = N%`; RANK LIST gains a `% of new` column;
//   NEW PRICE               the distribution of the value over the pool (min / median / max, per year), the count at or above the
//                           ceiling, and every listing without a new price (plate, codes, year, type).
// Day 17 (plan, §1): DIFFERENTIATION, printed right after THE THREE — the three picks against the three cheapest
// listings and the three most recent listings of the same pool (Cheapest-3 by price, Newest-3 by first_seen_at,
// which is a proxy for the ad's own date), with the overlap counted by plate. A measurement only: if the lists
// coincide the ranking does not differentiate, and the verdict on that is Eran's. No rule is re-implemented here.

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { ENGINE_VERSION } from "@/lib/scoring/constants";
import { assemblePool, PoolAssemblyError, type PoolItem } from "@/lib/search/assemble";
import {
  ABOVE_NEW_PRICE_EFFECT,
  CATEGORY_PRIORITY,
  CONDITION_FLOOR,
  CROWNING_THRESHOLD,
  DOUBLE_WINNER_EFFECT,
  PEACE_OF_MIND_DEAL_FLOOR,
  PEACE_OF_MIND_FLOOR_EFFECT,
  PRICE_VS_NEW_CEILING_PCT,
  NO_DEAL_ORDER,
  RULES_VERSION,
  RUNNER_UP_DEAL_GAP,
  RUNNER_UP_PRICE_BAND_PCT,
  SIMILARITY_THRESHOLD,
  TOO_SIMILAR_EFFECT,
  UNVERIFIED_HISTORY_EFFECT,
  categoryOrder,
  crowningLine,
  distance,
  finishTest,
  isCancelled,
  selectThree,
  type Category,
} from "@/lib/selection";

const REPORT_FILE = "REPORT-select-three.md";
const CATEGORY_TOP = 5; // §9.2 / §13.4: the top 5 of each category by its own order
const RANK_LIST_TOP = 10; // §9.7
const HISTOGRAM_EDGES = [0, 2, 4, 6, 10]; // §9.6: [0,2) [2,4) [4,6) [6,10) [10,∞)
// Report format only (part 3 §4) — none of these is a rule value; the rule values are in src/lib/selection/constants.ts.
const RUNNER_UP_TUNING_WINDOW_PCT = 10; // RUNNER-UP: list every cheapest-eligible listing priced above C by up to this much
const CHEAPEST_BAR_TUNING: (number | null)[] = [0, -5, -10, null]; // CHEAPEST BAR: bars to try; null = any non-null condition_vs_typical
const PEACE_FLOOR_TUNING: (number | null)[] = [null, -10, -5, 0]; // PEACE OF MIND FLOOR: floors to try; null = any non-null deal_score

// ---------- arguments ----------
function intArg(name: string): number | null {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (!a) return null;
  const v = a.slice(name.length + 3);
  if (!/^\d+$/.test(v)) throw new Error(`--${name}: expected an integer, got '${v}'`);
  return Number(v);
}
function yearsArg(): { from: number; to: number } | null {
  const a = process.argv.find((x) => x.startsWith("--years="));
  if (!a) return null;
  const v = a.slice("--years=".length);
  const m = /^(\d{4})(?:-(\d{4}))?$/.exec(v);
  if (!m) throw new Error(`--years: expected <from>-<to> or <year>, got '${v}'`);
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  if (to < from) throw new Error(`--years: to < from in '${v}'`);
  return { from, to };
}
// --model=<value>: compared to models.model uppercased and without whitespace, exactly as import-sheet.ts's
// --expect-model. modelKey() lives in the assembly since Day 15 — one definition, two callers.
function modelArg(): string | null {
  if (process.argv.includes("--model")) throw new Error("--model: missing value — write --model=<value>");
  const a = process.argv.find((x) => x.startsWith("--model="));
  if (!a) return null;
  const v = a.slice("--model=".length);
  if (!v) throw new Error("--model: missing value");
  return v;
}
const MODEL = modelArg();
const MAX_PRICE = intArg("max-price");
const YEARS = yearsArg();

// ---------- output ----------
const out: string[] = [];
function log(line = "") {
  out.push(line);
  console.log(line);
}
function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "-" : (n > 0 ? "+" : "") + String(n);
}
function writeReport(title: string) {
  writeFileSync(REPORT_FILE, `# select-three — ${title}\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`, "utf8");
}
function count(items: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function cmpDealAsc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---------- the loaded pool ----------
// Day 15 (§2): the assembly moved to src/lib/search/assemble.ts — the load, the version check, the model
// resolution, median_price, seller_visible and the new-price join. The script keeps only its own two flags
// (--max-price, --years), which cut the assembled pool here, and everything it reports.
type Loaded = PoolItem;

// Days 22–23 rules v8 (§0b) — the key the no-deal tail is ordered by, as a word for the report: the value of a
// REGISTRY reading, or what stands in its place. isCancelled() comes first — a cancelled invoice has no rows at all.
function historyKeyOf(p: Loaded): string {
  if (isCancelled(p.candidate)) return "cancelled";
  const row = p.candidate.breakdown.rows.find((r) => r.row === "history");
  if (row === undefined) throw new Error(`listing ${p.listing_id} (${p.plate}): invoice has no history row`);
  if (row.status !== "scored") return "unavailable";
  return row.source === "mot" ? `mot=${fmt(row.value)}` : "typical";
}

// The reasons that can block each category (the library's reason strings, §4.1, §11.3, part 3 §2a/§2c, part 4 §1), for the
// eligibility counts. The deal floor blocks peace_of_mind only under floor effect 'excluded'; under 'none' it is recorded.
// Day 14 rules v5: unverified_history bars all three (§0.1), so it is a reason under each of them.
const REASONS_OF: Record<Category, string[]> = {
  best_value: ["thin_cell", "no_deal_score", "unverified_history"],
  peace_of_mind: ["thin_cell", "no_condition_by_reality", "unverified_history", ...(PEACE_OF_MIND_FLOOR_EFFECT === "excluded" ? ["no_deal_score", "overpriced"] : [])],
  cheapest: ["thin_cell", "no_condition_vs_typical", "below_floor", "unverified_history"],
};

async function main() {
  const now = new Date();
  // §13.3: open = agreement_end is null or later than this run's now — the assembly applies it (seller_visible).
  const filters =
    [MAX_PRICE !== null ? `max-price=${MAX_PRICE}` : null, YEARS ? `years=${YEARS.from}-${YEARS.to}` : null].filter(Boolean).join(", ") ||
    "none (whole live pool)";

  // ---------- 1. load (Day 15 §2: the assembly is src/lib/search/assemble.ts) ----------
  // The assembly stops on a mixed engine version and on an unresolvable --model, carrying the lines this
  // script used to print itself; they are printed here, then the stop is rethrown untouched.
  let assembled;
  try {
    assembled = await assemblePool(MODEL, { now });
  } catch (e) {
    if (e instanceof PoolAssemblyError) for (const line of e.lines) log(line);
    throw e;
  }
  const modelDisplay = assembled.model_display;
  const modelListings = assembled.model_listings;
  const rowsLength = assembled.live_listings;

  // the pool after the script's own filters — the assembly is the whole model pool
  const pool: Loaded[] = assembled.items.filter(
    (p) => (MAX_PRICE === null || p.price <= MAX_PRICE) && (YEARS === null || (p.year >= YEARS.from && p.year <= YEARS.to)),
  );
  const byId = new Map(pool.map((p) => [p.candidate.listing_id, p]));

  const withNewPrice = pool.filter((p) => p.candidate.new_price !== null).length;
  const publications = [...new Set(pool.filter((p) => p.new_price_published_at !== null).map((p) => (p.new_price_published_at as Date).toISOString().slice(0, 10)))].sort();

  // ---------- 2. preflight ----------
  const sellers = new Set(pool.map((p) => p.dealer_id));
  const openSellers = new Set(pool.filter((p) => p.candidate.seller_visible).map((p) => p.dealer_id));
  const visibleListings = pool.filter((p) => p.candidate.seller_visible).length;
  const commercialRows = await db.dealer_commercial.count();
  const openRows = await db.dealer_commercial.count({ where: { OR: [{ agreement_end: null }, { agreement_end: { gt: now } }] } });

  log(
    `select-three — now = ${now.toISOString()}, RULES_VERSION = ${RULES_VERSION}, ENGINE_VERSION = ${ENGINE_VERSION}, too_similar_effect = ${TOO_SIMILAR_EFFECT}, double_winner_effect = ${DOUBLE_WINNER_EFFECT}, peace_of_mind_floor_effect = ${PEACE_OF_MIND_FLOOR_EFFECT}, above_new_price_effect = ${ABOVE_NEW_PRICE_EFFECT}, unverified_history_effect = ${UNVERIFIED_HISTORY_EFFECT}, no_deal_order = ${NO_DEAL_ORDER}`,
  );
  log(
    `constants: CONDITION_FLOOR = ${CONDITION_FLOOR}, PEACE_OF_MIND_DEAL_FLOOR = ${PEACE_OF_MIND_DEAL_FLOOR}, RUNNER_UP_PRICE_BAND_PCT = ${RUNNER_UP_PRICE_BAND_PCT}, RUNNER_UP_DEAL_GAP = ${RUNNER_UP_DEAL_GAP}, PRICE_VS_NEW_CEILING_PCT = ${PRICE_VS_NEW_CEILING_PCT}, CROWNING_THRESHOLD = ${CROWNING_THRESHOLD}`,
  );
  log(`model: ${modelDisplay}${MODEL === null ? " (the only model live; --model not given)" : ` (--model=${MODEL})`} — ${modelListings} live listing(s) of this model`);
  log(`filters: ${filters}; live listings: ${rowsLength}; pool after filters: ${pool.length}`);
  log(`new price (new_car_prices, latest published_at per four-column key): ${withNewPrice} of ${pool.length} listings got one${publications.length ? `; publication(s) used: ${publications.join(", ")}` : ""}`);
  log(`\n===== PREFLIGHT =====`);
  log(`sellers in the pool: ${sellers.size}`);
  log(`sellers with an open dealer_commercial row (open = agreement_end is null or later than now = ${now.toISOString()}): ${openSellers.size}`);
  log(`listings whose seller is visible: ${visibleListings} of ${pool.length}`);
  log(`(dealer_commercial rows in total: ${commercialRows}; open rows: ${openRows})`);
  if (visibleListings === 0) {
    log(`\nSTOP: zero listings are visible — no seller in the pool has an open dealer_commercial row. The search was not run (§9).`);
    writeReport(`${modelDisplay}, ${pool.length} listings — STOPPED at preflight (filters: ${filters})`);
    throw new Error("preflight: zero visible listings — stopped before the search");
  }

  // ---------- 3. the search ----------
  const res = selectThree({ listings: pool.map((p) => p.candidate) });
  const resultOf = new Map(res.results.map((r) => [r.listing_id, r]));
  const shown = res.results.filter((r) => r.status === "shown");
  const P = (id: number) => byId.get(id)!;
  const R = (id: number) => resultOf.get(id)!;
  const bd = (id: number) => P(id).candidate.breakdown;
  // the above_new_price rule's value (price / new_price, %) as recorded in the trace; null when not evaluated or no entry (sold_strong)
  const pctOfNew = (id: number): number | null => {
    const v = R(id).trace.find((t) => t.rule === "above_new_price")?.value ?? null;
    return typeof v === "number" ? v : null; // RuleTrace.value is number | string | null since rules v5; this rule's is a number
  };
  const pctText = (id: number) => (pctOfNew(id) === null ? "-" : `${pctOfNew(id)}%`);

  // ---------- 4. THE THREE ----------
  // §13.4: under each pick, the top CATEGORY_TOP of that category by its own order among the shown listings eligible for
  // it (exactly the pick loop's candidate set), each labelled by what the loop did with it, then its distance to each pick.
  const KEY_TEXT: Record<Category, (id: number) => string> = {
    best_value: (id) => `deal_score ${fmt(bd(id).deal_score)}`,
    peace_of_mind: (id) => `condition_by_reality ${fmt(bd(id).condition_by_reality)}`,
    cheapest: (id) => `price ${P(id).candidate.price} (condition_vs_typical ${fmt(bd(id).condition_vs_typical)})`,
  };
  log(`\n===== THE THREE =====`);
  // §7.3 (Days 20–21 rules v7) — the crowning gate's own line, one per model, from result.crowning.
  log(crowningLine(res.crowning));
  for (const c of CATEGORY_PRIORITY) {
    const id = res.picks[c];
    log(`\n--- ${c}`);
    if (id === null) {
      log(`  no pick: ${res.missing[c]}`);
    } else {
      const p = P(id);
      const b = bd(id);
      const r = R(id);
      const also = r.categories.filter((x) => x !== c);
      log(`  winner${also.length ? ` (also ${also.join(" + ")})` : ""}`);
      log(`  plate ${p.plate} | listing ${id} | year ${p.candidate.year} | price ${p.candidate.price} | price / new = ${pctText(id)} | km_declared ${p.km_declared ?? "-"} | rank ${r.rank}`);
      log(`  deal_score ${fmt(b.deal_score)} | condition_score ${fmt(b.condition_score)} | condition_by_reality ${fmt(b.condition_by_reality)} | typical_history ${fmt(b.typical_history)}`);
      log(`  seller ${p.seller} | verify_availability ${r.verify_availability}`);
    }
    const cands = shown.filter((x) => x.eligibility[c]).sort((a, b) => categoryOrder[c](P(a.listing_id).candidate, P(b.listing_id).candidate));
    const winnerPlace = id === null ? cands.length : cands.findIndex((x) => x.listing_id === id);
    if (id !== null && winnerPlace < 0) throw new Error(`${c}: the pick (listing ${id}) is not among the shown listings eligible for it`);
    log(`  top ${CATEGORY_TOP} of ${cands.length} candidates, by the ${c} order; distance to each pick fires at < ${SIMILARITY_THRESHOLD} (effect in force: ${TOO_SIMILAR_EFFECT}):`);
    cands.slice(0, CATEGORY_TOP).forEach((q, i) => {
      const qp = P(q.listing_id);
      const dw = q.trace.find((t) => t.rule === "double_winner" && t.context.considered_for === c);
      const won = dw ? (dw.context.won as Category[]).join(" + ") : "";
      // part 3 §4: a double winner that won this category too says so; "double winner (won X)" alone means it was skipped —
      // reachable only under effect 'recategorized'.
      const label =
        q.listing_id === id
          ? dw
            ? `winner here too (also won ${won})`
            : "winner"
          : dw
            ? `double winner (won ${won})`
            : i < winnerPlace
              ? "skipped (too_similar)"
              : "not examined";
      const dists = CATEGORY_PRIORITY.map((pc) => {
        const pid = res.picks[pc];
        if (pid === null) return `${pc}: no pick`;
        if (pid === q.listing_id) return `${pc}: self`;
        const d = distance(qp.candidate, P(pid).candidate);
        return `${pc}: ${d === null ? "null (other cell)" : d}${d !== null && d < SIMILARITY_THRESHOLD ? " FIRES" : ""}`;
      });
      log(`    ${i + 1}. ${qp.plate} | listing ${q.listing_id} | rank ${q.rank} | price ${qp.candidate.price} | ${KEY_TEXT[c](q.listing_id)} — ${label}`);
      log(`       distance to picks — ${dists.join(" · ")}`);
    });
  }

  // ---------- 4a. DIFFERENTIATION (plan, Day 17) ----------
  // A measurement, not a rule, and not a verdict: do the three picks differ from the three cheapest listings and
  // the three most recent listings of the same pool? If the lists coincide, the ranking does not differentiate.
  // Pool = the listings handed to selectThree (the assembly's pool, cut only by this script's own flags — the
  // Day 17 runs pass none). Cheapest-3 = lowest price, ties first_seen_at ascending then listing id ascending.
  // Newest-3 = latest first_seen_at, ties listing id ascending; first_seen_at is a proxy for the ad's own date,
  // a known limitation and not something this block fixes. Overlap is counted by plate. Nothing here is decided.
  log(`\n===== DIFFERENTIATION (the picks vs the 3 cheapest and the 3 newest of the pool) =====`);
  {
    const seenAt = (id: number) => Date.parse(P(id).candidate.first_seen_at);
    const ids = pool.map((p) => p.candidate.listing_id);
    const byPrice = [...ids].sort((a, b) => P(a).candidate.price - P(b).candidate.price || seenAt(a) - seenAt(b) || a - b);
    const byRecency = [...ids].sort((a, b) => seenAt(b) - seenAt(a) || a - b);
    const priceRank = new Map(byPrice.map((id, i) => [id, i + 1]));
    const recencyRank = new Map(byRecency.map((id, i) => [id, i + 1]));
    const cheapest3 = byPrice.slice(0, 3);
    const newest3 = byRecency.slice(0, 3);
    const cars = new Set(pool.map((p) => p.plate)).size;
    log(`pool: ${pool.length} listing(s) / ${cars} car(s) — filters: ${filters}`);
    log(`price rank: 1 = the cheapest listing of the pool (ties first_seen_at asc, then listing id asc); recency rank: 1 = the newest (ties listing id asc)`);
    // first_seen_at carries day granularity here, so Newest-3 can be decided almost entirely by the id tie-break.
    // The reader is told how much of the order is a real date difference and how much is the tie-break.
    const dates = pool.map((p) => p.candidate.first_seen_at);
    const newestDate = [...dates].sort().at(-1) as string;
    log(
      `first_seen_at: ${new Set(dates).size} distinct value(s) over the pool; ${dates.filter((d) => d === newestDate).length} listing(s) share the newest (${newestDate}), so that many are separated only by the id tie-break`,
    );

    // Table A — the picks, exactly the three the script printed above.
    log(`\n-- Table A — the picks`);
    log(`category | plate | listing | year | price | km_declared | deal score | condition score | first_seen_at | price rank | recency rank`);
    for (const c of CATEGORY_PRIORITY) {
      const id = res.picks[c];
      if (id === null) {
        log(`${c} | (empty) | - | - | - | - | - | - | - | - | -   — no pick: ${res.missing[c]}`);
        continue;
      }
      const p = P(id);
      const b = bd(id);
      log(
        `${c} | ${p.plate} | ${id} | ${p.candidate.year} | ${p.candidate.price} | ${p.km_declared ?? "-"} | ${fmt(b.deal_score)} | ${fmt(b.condition_score)} | ${p.candidate.first_seen_at} | ${priceRank.get(id)} | ${recencyRank.get(id)}`,
      );
    }

    // Tables B and C — the same columns. `rank` is the listing's place in this script's rank list (the Stage A
    // order among the shown listings); a listing that is not shown has none, and the rule that removed or merged
    // it is named instead — the same derivation section 5 (EXCLUDED and MERGED) prints.
    const rankText = (id: number): string => {
      const r = R(id);
      if (r.rank !== null) return String(r.rank);
      const rule = r.status === "merged" ? "duplicate" : (r.excluded_by ?? "not shown");
      return `no rank (${rule})`;
    };
    const pickText = (id: number): string => (R(id).categories.length ? R(id).categories.join(" + ") : "—");
    const listTable = (title: string, list: number[]) => {
      log(`\n-- ${title}`);
      log(`plate | listing | year | price | km_declared | first_seen_at | rank | deal score | condition score | pick?`);
      for (const id of list) {
        const p = P(id);
        const b = bd(id);
        log(
          `${p.plate} | ${id} | ${p.candidate.year} | ${p.candidate.price} | ${p.km_declared ?? "-"} | ${p.candidate.first_seen_at} | ${rankText(id)} | ${fmt(b.deal_score)} | ${fmt(b.condition_score)} | ${pickText(id)}`,
        );
      }
      // two listings of one car inside the three — the overlap below counts plates, so this is worth saying out loud
      const plates = list.map((id) => P(id).plate);
      for (const [plate, n] of count(plates)) {
        if (n > 1) log(`  note: plate ${plate} appears ${n} times in this table — ${n} listings of one car.`);
      }
    };
    listTable("Table B — Cheapest-3 (lowest price; ties first_seen_at asc, then listing id asc)", cheapest3);
    listTable("Table C — Newest-3 (latest first_seen_at; ties listing id asc)", newest3);

    // Overlap by plate. The word restates the count; it is not a judgment.
    const word = (k: number) => (k === 3 ? "identical" : k > 0 ? "partial" : "disjoint");
    const pickPlates = [...new Set(CATEGORY_PRIORITY.map((c) => res.picks[c]).filter((x): x is number => x !== null).map((id) => P(id).plate))];
    log(`\n-- Overlap (by plate). Picks: ${pickPlates.length ? pickPlates.join(", ") : "none"}`);
    for (const [label, list] of [["Cheapest-3", cheapest3], ["Newest-3", newest3]] as [string, number[]][]) {
      const platesHere = [...new Set(list.map((id) => P(id).plate))];
      const shared = platesHere.filter((pl) => pickPlates.includes(pl));
      log(`picks ∩ ${label} = ${shared.length} of ${list.length} — ${word(shared.length)}${shared.length ? ` — plates: ${shared.join(", ")}` : ""}`);
    }
  }

  // ---------- 4b. RUNNER-UP for cheapest (part 3 §2b / §4) ----------
  log(`\n===== RUNNER-UP for cheapest (band ${RUNNER_UP_PRICE_BAND_PCT}%, gap ${RUNNER_UP_DEAL_GAP}; recorded only) =====`);
  const cId = res.picks.cheapest;
  if (cId === null) {
    log(`  no cheapest pick (${res.missing.cheapest}) — the rule was not evaluated, nothing recorded`);
  } else {
    const cp = P(cId);
    const cDeal = bd(cId).deal_score;
    if (cDeal === null) throw new Error(`cheapest pick ${cId} (${cp.plate}) has no deal_score`);
    log(`  C: ${cp.plate} | listing ${cId} | price ${cp.candidate.price} | deal_score ${fmt(cDeal)}`);
    const ruEntries = R(cId).trace.filter((t) => t.rule === "cheapest_runner_up");
    if (ruEntries.length !== 1) throw new Error(`cheapest pick ${cId}: expected exactly one cheapest_runner_up entry, found ${ruEntries.length}`);
    const ru = ruEntries[0];
    if (ru.context.evaluated === false) {
      log(`  recorded: value null | threshold ${ru.threshold} | triggered ${ru.triggered} | not evaluated: ${ru.context.reason} (band ${ru.context.band_pct}%)`);
    } else {
      const rp = P(ru.context.runner_up as number);
      log(
        `  recorded: value (gap) ${fmt(typeof ru.value === "number" ? ru.value : null)} | threshold ${ru.threshold} | triggered ${ru.triggered ? "YES" : "no"} | runner-up ${rp.plate} (listing ${rp.candidate.listing_id}) | price_over_pct ${ru.context.price_over_pct}`,
      );
    }
    const summary = res.runner_ups.cheapest;
    // rules v7 (§1.5): a runner-up is never one of the picks — a candidate that won a category is skipped, and
    // a band holding only picks records no runner-up at all.
    log(
      `  runner_ups.cheapest: ${summary ? `listing ${summary.listing_id} (${P(summary.listing_id).plate}), gap ${fmt(summary.gap)}, price_over_pct ${summary.price_over_pct}, triggered ${summary.triggered}` : "null"}`,
    );
    // tuning: every shown listing eligible for cheapest priced above C by up to RUNNER_UP_TUNING_WINDOW_PCT
    const window = shown
      .filter((x) => x.eligibility.cheapest && x.car_id !== cp.candidate.car_id)
      .map((x) => P(x.listing_id))
      .filter((q) => q.candidate.price > cp.candidate.price && q.candidate.price <= cp.candidate.price * (1 + RUNNER_UP_TUNING_WINDOW_PCT / 100))
      .sort((a, b) => a.candidate.price - b.candidate.price || a.candidate.listing_id - b.candidate.listing_id);
    log(`  cheapest-eligible listings priced above C by up to ${RUNNER_UP_TUNING_WINDOW_PCT}% (${window.length}), by price:`);
    log(`  plate | listing | price | price_over_pct | deal_score | gap | band | gap test`);
    for (const q of window) {
      const qDeal = bd(q.candidate.listing_id).deal_score;
      if (qDeal === null) throw new Error(`listing ${q.candidate.listing_id} (${q.plate}) is eligible for cheapest but has no deal_score`);
      const over = Math.round(((q.candidate.price - cp.candidate.price) / cp.candidate.price) * 1000) / 10;
      const gap = Math.round((qDeal - cDeal) * 10) / 10;
      log(
        `  ${q.plate} | ${q.candidate.listing_id} | ${q.candidate.price} | ${over} | ${fmt(qDeal)} | ${fmt(gap)} | ${over <= RUNNER_UP_PRICE_BAND_PCT ? "in band" : "outside band"} | ${gap >= RUNNER_UP_DEAL_GAP ? ">= gap" : "< gap"}`,
      );
    }
  }

  // ---------- 4c. CHEAPEST BAR tuning (part 3 §2a / §4) ----------
  log(`\n===== CONDITION FLOOR tuning (in force: CONDITION_FLOOR = ${CONDITION_FLOOR}) =====`);
  {
    const cheapestOrder = (a: number, b: number) => categoryOrder.cheapest(P(a).candidate, P(b).candidate);
    const overall = shown.map((x) => x.listing_id).sort(cheapestOrder)[0];
    if (overall === undefined) log(`  no shown listing`);
    else log(`  cheapest shown listing overall (any condition): ${P(overall).plate} | listing ${overall} | price ${P(overall).candidate.price} | condition_vs_typical ${fmt(bd(overall).condition_vs_typical)}`);
    const bv = res.picks.best_value;
    log(`  bar | would win cheapest | price | condition_vs_typical | vs best_value pick${bv === null ? " (none)" : ` (${P(bv).plate})`}`);
    for (const bar of CHEAPEST_BAR_TUNING) {
      const eligible = shown
        .map((x) => x.listing_id)
        .filter((id) => {
          const cvt = bd(id).condition_vs_typical;
          return cvt !== null && (bar === null || cvt >= bar);
        })
        .sort(cheapestOrder);
      const w = eligible[0];
      const barText = bar === null ? "none" : String(bar);
      if (w === undefined) log(`  ${barText} | no eligible listing | - | - | -`);
      else log(`  ${barText} | ${P(w).plate} (listing ${w}) | ${P(w).candidate.price} | ${fmt(bd(w).condition_vs_typical)} | ${w === bv ? "= best_value pick" : "distinct"}`);
    }
  }

  // ---------- 4d. PEACE OF MIND FLOOR tuning (part 3 §2c / §4) ----------
  log(`\n===== PEACE OF MIND FLOOR tuning (in force: PEACE_OF_MIND_DEAL_FLOOR = ${PEACE_OF_MIND_DEAL_FLOOR}; none = any non-null deal_score) =====`);
  {
    const peaceOrder = (a: number, b: number) => categoryOrder.peace_of_mind(P(a).candidate, P(b).candidate);
    const current = res.picks.peace_of_mind;
    log(`  current winner: ${current === null ? `none (${res.missing.peace_of_mind})` : `${P(current).plate} (listing ${current})`}`);
    log(`  floor | would win peace_of_mind | condition_by_reality | deal_score | vs current winner`);
    for (const floor of PEACE_FLOOR_TUNING) {
      const eligible = shown
        .map((x) => x.listing_id)
        .filter((id) => {
          const b = bd(id);
          return b.condition_by_reality !== null && b.deal_score !== null && (floor === null || b.deal_score >= floor);
        })
        .sort(peaceOrder);
      const w = eligible[0];
      const floorText = floor === null ? "none" : String(floor);
      if (w === undefined) log(`  ${floorText} | no eligible listing | - | - | -`);
      else log(`  ${floorText} | ${P(w).plate} (listing ${w}) | ${fmt(bd(w).condition_by_reality)} | ${fmt(bd(w).deal_score)} | ${w === current ? "= current winner" : "different"}`);
    }
    // part 4 §2: the listings whose recorded overpriced entry is triggered (deal_score under the floor), by name, with their
    // place in the peace_of_mind order among the shown listings eligible for it (the pick loop's candidate set).
    const peaceCands = shown.filter((x) => x.eligibility.peace_of_mind).map((x) => x.listing_id).sort(peaceOrder);
    const triggered = res.results
      .filter((r) => r.trace.some((t) => t.rule === "overpriced" && t.triggered))
      .map((r) => r.listing_id)
      .sort((a, b) => cmpDealAsc(bd(a).deal_score, bd(b).deal_score) || a - b);
    log(`  overpriced recorded and triggered (deal_score < ${PEACE_OF_MIND_DEAL_FLOOR}; effect in force: ${PEACE_OF_MIND_FLOOR_EFFECT}): ${triggered.length} of ${res.results.length}`);
    if (triggered.length) log(`  plate | listing | year | price | deal_score | condition_by_reality | status | place in the peace_of_mind order (of ${peaceCands.length})`);
    for (const id of triggered) {
      const r = R(id);
      const place = peaceCands.indexOf(id);
      log(
        `  ${P(id).plate} | ${id} | ${P(id).candidate.year} | ${P(id).candidate.price} | ${fmt(bd(id).deal_score)} | ${fmt(bd(id).condition_by_reality)} | ${r.status}${r.excluded_by ? ` (${r.excluded_by})` : ""} | ${place < 0 ? "not shown" : `${place + 1}${r.categories.includes("peace_of_mind") ? " — the winner" : ""}`}`,
      );
    }
  }

  // ---------- 5. EXCLUDED and MERGED ----------
  const notShown = res.results.filter((r) => r.status !== "shown");
  log(`\n===== EXCLUDED and MERGED (${notShown.length}) =====`);
  log("listing | plate | status | rule | value | context");
  for (const r of notShown) {
    const p = P(r.listing_id);
    if (r.excluded_by === "sold_strong") {
      log(`${r.listing_id} | ${p.plate} | excluded | sold_strong | - | ${JSON.stringify(p.candidate.breakdown.sold_signal)}`);
      continue;
    }
    const rule = r.status === "merged" ? "duplicate" : r.excluded_by;
    const t = r.trace.find((x) => x.rule === rule && x.triggered);
    log(`${r.listing_id} | ${p.plate} | ${r.status} | ${rule} | ${t?.value ?? "-"} | ${t ? JSON.stringify(t.context) : "-"}`);
  }

  // ---------- 5b. NEW PRICE (part 5 §4) ----------
  log(`\n===== NEW PRICE (price / new list price, %; ceiling PRICE_VS_NEW_CEILING_PCT = ${PRICE_VS_NEW_CEILING_PCT}, effect in force: ${ABOVE_NEW_PRICE_EFFECT}) =====`);
  {
    const evaluated = res.results.filter((r) => pctOfNew(r.listing_id) !== null).map((r) => r.listing_id);
    const noEntry = res.results.filter((r) => pctOfNew(r.listing_id) === null && P(r.listing_id).candidate.new_price !== null).length;
    log(`listings with a new price: ${withNewPrice} of ${res.results.length}; value recorded on ${evaluated.length}${noEntry ? ` (${noEntry} with a new price but no entry: excluded at the gate)` : ""}`);
    log(`year | n | min | median | max | at or above ${PRICE_VS_NEW_CEILING_PCT}%`);
    const dist = (label: string, ids: number[]) => {
      const vs = ids.map((id) => pctOfNew(id) as number);
      if (vs.length === 0) return log(`${label} | 0 | - | - | - | 0`);
      log(`${label} | ${vs.length} | ${Math.min(...vs)} | ${median(vs)} | ${Math.max(...vs)} | ${vs.filter((v) => v >= PRICE_VS_NEW_CEILING_PCT).length}`);
    };
    dist("all", evaluated);
    for (const y of [...new Set(evaluated.map((id) => P(id).candidate.year))].sort((a, b) => a - b)) dist(String(y), evaluated.filter((id) => P(id).candidate.year === y));
    const above = evaluated.filter((id) => (pctOfNew(id) as number) >= PRICE_VS_NEW_CEILING_PCT).sort((a, b) => (pctOfNew(b) as number) - (pctOfNew(a) as number) || a - b);
    log(`at or above the ceiling: ${above.length} of ${evaluated.length}`);
    if (above.length) log(`  plate | listing | year | codes | type | price | new price | % of new | status`);
    for (const id of above) {
      const r = R(id);
      log(`  ${P(id).plate} | ${id} | ${P(id).candidate.year} | ${P(id).codes} | ${P(id).vehicle_class} | ${P(id).candidate.price} | ${P(id).candidate.new_price} | ${pctText(id)} | ${r.status}${r.excluded_by ? ` (${r.excluded_by})` : ""}`);
    }
    const without = pool.filter((p) => p.candidate.new_price === null).sort((a, b) => a.candidate.listing_id - b.candidate.listing_id);
    log(`without a new price (no new_car_prices row on the four-column key): ${without.length} of ${pool.length}`);
    if (without.length) log(`  plate | listing | tozeret_cd-degem_cd | year | type (vehicle_class)`);
    for (const p of without) log(`  ${p.plate} | ${p.candidate.listing_id} | ${p.codes} | ${p.candidate.year} | ${p.vehicle_class}`);
  }

  // ---------- 6. ELIGIBILITY ----------
  log(`\n===== ELIGIBILITY (over the whole pool, ${res.results.length} listings) =====`);
  for (const c of CATEGORY_PRIORITY) {
    const eligible = res.results.filter((r) => r.eligibility[c]).length;
    const not = res.results.filter((r) => !r.eligibility[c]);
    log(`${c}: eligible ${eligible}, not ${not.length}`);
    for (const [k, n] of count(not.flatMap((r) => r.eligibility.reasons.filter((x) => REASONS_OF[c].includes(x))))) log(`  ${n.toString().padStart(4)}  ${k}`);
    if (c === "peace_of_mind") {
      // part 4 §1/§2: the deal floor is a measurement — its own count line, not a reason
      const recorded = res.results.filter((r) => r.trace.some((t) => t.rule === "overpriced")).length;
      const trig = res.results.filter((r) => r.trace.some((t) => t.rule === "overpriced" && t.triggered)).length;
      log(`  overpriced (recorded): ${trig} triggered of ${recorded} recorded (effect ${PEACE_OF_MIND_FLOOR_EFFECT})`);
    }
  }

  // ---------- 6b. UNVERIFIED HISTORY (Day 14 rules v5 §0.1–§0.2, P5) ----------
  log(`\n===== UNVERIFIED HISTORY (a pick needs registry history; effect in force: ${UNVERIFIED_HISTORY_EFFECT}) =====`);
  const unvEntries = res.results.map((r) => ({ r, t: r.trace.find((x) => x.rule === "unverified_history") ?? null }));
  const barred = unvEntries.filter((x) => x.t !== null && x.t.triggered);
  log(`  recorded on ${unvEntries.filter((x) => x.t !== null).length} of ${res.results.length} listings; triggered on ${barred.length}`);
  if (barred.length === 0) log(`  no listing in this pool is barred by the rule`);
  for (const { r, t } of barred) {
    log(
      `  ${P(r.listing_id).plate} | listing ${r.listing_id} | rank ${r.rank ?? "-"} (${r.status}) | history source ${t?.value ?? "-"} (row ${t?.context.history_row_status}) | effect ${t?.effect} | categories won ${r.categories.length ? r.categories.join(" + ") : "none"}`,
    );
  }
  // §0.2: the counterfactual winner the rule kept out of a category. Expected on today's pool: none.
  const blocked = unvEntries.filter((x) => ((x.t?.context.blocked_first as Category[] | undefined) ?? []).length > 0);
  log(`  blocked_first: ${blocked.length === 0 ? "none — in every category the counterfactual winner is the actual winner" : ""}`);
  for (const { r, t } of blocked) {
    for (const c of t?.context.blocked_first as Category[]) {
      log(`    ${c}: ${P(r.listing_id).plate} (listing ${r.listing_id}, rank ${r.rank ?? "-"}) would have won but for the rule; the pick is ${res.picks[c] === null ? "empty" : `${P(res.picks[c] as number).plate} (listing ${res.picks[c]})`}`);
    }
  }
  // Days 22–23 rules v8 (§0a): the FLOOR's own counterfactual facts, beside the other rule's. A car barred by both
  // rules is first in neither counterfactual and appears in neither list — only the sole-barred one is recorded.
  const floorEntries = res.results.map((r) => ({ r, t: r.trace.find((x) => x.rule === "condition_floor") ?? null }));
  const floorBlocked = floorEntries.filter((x) => ((x.t?.context.blocked_first as Category[] | undefined) ?? []).length > 0);
  log(`  condition_floor blocked_first: ${floorBlocked.length === 0 ? "none — in every category the counterfactual winner is the actual winner" : ""}`);
  for (const { r, t } of floorBlocked) {
    for (const c of t?.context.blocked_first as Category[]) {
      log(`    ${c}: ${P(r.listing_id).plate} (listing ${r.listing_id}, rank ${r.rank ?? "-"}, condition_vs_typical ${fmt(bd(r.listing_id).condition_vs_typical)}) would have won but for the floor; the pick is ${res.picks[c] === null ? "empty" : `${P(res.picks[c] as number).plate} (listing ${res.picks[c]})`}`);
    }
  }

  // ---------- 6c. NO-DEAL TAIL (Day 14 rules v5 §0.3, P5; Days 22–23 rules v8 §0b: the history row's order) ----------
  const tail = shown.filter((r) => bd(r.listing_id).deal_score === null);
  const ranked = shown.filter((r) => bd(r.listing_id).deal_score !== null);
  log(`\n===== NO-DEAL TAIL (NO_DEAL_ORDER = ${NO_DEAL_ORDER}: the registry history reading, best first; rows without one after them by price; ties price then first_seen_at then listing_id) =====`);
  log(`  ${ranked.length} shown listing(s) have a deal score and take ranks 1..${ranked.length}; ${tail.length} have none`);
  if (tail.length === 0) log(`  the tail is empty`);
  else {
    log("rank | plate | listing | history key | price | first_seen_at | condition_score | eligibility reasons");
    for (const r of tail) {
      const p = P(r.listing_id);
      log(`${r.rank} | ${p.plate} | ${r.listing_id} | ${historyKeyOf(p)} | ${p.candidate.price} | ${p.candidate.first_seen_at} | ${fmt(bd(r.listing_id).condition_score)} | ${r.eligibility.reasons.join(" + ") || "-"}`);
    }
    const first = tail[0].rank as number;
    if (first !== ranked.length + 1) throw new Error(`no-deal tail starts at rank ${first}, but ${ranked.length} shown listings have a deal score — the tail must come after all of them`);
  }

  // ---------- 7. FINISH TEST ----------
  log(`\n===== FINISH TEST (rules v${RULES_VERSION} claims, §0.5) =====`);
  const pickIds = CATEGORY_PRIORITY.map((c) => res.picks[c]).filter((x): x is number => x !== null);
  const ft = finishTest(res);
  for (const c of ft.checks) log(`  ${c.ok ? "ok  " : "FAIL"} ${c.claim}${c.detail ? `\n         ${c.detail}` : ""}`);
  // part 3 §3: reported, non-failing
  const distinctCars = new Set(pickIds.map((x) => R(x).car_id)).size;
  const doubleWinners = res.results.filter((r) => r.categories.length > 1);
  log(`  info distinct cars among the picks: ${distinctCars}`);
  log(`  info double wins: ${doubleWinners.length}${doubleWinners.map((r) => ` (car ${P(r.listing_id).plate} won ${r.categories.join(" + ")})`).join("")}`);
  const finish = ft.pass ? "PASS" : "FAIL";
  log(`finish test: ${finish}`);

  // ---------- 8. SIMILARITY DISTRIBUTION ----------
  log(`\n===== SIMILARITY DISTRIBUTION (all same-cell pairs among the ${shown.length} shown listings) =====`);
  type Pair = { a: Loaded; b: Loaded; d: number };
  const pairs: Pair[] = [];
  let sameCellNull = 0;
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const a = P(shown[i].listing_id);
      const b = P(shown[j].listing_id);
      if (a.cell !== b.cell) continue;
      const d = distance(a.candidate, b.candidate);
      if (d === null) sameCellNull++;
      else pairs.push({ a, b, d });
    }
  }
  log(`pairs with a distance: ${pairs.length}; same-cell pairs without one (a row not scored): ${sameCellNull}`);
  if (pairs.length) {
    const ds = pairs.map((p) => p.d);
    log(`min ${Math.min(...ds)} | median ${median(ds)} | max ${Math.max(...ds)}`);
    for (let k = 0; k < HISTOGRAM_EDGES.length; k++) {
      const lo = HISTOGRAM_EDGES[k];
      const hi = HISTOGRAM_EDGES[k + 1];
      const n = ds.filter((d) => d >= lo && (hi === undefined || d < hi)).length;
      log(`  [${lo},${hi === undefined ? "∞" : hi})  ${n.toString().padStart(4)}`);
    }
    const under = pairs.filter((p) => p.d < SIMILARITY_THRESHOLD).sort((x, y) => x.d - y.d);
    log(`pairs under ${SIMILARITY_THRESHOLD} (SIMILARITY_THRESHOLD): ${under.length}`);
    log("plate a | plate b | cell | distance | price a / b | km a / b");
    for (const p of under) {
      log(`${p.a.plate} | ${p.b.plate} | ${p.a.cell} | ${p.d} | ${p.a.candidate.price} / ${p.b.candidate.price} | ${p.a.km_declared ?? "-"} / ${p.b.km_declared ?? "-"}`);
    }
  }

  // ---------- 9. RANK LIST ----------
  log(`\n===== RANK LIST (top ${RANK_LIST_TOP} of ${shown.length} shown) =====`);
  log("rank | plate | year | price | % of new | deal_score | condition_score | condition_by_reality | history source | categories");
  const rankLine = (r: (typeof shown)[number]) => {
    const p = P(r.listing_id);
    const b = bd(r.listing_id);
    const t = r.trace.find((x) => x.rule === "unverified_history");
    log(`${r.rank} | ${p.plate} | ${p.candidate.year} | ${p.candidate.price} | ${pctText(r.listing_id)} | ${fmt(b.deal_score)} | ${fmt(b.condition_score)} | ${fmt(b.condition_by_reality)} | ${t?.value ?? "-"}${t?.triggered ? " (unverified)" : ""} | ${r.categories.length ? r.categories.join(" + ") : "-"}${r.verify_availability ? " (verify availability)" : ""}`);
  };
  for (const r of shown.slice(0, RANK_LIST_TOP)) rankLine(r);
  // Every pick and every listing the rules v5 eligibility bars, wherever it ranks — the finish test's third claim is
  // about exactly those, so the report shows them even when they sit below RANK_LIST_TOP.
  const alsoWorthShowing = shown
    .slice(RANK_LIST_TOP)
    .filter((r) => r.categories.length > 0 || (r.trace.find((x) => x.rule === "unverified_history")?.triggered ?? false));
  if (alsoWorthShowing.length) {
    log(`-- below the top ${RANK_LIST_TOP}: the picks and the listings the rules bar`);
    for (const r of alsoWorthShowing) rankLine(r);
  }

  writeReport(`${modelDisplay}, ${pool.length} listings — filters: ${filters} — finish test ${finish}`);
  console.log(`\nnothing written to the database; report written to ${REPORT_FILE}`);
  if (finish === "FAIL") throw new Error("finish test FAIL — see the report");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("\nSTOPPED:", (e as Error).message);
    await db.$disconnect();
    process.exit(1);
  });
