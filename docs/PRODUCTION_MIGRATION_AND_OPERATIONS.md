# Medoria Production Migration & Operations Runbook

> **Authoritative operational record.**
>
> Last reconciled: **2026-08-10 UTC** after the production cutover, off-site backup validation, controlled VPS reboot, and Git cleanup.
>
> This file exists so a future maintainer or AI coding agent can reconstruct what happened, understand what is live now, make changes in the correct place, and repeat or reverse the migration without relying on chat history.

---

## 0. Read this first

Medoria is **no longer a Vercel + Supabase Cloud production deployment**.

The live production system is self-hosted on a VPS and consists of:

- Next.js application in Docker.
- Caddy reverse proxy / TLS termination in Docker.
- Self-hosted Supabase stack in Docker.
- PostgreSQL and Supabase Storage on the VPS.
- DNS still administered through Vercel DNS because the registrar delegates nameservers to Vercel.
- Daily local backups on the VPS.
- Daily encrypted off-site backups in Cloudflare R2.

### Canonical domain

The only canonical production domain is:

- `https://medoriaco.com`

Related live hosts:

- `https://www.medoriaco.com` -> redirects to the apex site.
- `https://api.medoriaco.com` -> self-hosted Supabase REST/Auth/Storage API.
- `https://staging.medoriaco.com` -> staging application hostname accepted by the same Caddy deployment.
- `https://api-staging.medoriaco.com` -> legacy staging API hostname still accepted by Caddy.

**Important:** `medoria.tj`, `medoria.co`, and `medoria.com` are not the canonical production domain. Do not reintroduce redirects to them. The owner explicitly confirmed that `.tj` is not owned and no ownership claim should be made about it.

### Current production VPS

- Public IPv4: `91.107.161.56`
- SSH user: `medoria`
- Hostname seen during migration: `ps-c25645-s2373`
- Application checkout: `/home/medoria/apps/medoria-staging`
- Self-hosted Supabase checkout/config: `/home/medoria/infra/supabase-staging`
- Backup scripts: `/home/medoria/bin/`
- Backup root: `/home/medoria/backups/`

Do not commit credentials, database passwords, Supabase keys, Cloudflare API tokens, R2 credentials, operator secrets, session secrets, or `.env` files.

---

## 1. Git state and branch model

### Repository

`kingiust2002/medoria-web`

### Main branch

As of the migration close-out, `main` contains the application-level production fixes through:

- PR #145: Cloudflare Workers AI translation + upload transport fix.
  - feature commit: `215dc2a`
  - merge commit: `ce6a760`
- PR #147: canonical domain correction.
  - feature commit: `203fb35`
  - merge commit: `53f4f0a`

### Deployment branch currently checked out on the VPS

`staging/self-hosting-sync-20260802`

Important historical commits on that branch:

- `6d1a85c` — sync/merge of the current application code into the self-hosting branch during migration.
- `0152388` — staging-side canonical `medoriaco.com` correction.
- `0c67bce` — persist the live production Caddy routing in `deploy/Caddyfile`.

At the end of cleanup the VPS working tree was clean and tracked the remote branch.

### Why there are two branches

The self-hosting work was developed on the staging migration branch. An accidental attempt to open the entire staging branch against `main` produced PR #146 with a very large unrelated diff. PR #146 was **closed without merge**. It did not modify `main`.

A clean one-file branch was then made from `main` for the canonical-domain correction, producing PR #147. That is the pattern to follow for future application fixes: **small PR branches from the intended base, not a wholesale deployment-branch PR.**

### Current change workflow

For normal application changes:

1. Start from updated `main`.
2. Create a dedicated PR branch.
3. Make only the requested change.
4. Run:
   - `npm ci`
   - `npm test`
   - `npm run lint`
   - `npm run build`
5. Merge the PR to `main` after review.
6. Deliberately bring the approved application change into the VPS deployment checkout. Until the deployment branch is intentionally retired, do not silently assume the VPS runs `main`.
7. Rebuild/restart the application container and run production smoke tests.

For production infrastructure changes that affect `deploy/Caddyfile`, deployment composition, or self-hosting scripts, first inspect the deployment branch and the live VPS. The current live Caddy configuration was deliberately persisted on `staging/self-hosting-sync-20260802` in `0c67bce`.

**Do not `git reset --hard` on the VPS as a routine synchronization technique.** It was explicitly avoided throughout the migration because it can destroy live deployment-specific state.

---

## 2. Production runtime architecture

### Application stack

The staging/self-hosting branch contains the production Dockerization and self-hosting support, including:

- `Dockerfile`
- `deploy/compose.app.yml`
- `deploy/Caddyfile`
- `.github/workflows/self-hosting-ci.yml`
- `scripts/check-self-host-env.mjs`
- `scripts/self-host/*`

The application Compose project is named `medoria-app`.

Observed production containers after reboot:

