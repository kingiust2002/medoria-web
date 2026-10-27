-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 42: site content (announcement banner and FAQ) managed from the panels
--
--   public.site_content   one row per banner / FAQ item of ONE house ('health' | 'beauty')
--
-- The texts live in `data` (per language; the application validates and trims them — see lib/siteContent.js), the rest is plain columns.
-- PUBLIC READ IS LIMITED IN THREE WAYS (the public site uses the anon key):
--   * row level   a policy shows a row only while it is LIVE: published, not before publish_at, not from unpublish_at on — so a scheduled
--                 banner appears and disappears by itself, with no cron job (the public pages re-read within a minute);
--   * column level anon / authenticated may read id, house, kind, data, sort_order — never who edited it, never the drafts' dates;
--   * no write    only service_role (the panel actions) inserts, updates or deletes.
-- house and kind never change; every update bumps `version` (the panel's optimistic lock) and `updated_at`.
-- Needs migration 34 (operator_users). One transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch.
--
-- Rollback (only after the deployed code no longer uses it):  DROP TABLE public.site_content;  DROP FUNCTION public.site_content_guard();
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_users') IS NULL THEN
    RAISE EXCEPTION 'migration 42 needs migration 34 first (operator_users is missing)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.site_content (
  id            BIGSERIAL PRIMARY KEY,
  house         TEXT NOT NULL CHECK (house IN ('health', 'beauty')),
  kind          TEXT NOT NULL CHECK (kind IN ('banner', 'faq')),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object' AND pg_column_size(data) <= 12000),
  sort_order    INT NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN -100000 AND 100000),
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  publish_at    TIMESTAMPTZ,
  unpublish_at  TIMESTAMPTZ,
  version       INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES public.operator_users (id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES public.operator_users (id) ON DELETE SET NULL,
  updated_label TEXT CHECK (updated_label IS NULL OR char_length(updated_label) <= 80),
  CONSTRAINT site_content_window CHECK (publish_at IS NULL OR unpublish_at IS NULL OR unpublish_at > publish_at)
);

CREATE INDEX IF NOT EXISTS site_content_house_kind ON public.site_content (house, kind, sort_order, id);

CREATE OR REPLACE FUNCTION public.site_content_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.house <> OLD.house OR NEW.kind <> OLD.kind OR NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'content:house_and_kind_are_fixed' USING ERRCODE = 'P0001';
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.site_content_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS site_content_guard ON public.site_content;
CREATE TRIGGER site_content_guard BEFORE UPDATE ON public.site_content FOR EACH ROW EXECUTE FUNCTION public.site_content_guard();

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_content_live ON public.site_content;
CREATE POLICY site_content_live ON public.site_content FOR SELECT TO anon, authenticated
  USING (is_published AND (publish_at IS NULL OR publish_at <= NOW()) AND (unpublish_at IS NULL OR unpublish_at > NOW()));

REVOKE ALL ON public.site_content FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (id, house, kind, data, sort_order) ON public.site_content TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content TO service_role;
GRANT USAGE ON SEQUENCE public.site_content_id_seq TO service_role;

-- self-check
DO $$
BEGIN
  IF to_regclass('public.site_content') IS NULL THEN RAISE EXCEPTION 'migration 42 self-check failed: site_content is missing'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.site_content'::regclass) THEN RAISE EXCEPTION 'migration 42 self-check failed: row-level security is off'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_content') <> 1 THEN RAISE EXCEPTION 'migration 42 self-check failed: expected exactly one policy'; END IF;
  IF NOT has_column_privilege('anon', 'public.site_content', 'data', 'SELECT') THEN RAISE EXCEPTION 'migration 42 self-check failed: anon cannot read the live content'; END IF;
  IF has_column_privilege('anon', 'public.site_content', 'updated_label', 'SELECT') OR has_column_privilege('anon', 'public.site_content', 'created_by', 'SELECT')
     OR has_column_privilege('anon', 'public.site_content', 'is_published', 'SELECT') OR has_column_privilege('authenticated', 'public.site_content', 'updated_by', 'SELECT') THEN
    RAISE EXCEPTION 'migration 42 self-check failed: a public role can read staff or draft columns';
  END IF;
  IF has_table_privilege('anon', 'public.site_content', 'INSERT') OR has_table_privilege('anon', 'public.site_content', 'UPDATE') OR has_table_privilege('anon', 'public.site_content', 'DELETE')
     OR has_table_privilege('authenticated', 'public.site_content', 'INSERT') OR has_table_privilege('authenticated', 'public.site_content', 'UPDATE') OR has_table_privilege('authenticated', 'public.site_content', 'DELETE') THEN
    RAISE EXCEPTION 'migration 42 self-check failed: a public role can write';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.site_content', 'UPDATE') THEN RAISE EXCEPTION 'migration 42 self-check failed: service_role cannot write'; END IF;
END $$;

COMMIT;
