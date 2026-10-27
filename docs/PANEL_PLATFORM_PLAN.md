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

## 6. Status (update with every PR)

| PR | State | Evidence |
| --- | --- | --- |
| #203 session guard on pages/readers | **merged** (not deployed) | CI green, 3 browser tests red→green |
| #204 product delete | open; **S1a done inside it** (attempt entry first, missing log table = refusal, separate outcome entry; 6 unit tests red→green, 1 new e2e) | CI green (validate, browser-flows) |
| #207 S1b: same rule for quote / category / brand deletes | open, stacked on #204; **needs migration 30 applied before deploy** | 294 unit, full browser suite green |
| #206 three-language panel | open | 297 unit, 120 browser tests |
| S2a `lib/operator/authz.js` (pure; nothing calls it yet, so no behaviour change) | in this PR | 21 unit tests: default closed, deny>allow, house separation, grant ceiling, last owner, no self-escalation, per-operation approval, "publish directly" ≠ "may approve" |
| S2b migration 34 + account store + personal login + owner bootstrap + session gate (switched off by default) | in PR (stacked on #206/#207/#208) | see docs/OPERATOR_ACCOUNTS.md |
| S2c … S6c | not started | |
