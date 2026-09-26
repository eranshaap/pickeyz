"use server";

// The search (BRIEF Days 15–16, §3). One question in, one verdict out — and one `searches` row per invocation.
//
//   assemblePool(model)   the model's whole live pool (src/lib/search/assemble.ts)
//   cut by the filters    BEFORE selectThree(); the filters define the question and never touch a score (§3.2)
//   selectThree()         the Stage B library, unchanged: nothing here recomputes a score or a rule
//   the `searches` row    written on every invocation, even when the answer is empty (§3.4)
//   its `search_results`  one row per listing of the CUT pool, in the SAME transaction (Run 2b §4) — the
//                         mapping is src/lib/search/results.ts, which is pure and tested on its own
//   the invoice           NOT copied (Run 2c §5). The row POINTS at the `listing_scores` row that was current
//                         at this search's `now` (§0.5) — one query over the cut pool's listing ids, resolved
//                         before the transaction opens. `listing_scores` is append-only, so the pointer never
//                         dangles, and the invoice is read once instead of stored twice.
//
// The row carries BOTH sizes of the question (Run 1d, §2): `pool_count` is the cut pool — what survived the
// filters and entered selectThree(), the same number counts.ts puts on the "עדכן" button — and
// `results_count` keeps its meaning, the listings that got a rank (ranked + tail).
//
// Everything the screen shows comes back from here already decided: the three picks with what each of them
// also won, the cheapest pick's runner-up, the blocked_first facts (the counterfactual winner the
// unverified_history rule kept out of a category), the ranked list, the no-deal tail in its own order, and
// the display labels of the gate. The finish test runs on every search and is LOGGED, not shown — it is an
// assertion about the library, not something a buyer reads.
//
// Nothing in src/lib/scoring/** or src/lib/selection/** is imported for anything but reading.

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { newPublicId } from "@/lib/public-id";
import { ENGINE_VERSION } from "@/lib/scoring/constants";
import type { ConfidenceLevel } from "@/lib/scoring/types";
import {
  CATEGORY_PRIORITY,
  RULES_VERSION,
  finishTest,
  selectThree,
  type Category,
  type FinishCheck,
  type ListingResult,
  type MissingReason,
} from "@/lib/selection";
import { assemblePool } from "./assemble";
import { passes, type SearchFilters } from "./filters";
import { latestScoreIdByListing, toSearchResultRows, type ResultSnapshot } from "./results";
import { searchIdentity, type SearchIdentity } from "./visitor";

// The display labels of the gate (§3.3). Hebrew lives only in display strings — never in a comparison.
const LABEL_VERIFY_AVAILABILITY = "לוודא זמינות"; // sold_signal medium (findCar-now.md, "הציון — שלב א'")
const LABEL_UNVERIFIED_CANDIDATE = "מועמד לא מאומת"; // stood first and only the rule stopped it (findCar-now.md, "המוצר")
const LABEL_CANCELLED = "ביטול סופי"; // Day 18: the car is finally cancelled at the registry — the cancelled rule (rules v6)

export type ListingView = {
  listing_id: number;
  car_id: number;
  plate: string;
  rank: number | null;
  price: number;
  year: number;
  km_declared: number | null;
  region: string | null;
  // Day 15 Run 2b (§0.6): the two facts the raw pick card shows beside year / price / km. dealer_type is the
  // CODE (private | ...) — the Hebrew "פרטי" / "מגרש" is a display string and lives in the component.
  sub_model: string | null;
  dealer_type: string;
  deal_score: number | null;
  condition_score: number | null;
  condition_by_reality: number | null;
  condition_vs_typical: number | null;
  typical_history: number | null;
  confidence: ConfidenceLevel | null; // Day 18: null for a cancelled car — its invoice has no confidence, nothing is shown
  history_source: string | null; // 'mot' | 'typical' | null — what the history row rests on
  categories: Category[]; // what this listing won; empty when nothing
  verify_availability: boolean;
  eligibility_reasons: string[];
  labels: string[]; // the Hebrew display strings above, in a fixed order
};

