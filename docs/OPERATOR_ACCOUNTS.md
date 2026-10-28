# Personal accounts for the operator panels

Status: **S2b — built, switched off by default.** Nothing here changes behaviour until the owner sets `OPERATOR_USERS=on` on the
server (see "Release order"). The staged plan is `docs/PANEL_PLATFORM_PLAN.md`.

## What exists

* **Migration 34** (`migrations/34_operator_users.sql`, needs migration 30): table `operator_users` (private: RLS on, no policy, service
  role only), `user_id` on `operator_sessions`, and `user_id` / `result` / `request_id` on `operator_audit_log`. Database guards: an
  account is never deleted; the last active owner cannot be disabled, blocked, demoted or lose a house (checked under a row lock, so two
  simultaneous attempts cannot both pass); `version` moves only when an administered field changes (so a login does not make an open edit
  form stale).
* **`lib/operator/authz.js`** — the permission model (pure; see the tests). **`lib/operator/accounts.js`** — the store: login with a
  constant-cost password check and one generic failure, creating and changing accounts *through* `authz.checkUserChange`, optimistic
  locking, ending sessions when power changes, the owner bootstrap, the per-person second factor (a time step and a recovery code each
  work once). **`passwords.js`** (scrypt, same format as the env hash, policy), **`userSecrets.js`** (AES-256-GCM for the two-step seed,
  key `OPERATOR_DATA_KEY`), **`sessionGate.js`** (cookie → person, re-read from the database on every request).
* **Login** (`lib/operator/loginFlow.js`) has three modes, decided per request:
  `legacy` (flag off, or migration 34 not applied) — exactly the old single env account; `bootstrap` (flag on, no active owner yet) —
  the env account, once it has proved itself (password and, if configured, second factor), becomes the **first owner of both houses**,
  keeping its password hash and — if the panel had a second factor — its seed (encrypted; if `OPERATOR_DATA_KEY` is missing the
  bootstrap is **refused**, never done without the second factor); `users` — personal accounts only, the env credentials and old env
  cookies are dead. If the database cannot say which mode applies, login is refused (never the weaker mode).
* **Sessions**: a personal session's cookie carries `uid` and `av` (the account's `authz_version` when it was issued); every request
  re-reads the account: it must be `active`, in *this* house, at the same `av`, and the session must be valid in the registry. Disabling
  or blocking a person, changing role/houses/permissions or resetting the password bumps `authz_version` and revokes the person's
  sessions in both houses, so even a copied cookie stops working (within about 2 seconds, the length of the per-person cache).
* **Audit**: login, failure and bootstrap entries carry `user_id` and `result`; reasons are `password`, `inactive`, `house`,
  `bad_code`, `replay`, `recovery_used`, `seed_unreadable`, `2fa_not_enrolled`. Passwords, seeds and codes are never written.

## Permissions are enforced (S2e)

Every server action, page and data reader asks `lib/operator/access.js` (rules: `authz.js`) **at the moment of use**, from the account
as it is in the database right now (not from the cookie, and not from what the screen showed):

* **Actions**: `authed("<operation>")` / `gate(session, house, operation)` right after the session check, before any database access.
  Fields decide extra operations: a product edit that changes the price also needs `products.price`; one that changes visibility needs
  `products.publish` / `products.archive`; creating a product that is live at once needs `products.publish` (a person who may only
  create drafts must save it inactive); a quick/bulk edit asks for one operation per touched field. A refusal is returned to the
  screen and written to the activity log (`access.denied`, result `rejected`, with the operation and the person).
* **Pages and readers**: `requireHealthSession("products.view")` etc. A person without the permission is sent to a "no access" page
  and the data is never read. The dashboard reads only the blocks (products, requests) the person may see; the menu shows only what
  opens. Personal accounts see only their **own** sessions and end only their own.
* **Default closed**, deny beats allow, houses never mix. "Needs approval" is a **refusal** until the approval queue exists (S2f): nothing
  is half-done.
* The old single env account (`OPERATOR_USERS` off) keeps its full power in its own house, exactly as before.
* Pinned by tests: `tests/panel-permissions.test.mjs` fails if an action, page or reader stops naming what it needs or names an operation
  that does not exist; `tests/access.test.mjs` is the role matrix; `tests/e2e/accounts-permissions.e2e.mjs` proves it end to end,
  including a click from a stale screen after a permission was withdrawn.

## The people screen (S2c) — "کاربران" in both panels

`/operator/users` and `/beauty/operator/users` (permission `users.view` to open, `users.manage` to change). An owner sees everybody;
anybody else sees only people who share a house with them (a person of another house is not even confirmed to exist).

* **Create**: username, display name, role, houses, "two-step sign-in required", advanced (extra and forbidden permissions as typed
  patterns, per-house approval policy). The server generates a **20-character temporary password**, shows it **once** and stores
  only its hash; the person must change it at the first sign-in. Nobody can give a house they are not in, a permission they do not
  hold, or create/touch an owner unless they are an owner (`authz.checkUserChange`, the same function the tests exercise).
* **Change**: role, houses, status (active / disabled / blocked), two-step requirement, permissions, approval policy, display name.
  Guarded by the optimistic `version` (a stale form is refused with "changed in the meantime"). **A change of power ends the
  person's sessions** (`authz_version` + revoked registry rows); a harmless change (display name) does not. Nobody changes his own
  role/houses/permissions/status here, and nobody resets his own password from this page (his own settings do that, with re-auth — S2d).
