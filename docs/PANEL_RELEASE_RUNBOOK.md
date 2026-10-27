# Panel platform — release runbook (stage S6c)

The one place that says **what to do, in which order, and how to go back** for the multi-user panel work (migrations 30–41). It does not
replace `docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md` (the infrastructure truth: VPS, Caddy, Supabase, backups, DNS — read it before touching
production) — it points into it. Nothing here is automatic: **a merge deploys nothing**, and every step below is done by a person.

## 0. What is where
| Topic | Document |
| --- | --- |
| The plan and the status of every stage | `docs/PANEL_PLATFORM_PLAN.md` |
| Personal accounts, roles, approvals, activity log v2, release flag | `docs/OPERATOR_ACCOUNTS.md` |
| Warehouse | `docs/WAREHOUSE.md` · Product history/lock/revert `docs/PRODUCT_HISTORY.md` · Image library `docs/MEDIA_LIBRARY.md` |
| Scheduled publishing · Translation status · Quick search | `docs/SCHEDULED_PUBLISHING.md` · `docs/TRANSLATION_STATUS.md` · `docs/PANEL_SEARCH.md` |
| Customer requests, Telegram, reminders, follow-up, report | `docs/QUOTE_MANAGEMENT.md`, `docs/QUOTE_NOTIFICATIONS.md` |
| Migrations, one row each | `migrations/README.md` |
| Backups, restore, server replacement, security review | `docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md` §7, §22, §23 · `docs/MONITORING_AND_ALERTS.md` |

## 1. The migrations of this work
All are additive, one transaction each, idempotent and self-checking (they abort and roll back on a mismatch). Apply **in order**, stop on the
first error.

| # | Needs | If it is NOT applied the app… | Rollback (only after the code no longer uses it) |
| --- | --- | --- | --- |
| 30 operator security (sessions, 2FA state, activity log) | – | refuses panel logins (fails closed) | see the file's header |
| 34 personal accounts | 30 | works in the old single-login mode while `OPERATOR_USERS` is empty | header |
| 35 approval queue, append-only log | 30, 34 | approvals/log v2 unavailable (honest message) | header |
| 36 warehouse (both houses) | 34 + product tables | warehouse screen says "unavailable" | header |
| 37 request follow-up | 32, 34 | follow-up save answers "apply migration 37" | header |
| 38 product history | 34 | no history; saves never blocked | header |
| 39 scheduled publishing | product tables | dates cannot be stored; cron skips the house | header |
| 40 translation status | product tables | marks are not remembered; saving works | header |
| 41 warehouse counts and minimum levels | 36 | the count tab says "unavailable"; stock tab works without minimums | header |

Before applying any of them on production: **fresh production backup and the local + R2 chain must PASS** (`scripts/self-host/production-backup.sh`;
runbook §7). A migration is applied by the person doing the release, never by the application.

## 2. Environment (never printed, never committed)
| Variable | Purpose | Required when |
| --- | --- | --- |
| `OPERATOR_USERS` | `on` switches to personal accounts | the owner is ready (step 5 below) |
| `OPERATOR_DATA_KEY` | 32 random bytes base64 (`openssl rand -base64 32`), encrypts 2FA seeds; **back it up** | `OPERATOR_USERS=on` |
| `OPERATOR_BOOTSTRAP_USERNAME` | only if the old username is not 3–64 `a-z0-9._-` | rarely |
| `SCHEDULE_TOKEN` | ≥ 24 chars (`openssl rand -hex 32`): lets the cron apply scheduled publishing | scheduling is wanted |
| `QUOTE_REMINDER_TOKEN` | same kind: the daily request reminder | reminders are wanted |

`node scripts/check-self-host-env.mjs deploy/.env` checks all of them (and refuses half-configured states) without printing values.

## 3. Release order (a release that contains migrations)
1. Merge the reviewed PRs (stack order is in `docs/PANEL_PLATFORM_PLAN.md`). **Nothing is deployed by merging.**
2. **Backup**: fresh production backup; local + R2 chain PASS.
3. Apply the release's migrations in order (section 1).
4. Add the new environment values (section 2); run the env checker.
5. Deploy deliberately (runbook §9): then **`docker compose ps` and a live curl** — "Started" is not proof the container stayed up.
6. Post-checks:
   * `npm run check:rls` (now also proves anonymous callers cannot read the warehouse tables, including the stock counts and levels) — must be all PASS;
   * the public pages answer and look as before; no warehouse/schedule data in a public response;
   * the owner logs in; one permission-denied probe (a viewer account cannot open `/operator/users`);
   * after `OPERATOR_USERS=on`: the activity log shows `auth.bootstrap_owner` once.
7. Cron lines (host): `quote-reminders` (daily) and `scheduled-publishing` (every 5 minutes) with an outside failure ping; verify one manual call
   answers 200 with counts only.
8. **Rollback**: empty `OPERATOR_USERS` and restart (the old env login works again); redeploy the previous image tag; remove the cron lines.
   The migrations stay (they are additive and ignored by the previous code); each file's header has the exact undo for the day it is wanted.

## 4. Monitoring — what to watch
* The container stays up (`docker compose ps`), the health route answers, the backup job reports PASS (`docs/MONITORING_AND_ALERTS.md`).
* Activity log (panel → تاریخچه, filter result = failure/rejected): spikes of `access.denied`, `auth.login_failed`, `approval.*` failures,
  `stock.*` failures, `product.scheduled`.
* Cron health: the scheduled-publishing answer is `{ ok: true, … }`; `502` means a house could not be read.
* Telegram: requests with a failed notice are flagged in the panel ("send again" exists); the reminder counts them.
* Warehouse integrity (read-only SQL, any time): `balance = sum(delta)` per (location, product) — the query is in `tests/warehouse-migration.test.mjs`.

## 5. Restore drill (do it before relying on any of this)
Follow runbook §7/§22 end to end on a **scratch** host or database, never on production: restore the latest encrypted R2 backup, run the migrations
of section 1 that are newer than the backup, start the app against it, log in as the owner, and check: products/quotes present, history and
warehouse tables present and append-only (an `UPDATE` on a ledger table must fail), `check:rls` PASS. Record the date and result at the end of the
runbook's §17 baseline. Known limit recorded in CLAUDE.md/§22: data written after the restored snapshot is missing — the drill measures how
much that is.

## 6. Not done / owner decisions
* No native-speaker review of the Tajik/English panel texts.
* Not built: lots/expiry/stock counts/reports of the warehouse (S4c), server-side paging of the product list (S5a), private preview of drafts and
  publish quality rules (S5b), site-content management (banners, contacts, FAQ), appearance settings and keyboard shortcuts beyond the search.
* The daily Telegram reminder does not yet count follow-ups; CSV import does not set history/translation marks.