- `medoria-app-app-1`
- `medoria-app-caddy-1`
- `supabase-studio`
- `supabase-edge-functions`
- `supabase-storage`
- `supabase-auth`
- `supabase-rest`
- `realtime-dev.supabase-realtime`
- `supabase-meta`
- `supabase-pooler`
- `supabase-kong`
- `supabase-db`
- `supabase-imgproxy`

All were configured with `restart=unless-stopped` and successfully came back after a real server reboot.

### App Compose behavior

`deploy/compose.app.yml`:

- builds the Next.js image from the repository Dockerfile;
- passes `NEXT_PUBLIC_*` values as build args;
- also loads runtime variables from `deploy/.env`;
- exposes app port `3000` only to Docker networking;
- Caddy publishes host ports `80`, `443/tcp`, and `443/udp`;
- app and Caddy use `restart: unless-stopped`;
- Caddy waits for app health;
- Caddy data/config is persisted in Docker volumes;
- application `.next/cache` is persisted in a Docker volume;
- container log rotation is configured.

### Caddy production routing

The active repository Caddy routing includes:

```text
api-staging.medoriaco.com, api.medoriaco.com
```

For those API hosts only these Supabase routes are forwarded to `supabase-kong:8000`:

- `/rest/v1`
- `/rest/v1/*`
- `/auth/v1`
- `/auth/v1/*`
- `/storage/v1`
- `/storage/v1/*`

Other API-host paths return 404.

The application hosts are:

```text
staging.medoriaco.com, medoriaco.com, www.medoriaco.com
```

and reverse proxy to the app service on port 3000.

Caddy automatic TLS is active. The Caddy configuration was validated successfully after migration with `caddy validate`; the only warning was formatting (`caddy fmt`), not validity.

---

## 3. Production environment contract

The final public URL values were switched away from temporary `sslip.io` names.

### Application

```text
NEXT_PUBLIC_SITE_URL=https://medoriaco.com
NEXT_PUBLIC_SUPABASE_URL=https://api.medoriaco.com
```

### Self-hosted Supabase

```text
SUPABASE_PUBLIC_URL=https://api.medoriaco.com
API_EXTERNAL_URL=https://api.medoriaco.com/auth/v1
```

### Secret-containing configuration files

Live configuration includes files such as:

- `/home/medoria/apps/medoria-staging/deploy/.env`
- Supabase `.env` under `/home/medoria/infra/supabase-staging`
- `/home/medoria/.config/rclone/rclone.conf`

These must remain permission-restricted and must never be printed into chat, committed, or copied into issues/PRs.

The production backup process copies these files into protected local backups, which is one reason off-site backups must always pass through client-side encryption before reaching R2.

---

## 4. DNS and TLS state

Registrar nameservers delegate DNS to Vercel:

```text
ns1.vercel-dns.com
ns2.vercel-dns.com
```

Explicit production/staging A records used during cutover:

```text
@           -> 91.107.161.56
www         -> 91.107.161.56
api         -> 91.107.161.56
staging     -> 91.107.161.56
api-staging -> 91.107.161.56
```

TTL was set to 60 seconds during migration/cutover.

Vercel may also show locked/default ALIAS records and CAA records. The explicit records above were used for the VPS cutover. Do not delete provider-managed records casually.

CAA included authorization compatible with Let's Encrypt, allowing Caddy's ACME flow to issue certificates.

### Firewall

The VPS firewall was kept limited to the public services needed:

- SSH
- HTTP `80/tcp`
- HTTPS `443/tcp`
- HTTP/3 `443/udp`

PostgreSQL/pooler are not intended to be publicly exposed.

---

## 5. Supabase Cloud source and self-hosted destination

### Former production source

Supabase Cloud project ref:

```text
jiirjbmtifjkwvbcfiva
```

Cloud database pooler used during migration:

```text
aws-1-eu-central-1.pooler.supabase.com:5432
```

Database user pattern:

```text
postgres.jiirjbmtifjkwvbcfiva
```

The database password is secret and was entered interactively. It must never be committed or pasted into chat.

### PostgreSQL version compatibility lesson

Cloud PostgreSQL was 17.x. The VPS host package initially provided PostgreSQL client 16.14.

PostgreSQL 16 `pg_restore` could not read custom archives created by the newer tooling and returned:

```text
unsupported version (1.16) in file header
```

The correct validation path was Dockerized PostgreSQL 17:

```bash
docker run --rm \
  -v "$BACKUP:/backup:ro" \
  postgres:17-alpine \
  pg_restore -l /backup/database-public.dump
```

The tested container reported PostgreSQL 17.10 and successfully validated both full and public archives.

Future migration/recovery work must use a restore client version compatible with the dump format. Do not diagnose this specific message as backup corruption until the client version is checked.

---

## 6. Migration chronology — what was actually done

This section is intentionally detailed. It records the migration process, validation gates, errors discovered, and final decisions.

### Phase A — Prepare the repository for self-hosting

A self-hosting branch was established:

```text
staging/self-hosting-sync-20260802
```

