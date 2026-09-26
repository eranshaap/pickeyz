// Loading a stored question by its address (BRIEF Run 6b §3.2) — the ONE function every screen goes through.
//
// The rule (findCar-now.md, restated in §3.2): an address carries a QUESTION, never a run. Resolving it means
//   resolve the question  -> the `searches` row with that public_id, and every re-run that points at it
//   latestRun()           -> which of them the address currently displays
//   updateSignals()       -> has anything changed since that run was computed?
//   no update             -> the latest run and its STORED `search_results`, exactly as they are. NOTHING is written.
//   an update             -> §4's re-run, in place, and the new run and its rows are what the address shows.
// The results screen and the car page both go through loadForAddress(), so there is one loading path and one
// place that can write a re-run.
//
// The shape follows observe.ts: the pure decisions first, the DB-facing functions after them in the same
// file with the client imported ON USE, so load.test.ts exercises every rule without a database.
//
// THE DAY SIGNAL IS AN ISRAEL DAY (§3.2) — `Intl.DateTimeFormat` with `Asia/Jerusalem`, never a fixed
// offset: Israel moves between UTC+2 and UTC+3 and a fixed offset is wrong for half of every year. The one
// definition of a day lives in src/lib/display/texts.ts and the licence rubric uses the same one.

import { existsSync } from "node:fs";
import path from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import { currentOwnershipType, groupCards, ownershipWord, shownCarsCount } from "@/lib/display/cards";
import { groupHead, uncrownedHead, zeroScoredHead, type Head } from "@/lib/display/edge-screens";
import { israelDay, percentOfNewLine } from "@/lib/display/texts";
import { CROWNING_THRESHOLD } from "@/lib/selection/constants";
import type { Category, RuleTrace } from "@/lib/selection";
import type { ModelRows } from "./chip-state";
import type { SearchFilters } from "./filters";
// Days 24–25 §2 — the list's one assembly and the row view it returns. Pure modules: they bring no database.
import { assembleList, type ListRow, type ListRowData, type ListView } from "./list";

// ---------------------------------------------------------------------------
// the rows this module works on
// ---------------------------------------------------------------------------

/** The `searches` columns the loading rule reads. A question and a re-run are the same shape. */
export type SearchRow = {
  id: number;
  public_id: string;
  rerun_of: number | null;
  created_at: Date;
  model_searched: string;
  family_id: number | null;
  filters: Prisma.JsonValue;
  priority: string | null;
  engine_version: number;
  rules_version: number;
  results_count: number;
  pool_count: number | null;
};

/**
 * One row of the displayed run's ranking — what the results screen and the car page read.
 *
 * Run 1 §2.3 — two columns were added to the read for the recommendations screen, and nothing else about
 * these files changed: `new_car_price_id`, the new-price row this search measured the ceiling against (the
 * card's "X% ממחיר החדש" is the page's own function over it), and `stage_b_trace`, which is where the
 * cheapest pick's `cheapest_runner_up` record lives (§0.3c). Both are read-only.
 */
export type ResultRow = {
  listing_id: number;
  rank: number | null;
  recommendation_categories: string[];
  total_score: number | null;
  confidence: string | null;
  price_snapshot: number;
  km_snapshot: number | null;
  market_stats_id: number | null;
  listing_scores_id: number | null;
  new_car_price_id: number | null;
  /** The rule records of this row, as `results.ts` truncated them. A recommended row carries its full set. */
  stage_b_trace: Prisma.JsonValue;
};

/** The two ids a re-run records for the viewer whose load triggered it. Either may be absent (§4). */
export type Viewer = { visitor_id: string | null; session_id: string | null };

/** The versions in force right now — the `version` signal compares the run's against these. */
export type CurrentVersions = { engineVersion: number; rulesVersion: number };

export type UpdateSignals = { data: boolean; day: boolean; version: boolean };

// ---------------------------------------------------------------------------
// pure: which run does this address display?
// ---------------------------------------------------------------------------

/**
 * §3.2 — the newest of the question and its re-runs, by `created_at`; a tie goes to the greater `id`.
 * With no re-runs the answer is the question itself, which is the state of the whole table today.
 */
export function latestRun(question: SearchRow, reruns: SearchRow[]): SearchRow {
  let best = question;
  for (const r of reruns) {
    const newer = r.created_at.getTime() - best.created_at.getTime();
    if (newer > 0 || (newer === 0 && r.id > best.id)) best = r;
  }
  return best;
}

// ---------------------------------------------------------------------------
// pure: has anything changed since that run?
// ---------------------------------------------------------------------------

/**
 * §3.2 — the three signals. An update is ANY of them.
 *
 *   data     a listing of the searched model, or a dealer's commercial row, was written after the run.
 *            `listings.updated_at` and `dealer_commercial.updated_at` are stamped by the DATABASE on every
 *            insert and update (Run 6a), so a hand edit in the Supabase editor counts. A null max on either
 *            side does not fire that side — nothing to compare is not a change.
 *   day      the calendar day of `now` differs from the run's, IN ISRAEL TIME.
 *   version  the engine or the rules moved under the stored verdict.
 */
