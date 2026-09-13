-- Day 15, Run 2a (BRIEF §2): search_results — the full ranking of one search, one row per listing of
-- that search's cut pool (findCar-schema.md §D8). Written by hand and applied with `prisma migrate deploy`
-- (never `migrate dev` / `db push` / `reset`). Purely additive: one new table, nothing else is touched.
--
--   Snapshot, not pointer (BRIEF §0.1): total_score, score_breakdown, confidence, price_snapshot and
--        km_snapshot are copies of what the listing carried at that moment, so a result stays readable
--        after the listing moves or the next norms run lands. A pointer to the listing_scores row would
--        be leaner — flagged for Eran in the document round, not changed here.
--
--   Two foreign keys, both RESTRICT (BRIEF §0.2): search_id → searches.id and listing_id → listings.id.
--        No cascade: the test rows of Run 2b are deleted by hand, results first, searches second.
--        The four pointer columns (market_stats_id, model_stats_id, pool_stats_id, new_car_price_id) are
--        plain nullable integers with NO constraint — those tables are append-only, so nothing dangles.
--
--   NO forbid_change trigger (BRIEF §0.2, Eran 13/09). Unlike listing_scores / listing_price_history /
--        car_test_readings, this table stays deletable: the manual pass has to be able to clear its own
--        test rows. If that changes, the trigger is a later migration, not a hidden edit to this one.
--
--   stage_b_trace is NOT NULL: every row of the cut pool passed through Stage B, so every row has a trace,
--        even if the array is empty. Its size is the §0.3 rule (full for rank <= 10, triggered-only below,
--        acted-only for rank null) — a writer's rule, not a constraint.
--
-- Born empty: no backfill. The searches rows written before this migration have no result rows and never will.

-- CreateTable
CREATE TABLE "search_results" (
    "id" SERIAL NOT NULL,
    "search_id" INTEGER NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "rank" INTEGER,
    "total_score" DOUBLE PRECISION,
    "score_breakdown" JSONB,
    "confidence" TEXT,
    "market_stats_id" INTEGER,
    "model_stats_id" INTEGER,
    "pool_stats_id" INTEGER,
    "new_car_price_id" INTEGER,
    "was_recommended" BOOLEAN NOT NULL DEFAULT false,
    "recommendation_categories" TEXT[],
    "stage_b_trace" JSONB NOT NULL,
    "price_snapshot" INTEGER NOT NULL,
    "km_snapshot" INTEGER,

    CONSTRAINT "search_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_results_search_id_idx" ON "search_results"("search_id");

-- CreateIndex
CREATE INDEX "search_results_listing_id_idx" ON "search_results"("listing_id");

-- AddForeignKey
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "searches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
