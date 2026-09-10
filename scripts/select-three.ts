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
// The finish test (§3 of part 3) keeps three lines; distinct cars and double wins are reported, not failed.
// Rules v4 (part 5 §3–§4): each listing gets new_price = the latest published_at row of new_car_prices on the car's key. Since part 6
// the key is three columns, no split: new_car_prices.degem_code = models.degem_code (the same makeDegemCode string), sug_degem =
// models.vehicle_class, shnat_yitzur = cars.year; null when no row matches. The library's above_new_price rule (out at >= PRICE_VS_NEW_CEILING_PCT, effect ABOVE_NEW_PRICE_EFFECT) is reported as:
//   each pick's line gains `price / new = N%`; RANK LIST gains a `% of new` column;
//   NEW PRICE               the distribution of the value over the pool (min / median / max, per year), the count at or above the
//                           ceiling, and every listing without a new price (plate, codes, year, type).

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { ENGINE_VERSION } from "@/lib/scoring/constants";
import type { Row, ScoreResult } from "@/lib/scoring/types";
import {
  ABOVE_NEW_PRICE_EFFECT,
  CATEGORY_PRIORITY,
  CHEAPEST_CONDITION_FLOOR,
  DOUBLE_WINNER_EFFECT,
  PEACE_OF_MIND_DEAL_FLOOR,
  PEACE_OF_MIND_FLOOR_EFFECT,
  PRICE_VS_NEW_CEILING_PCT,
  RULES_VERSION,
  RUNNER_UP_DEAL_GAP,
  RUNNER_UP_PRICE_BAND_PCT,
  SIMILARITY_THRESHOLD,
  TOO_SIMILAR_EFFECT,
  categoryOrder,
  distance,
  selectThree,
  type CandidateListing,
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
// --model=<value>: compared to models.model uppercased and without whitespace, exactly as import-sheet.ts's --expect-model.
function modelKey(s: string): string {
  return s.toUpperCase().replace(/\s+/g, "");
}
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
type NewPriceKey = { degem_code: string; shnat_yitzur: number; sug_degem: string };
const keyText = (k: NewPriceKey) => `${k.degem_code}|${k.shnat_yitzur}|${k.sug_degem}`;

type Loaded = {
  candidate: CandidateListing;
  plate: string;
  km_declared: number | null;
  dealer_id: number;
  seller: string; // display: name (dealer_type, dealer id)
  cell: string; // "comparison_group year"
  codes: string; // "tozeret_cd-degem_cd" (models.degem_code)
  vehicle_class: string; // models.vehicle_class = the file's sug_degem
  key: NewPriceKey; // the key the new price is read by (degem_code, sug_degem, shnat_yitzur)
};

// The reasons that can block each category (the library's reason strings, §4.1, §11.3, part 3 §2a/§2c, part 4 §1), for the
// eligibility counts. The deal floor blocks peace_of_mind only under floor effect 'excluded'; under 'none' it is recorded.
const REASONS_OF: Record<Category, string[]> = {
  best_value: ["thin_cell", "no_deal_score"],
  peace_of_mind: ["thin_cell", "no_condition_by_reality", ...(PEACE_OF_MIND_FLOOR_EFFECT === "excluded" ? ["no_deal_score", "overpriced"] : [])],
  cheapest: ["thin_cell", "no_condition_vs_typical", "below_floor"],
};

async function main() {
  const now = new Date();
  // §13.3: open = agreement_end is null or later than this run's now. agreement_status plays no part.
  const isOpen = (end: Date | null) => end === null || end > now;
  const filters =
    [MAX_PRICE !== null ? `max-price=${MAX_PRICE}` : null, YEARS ? `years=${YEARS.from}-${YEARS.to}` : null].filter(Boolean).join(", ") ||
    "none (whole live pool)";

  // ---------- 1. load ----------
  const rows = await db.listings.findMany({
    where: { delisted_at: null },
    include: {
      car: { select: { id: true, license_plate: true, year: true, model: { select: { model: true, comparison_group: true, degem_code: true, vehicle_class: true } } } },
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

  // §1: the models among the live listings, keyed the way --model is compared. The model is the search's input: with
  // more than one model live the flag is required, an unknown value stops — both before any search is run.
  const present = new Map<string, { display: string; n: number }>();
  for (const l of rows) {
    if (l.car.model.model === null) throw new Error(`listing ${l.id} (${l.car.license_plate ?? "?"}): models.model is null`);
    const e = present.get(modelKey(l.car.model.model)) ?? { display: l.car.model.model, n: 0 };
    e.n += 1;
    present.set(modelKey(l.car.model.model), e);
  }
  const presentText = [...present.values()]
    .sort((a, b) => b.n - a.n || a.display.localeCompare(b.display))
    .map((e) => `${e.display} (${e.n} listing${e.n === 1 ? "" : "s"})`)
    .join(", ");
  if (MODEL === null && present.size > 1) {
    console.log(`models among the ${rows.length} live listings: ${presentText}`);
    throw new Error(`--model=<value> is required: the live listings span ${present.size} models — see the list above; no search was run`);
  }
  if (MODEL !== null && !present.has(modelKey(MODEL))) {
    console.log(`models among the ${rows.length} live listings: ${presentText}`);
    throw new Error(`--model: no live listing has model '${MODEL}' — see the list above; no search was run`);
  }
  const modelDisplay = MODEL === null ? [...present.values()][0].display : present.get(modelKey(MODEL))!.display;
  const modelListings = MODEL === null ? rows.length : present.get(modelKey(MODEL))!.n;

  // the pool after the model and the search's filters
  const pool: Loaded[] = [];
  for (const l of rows) {
    const plate = l.car.license_plate ?? "?";
    if (l.car.year === null) throw new Error(`listing ${l.id} (${plate}): cars.year is null`);
    if (l.car.model.comparison_group === null) throw new Error(`listing ${l.id} (${plate}): models.comparison_group is null`);
    if (l.car.model.degem_code === null) throw new Error(`listing ${l.id} (${plate}): models.degem_code is null`);
    if (!/^\d+-\d+$/.test(l.car.model.degem_code)) throw new Error(`listing ${l.id} (${plate}): models.degem_code '${l.car.model.degem_code}' is not 'tozeret_cd-degem_cd'`);
    if (l.car.model.vehicle_class === null) throw new Error(`listing ${l.id} (${plate}): models.vehicle_class is null`);
    if (l.score_breakdown === null) throw new Error(`listing ${l.id} (${plate}): score_breakdown is null`);
    if (l.car.model.model === null) throw new Error(`listing ${l.id} (${plate}): models.model is null`);
    if (MODEL !== null && modelKey(l.car.model.model) !== modelKey(MODEL)) continue;
    if (MAX_PRICE !== null && l.price > MAX_PRICE) continue;
    if (YEARS && (l.car.year < YEARS.from || l.car.year > YEARS.to)) continue;
    const breakdown = l.score_breakdown as unknown as ScoreResult;
    const priceRow = breakdown.rows.find((r: Row) => r.row === "price");
    if (!priceRow) throw new Error(`listing ${l.id} (${plate}): invoice has no price row`);
    if (priceRow.status === "scored" && l.market_stats === null) throw new Error(`listing ${l.id} (${plate}): price row scored but market_stats_id is null`);
    const median_price = priceRow.status === "scored" ? (l.market_stats?.median_price ?? null) : null;
    const seller_visible = l.dealer.commercial.some((c) => isOpen(c.agreement_end));
    pool.push({
      candidate: {
        listing_id: l.id,
        car_id: l.car.id,
        price: l.price,
        first_seen_at: l.first_seen_at.toISOString(),
        year: l.car.year,
        comparison_group: l.car.model.comparison_group,
        median_price,
        new_price: null, // filled below from new_car_prices
        seller_visible,
        breakdown,
      },
      plate,
      km_declared: l.km_declared,
      dealer_id: l.dealer.id,
      seller: `${l.dealer.name} (${l.dealer.dealer_type}, dealer ${l.dealer.id})`,
      cell: `${l.car.model.comparison_group} ${l.car.year}`,
      codes: l.car.model.degem_code,
      vehicle_class: l.car.model.vehicle_class,
      key: { degem_code: l.car.model.degem_code, shnat_yitzur: l.car.year, sug_degem: l.car.model.vehicle_class },
    });
  }
  const byId = new Map(pool.map((p) => [p.candidate.listing_id, p]));

  // part 5 §4 / part 6: new_price = the latest published_at row on the car's key (degem_code, sug_degem, shnat_yitzur); null when none.
  // One query for the pool's keys.
  const wanted = new Map<string, NewPriceKey>();
  for (const p of pool) wanted.set(keyText(p.key), p.key);
  const priceRows = wanted.size
    ? await db.new_car_prices.findMany({ where: { OR: [...wanted.values()] }, orderBy: [{ published_at: "desc" }, { id: "desc" }] })
    : [];
  const latest = new Map<string, { mehir: number; published_at: Date }>();
  for (const r of priceRows) {
    const k = keyText(r);
    if (!latest.has(k)) latest.set(k, { mehir: r.mehir, published_at: r.published_at }); // first = latest published_at
  }
  for (const p of pool) p.candidate.new_price = latest.get(keyText(p.key))?.mehir ?? null;
  const withNewPrice = pool.filter((p) => p.candidate.new_price !== null).length;
  const publications = [...new Set([...latest.values()].map((v) => v.published_at.toISOString().slice(0, 10)))].sort();

  // ---------- 2. preflight ----------
  const sellers = new Set(pool.map((p) => p.dealer_id));
  const openSellers = new Set(pool.filter((p) => p.candidate.seller_visible).map((p) => p.dealer_id));
  const visibleListings = pool.filter((p) => p.candidate.seller_visible).length;
  const commercialRows = await db.dealer_commercial.count();
  const openRows = await db.dealer_commercial.count({ where: { OR: [{ agreement_end: null }, { agreement_end: { gt: now } }] } });

  log(
    `select-three — now = ${now.toISOString()}, RULES_VERSION = ${RULES_VERSION}, ENGINE_VERSION = ${ENGINE_VERSION}, too_similar_effect = ${TOO_SIMILAR_EFFECT}, double_winner_effect = ${DOUBLE_WINNER_EFFECT}, peace_of_mind_floor_effect = ${PEACE_OF_MIND_FLOOR_EFFECT}, above_new_price_effect = ${ABOVE_NEW_PRICE_EFFECT}`,
  );
  log(
    `constants: CHEAPEST_CONDITION_FLOOR = ${CHEAPEST_CONDITION_FLOOR}, PEACE_OF_MIND_DEAL_FLOOR = ${PEACE_OF_MIND_DEAL_FLOOR}, RUNNER_UP_PRICE_BAND_PCT = ${RUNNER_UP_PRICE_BAND_PCT}, RUNNER_UP_DEAL_GAP = ${RUNNER_UP_DEAL_GAP}, PRICE_VS_NEW_CEILING_PCT = ${PRICE_VS_NEW_CEILING_PCT}`,
  );
  log(`model: ${modelDisplay}${MODEL === null ? " (the only model live; --model not given)" : ` (--model=${MODEL})`} — ${modelListings} live listing(s) of this model`);
  log(`filters: ${filters}; live listings: ${rows.length}; pool after filters: ${pool.length}`);
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
  const pctOfNew = (id: number): number | null => R(id).trace.find((t) => t.rule === "above_new_price")?.value ?? null;
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
      log(`  deal_score ${fmt(b.deal_score)} | condition_score ${fmt(b.condition_score)} | condition_by_reality ${fmt(b.condition_by_reality)} | typical_condition ${fmt(b.typical_condition)}`);
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
      log(`  recorded: value (gap) ${fmt(ru.value)} | threshold ${ru.threshold} | triggered ${ru.triggered ? "YES" : "no"} | runner-up ${rp.plate} (listing ${rp.candidate.listing_id}) | price_over_pct ${ru.context.price_over_pct}`);
    }
    const summary = res.runner_ups.cheapest;
    log(`  runner_ups.cheapest: ${summary ? `listing ${summary.listing_id} (${P(summary.listing_id).plate}), gap ${fmt(summary.gap)}, price_over_pct ${summary.price_over_pct}, triggered ${summary.triggered}` : "null"}`);
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
  log(`\n===== CHEAPEST BAR tuning (in force: CHEAPEST_CONDITION_FLOOR = ${CHEAPEST_CONDITION_FLOOR}) =====`);
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

  // ---------- 7. FINISH TEST ----------
  log(`\n===== FINISH TEST =====`);
  const pickIds = CATEGORY_PRIORITY.map((c) => res.picks[c]).filter((x): x is number => x !== null);
  const ranks = shown.map((r) => r.rank as number).sort((a, b) => a - b);
  const checks: [string, boolean][] = [
    ["three picks present", pickIds.length === CATEGORY_PRIORITY.length],
    ["shown ranks contiguous 1..n", ranks.every((v, i) => v === i + 1)],
    ["best_value pick has rank 1", res.picks.best_value !== null && R(res.picks.best_value).rank === 1],
  ];
  for (const [name, ok] of checks) log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  // part 3 §3: reported, non-failing
  const distinctCars = new Set(pickIds.map((x) => R(x).car_id)).size;
  const doubleWinners = res.results.filter((r) => r.categories.length > 1);
  log(`  info distinct cars among the picks: ${distinctCars}`);
  log(`  info double wins: ${doubleWinners.length}${doubleWinners.map((r) => ` (car ${P(r.listing_id).plate} won ${r.categories.join(" + ")})`).join("")}`);
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
  log("rank | plate | year | price | % of new | deal_score | condition_score | condition_by_reality | categories");
  for (const r of shown.slice(0, RANK_LIST_TOP)) {
    const p = P(r.listing_id);
    const b = bd(r.listing_id);
    log(`${r.rank} | ${p.plate} | ${p.candidate.year} | ${p.candidate.price} | ${pctText(r.listing_id)} | ${fmt(b.deal_score)} | ${fmt(b.condition_score)} | ${fmt(b.condition_by_reality)} | ${r.categories.length ? r.categories.join(" + ") : "-"}${r.verify_availability ? " (verify availability)" : ""}`);
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
