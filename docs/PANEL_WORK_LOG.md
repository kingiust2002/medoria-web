# Panel platform — author's work log

What was actually done, in order, so the work does not depend on a chat's memory. Status words are literal: **built** (code + tests exist), **not built**
(listed so nobody assumes it), **owner action** (only the owner can do it). The author did not deploy or apply production migrations. The independent reviewer subsequently merged #208–#224 on 2026-10-28; the earlier safe subset was owner-reported deployed at `5ac0592`. The new platform has not been reported deployed. See `PANEL_REVIEW_ACCEPTANCE_2026-10-28.md`. Companion documents: `PANEL_PLATFORM_PLAN.md` (stages and the PR stack),
`PANEL_RELEASE_RUNBOOK.md` (how to release), `PANEL_INDEPENDENT_REVIEW_2026-10-28.md` (the owner's independent review),
`PANEL_REVIEW_RESPONSE_2026-10-28.md` (how its eight findings were fixed and how well each fix is proved).

## Working rules kept throughout

Only PR branches (never `main`); no production, DNS, Caddy, backup or secret was touched or printed; no migration applied; `lint`, unit tests and the
browser suite run before every PR; one browser run at a time (a second run rebuilds the build under the first); pushes are plain fast-forward pushes
(a force push on a shared PR branch was refused by the environment and not worked around — history was extended by merges instead).

## Phase 1 — security base and the three-language panel

* S1a / S1b (#204, #207): permanent delete of an archived product with a typed confirmation; every irreversible action (product, request, category, brand)
  writes an **attempt** first (a missing log table = refusal) and a separate **outcome** entry. Tests that failed before the fix.
* Three-language panel (#206): language module, provider, switcher, direction, a codemod that wrapped ~1700 Persian literals, Tajik and English dictionaries
  (~870 texts), tests that fail on a bare Persian text or a missing translation. **Machine-written Tajik/English: no native review yet (owner action).**

## Phase 2 — accounts, permissions, approvals (all switched off by default: `OPERATOR_USERS`)

* S2a (#208) the pure permission model (`house.resource.action`, roles as presets, default closed, deny beats allow, `direct | approval | denied`).
* S2b (#209, migration 34) personal accounts, login by person with a constant-cost check, owner bootstrap from the env account (keeps its password and,
  if present, its second factor), last-owner protection, sessions re-read per request and ended when power changes. S2e: permissions on every action,
  page, reader and menu.
* S2c / S2d (#210) the people screen (create with a one-time temporary password, change, disable, end sessions), own password / 2FA / recovery codes with
  re-authentication, restricted sessions.
* S2f / S2g (#211, migration 35) approval queue (request, compare, approve/reject with reason, resubmit, stale refusal, execution re-checks the person),
  activity log v2 (person, target, result, before/after, filters, CSV with its own permission, append-only).
* S3 / S4a (#212, migration 36) buttons follow permissions; the internal warehouse core (private per-house tables, append-only idempotent ledger,
  balances changed only by SECURITY DEFINER functions, reservations, reversals), leak tests, `check:rls`.

## Phase 3 — screens and features on top

* S4b (#213) warehouse screens. S5e (#214, migration 37) request follow-up, customer file, Telegram retry, report and CSV. S5c (#215, migration 38) optimistic
  lock, conflict banner with a kept draft, change history, revert as a new change. S5d (#216) image library. S6a (#217, migration 39) scheduled publishing
  and archiving with a token-protected cron route. S6b (#218) quick search. S5f (#219, migration 40) translation status.
* S4c (#220, migration 41) stock counts, minimum levels, CSV reports. Site content (#221, migration 42) banner + FAQ per house with a live-window row policy.
  Daily reminder counts due follow-ups (#222). Bounded product / quote / dashboard lists (#223). Per-language visitor preview and gap checklist (#224).
* Release runbook (S6c), the PR stack in merge order, and the list of what is not built, in `PANEL_PLATFORM_PLAN.md` and `PANEL_RELEASE_RUNBOOK.md`.
* Visual QA with real screenshots was done for the site banner, the FAQ and the content screen (both houses, desktop and phone). Other new screens were covered
  by browser and phone-width tests, not by screenshot review.

## Phase 4 — response to the independent review (2026-10-28)

* The owner's review merged #204, #207, #206 into `main` and held #208–#224 for eight findings (R1–R8).
* For each finding: fixed on the **owning** branch, merged forward through every later branch (and `main` merged into #209 so the stack is tested against it),
  with permanent tests (several on real PostgreSQL with real concurrency). Details, proof levels and behaviour changes: `PANEL_REVIEW_RESPONSE_2026-10-28.md`.
* The in-memory test stand-in used by many tests ignored the SELECT list; that hid R3 and R6. It now returns only the selected columns and can enforce a
  declared schema. Any test that read a column it never selected had to be corrected.
* Added after the review: a generated cross-house permission matrix and static pins for the new action cores' permission checks.

## Mistakes made and caught on the way (so they are not repeated)

* After the review fixes, CI showed #208 failing `main`'s panel-i18n test: its role labels were bare Persian text (the later branches already wrapped them in `tr()`, #208 on its own did not). Fixed on #208 (labels wrapped, Tajik/English added), merged forward through the stack.
* The audit log silently dropped the details of the new stock actions (`DETAIL_KEYS` is an allow-list) — found by self-review, fixed, tested.
* The site-content update read a row before checking the permission (id probing) — fixed before release; the same shape is now pinned for all new cores.
* A regex literal containing raw line-separator characters broke a module; a merge re-introduced an unused translation key and failed the i18n check.
* Two browser runs started at once clobbered the shared build; a `pkill -f` matched my own shell. Neither affected results, both were rerun cleanly.

## Not built / owner decisions (do not read as done)

Variants; real server pagination and filtering; full private draft preview and blocking publish rules; advanced media crop/focus; product documents; lots,
expiry, quarantine and low-stock alerts to e-mail/Telegram; saved table preferences and bulk-selection scope; editing contact details and featured content;
personal settings and shortcuts; a verified backup/monitoring/restore-drill status; native review of Tajik/English texts; chatbot and cosmetic changes are
explicitly out of the current stage.

## Phase 5 — independent re-review and merges (2026-10-28)

The reviewer verified the corrected owning branches, real PostgreSQL CI evidence, eight old probes and the actual SDK's recovery-code PATCH filters. They found an additional R8 microsecond-precision case, added two permanent tests and pushed fix `050da95` on #211 before merging it. Updated #211 CI passed 430 unit/150 browser tests. All #208–#224 were merged, pinned to reviewed heads and explicitly retargeted to main, through application checkpoint `bd9c174`.

The local full browser attempt exposed a stale-server test-harness problem: npx exited but the replacement hit EADDRINUSE, while health from an old server was accepted. The reviewer prepared direct owned-child startup/shutdown and readiness checks; this test-infrastructure follow-up needs its own successful checks before merge. Failed or incomplete local runs are not reported as passing. Proof levels and the in-progress follow-up checks are recorded in the acceptance review.

## Release state

Only the safe subset is owner-reported live at `5ac0592` (see operations §23.12). Platform code is merged; migrations 34–42, personal-account activation, new secrets and cron are NOT reported applied. The owner prefers completing agreed code work before further server work. The not-built list above remains open; no production upgrade follows automatically from these merges. Use corrected main and `PANEL_RELEASE_RUNBOOK.md` for a separately planned rollout.

## Phase 6 — completed review follow-up

PR #226 merged at `7db86c7`: the test harness owns the Next server directly and proves readiness/exit; the real-SDK recovery-code HTTP check is permanent. CI passed 576 unit and 198 browser tests with zero fail/skip; the independent full local Node 22 browser run also passed 198/198. A busy-port negative control was refused without killing the unrelated server. Local full unit results remain explicitly 501 pass / 1 executor failure / 74 skip, not a claimed green local PostgreSQL run. Details and final check links are in `PANEL_REVIEW_ACCEPTANCE_2026-10-28.md`. No platform migration, activation or deployment was performed.

## Phase 5 — the remaining requests (from 2026-10-28, after the independent acceptance)

Each item is its own PR on top of the previous one, from current `main`. Nothing is merged or deployed by the author; no migration is applied anywhere. The status of each item is in `PANEL_PLATFORM_PLAN.md` section 7.

* **N1 server-side paging.** The lists that were capped (products 2,000, requests 1,500, dashboard 5,000, warehouse stock 500, approvals 200/50, CSV 5,000, reads at the API's silent 1,000) now filter, sort, count and page in the database. Details, proof and limits: `PANEL_LIST_PAGING.md`. Along the way the test stand-ins learned the real PostgREST filter grammar and the API's silent row limit, which exposed that the old "read everything" queries (counts per category, stock-count snapshots, exports) had been losing rows beyond 1,000 without an error.
* **N2 approval path.** Found that nobody — not even the owner — could approve a request to delete a file or a customer request (no `approve` permission for media / quotes), that role defaults listed operations that were never routed to approval, and that several screens reported "saved/deleted" for a filed request. Added the registry of approvable operations (people screen offers only those; a stored policy for anything else is read as closed), real filing + executors for deleting categories, brands and customer requests, approval-aware inline edits and duplicate, honest messages and hidden bulk buttons where approval is impossible. `PANEL_APPROVAL_PATH.md`.
* **N3 product variants.** A variant is a product row that points at its parent (migration 44: `variant_of`, `variant_options`, `variant_sort`, a shape CHECK, a one-level guard trigger, the public read policy now hides variants, three SECURITY DEFINER functions for the product page and the inquiry list). Reusing the product row means the warehouse, customer requests, price, images, history and approvals work per variant without a second code path. Panels: a variants section on the product edit page (both houses), lists show products with a variant count (search still finds a variant), import/export/duplicate/delete are variant-aware. Public pages: a picker on the Health and Beauty product pages, `ProductGroup` JSON-LD. Found on the way: a plain function cannot be passed from a server page to a client component (the first e2e run caught it), and `importCore.js` could not be loaded by node tests because of an `@/` import. `PANEL_VARIANTS.md`.
* **N4 warehouse lots, expiry, quarantine.** Designed as a layer on the ledger of migration 36 rather than a rewrite: batches, batch balances, an append-only movement→batch link and a batch history, plus **one guard trigger on the balances** that keeps lot stock covered and keeps quarantined / rejected / expired stock out of every issue, transfer and reservation *by every path* (the older functions of 36 and the count close of 41 included — found while designing: a lot-aware wrapper alone would have left them able to issue quarantined stock). Lot functions call the ledger functions inside their own transaction (atomic, idempotent, reversals restore the same batch). Real-PostgreSQL tests for both houses caught two things on the way: the guard must say "usable: N" before it says "batch stock is protected", and a reversal must apply the ledger's own refusals before touching batch balances. Panel: batches tab, alert strip, usable vs unusable on the stock list, batch fields on the movement dialogs. `PANEL_WAREHOUSE_LOTS.md`.
* **N5 private preview of a draft.** A signed-in person of the house with the right to see products opens the **real public product page** (same components; Beauty's page was split into one shared view so it cannot drift) for a product that is inactive or new and with the form's **unsaved** values; everybody else gets a plain 404. Unsaved values sit in the server's memory for 30 minutes under a token bound to session + house + product; nothing is counted or sent from inside it (view trackers, quote forms, lists are neutralised); the pages are `noindex`, `no-store`, out of robots/sitemap. The approvals screen can preview a pending request's proposal the same way. Found on the way: the preview strip sat in a folder the i18n checker does not scan, so its texts had no Tajik/English until it was moved. `PANEL_DRAFT_PREVIEW.md`.
* **N6 publish quality rules.** The main manager chooses, per house, which of the existing completeness gaps block publishing; ONE function judges every way a product becomes public (form save, list switch, bulk, approved request — at filing **and** again at approval, scheduler, import, version restore). Decisions made while building: a live product keeps its old gaps (only a gap an edit newly creates blocks it); an unreadable rule fails closed for publications only; bulk publishes the complete ones and lists the rest; import saves an incomplete row as an inactive draft instead of losing it; a blocked scheduled product keeps its date and is retried. Found on the way: the audit viewer had no labels for several earlier actions (added), and the first import of the gate left Health's import engine without the import (the undefined-variable test caught it). `PANEL_PUBLISH_RULES.md`.
* **N7 category / brand pictures, crop, focus, upload safety.** Found first that the Health category form had no picture field at all (and the public site showed only icons), so Health got upload + public tiles. Every upload of both houses now goes through one safe path (real type, decodes, no animation, size/pixel limits, re-encoded so GPS / camera metadata is dropped, fail closed); crop happens in the browser (sliders, no dragging); the focus point is two nullable columns (migration 47) with a probe so everything works before it is applied. Found on the way: a CHECK passes on NULL — the first constraint let a half-set focus point through (caught by the real-PostgreSQL test); the e2e rig's fake storage could not serve uploaded files, so pictures were broken in the browser until it kept the bytes. `PANEL_CATEGORY_IMAGES.md`.
