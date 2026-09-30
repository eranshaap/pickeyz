-- AlterTable
ALTER TABLE "models" DROP COLUMN "height_mm",
DROP COLUMN "length_mm",
DROP COLUMN "trunk_liters",
DROP COLUMN "width_mm",
ADD COLUMN     "adaptive_cruise" BOOLEAN,
ADD COLUMN     "aeb_pedestrian_cyclist" BOOLEAN,
ADD COLUMN     "airbags" INTEGER,
ADD COLUMN     "alloy_wheels" BOOLEAN,
ADD COLUMN     "auto_high_beams" BOOLEAN,
ADD COLUMN     "blind_spot_detection" BOOLEAN,
ADD COLUMN     "co2_wltp" INTEGER,
ADD COLUMN     "distance_monitoring" BOOLEAN,
ADD COLUMN     "doors" INTEGER,
ADD COLUMN     "drive_technology" TEXT,
ADD COLUMN     "forward_collision_warning" BOOLEAN,
ADD COLUMN     "fuel_source_url" TEXT,
ADD COLUMN     "lane_departure_warning" BOOLEAN,
ADD COLUMN     "lane_keeping" BOOLEAN,
ADD COLUMN     "model_spec_id" INTEGER,
ADD COLUMN     "pedestrian_detection" BOOLEAN,
ADD COLUMN     "reverse_auto_braking" BOOLEAN,
ADD COLUMN     "reverse_camera" BOOLEAN,
ADD COLUMN     "sunroof" BOOLEAN,
ADD COLUMN     "traffic_sign_recognition" BOOLEAN,
ADD COLUMN     "two_wheeler_detection" BOOLEAN;

-- CreateTable
CREATE TABLE "model_specs" (
    "id" SERIAL NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "body_type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "engine_size" INTEGER NOT NULL,
    "engine_type" TEXT NOT NULL,
    "drive_type" TEXT NOT NULL,
    "sub_models" TEXT[],
    "length_mm" INTEGER,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "trunk_liters" INTEGER,
    "tank_liters" INTEGER,
    "carzone_url" TEXT,
    "source_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_specs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_model_spec_id_fkey" FOREIGN KEY ("model_spec_id") REFERENCES "model_specs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

