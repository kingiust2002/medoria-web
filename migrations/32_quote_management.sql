-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 32: customer-request management (Health + Beauty)
--
-- New columns on quote_requests and beauty_quote_requests:
--   tracking_code     unguessable reference, e.g. MH-3F9A-C21B-77E0 / MB-… (48 random bits,
--                     from gen_random_uuid(), never derived from the id). Shown to the team and in the
--                     Telegram notice only. There is NO public lookup by code.
--   assigned_to       who looks after the request (free label, max 60 chars; a shared panel
--                     login cannot tell people apart, so this is a typed name, not an identity)
--   first_response_at set once, by trigger, the first time status becomes contacted /
--                     in_progress / quoted / closed (archive and spam are not answers)
--   notify_status     'sent' | 'failed' | 'skipped'  (result of the Telegram notice, NULL = unknown)
--   notify_detail     short class only, e.g. http_401 / network (never a URL, token or message)
--
-- • One all-or-nothing transaction. Adds columns only; no row is deleted and no existing
--   value is changed (updated_at is NOT bumped by the backfill: its trigger is paused
--   for that statement).
-- • Existing rows get a tracking code. New rows get one from the column default.
-- • Idempotent: re-running changes nothing. Tables that do not exist are skipped.
-- • Private-table lock-down (migrations 27/28) is untouched: still RLS on, no policies, no
--   grants to PUBLIC / anon / authenticated.
-- • Until this runs the panel and the forms keep working (new fields just stay empty).
--
-- Rollback (loses the codes and assignments, nothing else):
--   ALTER TABLE quote_requests DROP COLUMN tracking_code, DROP COLUMN assigned_to,
--     DROP COLUMN first_response_at, DROP COLUMN notify_status, DROP COLUMN notify_detail;
--   DROP TRIGGER IF EXISTS trg_quote_requests_first_response ON quote_requests;
--   (same for beauty_quote_requests / trg_beauty_quote_requests_first_response)
--   DROP TRIGGER IF EXISTS trg_quote_requests_tracking_code ON quote_requests;  (same for the Beauty table)
--   DROP FUNCTION IF EXISTS public.quote_set_first_response(), public.quote_set_tracking_code(), public.quote_new_tracking_code(text);
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 12 random hex characters from gen_random_uuid() (its first 12 hex digits are all random;
-- the version nibble comes later) → PREFIX-XXXX-XXXX-XXXX.
CREATE OR REPLACE FUNCTION public.quote_new_tracking_code(prefix text) RETURNS text
LANGUAGE sql VOLATILE AS $f$
  SELECT prefix || '-' || upper(substr(h, 1, 4)) || '-' || upper(substr(h, 5, 4)) || '-' || upper(substr(h, 9, 4))
  FROM (SELECT replace(gen_random_uuid()::text, '-', '') AS h) s
$f$;

-- BEFORE INSERT: a code is always assigned, whoever inserts. Prefix comes from the trigger argument.
-- SECURITY DEFINER so the insert-time call works for service_role although the generator itself
-- is not executable by any API role.
CREATE OR REPLACE FUNCTION public.quote_set_tracking_code() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $f$
BEGIN
  IF NEW.tracking_code IS NULL OR NEW.tracking_code = '' THEN
    NEW.tracking_code := public.quote_new_tracking_code(TG_ARGV[0]);
  END IF;
  RETURN NEW;
END
$f$;

CREATE OR REPLACE FUNCTION public.quote_set_first_response() RETURNS trigger
LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.first_response_at IS NULL
     AND NEW.status IN ('contacted', 'in_progress', 'quoted', 'closed') THEN
    NEW.first_response_at := now();
  END IF;
  RETURN NEW;
END
$f$;

REVOKE ALL ON FUNCTION public.quote_new_tracking_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quote_set_tracking_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quote_set_first_response() FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE
  spec    text[];
  t       text;
  prefix  text;
  upd_trg text;
  paused  boolean;
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['quote_requests',        'MH', 'trg_quote_requests_updated_at'],
    ARRAY['beauty_quote_requests', 'MB', 'trg_beauty_quotes_updated_at']
  ] LOOP
    t := spec[1]; prefix := spec[2]; upd_trg := spec[3];
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %: table does not exist', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tracking_code text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS assigned_to text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS first_response_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS notify_status text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS notify_detail text', t);

    -- backfill existing rows without touching updated_at (its trigger is paused for this statement)
    paused := EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = upd_trg AND tgenabled <> 'D');
    IF paused THEN EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', t, upd_trg); END IF;
    EXECUTE format('UPDATE public.%I SET tracking_code = public.quote_new_tracking_code(%L) WHERE tracking_code IS NULL', t, prefix);
    IF paused THEN EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', t, upd_trg); END IF;

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tracking_code SET NOT NULL', t);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (tracking_code)', t || '_tracking_code_key', t);

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_mgmt_checks');
    EXECUTE format(
      $q$ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
           char_length(assigned_to) <= 60
           AND (notify_status IS NULL OR notify_status IN ('sent', 'failed', 'skipped'))
           AND char_length(notify_detail) <= 40)$q$,
      t, t || '_mgmt_checks');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (assigned_to) WHERE assigned_to IS NOT NULL', t || '_assigned_idx', t);

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_tracking_code', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.quote_set_tracking_code(%L)',
                   'trg_' || t || '_tracking_code', t, prefix);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_first_response', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.quote_set_first_response()',
                   'trg_' || t || '_first_response', t);
  END LOOP;
END $do$;

-- self-check: every row has a code, codes are unique, private-table lock-down intact
DO $do$
DECLARE
  t text;
  missing bigint;
  dup bigint;
  leaked int;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_requests', 'beauty_quote_requests'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tracking_code IS NULL OR tracking_code !~ %L', t, '^M[HB]-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$') INTO missing;
    IF missing > 0 THEN RAISE EXCEPTION 'migration 32 self-check failed for %: % rows without a valid tracking code', t, missing; END IF;
    EXECUTE format('SELECT count(*) - count(DISTINCT tracking_code) FROM public.%I', t) INTO dup;
    IF dup > 0 THEN RAISE EXCEPTION 'migration 32 self-check failed for %: duplicate tracking codes', t; END IF;
    SELECT count(*) INTO leaked FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = t AND grantee IN ('PUBLIC', 'anon', 'authenticated');
    IF leaked > 0 THEN RAISE EXCEPTION 'migration 32 self-check failed for %: a public role has table grants', t; END IF;
  END LOOP;
END $do$;

COMMIT;

-- Verify (read-only):
--   SELECT tracking_code, assigned_to, first_response_at, notify_status FROM quote_requests ORDER BY created_at DESC LIMIT 5;