export function updateSignals(
  run: Pick<SearchRow, "created_at" | "engine_version" | "rules_version">,
  now: Date,
  current: CurrentVersions,
  maxModelListingUpdatedAt: Date | null,
  maxDealerCommercialUpdatedAt: Date | null,
): UpdateSignals {
  const after = (at: Date | null) => at !== null && at.getTime() > run.created_at.getTime();
  return {
    data: after(maxModelListingUpdatedAt) || after(maxDealerCommercialUpdatedAt),
    day: israelDay(now) !== israelDay(run.created_at),
    version: run.engine_version !== current.engineVersion || run.rules_version !== current.rulesVersion,
  };
}

/** An update = any of the three. */
export function isUpdate(s: UpdateSignals): boolean {
  return s.data || s.day || s.version;
}

/**
 * The stored `filters` JSON read back as the filters a search cuts with. A row written by runSearch holds
 * exactly the object the action received, so this is a narrowing and never a translation.
 */
export function storedFilters(filters: Prisma.JsonValue): SearchFilters {
  if (filters === null || typeof filters !== "object" || Array.isArray(filters)) return {};
  return filters as SearchFilters;
}

// ---------------------------------------------------------------------------
// Run 1 §2 — THE SEARCH ANSWER: one view, both paths
// ---------------------------------------------------------------------------
//
// §2.1 — resultsView() is the ONE builder that turns a search's stored rows into what the recommendations
// screen draws, and both paths go through it FROM THE SAME ROWS: the load-by-id (`/?s=`) hands it the rows it
// just read, and the fresh search hands it the rows runSearch() has just written and read back. Before this
// run the two paths each assembled their own card payload — one in the route file, one in the action — which
// is exactly how a fresh answer and the answer at its own address come to differ.
//
// §2.2 — NOTHING IS STORED. No schema change, no new column, no write: the view is derived at load and at
// search time from `search_results` + `listings` + `cars` + the new-price row the search measured against.
// This run changes no version, so no stored search re-runs on account of it.
//
// The decision is pure and the fetching is not, split the way the rest of this file is split:
// resultsViewFrom() below is the whole rule and is tested on literal rows, and resultsView() at the bottom is
// the query that feeds it.

/**
 * Run 2 §3.4 — ONE MAPPING FOR EVERY DRAWN CAR: a pick, the runner-up, a place card, a table row. It was the
 * pick's own mapping and it is now every drawn car's, so a car cannot read one way on a card and another way
 * in a row. Every value here is the CAR PAGE's.
 */
export type DrawnCar = {
  /** The listing the card or the row is about — its page is `/listing/{public_id}?s={the question's public_id}`. */
  public_id: string;
  /** Exactly the string CarTitle receives on this listing's page: `models.model`. */
  model: string;
  year: number | null;
  price: number;
  /** The car page's own percentOfNewLine(); null when the search's key had no new-price row. */
  new_price_pct: string | null;
  /** `listings.km_declared` — the ad's km (findCar-now.md, "הערכים", 25/09). null → the page's "—". */
  km: number | null;
  /** The יד rubric's big value: the ad's hand, else the registry's. null → the page's "—". */
  hand: number | null;
  /** The CODE of the ownership the car page's legend marks `הבעלות הנוכחית`. null → the page's "—". */
  ownership_type: string | null;
  /** The page's photo source. null → the page's placeholder. */
  image: string | null;
  /** Days 22–23: the justification generator fills this. Until then nothing draws a sentence line at all. */
  sentence: string | null;
};

/** One card of the recommendations screen: the drawn car, plus what only a PICK has. */
export type ViewCard = DrawnCar & {
  /** Every label this card carries, in CATEGORY_ORDER. */
  categories: Category[];
  color: string;
};

// Days 24–25 Run 1 §2.1 — ViewPlace IS GONE. The below-threshold screen's scored floor is drawn by the same
// PlaceCard the bottom list draws, from the same row view, so there is one row type and not two: `ListRow`
// (src/lib/search/list.ts), whose `place` is the DISPLAYED place of §1 rather than the stored rank.

/** The runner-up strip's data — only ever set when the cheapest pick recorded one. */
export type ViewRunnerUp = {
  public_id: string;
  model: string;
  year: number | null;
  /** The runner-up's snapshot price less the cheapest pick's (§2.1). Positive by rule. */
  amount: number;
  /** Days 22–23: the justification generator fills this. */
  fact: string | null;
};

/**
 * Run 2 §3.1 — WHICH SCREEN this search's stored rows draw. One field, decided from the rows and the counts.
 *   zero_results  no shown row at all — the filters emptied the pool (§6)
 *   zero_scored   shown rows, none of them with a price comparison (§5, without the scored floor)
 *   uncrowned     the crowning gate triggered: the cars, in order, with no picks (§5)
 *   crowned       the three cards, as Run 1 built them
 */
export type ResultsState = "zero_results" | "zero_scored" | "uncrowned" | "crowned";

/**
 * Run 2 §3.2 — the three numbers the heads and the gate are read off, and where they came from.
 *   cars             the cars the screen displays (Run 1's `cars_shown`, per car after the merge)
 *   with_comparison  the shown rows with a deal score
 *   eligible         of those, the rows eligible to win (rules v7 §1.2)
 *   threshold        CROWNING_THRESHOLD, as the selection library holds it
 *   source           'record' — the rank-1 row's `crowning_threshold` record carried the two counts;
 *                    'recount' — it did not (rows written before version 7), so they were counted off the rows
 */
