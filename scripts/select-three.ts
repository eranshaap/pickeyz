// scripts/select-three.ts
// One search over the live pool with the Stage B selection library (BRIEF Day 12 part 2, §9). Reads the
// engine's invoices from listings.score_breakdown, calls selectThree(), and writes REPORT-select-three.md.
// It NEVER writes to the database — there is no --write.
//
// Arguments: --max-price=<n> (optional), --years=<from>-<to> or --years=<y> (optional). Default: the whole live pool.
//
// Loading (the Prisma pattern of scripts/score-listings.ts): live listings (delisted_at is null) with their car
// (car_id, plate, year), the model's comparison_group, the norm row via market_stats_id, the seller and its
// dealer_commercial rows. Then the search's filters (budget, years) → the pool.
//   version check   every live listing and every norm row must be at ENGINE_VERSION — anything else stops.
//   median_price    the norm row's median_price; null when the listing's price row is not 'scored'.
//   seller_visible  the seller has an OPEN dealer_commercial row = agreement_end is null (prisma/schema.prisma §5:
//                   "Open row = agreement_end null; at most one open row per dealer; no agreement = no open row").
//                   agreement_status is not part of "open" (the demo sellers sit on rows in status demo).
//
// Preflight, printed first: sellers in the pool · sellers with an open row · listings whose seller is visible.
// Zero visible listings → STOP (the report carries the preflight and the stop; exit 1). A FAIL in the finish test → STOP.

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { ENGINE_VERSION } from "@/lib/scoring/constants";
import type { Row, ScoreResult } from "@/lib/scoring/types";
import {
  CATEGORY_PRIORITY,
  RULES_VERSION,
  SIMILARITY_THRESHOLD,
  TOO_SIMILAR_EFFECT,
  distance,
  selectThree,
  type CandidateListing,
  type Category,
  type ListingResult,
  type RuleTrace,
  type SelectionResult,
} from "@/lib/selection";

const REPORT_FILE = "REPORT-select-three.md";
const RUNNER_UPS_SHOWN = 5; // §9.2
const RANK_LIST_TOP = 10; // §9.7
const HISTOGRAM_EDGES = [0, 2, 4, 6, 10]; // §9.6: [0,2) [2,4) [4,6) [6,10) [10,∞)

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
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---------- the loaded pool ----------
type Loaded = {
  candidate: CandidateListing;
  plate: string;
  km_declared: number | null;
  dealer_id: number;
  seller: string; // display: name (dealer_type, dealer id)
  cell: string; // "comparison_group year"
};

// The reasons that can block each category (the library's reason strings, §4.1 and §11.3), for the eligibility counts.
const REASONS_OF: Record<Category, string[]> = {
  best_value: ["thin_cell", "no_deal_score"],
  peace_of_mind: ["thin_cell", "no_condition_by_reality"],
  cheapest: ["thin_cell", "no_condition_vs_typical", "below_typical"],
};

// The pick-loop part of a listing's trace, attributed to the category it was examined for (§4.7). The library
// records double_winner with `considered_for`; a too_similar burst carries only `vs_category`, so the burst for
// category c is recognised by its shape: one entry per category picked before c, in category order. All complete
// parses are collected; more than one (possible only under too_similar_effect 'excluded') is reported as ambiguous.
type Exam = { category: Category; kind: "won" | "double_winner" | "skipped_too_similar"; entries: RuleTrace[] };
function examinations(r: ListingResult, picks: SelectionResult["picks"]): Exam[] | "ambiguous" {
  const entries = r.trace.filter((t) => t.rule === "too_similar" || t.rule === "double_winner");
  const parses: Exam[][] = [];
  function go(ci: number, ei: number, acc: Exam[]) {
    if (ci === CATEGORY_PRIORITY.length) {
      if (ei === entries.length) parses.push(acc);
      return;
    }
    const c = CATEGORY_PRIORITY[ci];
    const won = r.category === c;
    const e = entries[ei];
    if (!won && e && e.rule === "double_winner" && e.context.considered_for === c) {
      go(ci + 1, ei + 1, [...acc, { category: c, kind: "double_winner", entries: [e] }]);
    }
    const before = CATEGORY_PRIORITY.slice(0, ci).filter((cc) => picks[cc] !== null);
    const burst = entries.slice(ei, ei + before.length);
    const isBurst = burst.length === before.length && burst.every((t, i) => t.rule === "too_similar" && t.context.vs_category === before[i]);
    if (won) {
      if (isBurst) go(ci + 1, ei + before.length, [...acc, { category: c, kind: "won", entries: burst }]);
      return; // the winner of c has exactly its burst for c
    }
    if (before.length > 0 && isBurst && burst.some((t) => t.triggered && t.effect === "excluded")) {
      go(ci + 1, ei + before.length, [...acc, { category: c, kind: "skipped_too_similar", entries: burst }]);
    }
    go(ci + 1, ei, acc); // not examined for c
  }
  go(0, 0, []);
  if (parses.length === 0) throw new Error(`listing ${r.listing_id}: the pick-loop trace does not parse: ${JSON.stringify(entries)}`);
  return parses.length === 1 ? parses[0] : "ambiguous";
}

