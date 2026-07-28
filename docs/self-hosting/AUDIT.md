# Self-hosting audit

Scope: repository preparation and automated validation only. No production system, DNS record, Vercel domain, or Supabase Cloud resource has been changed.

## Application baseline

- Next.js `14.2.35` with the App Router.
- React `18.3.1`.
- Supabase JS client `2.108.1`.
- Docker build and runtime use Node.js `22.23.1`.
- Next.js standalone output is enabled.
- `sharp@0.34.5` is a direct, exact, lockfile-managed production dependency.

## Vercel coupling status

Completed on the migration branch:

- `@vercel/analytics` rendering was removed.
- `@vercel/analytics` was removed from `package.json` and `package-lock.json`.
- `vercel.json` was removed.
- Vercel Analytics CSP origins were removed.
- The application can run as a standard standalone Node.js container.

The existing Vercel production project and domain assignments remain unchanged as rollback targets.

## Supabase coupling

- Data access uses `@supabase/supabase-js` and PostgREST-style queries.
- Product images use Supabase Storage public URLs.
- Protected server writes use a Supabase service-role credential.
- Database behavior includes RLS and at least one RPC used for product-view counting.
- Supabase Auth is not required by the operator login implementation.

The safest database migration target remains self-hosted Supabase because it preserves the current API surface and avoids a broad data-layer rewrite.

## Other external services

- Upstash Redis REST is configured in the current Vercel production environment. Secret values were not collected.
- Google Analytics and Yandex Metrica are optional and controlled by public environment variables.
- Anthropic, Hugging Face, and Google Translate credentials are represented as optional server-only values; active production routes still need final inventory before cutover.

## Current data footprint

Owner-reported usage:

- PostgreSQL database: approximately `11 MB`.
- Supabase Storage: approximately `59 KB`.
- Product data is not populated yet.

This is the lowest-risk migration window. Schema and import behavior should be validated on the new stack before bulk product entry.

## Domain state

- `medoria.tj` is not owned by the project and must not be used as a fallback or redirect target.
- `medoria.co` is registered at GoDaddy and selected as the future primary canonical domain.
- GoDaddy account access is temporarily unavailable; DNS inspection is deferred.
- `medoriaco.com` is registered at IranServer and will redirect to `medoria.co` after cutover.
- The registrant and project owner are the same person: Erfan Sajedi.
- `medoriaco.com` currently delegates authoritative DNS to Vercel through `ns1.vercel-dns.com` and `ns2.vercel-dns.com`.
- `www.medoriaco.com` is the current Vercel production domain.
- The apex `medoriaco.com` currently returns a permanent `308` redirect to `www.medoriaco.com`.
- `medoria-web.vercel.app` remains attached as a production domain.

Implemented only on the migration branch:

- canonical fallback changed to `https://medoria.co`;
- future permanent redirects prepared from `medoriaco.com`, `www.medoriaco.com`, and `www.medoria.co` to `medoria.co`.

No DNS record or production domain behavior has been changed.

## Application-only staging implementation

Implemented:

1. Multi-stage production Dockerfile.
2. Non-root runtime user.
3. Standalone Next.js server.
4. Exact Node.js 22 runtime image.
5. Lockfile-managed `sharp` runtime.
6. Dynamic no-cache `/api/health` endpoint.
7. Docker health check.
8. Caddy `2.11.4` reverse proxy with automatic TLS configuration.
9. Docker Compose staging stack.
10. Persistent Next.js cache volume.
11. Bounded Docker JSON logs.
12. Read-only Caddy configuration mount.
13. `no-new-privileges` and dropped Linux capabilities for the application container.
14. Secret-free environment template.
15. Environment preflight validation that does not print values.
16. Operational runbook and rollback procedure.

## Automated validation

The GitHub Actions self-hosting workflow validates:

- `npm ci`;
- lint;
- unit tests;
- JavaScript syntax;
- environment-variable contract;
- standalone Next.js production build;
- presence of `.next/standalone/server.js`;
- Docker Compose rendering;
- final production Docker image build;
- `sharp` loading inside the final image;
- running container health endpoint.

The latest completed full run before this documentation-only update passed every automated step. A final run against the current code head must remain green before the PR leaves draft status.

## Still required before production cutover

- Buy and provision a staging VPS.
- Add only a temporary staging DNS record after the VPS IP exists.
- Enter secrets directly on the server.
- Deploy the app-only stack while retaining Supabase Cloud.
- Test public routes, both operator panels, CAPTCHA, quote submission, image transformations, ISR, redirects, SEO, and Upstash behavior.
- Confirm proxy client-IP extraction and secure-cookie behavior.
- Observe staging for at least 48 hours.
- Inventory the exact Supabase services required.
- Build self-hosted Supabase staging.
- Test database and Storage copy, RLS, RPCs, backups, and restore.
- Restore GoDaddy access before the final `medoria.co` cutover.

## Domain-control requirements

For IranServer:

- keep domain lock enabled;
- enable two-factor authentication;
- confirm account recovery and renewal responsibility;
- do not request or share the EPP code;
- keep Vercel nameservers unchanged until replacement DNS is ready.

For GoDaddy after access is restored:

- keep domain lock enabled;
- enable two-step verification;
- confirm recovery and automatic renewal;
- inspect current DNS without changing it;
- do not combine registrar transfer with infrastructure migration.

## Immediate next phase

Provision an isolated VPS for application-only staging, deploy the tested Docker/Compose stack against the existing Supabase Cloud project, and complete the documented smoke-test and observation period. Production remains on Vercel until that phase succeeds.
