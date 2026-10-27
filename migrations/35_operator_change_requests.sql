-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 35: the approval queue and a trustworthy activity log
--
--   operator_change_requests   "this person wants to make this change; somebody else must approve it first". The live data does not
--                              change until a different, allowed person approves; the request keeps what the record looked like
--                              when it was prepared (`before`, `base_updated_at`) so a stale approval can be refused instead of
--                              overwriting a newer change.
--   operator_audit_log         `before` / `after` (the changed fields of a product or content change, restricted to the people who
--                              may read the log) and — new — rows can no longer be changed or deleted by anybody.
--
-- Needs migrations 30 and 34. Purely additive for existing rows. Private tables (RLS on, no policy, service_role only).
-- One transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch.
--
-- Database-level guards (the application checks the same rules first):
--   * a request is decided once: pending → approved | rejected | cancelled | superseded; approved → failed (the change could not be
--     applied) and approved gets its `executed_at` exactly once; nothing else moves, ever;
--   * the person who asks cannot be the person who decides;
--   * the same person cannot have two identical pending requests (a double click is not two requests);
--   * the activity log is append-only.
--
-- Nothing in the application uses these until OPERATOR_USERS=on and the release that contains the queue is live.
-- Rollback (only after the deployed code no longer uses them):
--   DROP TABLE operator_change_requests;
--   DROP TRIGGER operator_audit_log_append_only ON operator_audit_log; DROP FUNCTION operator_audit_log_guard();
--   ALTER TABLE operator_audit_log DROP COLUMN before, DROP COLUMN after;
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_users') IS NULL OR to_regclass('public.operator_audit_log') IS NULL THEN
    RAISE EXCEPTION 'migration 35 needs migrations 30 and 34 first (operator_audit_log / operator_users are missing)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.operator_change_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house            TEXT NOT NULL CHECK (house IN ('health', 'beauty')),
  resource         TEXT NOT NULL CHECK (resource IN ('products', 'categories', 'brands', 'media', 'documents', 'quotes', 'inventory', 'content')),
  operation        TEXT NOT NULL CHECK (char_length(operation) BETWEEN 3 AND 40),
  entity           TEXT NOT NULL CHECK (char_length(entity) <= 60),
  entity_id        BIGINT,
  subject          TEXT CHECK (subject IS NULL OR char_length(subject) <= 160),
  requested_by     UUID NOT NULL REFERENCES public.operator_users (id),
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_reason   TEXT CHECK (request_reason IS NULL OR char_length(request_reason) <= 500),
  base_updated_at  TIMESTAMPTZ,
  before           JSONB,
  proposed         JSONB NOT NULL CHECK (jsonb_typeof(proposed) = 'object'),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'superseded', 'failed')),
  reviewed_by      UUID REFERENCES public.operator_users (id),
  reviewed_at      TIMESTAMPTZ,
  review_reason    TEXT CHECK (review_reason IS NULL OR char_length(review_reason) <= 500),
  executed_at      TIMESTAMPTZ,
  exec_error       TEXT CHECK (exec_error IS NULL OR char_length(exec_error) <= 200),
  resubmitted_from UUID REFERENCES public.operator_change_requests (id),
  CONSTRAINT operator_change_requests_not_self CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by),
  CONSTRAINT operator_change_requests_pending_open CHECK (status <> 'pending' OR (reviewed_by IS NULL AND reviewed_at IS NULL)),
  CONSTRAINT operator_change_requests_decided_by CHECK (status IN ('pending', 'cancelled', 'superseded') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT operator_change_requests_rejection_reason CHECK (status <> 'rejected' OR char_length(btrim(COALESCE(review_reason, ''))) >= 3)
);
CREATE INDEX IF NOT EXISTS operator_change_requests_queue ON public.operator_change_requests (house, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS operator_change_requests_mine ON public.operator_change_requests (requested_by, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS operator_change_requests_no_duplicate ON public.operator_change_requests
  (requested_by, house, operation, entity, COALESCE(entity_id, 0), md5(proposed::text)) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.operator_change_requests_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'change requests are never deleted' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'pending' THEN
    IF NEW.status = 'pending' THEN
      IF (NEW.proposed, NEW.before, NEW.operation, NEW.entity, NEW.entity_id, NEW.house, NEW.requested_by) IS DISTINCT FROM (OLD.proposed, OLD.before, OLD.operation, OLD.entity, OLD.entity_id, OLD.house, OLD.requested_by) THEN
        RAISE EXCEPTION 'a pending change request is decided or left alone, never edited' USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END IF;
    RETURN NEW;                                    -- pending → approved | rejected | cancelled | superseded (the CHECKs above hold)
  END IF;
  -- decided rows: only "approved → failed", and "approved gets executed_at once"; everything else is frozen
  IF OLD.status = 'approved' AND NEW.status = 'failed' AND NEW.exec_error IS NOT NULL
     AND (NEW.proposed, NEW.before, NEW.operation, NEW.requested_by, NEW.reviewed_by, NEW.reviewed_at) IS NOT DISTINCT FROM (OLD.proposed, OLD.before, OLD.operation, OLD.requested_by, OLD.reviewed_by, OLD.reviewed_at) THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' AND NEW.status = 'approved' AND OLD.executed_at IS NULL AND NEW.executed_at IS NOT NULL
     AND (NEW.proposed, NEW.before, NEW.operation, NEW.requested_by, NEW.reviewed_by, NEW.reviewed_at) IS NOT DISTINCT FROM (OLD.proposed, OLD.before, OLD.operation, OLD.requested_by, OLD.reviewed_by, OLD.reviewed_at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'a decided change request cannot be changed' USING ERRCODE = 'P0001';
END $$;

DROP TRIGGER IF EXISTS operator_change_requests_guard_upd ON public.operator_change_requests;
CREATE TRIGGER operator_change_requests_guard_upd BEFORE UPDATE ON public.operator_change_requests FOR EACH ROW EXECUTE FUNCTION public.operator_change_requests_guard();
DROP TRIGGER IF EXISTS operator_change_requests_guard_del ON public.operator_change_requests;
CREATE TRIGGER operator_change_requests_guard_del BEFORE DELETE ON public.operator_change_requests FOR EACH ROW EXECUTE FUNCTION public.operator_change_requests_guard();

-- the activity log: before / after of a change, and append-only
ALTER TABLE public.operator_audit_log ADD COLUMN IF NOT EXISTS before JSONB;
ALTER TABLE public.operator_audit_log ADD COLUMN IF NOT EXISTS after JSONB;

CREATE OR REPLACE FUNCTION public.operator_audit_log_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the activity log is append-only' USING ERRCODE = 'P0001';
END $$;
DROP TRIGGER IF EXISTS operator_audit_log_append_only ON public.operator_audit_log;
CREATE TRIGGER operator_audit_log_append_only BEFORE UPDATE OR DELETE ON public.operator_audit_log FOR EACH ROW EXECUTE FUNCTION public.operator_audit_log_guard();

-- private: RLS on, no policy, nothing for anon/authenticated, everything for service_role
ALTER TABLE public.operator_change_requests ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operator_change_requests' LOOP
    EXECUTE format('DROP POLICY %I ON public.operator_change_requests', p.policyname);
  END LOOP;
END $$;
REVOKE ALL ON public.operator_change_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.operator_change_requests TO service_role;
REVOKE ALL ON FUNCTION public.operator_change_requests_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operator_audit_log_guard() FROM PUBLIC, anon, authenticated;

-- self-check
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.operator_change_requests'::regclass) THEN
    RAISE EXCEPTION 'migration 35 self-check failed: row-level security is off on operator_change_requests';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operator_change_requests') THEN
    RAISE EXCEPTION 'migration 35 self-check failed: operator_change_requests has a policy';
  END IF;
  IF has_table_privilege('anon', 'public.operator_change_requests', 'SELECT') OR has_table_privilege('authenticated', 'public.operator_change_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.operator_change_requests', 'INSERT') OR has_table_privilege('authenticated', 'public.operator_change_requests', 'INSERT') THEN
    RAISE EXCEPTION 'migration 35 self-check failed: anon/authenticated can reach operator_change_requests';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.operator_change_requests', 'SELECT') THEN
    RAISE EXCEPTION 'migration 35 self-check failed: service_role cannot read operator_change_requests';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname IN ('operator_change_requests_guard_upd', 'operator_change_requests_guard_del', 'operator_audit_log_append_only')) <> 3 THEN
    RAISE EXCEPTION 'migration 35 self-check failed: guard triggers missing';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_name = 'operator_audit_log' AND column_name IN ('before', 'after')) <> 2 THEN
    RAISE EXCEPTION 'migration 35 self-check failed: audit columns missing';
  END IF;
END $$;

COMMIT;

-- Verify (read-only):
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'operator_change_requests';
--   SELECT has_table_privilege('anon', 'public.operator_change_requests', 'SELECT');   -- false
