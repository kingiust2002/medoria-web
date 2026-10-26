# Customer-request management (Health + Beauty)

What the team gets on top of the Quotes screen (docs/QUOTE_NOTIFICATIONS.md covers the Telegram notice itself):

| Feature | Where | Needs |
| --- | --- | --- |
| **Tracking code** (`MH-3F9A-C21B-77E0` Health, `MB-…` Beauty) on every request | shown in the opened request, in the Telegram notice, searchable in the panel | migration 32 |
| **Assignee** (who looks after a request) | field in the opened request, badge in the list, filter above the list | migration 32 |
| **"Waiting" marker**: a request still `new` and unanswered after 24 h | badge in the list, "نیازمند پیگیری" filter, two counters on the dashboard | migration 32 |
| **Notice failure marker**: the Telegram notice of a request did not arrive | badge in the list, filter, dashboard counter | migration 32 |
| **Reminder** to the house's Telegram group (counts only) when requests wait or notices failed | host cron → `POST /api/internal/quote-reminders` | migration 32 + `QUOTE_REMINDER_TOKEN` + cron |

Everything is per house: the Health panel sees and changes only `quote_requests`, the Beauty panel only `beauty_quote_requests`, each with its own session check (same rule as delete and bulk actions).

## Status

| Item | State |
| --- | --- |
| Code | ready on branch `feat/quote-management` (PR in the list of review items) |
| Tests | unit (`tests/quote-management.test.mjs`), real PostgreSQL 16 for the migration (`tests/quote-management-migration.test.mjs`), the cron script against a real HTTP server (`tests/quote-reminders-script.test.mjs`), real-browser flows (`tests/e2e/quote-management.e2e.mjs`) |
| Deployed | **no** |
| Confirmed on the live site | **no**: steps below are the owner's |

## How each piece works

**Tracking code.** 12 random hex characters from the database's `gen_random_uuid()`, formatted `PREFIX-XXXX-XXXX-XXXX` (48 random bits). It is assigned by an insert trigger (so any insert gets one, from the form or by hand), is unique (unique index) and is **not derived from the request number**: knowing `#12` tells nothing about any code. Existing requests were given codes by the migration, without changing their `updated_at`.

**There is no public lookup by code, and the visitor is not shown the code.** Decision, with reasons:

- A page where a visitor types a code and sees a status would be a new public door into the customer table. Even returning "status only" lets anyone test codes; at 2^48 the guessing is impractical, but the door also needs its own rate limit, its own error pages in four languages and a decision about what a customer may see (a status like "quoted" is commercial information). None of this is needed for the team's own use.
- The code is therefore **internal**: it identifies a request between the team members and in the Telegram group ("#12, MH-3F9A-…, which one did you call?"), and in a message to the customer *if the team chooses to quote it*.
- If a customer-facing lookup is wanted later, the safe shape is: code + the phone number given in the request (both must match), the same captcha and per-IP limits as the form, an answer of "received / in progress / answered" only, never any text. This is not built; say so if wanted.

**Assignee.** A typed label (max 60 characters; control and bidi-override characters removed). The panel login is **shared**, so the system cannot know who clicked: the name is whatever the team member types. The activity log records *that* a request was assigned or unassigned, not the typed name and never customer data.

**Waiting / first response.** A database trigger stamps `first_response_at` the first time a request's status becomes *contacted, in progress, quoted* or *closed*. **Archive and spam are not answers** and never stop the clock. A request is "waiting" while it is `new` with no first response; "overdue" from 24 h on. The marker is computed from the data, so it also appears for old requests the moment the migration has run.

**Notice failure.** After the form saves a request, the Telegram notice is sent (time-boxed, as before) and its result is written on the request: `sent`, `skipped` (Telegram not configured for that house) or `failed` plus a short class (`http_401`, `network`: never a URL, token, error text or customer text). A failed notice never changes what the visitor sees. A failed request that is later archived or marked spam stops counting.

**Reminder.** `POST /api/internal/quote-reminders` with `Authorization: Bearer <QUOTE_REMINDER_TOKEN>`:

- **Off (404)** until the token is set and at least 24 characters long; **401** for a missing or wrong token (constant-time comparison); **405** for GET (a link opened in a browser does nothing).
- For each house with Telegram configured it reads the last 30 days of its table, and if some requests are overdue or some notices failed, posts one message to **that house's** group: counts, the oldest age and the panel link. **No name, phone, product or message text** of any customer, ever.
- Answers `200` when every message that had to be sent was sent (or nothing needed sending), `502` when a message could not be delivered or a table could not be read (e.g. migration 32 missing). The body holds counts only.
- If Telegram itself is broken, the reminder cannot say so *in Telegram*: the run answers 502, the cron script exits non-zero and (if configured) pings the external check's `/fail`, which alerts you by e-mail/phone from outside the server. That is the "notification failure is detectable" chain: panel badge → dashboard counter → failed reminder run → external alert.

