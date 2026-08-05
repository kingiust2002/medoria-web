# Supabase self-hosting migration runbook

This phase starts only after the application-only VPS staging deployment passes its smoke tests. It creates a separate self-hosted Supabase staging target, copies platform data and Storage objects, verifies the result, and preserves Supabase Cloud as rollback.

Official references:

- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
- https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3
- https://supabase.com/docs/guides/self-hosting/self-hosted-s3

## Non-negotiable rules

- Do not restore into the current production database.
- Do not expose PostgreSQL directly to the public Internet.
- Do not commit the self-hosted `.env`, database URLs, JWT material, S3 credentials, or rclone configuration.
- Do not reuse platform JWT/API secrets on the self-hosted instance.
- Do not copy files directly into the Storage volume.
- Do not cut over the application until database and Storage restore tests pass.
- Do not delete Supabase Cloud during the rollback window.

## 1. Select and record the official Supabase release

Do not maintain an untracked copy of an arbitrary `docker-compose.yml` inside the application repository.

On the server or infrastructure repository:

1. Fetch the official Supabase repository.
2. Select a specific tested release or commit.
3. Record that Git commit SHA in the infrastructure change log.
4. Copy the official `docker/` directory from that exact revision.
5. Keep all image versions supplied by that revision together.
6. Apply only reviewed local overrides for networking, volumes, resource limits, and disabled services.

Example checkout pattern:

```bash
git clone https://github.com/supabase/supabase.git
cd supabase
git checkout <REVIEWED_RELEASE_OR_COMMIT>
git rev-parse HEAD
```

The recorded SHA is required for rollback and reproducibility.

## 2. Service selection

Keep during initial staging:

- PostgreSQL
- PostgREST
- API gateway
- Storage API
- Supabase Studio, accessible only through an administrative control path
- postgres-meta if required by Studio
- Supavisor for private database access if operationally useful

Conditionally keep:

- imgproxy only if Supabase image transformation endpoints are used
- Auth only if the source audit detects Supabase Auth usage or required auth schema behavior

Disable unless the source audit proves they are required:

- Realtime
- Edge Runtime/functions
- optional Logs/Analytics stack

Do not remove a service solely to save memory until the generated source audit and staging tests agree that it is unused.

## 3. Server and network boundary

Use HTTPS in front of the Supabase API gateway. Suggested hostnames during staging:

```text
api-staging.medoriaco.com
studio-staging.medoriaco.com
```

Requirements:

- public access only to the reverse proxy on 80/443;
- PostgreSQL, Supavisor, Studio internals, Storage internals, and Docker sockets are not publicly exposed;
- Studio is protected by strong credentials and preferably an IP allowlist or VPN;
- application-to-database traffic uses the private Docker or server network;
- persistent database and Storage volumes are outside disposable container layers;
- backups leave the server and provider failure domain.

## 4. Generate new secrets

Generate all self-hosted credentials on the server according to the official setup instructions.

At minimum, protect:

- `POSTGRES_PASSWORD`
- dashboard username/password
- JWT signing material
- anon and service-role API keys
- Storage S3 protocol access key and secret
- pooler credentials

Store them in a password manager and in the server's protected environment file. Do not paste them into chat.

## 5. Start an empty staging instance

Start the official stack and wait for health checks:

```bash
docker compose pull
docker compose up -d --wait
docker compose ps
```

Before restore:

- verify the API gateway over HTTPS;
- verify Studio through the restricted administrative path;
- record the self-hosted PostgreSQL version;
- compare it with the platform PostgreSQL version;
- list available and installed extensions;
- confirm that the S3 protocol endpoint is enabled for Storage transfer;
- take an empty-instance snapshot or backup for rapid reset.

## 6. Create the platform database dump

Install the Supabase CLI on a controlled machine. Use the platform connection string from the Supabase dashboard.

Do not place the connection string in shell history. Load it into the environment through a protected mechanism:

```bash
read -rsp 'Platform DB URL: ' PLATFORM_DB_URL
export PLATFORM_DB_URL
echo
bash scripts/self-host/backup-platform-db.sh /secure/offsite/path/medoria
unset PLATFORM_DB_URL
```

The script creates:

- `roles.sql`
- `schema.sql`
- `data.sql`
- `SHA256SUMS`
- a warning/readme file

The backup directory is created with restrictive permissions. Storage object bytes are not included.

## 7. Review compatibility before restore

Check:

- platform and self-hosted PostgreSQL major versions;
- required extensions;
- references to newer Auth or Storage tables;
- Postgres-version-specific settings;
- owner/role statements;
- custom roles with login passwords;
- expected schemas, functions, triggers, and policies.

