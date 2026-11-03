-- Medoria — Migration 57: archive of operator accounts (status "archived") with database-level guards
--
-- Why: an account can be disabled or blocked, but a person who has LEFT needs a state of its own: no sign-in, no operations, every old
-- session dead, the account and its id kept (history, warehouse movements, approvals and customer requests keep pointing at them), and the
-- username never given to somebody else. "Archived" is that state; "restore" is the only way back and it never revives an old session.
--
--   archived    left the team. Nothing is deleted. Restorable by a manager (who reviews role / houses / permissions / second factor first).
--   blocked     suspected misuse: kept as a visible warning. Reversible by editing the status.
--   disabled    temporarily switched off (leave, holiday). Reversible by editing the status.
--
-- What:
--   * operator_users.status accepts 'archived'; new columns archived_at / archived_by / restored_at / restored_by (history of the LAST archive).
--   * operator_users_guard() (migration 34) is replaced:
--       - the last-active-owner rule is unchanged and covers 'archived' (an owner who is archived is no longer an active owner), checked under
--         a row lock, so two simultaneous archive / disable / demote requests cannot both pass;
--       - entering or leaving 'archived' always bumps authz_version and stamps archived_at/by or restored_at/by; entering it also revokes
--         every open session of that person IN THE SAME TRANSACTION (the application revokes again, belt and braces);
--       - an archived row can change in exactly one way: back to 'active' (restore). Not to 'disabled'/'blocked', not any other field;
--       - the username of an archived account can never change, and (unique index of migration 34) is never free for a new account.
--   * a trigger on operator_sessions refuses a session for an account that is not active — this closes the race "login read the account while it was
--     still active, the archive committed, then the session row was written".
--   * the activity log gets no new column (migration 34 has user_id / target_user_id / result / request_id).
--
-- Needs 34. One transaction, idempotent, self-check at the end (rolls back on any mismatch).
--
-- Apply order: 34 → … → 57 (nothing between 35 and 56 touches operator_users). The application of this release needs 57 for the archive
-- buttons; without it "archive" is refused by the database (status check) and everything else keeps working.
-- Rollback (only after the application of this release is no longer deployed):
--   1. restore every archived account first:  UPDATE operator_users SET status = 'disabled' WHERE status = 'archived';   (the old guard allows it)
--   2. ALTER TABLE operator_users DROP CONSTRAINT operator_users_status_check;
--      ALTER TABLE operator_users ADD CONSTRAINT operator_users_status_check CHECK (status IN ('active', 'disabled', 'blocked'));
--   3. DROP TRIGGER operator_sessions_active_user ON operator_sessions; DROP FUNCTION operator_sessions_active_user();
--   4. re-run the function body of migration 34 (CREATE OR REPLACE FUNCTION operator_users_guard …)
--   5. ALTER TABLE operator_users DROP COLUMN archived_at, DROP COLUMN archived_by, DROP COLUMN restored_at, DROP COLUMN restored_by;

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_users') IS NULL THEN
    RAISE EXCEPTION 'migration 57 needs migration 34 first (operator_users is missing)';
  END IF;
END $$;

