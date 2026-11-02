# Panel platform: multi-user accounts, permissions, approvals, warehouse — plan and status

Written 2026-10-27 from the owner's 31-item specification. This file is the **memory of the project**: what exists, what was
decided, the order of work, what is done and what is not. Update the status table with every PR. Nothing here is deployed
unless the status says "live" (the owner deploys; a merge is not a deployment).

## 0. Ground rules (from the owner)

* Keep and complete what exists; no parallel duplicates of existing features.
* Health and Beauty stay **separate**: data, permissions, notice destinations and sessions never mix.
* Default **closed**: an explicit deny beats any allow; nobody raises their own role or grants more than they hold.
* Every rule is enforced **on the server** (pages, readers, actions, previews, search, exports), never only by hiding a button.
* Warehouse data is **internal only**: never in public pages, public API, browser payloads, search, public previews or the
  public printed catalog; protected by the data structure and RLS, not only by the UI.
* Out of scope: wholesale/tiered pricing, quote→offer/pro-forma, CRM/accounting/external warehouse integrations, the chatbot.
  (Ordinary and price-on-request prices, the internal customer file and the internal warehouse ARE in scope.)
* A merge to `main` is not a deployment. Every release gets an exact order: backup → migration → deploy → post-checks → rollback.
* A feature is "done" only when it is built, tested (with a test that failed before the fix), documented, and the CI result was read.

## 1. What already exists (checked in the repository on 2026-10-27)