Self-hosting assets were added there, including Docker build/runtime definitions, Caddy, environment validation, CI checks, VPS verification, backup/restore helpers, storage-copy helpers, and smoke tests.

A major lesson from PR #146: do not open the entire long-running self-hosting branch directly against `main` for a one-file production fix. PR #146 contained roughly 169 commits / 77 files and was closed without merge. A clean branch from `main` was used instead for PR #147.

### Phase B — Provision and validate the VPS

The VPS was checked for a suitable production baseline. Repository preflight logic expects approximately:

- Ubuntu 24.04 or Debian 12 baseline;
- amd64/x86_64;
- 8 vCPU minimum by default;
- ~15 GB RAM minimum;
- ~145 GiB root filesystem floor;
- Docker Engine and Compose v2;
- ports 80/443 available before deployment;
- PostgreSQL 5432 and pooler 6543 not publicly bound.

The live server ultimately had roughly a 150 GB filesystem, with ample free space during the migration.

### Phase C — Stand up self-hosted Supabase and application staging

The self-hosted Supabase stack was placed under:

```text
/home/medoria/infra/supabase-staging
```

The application checkout was placed under:

```text
/home/medoria/apps/medoria-staging
```

The application and Caddy were run through Docker Compose and connected to the Supabase stack.

Temporary/staging hostnames were used during validation, then all operational application environment variables were switched to `medoriaco.com` / `api.medoriaco.com` before final cutover.

### Phase D — Database backup and parity work

A historical cloud backup from 2026-08-05 exists at:

```text
/home/medoria/backups/supabase-platform/20260805T065213Z
```

An encrypted archive was also made:

```text
/home/medoria/backups/medoria-cloud-db-20260805T065213Z.tar.enc
```

Historical SHA-256:

```text
111211525a27ac351e67c888a4b3d1c4f5bfd61b89c43f096ae8507acb71ca33
```

A later pre-freeze cloud backup from 2026-08-08 exists at:

```text
/home/medoria/backups/supabase-platform/20260808T124308Z
```

Its `public.dump` size was 74533 bytes and SHA-256 was:

```text
83f1a0c8a7258add07a34e10ff90355fbc7ab0a02e027dfdf1dd9a0b99164039
```

Cloud application-table counts at that checkpoint were:

```text
beauty_brands=1
beauty_categories=193
beauty_import_logs=0
beauty_products=0
beauty_quote_requests=0
categories=429
contact_inquiries=0
import_logs=0
products=3
quote_requests=7
```

Schema/security parity checks between Cloud and VPS covered:

- columns;
- RLS status;
- policies;
- functions;
- application table contents;
- Auth counts.

Auth parity at migration time was:

```text
users=0
identities=0
```

An important restore decision was to use a **public-schema restore** where necessary rather than forcing incompatible Cloud Auth internals into the self-hosted instance. Supabase-managed schemas can have implementation/version differences and should not be blindly overwritten.

### Phase E — Storage migration

`rclone` was used to compare/copy Supabase Storage objects.

Existing remotes before R2 was added:

```text
platform:
self-hosted:
```

Self-hosted storage buckets observed:

```text
beauty-brand-logos
beauty-product-images
product-images
```

At cutover/final sync the source had 3 objects totaling 60074 bytes.

After production was opened, a legitimate new Beauty product image was written, proving that production database and Storage writes were going to the VPS. The self-hosted storage baseline then became 4 objects / 130981 bytes.

This is why an old storage snapshot must **not** be copied back over live production after cutover unless an explicit point-in-time rollback is intended.

### Phase F — Cloud write freeze

Immediately before final cutover, the old Supabase Cloud public application tables were placed in a write-frozen state.

Freeze record directory:

```text
/home/medoria/backups/cutover-freeze/20260808T135854Z
```

Rollback SQL to restore Cloud write permissions:

```text
/home/medoria/backups/cutover-freeze/20260808T135854Z/restore-cloud-write-permissions.sql
```

The rollback SQL had 97 lines at the time it was created.

The freeze revoked relevant DML/execute permissions and was verified.

**Cloud remains a stale frozen rollback reference, not a second writable production system.**

After cutover, new production writes occurred on the VPS. Therefore rollback is no longer simply "unfreeze Cloud and point DNS back". A future rollback must first assess and reconcile the VPS delta so recent production data is not lost.

### Phase G — Final cutover snapshot and restore

Final Cloud snapshot directory:

```text
/home/medoria/backups/final-cutover/20260808T140135Z
```

A safety dump of self-hosted public data was taken before the final restore:

```text
/home/medoria/backups/pre-final-restore/20260808T172458Z/selfhost-public-before-final.dump
```

Historical size: ~76K.

Historical SHA-256:

```text
d009d8e0013551aa65ca0881b74be85cddbf22664bcd0b096bc7b5146c2fc0af
```

The final restore and exact storage synchronization passed.

### Phase H — DNS cutover

The production A records were pointed at:

