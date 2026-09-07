-- Day 11 (BRIEF §1): columns the Stage A engine writes.
-- listings.confidence: Float -> enum ConfidenceLevel. No listing has a value yet (checked: 0 of 78), so drop and re-add.
-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('high', 'medium', 'low');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "condition_score" DECIMAL(65,30),
ADD COLUMN     "engine_version" INTEGER,
ADD COLUMN     "owners_at_first_seen" INTEGER,
DROP COLUMN "confidence",
ADD COLUMN     "confidence" "ConfidenceLevel";

-- AlterTable
-- market_stats: engine_version is required with no database default. Existing rows were computed
-- before any engine existed (0), so the column is added with DEFAULT 0 and the default is dropped
-- in the same migration. ALTER does not fire the forbid_change trigger (which blocks UPDATE).
ALTER TABLE "market_stats" ADD COLUMN     "engine_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "median_condition" DECIMAL(65,30);
ALTER TABLE "market_stats" ALTER COLUMN "engine_version" DROP DEFAULT;
