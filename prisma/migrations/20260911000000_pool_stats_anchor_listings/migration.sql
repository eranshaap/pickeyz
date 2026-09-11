-- Day 14 (BRIEF Engine v3, Q9 answer (ii)): the anchor line is fitted through the MODEL-YEAR POINTS —
-- ratio per listing, median per model-year, OLS through those points with equal weight, and the
-- leave-one-out error over the same points. So anchor_n is the number of POINTS the line was fitted on
-- (6 today), and the number of listings behind those points is a separate coverage number.
--
-- anchor_age_min_years / anchor_age_max_years are unchanged: still the youngest and oldest model-year
-- median ages, the range the engine is allowed to anchor inside.
--
-- Written by hand (never `migrate dev`); applied with `prisma migrate deploy`. pool_stats holds no rows
-- yet — nothing has been written to it — so the column is added NOT NULL without a default, matching
-- anchor_n and the rest of the table (the norms run writes every value explicitly).

-- AlterTable
ALTER TABLE "pool_stats" ADD COLUMN     "anchor_listings" INTEGER NOT NULL;
