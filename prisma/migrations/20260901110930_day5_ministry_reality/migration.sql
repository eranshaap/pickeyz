/*
  Warnings:

  - You are about to drop the column `ownership_type` on the `cars` table. All the data in the column will be lost.
  - You are about to drop the column `license_checked_at` on the `dealers` table. All the data in the column will be lost.
  - You are about to drop the column `trade_license_no` on the `dealers` table. All the data in the column will be lost.
  - You are about to drop the column `year` on the `models` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[corp_id]` on the table `dealers` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "dealer_commercial_dealer_id_key";

-- DropIndex
DROP INDEX "dealers_trade_license_no_key";

-- AlterTable
ALTER TABLE "cars" DROP COLUMN "ownership_type",
ADD COLUMN     "ownership_history" JSONB,
ADD COLUMN     "year" INTEGER;

-- AlterTable
ALTER TABLE "dealers" DROP COLUMN "license_checked_at",
DROP COLUMN "trade_license_no",
ADD COLUMN     "corp_id" TEXT,
ADD COLUMN     "in_dealer_registry" BOOLEAN,
ADD COLUMN     "registry_checked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "models" DROP COLUMN "year";

-- CreateIndex
CREATE UNIQUE INDEX "dealers_corp_id_key" ON "dealers"("corp_id");
