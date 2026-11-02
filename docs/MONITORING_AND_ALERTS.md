# Backup alerts and site monitoring

Goal: **if backups stop, or the server or the site goes down, a message reaches you even when the
server itself is the thing that died.** A server cannot announce its own death, so the design is a
*dead-man's switch*: the server sends a small "I'm fine" signal on a schedule to an outside service;
when the signals **stop** (or say "failed"), the outside service alerts you.

| Signal | Sent by | When | Alert when |
| --- | --- | --- | --- |
| **Backup** | `production-backup.sh` (cron 02:30 UTC) | start, success, or failure with the failed step | failure signal, or **no success** within 1 day + 3 h grace |
| **Backup freshness** | `production-backup.sh --check` (cron, daily) | success if the newest local **and** R2 snapshot is under 36 h old | stale snapshot, or no signal |
| **Server heartbeat** | `uptime-heartbeat.sh` (cron, every 5 min) | success if the public site answers 200, no container is unhealthy and the disk is under 90 % | any of those fails, or **no signal for 15 min** (server off, cron dead) |
| **Site from outside** | an external HTTP monitor (UptimeRobot or similar) | every 5 min it requests `https://medoriaco.com/api/health` itself | no answer / wrong status (DNS, certificate, Caddy, network) |

The scripts speak the **healthchecks.io** protocol (POST to the check URL, `/start`, `/fail`; the free plan is
enough, and the same works with a self-hosted healthchecks). Use *that* service for the first three rows;
UptimeRobot, Better Stack or similar for the last row.

The ping URLs are the keys to your checks: keep them **only** in the two config files below (mode 600). They
are never written to the repository, the logs or the script output; a failing ping never breaks a backup.

## One-time setup

### 1. In the browser (on Windows)

1. Create an account at healthchecks.io. Create **three checks**:

   | Name | Period | Grace time |
   | --- | --- | --- |
   | Medoria backup | 1 day | 3 hours |
   | Medoria backup freshness | 1 day | 2 hours |
   | Medoria server heartbeat | 5 minutes | 10 minutes |

2. Under *Integrations* add **e-mail** and **Telegram** (healthchecks offers a Telegram bot to connect your own
   account) and tick both on all three checks. Use a Telegram chat only you and the people who must act can see.
3. For each check, copy its **ping URL** (looks like `https://hc-ping.com/<long id>`). Keep the page open; do not
   paste the URLs into chats, tickets or e-mail.
4. At UptimeRobot (or similar) create a monitor: type *HTTP(s)*, URL `https://medoriaco.com/api/health`, interval
   5 minutes, alerts to e-mail and Telegram.

### 2. On the server (SSH, `root@…#`)

Get the new scripts (as `medoria`, then install them where cron looks):

```bash
sudo -iu medoria bash -lc 'cd ~/apps/medoria-staging && git pull --ff-only origin main'
install -m 755 -o medoria -g medoria /home/medoria/apps/medoria-staging/scripts/self-host/production-backup.sh /home/medoria/bin/medoria-production-backup.sh
install -m 755 -o medoria -g medoria /home/medoria/apps/medoria-staging/scripts/self-host/uptime-heartbeat.sh /home/medoria/bin/medoria-uptime-heartbeat.sh
```

Store the URLs without showing them or putting them in the shell history (paste when asked, press Enter):

```bash
sudo -iu medoria bash -lc 'umask 077; mkdir -p ~/.config/medoria
read -rsp "Backup check URL: " A; echo
read -rsp "Backup freshness check URL: " B; echo
printf "BACKUP_PING_URL=%s\nBACKUP_CHECK_PING_URL=%s\n" "$A" "$B" > ~/.config/medoria/backup-alerts.env
read -rsp "Server heartbeat check URL: " C; echo
printf "SITE_PING_URL=%s\n" "$C" > ~/.config/medoria/uptime-alerts.env
ls -l ~/.config/medoria'
```

Add the two new cron lines for `medoria` (the existing 02:30 backup line stays as it is). First look at the current crontab:

```bash
sudo -u medoria crontab -l
```

then add (replace nothing, only append):

