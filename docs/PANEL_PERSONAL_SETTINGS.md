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

## Round 3: the rest of the personal settings that can be built without a decision (migration 56, not applied)
**Status of request 10 after this round: PARTIAL, honestly.** Built and tested: start page, pinned shortcuts (N10), **rows per page** of the product and request lists, and **the dashboard blocks** each person shows, in their order. Still not built, and why (see "Owner decisions" below).

### Rows per page (per person, per house, per list)
* Choose 25 (the standard), 50 or 100 for the product list and for the request list on the settings page. Stored on the person's own preferences row (`page_size_products`, `page_size_quotes`; the standard is stored as "nothing chosen").
* The address stays the whole state of a list: **a size in the address always wins**; when the address names none, the person's size is used. The hrefs of the list leave the size out only when it equals the person's own default, so choosing the standard 25 explicitly still works when 50 is saved (`lib/operator/listSize.js`, `listQuery.js` `overrides`). Another person, the other house and the other list keep the standard.

### Dashboard blocks
* Four blocks — overview statistics, quick actions, recent requests, recently updated products — each can be shown or hidden and ordered (at least one stays). The two list cards sit side by side when they follow each other. A block the person has no right to see (requests, products) stays hidden whatever is stored; the default dashboard is exactly what it always was (`lib/operator/dashboardBlocks.js`).

### Migration 56 (additive on 50)
Three nullable columns on `operator_preferences`; the database checks the three sizes and the four block names (1–4, no repeats); the table stays private. Until it is applied the card says so, saves nothing of these, and the start page and shortcuts keep working (the reader falls back to the older columns). Rollback: drop the three columns and the guard function (header of the file).

### Owner decisions — NOT built on purpose
1. **Keyboard shortcut customisation.** There are no keyboard shortcuts in the panel today (only the pinned links). Defining which keys exist, whether they may clash with the browser and screen readers, and their languages is a design decision, not a preference; nothing was invented. Proposal if wanted: a small, fixed, documented set (search focus, "go to" the pinned shortcuts 1–6) with an on/off switch only.
2. **Language and light/dark mode kept on the server per person.** Today both are kept by the browser (language in a cookie shared by both panels, mode in the browser) so they follow the device, not the account. Saving them per account needs a rule for which wins when the two disagree (a shared computer, a phone and a desk) and a first-visit flash decision; proposal: keep the device choice and only use the account value on a device that has none. Needs the owner's yes; touches every page's first render.
3. Per-list *column* choice is a separate feature (N9, "my columns").

### Tests
`tests/preferences-extras.test.mjs` (6), `tests/preferences-extras-migration.test.mjs` (5, real PostgreSQL), e2e `accounts-personal-extras` (3: sizes saved and used, the explicit size still wins, another person/house unaffected; dashboard hide/reorder; 320 px). The older `personal-preferences.test.mjs` expectations gained the new empty fields; nothing was weakened.
