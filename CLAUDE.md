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

### The two branches

**Unified 2026-08-18–19 (runbook §18.2 — read its "Closing status" first).**
`main` now carries the deployment surface and is Next 15 / React 19 — the
framework-generation gap and the 42-file divergence described below no
longer exist. `main` tip is **`955f096`**, confirmed live and stable on the
VPS. Some detail from the pre-unification era is kept here because the
observation window hasn't closed and `staging/self-hosting-sync-20260802`
hasn't been retired yet:

- `main` — source of the **application**, base for every new PR, **and now
  also carries the deployment surface**: `Dockerfile`, `deploy/**`,
  `scripts/self-host/**`, `app/api/health/route.js`, `output: "standalone"`,
  and `.github/workflows/self-hosting-ci.yml`. A checkout of `main` is
  deployable, and is what the VPS runs today.
- `staging/self-hosting-sync-20260802` — the **previous** deployment branch.
  It still exists, is still an ancestor of `main` (fast-forward/rollback
  relationship intact), and is kept as the rollback target — **do not delete
  or rename it yet; the observation window is open.** It does not have the
  fixes CI surfaced during unification (`nanoid` pin, Caddy validate
  entrypoint, npm removed from the runtime image, corrected canonical
  redirect in the smoke test, the `STAGING_HOST` removal). See runbook
  §18.2's closing status for the full list and commit SHAs.
- The VPS was switched to check out `main` on 2026-08-18. The switch hit a
  branch-labeling snag — **fixed and confirmed same day**: `git branch -vv`
  on the VPS shows `main` at its own tip and `staging/self-hosting-sync-20260802`
  at its own. Still worth re-checking `git branch -vv` before trusting the
  VPS's git state if anyone else has touched that checkout since.
- **`deploy/Caddyfile`'s `STAGING_HOST`-templated block caused a real outage
  on 2026-08-18** — `deploy/.env`'s `STAGING_HOST` collided with a hardcoded
  host in that same Caddyfile, so Caddy refused to start
  (`ambiguous site definition`) and the container crash-looped. **Fixed for
  good on 2026-08-19**: the vestigial block and `STAGING_HOST` itself are
  removed from the Caddyfile, compose, the env contract, the preflight
  checker, and CI — there is nothing left to collide. Full incident in the
  §18.2 closing status. **Lesson that generalizes:** after any
  `docker compose up -d` touching Caddy, always confirm with
  `docker compose ps` and a live curl — `up -d` reporting "Started" is not
  evidence the container stayed up.
- Never "tidy" the relationship between these two branches with a wholesale
  merge, wholesale rebase, force push, or `git reset --hard`.
- Never reintroduce `exceljs` or `@vercel/analytics` — both were deliberately
  removed from production.
- Retired: PR #116 (`infra/self-hosting`) and PR #117
  (`upgrade/next15-self-hosting`) were closed without merge and their branches
  deleted. Their content is already absorbed (both tips are ancestors of
  `main`). Do not recreate them, and treat any document naming them as stale —
  runbook §1.2.

### Where future changes belong

- Normal application code: make a focused PR branch from `main`, run tests/lint/build, then merge to `main`. `main` now has `self-hosting-ci.yml`, which runs automatically on any PR touching `app/**`, `lib/**`, `Dockerfile`, `deploy/**`, or a handful of other deployment-relevant paths — but it does not cover everything `npm run lint`/`npm test` do, so keep running those yourself too.
- After an application PR is merged, deploy it **deliberately** to the VPS; never assume a merge to `main` automatically updates production.
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
