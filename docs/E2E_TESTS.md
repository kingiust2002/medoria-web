# End-to-end tests (browser)

Real Chromium against a production build of the app, with a **fake database** that keeps
rows in memory. They prove what unit tests cannot: that a change made in the operator panel
shows up (or disappears) on the public site, that the panels are closed without a login, and
that every page fits on phone screens.

```bash
npm run test:e2e                     # builds into .next-e2e (about 2 minutes), then runs everything
E2E_SKIP_BUILD=1 npm run test:e2e    # reuse the last e2e build
```

Needs Playwright's Chromium (`npx playwright install chromium`; pre-installed in the Claude Code
cloud sandbox). Nothing touches production: the app's Supabase URL is `127.0.0.1`, the keys are
dummy values and the operator passwords are generated per run.

## What is in it

| File | What it proves |
| --- | --- |
| `tests/e2e/panel-flows.e2e.mjs` | Panels closed to anonymous visitors; wrong/right password; **price change in the panel appears on the public product page**; **archive → real 404 in four languages and out of the sitemap → reactivate → page back**; Quotes screen (tabs, tick selection, bulk archive/restore/delete, single delete); customer-request tables only reached with the service key; a Health session does not open the Beauty panel and the reverse |
| `tests/e2e/mobile.e2e.mjs` | At 320 / 360 / 390 / 430 / 768 / 820 / 1024 / 1180 / 1280 / 1366 px: no sideways scroll on public pages (Health and Beauty, LTR and RTL), header menus / language menu / search open and stay on screen, both panels (pages, drawer, Quotes with bulk bar and dialogs) |
| `tests/e2e/live-check.e2e.mjs` | The owner-run live script below works against the local stack |
| `tests/e2e/fakeDb.mjs`, `seed.mjs` | The fake PostgREST (filters, order, single-object responses, insert/update/delete, rpc) and invented demo rows |

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
