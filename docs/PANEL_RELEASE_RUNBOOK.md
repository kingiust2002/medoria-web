# Panel platform — release runbook (stage S6c)

The one place that says **what to do, in which order, and how to go back** for the multi-user panel work (migrations 30–56). It does not
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
| 42 site content (banner, FAQ) | 34 | no banner / FAQ on the public pages and the content screen says "unavailable"; the site is unaffected | header |
| 43 list paging (computed columns, indexes) | product + request tables | the completeness filter says "needs migration 43"; see `docs/PANEL_LIST_PAGING.md` for the rest | header |
| 44 product variants | product tables | no variants; the variant screens say "unavailable"; products unaffected | header |
| 45 warehouse lots, expiry, quarantine | 36, 41 | the lot features report that they need the migration; see `docs/PANEL_WAREHOUSE_LOTS.md` | header |
| 46 publish quality rules | 34 | the rule cannot be saved; with no rule nothing is blocked (as before) | header |
| 47 category / brand picture focus | category tables | focus points cannot be saved; see `docs/PANEL_CATEGORY_IMAGES.md` | header |
| 48 product documents | 34, product tables | the documents section says "unavailable"; the public page shows none | header |
| 49 saved list views | 34 | the lists show no "views" row | header |
| 50 personal start page and shortcuts | 34 | the settings card says so; no shortcuts | header |
| 51 contact details and featured products (kinds of site content) | 42 | the two new tabs cannot save; the public pages use the built-in defaults / starred products | header |
| 52 what the server scripts reported | – | the System status screen says everything is **unknown** (never green) | header |
| **53 approved deletions that check the reviewed version (quotes, categories, brands)** | the tables it reads (01/10/12/20/32) | **approved and direct deletion of a category / brand and approved deletion of requests are REFUSED** (fail closed, "migration 53 missing" in the log) — nothing is deleted without it | header (drop 5 functions) |
| **54 private product documents** | 48 + the `storage` schema | uploading a document fails and says so; the public pages list no documents. **Apply BEFORE the application that serves documents is deployed** (the app uploads to the private buckets) | header |
| 55 my columns of the lists | 34 | no "my columns" chooser; the lists keep their default fields | header |
| 56 rows per page and dashboard blocks | 50 | the settings card says so; start page and shortcuts keep working | header |