```text
91.107.161.56
```

The following production smoke tests passed after cutover:

```text
https://medoriaco.com                  -> 200
https://medoriaco.com/api/health       -> 200
Beauty page                            -> 200
Health page                            -> 200
www -> apex                            -> successful redirect/final 200
REST API with proper test              -> 200
Auth API with proper test              -> 200
```

The owner also tested the site from the normal client network without VPN and confirmed it worked.

### Phase I — Verify production writes

After cutover, legitimate new Beauty product data appeared only on the VPS production environment, including two `beauty_products` records and a new object in `beauty-product-images`.

That proved:

- app writes hit the self-hosted PostgreSQL;
- Storage uploads hit self-hosted Supabase Storage;
- the Cloud source was no longer production.

A post-cutover recovery checkpoint was created:

```text
/home/medoria/backups/post-cutover/20260808T194655Z
```

Historical DB dump size:

```text
75045 bytes
```

Historical SHA-256:

```text
642eca43ae80274c20f3076a82bc3c5b30c1de6f8273a5462e49641fe4204f55
```

It included database, storage, configs, and rclone state with protected permissions.

### Phase J — Cloudflare translation migration

Operator auto-translation was moved from Google Translate to Cloudflare Workers AI.

PR #145 / merge `ce6a760` introduced:

- `lib/translation/cloudflare.js`;
- Health product form translation via Cloudflare;
- Beauty product form translation via Cloudflare;
- import/Excel auto-translation via Cloudflare;
- server-side credentials only;
- Next.js Server Action request transport limit raised to 8 MB;
- application-level image validation remained 5 MB.

Model:

```text
@cf/google/gemma-4-26b-a4b-it
```

Configuration used:

```text
enable_thinking=false
```