export type ResultsCounts = {
  cars: number;
  with_comparison: number;
  eligible: number;
  threshold: number;
  source: "record" | "recount";
};

export type ResultsView = {
  /** The question's public_id — the `?s=` every link on the screen carries. */
  public_id: string;
  /** §3.1 — which of the four screens these rows draw. */
  state: ResultsState;
  /** §3.2 — the counts behind the head and the gate. */
  counts: ResultsCounts;
  /** §3.3 — the two lines at the top of an uncrowned or zero-scored screen; null on the other two. */
  head: Head | null;
  cards: ViewCard[];
  runner_up: ViewRunnerUp | null;
  /**
   * Days 24–25 §2.2 — THE BOTTOM LIST, assembled from the same classified rows as everything below. It is
   * built in every state (it is the one place `x` is counted) and DRAWN on the crowned screen alone: the two
   * uncrowned screens draw their own floor and their own groups, from the fields under this one.
   */
  list: ListView;
  /**
   * §3.5 — the scored floor of the uncrowned screen, by displayed place (which on an uncrowned search equals
   * the stored rank — no picks, so nothing sits above it). Empty in the other three states.
   */
  places: ListRow[];
  /** §3.5 — the cars with no price comparison, in their stored order, cancelled ones left out. */
  unscored: ListRow[];
  /** Days 24–25 §4.7 — the cars in final cancellation, in their stored order; the last group of the screen. */
  cancelled: ListRow[];
  /**
   * §3.5 — the group object above `unscored`, on the uncrowned screen only (the zero-scored screen's own head
   * already says it). The cancelled group's object is `list.cancelledGroup`, which every screen that draws the
   * group reads — it has no such per-screen rule.
   */
  group: Head | null;
  /**
   * X of "נבחרו מתוך X רכבים." — Run 1's name for the number, now read from ONE source: `list.x`, the cars the
   * screen shows (§2.2). The count line itself belongs to the crowned screen alone (§3.3).
   */
  cars_shown: number;
};

/**
 * The per-listing facts the view needs beside the row: what `listings` and `cars` say now, which is what the
 * car page says. Supplied for the picked listings and for the runner-up, and for nobody else.
 */
export type ListingFacts = {
  public_id: string;
  car_id: number;
  /** `models.model` — the very string the car page hands CarTitle. */
  model: string;
  year: number | null;
  price: number;
  km_declared: number | null;
  hand_declared: number | null;
  /** `cars.hand` — the registry's hand, the יד rubric's fallback. */
  registry_hand: number | null;
  ownership_history: { ym: string; type: string }[];
  /** The page's `imageSrc`, already resolved (the resolver reads the filesystem and cannot be pure). */
  image: string | null;
};

/**
 * §0.3f / §1.7 — is this row one the search SHOWS?
 *
 * `rank` is the answer and the trace is not. selectThree gives a rank to exactly the rows it kept —
 * "1..n contiguous; null when not shown" (selection/types.ts) — and a row it removed (a merged `duplicate`, a
 * strong `sold_signal`, `below_threshold`, `above_new_price`, `dealer_not_visible`) has rank null. The trace
 * cannot decide it from either side: the sold gate stops before any rule runs and writes NO record at all,
 * and `too_similar` records the effect `excluded` on rows that are shown and merely lost a category.
 */
export function isShownRow(row: Pick<ResultRow, "rank">): boolean {
  return row.rank !== null;
}

/** The rule whose record carries the cheapest pick's runner-up (selection/types.ts, RuleName). */
const RUNNER_UP_RULE = "cheapest_runner_up";

/** Run 2 §1.4 — the rule whose record carries the crowning gate's verdict and its two counts. */
const CROWNING_RULE = "crowning_threshold";

/** The category the runner-up rule is recorded on (selection/types.ts, Category). */
const CHEAPEST: Category = "cheapest";

/** A stored row's rule records, narrowed. The column is JSON; a row written by results.ts holds an array. */
function traceOf(row: ResultRow): RuleTrace[] {
  return Array.isArray(row.stage_b_trace) ? (row.stage_b_trace as unknown as RuleTrace[]) : [];
}

/**
 * §0.3c / §2.1 — the runner-up's LISTING, read off the stored rows.
 *
 * `compare.ts`'s readRunnerUp() reads the same record but only from a FRESH SelectionResult, so it is of no
 * use to a screen rendering a stored search; this is the stored-row reading of it. The record is reachable
 * because `results.ts` keeps the FULL trace of every recommended row whatever its rank (traceFor), and the
 * cheapest pick's row is recommended by definition — so the one `cheapest_runner_up` record it carries is in
 * the column.
 *
 *   no cheapest pick / no record          → null (§2.1: present whenever the record exists)
 *   the record says it was not evaluated  → null
 *   two records                           → a throw; one row can only have been measured once
 */
