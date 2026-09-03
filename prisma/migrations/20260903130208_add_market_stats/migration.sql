-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "market_stats_id" INTEGER;

-- CreateTable
CREATE TABLE "market_stats" (
    "id" SERIAL NOT NULL,
    "comparison_group" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "median_price" INTEGER NOT NULL,
    "median_km" INTEGER,
    "sample_size" INTEGER NOT NULL,
    "window_days" INTEGER NOT NULL,
    "group_level" INTEGER NOT NULL,
    "group_version" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listings_market_stats_id_idx" ON "listings"("market_stats_id");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_market_stats_id_fkey" FOREIGN KEY ("market_stats_id") REFERENCES "market_stats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
