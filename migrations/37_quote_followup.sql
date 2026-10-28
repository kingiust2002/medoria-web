-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 37: follow-up of customer requests (Health + Beauty)
--
-- New columns on quote_requests and beauty_quote_requests:
--   follow_up_at           the day somebody promised to call back / send the offer (NULL = none). The panel shows
--                          "today" and "overdue" follow-ups next to the requests nobody has answered yet.
--   assigned_user_id       the REAL person looking after the request (an operator_users account); `assigned_to`
--                          stays the label that is shown (and the only value for the old shared login). Set to NULL
--                          automatically if the account is ever removed.
--   notify_attempts        how many times the Telegram notice was (re)sent for this request, including the first
--   notify_last_attempt_at when the last attempt happened (the panel's "send again" waits 30 s between attempts)
--
-- Needs migrations 32 (the quote columns) and 34 (operator_users). Adds columns only: no row is deleted and no existing
-- value is changed. One transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch. Private
-- tables stay private (RLS on, no policy, nothing for anon / authenticated) — this migration does not touch grants.
-- Until the release that uses them is live nothing reads these columns.
--
-- Rollback (loses follow-up dates and real-person assignments only):
--   ALTER TABLE quote_requests DROP COLUMN follow_up_at, DROP COLUMN assigned_user_id, DROP COLUMN notify_attempts, DROP COLUMN notify_last_attempt_at;
--   (same for beauty_quote_requests; DROP INDEX IF EXISTS quote_requests_follow_up_idx, beauty_quote_requests_follow_up_idx;)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operator_users') IS NULL THEN
    RAISE EXCEPTION 'migration 37 needs migration 34 first (operator_users is missing)';
  END IF;
  IF to_regclass('public.quote_requests') IS NULL OR to_regclass('public.beauty_quote_requests') IS NULL THEN
    RAISE EXCEPTION 'migration 37 needs the request tables (quote_requests, beauty_quote_requests)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quote_requests' AND column_name = 'tracking_code') THEN
    RAISE EXCEPTION 'migration 37 needs migration 32 first (quote management columns are missing)';
  END IF;
END $$;

ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES public.operator_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notify_attempts INT NOT NULL DEFAULT 0 CHECK (notify_attempts >= 0),
  ADD COLUMN IF NOT EXISTS notify_last_attempt_at TIMESTAMPTZ;
ALTER TABLE public.beauty_quote_requests
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES public.operator_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notify_attempts INT NOT NULL DEFAULT 0 CHECK (notify_attempts >= 0),
  ADD COLUMN IF NOT EXISTS notify_last_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS quote_requests_follow_up_idx ON public.quote_requests (follow_up_at) WHERE follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS beauty_quote_requests_follow_up_idx ON public.beauty_quote_requests (follow_up_at) WHERE follow_up_at IS NOT NULL;

-- self-check
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_requests', 'beauty_quote_requests'] LOOP
    IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t
        AND column_name IN ('follow_up_at', 'assigned_user_id', 'notify_attempts', 'notify_last_attempt_at')) <> 4 THEN
      RAISE EXCEPTION 'migration 37 self-check failed: columns missing on %', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'migration 37 self-check failed: anon/authenticated can read %', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
