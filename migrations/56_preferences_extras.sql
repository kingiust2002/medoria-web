-- ═════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 56: more personal preferences — rows per page of the product and request lists, and the dashboard blocks a person shows
--
--   public.operator_preferences  gains   page_size_products  SMALLINT  (25 | 50 | 100, NULL = the screen's default of 25)
--                                        page_size_quotes    SMALLINT  (25 | 50 | 100, NULL = the default)
--                                        dashboard           TEXT[]    (the blocks of the dashboard the person wants, in their order: stats, actions,
--                                                                       quotes, products; NULL = all four in the default order)
--
-- Additive: three nullable columns on the table of migration 50; no row, grant or policy changes (the table stays private). The database checks the
-- values (the three allowed page sizes; the four block names, no repeats, 1–4 of them); the application checks them again and drops what it does not know.
-- Needs migration 50. One transaction; idempotent; self-checking.
--
-- Rollback (only after the deployed code no longer uses them):  ALTER TABLE public.operator_preferences DROP COLUMN page_size_products, DROP COLUMN page_size_quotes, DROP COLUMN dashboard;
--                                                               DROP FUNCTION public.operator_preferences_extras_guard();
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_preferences') IS NULL THEN
    RAISE EXCEPTION 'migration 56 needs migration 50 first (operator_preferences is missing)';
  END IF;
END $$;

ALTER TABLE public.operator_preferences ADD COLUMN IF NOT EXISTS page_size_products SMALLINT;
ALTER TABLE public.operator_preferences ADD COLUMN IF NOT EXISTS page_size_quotes SMALLINT;
ALTER TABLE public.operator_preferences ADD COLUMN IF NOT EXISTS dashboard TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_preferences_page_sizes_check') THEN
    ALTER TABLE public.operator_preferences ADD CONSTRAINT operator_preferences_page_sizes_check
      CHECK ((page_size_products IS NULL OR page_size_products IN (25, 50, 100)) AND (page_size_quotes IS NULL OR page_size_quotes IN (25, 50, 100)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_preferences_dashboard_check') THEN
    ALTER TABLE public.operator_preferences ADD CONSTRAINT operator_preferences_dashboard_check
      CHECK (dashboard IS NULL OR (cardinality(dashboard) BETWEEN 1 AND 4 AND dashboard <@ ARRAY['stats', 'actions', 'quotes', 'products']::text[]));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.operator_preferences_extras_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.dashboard IS NOT NULL AND cardinality(NEW.dashboard) <> (SELECT count(DISTINCT x) FROM unnest(NEW.dashboard) AS x) THEN
    RAISE EXCEPTION 'operator_preferences:repeated_block' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.operator_preferences_extras_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS operator_preferences_extras_guard ON public.operator_preferences;
CREATE TRIGGER operator_preferences_extras_guard BEFORE INSERT OR UPDATE ON public.operator_preferences FOR EACH ROW EXECUTE FUNCTION public.operator_preferences_extras_guard();

-- self-check
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.operator_preferences', 'SELECT') OR has_table_privilege('authenticated', 'public.operator_preferences', 'SELECT') THEN
    RAISE EXCEPTION 'migration 56 self-check failed: the table must stay private';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'operator_preferences'
        AND column_name IN ('page_size_products', 'page_size_quotes', 'dashboard')) <> 3 THEN
    RAISE EXCEPTION 'migration 56 self-check failed: a column is missing';
  END IF;
END $$;

COMMIT;
