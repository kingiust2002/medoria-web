# Medoria Developer Handoff

Last updated: 2026-08-02

This document is the operational handoff for Medoria self-hosting work. It is intended to let a developer or DevOps engineer resume the project without reconstructing the migration history from chat logs.

## 1. Project scope

- Repository: `kingiust2002/medoria-web`
- Application: Next.js application with Health and Beauty areas, public multilingual routes, operator panels, imports, uploads, CAPTCHA, ISR/revalidation, sitemap/SEO and Supabase-backed data/storage.
- Current migration target: self-host the application on a VPS first, initially against the existing Supabase Cloud project; self-host Supabase later after app staging is verified.
- Production Vercel, production Supabase and production DNS must remain unchanged until explicit cutover approval.

## 2. Branch model and merge rules

Important branches:

- `main` — production/mainline application history.
- `infra/self-hosting` — infrastructure/self-hosting base work.
- `upgrade/next15-self-hosting` — Next.js 15 + self-hosting migration branch.
- `staging/self-hosting-sync-20260802` — current reconciliation branch containing migration work plus latest `main` changes.

Current reconciled merge commit:

- `14984a9` — `chore(staging): sync latest main into self-hosting staging`

Rules:

- Do **not** merge migration/self-hosting work into `main` without explicit approval.
- Do **not** change production DNS during staging.
- Do **not** cut production over until staging, rollback and backup procedures are verified.
- Prefer testing the exact branch/commit that will be deployed.

## 3. Current VPS

Provider plan and verified machine characteristics:

- Region: Germany
- OS: Ubuntu 24.04.4 LTS
- Architecture: x86_64
- Virtualization: KVM
- CPU: 8 vCPU, AMD EPYC Rome
- RAM: 16 GB
- Disk: approximately 160 GB provisioned / approximately 150 GB usable filesystem
- Kernel after updates: `6.8.0-136-generic`
- Application SSH user: `medoria`

SSH hardening already applied:

- `PermitRootLogin no`
- `PasswordAuthentication no`
- `KbdInteractiveAuthentication no`
- `PubkeyAuthentication yes`
- `PermitEmptyPasswords no`

Firewall/security state:

- UFW enabled
- default incoming policy: deny
- SSH/22 allowed
- `fail2ban` active
- unattended upgrades installed

Never re-enable password SSH just to work around key problems.

## 4. GitHub access from the VPS

The VPS uses a repository-specific SSH key.

Expected files:

- private key: `~/.ssh/github_medoria`
- public key: `~/.ssh/github_medoria.pub`
- SSH config: `~/.ssh/config`
- known hosts: `~/.ssh/known_hosts`

GitHub repository Deploy Key:

- title: `Medoria VPS Staging`
- access: read/write

Remote should be:

```text
origin  git@github.com:kingiust2002/medoria-web.git
```

Test authentication with:

```bash
ssh -T git@github.com
```

Expected result includes `successfully authenticated` and `GitHub does not provide shell access`.

Never copy, commit or share `~/.ssh/github_medoria`.

## 5. Runtime/toolchain versions

Verified on the VPS:

- Node.js: `v22.23.1`
- npm: `10.9.8`
- Docker Engine: `29.7.1`
- Docker Compose: `v5.3.1`
- Next.js: `15.5.21`
- React / React DOM: `19.2.8`

Node is installed under:

```text
/opt/node-v22.23.1
```

with symlinks under `/usr/local/bin`.

The Ubuntu `apt install npm` packages are not the intended application runtime; Medoria should use Node 22.23.1 above.

## 6. Important server/project paths

Current checkout:

```text
~/apps/medoria-staging
```

Important repository files:

```text
Dockerfile
deploy/compose.app.yml
deploy/Caddyfile
deploy/.env.example
docs/self-hosting/
scripts/check-self-host-env.mjs
```

Self-hosting documentation already in the repository includes migration, audit, app staging, Supabase migration/service inventory, VPS purchase and Next.js 15 upgrade notes.

## 7. Verified application checks on the reconciled staging tree

The reconciled staging tree was tested on Node 22.23.1 before the merge commit was pushed.

Verified results:

```text
npm ci                     PASS
npm audit --omit=dev       PASS — 0 production vulnerabilities
npm test                   PASS — 31/31 tests
npm run lint               PASS — no ESLint warnings/errors
npm run build              PASS — production build completed
```

Build generated all expected static pages and completed successfully.

Known non-blocking warnings during validation:

- `experimental.typedRoutes` has moved to `typedRoutes` in Next.js 15.
- `next lint` is deprecated and should eventually migrate to direct ESLint CLI usage.
- Some Node test imports trigger `MODULE_TYPELESS_PACKAGE_JSON` warnings.
- Full `npm audit` currently reports development-only advisories involving `brace-expansion` and `js-yaml`; `npm audit --omit=dev` is clean.
- Build-time data fetches can log failures against `placeholder.supabase.co` when real staging Supabase env values are intentionally absent. The build still completes.

Do not run `npm audit fix` casually on the deployment branch; it may change the lockfile and dependency graph. Review any dependency update deliberately.

## 8. Normal pre-deploy verification sequence

From the exact checkout being deployed:

```bash
npm ci
npm audit --omit=dev
npm test
npm run lint
npm run build
```

Then validate container/infrastructure configuration before exposing anything publicly:

```bash
docker compose -f deploy/compose.app.yml config
```

Also validate the Caddy configuration and container image/runtime before cutover. Do not treat an older CI run on a different commit as proof that the current deployment tree is healthy.

## 9. Docker/network exposure rules

Docker-published ports can bypass assumptions people make from UFW rules. Treat Docker exposure explicitly.

