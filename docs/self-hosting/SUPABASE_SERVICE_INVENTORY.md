# Supabase runtime service inventory

Source: automated scan of 215 runtime files under `app/`, `components/`, `lib/`, and root middleware files.

Command:

```bash
npm run audit:supabase -- artifacts/supabase-service-audit.json
```

The GitHub Actions self-hosting workflow generates and stores the JSON report as an artifact on every relevant pull request change.

## Required services

### PostgreSQL — required

Evidence:

- 95 detected PostgREST-style data access calls.
- two detected RPC calls.
- server-side protected writes use the service-role credential.
- RLS, policies, functions, and triggers are part of application behavior.

### PostgREST — required

The application uses the Supabase JavaScript client `.from(...)` API throughout the public catalog and operator data layers. Replacing PostgREST would require a broad application rewrite and is outside the migration plan.

### Storage API — required

Detected Storage usage: 11 runtime locations.

Detected buckets:

- `product-images`
- `beauty-product-images`
- `beauty-brand-logos`

Operator actions upload, replace, and delete objects. Public catalog code resolves image URLs through Storage.

### API gateway — required

The public Supabase URL must expose PostgREST, RPC, and Storage through one HTTPS endpoint compatible with the existing Supabase client.

## Required database functions

Detected RPC names:

- `increment_product_views`
- `increment_beauty_product_views`

Both must exist and behave correctly after restore.

## Not used by runtime source

### Supabase Auth — not detected

Detected runtime Auth calls: `0`.

The operator login system uses application-owned signed cookie sessions rather than Supabase Auth. The Auth service is therefore not an application runtime dependency based on the current source tree.

Caveat: managed Auth schemas may still exist in the platform database. Preserve or disable the Auth service only after the restore is validated against the exact official self-hosted release.

### Realtime — not detected

Detected channel, postgres-changes, and channel-removal calls: `0`.

Realtime may be disabled in the initial optimized stack after the full official stack has been restored and tested once.

### Edge Functions — not detected

Detected `functions.invoke` or equivalent runtime calls: `0`.

The Edge Runtime is not required by current application source.

## Conditional services

### imgproxy

The application uses Next.js image optimization through `sharp`. No decision should rely only on this source audit because existing stored URLs or future Storage transformation URLs could still use Supabase image transformation endpoints.

Initial approach:

1. keep imgproxy during the first full-stack restore test;
2. inspect actual image request URLs and operator flows;
3. disable imgproxy only if no `/render/image/` or Storage transformation behavior is used.

### Studio and postgres-meta

Not application runtime dependencies. Keep for staging administration, but protect Studio behind strong authentication and preferably an IP allowlist or VPN. They may remain private and must not determine public application availability.

### Supavisor

Not required by the browser application. It may be kept for private connection pooling and administrative access. PostgreSQL and pooler ports must not be published openly.

### Logs and Analytics stack

The optional self-hosted Logflare/Vector stack is not required for initial operation and increases resource use. Start with bounded Docker logs and external uptime monitoring. Add centralized logs only when operational need justifies it.

## Initial service-removal sequence

Do not edit the official compose stack blindly.

1. Start the complete official base stack from a recorded release/commit.
2. Restore database and Storage into staging.
3. Run all application and operator smoke tests.
4. Disable Realtime and Edge Runtime one at a time through reviewed compose overrides.
5. Repeat all tests after each removal.
6. Evaluate Auth and imgproxy separately because their database/schema and image-path effects can be less obvious.
7. Record the final rendered Compose configuration and image versions.

## Regression control

The audit script is deliberately part of CI. If future code adds Supabase Auth, Realtime, Edge Functions, new Storage buckets, or new RPC names, the generated artifact will change and the infrastructure inventory must be reviewed before deployment.
