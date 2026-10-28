-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 51: two more kinds of site content — the house's contact details and its featured products
--
--   public.site_content (migration 42) gets two new `kind`s:
--     'contact'   ONE row per house: data = { phone?, whatsapp?, telegram?, email? } — shown on the public pages instead of the built-in defaults
--     'featured'  one row per featured product: data = { product_id } — the order (sort_order), the live window and the published switch work
--                 exactly like a banner's; the public home page shows the live ones that are still active products
-- Everything else of migration 42 stays: the public policy (a row is visible only while it is LIVE), the column grants (anon sees id, house, kind,
-- data, sort_order only), the version bump, the fixed house and kind, writes only by service_role.
-- New here: the allowed kinds, one contact row per house, one featured row per product and house, and a shape check for the two kinds — the
-- application validates and normalises first; the database refuses anything that is not a plain phone number, a WhatsApp number (digits), a
-- Telegram user name or an e-mail address, and any key it does not know.
-- Needs migration 42. One transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch.
--
-- Rollback (only after the deployed code no longer uses the kinds):
--   DELETE FROM public.site_content WHERE kind IN ('contact', 'featured');  DROP TRIGGER site_content_shape ON public.site_content;
--   DROP FUNCTION public.site_content_shape();  then restore the old kind CHECK (kind IN ('banner', 'faq')).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.site_content') IS NULL THEN
    RAISE EXCEPTION 'migration 51 needs migration 42 first (site_content is missing)';
  END IF;
END $$;

-- the allowed kinds (the constraint made by migration 42 has the generated name site_content_kind_check)
ALTER TABLE public.site_content DROP CONSTRAINT IF EXISTS site_content_kind_check;
ALTER TABLE public.site_content ADD CONSTRAINT site_content_kind_check CHECK (kind IN ('banner', 'faq', 'contact', 'featured'));

CREATE UNIQUE INDEX IF NOT EXISTS site_content_one_contact ON public.site_content (house) WHERE kind = 'contact';
CREATE UNIQUE INDEX IF NOT EXISTS site_content_one_featured ON public.site_content (house, ((data ->> 'product_id')::bigint)) WHERE kind = 'featured';

CREATE OR REPLACE FUNCTION public.site_content_shape() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  k TEXT;
  v JSONB;
BEGIN
  IF NEW.kind = 'featured' THEN
    IF NOT (NEW.data ? 'product_id') OR jsonb_typeof(NEW.data -> 'product_id') <> 'number'
       OR (NEW.data ->> 'product_id') !~ '^[1-9][0-9]{0,17}$' OR (SELECT count(*) FROM jsonb_object_keys(NEW.data)) <> 1 THEN
      RAISE EXCEPTION 'content:bad_featured' USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.kind = 'contact' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(NEW.data)) = 0 THEN
      RAISE EXCEPTION 'content:bad_contact' USING ERRCODE = 'P0001';
    END IF;
    FOR k, v IN SELECT * FROM jsonb_each(NEW.data) LOOP
      IF jsonb_typeof(v) <> 'string' THEN RAISE EXCEPTION 'content:bad_contact' USING ERRCODE = 'P0001'; END IF;
      IF k = 'phone'     AND (v #>> '{}') !~ '^\+[0-9]{7,15}$' THEN RAISE EXCEPTION 'content:bad_contact' USING ERRCODE = 'P0001'; END IF;
      IF k = 'whatsapp'  AND (v #>> '{}') !~ '^[0-9]{7,15}$' THEN RAISE EXCEPTION 'content:bad_contact' USING ERRCODE = 'P0001'; END IF;
      IF k = 'telegram'  AND (v #>> '{}') !~ '^[A-Za-z0-9_]{5,32}$' THEN RAISE EXCEPTION 'content:bad_contact' USING ERRCODE = 'P0001'; END IF;
      IF k = 'email'     AND ((v #>> '{}') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR char_length(v #>> '{}') > 120) THEN RAISE EXCEPTION 'content:bad_contact' USING ERRCODE = 'P0001'; END IF;
      IF k NOT IN ('phone', 'whatsapp', 'telegram', 'email') THEN RAISE EXCEPTION 'content:bad_contact' USING ERRCODE = 'P0001'; END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.site_content_shape() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS site_content_shape ON public.site_content;
CREATE TRIGGER site_content_shape BEFORE INSERT OR UPDATE ON public.site_content FOR EACH ROW EXECUTE FUNCTION public.site_content_shape();

-- self-check
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.site_content'::regclass AND conname = 'site_content_kind_check' AND pg_get_constraintdef(oid) LIKE '%contact%' AND pg_get_constraintdef(oid) LIKE '%featured%') THEN
    RAISE EXCEPTION 'migration 51 self-check failed: the kind constraint does not list the new kinds';
  END IF;
  IF to_regclass('public.site_content_one_contact') IS NULL OR to_regclass('public.site_content_one_featured') IS NULL THEN RAISE EXCEPTION 'migration 51 self-check failed: an index is missing'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_content') <> 1 THEN RAISE EXCEPTION 'migration 51 self-check failed: expected exactly one policy'; END IF;
  IF has_column_privilege('anon', 'public.site_content', 'updated_label', 'SELECT') OR has_table_privilege('anon', 'public.site_content', 'INSERT') THEN
    RAISE EXCEPTION 'migration 51 self-check failed: a public role gained access';
  END IF;
END $$;

COMMIT;
