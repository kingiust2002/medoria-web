# Initial self-hosting audit

Scope: repository configuration only. No production systems were changed.

## Current application baseline

- Next.js `14.2.35` using the App Router.
- React `18.3.1`.
- Supabase JS client `2.108.1`.
- The production build currently uses the default Next.js output; standalone output is not enabled.
- `sharp` is not declared as a direct dependency.

## Confirmed Vercel coupling

1. `@vercel/analytics` is installed and rendered by the root layout.
2. `vercel.json` pins functions to `fra1`.
3. The Content Security Policy explicitly allows:
   - `https://va.vercel-scripts.com`
   - `https://vitals.vercel-insights.com`
4. Comments and operational assumptions in configuration refer to Vercel proxy behavior.

These are low-complexity removals. They are not blockers to self-hosting.

## Confirmed Supabase coupling

- Application data access uses `@supabase/supabase-js` and PostgREST-style queries.
- Product images are resolved through Supabase Storage public URLs.
- Server-side protected writes use the Supabase service-role credential.
- Database behavior includes RLS and at least one RPC used for product-view counting.

The safest migration target is self-hosted Supabase first, because it preserves the existing client API and minimizes application rewrites.

## Confirmed external service coupling

- Upstash Redis REST is configured in the current Vercel production environment. Secret values were not collected.
- Google Analytics and Yandex Metrica are optional and controlled by public environment variables.
- The repository contains an Anthropic SDK dependency; all server routes using it must be identified before production deployment.

## Domain and canonical-host correction

Owner-confirmed domain state:

- `medoria.tj` is not owned by the project and must not remain a production fallback or redirect target.
- `medoriaco.com` is currently owned.
- `medoria.co` is also owned but has not yet been configured.
- The final primary canonical domain is still to be selected explicitly before DNS or SEO changes.

Current code still falls back to `https://medoria.tj` in `lib/seo.js`, and `next.config.js` redirects `medoria.com`/`www.medoria.com` to `medoria.tj`. This is a release blocker. The correction will be prepared only on this branch and will not be merged or deployed without approval.

## Initial application-container changes required

1. Enable `output: "standalone"`.
2. Add a reproducible production Dockerfile.
3. Run the application as a non-root user.
4. Add a health endpoint and Docker health check.
5. Decide how ISR/Data Cache persistence is handled on the VPS.
6. Add `sharp` as a pinned runtime dependency and update the lockfile through a normal package-manager install.
7. Remove Vercel Analytics and Vercel-specific CSP origins.
8. Retain the current Supabase Cloud environment during the first staging deployment.
9. Verify proxy headers for IP extraction and secure cookies behind the chosen reverse proxy.
10. Replace hard-coded/fallback canonical-domain behavior after the owner selects the primary domain.

## Infrastructure assumptions to validate before purchase

- One VPS is acceptable for the initial stage, provided it has enough RAM and NVMe storage and backups are stored elsewhere.
- PostgreSQL must not be publicly exposed.
- Supabase API and the application must be served through HTTPS.
- Storage and database volumes must be persistent and included in tested backup procedures.
- The provider account, DNS account, and backup account should not share one failure domain where avoidable.

## Information still required

The following can be collected later and secret values must not be posted publicly:

- Current database size and row counts.
- Current Storage bucket names, object counts, and total size.
- Registrar/DNS provider for `medoriaco.com` and `medoria.co`.
- Explicit choice of the primary canonical domain.
- Whether the Anthropic-backed route is enabled in production.

## Immediate next implementation step

Prepare the application-only containerization on this branch while keeping Supabase Cloud unchanged. This allows a staging deployment on a VPS without any database migration or production DNS change.
