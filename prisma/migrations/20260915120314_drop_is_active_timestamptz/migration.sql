-- Day 17 · Run 1: listings.is_active dropped (live = delisted_at IS NULL);
-- every naive timestamp column becomes timestamptz(3); stored values are UTC and are read as UTC.

ALTER TABLE "listings" DROP COLUMN "is_active";

ALTER TABLE "models"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';

ALTER TABLE "cars"
  ALTER COLUMN "registry_checked_at" TYPE TIMESTAMPTZ(3) USING "registry_checked_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at"          TYPE TIMESTAMPTZ(3) USING "created_at"          AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at"          TYPE TIMESTAMPTZ(3) USING "updated_at"          AT TIME ZONE 'UTC';

ALTER TABLE "listings"
  ALTER COLUMN "first_seen_at"    TYPE TIMESTAMPTZ(3) USING "first_seen_at"    AT TIME ZONE 'UTC',
  ALTER COLUMN "last_verified_at" TYPE TIMESTAMPTZ(3) USING "last_verified_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "delisted_at"      TYPE TIMESTAMPTZ(3) USING "delisted_at"      AT TIME ZONE 'UTC',
  ALTER COLUMN "scored_at"        TYPE TIMESTAMPTZ(3) USING "scored_at"        AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at"       TYPE TIMESTAMPTZ(3) USING "created_at"       AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at"       TYPE TIMESTAMPTZ(3) USING "updated_at"       AT TIME ZONE 'UTC';

ALTER TABLE "dealers"
  ALTER COLUMN "registry_checked_at" TYPE TIMESTAMPTZ(3) USING "registry_checked_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "feed_updated_at"     TYPE TIMESTAMPTZ(3) USING "feed_updated_at"     AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at"          TYPE TIMESTAMPTZ(3) USING "created_at"          AT TIME ZONE 'UTC';

ALTER TABLE "market_stats"
  ALTER COLUMN "computed_at" TYPE TIMESTAMPTZ(3) USING "computed_at" AT TIME ZONE 'UTC';

ALTER TABLE "model_stats"
  ALTER COLUMN "computed_at" TYPE TIMESTAMPTZ(3) USING "computed_at" AT TIME ZONE 'UTC';

ALTER TABLE "pool_stats"
  ALTER COLUMN "computed_at" TYPE TIMESTAMPTZ(3) USING "computed_at" AT TIME ZONE 'UTC';

ALTER TABLE "listing_scores"
  ALTER COLUMN "scored_at" TYPE TIMESTAMPTZ(3) USING "scored_at" AT TIME ZONE 'UTC';

ALTER TABLE "listing_price_history"
  ALTER COLUMN "observed_at" TYPE TIMESTAMPTZ(3) USING "observed_at" AT TIME ZONE 'UTC';

ALTER TABLE "car_test_readings"
  ALTER COLUMN "observed_at" TYPE TIMESTAMPTZ(3) USING "observed_at" AT TIME ZONE 'UTC';

ALTER TABLE "searches"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
