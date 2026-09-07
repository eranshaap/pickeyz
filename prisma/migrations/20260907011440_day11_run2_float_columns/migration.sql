-- Day 11 run 2 (BRIEF §18.1): condition_score and median_condition are Float like listings.score.
-- Both columns are entirely null (added in the previous migration, nothing scored yet), so the cast loses nothing.
-- ALTER does not fire market_stats' forbid_change trigger.
-- AlterTable
ALTER TABLE "listings" ALTER COLUMN "condition_score" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "market_stats" ALTER COLUMN "median_condition" SET DATA TYPE DOUBLE PRECISION;