/**
 * A pick, and the OTHER categories the same listing won — the multi-winner fact of Run 1: one car crowned in
 * two or three categories is drawn as one card carrying every label it won, so the card needs the rest of them
 * beside the category it is being shown as.
 */
export type PickView = ListingView & { other_categories: Category[] };

export type RunnerUpView = {
  listing: ListingView;
  gap: number;
  price_over_pct: number;
  triggered: boolean;
};

export type BlockedFirstView = {
  category: Category;
  listing_id: number;
  plate: string;
  rank: number | null;
  history_source: string | null;
};

// Day 19 (Run 6b §4) — THE RE-RUN. When loadForAddress() finds an update it re-runs the SAME question in
// place, and it does that through this very function: the pipeline, the validations and the single
// transaction are the ones a person's search goes through, with nothing duplicated. Only the row's own
// columns differ, and every one of them is copied from the question exactly as stored.
//
// `rerun_of` ALWAYS points at the person's question — a row whose own `rerun_of` is null — never at another
// re-run. The caller is the one holding the question row, so it is the caller that passes the id.
export type RerunOf = {
  question_id: number; // searches.id of the person's question
  model_searched: string; // copied exactly as stored, not re-derived from the pool
  family_id: number | null;
  filters: Prisma.InputJsonValue | undefined; // the question's `filters` column, as stored
  priority: string | null;
};

// The two anonymous ids a row records. A search through the action always has both (the cookie helper mints
// them); a re-run triggered by a page render records the viewer's as they are, and either may be absent —
// `searches.visitor_id` and `searches.session_id` are nullable for exactly that case (§4).
export type RecordedIdentity = { visitor_id: string | null; session_id: string | null };

export type SearchView = {
  search_id: number;
  public_id: string; // Run 6b §5: the address this run is displayed at (a re-run's is never shown)
  model: string; // the display spelling, as models.model holds it
  model_key: string;
  filters: SearchFilters;
  engine_version: number;
  rules_version: number;
  pool_total: number; // the model's live pool, before the filters
  pool_cut: number; // what survived the filters and entered selectThree — stored as searches.pool_count
  results_count: number; // what got a rank — stored as searches.results_count
  picks: Record<Category, PickView | null>;
  // Days 20–21 rules v7 (§1.4): `below_crowning_threshold` joins `no_candidate` in MissingReason — a search
  // below the crowning threshold empties all three categories at once.
  missing: Partial<Record<Category, MissingReason>>;
  runner_up: RunnerUpView | null;
  blocked_first: BlockedFirstView[];
  ranked: ListingView[]; // shown and carrying a deal score, rank ascending
  tail: ListingView[]; // shown without a deal score — NO_DEAL_ORDER, after every ranked row
  finish_test: { pass: boolean; checks: FinishCheck[] };
};

