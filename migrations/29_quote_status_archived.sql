-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 29: "archived" quote status (Health + Beauty panels)
--
-- The operator panels get an Archive tab next to Spam. "archived" is a new value
-- of the existing `status` column, so the CHECK constraint of both tables must
-- allow it:   new · contacted · in_progress · quoted · closed · archived · spam
--
-- • One all-or-nothing transaction. Touches ONLY the status CHECK constraints:
--   no row is read, changed or deleted.
-- • Whatever the old constraint was called (migration 02/05 vs 10 named them
--   differently or not at all), every CHECK on the `status` column is replaced by
--   one named `<table>_status_check`. Tables that do not exist are skipped.
-- • Idempotent: re-running leaves the same single constraint.
-- • Self-check at the end aborts (rolls back) unless both constraints accept
--   'archived' and still reject an unknown value.
-- • Until this runs the panel still works; moving a request to the archive just
--   answers "run migration 29" (nothing else is affected).
--
-- Rollback (only after moving archived rows back, e.g. UPDATE … SET status='closed'
-- WHERE status='archived'):
--   ALTER TABLE quote_requests DROP CONSTRAINT quote_requests_status_check;
--   ALTER TABLE quote_requests ADD CONSTRAINT quote_requests_status_check
--     CHECK (status IN ('new','contacted','in_progress','quoted','closed','spam'));
--   (same for beauty_quote_requests)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  t       text;
  c       record;
  allowed constant text := $c$CHECK (status IN ('new','contacted','in_progress','quoted','closed','archived','spam'))$c$;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_requests', 'beauty_quote_requests'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %: table does not exist', t;
      CONTINUE;
    END IF;

    -- drop every CHECK constraint that mentions the status column
    FOR c IN
      SELECT con.conname
      FROM pg_constraint con
      WHERE con.conrelid = ('public.' || t)::regclass
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ~* '\mstatus\M'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, c.conname);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', t, t || '_status_check', allowed);
  END LOOP;
END $$;

-- self-check: the new value is allowed, an unknown one is still rejected
DO $$
DECLARE
  t   text;
  def text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_requests', 'beauty_quote_requests'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint
    WHERE conrelid = ('public.' || t)::regclass AND conname = t || '_status_check';
    IF def IS NULL OR def NOT LIKE '%''archived''%' OR def NOT LIKE '%''spam''%' OR def NOT LIKE '%''new''%' THEN
      RAISE EXCEPTION 'migration 29 self-check failed for %: %', t, coalesce(def, '(no constraint)');
    END IF;
    IF (SELECT count(*) FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ~* '\mstatus\M') <> 1 THEN
      RAISE EXCEPTION 'migration 29 self-check failed for %: expected exactly one status constraint', t;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verify (read-only):
--   SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid IN ('public.quote_requests'::regclass, 'public.beauty_quote_requests'::regclass) AND contype = 'c';
