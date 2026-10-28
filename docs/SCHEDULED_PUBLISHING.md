# Scheduled publishing of products (stage S6a, migration 39)

## What a person sees
In the product form (both panels), the "انتشار" box has two fields, typed in **Tajikistan time (UTC+5)**:

* **انتشار خودکار در** – an archived product goes live at that time;
* **آرشیو خودکار در** – a live product is archived at that time.

The list shows a "زمان‌بندی‌شده" badge on products with a pending date. A changed date must lie in the future (at most two years ahead);
the archive time must be after the publish time; an unchanged date that is already due is never re-judged.

## Who may schedule
A schedule is a promise to publish / archive later, so it needs the same right as doing it now: setting or changing a publish time needs
`products.publish`, an archive time needs `products.archive`. A person whose policy says "approve" for those operations files a change
request like for any other publish/archive (the request lists "انتشار خودکار" with old and new value). A form that leaves the dates alone
sends no schedule change at all (so saving still works on a database without migration 39).

## What applies the dates: a host cron
Nothing in the database publishes. `POST /api/internal/scheduled-publishing` (404 until `SCHEDULE_TOKEN`, ≥ 24 characters, is set; 401 for
a wrong token) applies every due schedule of both houses:

```
*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer $SCHEDULE_TOKEN" https://medoriaco.com/api/internal/scheduled-publishing >/dev/null
```

* `publish_at <= now` and inactive → active; `unpublish_at <= now` and active → inactive; the date is cleared. If both are due, the **later**
  one decides. A due date that no longer matters (already live / already archived) is just cleared.
* Each change is a conditional update on the exact schedule that was read — a person who edited the date meanwhile wins and the next run decides again.
* Every change is recorded in the product history (kind "quick", actor "scheduler") and as one activity-log line (`product.scheduled`, counts and ids only),
  and the public pages of that house are refreshed.
* The answer holds counts only: `{ ok, houses: { health: { published, archived, cleared } | { skipped: "not_migrated" } | { error }, beauty: … } }`;
  HTTP 502 when a house could not be read (so the cron's failure ping fires), 200 otherwise.
* **Without the cron the dates just wait.** Set a failure ping on it like the quote-reminder cron.

## Release
1. Migration 39 (columns only, additive). 2. Add `SCHEDULE_TOKEN` to `deploy/.env` (`openssl rand -hex 32`; `node scripts/check-self-host-env.mjs deploy/.env`
checks it). 3. Deploy. 4. Add the cron line. Rollback: remove the cron line; the columns are ignored by the previous release.

Tests: `tests/scheduled-publishing.test.mjs`, `tests/scheduled-publishing-migration.test.mjs` (PostgreSQL 16), `tests/e2e/scheduled-publishing.e2e.mjs`.