* **Temporary password** for somebody else and **end sessions**: the same visibility and owner rules.
* Every action writes one line to the activity log: `user.create`, `user.update`, `user.status`, `user.password_reset`,
  `user.sessions_ended`, with the acting person (`user_id`), the person it was done to (`target_user_id`), and the result
  (`success`, `failure`, or `rejected` for a refusal). Passwords never appear anywhere in the log or the database in clear.
* The old shared login cannot manage people (`users.*` need a personal account).

## The approval queue (S2f) — migration 35

Each person's policy lists, per house, the operations that **need approval** (role default, editable on the people screen). When such a
person changes a product, publishes it, or deletes an archived one, the live data is **not touched**: a *change request* is filed
(`operator_change_requests`) with the old and the proposed values of only the fields that change, the version it was prepared against
(`base_updated_at`), and the reason. Supported through the queue today: **create, edit (content / price / stock flag), publish,
archive, permanent delete** of products in both houses. Every other operation that needs approval is still a plain **refusal** with an
honest message (nothing half-done) until its executor exists.

* **Reviewers**: need `<house>.approvals.view` and `<house>.<resource>.approve`; never the requester. "Publish directly" is a different
  right from "approve others" (tested).
* **Approve** = one conditional update claims the request (two reviewers at once: exactly one executes); then the requester's account is
  re-read (active, in the house, still allowed every operation of the change); then the change is applied **only if the record is still the
  version the request was prepared against** — a newer change is never overwritten, the request ends as *failed / stale* and the requester
  can **resubmit** it against the current record. A permanent delete re-checks "archived" and the typed SKU at that moment.
* **Reject** needs a reason (≥ 3 characters), shown to the requester, who can resubmit or **withdraw** a pending request.
* Database guards (migration 35): decided once; the asker is never the decider; "approved" gets `executed_at` once; decided rows are frozen
  and never deleted; an identical pending request cannot be filed twice (a double click is one request).
* Audit: `approval.requested`, `approval.approved` (with `before` / `after` of the change and the request id), `approval.rejected`,
  `approval.cancelled`; the execution of a delete writes the usual attempt + outcome entries naming the reviewer.
* Screens: "تأییدها" in both panels with a pending-count badge for reviewers.

## The activity log v2 (S2g)

`user_id` (who), `target_user_id` (to whom), `result` (`attempt | success | failure | rejected`), `request_id`, and `before` / `after`
(catalogue fields only, short, never customer data — `sanitizeChange`). The page filters by person / result / action / dates, pages by 50,
shows names; **CSV export has its own permission** (`audit.export`), is formula-safe, and the export is itself logged. Migration 35 makes the
log **append-only** (no update, no delete, even for the service role).

## What does NOT exist yet (do not switch the flag on before these ship)

* Approvals exist only for products (see above); categories, brands, media, requests and the warehouse still refuse "needs approval".
* The buttons are not hidden per permission inside the pages (a refused click shows the refusal); polishing that is stage 3.
* Not deployed anywhere: **apply migrations 34 and 35 before the release, and keep `OPERATOR_USERS` empty until the owner is ready**.

## Environment

| Variable | Meaning |
| --- | --- |
| `OPERATOR_USERS` | `on` switches to personal accounts; empty/`off` = old behaviour. |
| `OPERATOR_DATA_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts two-step seeds. **Back it up**: without it stored seeds cannot be read. Required when `OPERATOR_USERS=on` (the preflight checks). |
| `OPERATOR_BOOTSTRAP_USERNAME` | Only if the current `OPERATOR_USERNAME` is not 3–64 lowercase letters/digits/`. _ -`. |

Which panel's env account becomes the first owner? Whichever logs in first after the flag is on, in the panel they log into — so the
owner should be the first to log in. The owner then creates everybody else (S2c); the other panel's old env login stops working
immediately after the bootstrap.

## Release order (once S2c–S2e are merged too)

1. Fresh production backup; local + R2 chain must PASS.
2. Apply migration 30 (if not yet), **34** and **35** (each one transaction, self-checking, additive; 35 makes the activity log append-only).
3. Add `OPERATOR_DATA_KEY` to `deploy/.env` (not printed, not committed); run `node scripts/check-self-host-env.mjs deploy/.env`.
4. Deploy the release with `OPERATOR_USERS` still **empty**; confirm `docker compose ps` and a live curl; log in as before.
5. Set `OPERATOR_USERS=on`, restart the app; the owner logs in first (bootstrap); check the log shows `auth.bootstrap_owner`.
6. Owner creates the other people; each logs in once; check each cannot see the other house.
7. **Rollback**: set `OPERATOR_USERS` empty and restart — the old env login works again (old env sessions were revoked by the
   bootstrap, so people log in once more). The migration is additive; the previous release ignores the new columns/table.

## Tests

`tests/authz.test.mjs`, `tests/operator-accounts.test.mjs`, `tests/session-gate.test.mjs`, `tests/operator-passwords-secrets.test.mjs`,
`tests/operator-users-migration.test.mjs` (real PostgreSQL 16), `tests/e2e/accounts.e2e.mjs` (real browser stack, the app started with
the feature on).
