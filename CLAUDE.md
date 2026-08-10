# Medoria — permanent project rules

> **Production operations are self-hosted now.** Before touching deployment, database, Supabase, DNS, Caddy, backups, environment variables, or production infrastructure, read **`docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md` in full**. It is the authoritative migration history and operational runbook as of 2026-08-10.

One repo, one house, two equal verticals: **Medoria Health** (B2B medical,
navy/silver/glacial) and **Medoria Beauty** (luxury cosmetics,
ivory/champagne/copper). Gateway at `/` presents both and routes to
`/health/{lang}` and `/beauty/{lang}`.

## Production infrastructure — non-negotiable context

- Canonical production site: **`https://medoriaco.com`**.
- Production Supabase API: **`https://api.medoriaco.com`**.
- `www.medoriaco.com` redirects to the apex domain.
- **Do not use or restore `medoria.tj`, `medoria.co`, or `medoria.com` as the canonical production domain.**
- Production compute is the self-hosted VPS at `91.107.161.56`, not Vercel compute.
- Production app checkout on the VPS: `/home/medoria/apps/medoria-staging`.
- Self-hosted Supabase lives under `/home/medoria/infra/supabase-staging`.
- DNS is still administered through Vercel DNS; this does **not** mean Vercel is the production application host.
- The old Supabase Cloud project is frozen/stale rollback material, **not** a writable production database.
- Production backups are local + encrypted Cloudflare R2. Never send backup contents directly to the raw R2 remote; use the `r2crypt` layer.
- Never print or commit `deploy/.env`, Supabase `.env`, `rclone.conf`, API tokens, DB passwords, service-role keys, operator secrets, or rclone crypt passwords.

### Where future changes belong

- Normal application code: make a focused PR branch from `main`, run tests/lint/build, then merge to `main`.
- The VPS currently uses the dedicated self-hosting/deployment checkout/branch. After an application PR is merged, deploy it **deliberately** to the VPS; never assume a merge to `main` automatically updates production.
- Production Caddy/self-hosting changes require reading the runbook and checking the deployment branch/live VPS first.
- Do not use `git reset --hard` as a routine production synchronization method.
- Before risky DB/infra changes, run a fresh production backup and require the local + R2 backup chain to PASS.

## Process

- Work on PR branches only — never commit to `main`.
- Never commit secrets; never add client-side API keys.
- Never ask the owner for a PAT when the GitHub App/connector path is
  available — use the built-in GitHub tools.
- Always run `npm run lint`, `npm test`, and `npm run build` before a PR.
- Design work is not done until real-screenshot visual QA ran
  (`medoria-gateway-visual-qa`) and was reviewed.

## Brand law (details: `.claude/skills/medoria-brand-guardian`)

- Health and Beauty are equal; neither dominates shared surfaces.
- Each vertical uses ONLY its own logo/wordmark in its own zone; the master
  Medoria mark/wordmark is the only neutral parent branding. No cross-logo
  usage, no redrawing official assets.
- No fake claims, certifications, awards, reviews, or statistics.

## Scope law

- Do not modify Health or Beauty inner pages during gateway work unless
  explicitly requested.
- Do not touch database, admin/operator, auth, middleware, Supabase, DNS,
  Caddy, backup/recovery, or production config unless explicitly requested.
- If production/infrastructure work is explicitly requested, follow
  `docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md` rather than legacy Vercel-era
  deployment assumptions.

## Localization law

- Tajik-first (`tg` default), then Russian and English; short stylistic
  micro-labels may be Latin. Preserve the hidden Persian `fa` RTL routes
  (Vazirmatn fallbacks; brand lockups stay `dir="ltr"`).

## Gateway law

- Server-rendered and crawlable: all 8 entry links in the HTML, works
  JS-off, never auto-forwards.
- Heavy effects (WebGL/video/particles) are dynamically imported, gated
  (reduced-motion, save-data, low cores, small screens), paused offscreen,
  and fully disposed. See `.claude/skills/medoria-performance-a11y-gate`.

## Project skills

`medoria-brand-guardian` · `medoria-gateway-creative-qa` ·
`medoria-gateway-visual-qa` · `medoria-performance-a11y-gate` ·
`medoria-asset-director` · `medoria-pr-ready`
