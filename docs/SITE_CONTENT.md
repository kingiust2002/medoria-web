# Site content — announcement banner and FAQ (S6a, migration 42)

Status: **built, switched off by default.** Until a person publishes something in the panel, the public pages are byte-for-byte what they were
(no banner element, no FAQ section). Nothing is active on a server until migration 42 is applied and this release is deployed.

## What exists

* **Migration 42** (`migrations/42_site_content.sql`, needs 34): one table, `site_content` (`house` health | beauty, `kind` banner | faq, `data`
  JSONB with the per-language texts, `sort_order`, `is_published`, `publish_at`, `unpublish_at`, `version`, who/when). Proved on PostgreSQL 16 in
  `tests/site-content-migration.test.mjs`:
  * the public (anon / authenticated) sees **only live rows** — published, not before `publish_at`, not from `unpublish_at` on — through a row
    policy, so a scheduled item appears and disappears **by itself, without a cron job** (the public pages re-read within a minute);
  * the public can read **only** `id, house, kind, data, sort_order` (never who edited, never the drafts' flags or dates; `select *` is refused);
  * only `service_role` (the panel actions) writes; `house` and `kind` never change; every update bumps `version`; a window that ends before it
    starts, an oversized document, a bad kind are refused by the database too.
* **Pure rules** `lib/siteContent.js`: what each kind may contain (banner: text per language ≤ 200, optional link text ≤ 40, link, tone `info` |
  `promo`; FAQ: question ≤ 200 and answer ≤ 1500 per language, **every question language needs its answer**), plain text only (no HTML can be
  written; React escapes it on show), control characters stripped, **links only `/path` or `https://…`** (no `javascript:`, no `//host`, no
  credentials; checked when saved and again when shown), the schedule judged by the same rules as scheduled product publishing
  (`lib/operator/schedule.js`, team time UTC+5, a changed date must lie in the future, end after start), the language chain
  (visitor's language → Tajik → English → Russian → Persian), "one banner" (lowest order, then newest), ordered FAQ, `FAQPage` JSON-LD for exactly the
  shown items.
* **Panel screen** "محتوای سایت" in both panels (`/operator/content`, `/beauty/operator/content`; `content.view` to open): two tabs, a list with a
  status badge (draft / scheduled / live / ended), a dialog with four language tabs (TG RU EN FA, a green dot where a language has text), order,
  "published" switch, start / end time.
* **Rights, per field** (`lib/content/actionsCore.js`, asked at the moment of use): create → `content.create`; edit → `content.edit`; switching
  it on or off → `content.publish`; the two dates → `content.schedule`; delete → `content.publish`. A save asks for exactly the operations of
  what it changes: fixing a text needs only `content.edit` (also on an item that is already live); changing the published flag or the dates
  needs `content.publish` / `content.schedule` as well. The permission is checked **before** the row is read, so ids cannot be probed.
  "Needs approval" is a refusal for content (no approval executor yet). Optimistic lock on `version` (a stale save is refused with "reload").
  Per-house limit: 60 items of a kind. Each action writes `content.create` / `content.update` (with the changed field names) / `content.delete`
  to the activity log.
* **Public side**: `components/shared/SiteBanner.jsx` (first thing inside `<main>` of the Health and Beauty layouts) and
  `components/shared/SiteFaq.jsx` (below the contact page of each house). Server-rendered, crawlable, work with JS off; each house uses its own
  colour tokens; both render **nothing** when empty or when the database cannot be read (a content outage never breaks a page). An operator's save
  purges the layout and the contact pages of the house (`lib/siteContentRevalidate.js`) so the change is visible at once; the data cache is at most
  a minute old otherwise.

## Not built

* An approval executor for content publishing (today a person without `content.publish` simply cannot publish).
* More kinds (contact details are still environment values inlined at build time — `lib/contact.js`; making them editable would touch every
  header, footer and floating button and is a separate decision).
* A version history of content texts (the activity log records who changed which fields; the texts themselves are not versioned).

## Release

1. Fresh production backup; local + R2 chain PASS.
2. Apply migration 42 (one transaction, idempotent, self-checking; needs 34).
3. Deploy; `docker compose ps` and a live curl. The public pages must look exactly as before (nothing published yet).
4. Post-check: `npm run check:rls` — the public table is *meant* to be readable for its live rows, so it checks that the staff column (`updated_label`) and
   `select *` are **refused** to the anon key (the live-only policy itself is proved by the migration's self-check and its tests); then create a test
   announcement in a house, see it on the public page, switch it off.
5. Rollback: deploy the previous release (it ignores the table); `DROP TABLE public.site_content` only after the code no longer uses it.

## Tests

`tests/site-content.test.mjs` (rules, public picking, rights per field, lock, house isolation, limit), `tests/site-content-migration.test.mjs`
(PostgreSQL 16), `tests/e2e/site-content.e2e.mjs` (real browser: create in the panel → public page in the visitor's language, JS-off view,
unsafe link refused, markup stays text, switch off, schedule, FAQ order / JSON-LD / drafts hidden, Beauty separate, stale save refused).
