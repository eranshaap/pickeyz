-- Day 11 (BRIEF §19, §21): three append-only history tables.
--   listing_scores        one row per listing per scoring run (listings keeps the latest)
--   listing_price_history one row per observed price (first row at import, later rows via recordPrice())
--   car_test_readings     the tester's odometer readings over time (cars keeps the latest)
-- Each gets the forbid_change triggers market_stats has: no UPDATE, no DELETE, no TRUNCATE.
-- car_test_readings is backfilled here from cars' current reading; observed_at = now (cars has no license_checked_at).

-- CreateTable
CREATE TABLE "listing_scores" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "scored_at" TIMESTAMP(3) NOT NULL,
    "engine_version" INTEGER NOT NULL,
    "market_stats_id" INTEGER,
    "deal_score" DOUBLE PRECISION,
    "condition_score" DOUBLE PRECISION,
    "confidence" "ConfidenceLevel" NOT NULL,
    "breakdown" JSONB NOT NULL,

    CONSTRAINT "listing_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_price_history" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_test_readings" (
    "id" SERIAL NOT NULL,
    "car_id" INTEGER NOT NULL,
    "test_date" DATE NOT NULL,
    "km" INTEGER NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_test_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_scores_listing_id_scored_at_idx" ON "listing_scores"("listing_id", "scored_at");

-- CreateIndex
CREATE INDEX "listing_price_history_listing_id_observed_at_idx" ON "listing_price_history"("listing_id", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "car_test_readings_car_id_test_date_key" ON "car_test_readings"("car_id", "test_date");

-- AddForeignKey
ALTER TABLE "listing_scores" ADD CONSTRAINT "listing_scores_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_scores" ADD CONSTRAINT "listing_scores_market_stats_id_fkey" FOREIGN KEY ("market_stats_id") REFERENCES "market_stats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_price_history" ADD CONSTRAINT "listing_price_history_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_test_readings" ADD CONSTRAINT "car_test_readings_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only: same forbid_change() function as market_stats (created in 20260905095625).
CREATE TRIGGER listing_scores_forbid_update_delete
  BEFORE UPDATE OR DELETE ON "listing_scores"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER listing_scores_forbid_truncate
  BEFORE TRUNCATE ON "listing_scores"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

CREATE TRIGGER listing_price_history_forbid_update_delete
  BEFORE UPDATE OR DELETE ON "listing_price_history"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER listing_price_history_forbid_truncate
  BEFORE TRUNCATE ON "listing_price_history"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

CREATE TRIGGER car_test_readings_forbid_update_delete
  BEFORE UPDATE OR DELETE ON "car_test_readings"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER car_test_readings_forbid_truncate
  BEFORE TRUNCATE ON "car_test_readings"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

-- Backfill (§21): one reading per car from its current km_at_last_test / mivchan_acharon_dt where both are set.
INSERT INTO "car_test_readings" ("car_id", "test_date", "km", "observed_at")
SELECT "id", "mivchan_acharon_dt", "km_at_last_test", CURRENT_TIMESTAMP
FROM "cars"
WHERE "mivchan_acharon_dt" IS NOT NULL AND "km_at_last_test" IS NOT NULL;