```bash
( sudo -u medoria crontab -l
  echo '*/5 * * * * PATH=/usr/local/bin:/usr/bin:/bin /home/medoria/bin/medoria-uptime-heartbeat.sh >> /home/medoria/backups/production-auto/heartbeat.log 2>&1'
  echo '45 8 * * * PATH=/usr/local/bin:/usr/bin:/bin /home/medoria/bin/medoria-production-backup.sh --check >> /home/medoria/backups/production-auto/cron.log 2>&1'
) | sudo -u medoria crontab -
sudo -u medoria crontab -l
```

## 3. Prove that the alert really reaches you (do not skip)

A green script is not an alert. Do these once, and again after any change:

1. **Failure signal.** On the server:
   ```bash
   cd /home/medoria && sudo -u medoria /home/medoria/bin/medoria-production-backup.sh --alert-test
   ```
   Within a minute or two you must receive an **e-mail and a Telegram message** saying "Medoria backup is DOWN".
   Then clear it: `… --alert-test-clear` — you should get the "UP again" message.
2. **Silence (the dead-man part).** In healthchecks open *Medoria server heartbeat* and note the last ping time.
   On the server comment out its cron line (`sudo -u medoria crontab -e`, put `#` in front), wait 15 minutes:
   the **"no signal" alert must arrive**. Remove the `#`; the "UP again" message must follow within 5 minutes.
3. **Outside monitor.** In UptimeRobot press *Send test notification* (or temporarily point the monitor at a wrong
   URL for 10 minutes), confirm the message arrives, restore it.
4. **A really dead server.** At the next planned reboot or maintenance window, watch for "down" then "up" (a
   reboot takes about a minute, below the heartbeat grace, so it may not alert; a longer outage must).

Anything that does not arrive is a failed test: check the integrations on the check, not the script.

## When an alert arrives

| Message | Meaning | First step |
| --- | --- | --- |
| Backup DOWN, body "FAILED at step: …" | the nightly backup failed at that step | `cd /home/medoria && sudo -u medoria /home/medoria/bin/medoria-production-backup.sh` and read the output (§22.7, §23.4) |
| Backup DOWN, no body (silence) | the backup did not run / finish within 27 h | `sudo -u medoria crontab -l`, `tail /home/medoria/backups/production-auto/cron.log`, is the server up? |
| Freshness DOWN | the newest local or R2 snapshot is older than 36 h | same as above; check R2 with `… --check` |
| Heartbeat DOWN, body "site health answered http …" | the site does not answer 200 from the server | `docker compose ps`, Caddy and app logs (runbook §19) |
| Heartbeat DOWN, "unhealthy containers: …" | a container's health check fails | `docker ps`, `docker logs <name>` |
| Heartbeat DOWN, "disk N % full" | disk nearly full | `df -h /`, `docker system df`; free space (§ disk notes) |
| Heartbeat DOWN, silence | server off, network cut or cron dead | provider's web console, then SSH |
| Outside monitor DOWN but heartbeat UP | the server is fine but the outside cannot reach it | DNS, certificate, firewall, provider network |

## Seeing it in the panel (optional)

The panel's **System status** screen (`docs/PANEL_SYSTEM_STATUS.md`) shows what these scripts last reported — and says **unknown** for anything it has not heard. To turn reporting on, add `OPS_REPORT_URL` and `OPS_REPORT_TOKEN` to the two env files above (same token as `OPS_REPORT_TOKEN` in the app). The screen never shows an alert as delivered: after `--alert-test`, you press "I received the test alert" yourself.

## What is and is not covered

- Covered: a failed backup, a backup that silently stops, an old snapshot, a dead server or cron, an unhealthy
  container, a full disk, a site that is not answering (from inside and from outside).
- Not covered: the external service being down at the same time, or your phone being off; a backup that "succeeds"
  but is not restorable (that is the restore drill in the runbook); application-level errors that still return 200.
- The tests in `tests/backup-alerts.test.mjs` run both scripts for real against fake `docker`/`rclone` and a fake
  alert server (start/success/failure/stale/alert-test pings, URL never printed, a failing ping never breaks a
  backup, the config cannot run code, the working directory no longer matters). **They do not prove that the
  external service turns a ping into your phone buzzing: step 3 above does.**