| Area | State |
| --- | --- |
| Login | One shared account per panel from environment variables (`OPERATOR_*`, `BEAUTY_OPERATOR_*`), scrypt hash, signed cookie + session registry (`operator_sessions`), optional TOTP from env, recovery-code hashes from env (`scripts/operator-2fa.mjs`), login throttle, idle logout 20 min, logout confirmed by the server |
| Sessions | Registry with revocation ("end other / all sessions"), fail-closed on database outage (#185, merged) |
| Page/reader guards | Every panel page and service-role reader checks the session itself (#203, merged); every server action opens with a session check (test-pinned in #204) |
| Audit log | `operator_audit_log` (migration 30): panel, action, entity, ids, count, small whitelisted detail, session id, keyed IP hash. **No user id, no result, no before/after.** |
| Products | CRUD, quick edit, bulk edit (ids, no scope choice), duplicate, archive, CSV/Excel import and export, 4-language fields, completeness markers, Cloudflare auto-translate, image upload; list loads all rows (no server paging in the panel) |
| Delete | #204 (open): archived-only permanent delete with typed SKU — **needs the fixes of stage 1** |
| Categories / brands | Health tree, Beauty tree, brands (Beauty); Beauty category image + brand logo upload exist; Health category image is only a URL field |
| Quotes | Status, shared assignee **name** (free text), internal note, tracking code, archive/spam/delete, bulk, reminders, Telegram notice result; no follow-up date, no customer file, no report/export |
| i18n | Persian/Tajik/English panel (#206, open) |
| Public stock | `products.in_stock` boolean; no numeric stock anywhere |
| Not present | users table, roles, permissions, approvals, record versions, drafts, previews, variants, media library, documents, warehouse, content management, scheduling, global search, personal settings |

## 2. Architecture decisions (stage-independent)

**D1 Identity.** New private table `operator_users` (service-role only, RLS on, no policy, like migration 30): id (uuid),
username (unique, case-insensitive), display name, status (`active|disabled|blocked`), houses (`health`, `beauty`, or both),
role, per-user permission overrides, per-user approval policy, 2FA required flag, scrypt password hash (the existing
`scrypt` code, OWASP 2024 parameters), per-user TOTP secret **encrypted at rest** (AES-256-GCM, key from a new server secret
`OPERATOR_DATA_KEY`) and hashed recovery codes, `authz_version` (bumped on every change that must cut old sessions),
`created_by`, timestamps. No public registration exists: only a user holding `users.manage` can create accounts.

**D2 Sessions.** The existing session registry gets `user_id`. A request is authorised by the **database state of the user at
that moment** (active, houses, permissions, `authz_version`): disabling a user, changing a password or changing permissions
revokes the old sessions by policy (the policy is written down in OPERATOR_SECURITY.md).

**D3 Authorisation.** One pure module (`lib/operator/authz.js`): a catalog of permissions `house.resource.action`
(resources: products, categories, brands, media, documents, quotes, customers, inventory, content, reports, audit, users,
approvals; actions: view, create, edit, archive, delete, publish, approve, export, manage + a few fine ones such as
`products.edit_price`, `inventory.adjust`). Roles are presets; per-user `allow`/`deny` overrides; **deny > allow > role >
default closed**. A grant ceiling: a user can give only permissions they hold themselves, never change their own role,
houses or permissions, and the last active owner cannot be disabled, blocked or demoted. Every server action calls
`authorize(user, permission)` and gets `direct | needs_approval | denied`.

**D4 Approval.** A per-user, per-operation policy (not one switch): "edits descriptions directly, but price / publish / delete /
stock correction need approval". "Publish directly" and "approve others' changes" are different permissions. A pending change
is a row in `operator_change_requests` (what, who, when, base version + snapshot, proposed values, status, reasons). The live
data does not change until approval. On approval the **reviewed version only** is applied; if the record changed meanwhile the
approval is refused as stale (the requester is told and can resubmit); the requester's account state and permission are
re-checked at execution.

**D5 Concurrency.** Every editable record gets a `version` integer (trigger-maintained). Updates carry the expected version
(`UPDATE … WHERE id = ? AND version = ?`); a conflict shows both versions and the way forward. Same rule for approvals and
stock operations.

**D6 Audit v2.** Extend the log: `user_id`, `result` (`requested|succeeded|failed|denied|approved|rejected`), `request_id`,
before/after for product/content changes (sensitive fields and customer message text excluded). A destructive action writes
an *attempt* entry first (it must succeed or the action is refused — **a missing log table is a refusal, not a permission**)
and an *outcome* entry after; a failed delete is never recorded as a successful one.

**D7 Warehouse.** Separate private tables per house (`*_stock_locations`, `*_stock_lots`, `*_stock_movements`, …), RLS on, **no
policy**, no grants to anon/authenticated, never joined into public queries, never added as columns of `products`. Movements
are append-only; the balance is derived (or a cached column maintained only by the movement trigger); every movement has an
idempotency key; mistakes are corrected by a reversing movement. The public `in_stock` flag is separate and is not updated from
warehouse numbers unless the owner decides so explicitly. `scripts/check-rls.mjs` and a leak test cover the new tables and every
public route/API/payload/print path.

**D8 Language of the interface** is independent of the language of the content (done in #206).

## 3. Stages and PRs (small, reviewable, in dependency order)

| Stage | PR | Content | Depends on | Spec items |
| --- | --- | --- | --- | --- |
| 1 | S1a | Fix #204: attempt + outcome audit entries, deletion refused when the log is unavailable, conflict resolved without losing #203's docs | #203 (merged) | 6, 7 |
| 1 | S1b | Same fail-closed audit rule for every other destructive action (quote delete, category/brand delete) | S1a | 6, 7 |
| 2 | S2a | `authz.js` (catalog, roles, deny>allow, ceilings) + unit tests; no DB | – | 2 |
| 2 | S2b | Migration 34: `operator_users`, `user_id` on sessions and audit, `result`/`request_id` columns, `OPERATOR_DATA_KEY`; account store; login by user; **safe owner bootstrap** from the current env account; env login retired once an owner exists | S2a | 1, 5, 6 |
| 2 | S2c | "Users and access" UI (create, edit, enable/disable/block, houses, role, overrides, approval policy, sessions) | S2b | 1, 2, 3 |
| 2 | S2d | Password, 2FA and recovery codes from the panel with re-authentication; required-2FA policy; session policy on change | S2b | 5 |
| 2 | S2e | Enforcement on **every** page, reader, action, preview, search and export (matrix test per role × house) | S2b, S2c | 2 |
| 2 | S2f | Migration 35: `operator_change_requests`, `version` columns; approval queue UI; stale-approval refusal; execution re-checks | S2e | 3, 4, 11 |
| 2 | S2g | Audit v2 viewer (who/what/result/before-after, restricted) | S2b | 6 |
| 3 | S3 | Panel i18n finished for all new screens (a rule for every PR); permissions applied to existing features (quotes, categories, brands, import/export, bulk) | S2e | 15, 26 |
| 4 | S4a | Migration 36: warehouse core (locations, movements, balances, reservations) + permissions + RLS + leak tests | S2f | 24, 25 |
| 4 | S4b | Lots/expiry/quarantine, alerts, reports, counts and discrepancies | S4a | 25 |
| 5 | S5a | Server-side paging/search for products, quotes, history, warehouse | S2e | 10, 26 |
| 5 | S5b | Product quality rules, drafts, full private preview, "view on site" | S2f | 8, 12, 13 |
| 5 | S5c | Variants (migration), versions and restore | S2f | 9, 14 |
| 5 | S5d | Images of categories/brands (both houses), media library, documents | S2f | 17, 18, 19 |
| 5 | S5e | Quotes: follow-up date, "today/overdue", reminders, real-user assignee, customer file, reports/CSV, Telegram retry | S2e | 20–23 |
| 5 | S5f | Translation quality status and no overwrite of human-approved text | S2f | 16 |
| 6 | S6a | Site content management (banners, featured, contacts, FAQ), scheduling | S2f | 28, 29 |
| 6 | S6b | Appearance, personal settings, global search, shortcuts, real-screenshot QA in 3 languages | S2e | 30 |
| 6 | S6c | Backup/monitoring/restore-drill status and documentation | – | 31 |

## 3a. The stack — merge order (as of 2026-10-28)

**Status: reviewed and merged.** The independent re-review accepted the corrected implemented scope and merged #208–#224 in order on 2026-10-28. See `PANEL_REVIEW_ACCEPTANCE_2026-10-28.md` for evidence, the supplemental exact-version delete correction and limits. This does not mean every requested feature is built or that the platform is deployed. The safe subset (#203/#204/#206/#207) was owner-reported deployed at `5ac0592`; migrations 34–42 and platform activation are still pending.

The table preserves dependency/merge order as a historical record. Each PR was explicitly retargeted to main before merging; no higher stacked PR was used to bypass an ancestor. A merge deploys nothing. Apply migrations 34 through 42 in numeric order from corrected main only during a separate planned release (`PANEL_RELEASE_RUNBOOK.md`). Future branches start from current main, not the old feature heads.

| # | PR | Branch | What |
| --- | --- | --- | --- |
| 1 | #204, then #207 | `feat/product-delete`, `fix/destructive-audit-fail-closed` | permanent delete of archived products; attempt-then-outcome audit (#207 is stacked on #204) |
| 2 | #206 | `feat/panel-i18n` | the panels in Persian, Tajik, English (contains #204) |
| 3 | #208 | `feat/panel-authz` | the permission model (S2a); independent root |
| 4 | #209 | `feat/panel-accounts` | personal accounts + enforced permissions (migration 34); **contains #204, #206, #207 and #208**, so after merging 1–3 it is the next one (its base is `feat/panel-i18n`) |
| 5 | #210 | `feat/panel-users-ui` | people screen, own password / two-step (S2c, S2d) |
| 6 | #211 | `feat/panel-approvals` | approval queue + activity log v2 (migration 35) |
| 7 | #212 | `feat/panel-ui-permissions` | buttons follow permissions; warehouse core (migration 36) |
| 8 | #213 | `feat/panel-warehouse-ui` | warehouse screens |
| 9 | #214 | `feat/panel-quote-followup` | quote follow-up, report, CSV (migration 37) |
| 10 | #215 | `feat/panel-product-versions` | optimistic lock, history, revert (migration 38) |
| 11 | #216 | `feat/panel-media` | media library |
| 12 | #217 | `feat/panel-scheduling` | scheduled publishing (migration 39) |
| 13 | #218 | `feat/panel-search` | quick search |
| 14 | #219 | `feat/panel-translation-status` | translation status (migration 40) |
| 15 | #220 | `feat/warehouse-counts` | stock counts, minimum levels, reports (migration 41) |
| 16 | #221 | `feat/site-content` | banner + FAQ (migration 42) |
| 17 | #222 | `feat/followup-reminder` | follow-ups in the daily Telegram reminder |
| 18 | #223 | `feat/list-bounds` | bounded product / quote lists |
| 19 | #224 | `feat/product-preview` | per-language preview + gap checklist |

## 4. Release template (every release that has a migration)

1. Merge the reviewed PRs (a merge deploys nothing).
2. **Backup**: fresh production backup; local + R2 chain must PASS (`scripts/self-host/production-backup.sh`).
3. Apply the migration(s) of the release, in order, stop on any error (each is one transaction, idempotent, self-checking).
4. Set new environment values the release needs (listed in its PR), without printing them.
5. Deploy deliberately (`docker compose … up -d app`), then `docker compose ps` and a live curl.
6. Post-checks (listed per release): `npm run check:rls`, public pages unchanged, login of the owner, one permission-denied probe,
   no warehouse data in public responses.
7. Rollback: previous image tag + the migration's own rollback note (each migration is additive; new columns are ignored by the
   old code).

## 5. Open decisions that need the owner (asked only when they block)

* `OPERATOR_DATA_KEY` (32 random bytes, base64) must be created on the server by the owner: it encrypts per-user 2FA secrets.
* Which existing account becomes the first owner (the current env username) and for which house(s): by default both.

## 6. Status (updated after the independent re-review, 2026-10-28)

States below cover ONLY each row's described implementation. Missing parts of a broader stage remain open in the work log/release runbook; a merged component is not a completed whole stage.

| PR | State | Evidence |
| --- | **merged described scope; not deployed** | --- |
| #203 session guard on pages/readers | **deployed at 5ac0592** (owner output); see acceptance review | CI green, 3 browser tests red→green |
| #204 product delete | **deployed at 5ac0592** (owner output); see acceptance review | CI green (validate, browser-flows) |
| #207 S1b: same rule for quote / category / brand deletes | **deployed at 5ac0592** (owner output); see acceptance review | 294 unit, full browser suite green |
| #206 three-language panel | **deployed at 5ac0592** (owner output); see acceptance review | 297 unit, 120 browser tests |
| S2a `lib/operator/authz.js` (permission model used by personal-account access checks) | **merged described scope; not deployed** | 21 unit tests: default closed, deny>allow, house separation, grant ceiling, last owner, no self-escalation, per-operation approval, "publish directly" ≠ "may approve" |
| S2b migration 34 + account store + personal login + owner bootstrap + session gate (switched off by default) | **merged described scope; not deployed** | see docs/OPERATOR_ACCOUNTS.md |
| S2e permissions enforced on every action, page, reader, menu | **merged described scope; not deployed** | `tests/panel-permissions.test.mjs`, `tests/access.test.mjs`, `tests/e2e/accounts-permissions.e2e.mjs` |
| S2c people screen (create / change / disable / temporary password / end sessions), both panels | **merged described scope; not deployed** | `tests/user-actions-core.test.mjs`, `tests/e2e/accounts-people.e2e.mjs` |
| S2f approval queue (migration 35, products create/edit/publish/archive/delete) + S2g activity log v2 (people, results, before/after, filters, CSV, append-only) | **merged described scope; not deployed** | `tests/approvals.test.mjs`, `tests/audit-view.test.mjs`, `tests/operator-change-requests-migration.test.mjs`, `tests/e2e/accounts-approvals.e2e.mjs` |
| S3 buttons hidden per permission (capabilities provider; products, requests, categories, brands) | **merged described scope; not deployed** | `tests/capabilities-wiring.test.mjs`, `tests/access.test.mjs`, `tests/e2e/accounts-permissions.e2e.mjs` |
| S4a warehouse core: migration 36 (generated, both houses), store, actions, approval of adjustments, check-rls, leak tests; screens are tracked separately in S4b | **merged described scope; not deployed** | `tests/warehouse-migration.test.mjs` (PostgreSQL 16), `tests/warehouse-core.test.mjs`, `tests/warehouse-no-leak.test.mjs` |
| S4b warehouse screens (stock, movements, reservations, warehouses; both panels), SKU lookup, e2e + mobile | **merged described scope; not deployed** | `tests/e2e/warehouse.e2e.mjs`, `tests/e2e/mobile.e2e.mjs` |
| S5e quote follow-up date, today/overdue, real assignee, customer file (by phone), Telegram retry, report + CSV (migration 37) | **merged described scope; not deployed** | `tests/quote-followup.test.mjs`, `tests/quote-followup-migration.test.mjs` (PostgreSQL 16), `tests/e2e/quote-followup.e2e.mjs` |
| S5c product optimistic lock + conflict banner (draft kept), change history, revert (migration 38), "view on site" | **merged described scope; not deployed** | `tests/product-versions.test.mjs`, `tests/product-versions-migration.test.mjs` (PostgreSQL 16), `tests/e2e/product-history.e2e.mjs` |
| S5d image library: list + where used, upload, remove unused (approval-aware), both houses | **merged described scope; not deployed** | `tests/media-library.test.mjs`, `tests/e2e/media-library.e2e.mjs` |
| S6a scheduled publishing of products (publish_at / unpublish_at, form fields, rights, cron route, history; migration 39) | **merged described scope; not deployed** | `tests/scheduled-publishing*.test.mjs`, `tests/e2e/scheduled-publishing.e2e.mjs` |
| S6b quick search (/ or Ctrl+K) across products, requests, categories, brands, people — permission-aware, both panels | **merged described scope; not deployed** | `tests/panel-search.test.mjs`, `tests/e2e/panel-search.e2e.mjs` |
| S5f translation status: automatic vs human texts, translate never overwrites a human text (migration 40) | **merged described scope; not deployed** | `tests/translation-meta*.test.mjs`, `tests/e2e/translation-status.e2e.mjs` |
| S6c release runbook for the whole panel platform (migrations 30–42, env, cron, post-checks, rollback, monitoring, restore drill) | **merged documentation**; real restore/monitoring proof pending | – (documentation) |
| S4c warehouse stock counts (snapshot, type, close → idempotent adjustments, approval), minimum levels + low-stock filter, CSV reports (migration 41) | **merged described scope; not deployed** | `tests/warehouse-counts*.test.mjs` (PostgreSQL 16 for the migration), `tests/e2e/warehouse-counts.e2e.mjs` |
| S6a site content: announcement banner and FAQ per house, edited in the panel (rights per field, schedule, optimistic lock), shown on the public pages (migration 42) | **merged described scope; not deployed** | `tests/site-content*.test.mjs` (PostgreSQL 16 for the migration), `tests/e2e/site-content.e2e.mjs` |
| S5a (bounded version — **superseded by N1 / PR "server-side paging"**, see section 7 and `PANEL_LIST_PAGING.md`): the product and quote lists of both panels load at most 2000 / 1500 rows (newest first) instead of everything, and say so when they reach the bound (the quick search at the top searches the whole catalogue on the server). **Full server-side paging / filtering is not built** — the lists still filter and sort in the browser | **merged described scope; not deployed** | `tests/list-limits.test.mjs` |
| S5b (as built): inside the live preview of both product forms, a per-language view of what a visitor sees (the public product page's own fallback to English is shown as a badge; Tajik first) and a checklist of what the product page still lacks (image, SKU, category, names, descriptions, specs). It only points at gaps and **never blocks a save**; no public route was touched (a preview of a draft on the real public page, and blocking publish rules, are **not built** — they need a decision on which gaps may block) | **merged described scope; not deployed** | `tests/preview-view.test.mjs`, `tests/e2e/product-preview.e2e.mjs` |
| S6b: the quick search is built (branch `feat/panel-search`); **personal settings and pinned shortcuts are not built** — language and light/dark mode already exist per person, pinned shortcuts / a start page need a per-person preferences column and are deferred | **partial**: search merged; preferences/shortcuts not built | |

## 7. Phase 5 — the remaining requests (started 2026-10-28, after the independent acceptance)

One PR per item, each on top of the previous one (merge in this order; **a merge deploys nothing and no migration or setting has been applied to any server**). States: **complete** = built, tested, documented, CI green on the final commit; **partial** = built with a named gap; **needs real owner confirmation** = code done, the proof needs something only the owner can do (server, native speaker, real delivery); **not started**.

| N | Request | State | PR | Migration | Document |
| --- | --- | --- | --- | --- | --- |
| 1 | Real server-side paging of every list that was capped | **complete** (PR 228; needs migration 43 only for the incomplete-filter and the cross-page customer file) | [#228](https://github.com/kingiust2002/medoria-web/pull/228) | 43 | `PANEL_LIST_PAGING.md` |
| 2 | Approval path: every "needs approval" operation files a real, executable request; stale / revoked / self-approval refused | **complete** for the listed operations (bulk edit/import, content and documents under approval are items 12 / 11 / 8 and are not offered until then) | – | – | `PANEL_APPROVAL_PATH.md` |
| 3 | Product variants (own SKU, variable specs, link to the parent) | **complete in code and tests** (needs migration 44 to be applied before the section appears; Tajik / English texts need a human read) | [#230](https://github.com/kingiust2002/medoria-web/pull/230) | 44 | `PANEL_VARIANTS.md` |
| 4 | Warehouse: lots, expiry, quarantine, low-stock / expiry alerts | **complete in code and tests** (alerts are on screen only — Telegram / e-mail delivery is not built; counts stay per product; migration 45 must be applied before batches appear) | [#231](https://github.com/kingiust2002/medoria-web/pull/231) | 45 | `PANEL_WAREHOUSE_LOTS.md` |
| 5 | Full private preview of a draft on the real public layout | **complete in code and tests** (drafts live in the app's memory for 30 minutes — a restart empties them; unsaved variants / not-yet-uploaded images are not part of a draft; Tajik / English texts need a human read) | [#232](https://github.com/kingiust2002/medoria-web/pull/232) | none | `PANEL_DRAFT_PREVIEW.md` |
| 6 | Publish quality rules chosen by the main manager (one rule for direct, approved, scheduled, bulk and import publishing) | **complete in code and tests** (the rule starts EMPTY — which gaps block is the owner's choice; migration 46 must be applied before the rule can be saved; already-live products are judged only when edited; Tajik / English texts need a human read) | [#233](https://github.com/kingiust2002/medoria-web/pull/233) | 46 | `PANEL_PUBLISH_RULES.md` |
| 7 | Category / brand images in both panels, crop and focus point, safe media deletion | **complete in code and tests** (migration 47 holds the focus point — without it the rest works; existing stored pictures are not re-processed; product pictures get the safe upload path but no crop dialog; Tajik / English texts need a human read) | [#234](https://github.com/kingiust2002/medoria-web/pull/234) | 47 | `PANEL_CATEGORY_IMAGES.md` |
| 8 | Product documents (brochure, datasheet, certificate) | **complete in code and tests** (migration 48 must be applied first; the PDF scan is a heuristic, not a virus scanner; documents belong to the parent product; no "ask again" for a stale document approval; public labels need a human read) | [#235](https://github.com/kingiust2002/medoria-web/pull/235) | 48 | `PANEL_PRODUCT_DOCUMENTS.md` |
| 9 | Saved table views and bulk-selection scope ("this page" / "all filtered results") | **complete in code and tests** (migration 49 must be applied for saved views; the bulk scope needs no migration; views are personal, not shared; ceiling 2,000 rows; request deletion stays page-only) | [#236](https://github.com/kingiust2002/medoria-web/pull/236) | 49 | `PANEL_SAVED_VIEWS_BULK_SCOPE.md`
| 10 | Personal settings and shortcuts | **partial by design**: start page after sign-in and up to six pinned shortcuts per person and house are complete in code and tests (migration 50 must be applied first); a default page size, dashboard layout, keyboard-shortcut customisation and server-side language/theme are NOT built | [#237](https://github.com/kingiust2002/medoria-web/pull/237) | 50 | `PANEL_PERSONAL_SETTINGS.md`
| 11 | Editable contact details and featured content | not started | – | – | – |
| 12 | Import and bulk operations under the same rules | not started | – | – | – |
| 13 | Backup / monitoring status in the panel, restore-test tooling | not started | – | – | – |