Perform the first restore only on a disposable staging instance. Never troubleshoot restore incompatibilities on the future production database.

## 8. Restore database into staging

Load the target connection string without printing it:

```bash
read -rsp 'Self-hosted DB URL: ' SELF_HOSTED_DB_URL
export SELF_HOSTED_DB_URL
echo
export ALLOW_DESTRUCTIVE_RESTORE=YES
bash scripts/self-host/restore-self-hosted-db.sh /secure/offsite/path/medoria/<timestamp>
unset ALLOW_DESTRUCTIVE_RESTORE SELF_HOSTED_DB_URL
```

The restore script:

- verifies backup checksums;
- refuses to run without an explicit destructive-operation flag;
- prints target identity without printing the connection string;
- refuses a non-empty public schema unless separately overridden;
- restores roles, schema, and data with `ON_ERROR_STOP` and one transaction.

A non-empty target override is an exception requiring manual review. Do not normalize it into the standard procedure.

## 9. Verify database restore

Run the verification report:

```bash
psql "$SELF_HOSTED_DB_URL" \
  --no-psqlrc \
  --file scripts/self-host/verify-self-hosted-db.sql \
  | tee verify-self-hosted-db.txt
```

Compare platform and self-hosted outputs for:

- extensions;
- public tables;
- row counts;
- RLS flags;
- policies;
- public functions and procedures;
- triggers;
- bucket metadata;
- Storage object metadata counts;
- expected Medoria buckets;
- `increment_product_views` RPC.

Also run the repository's RLS check against staging before cutover.

## 10. Configure Storage transfer

Generate temporary platform S3 credentials from the platform Storage S3 configuration. Configure a separate rclone remote for the self-hosted S3 protocol endpoint.

Keep `~/.config/rclone/rclone.conf` permissioned to the current user only:

```bash
chmod 600 ~/.config/rclone/rclone.conf
```

Expected remote names used by the repository script:

```text
platform
self-hosted
```

The database restore should create bucket metadata. Confirm all destination buckets exist before copying object bytes.

## 11. Dry-run and copy Storage

Dry-run is the default:

```bash
SOURCE_RCLONE_REMOTE=platform \
DESTINATION_RCLONE_REMOTE=self-hosted \
bash scripts/self-host/copy-storage.sh
```

After reviewing the dry-run:

```bash
SOURCE_RCLONE_REMOTE=platform \
DESTINATION_RCLONE_REMOTE=self-hosted \
APPLY_STORAGE_COPY=YES \
bash scripts/self-host/copy-storage.sh
```

The script:

- verifies both remotes;
- requires destination buckets to exist;
- copies each source bucket;
- compares object counts and byte totals after a real copy;
- fails when count or byte totals differ.

Remove or revoke temporary platform S3 credentials after the migration and rollback window.

## 12. Application staging against self-hosted Supabase

Create a new application staging deployment or update the existing one with self-hosted staging values:

```text
NEXT_PUBLIC_SUPABASE_URL=https://api-staging.medoriaco.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<new self-hosted anon key>
SUPABASE_SERVICE_ROLE_KEY=<new self-hosted service-role key>
```

Rebuild the app because public environment variables are embedded at build time.

Test:

- all catalog reads;
- search and filtering;
- public image URLs;
- uploads, replacement, and deletion through both operator panels;
- quote/inquiry writes;
- RPC calls;
- RLS behavior with anon and service-role clients;
- spreadsheet imports;
- cache invalidation and ISR;
- rate limiting;
- database and Storage backup jobs.

## 13. Backup and restore drill

Before production cutover:

1. Generate a fresh database backup.
2. Generate a Storage backup or copy to an off-server object store.
3. Destroy or isolate a disposable test instance.
4. Restore database and Storage from backups.
5. Run the full verification report.
6. Record elapsed recovery time.
7. Record every manual correction.
8. Fix automation until the restore is reproducible.

Backup files existing is not enough. A successful restore drill is mandatory.

## 14. Cutover preparation

Only after all staging checks pass:

- lower DNS TTL in advance;
- choose a short write-freeze window;
- take final database and Storage backups;
- run a final database dump/restore or approved synchronization method;
- run a final Storage copy;
- rebuild the production application with self-hosted API values;
- smoke-test through a temporary host mapping or staging hostname;
- obtain explicit owner approval.

## 15. Rollback

During the rollback window:

- keep Vercel production available;
- keep Supabase Cloud available;
- preserve the previous Vercel environment values;
- preserve previous DNS records and nameservers;
- log all writes after cutover so reconciliation is possible.

Rollback means restoring the prior application/DNS path and reconciling writes made after the cutover boundary. It is not merely changing one DNS record.
