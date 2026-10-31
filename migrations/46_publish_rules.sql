-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 46: publish quality rules (which gaps of a product BLOCK publishing it), one row per house
--
--   public.publish_rules   house ('health' | 'beauty') → blocking: the codes of the gaps that stop a product from going live
--
-- The codes are the ones of lib/operator/completeness.js (image, sku, category, name_fa…, description_fa…, specs). The database only keeps
-- the list and refuses a code it does not know; the application applies the rule to every way a product can become public (direct save,
-- approved request, scheduled publication, bulk publish, import, restore of a version). An empty list = no rule (the behaviour before this).
-- PRIVATE: row level security on, no policy, nothing for anon / authenticated; only service_role (the panel actions) reads and writes.
-- Every update bumps `version` (the panel's optimistic lock) and `updated_at`; the house never changes; rows are never deleted.
-- Needs migration 34 (operator_users). One transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch.
--
-- Rollback (only after the deployed code no longer uses it):  DROP TABLE public.publish_rules;  DROP FUNCTION public.publish_rules_guard();
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_users') IS NULL THEN
    RAISE EXCEPTION 'migration 46 needs migration 34 first (operator_users is missing)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.publish_rules (
  house         TEXT PRIMARY KEY CHECK (house IN ('health', 'beauty')),
  blocking      TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (
    cardinality(blocking) <= 20 AND blocking <@ ARRAY[
      'image', 'sku', 'category',
      'name_fa', 'name_en', 'name_ru', 'name_tg',
      'description_fa', 'description_en', 'description_ru', 'description_tg',
      'specs'
    ]::text[]
  ),
  version       INT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES public.operator_users (id) ON DELETE SET NULL,
  updated_label TEXT CHECK (updated_label IS NULL OR char_length(updated_label) <= 80)
);

CREATE OR REPLACE FUNCTION public.publish_rules_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'publish_rules:never_deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.house <> OLD.house THEN
    RAISE EXCEPTION 'publish_rules:house_is_fixed' USING ERRCODE = 'P0001';
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.publish_rules_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS publish_rules_guard ON public.publish_rules;
CREATE TRIGGER publish_rules_guard BEFORE UPDATE OR DELETE ON public.publish_rules FOR EACH ROW EXECUTE FUNCTION public.publish_rules_guard();

ALTER TABLE public.publish_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publish_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.publish_rules TO service_role;

-- self-check
DO $$
BEGIN
  IF to_regclass('public.publish_rules') IS NULL THEN RAISE EXCEPTION 'migration 46 self-check failed: publish_rules is missing'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.publish_rules'::regclass) THEN RAISE EXCEPTION 'migration 46 self-check failed: row-level security is off'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'publish_rules') <> 0 THEN RAISE EXCEPTION 'migration 46 self-check failed: the table must have no policy'; END IF;
  IF has_table_privilege('anon', 'public.publish_rules', 'SELECT') OR has_table_privilege('authenticated', 'public.publish_rules', 'SELECT')
     OR has_table_privilege('anon', 'public.publish_rules', 'INSERT') OR has_table_privilege('authenticated', 'public.publish_rules', 'UPDATE') THEN
    RAISE EXCEPTION 'migration 46 self-check failed: a public role can reach the rules';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.publish_rules', 'UPDATE') THEN RAISE EXCEPTION 'migration 46 self-check failed: service_role cannot write'; END IF;
  IF has_table_privilege('service_role', 'public.publish_rules', 'DELETE') THEN RAISE EXCEPTION 'migration 46 self-check failed: service_role can delete'; END IF;
END $$;

COMMIT;