## Rollout (owner's steps; code is not merged or deployed)

Order matters: the migration first, then the code, then the token and the cron. Take a fresh production backup first (runbook §22 / `docs/MONITORING_AND_ALERTS.md`).

1. **Migration 32** (Supabase SQL / `docker exec … psql`, as for 27–31): run `migrations/32_quote_management.sql`. It prints nothing on success and aborts as a whole (nothing changed) if its self-check fails. Verify:
   ```sql
   SELECT count(*) AS rows, count(DISTINCT tracking_code) AS distinct_codes FROM quote_requests;   -- equal numbers
   SELECT count(*) AS rows, count(DISTINCT tracking_code) AS distinct_codes FROM beauty_quote_requests;
   ```
2. **Deploy** the code deliberately (runbook; `deploy.sh`), then `docker compose ps` and a live `curl` of `/api/health`.
3. **Check the panels**: open a request in each panel: the code shows, the assignee field saves, the dashboard shows the two new counters.
4. **Prove the notice record on the live site**: send one `TEST` inquiry from each contact form. In the panel the new request has a code; `notify_status` is `sent` (verify with `SELECT tracking_code, notify_status, notify_detail FROM quote_requests ORDER BY id DESC LIMIT 3;`). Delete the test rows with the delete button.
5. **Reminder** (optional, after 1–3 work):
   ```bash
   # a long random token in deploy/.env (never printed, never committed)
   cd /home/medoria/apps/medoria-staging/deploy
   printf 'QUOTE_REMINDER_TOKEN=%s\n' "$(openssl rand -hex 32)" >> .env
   # restart the app so it reads it, then confirm the container stayed up
   docker compose ... up -d && docker compose ps
   # install and try the wrapper
   install -m 755 -o medoria -g medoria /home/medoria/apps/medoria-staging/scripts/self-host/quote-reminders.sh /home/medoria/bin/medoria-quote-reminders.sh
   sudo -u medoria /home/medoria/bin/medoria-quote-reminders.sh --dry-run
   sudo -u medoria /home/medoria/bin/medoria-quote-reminders.sh        # prints "quote-reminders: ok — {...}"
   ```
   The preflight (`scripts/check-self-host-env.mjs`) refuses a token that is shorter than 24 characters or has unsafe characters.
6. **Cron** for user `medoria` (three times a day on working days; adjust to the team's hours; times are the server's):
   ```cron
   7 6,10,14 * * 1-6 /home/medoria/bin/medoria-quote-reminders.sh >> /home/medoria/backups/production-auto/quote-reminders.log 2>&1
   ```
   Optional external check: create a healthchecks.io check (period 1 day, grace 2 days so a Sunday without a run does not alarm) and put `QUOTE_REMINDER_PING_URL=<check url>` in `~/.config/medoria/quote-reminders.env` (mode 600).
7. **Prove the reminder**: with an old unanswered request (or temporarily by setting a test request's `created_at` two days back in a test row), run the script: the right house's group receives "N inquiry(ies) unanswered for 24h+". Delete the test row.

**Rollback.** Code: redeploy the previous image (runbook rollback). The migration is additive and the old code ignores the new columns, so it can stay. To remove it: the commented rollback at the top of the migration file (loses codes and assignments only).

## What was tested, and what was not

Tested here (not on the live site): the migration on a real PostgreSQL 16 cluster (50 + 20 existing rows get unique codes with `updated_at` unchanged; a second run changes nothing; `service_role` can insert; `anon`/`authenticated` cannot read, write or call the generator; first response is stamped once and not by archive/spam; length and value limits; skipped for a missing table; all-or-nothing on a failed self-check). **That run found a real defect during development**: the first version made every insert by `service_role` fail with "permission denied for function", which would have stopped all forms; fixed (the trigger function is `SECURITY DEFINER`) and pinned by a test. The e2e flows in a real browser: form → code stored and not shown to the visitor, markers and filters, assigning and removing, the first response, Beauty on its own table, dashboard counters, a 60-character unbroken name at 320 px, the endpoint's 401/405/200.

Not tested: a real Telegram delivery of the new notice text and of a reminder (needs the live bot), a real phone, the cron on the server.

## Limits

- 24 hours is a constant (`OVERDUE_HOURS` in `lib/operator/quoteOps.js`); the reminder looks back 30 days.
- The reminder does not repeat per request: each run says "N are waiting"; how often it nags is the cron schedule.
- The assignee is a label, not an account (shared login). Real per-person accounts are a different, larger change and are not part of this.
- The code is not shown to visitors (see above).
