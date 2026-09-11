-- Day 14 (BRIEF Engine v3, §2): three norm levels, each keyed at its own level.
--   market_stats  per cell  (comparison_group × year)  — the typical becomes the median history row
--   model_stats   per model (make, model)              — the signed km slope                        (new)
--   pool_stats    per run   (the whole pool)           — the anchor curve against the new-car price (new)
-- All three are append-only (the forbid_change() function created in 20260905095625), written only by
-- the norms run, and carry no foreign keys between them or to models. The score points at the row it
-- used from each: market_stats_id (exists) + model_stats_id + pool_stats_id on listings and listing_scores.
-- Written by hand (never `migrate dev`); applied with `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "model_stats" (
    "id" SERIAL NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "km_slope" DOUBLE PRECISION,
    "km_slope_n" INTEGER NOT NULL,
    "engine_version" INTEGER NOT NULL,
    "group_version" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_stats" (
    "id" SERIAL NOT NULL,
    "anchor_ratio_intercept" DOUBLE PRECISION,
    "anchor_ratio_per_year" DOUBLE PRECISION,
    "anchor_error_pct" DOUBLE PRECISION,
    "anchor_age_min_years" DOUBLE PRECISION,
    "anchor_age_max_years" DOUBLE PRECISION,
    "anchor_n" INTEGER NOT NULL,
    "engine_version" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pool_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_stats_make_model_computed_at_idx" ON "model_stats"("make", "model", "computed_at");

-- Append-only: the same two-trigger shape market_stats got in 20260905095625 — no UPDATE, no DELETE, no TRUNCATE.
CREATE TRIGGER model_stats_forbid_update_delete
  BEFORE UPDATE OR DELETE ON "model_stats"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER model_stats_forbid_truncate
  BEFORE TRUNCATE ON "model_stats"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

CREATE TRIGGER pool_stats_forbid_update_delete
  BEFORE UPDATE OR DELETE ON "pool_stats"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER pool_stats_forbid_truncate
  BEFORE TRUNCATE ON "pool_stats"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

-- market_stats — the typical becomes the median history row (§0.2). The value each old score used
-- survives in its own score_breakdown copy in listing_scores, so the column itself is dropped.
-- AlterTable
ALTER TABLE "market_stats" ADD COLUMN     "median_history" DOUBLE PRECISION;
ALTER TABLE "market_stats" DROP COLUMN "median_condition";

-- the score points at the rows it used
-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "model_stats_id" INTEGER,
ADD COLUMN     "pool_stats_id" INTEGER;

-- AlterTable
ALTER TABLE "listing_scores" ADD COLUMN     "model_stats_id" INTEGER,
ADD COLUMN     "pool_stats_id" INTEGER;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_model_stats_id_fkey" FOREIGN KEY ("model_stats_id") REFERENCES "model_stats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_pool_stats_id_fkey" FOREIGN KEY ("pool_stats_id") REFERENCES "pool_stats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_scores" ADD CONSTRAINT "listing_scores_model_stats_id_fkey" FOREIGN KEY ("model_stats_id") REFERENCES "model_stats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_scores" ADD CONSTRAINT "listing_scores_pool_stats_id_fkey" FOREIGN KEY ("pool_stats_id") REFERENCES "pool_stats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
