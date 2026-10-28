# End-to-end tests (browser)

Real Chromium against a production build of the app, with a **fake database** that keeps
rows in memory. They prove what unit tests cannot: that a change made in the operator panel
shows up (or disappears) on the public site, that the panels are closed without a login, and
that every page fits on phone screens.

```bash
npm run test:e2e                     # builds into .next-e2e (about 2 minutes), then runs everything
E2E_FILES=security,panel-flows npm run test:e2e   # only the files whose name starts with one of these
E2E_SKIP_BUILD=1 npm run test:e2e    # reuse the last e2e build
```

Every test file runs against its own start of the app: the app keeps its login throttles in memory, so files sharing one process would use up each other's allowance and fail with HTTP 429.

Needs Playwright's Chromium (`npx playwright install chromium`; pre-installed in the Claude Code
cloud sandbox). Nothing touches production: the app's Supabase URL is `127.0.0.1`, the keys are
dummy values and the operator passwords are generated per run.

**In CI.** `.github/workflows/self-hosting-ci.yml` runs this suite as its own job (`browser-flows`: Node 22, `npx playwright install --with-deps chromium`, `npm run test:e2e`) on every pull request that touches `app/`, `components/`, `lib/`, `migrations/`, `tests/`, `scripts/`, `middleware.js`, the build/config files or `deploy/`. It uses no secrets and never reaches a real database. A red browser job blocks a merge the same way a red `validate` job does.

## What is in it

