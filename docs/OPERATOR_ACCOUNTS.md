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

## What does NOT exist yet (do not switch the flag on before these ship)

* **Permissions are not enforced on pages and actions yet** (S2e). Until then every signed-in person can do everything the single
  account could. **`OPERATOR_USERS=on` must not be set until S2c–S2e are deployed.**
* No screen to create or edit people (S2c), to change one's own password or set up two-step login (S2d), no approval queue (S2f), no
  audit viewer by person (S2g). A person created by hand with `require_2fa` but no seed is refused at login.

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
