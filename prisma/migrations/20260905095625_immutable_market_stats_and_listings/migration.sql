-- Immutability, enforced in the database so it holds for every client (Prisma, scripts, SQL editor).
--   market_stats: append-only. Rows are never updated or deleted (the current norm is the newest row
--                 per group, and an old score stays reconstructable through listings.market_stats_id).
--   listings:     never deleted. UPDATE stays allowed (is_active, delisted_at, score, ...).

CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

-- market_stats: no UPDATE, no DELETE, no TRUNCATE
CREATE TRIGGER market_stats_forbid_update_delete
  BEFORE UPDATE OR DELETE ON "market_stats"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TRIGGER market_stats_forbid_truncate
  BEFORE TRUNCATE ON "market_stats"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

-- listings: no DELETE, no TRUNCATE (UPDATE stays allowed)
CREATE TRIGGER listings_forbid_delete
  BEFORE DELETE ON "listings"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TRIGGER listings_forbid_truncate
  BEFORE TRUNCATE ON "listings"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