export function storedRunnerUpListing(rows: readonly ResultRow[]): number | null {
  const cheapest = rows.find((r) => r.recommendation_categories.includes(CHEAPEST));
  if (cheapest === undefined) return null;
  const entries = traceOf(cheapest).filter((t) => t.rule === RUNNER_UP_RULE);
  if (entries.length === 0) return null;
  if (entries.length > 1) {
    throw new Error(`storedRunnerUpListing: listing ${cheapest.listing_id} carries ${entries.length} ${RUNNER_UP_RULE} records — the rule is measured once`);
  }
  const entry = entries[0];
  if (entry.context.evaluated === false) return null; // no candidate in the band
  const listing_id = entry.context.runner_up;
  if (typeof listing_id !== "number") {
    throw new Error(`storedRunnerUpListing: listing ${cheapest.listing_id}'s ${RUNNER_UP_RULE} record was evaluated but names no runner_up`);
  }
  return listing_id;
}

/** A row has a price comparison when it is shown and carries a deal score — `total_score` is the answer. */
const hasComparison = (row: ResultRow): boolean => isShownRow(row) && row.total_score !== null;

/** A rule record of this row that fired with the `ineligible` effect — the rule's own verdict (rules v5 §0.1). */
const firedIneligible = (row: ResultRow, rule: string): boolean => traceOf(row).some((t) => t.rule === rule && t.effect === "ineligible");

// Days 24–25 §1.1 — isCancelledRow() is GONE from this file: which kind a stored row is — hidden, pick,
// cancelled, ranked or no_price — is classifyRow()'s one answer (src/lib/search/places.ts), and the cancelled
// group, the no-price group and the scored floor are all read off it. Nothing here reads the trace for a kind.

/**
 * §3.2 — the counts, from the record when it is there and from a recount over the rows when it is not.
 *
 * `cars` is always Run 1's shownCarsCount over the rows (one per car, after the merge). The other two come from
 * the rank-1 row's `crowning_threshold` record — which rows written by version 7 carry, and rows written before
 * it do not. The recount is the reading Run 1's read-back used: a shown row with a `total_score`, and among
 * those the rows on which neither `unverified_history` nor `cancelled` fired with the `ineligible` effect
 * (rules v7 §1.2 — the same two verdicts, so record and recount cannot disagree).
 */
export function resultsCounts(rows: readonly ResultRow[], car_id_of: ReadonlyMap<number, number>): ResultsCounts {
  const cars = shownCarsCount(
    rows.map((r) => {
      const car_id = car_id_of.get(r.listing_id);
      if (car_id === undefined) throw new Error(`resultsView: listing ${r.listing_id} has no car_id — search_results and listings disagree`);
      return { car_id, shown: isShownRow(r) };
    }),
  );

  const record = crowningRecord(rows);
  if (record !== null) {
    const { eligible, with_comparison } = record.counts;
    return { cars, with_comparison, eligible, threshold: CROWNING_THRESHOLD, source: "record" };
  }

  let with_comparison = 0;
  let eligible = 0;
  for (const r of rows) {
    if (!hasComparison(r)) continue;
    with_comparison += 1;
    if (!firedIneligible(r, "unverified_history") && !firedIneligible(r, "cancelled")) eligible += 1;
  }
  return { cars, with_comparison, eligible, threshold: CROWNING_THRESHOLD, source: "recount" };
}

/**
 * §1.4 / §3.1 — the crowning gate's record, off the rank-1 row. null when no row carries it: either no row is
 * shown, or the rows were written before version 7 (the read-back's case, never the site's after deploy).
 * Two records on one row is a contradiction, not a choice — the gate is measured once.
 */
function crowningRecord(rows: readonly ResultRow[]): { triggered: boolean; counts: { eligible: number; with_comparison: number } } | null {
  const first = rows.find((r) => r.rank === 1);
  if (first === undefined) return null;
  const entries = traceOf(first).filter((t) => t.rule === CROWNING_RULE);
  if (entries.length === 0) return null;
  if (entries.length > 1) {
    throw new Error(`resultsView: listing ${first.listing_id} carries ${entries.length} ${CROWNING_RULE} records — the gate is measured once`);
  }
  const e = entries[0];
  const eligible = e.context.eligible;
  const with_comparison = e.context.with_comparison;
  if (typeof eligible !== "number" || typeof with_comparison !== "number") {
    throw new Error(`resultsView: listing ${first.listing_id}'s ${CROWNING_RULE} record does not carry both counts`);
  }
  return { triggered: e.triggered, counts: { eligible, with_comparison } };
}

/**
 * §3.1 — which screen, in this order: no shown row → zero_results; no car with a price comparison →
 * zero_scored; then the gate's record, when the rows carry one. Rows written before version 7 carry none, and
 * then a search with cards is crowned and one without is not — which is exactly what the read-back reads.
 */
export function resultsState(rows: readonly ResultRow[], counts: Pick<ResultsCounts, "with_comparison">): ResultsState {
  if (!rows.some(isShownRow)) return "zero_results";
  if (counts.with_comparison === 0) return "zero_scored";
  const record = crowningRecord(rows);
  if (record !== null) return record.triggered ? "uncrowned" : "crowned";
  return rows.some((r) => r.recommendation_categories.length > 0) ? "crowned" : "uncrowned";
}

/**
 * §3.5, as Days 24–25 §2.2 re-cut it — which listings a search DRAWS, so that ONE query reads the details of
 * all of them and of nobody else.
 *
 * IT IS NOW EVERY NON-HIDDEN ROW, in every state. Before this run the crowned path read the picks and the
 * runner-up and nothing else, because nothing was drawn under the cards; the bottom list draws every car the
 * search shows — the ranked rows, the no-price group and the cancelled group — so the crowned path reads what
 * the two uncrowned screens already read. A `hidden` row (rank null: a merged duplicate, a listing Stage B took
 * out) is drawn nowhere and is not read.
 *
 * The runner-up is added explicitly, as before: it is a shown row by rule, and the rule is not this function's
 * to re-derive.
 */