-- ── status accepts 'archived' ─────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.operator_users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ~ 'status'
              AND pg_get_constraintdef(oid) ~ 'disabled' AND conname <> 'operator_users_archive_stamp' LOOP
    EXECUTE format('ALTER TABLE public.operator_users DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.operator_users ADD CONSTRAINT operator_users_status_check CHECK (status IN ('active', 'disabled', 'blocked', 'archived'));

ALTER TABLE public.operator_users ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.operator_users ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.operator_users (id);
ALTER TABLE public.operator_users ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;
ALTER TABLE public.operator_users ADD COLUMN IF NOT EXISTS restored_by UUID REFERENCES public.operator_users (id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operator_users_archive_stamp') THEN
    ALTER TABLE public.operator_users ADD CONSTRAINT operator_users_archive_stamp CHECK (status <> 'archived' OR archived_at IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS operator_users_archived ON public.operator_users (archived_at) WHERE status = 'archived';

-- ── the guard (replaces migration 34's) ───────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operator_users_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'operator accounts are never deleted (archive them instead)' USING ERRCODE = 'P0001';
  END IF;

  -- an archived account changes in exactly one way: back to 'active'. Nothing else (not even a status switch to disabled/blocked).
  IF OLD.status = 'archived' THEN
    IF NEW.status = 'archived' THEN
      IF (NEW.username, NEW.display_name, NEW.role, NEW.houses, NEW.allow_perms, NEW.deny_perms, NEW.approval, NEW.require_2fa, NEW.password_hash, NEW.totp_secret_enc, NEW.archived_at, NEW.archived_by)
         IS DISTINCT FROM (OLD.username, OLD.display_name, OLD.role, OLD.houses, OLD.allow_perms, OLD.deny_perms, OLD.approval, OLD.require_2fa, OLD.password_hash, OLD.totp_secret_enc, OLD.archived_at, OLD.archived_by) THEN
        RAISE EXCEPTION 'an archived account cannot be changed; restore it first' USING ERRCODE = 'P0001';
      END IF;
    ELSIF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'an archived account can only be restored to active' USING ERRCODE = 'P0001';
    ELSIF NEW.username <> OLD.username THEN
      RAISE EXCEPTION 'the username of an archived account is reserved' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- the last active owner stays (an archived owner is no longer an active owner)
  IF OLD.role = 'owner' AND OLD.status = 'active'
     AND NOT (NEW.role = 'owner' AND NEW.status = 'active' AND NEW.houses @> ARRAY['health', 'beauty']) THEN
    PERFORM 1 FROM public.operator_users
      WHERE role = 'owner' AND status = 'active' AND houses @> ARRAY['health', 'beauty'] AND id <> OLD.id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'the last active owner cannot be disabled, blocked, archived, demoted or lose a house' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- entering or leaving the archive: new authz_version, stamps, and every open session of that person ends in this same transaction
  IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    NEW.authz_version := GREATEST(COALESCE(NEW.authz_version, 0), OLD.authz_version + 1);
    NEW.archived_at := NOW();
    NEW.restored_at := OLD.restored_at;
    UPDATE public.operator_sessions SET revoked_at = NOW() WHERE user_id = OLD.id AND revoked_at IS NULL;
  ELSIF OLD.status = 'archived' AND NEW.status = 'active' THEN
    NEW.authz_version := GREATEST(COALESCE(NEW.authz_version, 0), OLD.authz_version + 1);   -- a session of the archived time can never match again
    NEW.restored_at := NOW();
    NEW.must_change_password := TRUE;                                                       -- the old password is not trusted after an absence
  END IF;

  -- `version` is the optimistic lock of what an administrator edits (a login or a used recovery code must not make an open form stale)
  IF (NEW.username, NEW.display_name, NEW.status, NEW.role, NEW.houses, NEW.allow_perms, NEW.deny_perms, NEW.approval, NEW.require_2fa, NEW.password_hash, NEW.totp_secret_enc)
     IS DISTINCT FROM (OLD.username, OLD.display_name, OLD.status, OLD.role, OLD.houses, OLD.allow_perms, OLD.deny_perms, OLD.approval, OLD.require_2fa, OLD.password_hash, OLD.totp_secret_enc) THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.operator_users_guard() FROM PUBLIC, anon, authenticated;

-- ── no new session for an account that is not active ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operator_sessions_active_user() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE st TEXT;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;                       -- the old single-account login has no person
  SELECT status INTO st FROM public.operator_users WHERE id = NEW.user_id FOR SHARE;
  IF st IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'no session for an account that is not active' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.operator_sessions_active_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS operator_sessions_active_user ON public.operator_sessions;
CREATE TRIGGER operator_sessions_active_user BEFORE INSERT ON public.operator_sessions
  FOR EACH ROW EXECUTE FUNCTION public.operator_sessions_active_user();

-- ── self-check ────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.operator_users'::regclass AND conname = 'operator_users_status_check' AND pg_get_constraintdef(oid) ~ 'archived') THEN
    RAISE EXCEPTION 'migration 57 self-check failed: the status check does not accept archived';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_name = 'operator_users' AND column_name IN ('archived_at', 'archived_by', 'restored_at', 'restored_by')) <> 4 THEN
    RAISE EXCEPTION 'migration 57 self-check failed: archive columns missing';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.operator_users'::regclass AND tgname IN ('operator_users_guard_upd', 'operator_users_guard_del')) <> 2 THEN
    RAISE EXCEPTION 'migration 57 self-check failed: guard triggers missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.operator_sessions'::regclass AND tgname = 'operator_sessions_active_user') THEN
    RAISE EXCEPTION 'migration 57 self-check failed: the session trigger is missing';
  END IF;
  IF has_function_privilege('anon', 'public.operator_users_guard()', 'EXECUTE') OR has_function_privilege('authenticated', 'public.operator_sessions_active_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'migration 57 self-check failed: a guard function is executable by the public API roles';
  END IF;
END $$;

COMMIT;

-- Verify (read-only):
--   SELECT status, count(*) FROM operator_users GROUP BY 1;
--   SELECT tgname FROM pg_trigger WHERE tgname IN ('operator_users_guard_upd','operator_sessions_active_user');
