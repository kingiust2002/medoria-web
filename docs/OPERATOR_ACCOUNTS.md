# Personal accounts for the operator panels

Status (2026-11-03): **personal accounts are enabled in production** (`OPERATOR_USERS=on`, owner-reported — docs/PANEL_RELEASE_RUNBOOK.md §10); the
code still keeps the flag: with it off the panels fall back to the old single env login. This page also covers the user-management
round of 2026-11-03: archive and restore of people, the manager's re-authentication, a reliable history for sensitive changes and safe
recovery of a lost second factor (sections below, **migration 57**). The staged plan is `docs/PANEL_PLATFORM_PLAN.md`.

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

* **Create**: username, display name, role, houses, "two-step sign-in required" and the **access editor** (tick-boxes, see "The access editor" below;
  the typed patterns of the first version are gone from the screen, the server still accepts them). The server generates a **20-character temporary password**, shows it **once** and stores
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
  can **resubmit** it against the current record. A permanent delete re-checks "archived" and the typed SKU at that moment **and applies only to the product version the reviewer was shown** (`base_updated_at`): the version is compared when the request runs AND repeated inside the delete statement, so a product edited after the request — even one that is still archived with the same SKU — is never removed (the request fails as stale, nothing is written to the history); a request without a basis version deletes nothing (review R8).
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

## Screens offer only what the person may do (S3)

The panel layouts hand the person's **capabilities** (`capabilitiesOf` → every operation `direct | approval | denied`, computed with the
same `decide()` the server uses) to a client provider (`components/panel/Capabilities.jsx`, `useCan` / `useMode`). Products list and form,
requests, the Health category tree, the Beauty category tree and brands render **only the controls the person may use**:

* product list: add / import / bulk add, row selection and the bulk bar (per action), inline price, stock and featured toggles, duplicate,
  archive / activate, permanent delete; the form is **read-only** (`fieldset disabled`, no save button, a note) for a person who can change
  nothing, the price / stock / active switches are disabled when their own right is missing, a person who may not publish creates drafts
  only, and a person whose edits go through approval sees "Send for approval" and a note;
* requests: status select, archive / spam / restore, assign, notes (read-only text when not allowed), delete (row and bulk), row selection;
* categories and brands: add, edit, archive switch / branch switch, delete.

This is **convenience, not security**: every action still asks the server at the moment of use, a stale screen can do nothing the server
refuses, and without a provider (tests, a page outside the layout) nothing is hidden. Pinned by `tests/capabilities-wiring.test.mjs`
(unknown operation names would hide a button forever), `tests/access.test.mjs` (`capabilitiesOf` = `decide`), and
`tests/e2e/accounts-permissions.e2e.mjs` (the rendered HTML of a viewer, a product manager and a request manager).

## Delegation ceilings and the second-factor policy (independent review R1, R2, R3, R4, R5)

* **Execution modes are a ceiling** (`authz.modesAboveActor`): a non-owner who manages accounts can never create or change an account so that it executes
  something **more directly** than they do themselves (denied < needs approval < direct). A manager whose price change needs approval cannot make an account
  that changes prices directly — by role, by custom `allow`, or by emptying the approval list. Both houses; new accounts and updates. Only an owner sets any policy.
* **A target above the actor is not theirs to manage** (`authz.targetWithinActor`): for any change to an existing account — status, role, **password
  reset, ending sessions** — a non-owner must hold every permission and every execution mode the target has. A viewer with `users.manage` cannot reset a
  `house_admin` and take the account over. Owners manage everybody (never the last owner away).
* **The second-factor requirement is a security policy**: nobody changes their own; only an owner relaxes anybody's (a manager may still tighten it);
  any change ends the person's sessions so they sign in again under the new rule.
* **The second-factor state is read from the real columns** (`accounts.READ_COLUMNS`): a person with a configured seed is reported as having one
  (a required-2FA person was restricted again after login because the projection omitted the seed column). `rowToUser` computes
  `hasTotp` / `recoveryLeft` and **never copies the seed, the hashes or the password hash** into the object that leaves the module (tests pin this).
* **A recovery code works once, also under concurrency**: consumption is a compare-and-swap on the complete list the request read (the stored list must
  contain every hash it read and nothing else); the loser re-reads and decides on the latest list, so a spent code can never be restored by a stale writer.
  Proved on real PostgreSQL with two overlapping sessions (`tests/operator-users-migration.test.mjs`).

## Known limits (re-checked 2026-11-03)