export function drawnListingIds(rows: readonly ResultRow[]): number[] {
  const ids = new Set<number>();
  for (const r of rows) if (isShownRow(r)) ids.add(r.listing_id);
  const runnerUpId = storedRunnerUpListing(rows);
  if (runnerUpId !== null) ids.add(runnerUpId);
  return [...ids];
}

/**
 * §2.1 — the whole view, from the rows and the facts. Pure: no database, no clock, no filesystem.
 *
 * The picks come from the rows exactly as the route file read them before this run: the first row carrying a
 * category is that category's pick (there is only ever one). The grouping, the slot order, the colour and the
 * count are the tested library's (src/lib/display/cards.ts) and are not restated here.
 */
export function resultsViewFrom(input: {
  question_public_id: string;
  rows: readonly ResultRow[];
  /** Every DRAWN listing (§3.5, drawnListingIds): every non-hidden row, plus the runner-up. */
  facts: ReadonlyMap<number, ListingFacts>;
  /** Every row's listing → its car, for the count. */
  car_id_of: ReadonlyMap<number, number>;
  /** `new_car_prices.id` → that row's `mehir`. */
  new_price_of: ReadonlyMap<number, number>;
}): ResultsView {
  const { rows, facts } = input;

  const rowOfListing = new Map(rows.map((r) => [r.listing_id, r]));
  const factsOf = (listing_id: number, what: string): ListingFacts => {
    const f = facts.get(listing_id);
    if (f === undefined) throw new Error(`resultsView: ${what} listing ${listing_id} has no listings row — search_results and listings disagree`);
    return f;
  };

  /**
   * §3.4 — THE ONE MAPPING, for a pick, the runner-up, a place card or a table row alike. It was the pick's
   * own and is not rewritten: the same fields, the same rules, the same comments.
   */
  const listingView = (row: ResultRow, f: ListingFacts): DrawnCar => {
    const newPrice = row.new_car_price_id === null ? null : (input.new_price_of.get(row.new_car_price_id) ?? null);
    return {
      public_id: f.public_id,
      model: f.model,
      year: f.year,
      price: f.price,
      new_price_pct: newPrice === null ? null : percentOfNewLine(f.price, newPrice),
      km: f.km_declared,
      // The יד rubric's rule (rubrics.ts, handRubric): the ad's hand, and an ad with no hand declaration
      // shows the registry's. load.test.ts pins this against handRubric() itself, so the card and the page
      // cannot drift apart.
      hand: f.hand_declared ?? f.registry_hand,
      ownership_type: currentOwnershipType(f.ownership_history),
      image: f.image,
      // THE SEAM — Days 22–23 / Days 24–25 §3. The justification generator fills FOUR fields and they are all
      // here, in this one place: a card's `sentence` (below), the runner-up strip's `fact` (further down), and
      // every list row's `sentence` and `tag` (listRowData, below). Nothing else fills any of them.
      sentence: null,
    };
  };
  const drawn = (listing_id: number, what: string): DrawnCar => {
    const row = rowOfListing.get(listing_id);
    if (row === undefined) throw new Error(`resultsView: ${what} listing ${listing_id} is not among the search's rows`);
    return listingView(row, factsOf(listing_id, what));
  };

  /**
   * Days 24–25 §2.1 — one row of the LIST, from the very same mapping: the same km, the same hand rule, the
   * same ownership — as a WORD here, because a row prints the word and a card's rubric prints it too
   * (ownershipWord is the one table). `sentence` and `tag` are the generator's two fields on a row (§3).
   */
  const listRowData = (listing_id: number): ListRowData => {
    const car = drawn(listing_id, "list row");
    return {
      public_id: car.public_id,
      href: `/listing/${car.public_id}?s=${input.question_public_id}`,
      model: car.model,
      year: car.year,
      price: car.price,
      km: car.km,
      hand: car.hand,
      ownership_word: car.ownership_type === null ? null : ownershipWord(car.ownership_type),
      image: car.image,
      sentence: "", // §3 — the generator's
      tag: "", // §3 — the generator's
    };
  };

  // §3.2 / §3.1 — the counts first, then the screen they decide.
  const counts = resultsCounts(rows, input.car_id_of);
  const state = resultsState(rows, counts);

  // the picks: one listing per category, the first row that carries it
  const picks: Record<Category, number | null> = { best_value: null, peace_of_mind: null, cheapest: null };
  for (const row of rows) {
    for (const c of row.recommendation_categories) {
      const category = c as Category;
      if (picks[category] === null) picks[category] = row.listing_id;
    }
  }

  const cards: ViewCard[] = groupCards(picks).map((card) => ({
    ...drawn(card.listing, "picked"),
    categories: card.categories,
    color: card.color,
  }));

  // §2.1 — the runner-up, whenever the cheapest pick recorded one. Also when `cheapest` is one label of a
  // multi-winner card: the record sits on that pick's row whatever else it won.
  let runner_up: ViewRunnerUp | null = null;
  const runnerUpId = storedRunnerUpListing(rows);
  if (runnerUpId !== null) {
    const cheapestId = picks[CHEAPEST];
    if (cheapestId === null) throw new Error(`resultsView: a ${RUNNER_UP_RULE} record was read but no row carries the cheapest category`);
    const cheapestRow = rowOfListing.get(cheapestId);
    const runnerUpRow = rowOfListing.get(runnerUpId);
    if (cheapestRow === undefined || runnerUpRow === undefined) {
      throw new Error(`resultsView: the runner-up ${runnerUpId} of cheapest pick ${cheapestId} has no row in this search — a runner-up is always in the same cut pool`);
    }
    const f = factsOf(runnerUpId, "runner-up");
    runner_up = {
      public_id: f.public_id,
      model: f.model,
      year: f.year,
      amount: runnerUpRow.price_snapshot - cheapestRow.price_snapshot,
      fact: null, // Days 22–23: the justification generator fills this
    };
  }

  // Days 24–25 §2.2 — THE LIST, from the same rows and the same one load, in every state. It is the crowned
  // screen's whole bottom half and it is also where the two uncrowned screens' floor and groups come from, so
  // there is one classification and one assembly on the site and not one per screen.
  const list = assembleList(rows, listRowData);

  // §3.5 — the two edge screens' own reading of the same lists. In `crowned` and `zero_results` these are
  // empty: the crowned screen draws `list` and the zero-results screen draws nothing.
  const draws = state === "uncrowned" || state === "zero_scored";
  // With no picks the displayed place equals the stored rank (§1.2), so this IS the scored floor in rank order.
  const places: ListRow[] = !draws ? [] : [...list.cards, ...list.table, ...list.restRanked];
  const unscored: ListRow[] = !draws ? [] : list.noPrice;
  const cancelled: ListRow[] = !draws ? [] : list.cancelled;

  // §3.3 — the head, per state. The count line is the crowned screen's alone and is not computed here.
  const head: Head | null =
    state === "uncrowned" ? uncrownedHead(counts) : state === "zero_scored" ? zeroScoredHead(unscored.length) : null;
  // §3.5 — the group object: the uncrowned screen only. The zero-scored screen's own head already says it.
  const group: Head | null = state === "uncrowned" && unscored.length > 0 ? groupHead(unscored.length) : null;

  return {
    public_id: input.question_public_id,
    state,
    counts,
    head,
    cards,
    runner_up,
    list,
    places,
    unscored,
    cancelled,
    group,
    // §2.2 — ONE source for X. `counts.cars` counts the same cars by a different road (distinct `car_id` over
    // the shown rows); the read-back's assertion 3 proves the two agree on every stored search.
    cars_shown: list.x,
  };
}

