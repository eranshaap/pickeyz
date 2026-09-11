-- Day 14 run B (BRIEF rules v5, §4): drop the derived copy columns.
--
-- condition_score and confidence on listings and on listing_scores are copies of values the engine
-- already writes into the invoice (score_breakdown / breakdown): condition_score = the invoice's
-- condition_score sum, confidence = the invoice's confidence.level. §3 proved the copy is exact on
-- every existing row — 918 of 918 rows equal, 0 mismatches (254 listings + 664 listing_scores,
-- v1 78 · v2 332 · v3 254). The invoice itself is NOT touched: the engine keeps computing and
-- storing exactly what it stores today, ENGINE_VERSION stays 3, nothing is rescored.
--
-- DROP COLUMN is DDL: the append-only / immutability row triggers on both tables
-- (listings_forbid_delete/truncate, listing_scores_forbid_update_delete/truncate, all on
-- forbid_change()) fire on row events only and do not block it — same precedent as run A's
-- median_condition drop.

ALTER TABLE "listings"       DROP COLUMN "condition_score", DROP COLUMN "confidence";
ALTER TABLE "listing_scores" DROP COLUMN "condition_score", DROP COLUMN "confidence";

-- P3: with those four columns gone nothing references the confidence enum any more — no other
-- column, no view or matview, no function body, no index or constraint (checked in §4). So the
-- type goes too, and schema.prisma loses the enum.
DROP TYPE "ConfidenceLevel";
