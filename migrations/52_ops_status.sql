-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 52: what the server's own scripts last reported (backup, freshness check, restore drill, heartbeat, alert test) and what an owner confirmed
--
--   public.ops_status   ONE row per kind (the latest report): kind, status, reported_at, last_pass_at, detail, reported_by
--
-- The panel's "System status" screen shows these rows; it NEVER shows green for something it has not heard: no row = unknown, an old row = overdue.
--   backup / backup_check / restore_drill / heartbeat   status 'pass' | 'fail'  — reported by the scripts on the server (through the token-protected
--                                                         /api/internal/ops-report route; the time is the database's clock, never the sender's)
--   alert_test        status 'sent'       — the script SENT a deliberate failure signal; it cannot know whether anybody received it
--   alert_confirmed   status 'confirmed'  — a person with the right typed that they RECEIVED the test alert (their statement, shown as such)
-- `last_pass_at` keeps the last time a 'pass' was reported, so a failing row can still say when it last worked.
-- PRIVATE: row level security on, no policy, nothing for anon / authenticated; service_role selects, inserts and updates (never deletes).
-- No dependency on other migrations. One transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch.
--
-- Rollback (only after the deployed code no longer uses it):  DROP TABLE public.ops_status;  DROP FUNCTION public.ops_status_guard();
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_status (
  kind          TEXT PRIMARY KEY CHECK (kind IN ('backup', 'backup_check', 'restore_drill', 'heartbeat', 'alert_test', 'alert_confirmed')),
  status        TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'sent', 'confirmed')),
  reported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_pass_at  TIMESTAMPTZ,
  detail        TEXT CHECK (detail IS NULL OR char_length(detail) <= 200),
  reported_by   TEXT CHECK (reported_by IS NULL OR char_length(reported_by) <= 80),
  CONSTRAINT ops_status_kind_status CHECK (
    (kind IN ('backup', 'backup_check', 'restore_drill', 'heartbeat') AND status IN ('pass', 'fail'))
    OR (kind = 'alert_test' AND status = 'sent')
    OR (kind = 'alert_confirmed' AND status = 'confirmed')
  )
);

CREATE OR REPLACE FUNCTION public.ops_status_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.reported_at := NOW();                                   -- the sender's clock is never trusted
  IF NEW.status = 'pass' THEN
    NEW.last_pass_at := NEW.reported_at;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.last_pass_at := OLD.last_pass_at;
  ELSE
    NEW.last_pass_at := NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.kind <> OLD.kind THEN
    RAISE EXCEPTION 'ops_status:kind_is_fixed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ops_status_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ops_status_guard ON public.ops_status;
CREATE TRIGGER ops_status_guard BEFORE INSERT OR UPDATE ON public.ops_status FOR EACH ROW EXECUTE FUNCTION public.ops_status_guard();

ALTER TABLE public.ops_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_status FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.ops_status TO service_role;

-- self-check
DO $$
BEGIN
  IF to_regclass('public.ops_status') IS NULL THEN RAISE EXCEPTION 'migration 52 self-check failed: ops_status is missing'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ops_status'::regclass) THEN RAISE EXCEPTION 'migration 52 self-check failed: row-level security is off'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_status') <> 0 THEN RAISE EXCEPTION 'migration 52 self-check failed: the table must have no policy'; END IF;
  IF has_table_privilege('anon', 'public.ops_status', 'SELECT') OR has_table_privilege('authenticated', 'public.ops_status', 'SELECT')
     OR has_table_privilege('anon', 'public.ops_status', 'INSERT') OR has_table_privilege('authenticated', 'public.ops_status', 'UPDATE') THEN
    RAISE EXCEPTION 'migration 52 self-check failed: a public role can reach the status';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.ops_status', 'UPDATE') THEN RAISE EXCEPTION 'migration 52 self-check failed: service_role cannot write'; END IF;
  IF has_table_privilege('service_role', 'public.ops_status', 'DELETE') THEN RAISE EXCEPTION 'migration 52 self-check failed: service_role can delete'; END IF;
END $$;

COMMIT;
