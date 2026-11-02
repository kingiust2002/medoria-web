// the minimum of the catalog / customer-request tables that migration 53's functions read, for throw-away PostgreSQL tests
export const SCHEMA = `
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;
CREATE TABLE public.categories (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name_en TEXT, parent_id BIGINT REFERENCES public.categories(id));
CREATE TABLE public.products (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, sku TEXT, category TEXT, category_id BIGINT REFERENCES public.categories(id) ON DELETE SET NULL, name_en TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.quote_requests (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tracking_code TEXT, name TEXT, status TEXT DEFAULT 'new', updated_at TIMESTAMPTZ DEFAULT clock_timestamp());
CREATE TABLE public.beauty_categories (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name_en TEXT, parent_id BIGINT REFERENCES public.beauty_categories(id) ON DELETE CASCADE);
CREATE TABLE public.beauty_products (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, sku TEXT, category TEXT, category_id BIGINT REFERENCES public.beauty_categories(id) ON DELETE SET NULL, name_en TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.beauty_quote_requests (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tracking_code TEXT, name TEXT, status TEXT DEFAULT 'new', updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.beauty_brands (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, slug TEXT, name TEXT, logo_url TEXT);
CREATE TRIGGER t_p BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_bp BEFORE UPDATE ON public.beauty_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_q BEFORE UPDATE ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_bq BEFORE UPDATE ON public.beauty_quote_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT ON public.products, public.quote_requests TO anon, authenticated;`;
