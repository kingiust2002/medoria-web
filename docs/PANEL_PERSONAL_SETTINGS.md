# Personal settings: start page and pinned shortcuts (N10)

**Status: partial by design — what is built is complete in code and tests for both houses; what is NOT built is listed in "Stated limits". Migration 50 is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere; until it is applied the card says so and the panel shows no shortcuts. Not deployed. Tajik / English texts are machine-prepared and need a human read.**

## What exists

On **Settings** of each panel a card **"My start page and shortcuts"**:

* **Start page after sign-in** — one of the pages the person can open (default: the dashboard). A sign-in through the login form goes to `…/operator?start=1`; the dashboard then redirects to the chosen page. The menu's **Dashboard** link never redirects, so the dashboard stays reachable. The login flow itself (`loginFlow.js`) is untouched.
* **Pinned shortcuts** — up to **6** screens, shown under the menu (desktop sidebar and phone menu). Besides the menu pages, "Add product" can be pinned.

Per **person and house** (Health and Beauty have their own lists). Language and light/dark mode are **not** moved: they stay in the browser as before.

| Rule | How |
| --- | --- |
| Only addresses the person **can open now** are offered and accepted; the browser sends addresses only, never who it is — the person comes from the verified session | `lib/operator/navAccess.js` (ONE list: menu, start page and shortcuts all ask it), `preferences.js`, `preferencesCore.js` |
| A right taken away later **drops the pin when reading**; a start page the person can no longer open is ignored (no "no access" landing) | `effectivePreferences` |
| The shared legacy login has no person, so it keeps nothing; the card says so | `needsAccount` |
| Other house's addresses, query strings, other hosts, repeats and a 7th shortcut are refused in the application **and** by the database | `cleanPreferences`, migration 50 trigger |
| No right beyond being signed in is needed: a preference only chooses among pages already openable and changes no data of the house | — |

## Migration 50

`migrations/50_operator_preferences.sql`: private table `operator_preferences` (`user_id` → `operator_users` ON DELETE CASCADE, `house`, `start_page`, `shortcuts[]`, `updated_at`; primary key `(user_id, house)`), a guard trigger that checks every address against the house's own path shape (`^/operator(/[a-z]+){0,2}$` / `^/beauty/operator…`), refuses repeats, fixes owner and house, and stamps `updated_at`; RLS on with no policy, nothing for `anon` / `authenticated`, `service_role` may select / insert / update but **not delete**. **Needs 34.** One transaction, idempotent, self-checking. **Rollback** (only after the deployed code no longer uses it): the DROP statements in the file header. `scripts/check-rls.mjs` asserts the table is denied to anon.

## Tests

* `tests/personal-preferences.test.mjs` (7): what each role can choose per house; the menu list equals both shells' entries (and the layouts are wired to it); cleaning and every refusal; stale rights; save/read as own row per person and house; shared login, failing database, missing table; wiring (settings card, shortcuts in both menus, start page after login, login flow untouched, actions take the session first).
* `tests/operator-preferences-migration.test.mjs` (5, real PostgreSQL): needs 34, idempotent, private, one row per person/house, address shapes per house, six at most, no delete, owner/house fixed, cascade.
* e2e `accounts-personal-settings` (3): choose start page and pins → the pins show → a fresh sign-in through the real form lands on the start page → the Dashboard link still opens the dashboard; a warehouse person is not offered Users and a stale pin is not shown; Beauty keeps its own list; 320 px for the card and the phone menu. (It also caught a leftover variable in Beauty's layout during development.)

## Stated limits

* **Not built:** a default page size per person, a per-person landing "widget" layout on the dashboard, keyboard-shortcut customisation, and storing language / theme on the server (they stay per browser).
* A pin is a page address, not a saved list view: "my out-of-stock products" as a shortcut would be a follow-up that reuses N9's views.
* Migration 50 is unapplied. Tajik / English texts need a human read.
