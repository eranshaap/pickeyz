-- Run 6a (Day 19): public ids, searches.rerun_of, dealer_commercial.updated_at, and the database stamping updated_at itself.

-- 1a. Public ids: add nullable -> fill the existing rows -> NOT NULL -> unique.
ALTER TABLE "listings" ADD COLUMN "public_id" TEXT;
ALTER TABLE "searches" ADD COLUMN "public_id" TEXT;

-- 1b. One-off generator for the rows that exist today; dropped below. New rows get their id from
-- newPublicId() in src/lib/public-id.ts. VOLATILE plpgsql: called once per row, never inlined, never cached.
-- (An uncorrelated sub-select with random() is evaluated ONCE and gives every row the same id — do not use one.)
CREATE FUNCTION "tmp_run6a_public_id"() RETURNS text
LANGUAGE plpgsql VOLATILE
AS $$
DECLARE
  alphabet CONSTANT text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
BEGIN
  FOR i IN 1..10 LOOP
    result := result || substr(alphabet, 1 + floor(random() * 36)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

UPDATE "listings" SET "public_id" = "tmp_run6a_public_id"();
UPDATE "searches" SET "public_id" = "tmp_run6a_public_id"();

DROP FUNCTION "tmp_run6a_public_id"();

ALTER TABLE "listings" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "searches" ALTER COLUMN "public_id" SET NOT NULL;
CREATE UNIQUE INDEX "listings_public_id_key" ON "listings"("public_id");
CREATE UNIQUE INDEX "searches_public_id_key" ON "searches"("public_id");

-- 2. searches.rerun_of: always points at the person's search (a row whose own rerun_of is null).
ALTER TABLE "searches" ADD COLUMN "rerun_of" INTEGER;
CREATE INDEX "searches_rerun_of_idx" ON "searches"("rerun_of");
ALTER TABLE "searches" ADD CONSTRAINT "searches_rerun_of_fkey"
  FOREIGN KEY ("rerun_of") REFERENCES "searches"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- 3. dealer_commercial.updated_at
ALTER TABLE "dealer_commercial" ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 4. The database stamps updated_at itself, whoever writes (Prisma, raw SQL, a hand edit in the Supabase editor).
-- Created AFTER the fill in 1b, so the fill does not touch listings.updated_at.
-- clock_timestamp(), not now(): now() is the START of the transaction, and the scores write is one long
-- transaction — a search that ran in the middle of it would carry a later stamp than the listings and miss the update.
CREATE FUNCTION "set_updated_at"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updated_at" := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "listings_set_updated_at"
  BEFORE INSERT OR UPDATE ON "listings"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();

CREATE TRIGGER "dealer_commercial_set_updated_at"
  BEFORE INSERT OR UPDATE ON "dealer_commercial"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
