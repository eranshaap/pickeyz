-- Day 12 part 6 (BRIEF §1): new_car_prices.degem_code — the pair "tozeret_cd-degem_cd" in exactly the format makeDegemCode
-- (src/lib/mot/degem-code.ts) produces: both halves positive integers, printed as plain decimals, joined by '-'. Same string as
-- models.degem_code, so the new-price join is a plain equality.
-- Generated with: prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
-- then edited: add nullable → backfill the existing rows → set not null (one migration, one transaction).

-- AlterTable (generated: ADD COLUMN "degem_code" TEXT NOT NULL; split into three steps for the backfill)
ALTER TABLE "new_car_prices" ADD COLUMN     "degem_code" TEXT;

-- Backfill: the expression makeDegemCode uses, `${t}-${d}`. Integer::text prints a plain decimal, as JS does.
-- makeDegemCode throws on a non-positive half; here such a row is left null and the SET NOT NULL below fails, so the migration
-- stops loudly instead of writing a value the function would never produce.
UPDATE "new_car_prices" SET "degem_code" = "tozeret_cd"::text || '-' || "degem_cd"::text WHERE "tozeret_cd" > 0 AND "degem_cd" > 0;

ALTER TABLE "new_car_prices" ALTER COLUMN "degem_code" SET NOT NULL;

-- CreateIndex
CREATE INDEX "new_car_prices_degem_code_sug_degem_shnat_yitzur_idx" ON "new_car_prices"("degem_code", "sug_degem", "shnat_yitzur");