export async function runSearch(input: {
  model: string;
  filters?: SearchFilters;
  /**
   * The anonymous identity to record. Omitted in a request — the cookie helper mints and sets it. A caller
   * with no request (scripts/oneoff/verify-search-layer.ts) passes its own, which is why this exists: reading
   * cookies outside a request scope throws, and that throw must never be swallowed.
   */
  identity?: SearchIdentity | RecordedIdentity;
  /**
   * Run 6b §4 — set only when this invocation IS a re-run of a stored question. It changes nothing about
   * the pipeline: the same pool, the same cut, the same selectThree(), the same transaction. It only says
   * which columns of the new row are copied from the question instead of derived from this invocation.
   */
  rerun?: RerunOf;
}): Promise<SearchView> {
  const filters = input.filters ?? {};
  const assembled = await assemblePool(input.model);

  // §3.2 — the cut, before selectThree()
  const cut = assembled.items.filter((p) => passes(p, filters));

  const res = selectThree({ listings: cut.map((p) => p.candidate) });
  const itemOf = new Map(cut.map((p) => [p.listing_id, p]));
  const resultOf = new Map(res.results.map((r) => [r.listing_id, r]));

  const blockedOf = (r: ListingResult): Category[] =>
    ((r.trace.find((t) => t.rule === "unverified_history")?.context.blocked_first as Category[] | undefined) ?? []);
  const sourceOf = (r: ListingResult): string | null => {
    const v = r.trace.find((t) => t.rule === "unverified_history")?.value ?? null;
    return typeof v === "string" ? v : null;
  };

  const view = (r: ListingResult): ListingView => {
    const p = itemOf.get(r.listing_id);
    if (p === undefined) throw new Error(`runSearch: listing ${r.listing_id} came back from selectThree but is not in the cut pool`);
    const b = p.candidate.breakdown;
    const labels: string[] = [];
    if (r.verify_availability) labels.push(LABEL_VERIFY_AVAILABILITY);
    if (blockedOf(r).length > 0) labels.push(LABEL_UNVERIFIED_CANDIDATE);
    if (r.trace.some((t) => t.rule === "cancelled" && t.triggered)) labels.push(LABEL_CANCELLED);
    return {
      listing_id: r.listing_id,
      car_id: r.car_id,
      plate: p.plate,
      rank: r.rank,
      price: p.price,
      year: p.year,
      km_declared: p.km_declared,
      region: p.region,
      sub_model: p.sub_model,
      dealer_type: p.dealer_type,
      deal_score: b.deal_score,
      condition_score: b.condition_score,
      condition_by_reality: b.condition_by_reality,
      condition_vs_typical: b.condition_vs_typical,
      typical_history: b.typical_history,
      confidence: b.confidence?.level ?? null,
      history_source: sourceOf(r),
      categories: r.categories,
      verify_availability: r.verify_availability,
      eligibility_reasons: r.eligibility.reasons,
      labels,
    };
  };
  const resultFor = (id: number): ListingResult => {
    const r = resultOf.get(id);
    if (r === undefined) throw new Error(`runSearch: listing ${id} is a pick but is not among the results`);
    return r;
  };

  const picks: Record<Category, PickView | null> = { best_value: null, peace_of_mind: null, cheapest: null };
  for (const c of CATEGORY_PRIORITY) {
    const id = res.picks[c];
    if (id === null) continue;
    const r = resultFor(id);
    picks[c] = { ...view(r), other_categories: r.categories.filter((x) => x !== c) };
  }

  const ru = res.runner_ups.cheapest;
  const runner_up: RunnerUpView | null =
    ru === null
      ? null
      : (() => {
          const r = resultFor(ru.listing_id);
          return { listing: view(r), gap: ru.gap, price_over_pct: ru.price_over_pct, triggered: ru.triggered };
        })();

  const blocked_first: BlockedFirstView[] = [];
  for (const r of res.results) {
    for (const category of blockedOf(r)) {
      const p = itemOf.get(r.listing_id);
      blocked_first.push({ category, listing_id: r.listing_id, plate: p?.plate ?? "?", rank: r.rank, history_source: sourceOf(r) });
    }
  }

  const shown = res.results.filter((r) => r.status === "shown");
  const ranked = shown.filter((r) => itemOf.get(r.listing_id)?.candidate.breakdown.deal_score !== null).map(view);
  const tail = shown.filter((r) => itemOf.get(r.listing_id)?.candidate.breakdown.deal_score === null).map(view);

  // The finish test runs on every search. It is an assertion about the library, not UI: logged, never shown.
  const ft = finishTest(res);
  const failed = ft.checks.filter((c) => !c.ok);
  console.log(
    `[search] ${assembled.model_display} | filters ${JSON.stringify(filters)} | pool ${assembled.items.length} -> cut ${cut.length} -> shown ${shown.length} | finish test ${ft.pass ? "PASS" : "FAIL"}` +
      (failed.length ? `: ${failed.map((c) => c.claim).join("; ")}` : ""),
  );

  // §3.4 — one row per invocation, written whatever the answer was.
  // Day 15 Run 2b (§4): the row AND its `search_results` rows are written in ONE transaction. A `searches`
  // row that exists without its result rows would be a search nobody can reconstruct, so either both land or
  // neither does. An empty cut pool writes the search row alone (§0.10) — a search with no cars is still a
  // search, and it has no rows to write.
  const identity = input.identity ?? (await searchIdentity());

  // Run 2c §5 — the invoice pointer, one query for the whole cut pool and before the transaction opens. Every
  // `listing_scores` row of these listings is fetched and §0.5 is applied in memory by the pure function, so
  // the rule lives in one tested place rather than half here and half in SQL. `assembled.now` is this search's
  // moment: the same clock the seller-visibility cut already used.
  const scoreRows =
    cut.length === 0
      ? []
      : await db.listing_scores.findMany({
          where: { listing_id: { in: cut.map((p) => p.listing_id) } },
          select: { id: true, listing_id: true, scored_at: true },
        });
  const scoreIdOf = latestScoreIdByListing(scoreRows, assembled.now);

  const snapshots: ResultSnapshot[] = cut.map((p) => ({
    listing_id: p.listing_id,
    price: p.price,
    km_declared: p.km_declared,
    score: p.score,
    breakdown: p.candidate.breakdown, // read for `confidence` only — Run 2c §5 stopped copying it
    market_stats_id: p.market_stats_id,
    model_stats_id: p.model_stats_id,
    pool_stats_id: p.pool_stats_id,
    new_car_price_id: p.new_car_price_id,
    listing_scores_id: scoreIdOf.get(p.listing_id) ?? null,
  }));

  const row = await db.$transaction(async (tx) => {
    // Run 6b §4 — a re-run copies `model_searched`, `family_id`, `filters` and `priority` from the question
    // EXACTLY AS STORED and sets `rerun_of`; everything else is computed as in any search, and `created_at`
    // comes from the column default (§3.1: this create has never sent it, so the DB clock stamps both the
    // search and the `updated_at` values the update signals compare against).
    const rerun = input.rerun;
    const created = await tx.searches.create({
      data: {
        public_id: newPublicId(), // minted like any row; a re-run's is never shown and never appears in an address
        visitor_id: identity.visitor_id,
        session_id: identity.session_id,
        user_id: null, // no login this month
        model_searched: rerun === undefined ? assembled.model_display : rerun.model_searched,
        family_id: rerun === undefined ? undefined : (rerun.family_id ?? undefined),
        filters: rerun === undefined ? (input.filters === undefined ? undefined : (filters as object)) : rerun.filters, // as received / as stored
        priority: rerun === undefined ? null : rerun.priority, // no screen writes it yet
        rerun_of: rerun === undefined ? undefined : rerun.question_id,
        engine_version: ENGINE_VERSION,
        rules_version: RULES_VERSION,
        results_count: shown.length,
        pool_count: cut.length, // the cut pool, before selectThree — the same number filterCounts() puts on "עדכן"
      },
      select: { id: true, public_id: true },
    });
    const rows = toSearchResultRows(created.id, snapshots, res);
    if (rows.length !== cut.length) throw new Error(`runSearch: ${rows.length} result row(s) for a cut pool of ${cut.length} — the two must be equal`);
    if (rows.length > 0) {
      const written = await tx.search_results.createMany({
        data: rows.map((r) => ({ ...r, stage_b_trace: r.stage_b_trace as unknown as object[] })),
      });
      if (written.count !== rows.length) throw new Error(`runSearch: createMany wrote ${written.count} of ${rows.length} search_results rows`);
    }
    return created;
  });

  return {
    search_id: row.id,
    public_id: row.public_id,
    model: assembled.model_display,
    model_key: assembled.model_key,
    filters,
    engine_version: ENGINE_VERSION,
    rules_version: RULES_VERSION,
    pool_total: assembled.items.length,
    pool_cut: cut.length,
    results_count: shown.length,
    picks,
    missing: res.missing,
    runner_up,
    blocked_first,
    ranked,
    tail,
    finish_test: { pass: ft.pass, checks: ft.checks },
  };
}
