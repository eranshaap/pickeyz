/*
  Warnings:

  - A unique constraint covering the columns `[vehicle_class,degem_code,year]` on the table `models` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "models_degem_code_year_key";

-- AlterTable
ALTER TABLE "models" ADD COLUMN     "vehicle_class" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "models_vehicle_class_degem_code_year_key" ON "models"("vehicle_class", "degem_code", "year");
