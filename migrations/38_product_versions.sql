-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 38: product version history (Health + Beauty)
--
--   product_versions          one row per change of a Health product: what changed (only the changed fields, old and new
--   beauty_product_versions   value), who did it (the account and its label), how (update | restore | quick | approval),
--                             and when. "Revert this change" in the panel writes the old values back — as a NEW change that
--                             is itself recorded. Rows are append-only: no update, no delete, for anybody.
--
-- No foreign key to the product tables: the history of a permanently deleted product stays readable (and is itself private).
-- Private: RLS on, no policy, nothing for anon / authenticated; service_role may read and append.
-- Needs migration 34 (operator_users). One transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch.
-- Inert until the release that writes it is live.
--
-- Rollback (only after the deployed code no longer uses it):
--   DROP TABLE public.product_versions, public.beauty_product_versions;  DROP FUNCTION public.product_versions_append_only();
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_users') IS NULL THEN
    RAISE EXCEPTION 'migration 38 needs migration 34 first (operator_users is missing)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.product_versions_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'product history is append-only' USING ERRCODE = 'P0001';
END $$;
REVOKE ALL ON FUNCTION public.product_versions_append_only() FROM PUBLIC, anon, authenticated;

DO $mig$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_versions', 'beauty_product_versions'] LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%1$I (
        id            BIGSERIAL PRIMARY KEY,
        product_id    BIGINT NOT NULL,
        kind          TEXT NOT NULL CHECK (kind IN ('update', 'restore', 'quick', 'approval', 'create')),
        changed       TEXT[] NOT NULL DEFAULT '{}',
        before        JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(before) = 'object'),
        after         JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(after) = 'object'),
        actor_user_id UUID REFERENCES public.operator_users (id),
        actor_label   TEXT CHECK (actor_label IS NULL OR char_length(actor_label) <= 80),
        request_id    TEXT CHECK (request_id IS NULL OR char_length(request_id) <= 80),
        reverts_id    BIGINT REFERENCES public.%1$I (id),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT %1$s_size CHECK (pg_column_size(before) + pg_column_size(after) <= 262144)
      )$f$, t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_product ON public.%1$I (product_id, id DESC)', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.product_versions_append_only()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_no_truncate ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_no_truncate BEFORE TRUNCATE ON public.%1$I FOR EACH STATEMENT EXECUTE FUNCTION public.product_versions_append_only()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM service_role', t);
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO service_role', t);
    EXECUTE format('GRANT USAGE ON SEQUENCE public.%I TO service_role', t || '_id_seq');
  END LOOP;
END $mig$;

-- self-check
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_versions', 'beauty_product_versions'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE EXCEPTION 'migration 38 self-check failed: % is missing', t; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN RAISE EXCEPTION 'migration 38 self-check failed: row-level security is off on %', t; END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN RAISE EXCEPTION 'migration 38 self-check failed: % has a policy', t; END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN RAISE EXCEPTION 'migration 38 self-check failed: anon/authenticated can read %', t; END IF;
    IF has_table_privilege('service_role', 'public.' || t, 'UPDATE') OR has_table_privilege('service_role', 'public.' || t, 'DELETE') THEN RAISE EXCEPTION 'migration 38 self-check failed: service_role can change history in %', t; END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'INSERT') THEN RAISE EXCEPTION 'migration 38 self-check failed: service_role cannot append to %', t; END IF;
  END LOOP;
END $$;

COMMIT;
