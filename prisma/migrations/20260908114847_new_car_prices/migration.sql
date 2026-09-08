-- Day 12 part 5 (BRIEF §1): new_car_prices — the Ministry of Transport new-car price list, one row per (key, publication).
-- Key = (tozeret_cd, degem_cd, shnat_yitzur, sug_degem); append-only (a later publication adds rows with its own published_at).
-- Generated read-only with: prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
-- CreateTable
CREATE TABLE "new_car_prices" (
    "id" SERIAL NOT NULL,
    "tozeret_cd" INTEGER NOT NULL,
    "degem_cd" INTEGER NOT NULL,
    "shnat_yitzur" INTEGER NOT NULL,
    "sug_degem" TEXT NOT NULL,
    "semel_yevuan" INTEGER NOT NULL,
    "shem_yevuan" TEXT NOT NULL,
    "tozeret_nm" TEXT NOT NULL,
    "degem_nm" TEXT NOT NULL,
    "kinuy_mishari" TEXT,
    "mehir" INTEGER NOT NULL,
    "published_at" DATE NOT NULL,
    "imported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "new_car_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "new_car_prices_tozeret_cd_degem_cd_shnat_yitzur_sug_degem_idx" ON "new_car_prices"("tozeret_cd", "degem_cd", "shnat_yitzur", "sug_degem");

-- CreateIndex
CREATE UNIQUE INDEX "new_car_prices_tozeret_cd_degem_cd_shnat_yitzur_sug_degem_p_key" ON "new_car_prices"("tozeret_cd", "degem_cd", "shnat_yitzur", "sug_degem", "published_at");

