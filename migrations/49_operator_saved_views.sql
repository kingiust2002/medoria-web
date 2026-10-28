-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 49: saved list views (a named set of filters on the product or request list, per person)
--
--   public.operator_saved_views   user_id, house ('health' | 'beauty'), list ('products' | 'quotes'), name, params (the filters, JSON object)
--
-- A view belongs to ONE person (user_id) and ONE house; nobody else sees it. `params` holds only what the list address holds (the application cleans
-- it through the same parser as the page before saving and again before applying). At most 20 views per person per house and list; a name is
-- unique for that person (case-insensitive). Views are created and deleted, never edited in place.
-- PRIVATE: row level security on, no policy, nothing for anon / authenticated; only service_role (the panel actions) reads and writes.
-- Needs migration 34 (operator_users). One transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch.
--
-- Rollback (only after the deployed code no longer uses it):  DROP TABLE public.operator_saved_views;  DROP FUNCTION public.operator_saved_views_guard();
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_users') IS NULL THEN
    RAISE EXCEPTION 'migration 49 needs migration 34 first (operator_users is missing)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.operator_saved_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.operator_users (id) ON DELETE CASCADE,
  house       TEXT NOT NULL CHECK (house IN ('health', 'beauty')),
  list        TEXT NOT NULL CHECK (list IN ('products', 'quotes')),
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  params      JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(params) = 'object' AND pg_column_size(params) <= 2048),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS operator_saved_views_name ON public.operator_saved_views (user_id, house, list, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS operator_saved_views_owner ON public.operator_saved_views (user_id, house, list, created_at);

CREATE OR REPLACE FUNCTION public.operator_saved_views_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'operator_saved_views:never_edited' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.operator_saved_views WHERE user_id = NEW.user_id AND house = NEW.house AND list = NEW.list) >= 20 THEN
    RAISE EXCEPTION 'operator_saved_views:too_many' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.operator_saved_views_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS operator_saved_views_guard ON public.operator_saved_views;
CREATE TRIGGER operator_saved_views_guard BEFORE INSERT OR UPDATE ON public.operator_saved_views FOR EACH ROW EXECUTE FUNCTION public.operator_saved_views_guard();

ALTER TABLE public.operator_saved_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operator_saved_views FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.operator_saved_views TO service_role;

-- self-check
DO $$
BEGIN
  IF to_regclass('public.operator_saved_views') IS NULL THEN RAISE EXCEPTION 'migration 49 self-check failed: operator_saved_views is missing'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.operator_saved_views'::regclass) THEN RAISE EXCEPTION 'migration 49 self-check failed: row-level security is off'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operator_saved_views') <> 0 THEN RAISE EXCEPTION 'migration 49 self-check failed: the table must have no policy'; END IF;
  IF has_table_privilege('anon', 'public.operator_saved_views', 'SELECT') OR has_table_privilege('authenticated', 'public.operator_saved_views', 'SELECT')
     OR has_table_privilege('anon', 'public.operator_saved_views', 'INSERT') OR has_table_privilege('authenticated', 'public.operator_saved_views', 'DELETE') THEN
    RAISE EXCEPTION 'migration 49 self-check failed: a public role can reach the views';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.operator_saved_views', 'INSERT') THEN RAISE EXCEPTION 'migration 49 self-check failed: service_role cannot write'; END IF;
  IF has_table_privilege('service_role', 'public.operator_saved_views', 'UPDATE') THEN RAISE EXCEPTION 'migration 49 self-check failed: service_role can update'; END IF;
END $$;

COMMIT;
