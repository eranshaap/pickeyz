-- AlterTable
ALTER TABLE "dealers" DROP COLUMN "email",
DROP COLUMN "region";

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "city" TEXT;

-- Day 19b, Run 20: the retired area "שרון" merged into "מרכז" (DECISIONS-day19b-sheet-import.md ב.1.6).
-- listings only — the dealer's area column is dropped above. One-time by construction: a migration runs once.
UPDATE "listings" SET "region" = 'מרכז' WHERE "region" = 'שרון';