// ---------------------------------------------------------------------------
// the DB glue — the client is imported on use, so the rules above stay testable without one
// ---------------------------------------------------------------------------

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

const RESULT_COLUMNS = {
  listing_id: true,
  rank: true,
  recommendation_categories: true,
  total_score: true,
  confidence: true,
  price_snapshot: true,
  km_snapshot: true,
  market_stats_id: true,
  listing_scores_id: true,
  new_car_price_id: true, // §2.3 — added for the card's "X% ממחיר החדש"
  stage_b_trace: true, // §2.3 — added for the cheapest pick's cheapest_runner_up record
} as const;

export type ResolvedQuestion = { question: SearchRow; reruns: SearchRow[] };

/**
 * §3.2 — the question behind an address.
 *
 * A re-run id should never appear in an address (a re-run is never shown), but if one does it is not an
 * error: the pointer is followed and THE ROW IT POINTS AT IS THE QUESTION. Returns null when no row carries
 * that public_id — the caller renders the opening screen (`/`) or "לא נמצא" (the car page).
 */
export async function resolveQuestion(publicId: string): Promise<ResolvedQuestion | null> {
  const { db } = await import("@/lib/db");
  const found = await db.searches.findUnique({ where: { public_id: publicId }, select: SEARCH_COLUMNS });
  if (found === null) return null;

  let question: SearchRow = found;
  if (found.rerun_of !== null) {
    const original = await db.searches.findUnique({ where: { id: found.rerun_of }, select: SEARCH_COLUMNS });
    if (original === null) throw new Error(`resolveQuestion: search ${found.id} has rerun_of ${found.rerun_of}, which is not a searches row`);
    if (original.rerun_of !== null) throw new Error(`resolveQuestion: search ${found.id} points at ${original.id}, which is itself a re-run — rerun_of always points at a person's question`);
    question = original;
  }

  const reruns = await db.searches.findMany({ where: { rerun_of: question.id }, select: SEARCH_COLUMNS, orderBy: { id: "asc" } });
  return { question, reruns };
}

/**
 * §3.2 — `max(listings.updated_at)` over ALL listings of the searched model, live AND delisted: a delisting
 * is itself a change, and a question whose answer lost a car must be re-run.
 *
 * The model scoping is EXACTLY assemblePool's — `modelKey()` over `models.model`, uppercased and stripped of
 * whitespace — applied in memory for the same reason assemblePool applies it there: it is one definition of
 * "the same model", not two (one in TypeScript and one in SQL).
 */
