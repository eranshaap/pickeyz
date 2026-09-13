-- Day 15 (BRIEF §1 and §3): two additive changes, written by hand and applied with
-- `prisma migrate deploy` (never `migrate dev` / `db push` / `reset`). Nothing is dropped,
-- nothing is backfilled, no existing row is touched.
--
--   model_stats.km_filter_anchors — §1. The km filter chips of the search screen: the quartiles
--        (P25/P50/P75) of km_declared over ALL live listings of the model, each rounded UP to the
--        nearest 10,000 and deduplicated, stored as an ascending array of ints. Home = model_stats
--        because that table is already "one row per model per norms run", which is exactly the
--        anchors' lifecycle (the decision is flagged for review in REPORT.md). The column is NULL on
--        every row written before this migration, and stays NULL until the first norms run writes
--        it — the reader (§4) must treat NULL as "no chips yet", never as an empty pool.
--        It is a UI number, not a norm: no engine or selection code reads it.
--
--   searches — §3. One row per search. The table is specified in findCar-schema.md (part A, the
--        measurement family; part D §7, the fields) and has never been created. §3.4 writes a row
--        per runSearch() invocation, so it is created here, with the fields exactly as the schema
--        document lists them: visitor_id, session_id, user_id, model_searched, filters, priority,
--        engine_version, rules_version, results_count — plus the id and created_at every table has.
--        Born empty. user_id and priority have no writer yet and stay NULL.
--        search_results (one row per listing per search) is NOT created here — it is born on days 27–28.

-- AlterTable
ALTER TABLE "model_stats" ADD COLUMN "km_filter_anchors" JSONB;

-- CreateTable
CREATE TABLE "searches" (
    "id" SERIAL NOT NULL,
    "visitor_id" TEXT,
    "session_id" TEXT,
    "user_id" INTEGER,
    "model_searched" TEXT NOT NULL,
    "filters" JSONB,
    "priority" TEXT,
    "engine_version" INTEGER NOT NULL,
    "rules_version" INTEGER NOT NULL,
    "results_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "searches_pkey" PRIMARY KEY ("id")
);
