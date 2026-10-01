-- AlterTable
ALTER TABLE "model_specs" ADD COLUMN     "km_per_liter" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "models" DROP COLUMN "fuel_consumption",
DROP COLUMN "fuel_source_url";