export async function maxModelListingUpdatedAt(model_searched: string): Promise<Date | null> {
  // Both imported on use: src/lib/search/assemble.ts holds the Prisma client at module scope, so importing
  // modelKey() at the top of this file would drag a database connection into the pure half.
  const [{ db }, { modelKey }] = await Promise.all([import("@/lib/db"), import("./assemble")]);
  const key = modelKey(model_searched);
  const rows = await db.listings.findMany({ select: { updated_at: true, car: { select: { model: { select: { model: true } } } } } });
  let max: Date | null = null;
  for (const r of rows) {
    const m = r.car.model.model;
    if (m === null || modelKey(m) !== key) continue;
    if (max === null || r.updated_at.getTime() > max.getTime()) max = r.updated_at;
  }
  return max;
}

/** §3.2 — over the WHOLE dealer_commercial table: the rule is unscoped by design. */
export async function maxDealerCommercialUpdatedAt(): Promise<Date | null> {
  const { db } = await import("@/lib/db");
  const r = await db.dealer_commercial.aggregate({ _max: { updated_at: true } });
  return r._max.updated_at ?? null;
}

export async function currentVersions(): Promise<CurrentVersions> {
  const [{ ENGINE_VERSION }, { RULES_VERSION }] = await Promise.all([import("@/lib/scoring/constants"), import("@/lib/selection/constants")]);
  return { engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION };
}

export async function resultsOf(search_id: number): Promise<ResultRow[]> {
  const { db } = await import("@/lib/db");
  return db.search_results.findMany({ where: { search_id }, select: RESULT_COLUMNS, orderBy: [{ rank: "asc" }, { listing_id: "asc" }] });
}

/**
 * §0.3e / §2.1 — THE PAGE'S PHOTO SOURCE, in one place: the image that ships with the app, by licence plate;
 * null → the caller draws the placeholder.
 *
 * It was the car page's own `photoFor()` and it now serves the cards too, so it lives in one place and the two
 * screens cannot resolve a photo differently. It sits HERE, beside resultsView(), because it reads the
 * filesystem: `src/components/car/Photo.tsx` and `src/lib/display/cards.ts` are both in the browser bundle
 * (PickCards is a client component) and `node:fs` may not enter it. The car page imports it from here; the
 * resolution itself is unchanged, character for character.
 */
export function photoFor(plate: string | null): string | null {
  if (plate === null || !/^\d+$/.test(plate)) return null;
  return existsSync(path.join(process.cwd(), "public", "cars", `${plate}.jpeg`)) ? `/cars/${plate}.jpeg` : null;
}

/**
 * §2.1 — the ONE builder, with its reads. Both paths call it with the rows they already hold:
 * `/?s=` with the rows loadForAddress() returned, and the fresh search with the rows runSearch() wrote.
 *
 * Three reads, all read-only and all over ids the rows already name (§2.3):
 *   listings  → every row's `car_id` (the count is per car, and `search_results` has no car column), and for
 *               the picks and the runner-up the facts the card prints: the price, the km, the hand, the
 *               model string, the year, the plate and the car's ownership history
 *   new_car_prices → the `mehir` of the row each pick's `new_car_price_id` points at
 */
export async function resultsView(questionPublicId: string, rows: ResultRow[]): Promise<ResultsView> {
  const { db } = await import("@/lib/db");

  // Run 2 §3.5 — who needs full facts: every DRAWN listing. On a crowned search that is exactly Run 1's set
  // (the three picks and, when one was recorded, the runner-up); on the two edge screens it is every row the
  // screen puts on the screen, read with the same fields and in the same query.
  const pickedIds = new Set<number>(drawnListingIds(rows));

  const allIds = rows.map((r) => r.listing_id);
  const newPriceIds = [...new Set(rows.flatMap((r) => (r.new_car_price_id === null ? [] : [r.new_car_price_id])))];

  const [cars, detailed, newPrices] = await Promise.all([
    allIds.length === 0 ? [] : db.listings.findMany({ where: { id: { in: allIds } }, select: { id: true, car_id: true } }),
    pickedIds.size === 0
      ? []
      : db.listings.findMany({
          where: { id: { in: [...pickedIds] } },
          select: {
            id: true,
            public_id: true,
            car_id: true,
            price: true,
            km_declared: true,
            hand_declared: true,
            car: {
              select: {
                license_plate: true,
                year: true,
                hand: true,
                ownership_history: true,
                model: { select: { model: true } },
              },
            },
          },
        }),
    newPriceIds.length === 0 ? [] : db.new_car_prices.findMany({ where: { id: { in: newPriceIds } }, select: { id: true, mehir: true } }),
  ]);

  const facts = new Map<number, ListingFacts>(
    detailed.map((l) => [
      l.id,
      {
        public_id: l.public_id,
        car_id: l.car_id,
        model: l.car.model.model ?? "",
        year: l.car.year,
        price: l.price,
        km_declared: l.km_declared,
        hand_declared: l.hand_declared,
        registry_hand: l.car.hand,
        ownership_history: Array.isArray(l.car.ownership_history) ? (l.car.ownership_history as { ym: string; type: string }[]) : [],
        image: photoFor(l.car.license_plate),
      },
    ]),
  );

  return resultsViewFrom({
    question_public_id: questionPublicId,
    rows,
    facts,
    car_id_of: new Map(cars.map((l) => [l.id, l.car_id])),
    new_price_of: new Map(newPrices.map((p) => [p.id, p.mehir])),
  });
}