* "Needs approval" is offered **only** for the operations in `authz.APPROVABLE_OPERATIONS` (a filing action, a reviewer and an executor exist in both houses; `tests/approval-registry.test.mjs`). Any other operation has no approval mode: an account change that asks for one is refused, and an old stored entry is treated as closed.
* (Older note — verify against docs/PANEL_RELEASE_RUNBOOK.md §6 before relying on it.) Screens that are not wired to the capabilities yet (they still show a button and answer with the refusal on click): the media uploader, the import / bulk-entry wizards (their *pages* are closed to people without the right), the legacy list views, and the brand product roster's inner controls.
* The owner has not yet confirmed, live: a limited user with two-step login and a recovery code; the archive buttons below (migration 57 is not applied yet).

## Archive and restore of people (migration 57)

Three different ways to take somebody out — the screen shows the difference next to the buttons:

| | Sign-in and work | Sessions | Account and name | Way back |
| --- | --- | --- | --- | --- |
| **Archive** (left the team) | closed | all ended at once | kept (id, username, name in the history, warehouse, approvals, requests); the username is **never given to somebody else** | "Restore from archive" |
| **Blocked** (suspected misuse) | closed | ended | kept, visible with a warning | change the status |
| **Disabled** (leave, assignment) | closed | ended | kept | change the status |

* **Archive** (`archivePerson`): needs `users.manage`, the manager's password again, and writes the history (below). Refused for yourself, for the last
  active owner (also when two owners are archived at the same moment — the database serialises it under a row lock, proved on real PostgreSQL),
  for an owner unless the manager is an owner, and for anybody above the manager's own authority. The database ends the person's sessions
  **in the same transaction** and bumps `authz_version`, so even a copied cookie is dead; a trigger on `operator_sessions` also refuses a session
  for an account that is not active (a login that raced the archive cannot leave an open session behind).
* **The list** shows the **current** people by default with filters *current / archived / all* (counts included); an archived card carries the
  badge and the date. An archived account accepts no edit, no password reset, no second archive, nothing but **restore**.
* **Restore** (`restorePerson`): the manager reviews role, houses, extra/forbidden permissions, approval policy and the second-factor requirement
  in the same dialog, proves who they are, and the account becomes active with exactly that. The usual ceiling applies to the new state (no more
  than the manager holds, no owner for a non-owner, no house outside the manager's). **Old sessions never come back** (they were revoked and
  `authz_version` moves again) and the person must choose a new password at the first sign-in (the database forces `must_change_password`).
* **Names stay, with a small "archived" mark**: activity log (actor and target), approvals (requester), customer requests (assignee),
  warehouse movements and product history. Warehouse/history rows keep the name that was written at the time. (Lot events, stock counts and
  reservations keep their text labels without the mark.)
* **Responsibilities** (`responsibilitiesOf`, `transferResponsibilities`): archiving moves nothing by itself. The dialog counts the open customer
  requests (`new / contacted / in_progress / quoted`) assigned to the person in that house; the manager may move them to an active person of
  the same house (needs `quotes.assign`); closed requests keep their history. Archived people are never offered as a new assignee, and typing
  their name as a new assignee is refused too.
* **Pending approvals of an archived requester** are not executed: `approvals.approveRequest` re-reads the requester at the moment of approval
  and supersedes the request unless the account is `active` (test: `tests/approvals.test.mjs`).

## Re-authentication of the manager

These changes require the manager's **own password** (and a **second-factor code** when they have one) — checked on the server for every call,
whatever the screen did (`confirmManager` in `userActionsCore.js`; per-manager rate limit 8 / 15 min; a wrong proof is itself written to the
history as `user.reauth_failed` and changes nothing): creating an account, any change that gives **more power** (`authz.sensitivityOf`: more
permissions, a house added, a stricter approval list relaxed, a status from blocked/disabled to active), changing the second-factor rule,
archive, restore, a temporary password, the owner's second-factor recovery. A change that only takes power away (fewer permissions, blocking,
disabling) and ending sessions do **not** ask again: closing a door must stay easy. A TOTP time step is accepted once, so a code just used for
signing in cannot be reused for the proof within the same 30 seconds.

## A reliable history for sensitive changes

Create, role / houses / permissions / approval policy / second-factor rule, status, archive, restore, password reset and second-factor recovery
use `lib/operator/userAudit.js` — the same rule as permanent deletes: an **attempt** entry is written first and **if it cannot be written the
change is not made** (`auditFailed`, with a plain message); the real **outcome** (`success`, `failure` or `rejected` with a short reason code) follows
as a second entry. If only the outcome entry fails, the change stands, the attempt is on record and the screen says so (`auditWarning`). Entries name the
acting person, the target person and short facts (role, houses, status, field names) — never a password, temporary password, seed, recovery code or hash
(`sanitizeDetail` lets only a fixed list of keys through). A display-name-only edit is not a change of power and is logged as before. Ending someone's
sessions is logged best effort and works while the log is down. Actions: `user.create`, `user.update`, `user.status`, `user.archive`, `user.restore`,
`user.password_reset`, `user.twofa_reset`, `user.responsibilities_transferred`, `user.sessions_ended`, `user.reauth_failed`, `user.emergency_recovery`.

