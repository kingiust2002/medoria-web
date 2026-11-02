-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 50: personal panel preferences (start page and pinned shortcuts), per person and house
--
--   public.operator_preferences   user_id, house ('health' | 'beauty'), start_page (a panel address or NULL = the dashboard), shortcuts (up to 6 panel addresses)
--
-- The addresses are panel paths of that house only (/operator/... for Health, /beauty/operator/... for Beauty). The database checks their SHAPE
-- (lowercase path segments, the house's own prefix, no query string, no repeats, at most 6); the application checks that the person may open each
-- one and drops, when reading, any address the person can no longer open. The table holds nothing else: language and light/dark mode are kept
-- by the browser as before.
-- PRIVATE: row level security on, no policy, nothing for anon / authenticated; only service_role (the panel actions) reads and writes.
-- One row per person and house, removed with the person. Needs migration 34 (operator_users). One transaction; idempotent; self-checking.
--
-- Rollback (only after the deployed code no longer uses it):  DROP TABLE public.operator_preferences;  DROP FUNCTION public.operator_preferences_guard();
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_users') IS NULL THEN
    RAISE EXCEPTION 'migration 50 needs migration 34 first (operator_users is missing)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.operator_preferences (
  user_id     UUID NOT NULL REFERENCES public.operator_users (id) ON DELETE CASCADE,
  house       TEXT NOT NULL CHECK (house IN ('health', 'beauty')),
  start_page  TEXT CHECK (start_page IS NULL OR char_length(start_page) <= 60),
  shortcuts   TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(shortcuts) <= 6),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, house)
);

CREATE OR REPLACE FUNCTION public.operator_preferences_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  addr TEXT;
  pattern TEXT;
BEGIN
  IF NEW.house = 'beauty' THEN
    pattern := '^/beauty/operator(/[a-z]+){0,2}$';
  ELSE
    pattern := '^/operator(/[a-z]+){0,2}$';
  END IF;
  IF NEW.start_page IS NOT NULL AND NEW.start_page !~ pattern THEN
    RAISE EXCEPTION 'operator_preferences:bad_address' USING ERRCODE = 'P0001';
  END IF;
  FOREACH addr IN ARRAY NEW.shortcuts LOOP
    IF addr IS NULL OR addr !~ pattern THEN
      RAISE EXCEPTION 'operator_preferences:bad_address' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF cardinality(NEW.shortcuts) <> (SELECT count(DISTINCT a) FROM unnest(NEW.shortcuts) AS a) THEN
    RAISE EXCEPTION 'operator_preferences:repeated' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id <> OLD.user_id OR NEW.house <> OLD.house THEN
      RAISE EXCEPTION 'operator_preferences:owner_is_fixed' USING ERRCODE = 'P0001';
    END IF;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.operator_preferences_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS operator_preferences_guard ON public.operator_preferences;
CREATE TRIGGER operator_preferences_guard BEFORE INSERT OR UPDATE ON public.operator_preferences FOR EACH ROW EXECUTE FUNCTION public.operator_preferences_guard();

ALTER TABLE public.operator_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operator_preferences FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.operator_preferences TO service_role;

-- self-check
DO $$
BEGIN
  IF to_regclass('public.operator_preferences') IS NULL THEN RAISE EXCEPTION 'migration 50 self-check failed: operator_preferences is missing'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.operator_preferences'::regclass) THEN RAISE EXCEPTION 'migration 50 self-check failed: row-level security is off'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operator_preferences') <> 0 THEN RAISE EXCEPTION 'migration 50 self-check failed: the table must have no policy'; END IF;
  IF has_table_privilege('anon', 'public.operator_preferences', 'SELECT') OR has_table_privilege('authenticated', 'public.operator_preferences', 'SELECT')
     OR has_table_privilege('anon', 'public.operator_preferences', 'INSERT') OR has_table_privilege('authenticated', 'public.operator_preferences', 'UPDATE') THEN
    RAISE EXCEPTION 'migration 50 self-check failed: a public role can reach the preferences';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.operator_preferences', 'UPDATE') THEN RAISE EXCEPTION 'migration 50 self-check failed: service_role cannot write'; END IF;
  IF has_table_privilege('service_role', 'public.operator_preferences', 'DELETE') THEN RAISE EXCEPTION 'migration 50 self-check failed: service_role can delete'; END IF;
END $$;

COMMIT;
