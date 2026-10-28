# System status in the panel: backup, monitoring, restore drill, migrations (N13)

**Status: complete in code and tests for both houses — and deliberately limited in what it claims. Migration 52 is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere. The server scripts' reporting is OFF until the owner sets two values on the server. Nothing was deployed or changed on the server by this work, and no real alert, backup, restore or heartbeat was run here. Tajik / English texts are machine-prepared and need a human read.**

## The rule

**The panel never shows green for something it has not heard.**

| State | Meaning |
| --- | --- |
| **unknown** | no report ever arrived (no migration, no token, scripts not configured, nothing yet) — this is the starting state of everything |
| **fail** | the last report was a failure (the screen also shows when it last worked and the script's one-line reason) |
| **overdue** | the last report was a success but older than it should be: backup and freshness check 36 h, restore drill 35 days, heartbeat 15 minutes |
| **ok — "healthy, as reported"** | a **fresh** success report. It means *the script said so recently* — **not** that the backup can be restored (that is what the restore drill reports) and **not** that an alert reached anybody. The screen says this in words |

The headline is only as good as its worst part: any failure → "a problem was reported"; anything unknown or overdue → "needs attention"; only if all four monitored things are fresh successes → "every script recently reported success".

## What the screen shows (Settings → System status, both panels; needs `users.view`: the main manager and house admins)

1. **Reports of the server's scripts** — backup, backup freshness (local + R2), restore drill, heartbeat. Time is the **database's clock**, never the sender's.
2. **The alert path** — *the app cannot see whether a message reached a person.* A test alert (`production-backup.sh --alert-test`) is recorded as "sent". Only the **main manager** (`users.manage`) can then press "I received the test alert" (with a short note); it is stored with their name and shown as **their statement, not verified by the app**. A newer test alert makes an older confirmation obsolete. There is no state called "verified".
3. **Live checks by the app, right now** — can it read its database; **which migrations are applied** (the presence of each migration's table or column: present / missing / unknown; migration 51 has nothing to probe and says so); which settings exist (**present or not — never the value**).

## How the scripts report

`POST /api/internal/ops-report` with `Authorization: Bearer $OPS_REPORT_TOKEN` and `{kind, status, detail}`; kinds `backup`, `backup_check`, `restore_drill`, `heartbeat`, `alert_test`; statuses `pass` / `fail` (`alert_test`: `sent`). **Off (404) until `OPS_REPORT_TOKEN` (24+ chars) is set** in the app's environment. Wrong token 401; unknown kind/status 400; body ≤ 2 KB; URLs in the detail are replaced by `[url]` (a ping URL is a key); the sender cannot choose the time or who reported; a script cannot confirm an alert.

The three scripts (`production-backup.sh`, `restore-drill.sh`, `uptime-heartbeat.sh`) now call a small `ops_report` next to their existing ping — **only if the same env file they already read has**:

```
OPS_REPORT_URL=https://medoriaco.com/api/internal/ops-report   # https only (or http://127.0.0.1 for a local test)
OPS_REPORT_TOKEN=<the same value as OPS_REPORT_TOKEN in the app>
```

Parsed, never sourced; the token goes to curl on **stdin** (never on the command line, so `ps` cannot show it) and is never printed; a failing report only logs a warning and **never changes a backup, drill or heartbeat result**; no configuration = no behaviour change at all.

## Restore-drill tooling

`restore-drill.sh` already restored a snapshot into a throw-away database and compared the table counts; it now also reports PASS / FAIL to the panel (so the screen can say "last drill passed on …", or "overdue / never"). **This work did not run a real restore drill and the screen does not claim one.**

## Owner steps (not done here — server work is out of this phase)

1. Apply migration 52 (after the earlier ones; see the runbook). 2. Put the same random `OPS_REPORT_TOKEN` in `deploy/.env` and in the two alert env files, plus `OPS_REPORT_URL`; redeploy the app; re-install the three scripts. 3. Run `--alert-test` once, read your phone, press "I received the test alert". 4. Run the restore drill once and look at the screen. 5. Until then everything honestly reads **unknown**.

## Tests

* `tests/ops-status.test.mjs` (9): the state rule (unknown / fail / overdue / ok, every window), the headline, the alert proof (never verified; an old confirmation does not count), what a script may send and URL stripping, ingest (one row per kind, a sender cannot pick time or reporter, missing table says so), the owner's confirmation, live checks (present / missing / unknown, a thrown error is unknown), settings as booleans only, wiring.
* `tests/ops-status-migration.test.mjs` (4, real PostgreSQL): private, one row per kind, each kind only its own statuses, the database's clock, `last_pass_at` survives failures, no delete.
* `tests/backup-alerts.test.mjs` (+5): the scripts really POST the right kind / status with the token as a header and never print it; `--check` and `--alert-test` report; no configuration = no report; a broken endpoint, a bad URL or a short token never changes a result; the heartbeat reports without its own ping URL; the drill reports (pin).
* e2e `accounts-system-status` (4): unknown everywhere and not green; the route's token and refusals; a report changes only its row, a failure keeps the last success, the headline stays off green until all four are fresh; the alert flow ending as "their statement"; a house admin reads but cannot confirm, a viewer cannot open it; Beauty; 320 px.

## Stated limits

* The app shows what was **reported**, and what it can read itself. It cannot see the server's disks, cron, R2, or the external alert service, and cannot prove a backup restorable or an alert delivered.
* A report is "latest per kind", not a history; the activity log records confirmations.
* If the scripts or token are not set up, or migration 52 is not applied, the screen says **unknown** (and, for the missing table, says why) — that is the honest state, not a bug.
