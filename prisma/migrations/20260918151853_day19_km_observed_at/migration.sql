-- Day 19 · engine v5 · listings.km_observed_at — the day the ad's declared km was observed.
-- Filled from first_seen_at; the three listings whose km_declared was overwritten in the
-- verification of 2026-09-15 get that verification's observation date (Run 5a, approved).

ALTER TABLE "listings" ADD COLUMN "km_observed_at" TIMESTAMPTZ(3);

UPDATE "listings" SET "km_observed_at" = "first_seen_at";

UPDATE "listings" SET "km_observed_at" = '2026-09-15T00:00:00.000Z'
WHERE "id" IN (61, 107, 152);

ALTER TABLE "listings" ALTER COLUMN "km_observed_at" SET NOT NULL;