Rules for Medoria:

- Public edge: Caddy only, eventually on ports 80/443.
- Application service: private/internal Docker network where possible.
- Temporary direct host binding for app testing: prefer `127.0.0.1`, not `0.0.0.0`.
- Postgres, storage internals, admin services and future self-hosted Supabase internals must not be internet-exposed unless there is a specific, reviewed need.
- Database ports must not be opened publicly for convenience.

The `docker` Unix group effectively grants root-equivalent Docker daemon access. Treat membership as privileged access.

## 10. Supabase/service architecture

Current migration strategy:

1. Deploy the application staging branch to the VPS.
2. Initially point it at the existing Supabase Cloud project.
3. Verify all application behavior on the VPS.
4. Only then self-host Supabase in staging and migrate database/storage.
5. Cut production over only after backups, rollback and observability are proven.

Application runtime currently relies on:

- Postgres
- PostgREST/data API behavior
- Supabase Storage

The audited application does not rely on Supabase Auth, Realtime or Edge Functions for its current authentication/runtime flow. Operator authentication uses custom HMAC/session-cookie logic.

Known storage buckets:

```text
product-images
beauty-product-images
beauty-brand-logos
```

Known RPC functions:

```text
increment_product_views
increment_beauty_product_views
```

Before final production cutover, rotate any Supabase credentials that may have been exposed during previous development/debugging work.

## 11. Environment variables

Never store actual secret values in this file, Git, issue bodies, PR comments or chat transcripts.

Known environment variable names used by the project include:

```text
BEAUTY_OPERATOR_PASSWORD_HASH
BEAUTY_OPERATOR_SESSION_SECRET
BEAUTY_OPERATOR_USERNAME
CAPTCHA_SECRET
UPSTASH_REDIS_REST_TOKEN
UPSTASH_REDIS_REST_URL
OPERATOR_USERNAME
HUGGING_FACE_API_KEY
GOOGLE_TRANSLATE_API_KEY
OPERATOR_PASSWORD_HASH
OPERATOR_SESSION_SECRET
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_EMAIL
NEXT_PUBLIC_PHONE
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_TG_USERNAME
NEXT_PUBLIC_WA_NUMBER
```

Use `deploy/.env.example` and `scripts/check-self-host-env.mjs` as the authoritative project-side contract. Real server env files should be owned appropriately and mode `600` where possible.

Upstash is optional in the self-hosting work; the application has an in-memory fallback. A local Valkey/Redis-compatible service may be introduced later if required.

## 12. Application areas that must be smoke-tested before cutover

At minimum verify:

- Health public routes in all supported locales
- Beauty public routes in all supported locales
- operator login/logout/session behavior
- Beauty operator login/logout/session behavior
- category navigation/drill-down
- product detail routes
- contact/quote submission flows
- CAPTCHA behavior
- imports, including the real 27-column spreadsheet template
- image uploads and storage reads
- Beauty and Health product images
- ISR/revalidation behavior
- sitemap and robots output
- SEO/canonical URLs
- secure-cookie behavior behind real HTTPS
- client IP handling behind Caddy/reverse proxy
- `/api/health`

Do not assume a successful Next.js build proves these runtime integrations.

## 13. Spreadsheet/import notes

The migration branch replaced prior ExcelJS usage with a custom OOXML writer while retaining SheetJS `xlsx` where needed.

The import/template contract includes 27 columns and has dedicated verification tests. Test with the real operator workflow before cutover, not only synthetic unit tests.

## 14. Backup and rollback requirements

Before production cutover:

- create an independent encrypted database backup
- create an independent storage backup
- keep backups outside the VPS/provider account
- test restore procedure, not only backup creation
- record the exact application commit/image being deployed
- retain the previous working deployment/image for rollback
- document DNS values before changing them
- lower DNS TTL ahead of planned cutover if appropriate

Do not rely only on a VPS snapshot as the sole database/storage backup.

## 15. Security rules

- No secrets in Git.
- No private keys in Git.
- No passwords/tokens in chat or issue/PR comments.
- No direct root SSH.
- No password SSH.
- Do not expose Postgres/admin/internal services publicly.
- Keep production credentials separate from staging credentials when possible.
- Rotate potentially exposed credentials before production cutover.
- Review Docker port publishing explicitly.
- Keep system, Docker images and application dependencies patched deliberately.

## 16. Production cutover gate

Production cutover should happen only after all of the following are true:

- exact staging commit deployed successfully
- application tests/build/container checks green
- public and operator smoke tests green
- real HTTPS/TLS through Caddy verified
- secure cookies verified over HTTPS
- existing Supabase Cloud integration verified from VPS
- if self-hosting Supabase: DB/storage migration and restore tested
- offsite backups verified
- rollback procedure verified
- monitoring/log review completed for the staging observation period
- explicit owner approval received

Until then, leave production Vercel, Supabase and DNS untouched.

## 17. First commands when resuming work

```bash
ssh medoria@<VPS_HOST>
cd ~/apps/medoria-staging
git status
git branch --show-current
git fetch origin
git log -5 --oneline --decorate
node -v
npm -v
docker --version
docker compose version
```

Before modifying/deploying, confirm the active branch and remote state. Do not blindly `git pull` across an unresolved merge or dirty worktree.

## 18. Current next deployment milestone

The reconciliation of latest `main` with the self-hosting/Next.js 15 migration is complete and pushed to `staging/self-hosting-sync-20260802`.

Next milestone: deploy that exact staging tree on the VPS using the existing Supabase Cloud connection, keep internal services private, validate Docker/Caddy/runtime health and run the application smoke-test matrix before any production cutover.
