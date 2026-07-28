# App-only staging runbook

This phase moves only the Next.js application to a VPS. Supabase Cloud and the existing production site remain unchanged.

## Safety boundary

- Do not merge this branch into `main` before review.
- Do not change production DNS.
- Do not delete the Vercel project.
- Do not change Supabase Cloud keys or data.
- Do not place secrets in Git, issue comments, pull requests, or chat.

## Required server baseline

- Ubuntu 24.04 LTS or another currently supported Linux distribution
- Docker Engine with Docker Compose v2
- Public IPv4 address
- TCP ports 22, 80, and 443 reachable
- At least 4 vCPU, 8 GB RAM, and 80 GB NVMe for app-only staging

The final combined application + self-hosted Supabase server will be sized separately.

## Temporary staging DNS

Use a non-production hostname such as `staging.medoriaco.com`.

The current `medoriaco.com` nameservers are managed by Vercel. Creating one temporary `A` record for `staging` does not require changing the nameservers or the existing production records.

Do not create the record until the VPS public IP is known.

## Server preparation

Run as a sudo-capable user. Do not use password-only SSH for long-term operation.

```bash
sudo apt update
sudo apt install -y ca-certificates curl git ufw
```

Install Docker from Docker's official repository, then verify:

```bash
docker --version
docker compose version
```

Firewall baseline:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

## Repository checkout

```bash
git clone https://github.com/kingiust2002/medoria-web.git
cd medoria-web
git checkout infra/self-hosting
```

For a private repository, authenticate with a short-lived GitHub credential or deploy key. Do not store a personal access token in shell history.

## Environment file

```bash
cd deploy
cp .env.example .env
chmod 600 .env
```

Edit `.env` directly on the VPS. Use the existing production values only for the app-only staging phase. Public `NEXT_PUBLIC_*` values are embedded during the Docker build; changing them requires rebuilding the image.

Never send these values through chat:

- service-role keys
- operator password hashes
- session secrets
- captcha secret
- Redis token
- AI provider keys

## Build and start

From the `deploy` directory:

```bash
docker compose -f compose.app.yml config
docker compose -f compose.app.yml build --pull
docker compose -f compose.app.yml up -d
```

Inspect status and logs:

```bash
docker compose -f compose.app.yml ps
docker compose -f compose.app.yml logs --tail=200 app
docker compose -f compose.app.yml logs --tail=200 caddy
```

Health checks:

```bash
curl -fsS https://${STAGING_HOST}/api/health
curl -I https://${STAGING_HOST}/
```

## Application smoke tests

Test all of the following on the staging hostname:

- gateway `/`
- Health locales and catalog routes
- Beauty locales and world/category routes
- product pages and remote images
- Health operator login and session persistence
- Beauty operator login and session persistence
- quote/captcha flow
- spreadsheet import in a non-destructive test
- redirects from old locale-first routes
- metadata, canonical URLs, sitemap, robots, and OG image
- WhatsApp and Telegram handoffs
- rate limiting with the existing Upstash configuration

Do not perform destructive imports or bulk product entry during this test.

## Update procedure

```bash
cd /path/to/medoria-web
git fetch origin
git checkout infra/self-hosting
git pull --ff-only
cd deploy
docker compose -f compose.app.yml build --pull
docker compose -f compose.app.yml up -d
```

Keep the previous application image until the new container passes health and smoke tests.

## Rollback for app-only staging

App-only staging has no production cutover. Rollback is simply:

```bash
docker compose -f compose.app.yml down
```

The existing Vercel production site and Supabase Cloud project remain unchanged.

## Current known limitation

`@vercel/analytics` is no longer rendered by the application, but it remains in `package.json` and `package-lock.json` until the lockfile is regenerated through a normal npm install. It is inert and not required at runtime. This cleanup must happen before the final merge.
