-- Medoria — ROLLBACK of migration 57 (archive of operator accounts). Run it only when the application of the archive release is no longer deployed.
--
-- What it does, in this order (the order matters: migration 57's guard forbids leaving "archived" in any way except a restore, so the OLD guard must be back first):
--   1. removes the trigger that refuses sessions for non-active accounts;
--   2. puts back migration 34's guard function (the last-owner rule and the version lock, without the archive rules);
--   3. turns every archived account into a DISABLED one — never into an active one — and bumps authz_version, so no cookie of the archived time can match;
--      the accounts, ids, usernames and names stay (every record that points at them keeps pointing at them);
--   4. restores the three-value status check, drops the archive stamp check, the index and the four archive columns;
--   5. self-check; the whole script is one transaction: any failure leaves the database as it was.
-- Afterwards a person who should be active again is set active the ordinary way (the people screen of the previous release, or one UPDATE by the owner).
-- Re-applying migration 57 later is possible (it is idempotent).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_users') IS NULL THEN
    RAISE EXCEPTION 'nothing to roll back: operator_users is missing';
  END IF;
END $$;

-- 1
DROP TRIGGER IF EXISTS operator_sessions_active_user ON public.operator_sessions;
DROP FUNCTION IF EXISTS public.operator_sessions_active_user();

-- 2 (verbatim from migrations/34_operator_users.sql)
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
REVOKE ALL ON FUNCTION public.operator_users_guard() FROM PUBLIC, anon, authenticated;

-- 3
UPDATE public.operator_users SET status = 'disabled', authz_version = authz_version + 1 WHERE status = 'archived';

-- 4
ALTER TABLE public.operator_users DROP CONSTRAINT IF EXISTS operator_users_archive_stamp;
DROP INDEX IF EXISTS public.operator_users_archived;
ALTER TABLE public.operator_users DROP CONSTRAINT IF EXISTS operator_users_status_check;
ALTER TABLE public.operator_users ADD CONSTRAINT operator_users_status_check CHECK (status IN ('active', 'disabled', 'blocked'));
ALTER TABLE public.operator_users DROP COLUMN IF EXISTS archived_at, DROP COLUMN IF EXISTS archived_by, DROP COLUMN IF EXISTS restored_at, DROP COLUMN IF EXISTS restored_by;

-- 5
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.operator_users WHERE status NOT IN ('active', 'disabled', 'blocked')) THEN
    RAISE EXCEPTION 'rollback self-check failed: an account still has an unknown status';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'operator_users' AND column_name IN ('archived_at', 'archived_by', 'restored_at', 'restored_by')) THEN
    RAISE EXCEPTION 'rollback self-check failed: archive columns are still there';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.operator_sessions'::regclass AND tgname = 'operator_sessions_active_user') THEN
    RAISE EXCEPTION 'rollback self-check failed: the session trigger is still there';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.operator_users'::regclass AND tgname IN ('operator_users_guard_upd', 'operator_users_guard_del')) <> 2 THEN
    RAISE EXCEPTION 'rollback self-check failed: guard triggers missing';
  END IF;
END $$;

COMMIT;