export type LoadedAddress = {
  /** The person's question — ITS public_id is the address, whatever run is displayed. */
  question: SearchRow;
  /** The run being displayed: the latest one, or the re-run this load just wrote. */
  run: SearchRow;
  results: ResultRow[];
  signals: UpdateSignals;
  /** True when this load wrote the re-run. A second load right after it finds no update and writes nothing. */
  rerun_written: boolean;
  /**
   * Run 8b §2.1 — the question's model's LIVE FILTER ROWS and km anchors, in place of Run 8's resolved
   * drawer: the browser resolves the drawer from these, in render, with no call of its own (§2.2). Present
   * only when the caller asked for it; the car page has no drawer and does not pay.
   */
  model_rows: ModelRows | null;
};

/** Run 8b §2.1 — the rows, on their own: the page carries the stored filters already, and §3's shelf join
 * and the resolve both happen where the component renders. */
async function modelRowsFor(model_searched: string): Promise<ModelRows> {
  const { modelRows } = await import("./counts");
  return modelRows(model_searched);
}

/**
 * §3.2 — the whole loading rule, in one function.
 *
 * No update  → the latest run and its stored rows AS THEY ARE; nothing is written.
 * An update  → §4's re-run through the same pipeline and the same transaction, then the new run and its rows.
 *
 * A re-run is written once per update, not per load. Two parallel loads right after an update may each write
 * one — harmless: both point at the same question and the later one is what `latestRun` then displays.
 * THERE IS NO LOCK, by decision (§4).
 */
export async function loadForAddress(publicId: string, viewer: Viewer, options: { model_rows?: boolean } = {}): Promise<LoadedAddress | null> {
  const resolved = await resolveQuestion(publicId);
  if (resolved === null) return null;

  // §2.1 — THE SEAM, WHERE RUN 8 PUT IT. The question row names the model, so the model's rows can be
  // fetched from here on, CONCURRENTLY with the run's own load: the page's response is delayed by the slower
  // of the two, never by their sum. It is started here and awaited at the bottom, once per path, so the
  // stored-results path and the re-run path get the same rows from the same fetch. The car page passes
  // nothing and fetches nothing — it has no drawer.
  const rowsLoad = options.model_rows === true ? modelRowsFor(resolved.question.model_searched) : null;
  // A rejection here must not be "unhandled" while the run's own load is still in flight; the await below is
  // what surfaces it, loudly, as every failure in this file does.
  rowsLoad?.catch(() => {});
  const withRows = async (loaded: Omit<LoadedAddress, "model_rows">): Promise<LoadedAddress> => ({ ...loaded, model_rows: rowsLoad === null ? null : await rowsLoad });

  const run = latestRun(resolved.question, resolved.reruns);
  const [current, modelMax, dealerMax] = await Promise.all([
    currentVersions(),
    maxModelListingUpdatedAt(run.model_searched),
    maxDealerCommercialUpdatedAt(),
  ]);
  const signals = updateSignals(run, new Date(), current, modelMax, dealerMax);

  if (!isUpdate(signals)) {
    return withRows({ question: resolved.question, run, results: await resultsOf(run.id), signals, rerun_written: false });
  }

  const { runSearch } = await import("./run");
  const fresh = await runSearch({
    model: resolved.question.model_searched,
    filters: storedFilters(resolved.question.filters),
    identity: viewer,
    // §4 — rerun_of ALWAYS points at the person's question, never at another re-run.
    rerun: {
      question_id: resolved.question.id,
      model_searched: resolved.question.model_searched,
      family_id: resolved.question.family_id,
      // `filters` is copied exactly as stored. A stored null becomes `undefined` here, which is how Prisma
      // spells "write the column's default" — and the default is null. The value does not change.
      filters: resolved.question.filters === null ? undefined : (resolved.question.filters as Prisma.InputJsonValue),
      priority: resolved.question.priority,
    },
  });

  const { db } = await import("@/lib/db");
  const written = await db.searches.findUniqueOrThrow({ where: { id: fresh.search_id }, select: SEARCH_COLUMNS });
  return withRows({ question: resolved.question, run: written, results: await resultsOf(written.id), signals, rerun_written: true });
}

/**
 * §4 / §5 — the viewer of a request, read the way a search reads it: the two anonymous cookies.
 *
 * READ ONLY. A Server Component may read cookies but may NOT set them (Next 16: "Setting cookies is not
 * supported during Server Component rendering"), and a page render is where a re-run is triggered — so this
 * never mints. A viewer who arrives on a shared link before any search of their own has no cookie yet and
 * the re-run records null for that column, which is what `searches.visitor_id`/`session_id` are nullable
 * for. Every search of their own goes through the action, where searchIdentity() mints and sets as always.
 */
export async function viewerFromCookies(): Promise<Viewer> {
  const [{ cookies }, { SESSION_COOKIE, VISITOR_COOKIE }] = await Promise.all([import("next/headers"), import("./visitor")]);
  const jar = await cookies();
  return { visitor_id: jar.get(VISITOR_COOKIE)?.value ?? null, session_id: jar.get(SESSION_COOKIE)?.value ?? null };
}
