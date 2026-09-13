ALTER TABLE "search_results"
  DROP COLUMN "was_recommended",
  DROP COLUMN "score_breakdown",
  ADD COLUMN "listing_scores_id" INTEGER;