Required secret environment variables include:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_AI_API_TOKEN
```

The active token is secret and lives only in protected deployment configuration.

A prior Cloudflare token was accidentally exposed during setup and was treated as compromised/revoked. Never reuse or document it.

Validated in the live/staging operator UI:

- Health translation;
- Beauty translation;
- uploads above 1 MB and below the 5 MB application limit;
- import translator rebuild.

### Phase K — Canonical domain correction

There were two historical bad redirect states during cleanup:

- an old `main` configuration referencing `medoria.tj`;
- a staging-side temporary mistake referencing `medoria.co`.

These were corrected so the only canonical production domain is `medoriaco.com`.

PR #146 was the wrong delivery mechanism because it attempted to merge the whole staging branch into main; it was closed without merge.

PR #147 was the clean fix:

- base: `main`
- one commit
- one changed file: `next.config.js`
- tests 31/31 passed
- lint passed
- `npm ci` passed
- merge commit: `53f4f0a`

Application redirect rule now redirects only:

```text
www.medoriaco.com -> https://medoriaco.com/:path*
```

### Phase L — Local production backup automation

Production backup script:

```text
/home/medoria/bin/medoria-production-backup.sh
```

Runner:

```text
/home/medoria/bin/medoria-production-backup-runner.sh
```

Local backup root:

```text
/home/medoria/backups/production-auto
```

The production backup creates/records:

- full PostgreSQL custom dump: `database-full.dump`;
- public-schema custom dump: `database-public.dump`;
- globals SQL without role passwords;
- application table row counts;
- full copy of self-hosted Supabase Storage;
- protected copies of relevant deployment configuration;
- Git state;
- manifest;
- SHA-256 checksums;
- restrictive file/directory permissions.

Incomplete backups are staged under `.incomplete-*` and only moved to the final timestamp directory after success.

Runner uses `flock` so overlapping backups are skipped safely.

Local retention:

```text
14 days
```

Cron:

```cron
30 2 * * * /home/medoria/bin/medoria-production-backup-runner.sh >> /home/medoria/backups/production-auto/cron.log 2>&1
```

That is **02:30 UTC daily**.

### Phase M — Permanent off-site backup in Cloudflare R2

Cloudflare R2 bucket:

```text
medoria-production-backups
```

Bucket state/security decisions:

- storage class: Standard;
- Public Access: disabled;
- Public Development URL: disabled;
- no custom domain;
- no Data Catalog requirement;
- token scoped to this specific bucket;
- permission: Object Read & Write.

The token credentials are secrets and are not stored in this repository.

Rclone raw R2 remote:

```text
r2raw:
```

Because the token is bucket/object scoped, the remote uses:

```text
no_check_bucket = true
```

This avoids requiring account-wide bucket-list/create permissions.

### Phase N — Client-side encryption for R2

Raw R2 storage must never receive plaintext production backups.

Rclone crypt remote:

```text
r2crypt:
```

Backing path:

```text
r2raw:medoria-production-backups
```

Crypt settings:

```text
filename_encryption = standard
directory_name_encryption = true
```

Both crypt secrets were generated separately:

- `Medoria R2 Crypt - Password 1`
- `Medoria R2 Crypt - Password 2 (Salt)`

These must be stored outside the VPS in a secure password manager/offline recovery location. Do not commit them. Loss of both VPS configuration and these recovery secrets would make the encrypted R2 backups unrecoverable.

Connectivity/encryption validation passed:

```text
R2CRYPT_LIST_RC=0
R2CRYPT_UPLOAD=PASS
R2CRYPT_READBACK=PASS
R2_FILENAME_ENCRYPTION=PASS
R2_CONTENT_ENCRYPTION=PASS
R2CRYPT_DELETE=PASS
```

Raw bucket object count returned to zero after the connectivity test.

### Phase O — Real off-site backup and verification

A real production snapshot was uploaded through `r2crypt`.

Historical tested snapshot:

```text
20260810T023001Z
```

Validation:

```text
R2_REAL_UPLOAD=PASS
R2_REAL_VERIFY=PASS
LOCAL_FILES=15
REMOTE_FILES=15
R2_FILE_COUNT=PASS
```

Rclone crypt cannot always provide a common remote hash. A first `rclone check` emitted the informational condition:

```text
No common hash found - not using a hash for checks
```

The verification was strengthened to:

```text
rclone check ... --download --one-way
```

This forces readback of the encrypted remote content and comparison with the local plaintext source through the crypt layer.

Off-site helper:

```text
/home/medoria/bin/medoria-offsite-r2-backup.sh
```

It validates:

- source path format;
- upload success;
- content comparison using download verification;
- local/remote file counts.

### Phase P — Restore validation from R2

The real R2 backup was downloaded and its backup-level checksums passed:

```text
R2_DOWNLOAD=PASS
R2_CHECKSUMS=PASS
```

Initial host-side `pg_restore` validation failed only because host PostgreSQL was 16.14. PostgreSQL 17 validation passed:

```text
PG17_FULL_DUMP=PASS
PG17_PUBLIC_DUMP=PASS
```

An isolated PostgreSQL 17 container was then used for an actual restore test.

Two test-environment-only issues were found and understood:

1. Fresh PostgreSQL creates `public` by default, while the dump also creates it. The test database must drop the default public schema before restoring.
2. A plain PostgreSQL container does not have Supabase's `auth` schema/functions. Public RLS policies referenced `auth.role()`, so the isolated test created minimal `auth.role()`, `auth.uid()`, and `auth.jwt()` stubs solely to validate public schema/data restoration.

Final isolated restore result:

```text
SUPABASE_PUBLIC_RESTORE=PASS
TEMP_CONTAINER_REMOVED=PASS
```

Restored table counts included:

```text
beauty_brands=1
beauty_categories=193
beauty_import_logs=0
beauty_products=2
beauty_quote_requests=0
categories=429
contact_inquiries=0
import_logs=0
products=3
quote_requests=7
```

This demonstrated that the off-site backup was not merely uploadable/readable; it was usable for an actual PostgreSQL 17 restore.

### Phase Q — R2 retention

R2 retention script:

```text
/home/medoria/bin/medoria-r2-retention.sh
```

Retention period:

```text
90 days
```

It only considers snapshot directory names matching the timestamp pattern and deletes snapshots older than the cutoff.

The first preview and execution found no eligible old snapshots, as expected.

The retention script was then integrated into the main backup runner after successful off-site upload/verification.

Final runner chain:

```text
local production backup
-> encrypted R2 upload
-> remote content verification
-> R2 90-day retention
-> local 14-day retention
```

A full manual run passed:

```text
AUTO_BACKUP=PASS
LOCAL_BACKUP=PASS
NEW_SNAPSHOT=20260810T110700Z
OFFSITE_UPLOAD=PASS
OFFSITE_VERIFY=PASS
OFFSITE_FILE_COUNT=PASS
R2_OFFSITE=PASS
R2_RETENTION=PASS
R2_RETENTION_RUN=PASS
BACKUP_RETENTION=PASS
BACKUP_RUNNER=PASS
```

### Phase R — Controlled VPS reboot and auto-start proof

The server reported a pending restart after OS/kernel updates.

Before reboot:

- Docker service was `enabled` and `active`.
- all application/Supabase containers were running;
- all relevant containers had `restart=unless-stopped`.

The server was rebooted deliberately with `sudo reboot`.

After reboot:

```text
kernel=6.8.0-137-generic
REBOOT_REQUIRED=NO
docker=active
DATABASE=PASS
ROOT=200
APP_HEALTH=200
WWW=200
STORAGE_HEALTH=200
cron=active
```

`AUTH_HEALTH=401` and `REST_NO_KEY=401` were expected because those smoke requests intentionally omitted authentication/API keys.

All application and Supabase containers returned automatically and reported healthy/running status. This is the proof that an ordinary VPS reboot does not require manually starting the stack.

### Phase S — Git cleanup

Migration cleanup removed accidental/pending Git artifacts without touching live production configuration.

Actions completed:

- accidental files created by malformed shell paste were removed;
- extra worktree `/home/medoria/apps/medoria-main-fix` was checked and removed;
- branch `fix/cloudflare-translation-upload-limit-20260808` was removed locally after confirming it had no commits/diff outside `main`;
- old stash `pre-main-sync-20260808` was inspected;
- its code files matched current code;
- its `next.config.js` was confirmed to contain obsolete canonical-domain logic;
- a safety patch was saved at:

```text
/home/medoria/backups/git-cleanup/pre-main-sync-20260808.patch
```

- the obsolete stash was dropped;
- the production Caddyfile was validated;
- the production Caddy routing was committed and pushed as `0c67bce`.

End state: deployment checkout clean.

---

## 7. Current backup and disaster-recovery design

### Local backup

Frequency:

```text
daily 02:30 UTC
```

Retention:

```text
14 days
```

Location:

```text
/home/medoria/backups/production-auto/YYYYMMDDTHHMMSSZ
```

### Off-site backup

Provider:

```text
Cloudflare R2
```

Bucket:

```text
medoria-production-backups
```

Path through decrypted view:

```text
r2crypt:production-auto/<timestamp>
```

Retention:

```text
90 days
```

Encryption:

- content encrypted client-side by rclone crypt;
- file names encrypted;
- directory names encrypted.

### Restore rule

Do not call a backup "good" merely because upload succeeded.

A valid recovery check should include:

1. Download through `r2crypt`.
2. `sha256sum -c checksums.sha256`.
3. `pg_restore -l` using PostgreSQL 17-compatible tooling.
4. Periodic isolated actual restore test.
5. Verify important application table counts.
6. Verify expected Storage objects/buckets.

### Why raw R2 must not be used

The production backup contains protected configuration snapshots. Therefore:

```text
DO NOT upload production-auto directly to r2raw:
```

Always upload through:

```text
r2crypt:
```

---

## 8. Old Supabase Cloud rollback state

The old Cloud project was intentionally kept frozen for a short observation period after cutover.

Target review date decided during close-out:

```text
2026-08-24
```

Until final retirement:

- do not use the old Cloud operator/data interfaces for production writes;
- do not unfreeze it casually;
- do not assume it contains new VPS writes;
- preserve the saved freeze rollback SQL and final Cloud snapshot.

### If rollback to Cloud is ever required before retirement

Do **not** simply switch DNS first.

Required reasoning order:

1. Stop or freeze production writes on the VPS.
2. Create a fresh VPS database + Storage backup.
3. Determine the data delta since Cloud freeze.
4. Decide whether the rollback target must receive that delta.
5. Reconcile/copy the required database rows and Storage objects back to Cloud.
6. Verify Cloud schema, policies, functions, Auth, Storage, and application counts.
7. Apply the saved Cloud write-permission restore SQL only when ready.
8. Test Cloud endpoints directly before DNS change.
9. Roll DNS back.
10. Re-run application smoke tests.
11. Preserve both sides until rollback is proven.

A rollback that ignores the post-cutover VPS delta risks data loss.

---

## 9. How to deploy future application changes

This is the operating model a future maintainer/Claude should follow.

### Before changing code

1. Read `CLAUDE.md`.
2. Read this runbook.
3. Confirm whether the requested change is:
   - application code;
   - database migration;
   - Supabase configuration;
   - Caddy/DNS/networking;
   - backup/restore infrastructure.
4. Do not mix unrelated production infrastructure changes into a feature PR.

### Application code change

1. Update local knowledge of `main`.
2. Create a small PR branch from `main`.
3. Change only the relevant code.
4. Run tests/lint/build.
5. Open PR to `main`.
6. Review diff carefully for secrets and unrelated files.
7. Merge.
8. Deliberately deploy the approved commit to the VPS checkout.
9. Rebuild the app container with the correct production environment.
10. Smoke-test the public site and API.

### Before risky production changes

Run/confirm a fresh backup:

```bash
/home/medoria/bin/medoria-production-backup-runner.sh
```

Do not continue with a destructive database or infrastructure operation if the fresh backup/off-site chain fails.

### After deploy smoke test

Minimum public checks:

```bash
curl -L -sS -o /dev/null -w '%{http_code}\n' https://medoriaco.com/
curl -L -sS -o /dev/null -w '%{http_code}\n' https://medoriaco.com/api/health
curl -L -sS -o /dev/null -w '%{http_code}\n' https://www.medoriaco.com/
curl -sS -o /dev/null -w '%{http_code}\n' https://api.medoriaco.com/storage/v1/status
```

Expected baseline:

```text
root=200
app health=200
www final response=200 after redirect
storage status=200
```

A REST/Auth request without a key may return 401 and that alone is not a service failure.

Also inspect:

```bash
docker ps
```

and verify application/Supabase health.

---

## 10. How to change the database safely

The database is now production data on the VPS.

Before any schema migration:

1. Take a fresh local + R2 backup.
2. Confirm backup runner returns PASS.
3. Confirm the migration is version controlled.
4. Review RLS/policies/functions as part of the migration, not only tables.
5. Apply to a non-production/test target first when possible.
6. Apply production migration once.
7. Verify table structure and affected row counts.
8. Test both public reads and operator writes.
9. Create a post-change recovery checkpoint if the migration is significant.

Do not restore old Cloud database dumps over live VPS production just to "resync". The VPS is the source of truth after cutover.

---

## 11. How to change Caddy / domain / API routing safely

Production Caddy is a high-risk configuration surface because it fronts both the app and Supabase APIs.

Rules:

1. Never remove the API path restriction without understanding the security impact.
2. Never reintroduce `medoria.tj` / `medoria.co` canonical redirects.
3. Validate before reload/restart.
4. Preserve a backup of the previous file.
5. Smoke-test app, Auth, REST, and Storage after change.

Validation pattern:

```bash
docker exec medoria-app-caddy-1 \
  caddy validate --config /etc/caddy/Caddyfile
