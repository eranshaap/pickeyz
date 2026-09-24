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

import type { Prisma } from "@/generated/prisma/client";
import { israelDay } from "@/lib/display/texts";
import type { ModelRows } from "./chip-state";
import type { SearchFilters } from "./filters";

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

/** One row of the displayed run's ranking — what the results screen and the car page read. */
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
