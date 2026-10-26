-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 30: operator panel security tables
--
--   operator_audit_log     the activity log of both panels (what was done: action, table, ids,
--                          counts; NEVER customer data, messages or a person's name)
--   operator_sessions      the session registry: one row per login, so a session can be listed,
--                          revoked, and killed by logout
--   operator_totp_state    the last accepted two-step-login time step (a code works once)
--   operator_recovery_used the recovery codes that were used (each works once)
--
-- All four are PRIVATE, like the customer-request tables (migration 28): row-level security on,
-- no policy at all, every privilege revoked from PUBLIC/anon/authenticated, service_role only.
-- Nothing is read, changed or deleted in an existing table. One transaction; idempotent; a
-- self-check at the end aborts (rolls back) on any mismatch.
--
-- Until this runs the panels keep working as before (no registry, no log); once it has run,
-- every login must have a registered session, so run it BEFORE or together with the deploy and
-- expect everyone to log in once more (sessions issued before the registry have no session id).
--
-- Rollback (only after the deployed code no longer needs them, i.e. the previous release):
--   DROP TABLE operator_recovery_used, operator_totp_state, operator_sessions, operator_audit_log;
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.operator_audit_log (
  id          BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  panel       TEXT NOT NULL CHECK (panel IN ('health', 'beauty')),
  action      TEXT NOT NULL CHECK (char_length(action) <= 60),
  entity      TEXT,
  entity_ids  BIGINT[],
  count       INTEGER,
  detail      JSONB,
  session_id  TEXT,
  ip_hash     TEXT
);
CREATE INDEX IF NOT EXISTS operator_audit_log_panel_id ON public.operator_audit_log (panel, id DESC);

CREATE TABLE IF NOT EXISTS public.operator_sessions (
  sid         TEXT PRIMARY KEY,
  panel       TEXT NOT NULL CHECK (panel IN ('health', 'beauty')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip_hash     TEXT
);
CREATE INDEX IF NOT EXISTS operator_sessions_panel_expires ON public.operator_sessions (panel, expires_at);

CREATE TABLE IF NOT EXISTS public.operator_totp_state (
  panel       TEXT PRIMARY KEY CHECK (panel IN ('health', 'beauty')),
  last_step   BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.operator_recovery_used (
  panel       TEXT NOT NULL CHECK (panel IN ('health', 'beauty')),
  code_hash   TEXT NOT NULL,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (panel, code_hash)
);

-- private: RLS on, no policy, nothing for anon/authenticated, everything for service_role
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['operator_audit_log', 'operator_sessions', 'operator_totp_state', 'operator_recovery_used'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- self-check
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['operator_audit_log', 'operator_sessions', 'operator_totp_state', 'operator_recovery_used'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'migration 30 self-check failed: row-level security is off on %', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN
      RAISE EXCEPTION 'migration 30 self-check failed: % still has a policy', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || t, 'SELECT')
       OR has_table_privilege('anon', 'public.' || t, 'INSERT') OR has_table_privilege('authenticated', 'public.' || t, 'INSERT') THEN
      RAISE EXCEPTION 'migration 30 self-check failed: anon/authenticated can still reach %', t;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'migration 30 self-check failed: service_role cannot read %', t;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verify (read-only):
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'operator\_%' AND relkind = 'r';
--   SELECT has_table_privilege('anon', 'public.operator_sessions', 'SELECT');   -- false