```

Current API upstream:

```text
supabase-kong:8000
```

Current app upstream:

```text
app:3000
```

---

## 12. How to change DNS safely

DNS remains at Vercel even though compute is not Vercel production.

Before DNS changes:

- record the current explicit A records;
- verify the new destination directly;
- use low TTL during cutover windows;
- preserve rollback values;
- do not delete locked/default provider records without a reason;
- test apex, `www`, API, and staging independently.

For a future migration to another server/provider, the safest strategy is:

1. Build destination in parallel.
2. Keep production source serving traffic.
3. Copy data/storage.
4. Validate destination using staging/temporary hostnames.
5. Reduce TTL.
6. Freeze writes on source.
7. Take final source snapshot.
8. Restore/sync destination.
9. Verify exact parity.
10. Change DNS.
11. Test from an external client network.
12. Test a real production write.
13. Create a post-cutover checkpoint.
14. Keep old source frozen for an observation window.
15. Retire old source only after backup/restore and production stability are proven.

---

## 13. Future full migration checklist

Use this sequence for any future move away from the current VPS.

### Inventory

- current Git commit/branch;
- Docker and Compose versions;
- all running containers and restart policies;
- app `.env` variable names and public URL values;
- Supabase `.env` contract;
- database PostgreSQL version;
- database tables/RLS/policies/functions;
- Auth users/identities;
- Storage buckets/object counts/bytes;
- Caddy routes;
- DNS records/TTL;
- backup scripts and off-site restore secrets.

### Destination preparation

- verify CPU/RAM/disk;
- install Docker + Compose;
- configure firewall;
- ensure PostgreSQL is not publicly exposed;
- deploy Supabase destination;
- deploy app + Caddy under non-production hostname;
- validate TLS;
- validate internal container networking.

### Pre-cutover backup

- take database backup;
- take Storage backup;
- checksum both;
- perform restore validation with compatible PostgreSQL client;
- record counts;
- create rollback artifacts;
- confirm off-site copy.

### Freeze and final sync

- freeze source writes;
- take final database snapshot;
- final Storage sync;
- restore destination;
- compare row counts and Storage counts;
- compare schema/RLS/policies/functions;
- verify Auth.

### Cutover

- set production public URLs on destination;
- validate Caddy/routes;
- change DNS;
- test apex, www, API, Storage, Auth, REST;
- test application pages;
- perform a real controlled write and verify it lands at destination.

### Post-cutover

- create recovery checkpoint;
- keep source frozen, not writable;
- run backup automation on destination;
- test off-site restore;
- reboot destination once in a controlled window and prove auto-start;
- schedule old-source retirement.

---

## 14. SSH and tmux operational notes

During this migration the reliable Windows client was the bundled Windows OpenSSH executable at:

```text
C:\Users\erfan\Downloads\OpenSSH-Win64\OpenSSH-Win64
```

Connection pattern:

```powershell
.\ssh.exe -o ServerAliveInterval=20 -o ServerAliveCountMax=15 medoria@91.107.161.56
```

Native WSL SSH previously failed public-key authentication in this environment, so do not switch clients during a critical operation without testing first.

Use tmux for long-running/interactive server work:

```bash
tmux new -As medoria
```

If SSH drops, reconnect and reattach. Do not restart a migration merely because the SSH transport disconnected.

---

## 15. Security rules learned during migration

1. Never paste API tokens, DB passwords, service-role keys, operator secrets, or rclone crypt passwords into chat/issues/PRs.
2. Never print `deploy/.env` or Supabase `.env` as part of debugging output.
3. Do not `cat ~/.config/rclone/rclone.conf`; it contains sensitive configuration.
4. Cloudflare R2 Access Key / Secret must remain private.
5. Cloudflare Workers AI token must remain server-side.
6. Keep `deploy/.env` out of Git.
7. Backup files containing configuration must remain mode-restricted locally.
8. Off-site copies of those backups must pass through client-side crypt.
9. A leaked credential is revoked/replaced, not merely hidden in later screenshots.
10. Use least-privilege bucket-scoped R2 permissions.

---

## 16. Known expected statuses that are not errors

### Auth health 401 without a key

A request to Supabase Auth that intentionally omits required credentials may return 401 while the service is healthy.

### REST 401 without API key

Same principle for PostgREST.

### Rclone no common hash

For rclone crypt + R2, a standard remote-side hash may not be available. Use:

```text
rclone check --download --one-way
```

rather than treating "No common hash found" as corruption.

### Caddy formatting warning

`caddy validate` may report the Caddyfile is not formatted. If it also says `Valid configuration`, formatting is a style issue, not a routing failure.

### PostgreSQL `unsupported version (1.16)`

Check `pg_restore --version`. Host 16.14 failed; PostgreSQL 17.10 succeeded.

---

## 17. Current operational PASS baseline

The migration was closed only after all of the following had been demonstrated:

### Production

```text
medoriaco.com root = 200
app health = 200
storage health = 200
production database writable
production Storage writable
```

### Containers / reboot

```text
Docker enabled + active
app starts automatically
Caddy starts automatically
Supabase containers start automatically
database ready after reboot
```

### Backup

```text
AUTO_BACKUP=PASS
LOCAL_BACKUP=PASS
OFFSITE_UPLOAD=PASS
OFFSITE_VERIFY=PASS
OFFSITE_FILE_COUNT=PASS
R2_OFFSITE=PASS
R2_RETENTION=PASS
R2_RETENTION_RUN=PASS
BACKUP_RETENTION=PASS
BACKUP_RUNNER=PASS
```

### Recovery

```text
R2 download = PASS
checksums = PASS
PostgreSQL 17 archive validation = PASS
isolated Supabase-compatible public restore = PASS
```

### Git

- no old stash left;
- no extra migration worktree left;
- live Caddyfile committed/pushed on deployment branch;
- deployment checkout clean.

---

## 18. Remaining lifecycle item

The migration itself is complete.

One lifecycle action was intentionally deferred:

> Review the frozen old Supabase Cloud project after the observation window, targeted for **2026-08-24**. If the VPS, backups, Auth, Storage and site remain stable, retire/delete the old Cloud project deliberately.

Before deletion, take one final look at:

- current VPS backup PASS status;
- latest R2 snapshot and decryptability;
- production DB/Storage health;
- whether any hidden dependency still points at Cloud;
- whether any rollback/business requirement calls for longer retention.

Do not delete the old Cloud project merely because the date arrived if a production incident is active.

---

## 19. Quick command reference

### Connect from the known Windows client

```powershell
cd "C:\Users\erfan\Downloads\OpenSSH-Win64\OpenSSH-Win64"
.\ssh.exe -o ServerAliveInterval=20 -o ServerAliveCountMax=15 medoria@91.107.161.56
```

### Reattach tmux

```bash
tmux new -As medoria
```

### App repository

```bash
cd /home/medoria/apps/medoria-staging
```

### Current app Git status

```bash
git status -sb
git log -1 --oneline
```

### Running containers

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
```

