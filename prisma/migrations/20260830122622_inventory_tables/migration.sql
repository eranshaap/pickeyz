/*
  Warnings:

  - You are about to drop the `health_check` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "health_check";

-- CreateTable
CREATE TABLE "models" (
    "id" SERIAL NOT NULL,
    "degem_code" TEXT,
    "comparison_group" TEXT,
    "make" TEXT,
    "model" TEXT,
    "sub_model" TEXT,
    "year" INTEGER,
    "engine_size" INTEGER,
    "fuel_type" TEXT,
    "transmission" TEXT,
    "drive_type" TEXT,
    "body_type" TEXT,
    "seats" INTEGER,
    "import_type" TEXT,
    "trunk_liters" INTEGER,
    "length_mm" INTEGER,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "horsepower" INTEGER,
    "fuel_consumption" DOUBLE PRECISION,
    "safety_rating" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cars" (
    "id" SERIAL NOT NULL,
    "license_plate" TEXT,
    "model_id" INTEGER NOT NULL,
    "hand" INTEGER,
    "ownership_type" TEXT,
    "color" TEXT,
    "test_expiry" DATE,
    "mivchan_acharon_dt" DATE,
    "km_at_last_test" INTEGER,
    "first_registration" DATE,
    "had_accident" BOOLEAN,
    "damage_severity" TEXT,
    "service_history" TEXT,
    "authorized_garage" BOOLEAN,
    "previous_owners" INTEGER,
    "is_original" BOOLEAN,
    "warranty_until" DATE,
    "test_failures" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" SERIAL NOT NULL,
    "car_id" INTEGER NOT NULL,
    "dealer_id" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "region" TEXT,
    "image_urls" TEXT[],
    "km_declared" INTEGER,
    "hand_declared" INTEGER,
    "disclosure_provided" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_verified_at" TIMESTAMP(3),
    "delisted_at" TIMESTAMP(3),
    "delisted_price" INTEGER,
    "score" DOUBLE PRECISION,
    "score_breakdown" JSONB,
    "confidence" DOUBLE PRECISION,
    "scored_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealers" (
    "id" SERIAL NOT NULL,
    "trade_license_no" TEXT,
    "name" TEXT NOT NULL,
    "dealer_type" TEXT NOT NULL,
    "region" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "license_checked_at" TIMESTAMP(3),
    "feed_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_commercial" (
    "id" SERIAL NOT NULL,
    "dealer_id" INTEGER NOT NULL,
    "agreement_status" TEXT NOT NULL,
    "price_per_lead" DECIMAL(10,2),
    "price_locked_until" DATE,
    "free_until" DATE,
    "dedup_window_days" INTEGER,
    "terms_version" INTEGER,
    "agreement_start" DATE,
    "agreement_end" DATE,
    "billing_contact" TEXT,
    "notes" TEXT,

    CONSTRAINT "dealer_commercial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "models_degem_code_key" ON "models"("degem_code");

-- CreateIndex
CREATE UNIQUE INDEX "cars_license_plate_key" ON "cars"("license_plate");

-- CreateIndex
CREATE UNIQUE INDEX "listings_source_external_id_key" ON "listings"("source", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "dealers_trade_license_no_key" ON "dealers"("trade_license_no");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_commercial_dealer_id_key" ON "dealer_commercial"("dealer_id");

-- AddForeignKey
ALTER TABLE "cars" ADD CONSTRAINT "cars_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_commercial" ADD CONSTRAINT "dealer_commercial_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