## Safe recovery — somebody lost the phone and the recovery codes

An **owner** (never a manager) can, after re-authentication, use "Recover two-step login" on a person's card (never on themself):
one update removes the seed and every recovery code, requires the second factor again, replaces the password with a new temporary one
(so an old, possibly leaked, password dies too), forces its change, bumps `authz_version` and ends every session. The person signs in with
the temporary password and sees **only the security screen** until they have chosen a new password **and enrolled a new second factor**
(`access.restrictedReason`); nothing is skipped and no code can be guessed in its place. Give the temporary password only after you have
confirmed who is asking. Tests: `tests/user-archive.test.mjs`, `tests/e2e/accounts-people-archive.e2e.mjs`.

## Emergency: an owner lost their own access

The panel cannot help an owner who has lost **their own** password and second factor (a manager cannot touch an owner; an owner cannot do it to
themself). The procedure runs **on the server** and needs only Node, the repository checkout and the database container — not the panel, not
the service-role key.

1. Read the state (no secrets): `node scripts/self-host/owner-recovery.mjs --list | docker exec -i supabase-db psql -U postgres -d postgres`
   — shows each owner's status, whether a second factor is set and how many recovery codes are left.
2. Dry run (changes nothing, prints no SQL): `node scripts/self-host/owner-recovery.mjs --username <owner>`.
3. Apply: `node scripts/self-host/owner-recovery.mjs --username <owner> --apply | docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1`.
   stdout (the SQL, which holds only the **hash**) goes straight into `psql`; the **one-time password appears once on your terminal** (stderr).
   Do not save either. Without Node on the host: `docker run --rm -v "$PWD":/app -w /app node:22.23.1-bookworm-slim node scripts/self-host/owner-recovery.mjs ...`.
4. The SQL is **one transaction**: it writes an *attempt* line to the activity log of both panels (no line → nothing changes), requires exactly one
   **active owner** with that username (a manager, an archived or a disabled account is refused), sets the one-time password, clears the seed and
   all recovery codes, requires the second factor, forces a password change, bumps `authz_version`, ends the sessions, writes the *success* lines
   (`user.emergency_recovery`, method `server_recovery`, no actor — it was done on the server).
5. Sign in with the one-time password, choose a new password, enrol a **new** second factor (and store the new recovery codes). Check
   the activity log shows `user.emergency_recovery` in both panels.
6. If the *only* owner is locked out and also the database user is unavailable, use the backups (`docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md`);
   this script is not a way around them.

Tested on real PostgreSQL (`tests/owner-recovery.test.mjs`): the hash works and the old password does not, seed and codes are gone, sessions are
ended, both log lines exist, a manager / archived / disabled / unknown account is refused with nothing changed, a missing log table rolls everything
back, the username cannot inject SQL. **Not proven live:** a real run against the production database container — the owner should rehearse
it on a restore-drill copy first (`scripts/self-host/restore-drill.sh --keep`).

## The access editor (tick-boxes) — PR 2 of the user-management round, no migration

`components/operator/AccessEditor.jsx` on top of `lib/operator/accessCatalog.js` (pure; the same functions run in the browser, on the server and in the tests).

* **House first, role second, then per person.** Choose Health, Beauty or both (the editor shows one section per chosen house; Beauty additionally has *brands*).
  Choosing a **role** resets the ticks to that role's defaults ("Reset to role defaults" does the same later). A role that gives more than the manager holds is
  shown but disabled ("more than you hold").
* **Groups** — products, categories, brands, images and media, product documents, customer requests (with the customer file), warehouse, site content,
  reports, activity history, approval queue, and users. Every permission of the model has exactly one tick (`uncoveredPermissions()` is empty — a test pins it),
  with plain titles: view, create, edit, **edit price**, archive, delete, publish, export, approve changes, and the house's own words (receive, issue, count, quarantine…).
* **The real effective state.** A tick means "can do it now": role + extra grants − forbidden ones. Each tick says **from role**, **added** or **closed** (the role
  gives it, this person's is unticked). Unticking a role right stores a `deny` (a deny beats the role, even an owner's); ticking something the role lacks stores
  an `allow`; ticks equal to the role store nothing (`listsFromTicks`). A property test proves ticks → lists → effective permissions is the identity for every role and house set.
* **Edit price is a tick of its own** (new permission `<house>.products.price`, operation `products.price`). It is **implied by edit** for every account that exists:
  anybody who could edit a product keeps changing its price until someone closes it, and without the right to edit there is no price right. No stored account loses anything.