### Database ready

```bash
docker exec supabase-db pg_isready -U postgres -d postgres
```

### Validate Caddy

```bash
docker exec medoria-app-caddy-1 caddy validate --config /etc/caddy/Caddyfile
```

### Manual complete production backup chain

```bash
/home/medoria/bin/medoria-production-backup-runner.sh
```

### Inspect automatic-backup log

```bash
tail -n 200 /home/medoria/backups/production-auto/cron.log
```

### List decrypted R2 snapshot names

```bash
rclone lsf r2crypt:production-auto --dirs-only
```

Never use a command that prints secrets merely to confirm a configuration exists.

---

## 20. Source-of-truth hierarchy

When information conflicts, use this order:

1. **Actual live VPS state** for runtime truth.
2. **This runbook** for migration decisions, recovery model, and known history.
3. `CLAUDE.md` for permanent project/agent rules and the short production summary.
4. Version-controlled deployment files on the self-hosting/deployment branch.
5. `main` for current application source.
6. Old README deployment instructions only as historical context; they predate the self-hosted production cutover.

Do not treat an old Vercel deployment or the frozen Supabase Cloud project as current production merely because it still exists.

---

## 21. Final state statement

As of **2026-08-10**, the migration is considered complete:

```text
Production compute       = VPS 91.107.161.56
Production application   = self-hosted Docker / Next.js
Production reverse proxy = Caddy
Production database      = self-hosted Supabase PostgreSQL
Production Storage       = self-hosted Supabase Storage
Production API           = https://api.medoriaco.com
Canonical site           = https://medoriaco.com
DNS authority            = Vercel DNS
Local backup             = daily, 14-day retention
Off-site backup          = Cloudflare R2, rclone crypt, 90-day retention
Old Supabase Cloud       = frozen temporary rollback reference
Migration status         = COMPLETE
```

Any future maintainer should preserve this architecture unless the owner explicitly authorizes another migration.