async function main() {
  const now = new Date();
  const filters =
    [MAX_PRICE !== null ? `max-price=${MAX_PRICE}` : null, YEARS ? `years=${YEARS.from}-${YEARS.to}` : null].filter(Boolean).join(", ") ||
    "none (whole live pool)";

  // ---------- 1. load ----------
  const rows = await db.listings.findMany({
    where: { delisted_at: null },
    include: {
      car: { select: { id: true, license_plate: true, year: true, model: { select: { comparison_group: true } } } },
      market_stats: { select: { id: true, median_price: true, engine_version: true } },
      dealer: { select: { id: true, name: true, dealer_type: true, commercial: { select: { id: true, agreement_status: true, agreement_end: true } } } },
    },
    orderBy: { id: "asc" },
  });

  // version check over every live listing and every norm row it points at
  const badVersion = rows.filter((l) => l.engine_version !== ENGINE_VERSION || (l.market_stats !== null && l.market_stats.engine_version !== ENGINE_VERSION));
  if (badVersion.length) {
    for (const l of badVersion) {
      log(`  listing ${l.id} (${l.car.license_plate ?? "?"}): engine_version ${l.engine_version ?? "null"}, norm row ${l.market_stats?.id ?? "none"} engine_version ${l.market_stats?.engine_version ?? "-"}`);
    }
    throw new Error(`${badVersion.length} live listing(s) or norm row(s) not at engine version ${ENGINE_VERSION} — see above`);
  }

  // the pool after the search's filters
  const pool: Loaded[] = [];
  for (const l of rows) {
    const plate = l.car.license_plate ?? "?";
    if (l.car.year === null) throw new Error(`listing ${l.id} (${plate}): cars.year is null`);
    if (l.car.model.comparison_group === null) throw new Error(`listing ${l.id} (${plate}): models.comparison_group is null`);
    if (l.score_breakdown === null) throw new Error(`listing ${l.id} (${plate}): score_breakdown is null`);
    if (MAX_PRICE !== null && l.price > MAX_PRICE) continue;
    if (YEARS && (l.car.year < YEARS.from || l.car.year > YEARS.to)) continue;
    const breakdown = l.score_breakdown as unknown as ScoreResult;
    const priceRow = breakdown.rows.find((r: Row) => r.row === "price");
    if (!priceRow) throw new Error(`listing ${l.id} (${plate}): invoice has no price row`);
    if (priceRow.status === "scored" && l.market_stats === null) throw new Error(`listing ${l.id} (${plate}): price row scored but market_stats_id is null`);
    const median_price = priceRow.status === "scored" ? (l.market_stats?.median_price ?? null) : null;
    const seller_visible = l.dealer.commercial.some((c) => c.agreement_end === null);
    pool.push({
      candidate: {
        listing_id: l.id,
        car_id: l.car.id,
        price: l.price,
        first_seen_at: l.first_seen_at.toISOString(),
        year: l.car.year,
        comparison_group: l.car.model.comparison_group,
        median_price,
        seller_visible,
        breakdown,
      },
      plate,
      km_declared: l.km_declared,
      dealer_id: l.dealer.id,
      seller: `${l.dealer.name} (${l.dealer.dealer_type}, dealer ${l.dealer.id})`,
      cell: `${l.car.model.comparison_group} ${l.car.year}`,
    });
  }
  const byId = new Map(pool.map((p) => [p.candidate.listing_id, p]));

  // ---------- 2. preflight ----------
  const sellers = new Set(pool.map((p) => p.dealer_id));
  const openSellers = new Set(pool.filter((p) => p.candidate.seller_visible).map((p) => p.dealer_id));
  const visibleListings = pool.filter((p) => p.candidate.seller_visible).length;
  const commercialRows = await db.dealer_commercial.count();
  const openRows = await db.dealer_commercial.count({ where: { agreement_end: null } });

  log(`select-three — now = ${now.toISOString()}, RULES_VERSION = ${RULES_VERSION}, ENGINE_VERSION = ${ENGINE_VERSION}, too_similar_effect = ${TOO_SIMILAR_EFFECT}`);
  log(`filters: ${filters}; live listings: ${rows.length}; pool after filters: ${pool.length}`);
  log(`\n===== PREFLIGHT =====`);
  log(`sellers in the pool: ${sellers.size}`);
  log(`sellers with an open dealer_commercial row (agreement_end is null): ${openSellers.size}`);
  log(`listings whose seller is visible: ${visibleListings} of ${pool.length}`);
  log(`(dealer_commercial rows in total: ${commercialRows}; open rows: ${openRows})`);
  if (visibleListings === 0) {
    log(`\nSTOP: zero listings are visible — no seller in the pool has an open dealer_commercial row. The search was not run (§9).`);
    writeReport(`STOPPED at preflight (filters: ${filters})`);
    throw new Error("preflight: zero visible listings — stopped before the search");
  }

  // ---------- 3. the search ----------
  const res = selectThree({ listings: pool.map((p) => p.candidate) });
  const resultOf = new Map(res.results.map((r) => [r.listing_id, r]));
  const shown = res.results.filter((r) => r.status === "shown");
  const P = (id: number) => byId.get(id)!;
  const R = (id: number) => resultOf.get(id)!;
  const bd = (id: number) => P(id).candidate.breakdown;

  // ---------- 4. THE THREE ----------
  log(`\n===== THE THREE =====`);
  for (const c of CATEGORY_PRIORITY) {
    const id = res.picks[c];
    log(`\n--- ${c}`);
    if (id === null) {
      log(`  no pick: ${res.missing[c]}`);
      continue;
    }
    const p = P(id);
    const b = bd(id);
    const r = R(id);
    log(`  plate ${p.plate} | listing ${id} | year ${p.candidate.year} | price ${p.candidate.price} | km_declared ${p.km_declared ?? "-"} | rank ${r.rank}`);
    log(`  deal_score ${fmt(b.deal_score)} | condition_score ${fmt(b.condition_score)} | condition_by_reality ${fmt(b.condition_by_reality)} | typical_condition ${fmt(b.typical_condition)}`);
    log(`  seller ${p.seller} | verify_availability ${r.verify_availability}`);
    const own = examinations(r, res.picks);
    if (own === "ambiguous") {
      log(`  similarity vs earlier picks: ambiguous trace — the too_similar entries: ${JSON.stringify(r.trace.filter((t) => t.rule === "too_similar"))}`);
    } else {
      const winExam = own.find((e) => e.category === c);
      for (const t of winExam?.entries ?? []) {
        const vs = P(t.context.vs_listing_id as number);
        log(`  too_similar vs ${vs.plate} (${t.context.vs_category}): distance ${t.value ?? "null"} (same_cell ${t.context.same_cell}) — would fire at < ${t.threshold}: ${t.triggered ? "YES" : "no"}; effect in force: ${t.effect}`);
      }
    }
    // runner-ups examined for this category, before the winner
    const runnerUps: { id: number; text: string; place: number }[] = [];
    for (const other of shown) {
      if (other.listing_id === id) continue;
      const ex = examinations(other, res.picks);
      if (ex === "ambiguous") {
        runnerUps.push({ id: other.listing_id, place: Number.MAX_SAFE_INTEGER, text: "ambiguous trace (too_similar entries cannot be attributed to a category)" });
        continue;
      }
      const e = ex.find((x) => x.category === c);
      if (!e) continue;
      if (e.kind === "double_winner") {
        const ctx = e.entries[0].context;
        runnerUps.push({ id: other.listing_id, place: ctx.place_in_category as number, text: `double_winner — already won ${ctx.won} (place ${ctx.place_in_category} in ${c})` });
      } else if (e.kind === "skipped_too_similar") {
        const parts = e.entries.map((t) => `vs ${P(t.context.vs_listing_id as number).plate} (${t.context.vs_category}) distance ${t.value ?? "null"}${t.triggered ? " FIRED" : ""}`);
        runnerUps.push({ id: other.listing_id, place: Number.MAX_SAFE_INTEGER - 1, text: `too_similar — skipped: ${parts.join("; ")}` });
      }
    }
    runnerUps.sort((a, b) => a.place - b.place || a.id - b.id);
    if (runnerUps.length === 0) log(`  runner-ups examined before the winner: none (the first candidate in the ${c} order won)`);
    else {
      log(`  runner-ups examined before the winner (${runnerUps.length}, showing up to ${RUNNER_UPS_SHOWN}):`);
      for (const ru of runnerUps.slice(0, RUNNER_UPS_SHOWN)) {
        const q = P(ru.id);
        const qb = bd(ru.id);
        log(`    ${q.plate} | listing ${ru.id} | rank ${R(ru.id).rank} | price ${q.candidate.price} | deal ${fmt(qb.deal_score)} | reality ${fmt(qb.condition_by_reality)} | cvt ${fmt(qb.condition_vs_typical)} — ${ru.text}`);
      }
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

  // ---------- 6. ELIGIBILITY ----------
  log(`\n===== ELIGIBILITY (over the whole pool, ${res.results.length} listings) =====`);
  for (const c of CATEGORY_PRIORITY) {
    const eligible = res.results.filter((r) => r.eligibility[c]).length;
    const not = res.results.filter((r) => !r.eligibility[c]);
    log(`${c}: eligible ${eligible}, not ${not.length}`);
    for (const [k, n] of count(not.flatMap((r) => r.eligibility.reasons.filter((x) => REASONS_OF[c].includes(x))))) log(`  ${n.toString().padStart(4)}  ${k}`);
  }

  // ---------- 7. FINISH TEST ----------
  log(`\n===== FINISH TEST =====`);
  const pickIds = CATEGORY_PRIORITY.map((c) => res.picks[c]).filter((x): x is number => x !== null);
  const winners = res.results.filter((r) => r.category !== null);
  const ranks = shown.map((r) => r.rank as number).sort((a, b) => a - b);
  const checks: [string, boolean][] = [
    ["three picks present", pickIds.length === CATEGORY_PRIORITY.length],
    ["three distinct cars", new Set(pickIds.map((x) => R(x).car_id)).size === CATEGORY_PRIORITY.length],
    ["no car in two categories", winners.length === pickIds.length && new Set(winners.map((r) => r.car_id)).size === winners.length],
    ["shown ranks contiguous 1..n", ranks.every((v, i) => v === i + 1)],
    ["best_value pick has rank 1", res.picks.best_value !== null && R(res.picks.best_value).rank === 1],
  ];
  for (const [name, ok] of checks) log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  const finish = checks.every(([, ok]) => ok) ? "PASS" : "FAIL";
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
  log("rank | plate | year | price | deal_score | condition_score | condition_by_reality | category");
  for (const r of shown.slice(0, RANK_LIST_TOP)) {
    const p = P(r.listing_id);
    const b = bd(r.listing_id);
    log(`${r.rank} | ${p.plate} | ${p.candidate.year} | ${p.candidate.price} | ${fmt(b.deal_score)} | ${fmt(b.condition_score)} | ${fmt(b.condition_by_reality)} | ${r.category ?? "-"}${r.verify_availability ? " (verify availability)" : ""}`);
  }

  writeReport(`filters: ${filters} — finish test ${finish}`);
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
