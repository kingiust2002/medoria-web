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

## What does NOT exist yet (do not switch the flag on before these ship)

* No screen for one's own password / two-step login setup (S2d): a person created with "two-step required" is refused at login until
  S2d lets them set it up (so create people with the requirement off, or set the seed by the owner, until then); no approval queue
  (S2f); no audit viewer by person (S2g).
  **`OPERATOR_USERS=on` must not be set until S2d is deployed** (a temporary password has to be changed by its owner).
* The buttons are not yet hidden per permission inside the pages (a refused click shows the refusal); polishing that is stage 3.

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
2. Apply migration 30 (if not yet) and **34** (one transaction, self-checking, additive).
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