| File | What it proves |
| --- | --- |
| `tests/e2e/panel-flows.e2e.mjs` | Panels closed to anonymous visitors; wrong/right password; **price change in the panel appears on the public product page**; **archive → real 404 in four languages and out of the sitemap → reactivate → page back**; Quotes screen (tabs, tick selection, bulk archive/restore/delete, single delete); customer-request tables only reached with the service key; a Health session does not open the Beauty panel and the reverse |
| `tests/e2e/mobile.e2e.mjs` | At 320 / 360 / 390 / 430 / 768 / 820 / 1024 / 1180 / 1280 / 1366 px: no sideways scroll on public pages (Health and Beauty, LTR and RTL), header menus / language menu / search open and stay on screen, both panels (pages, drawer, Quotes with bulk bar and dialogs) |
| `tests/e2e/catalog-search.e2e.mjs` | Server-side catalog paging (docs/CATALOG_PAGING.md): the Health catalog fetches pages of 24 (never the whole table) and "load more" appends without repeats; search is answered by the database; the ⌘K palette asks for 6 matches; the Beauty catalog pages with plain links, works without JavaScript, sends a page past the end back to page 1; the pagers fit 320 px |
| `tests/e2e/inquiry-list.e2e.mjs` | Inquiry list (docs/INQUIRY_LIST.md): two products added from the catalog → header count → quantities → ONE stored request with database names/SKUs and a messenger link carrying the whole list; tampered localStorage (archived/unknown ids) is cleaned, and the rows that are still valid never blink out while it is cleaned (DOM timeline); the panel shows the list; 320 px fit with a 140-character unbroken name; Health-only storage key, page noindex |
| `tests/e2e/print-catalog.e2e.mjs` | Printable catalog (docs/CATALOG_DOCUMENTS_NEEDS.md): active products only, in the page language, no placeholder data; `?category=`; print mode hides the site chrome; a real multi-page PDF in fa/ru/tg/en; 320 px fit; the panel's incomplete-product filter, badge and dashboard count |
| `tests/e2e/security.e2e.mjs` | Two-step login (Beauty on, Health off): wrong password / wrong code / right code / replay / recovery codes; logout ends the session on the server (a copied cookie stops working); cookies from before the registry or for an unknown session are refused; ending other/all sessions; the activity log records actions and never customer data; a deletion is refused while the log cannot be written |
| `tests/e2e/security-fail-closed.e2e.mjs` | Both panels: a database or schema-cache outage never opens a signed session, login or deletion; a table that really does not exist yet keeps the previous behaviour; a failed logout keeps the cookie, shows an alert, and a retry works |
| `tests/e2e/quote-management.e2e.mjs`, `quotes-reliability.e2e.mjs` | Customer-request management (code, assignee, waiting/overdue markers, filters); the Quotes list follows rows changed by another session without losing local edits; the delete dialogs stay reachable at 320×568 |
| `tests/e2e/check-mobile.e2e.mjs` | `npm run check:mobile` itself: a 404 page, a fixed over-wide control and an unreachable button are all reported |
| `tests/e2e/product-delete.e2e.mjs` | Permanent delete of an archived product in both panels: only archived rows have the button, the SKU must be typed, the product leaves the panel and the public site, the activity log records it, customer requests keep the product name; a re-activated product and a failing log both refuse the delete; the dialog is reachable at 320×568 |
| `tests/e2e/panel-i18n.e2e.mjs` | The panels in three languages: every page of both panels in Tajik and English at 320 px has no Persian text left, the right `dir`/`lang`, nothing past the screen edge; Persian stays the default; the FA/TG/EN switch changes, remembers and mirrors the sidebar; an unknown language cookie means Persian; the login pages and the chooser follow the language |
| `tests/e2e/live-check.e2e.mjs` | The owner-run live script below works against the local stack |
| `tests/e2e/list-paging.e2e.mjs` | Server-side paging (docs/PANEL_LIST_PAGING.md): 2,600 products / 1,300 requests (more than the old caps and the API's 1,000-row limit): exact totals, the last page by address, a page past the end, deep search, a filter combination equal to the rule computed over the whole table, the address carries the state, the list works with JavaScript off, Beauty has its own lists (brand link pre-fills the search), a failed read says so instead of showing an empty catalogue, the pager and filters fit 320 px |
| `tests/e2e/product-variants.e2e.mjs` | Product variants (docs/PANEL_VARIANTS.md), both houses: variants added on the product's edit page; the panel list shows products with a variant count (a search also finds a variant by SKU, its edit address opens the product); the public page offers the choice and SKU / price follow it, JSON-LD `ProductGroup`; a variant is no page, catalogue row or sitemap entry; duplicate SKU / same options refused in words; archive then delete by typing the SKU; 320 px with a long unbroken option |
| `tests/e2e/warehouse-lots.e2e.mjs` | Warehouse batches, expiry and quarantine (docs/PANEL_WAREHOUSE_LOTS.md), both houses: receive into batches and into quarantine, usable vs unusable on the stock list, the refusal that names the usable quantity, a quarantined batch that cannot be chosen, release with a reason + history, an expiry date corrected so that stock expires, write-off through the batch, the alert strip and its links, Beauty separate, 320 px with a long unbroken code |
| `tests/e2e/product-preview-private.e2e.mjs` | Private preview of a product on the real public page (docs/PANEL_DRAFT_PREVIEW.md), both houses: a stranger gets a plain 404 with noindex / no-store; an inactive product shows the typed unsaved values in the real layout and stays unchanged and non-public; the token is bound to the session; no view / request is recorded; a new product previews and creates nothing; (`accounts-product-preview.e2e.mjs`: an approval request's proposal can be previewed, another house's request / another product's request is a 404); Health and Beauty sessions are strangers on each other's previews; robots.txt / sitemap; 320 px with a long unbroken name |
| `tests/e2e/fakeDb.mjs`, `seed.mjs` | The fake PostgREST (the full filter grammar incl. `and(…)`/`or(…)`/`not.in`, the computed `gap_count` and generated `phone_key` columns of migration 43, order, single-object responses, a silent 1,000-row limit per request like the real API, insert/update/delete, rpc, and migration 44's hidden variants and public variant functions) and invented demo rows |

The fake database deliberately does **not** emulate row-level security: the application's own
filters (`is_active`, ...) are what these tests must prove. RLS itself is covered by migrations 27/28
and `npm run check:rls` against the real database.

**Emulated, not a real phone.** The mobile tests use a phone-sized Chromium (touch, 2x pixel ratio).
They prove layout and behaviour at these widths, not Safari or Android-browser specifics. Look at the
site on a real phone after each deploy.

A negative control was run when these tests were written: with the cache purge in
`lib/health/revalidate.js` disabled, the price and archive tests fail with a timeout; restored, they pass.

## Checking the live site (needs you)

Read-only checks of the live site need nothing from you (the archived product answering 404, sitemap,
mobile layout via `npm run check:mobile -- https://medoriaco.com`). **Changing data on the live site
needs the panel login and a test product**, so it is a script you run yourself:

1. In the Health panel create a test product, for example name `ZZ TEST (delete me)`, with a fixed
   price (not "request price"), and leave it active. Note its slug (the address of its public page).
2. On your Windows PC (PowerShell), in the project folder, once: `npm ci`.
3. Run (the password is typed at a hidden prompt; it is never printed or saved):

   ```powershell
   $env:LIVE_BASE="https://medoriaco.com"; $env:LIVE_SLUG="zz-test-product"; $env:LIVE_NAME="ZZ TEST (delete me)"; $env:LIVE_USER="<panel user name>"
   node scripts/e2e/live-panel-check.mjs
   ```

4. Expected: five `✓ PASS` lines (login, price change visible on the public page, archive → 404 and out of the
   sitemap, reactivate → page back, price restored). The script restores the price and the active state itself,
   even if a step fails. Afterwards archive the test product (or leave it archived) so the public never sees it.

The panel has no "delete product" button, so the test product stays (archived) unless you delete its row in
Studio.
