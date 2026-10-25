# Secrets, access and recovery: what to do, step by step

Four things that were open after the 2026-10-20 review. Each says **where** it happens (Browser = GitHub in your
browser; Server = SSH on the VPS as `root`) and how to see that it worked.

## 1. The old GitHub classic token (Browser)

What was checked from here: no GitHub-token-shaped string (`ghp_`, `gho_`, `ghu_`, `ghs_`, `github_pat_`) exists in
any commit of the repository or in the current files (checked by pattern, nothing printed). So the exposure was
the chat in which it was shared, not the repository. A token shared in a chat stays valid until it is deleted.

1. GitHub → your profile picture → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
2. Delete **every** token you do not clearly need today (especially the one used for CI pushes). "Delete" is final and
   instant; anything still using it will start failing, which is the point.
3. Same page, **Fine-grained tokens**: delete the ones you do not recognise.
4. Repository → **Settings → Secrets and variables → Actions**: the list should hold no personal access token. CI needs none:
   the workflow uses the automatic `GITHUB_TOKEN` with read-only contents (`permissions: contents: read`).
5. Profile → **Settings → Security log**: look for `oauth_authorization` or `personal_access_token` events you do not remember.
6. Done when the classic-token list is empty (or only holds tokens you can name) and the log shows nothing unknown.

If a tool of yours stops working afterwards, create a **fine-grained** token for that tool only: one repository, the
smallest permission, an expiry date.

## 2. The Supavisor (connection pooler) Erlang cookie (Server)

A cookie appeared once in a pasted process listing. Closed ports make it hard to use; they do **not** make a
leaked secret safe. Anything that can reach the pooler's Erlang distribution port (another container on the same Docker network, a
future firewall mistake) could run code with that cookie. So it is rotated, and first we find out where it comes from.

**Step 1: look (read-only, prints no secret).**

```bash
cd /home/medoria/apps/medoria-staging && git pull --ff-only origin main   # as medoria: sudo -iu medoria bash -lc '…'
bash scripts/self-host/supavisor-cookie-check.sh
```

Read `COOKIE_SOURCE=`:
- `…ours, rotatable…`: already set by us. Go to step 4.
- `NOT set by us`: the value comes from the image. Do steps 2–5.
- `unknown`: run the commands of step 2, then decide.

**Step 2: see how the pooler service is defined (names only, no values).**

```bash
cd /home/medoria/infra/supabase-staging/docker
ls docker-compose*.yml
grep -n -A45 '^  supavisor:' docker-compose.yml | grep -nE 'environment|RELEASE_COOKIE|SECRET|ports' 
```

**Step 3: give the pooler a cookie of our own** (never shown on screen, never in the shell history):

```bash
cd /home/medoria/infra/supabase-staging/docker
cp .env ".env.bak-$(date +%F)"                                   # a copy to go back to (mode 600)
printf 'SUPAVISOR_RELEASE_COOKIE=%s\n' "$(openssl rand -hex 32)" >> .env
```

Then tell the pooler to use it. If there is **no** `docker-compose.override.yml`, create it:

```bash
cat > docker-compose.override.yml <<'YML'
services:
  supavisor:
    environment:
      RELEASE_COOKIE: ${SUPAVISOR_RELEASE_COOKIE}
YML
```

If an override file **already exists** (it may hold the local port edits), do not replace it: add the two lines
`environment:` / `RELEASE_COOKIE: ${SUPAVISOR_RELEASE_COOKIE}` under its existing `supavisor:` entry (if that entry already has an
`environment:` block, add only the `RELEASE_COOKIE:` line to it). If the service in step 2 is not called `supavisor`, use its real name.

**Step 4: apply it and check** (a short pause of the pooler; the site itself does not use it):

```bash
cd /home/medoria/infra/supabase-staging/docker
docker compose -p supabase up -d --no-deps supavisor
sleep 30
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -iE 'supavisor|pooler'      # healthy
cd /home/medoria/apps/medoria-staging && bash scripts/self-host/supavisor-cookie-check.sh   # now: COOKIE_SOURCE=…ours…
for u in / /api/health /health/en /beauty/en; do curl -s -o /dev/null -w "$u %{http_code}\n" https://medoriaco.com$u; done
```

Expected: pooler `healthy`, `COOKIE_SOURCE` says ours, all four site checks `200`.

**Rotating later:** put a new value in `.env` (`sed -i` is not needed: delete the old `SUPAVISOR_RELEASE_COOKIE=` line, append a new one as above)
and run the `up -d --no-deps supavisor` line again.

**Rollback:** remove the `RELEASE_COOKIE` lines from the override file (and the `.env` line), `docker compose -p supabase up -d --no-deps supavisor`.
The `.env.bak-DATE` copy has mode 600 like the original: delete it once all is well.

Afterwards the cookie from the chat is worthless. The nightly backup keeps `.env` (encrypted) in every snapshot.

## 3. Docker packages (Server)

Reported by the owner on 2026-10-25: the Docker packages were upgraded after a fresh backup, all containers `healthy`, the four site
checks `200`. The earlier `apt-mark hold` on them was lifted, so Docker and containerd security updates install normally again. To
see the state at any time:

```bash
docker version --format 'server {{.Server.Version}}'
apt-mark showhold                                                      # must NOT list docker-ce / containerd.io
apt list --upgradable 2>/dev/null | grep -iE 'docker|containerd'        # empty = nothing pending
```

Rule for the future: a Docker upgrade is done after a fresh backup, in a quiet hour, followed by the container and site checks above.

## 4. Backup restore drill (Server): do it once now, then monthly

A backup is only proven when it has been restored. `scripts/self-host/restore-drill.sh` restores the newest snapshot into a **throw-away
database** (same image as production, no network, no open port, removed afterwards), compares the row count of every table with
what the backup recorded, and checks the storage files and the full dump. It cannot write to the production database or to the backups.

```bash
# install (as root, after git pull as medoria)
install -m 755 -o medoria -g medoria /home/medoria/apps/medoria-staging/scripts/self-host/restore-drill.sh /home/medoria/bin/medoria-restore-drill.sh

# run (a few minutes; needs about 3x the snapshot size free under /home/medoria/backups)
cd /home/medoria && sudo -u medoria /home/medoria/bin/medoria-restore-drill.sh
cd /home/medoria && sudo -u medoria /home/medoria/bin/medoria-restore-drill.sh --from-r2     # reads the ENCRYPTED copy back from R2 (the real disaster path)
```

Expected: every line `…=PASS` and `RESTORE_DRILL=PASS`. On `FAIL` the line says which check; the usual causes: a
corrupt or incomplete snapshot (checksums), a count that differs (a table changed between the count and the dump: run it
on the next night's snapshot before worrying), or no disk space. Never "fix" a FAIL by editing the snapshot.

Monthly, automatically (and an alert if it fails or does not run): add `RESTORE_DRILL_PING_URL=<a new healthchecks.io check, period 31 days,
grace 2 days>` to `~/.config/medoria/backup-alerts.env` (docs/MONITORING_AND_ALERTS.md) and this cron line for `medoria`:

```cron
15 5 1 * * PATH=/usr/local/bin:/usr/bin:/bin /home/medoria/bin/medoria-restore-drill.sh --from-r2 >> /home/medoria/backups/production-auto/restore-drill.log 2>&1
```

What the drill does **not** prove: that the application works on the restored data (it checks the database and the files), or that the R2
encryption password is recoverable (keep your own copy of the `rclone` crypt passwords; runbook §22.8).
