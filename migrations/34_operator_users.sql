-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 34: personal accounts for the operator panels
--
--   operator_users              one row per person: username, display name, scrypt password hash,
--                               status (active|disabled|blocked), role, houses (health|beauty|both),
--                               explicit allow/deny permission patterns, per-operation approval
--                               policy, encrypted two-step secret, recovery-code hashes,
--                               authz_version (bumped on every change of power), version
--                               (optimistic lock)
--   operator_sessions.user_id   which person a session belongs to
--   operator_audit_log          user_id, target_user_id, result, request_id (who, to whom, with what outcome, which request)
--
-- Needs migration 30 (operator_sessions, operator_audit_log). Aborts with a clear message when it
-- is missing. Purely additive: no existing row is changed. operator_users is PRIVATE like the other
-- operator tables (row-level security on, no policy, service_role only).
--
-- Database-level guards (the application checks the same rules first; these are the last line):
--   * an account can never be DELETEd (history must stay attributable; accounts are disabled);
--   * the last active owner can never be disabled, blocked, demoted, or lose a house — checked
--     under a row lock, so two simultaneous changes cannot both pass;
--   * `version` and `updated_at` move whenever an administered field changes (optimistic locking).
--
-- Nothing in the application uses these tables until OPERATOR_USERS=on is set on the server.
-- One transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch.
--
-- Rollback (only after the deployed code no longer uses them, i.e. the previous release):
--   ALTER TABLE operator_sessions DROP COLUMN user_id;
--   ALTER TABLE operator_audit_log DROP COLUMN user_id, DROP COLUMN target_user_id, DROP COLUMN result, DROP COLUMN request_id;
--   DROP TABLE operator_users;
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_sessions') IS NULL OR to_regclass('public.operator_audit_log') IS NULL THEN
    RAISE EXCEPTION 'migration 34 needs migration 30 first (operator_sessions / operator_audit_log are missing)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.operator_users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username            TEXT NOT NULL CHECK (username = lower(username) AND username ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  display_name        TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  password_hash       TEXT NOT NULL CHECK (password_hash LIKE 'scrypt:%'),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'blocked')),
  role                TEXT NOT NULL CHECK (role IN ('owner', 'house_admin', 'product_manager', 'quote_manager', 'warehouse_manager', 'viewer')),
  houses              TEXT[] NOT NULL CHECK (cardinality(houses) BETWEEN 1 AND 2 AND houses <@ ARRAY['health', 'beauty']),
  allow_perms         TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(allow_perms) <= 200),
  deny_perms          TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(deny_perms) <= 200),
  approval            JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(approval) = 'object'),
  require_2fa         BOOLEAN NOT NULL DEFAULT TRUE,
  totp_secret_enc     TEXT,
  totp_last_step      BIGINT NOT NULL DEFAULT 0,
  recovery_hashes     TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(recovery_hashes) <= 20),
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  authz_version       INTEGER NOT NULL DEFAULT 1,
  version             INTEGER NOT NULL DEFAULT 1,
  created_by          UUID REFERENCES public.operator_users (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS operator_users_username ON public.operator_users (username);
CREATE INDEX IF NOT EXISTS operator_users_status_role ON public.operator_users (status, role);

ALTER TABLE public.operator_sessions  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.operator_users (id);
ALTER TABLE public.operator_audit_log ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.operator_audit_log ADD COLUMN IF NOT EXISTS target_user_id UUID;      -- the person an account action was done TO
ALTER TABLE public.operator_audit_log ADD COLUMN IF NOT EXISTS result TEXT;
ALTER TABLE public.operator_audit_log ADD COLUMN IF NOT EXISTS request_id TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_audit_log_result_check') THEN
    ALTER TABLE public.operator_audit_log ADD CONSTRAINT operator_audit_log_result_check
      CHECK (result IS NULL OR result IN ('attempt', 'success', 'failure', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_audit_log_request_id_check') THEN
    ALTER TABLE public.operator_audit_log ADD CONSTRAINT operator_audit_log_request_id_check
      CHECK (request_id IS NULL OR char_length(request_id) <= 64);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS operator_sessions_user ON public.operator_sessions (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS operator_audit_log_user ON public.operator_audit_log (user_id, id DESC) WHERE user_id IS NOT NULL;

-- version / updated_at move on every update; the last owner stays; nobody is ever deleted
CREATE OR REPLACE FUNCTION public.operator_users_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'operator accounts are never deleted (disable them instead)' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.role = 'owner' AND OLD.status = 'active'
     AND NOT (NEW.role = 'owner' AND NEW.status = 'active' AND NEW.houses @> ARRAY['health', 'beauty']) THEN
    -- lock the other active owners: two simultaneous demotions cannot both see "someone else is still an owner"
    PERFORM 1 FROM public.operator_users
      WHERE role = 'owner' AND status = 'active' AND houses @> ARRAY['health', 'beauty'] AND id <> OLD.id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'the last active owner cannot be disabled, blocked, demoted or lose a house' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- `version` is the optimistic lock of what an administrator edits: it moves only when one of those fields changes
  -- (a login, a used recovery code or a two-step time step must not make an open edit form stale)
  IF (NEW.username, NEW.display_name, NEW.status, NEW.role, NEW.houses, NEW.allow_perms, NEW.deny_perms, NEW.approval, NEW.require_2fa, NEW.password_hash, NEW.totp_secret_enc)
     IS DISTINCT FROM (OLD.username, OLD.display_name, OLD.status, OLD.role, OLD.houses, OLD.allow_perms, OLD.deny_perms, OLD.approval, OLD.require_2fa, OLD.password_hash, OLD.totp_secret_enc) THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS operator_users_guard_upd ON public.operator_users;
CREATE TRIGGER operator_users_guard_upd BEFORE UPDATE ON public.operator_users
  FOR EACH ROW EXECUTE FUNCTION public.operator_users_guard();
DROP TRIGGER IF EXISTS operator_users_guard_del ON public.operator_users;
CREATE TRIGGER operator_users_guard_del BEFORE DELETE ON public.operator_users
  FOR EACH ROW EXECUTE FUNCTION public.operator_users_guard();

-- private: RLS on, no policy, nothing for anon/authenticated, everything for service_role
ALTER TABLE public.operator_users ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operator_users' LOOP
    EXECUTE format('DROP POLICY %I ON public.operator_users', p.policyname);
  END LOOP;
END $$;
REVOKE ALL ON public.operator_users FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.operator_users TO service_role;
REVOKE ALL ON FUNCTION public.operator_users_guard() FROM PUBLIC, anon, authenticated;

-- self-check
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.operator_users'::regclass) THEN
    RAISE EXCEPTION 'migration 34 self-check failed: row-level security is off on operator_users';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operator_users') THEN
    RAISE EXCEPTION 'migration 34 self-check failed: operator_users has a policy';
  END IF;
  IF has_table_privilege('anon', 'public.operator_users', 'SELECT') OR has_table_privilege('authenticated', 'public.operator_users', 'SELECT')
     OR has_table_privilege('anon', 'public.operator_users', 'INSERT') OR has_table_privilege('authenticated', 'public.operator_users', 'INSERT') THEN
    RAISE EXCEPTION 'migration 34 self-check failed: anon/authenticated can reach operator_users';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.operator_users', 'SELECT') THEN
    RAISE EXCEPTION 'migration 34 self-check failed: service_role cannot read operator_users';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.operator_users'::regclass AND tgname IN ('operator_users_guard_upd', 'operator_users_guard_del')) <> 2 THEN
    RAISE EXCEPTION 'migration 34 self-check failed: guard triggers missing';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_name = 'operator_audit_log' AND column_name IN ('user_id', 'target_user_id', 'result', 'request_id')) <> 4
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'operator_sessions' AND column_name = 'user_id') THEN
    RAISE EXCEPTION 'migration 34 self-check failed: new columns missing';
  END IF;
END $$;

COMMIT;

-- Verify (read-only):
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'operator_users';
--   SELECT has_table_privilege('anon', 'public.operator_users', 'SELECT');   -- false