* **Direct or needs approval** appears next to a group **only for the operations in `authz.APPROVABLE_OPERATIONS`** (a filing action, a reviewer and an executor exist in
  both houses) and only while the underlying permission is ticked; the ones without an approval path simply have no such choice, and a request that lists one is refused.
* **Before saving** a summary lists the permissions **added** and **removed**, houses, the role change and every operation that moves between *direct* and *needs approval*.
  Nothing is saved until it is confirmed; "Back" returns to the editor. The manager's password is asked for in that step when the change gives more power.
* **A limited manager** sees every tick they cannot hand out disabled **with the reason** ("you do not hold this yourself", "only an owner gives user management"), and *direct*
  is disabled where they themself need approval. This is a convenience: the server enforces it again (below).
* **Open sessions.** Any change of role, houses, permissions or status bumps `authz_version` and ends the person's sessions; a change of the approval list refreshes it.
* **Server enforcement is unchanged and exhaustive** (`authz.checkUserChange`, called by `createUser` / `updateUser` / `restoreUser` and re-run in the core before anything is
  written): delegation ceiling for permissions and for execution modes, only an owner touches an owner or hands out user management, houses a manager is not in, nobody edits
  their own power, the last active owner stays, unsupported approval modes, unknown or oversized lists. The request body is validated as a whole — an unknown permission, a
  list over 200 entries or an approval policy with an unknown house/operation is **refused, never trimmed** into something else. Every action re-checks the operation at the moment of use,
  so a stale screen, a direct URL, a bulk operation, an import or an export is refused the same way (`tests/panel-permissions.test.mjs`, `tests/access.test.mjs`).
* **History.** The attempt and outcome entries of an access change carry short codes of what changed: `perms_added`, `perms_removed` (`health_products_price`), `modes_changed`
  (`health_products_price`) — safe codes only, no free text.

**How the seven acceptance scenarios are proved** — (1)(2) archive and restore: `tests/e2e/accounts-people-archive.e2e.mjs`, `tests/user-archive.test.mjs`, real PostgreSQL;
(3) a Health-only person has no Beauty and the reverse: `tests/e2e/accounts-access-editor.e2e.mjs` D (pages, login, editor sections) and `tests/access.test.mjs`;
(4) removing price/publish/delete/export closes the operation: e2e B (price, from a stale screen and through the editor, session ended), `accounts-permissions.e2e.mjs` (delete, stale screen),
`tests/access-catalog.test.mjs` (the identity of ticks and permissions, publish/delete/export are ordinary ticks of the same mechanism);
(5) needs-approval cannot apply directly and the public data waits: e2e C; (6) tampering: `tests/user-access-tamper.test.mjs` (core level — see the limit below);
(7) three languages, direction and 320 px: e2e F and the archive e2e 8.

**Limits, stated plainly.** Tampering is tested by calling the server-side functions with bodies the screen never sends, not by forging a Next.js server-action HTTP request.
Publish/delete/export closing is proved end to end for *delete* (stale screen) and *price* (stale screen and editor); for publish and export it rests on the shared
mechanism (the same tick → permission → `decide` path, pinned by unit tests), not on a separate browser test each. Nothing here was run on the live site.

## Applying migration 57 — order and rollback

Order: fresh verified backup (local + encrypted R2 PASS) → apply `migrations/57_operator_users_archive.sql` (needs 34; one transaction; idempotent;
self-checking) → deploy the release → try with a throw-away test person (archive, check they cannot sign in, restore). Applying it before the
release is harmless: the previous application ignores the new status and columns. Applying the release **before** 57 only makes the "Archive"
button answer with a failure (the database's status check refuses it); nothing else is affected.

Rollback (header of the migration): restore every archived account first (`UPDATE operator_users SET status = 'disabled' WHERE status = 'archived'`),
then restore the three-value status check, drop the session trigger and function, re-create the migration-34 guard, drop the four columns.
History and links of old records are never touched: ids, usernames and names stay in every table that refers to them.

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

Access editor: `tests/access-catalog.test.mjs` (8), `tests/user-access-tamper.test.mjs` (9), `tests/e2e/accounts-access-editor.e2e.mjs` (6).
Archive / re-authentication / reliable history / recovery: `tests/user-archive.test.mjs` (19), `tests/operator-users-archive-migration.test.mjs`
(real PostgreSQL, incl. overlapping sessions), `tests/owner-recovery.test.mjs` (real PostgreSQL), `tests/e2e/accounts-people-archive.e2e.mjs` (browser, 320 px,
three languages). Earlier:
`tests/authz.test.mjs`, `tests/operator-accounts.test.mjs`, `tests/session-gate.test.mjs`, `tests/operator-passwords-secrets.test.mjs`,
`tests/operator-users-migration.test.mjs` (real PostgreSQL 16), `tests/e2e/accounts.e2e.mjs` (real browser stack, the app started with
the feature on).
