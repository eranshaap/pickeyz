-- AlterTable
ALTER TABLE "search_results" ADD COLUMN     "cheaper_than_cheapest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "runner_up_fact" TEXT,
ADD COLUMN     "sentence_fact" TEXT,
ADD COLUMN     "sentence_kind" TEXT,
ADD COLUMN     "sentence_text" TEXT,
ADD COLUMN     "sentence_values" JSONB;

-- AlterTable
ALTER TABLE "searches" ADD COLUMN     "generator_version" INTEGER;

