/*
  Warnings:

  - A unique constraint covering the columns `[degem_code,year]` on the table `models` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "models_degem_code_key";

-- AlterTable
ALTER TABLE "models" ADD COLUMN     "year" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "models_degem_code_year_key" ON "models"("degem_code", "year");