**Which migrations are still pending.** Production is proven only at `5ac0592`, and the independent review (2026-10-29) confirmed: **34–42 are pending as well as 43–56.** Nothing of 34–56 is applied anywhere; each is written, tested on a throw-away PostgreSQL 16 and documented in `migrations/README.md`. (30–33 belong to the earlier work: check them on the target before the release — the System status screen's migrations table does — rather than assuming.) Applying them is one release with this order: **numeric order, 34 → 56, stop on the first error.** The only cross-dependencies that are not simply "lower number first": 41 needs 36; 45 needs 36 + 41; 48 needs 34; **54 needs 48**; 56 needs 50. The files already merged into `main` carry migrations 43–46; 47–56 are on the open PRs (see section 7).


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
| `OPS_REPORT_TOKEN` | same kind: lets the server's own scripts report backup / restore-drill / heartbeat results to the panel's System status screen (`docs/PANEL_SYSTEM_STATUS.md`); also set `OPS_REPORT_URL` + the same token in the two alert env files on the server | the System status screen should show real reports instead of "unknown" |

`node scripts/check-self-host-env.mjs deploy/.env` checks all of them (and refuses half-configured states) without printing values.

## 3. Release order (a release that contains migrations)
1. Merge the reviewed PRs (stack order is in `docs/PANEL_PLATFORM_PLAN.md`). **Nothing is deployed by merging.**
2. **Backup**: fresh production backup; local + R2 chain PASS.
3. Apply the release's migrations in order (section 1). **54 before the deploy** (the new code uploads documents to the private buckets); after applying 54, if migration 48 was EVER applied and used on that database, follow `docs/PANEL_PRODUCT_DOCUMENTS.md` "Moving files" (the migration prints a WARNING with the number of rows).
4. Add the new environment values (section 2); run the env checker.
5. Deploy deliberately (runbook §9): then **`docker compose ps` and a live curl** — "Started" is not proof the container stayed up.
6. Post-checks:
   * `npm run check:rls` (now also proves anonymous callers cannot read the warehouse tables, including the stock counts and levels) — privacy denials must be proved; retain FAIL/UNKNOWN exit semantics. The current Health positive-read probe is UNKNOWN because there are no active Health products; record it honestly rather than weakening the checker or publishing unwanted data;
   * `npm run check:rls` now also proves: the five functions of migration 53 refuse an anonymous caller (or are "not found" before the migration), the two document buckets answer "Bucket not found" to an anonymous address, and `operator_table_columns` is private — **these are the real-Storage / real-API proofs the sandbox could not run**; record the output;
   * a draft document is not served: as an anonymous visitor `curl -s -o /dev/null -w "%{http_code}" https://medoriaco.com/api/documents/health/<id of a DRAFT document>` must print 404, a published one 200 `application/pdf`; hide it in the panel and the same address answers 404 at once;
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

## 5a. After the independent review (2026-10-28)

* The corrected implemented stack was independently re-reviewed and #208–#224 merged on 2026-10-28 (`PANEL_REVIEW_ACCEPTANCE_2026-10-28.md`). The safe subset (#203/#204/#206/#207) is owner-reported live at `5ac0592`. The platform itself is NOT reported deployed; continue only through a separate planned rollout, after the owner's agreed remaining code work. Do not blindly reuse the earlier safe-subset deploy command.
* **Migration 41 changed before ever being applied** (it now contains the transactional close functions); apply the version from the corrected stack only. If
  a throw-away database got the old 41, re-run the new file's `CREATE OR REPLACE FUNCTION` blocks.
* Approved product deletions now need a basis version; old queued delete requests fail as stale and must be re-submitted.
* Extra post-checks for the platform rollout, in addition to section 3: with a disposable manager account holding `users.manage` and a **viewer** role,
  confirm it cannot reset the password of a house admin; confirm a stock-count close that cannot post one line leaves the count open and the ledger unchanged.

## 6. Not done / owner decisions (reconciled 2026-11-02; the earlier text of this section was out of date and is replaced)
Built since the first version of this section: server-side paging (N1), the complete approval path (N2), variants (N3), warehouse lots / expiry / quarantine with on-screen alerts (N4), a private preview of a draft on the real page (N5), owner-chosen publish rules (N6), category / brand pictures (N7), product documents (N8), saved views, "my columns" and the all-filtered-results scope (N9), start page / shortcuts / rows per page / dashboard blocks (N10), editable contact details and featured items with approval of publication (N11), import and bulk edits under the same rules (N12), the System status screen and the restore-drill tooling (N13). See `docs/PANEL_PLATFORM_PLAN.md` for the status of each (complete / partial / needs the owner).

Still **not done**, honestly:
* No native-speaker review of the Tajik/English panel texts (all screens, all new ones included); machine preparation is not a review.
* **Warehouse**: stock counts stay per product (not per lot); low-stock / expiry alerts are on screen only — Telegram / e-mail delivery is not built.
* **Variants**: an unsaved variant is not part of a draft preview.
* **Personal settings**: keyboard-shortcut customisation and server-kept language / light-dark mode are NOT built — they need the owner's decision (`docs/PANEL_PERSONAL_SETTINGS.md`, "Owner decisions").
* **Contact details**: the gateway's e-mail is not editable; address / hours / social links do not exist on the site; defaults still come from the environment — which company details should exist is an owner decision.
* **Documents**: the PDF check is a heuristic, not an antivirus; the first Storage proof is the post-release `check:rls` run above.
* **Backup / monitoring**: the System status screen shows UNKNOWN until the owner applies 52 and sets the token / URL; **no real backup, restore drill, heartbeat or alert delivery was run or proved here** — the restore tool is tested against a throw-away PostgreSQL only (`tests/restore-drill.test.mjs`), not against an encrypted production snapshot.
* **Bulk / import** are not transactional across chunks (exact done / not-done lists are returned, retries are safe).
* The `check:mobile` checker is run per release on the built site (this section's date: see `docs/PANEL_REVIEW_RESPONSE_2026-11-02.md` for the last run).

## 7. The stack at the time of writing (2026-11-02)
`main` = `dccae13` carries #228–#233 (merged by the owner after the first review; the review's fixes for #229 are in #242). Open, in dependency order: **#242** (`fix/approved-destructive-atomic`, base `main`: migration 53) → **#234** (+R4) → **#235** (+R1/R2, migration 54) → **#236** (+columns, migration 55) → **#237** (+rows per page / dashboard, migration 56) → **#238** (+content approval) → **#239** (+R5/R6/R7/R11) → **#240** (+probes, check-rls, the reconciled documents). Merge strictly in this order; each PR's base is the branch before it.
