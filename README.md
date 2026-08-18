# 🏥 Medoria

Medoria is a multilingual platform with two equal verticals: **Medoria Health** and **Medoria Beauty**, built with Next.js + Supabase.

> ## ⚠️ Production deployment changed in August 2026
>
> The live system is **self-hosted on a VPS**. Vercel is still used for DNS administration/preview integrations, but **Vercel compute and Supabase Cloud are no longer the production runtime/database**.
>
> Canonical production site: **`https://medoriaco.com`**  
> Production Supabase API: **`https://api.medoriaco.com`**
>
> Before any production, database, DNS, Caddy, Supabase, backup, or migration work, read:
>
> **[`docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md`](docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md)**
>
> AI/Claude agents must also read **[`CLAUDE.md`](CLAUDE.md)**. The older Vercel/Supabase-Cloud deployment instructions that once lived in this README are historical and must not be used for the live production system.

---

## ✨ Core product capabilities

### Multilingual

- Tajik
- Russian
- English
- Persian / RTL route support
- localized metadata and UI copy

### Catalogs

- Health and Beauty verticals
- search and filtering
- category taxonomies
- brand directory
- product pages and imagery
- product comparison and B2B quote flows

### Operator tooling

- Health and Beauty operator surfaces
- product/category/brand management
- image uploads
- CSV/XLS/XLSX import pipeline
- multilingual auto-translation
- Cloudflare Workers AI server-side translation

---

## 🚀 Current production architecture

Production is currently:

```text
Internet
  -> Vercel DNS
  -> VPS 91.107.161.56
      -> Caddy
          -> Next.js application container
          -> self-hosted Supabase Kong
              -> REST / Auth / Storage
              -> PostgreSQL / Storage services
```

Canonical hosts:

```text
https://medoriaco.com
https://www.medoriaco.com       -> apex redirect
https://api.medoriaco.com
https://staging.medoriaco.com
https://api-staging.medoriaco.com
```

The production app checkout currently lives on the VPS at:

```text
/home/medoria/apps/medoria-staging
```

The self-hosted Supabase stack lives under:

```text
/home/medoria/infra/supabase-staging
```

For the exact branch state, DNS records, migration chronology, backups, restore procedure, rollback rules, and future migration checklist, use the production runbook rather than this README.

---

## 🔄 Development workflow

Normal application work should follow the repository rules in `CLAUDE.md`:

1. Create a focused PR branch from `main`.
2. Do not commit directly to `main`.
3. Never commit secrets.
4. Run:

```bash
npm ci
npm test
npm run lint
npm run build
```

5. Review the diff for scope and secrets.
6. Merge the approved PR.
7. Production deployment to the VPS is a deliberate operational step; a GitHub merge alone must not be assumed to update the live VPS.

For infrastructure or database changes, first run a fresh production backup and follow the runbook.

---

## 🛡️ Production backup baseline

The live system has:

- daily local production backups;
- 14-day local retention;
- encrypted Cloudflare R2 off-site backup;
- 90-day R2 retention;
- rclone client-side content/filename encryption;
- checksum verification;
- tested PostgreSQL 17 restore path.

Never upload production backup directories directly to the raw R2 remote. The encrypted `r2crypt` layer is required.

---

## 🔐 Secrets

Never commit or paste into issues/PRs/chat:

- `.env` files;
- Supabase service-role keys;
- database passwords;
- operator passwords/session secrets;
- Cloudflare API tokens;
- R2 Access Key / Secret;
- `rclone.conf`;
- rclone crypt Password 1 / Password 2.

---

## 📦 Product data and images

Product/catalog data lives in the production self-hosted Supabase instance. Storage buckets include Health and Beauty product/brand imagery.

The VPS became the production source of truth after the August 2026 cutover. Do not restore an old Supabase Cloud dump over the live VPS merely to "sync" environments.

---

## 🛠️ High-level repository structure

On `main`, the application source branch:

```text
app/                    Next.js application routes
components/             shared and vertical UI
lib/                    data, auth, operator and domain logic
migrations/             version-controlled database migrations
public/                 static assets
scripts/                build/content helpers
docs/                   design and production documentation
.claude/                project skills/rules for Claude workflows
CLAUDE.md               permanent project + production-agent rules
```

The deployment surface is **not** on `main`. It lives on the branch the VPS
checks out, `staging/self-hosting-sync-20260802`, in addition to everything
above:

```text
Dockerfile              production image
.dockerignore
deploy/                 compose file, Caddyfile, env template
scripts/self-host/      preflight, backup/restore, storage copy, smoke tests
scripts/check-self-host-env.mjs
app/api/health/         the endpoint the production smoke test calls
.github/workflows/      self-hosting CI
docs/self-hosting/      migration-era documents, each marked historical
```

So `main` is the application source, but a checkout of `main` alone is not a
deployable production tree. The full table and the reasoning are in
[§1.1 of the runbook](docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md).
Consolidating the two branches is a deferred, deliberate step (runbook §18.2) —
not something to do as cleanup.

---

## 📚 Production documentation

The authoritative operational document is:

**[`docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md`](docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md)**

It records, in detail:

- the Vercel/Supabase-Cloud -> VPS/self-hosted-Supabase migration;
- the exact production domains and server paths;
- Git branch/PR history relevant to migration;
- database and Storage migration checkpoints;
- Cloud write freeze and rollback constraints;
- Caddy and DNS state;
- Cloudflare Workers AI translation changes;
- local backup automation;
- Cloudflare R2 client-side encrypted backup;
- restore testing and PostgreSQL version compatibility;
- 14-day local / 90-day R2 retention;
- controlled reboot/autostart validation;
- Git cleanup;
- future deploy and full-migration SOPs;
- the remaining old-Supabase-Cloud retirement checkpoint.

If this README and the production runbook disagree about production infrastructure, **the runbook and verified live VPS state take precedence**.
