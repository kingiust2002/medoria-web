# Medoria self-hosting migration plan

Status: preparation only. This branch must not modify production, DNS, Vercel, or Supabase Cloud without an explicit cutover approval.

## Non-negotiable safety rules

1. `main` remains unchanged until a reviewed pull request is explicitly approved.
2. Production data is copied first; it is never moved or overwritten during staging.
3. No real secret, database password, API key, service-role key, SSH private key, or access token is committed.
4. The new stack must run on a separate staging hostname before DNS cutover.
5. A verified database restore and Storage restore are mandatory before cutover.
6. Vercel and Supabase Cloud remain available as rollback targets after cutover.
7. DNS cutover is a separate manual approval step.

## Target architecture

Initial production target on one VPS:

- Reverse proxy with automatic TLS
- Next.js application in a production container
- Self-hosted Supabase stack
- Persistent PostgreSQL and Storage volumes
- Off-server encrypted backups
- Health checks and external uptime monitoring

The application and database can be split onto separate servers later if resource use or availability requirements justify it.

## Phase 1 — repository and dependency audit

- Inventory all environment variables.
- Inventory Vercel-specific code and configuration.
- Inventory Supabase tables, policies, functions, triggers, RPCs, and buckets.
- Inventory Upstash and other external services.
- Confirm the current Node.js and package-manager requirements.
- Confirm which Supabase services are actually required.

Deliverable: an audit report with blockers and required changes.

## Phase 2 — self-host the Next.js application only

Supabase Cloud remains unchanged in this phase.

- Enable Next.js standalone output.
- Add a reproducible multi-stage Docker build.
- Add a non-root runtime user.
- Add an application health endpoint and container health check.
- Add reverse-proxy configuration.
- Define environment-variable handling without committed secrets.
- Define persistent cache behavior for ISR where required.
- Remove or disable Vercel-only runtime dependencies.
- Verify build, lint, tests, middleware, Server Actions, ISR, image optimization, and operator sessions.

Deliverable: a staging application connected to the existing Supabase Cloud project.

## Phase 3 — deploy self-hosted Supabase staging

- Install the official Supabase Docker stack using pinned, compatible versions.
- Generate fresh secrets and API keys on the server.
- Expose the API through HTTPS; do not expose PostgreSQL publicly unless strictly required.
- Disable unused Supabase services where safe.
- Create persistent volumes and resource limits.
- Configure monitoring and log rotation.

Deliverable: an empty, secured Supabase staging instance.

## Phase 4 — copy database and Storage

- Take independent backups before any migration command.
- Export roles, schema, and data using the supported Supabase migration procedure.
- Restore into staging.
- Copy Storage through a supported API/S3-compatible path; do not copy internal volume files blindly.
- Compare table counts, constraints, policies, functions, triggers, RPC behavior, bucket metadata, and object counts.
- Run the repository RLS checks and application test suite against staging.

Deliverable: a complete staging copy of production data and files.

## Phase 5 — backup and disaster-recovery validation

- Schedule encrypted PostgreSQL backups to a different provider.
- Schedule Storage backups to a different provider.
- Define daily, weekly, and monthly retention.
- Restore both database and Storage into an isolated test environment.
- Record measured recovery time and the exact restore procedure.

Deliverable: a verified restore, not merely backup files.

## Phase 6 — cutover

Cutover requires explicit approval.

- Lower DNS TTL in advance.
- Take a final backup.
- Freeze or tightly control writes during final synchronization.
- Run the final database and Storage sync.
- Switch application environment variables to self-hosted Supabase.
- Run smoke tests on the staging hostname.
- Change DNS.
- Monitor errors, latency, database health, disk, memory, and forms.

## Rollback

Rollback remains available while Vercel and Supabase Cloud are retained:

1. Restore the previous DNS records.
2. Re-enable the old production path if it was disabled.
3. Confirm the Vercel application and Supabase Cloud endpoints are healthy.
4. Reconcile writes made during the cutover window before attempting another migration.

## Responsibility split

### Repository work

- Infrastructure code and documentation
- Docker and reverse-proxy configuration
- Backup/restore scripts
- Application compatibility changes
- Test and cutover checklists

### Owner-only actions

- Purchase and own the VPS account.
- Control DNS and domain registrar access.
- Enter production secrets directly on the server.
- Keep SSH keys and provider credentials outside chat and Git.
- Explicitly approve production cutover and eventual shutdown of old services.
