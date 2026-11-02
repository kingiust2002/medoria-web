-- ═════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 55: the columns a person chose for a list (product list, request list), per person, house and list
--
--   public.operator_table_columns   user_id, house ('health' | 'beauty'), list ('products' | 'quotes'), columns (the chosen fields, in the chosen order)
--
-- A row belongs to ONE person (user_id), ONE house and ONE list; nobody else sees it. `columns` holds field KEYS only (lowercase letters and
-- underscore, at most 12, no repeats): the application accepts only the keys its screen defines and drops any other when reading. No row = the
-- screen's default columns. PRIVATE: row level security on, no policy, nothing for anon / authenticated; only service_role (the panel actions)
-- reads and writes. Removed with the person. Needs migration 34 (operator_users). One transaction; idempotent; self-checking.
--
-- Rollback (only after the deployed code no longer uses it):  DROP TABLE public.operator_table_columns;  DROP FUNCTION public.operator_table_columns_guard();
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_users') IS NULL THEN
    RAISE EXCEPTION 'migration 55 needs migration 34 first (operator_users is missing)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.operator_table_columns (
  user_id    UUID NOT NULL REFERENCES public.operator_users (id) ON DELETE CASCADE,
  house      TEXT NOT NULL CHECK (house IN ('health', 'beauty')),
  list       TEXT NOT NULL CHECK (list IN ('products', 'quotes')),
  columns    TEXT[] NOT NULL CHECK (cardinality(columns) BETWEEN 1 AND 12),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, house, list)
);

CREATE OR REPLACE FUNCTION public.operator_table_columns_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  c TEXT;
BEGIN
  FOREACH c IN ARRAY NEW.columns LOOP
    IF c IS NULL OR c !~ '^[a-z_]{1,24}$' THEN
      RAISE EXCEPTION 'operator_table_columns:bad_key' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF cardinality(NEW.columns) <> (SELECT count(DISTINCT x) FROM unnest(NEW.columns) AS x) THEN
    RAISE EXCEPTION 'operator_table_columns:repeated' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id <> OLD.user_id OR NEW.house <> OLD.house OR NEW.list <> OLD.list THEN
      RAISE EXCEPTION 'operator_table_columns:owner_is_fixed' USING ERRCODE = 'P0001';
    END IF;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.operator_table_columns_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS operator_table_columns_guard ON public.operator_table_columns;
CREATE TRIGGER operator_table_columns_guard BEFORE INSERT OR UPDATE ON public.operator_table_columns FOR EACH ROW EXECUTE FUNCTION public.operator_table_columns_guard();

ALTER TABLE public.operator_table_columns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operator_table_columns FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_table_columns TO service_role;

-- self-check
DO $$
BEGIN
  IF to_regclass('public.operator_table_columns') IS NULL THEN RAISE EXCEPTION 'migration 55 self-check failed: operator_table_columns is missing'; END IF;
  IF has_table_privilege('anon', 'public.operator_table_columns', 'SELECT') OR has_table_privilege('authenticated', 'public.operator_table_columns', 'SELECT') THEN
    RAISE EXCEPTION 'migration 55 self-check failed: the table must be private';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.operator_table_columns'::regclass) THEN
    RAISE EXCEPTION 'migration 55 self-check failed: row level security is off';
  END IF;
END $$;

COMMIT;
