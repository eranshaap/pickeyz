-- AlterTable
ALTER TABLE "cars" ADD COLUMN     "color_changed" BOOLEAN,
ADD COLUMN     "current_owner_type" TEXT,
ADD COLUMN     "registry_color" TEXT;

-- AlterTable
ALTER TABLE "models" ADD COLUMN     "family_id" INTEGER;

-- AlterTable
ALTER TABLE "pool_stats" ADD COLUMN     "anchor_points" JSONB;

-- AlterTable
ALTER TABLE "searches" ADD COLUMN     "family_id" INTEGER;

-- CreateTable
CREATE TABLE "makes" (
    "id" SERIAL NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_he" TEXT NOT NULL,
    "aliases" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "makes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_families" (
    "id" SERIAL NOT NULL,
    "make_id" INTEGER NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_he" TEXT NOT NULL,
    "aliases" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_families_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "makes_name_en_key" ON "makes"("name_en");

-- CreateIndex
CREATE UNIQUE INDEX "model_families_make_id_name_en_key" ON "model_families"("make_id", "name_en");

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "model_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "searches" ADD CONSTRAINT "searches_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "model_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_families" ADD CONSTRAINT "model_families_make_id_fkey" FOREIGN KEY ("make_id") REFERENCES "makes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
