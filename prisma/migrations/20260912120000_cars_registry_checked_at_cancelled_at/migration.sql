-- Day 14 run C (BRIEF §0.10, §2): two new columns on `cars`, written by hand and applied with
-- `prisma migrate deploy` (never `migrate dev` / `db push` / `reset`).
--
--   registry_checked_at — when the Ministry's answer on this car was last ACCEPTED by the
--                         acceptance function (src/lib/refresh/). Not "when we last asked":
--                         a rejected answer writes nothing, not even this timestamp.
--                         Backfilled from created_at — the import's own fetch is the first
--                         accepted answer every car ever had.
--   cancelled_at        — bitul_dt, the date the plate's registration was finally cancelled,
--                         written once when the car resolves to the cancellations registry.
--                         Empty after this migration: 0 of 250 cars are cancelled today.
--
-- The backfill is an UPDATE over every row of `cars`. `cars` carries no immutability trigger —
-- forbid_change() sits on market_stats, listings (DELETE/TRUNCATE), listing_scores,
-- listing_price_history and car_test_readings, not on cars — so the UPDATE runs.
-- It deliberately does not touch updated_at: no row's data changed, only the table's shape.

ALTER TABLE "cars" ADD COLUMN "registry_checked_at" TIMESTAMP(3), ADD COLUMN "cancelled_at" DATE;
UPDATE "cars" SET "registry_checked_at" = "created_at";
