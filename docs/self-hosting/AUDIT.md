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

The safest migration target is self-hosted Supabase because it preserves the existing client API and minimizes application rewrites.

## Confirmed external service coupling

- Upstash Redis REST is configured in the current Vercel production environment. Secret values were not collected.
- Google Analytics and Yandex Metrica are optional and controlled by public environment variables.
- The repository contains an Anthropic SDK dependency; all server routes using it must be identified before production deployment.

## Current data footprint

Owner-reported current usage:

- PostgreSQL database: approximately `11 MB`.
- Supabase Storage: approximately `59 KB`.
- Product data is not populated yet.

This is the lowest-risk time to migrate. The schema and import workflow should be stabilized first, but bulk product entry should happen after the self-hosted staging stack is validated. Waiting until the catalog is populated would only increase the value and volume of data that must be moved and reconciled.

## Domain and canonical-host correction

Owner-confirmed domain state and decision:

- `medoria.tj` is not owned by the project and must not remain a production fallback or redirect target.
- `medoria.co` is owned, registered at GoDaddy, and selected as the primary canonical domain.
- `medoriaco.com` is owned, registered at IranServer, and should redirect permanently to `medoria.co` after cutover.
- The registrant and project owner are the same person: Erfan Sajedi.
- The owner has direct access to both registrar accounts.
- DNS has not yet been configured for the new production target.

Current code still falls back to `https://medoria.tj` in `lib/seo.js`, and `next.config.js` redirects `medoria.com`/`www.medoria.com` to `medoria.tj`. This is a release blocker. The correction will be prepared only on this branch and will not be merged or deployed without approval.

### Domain-control requirements before cutover

For `medoriaco.com` at IranServer:

- Keep domain lock enabled.
- Do not request or share the EPP/auth code unless an intentional registrar transfer is started.
- Enable two-factor authentication.
- Confirm account email, recovery access, renewal responsibility, expiration date, and DNS-edit access.

For `medoria.co` at GoDaddy:

- Keep domain lock enabled.
- Enable two-step verification.
- Confirm account recovery and automatic renewal.
- Keep current nameservers unchanged until the VPS and staging endpoint are ready.
- Do not transfer the domain during the infrastructure migration. Registrar transfer, if desired later, is a separate project.

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
10. Replace hard-coded/fallback canonical-domain behavior with `medoria.co` and redirect `medoriaco.com` to it.

## Infrastructure assumptions to validate before purchase

- One VPS is acceptable for the initial stage, provided it has enough RAM and NVMe storage and backups are stored elsewhere.
- PostgreSQL must not be publicly exposed.
- Supabase API and the application must be served through HTTPS.
- Storage and database volumes must be persistent and included in tested backup procedures.
- The provider account, DNS account, and backup account should not share one failure domain where avoidable.

## Information still required

The following can be collected later and secret values must not be posted publicly:

- Whether the Anthropic-backed route is enabled in production.
- Final list of required Supabase services before sizing the VPS.
- Confirmation that two-factor authentication and recovery are configured on both registrar accounts.

## Immediate next implementation step

Prepare the application-only containerization on this branch while keeping Supabase Cloud unchanged. Then deploy self-hosted Supabase staging, validate the schema and product-import workflow, and move bulk product entry to the new environment before production cutover.
