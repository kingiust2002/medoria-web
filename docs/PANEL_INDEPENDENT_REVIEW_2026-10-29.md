# Independent review of the N1–N13 panel stack — 2026-10-29

## Decision and exact scope

The submitted stack is **not ready for wholesale merge or production rollout**.
Initial `main`: `c57313c08726e89ba94adfe6f95e400b2d7fd10d`.
Reviewed submitted tip (#240): `c8cb9c60b46efa6e75892d2f3b24f5cca0877575`.
No production commands, migrations, environment changes, notifications or customer-data reads were performed in this review.

N1 (#228) has a small independently fixed issue (R8 below). The corrected head is
`b0d42d8c96ef9676629012923e6f35932c92a0a5`; merge is conditional on its fresh checks.
The remaining stack (#229–#240) is held: #229 already introduces unresolved destructive-approval races and the later features depend on it.
Do not cherry-pick a dependent PR wholesale; that would import the blocked ancestors.

## Evidence that was independently checked

* All 13 submitted heads (#228–#240) had successful `validate` and `browser-flows` checks.
* The actual #240 validate log reports **853 tests, 853 pass, 0 fail, 0 skip** (including PostgreSQL integration tests).
* The actual #240 browser log aggregates to **257 tests, 257 pass, 0 fail, 0 skip**.
* Local existing focused approval / import / document / media tests: **57/57 pass**.
* Original #228 list tests: **32/32 pass**. Two new customer-history regressions fail before our fix; corrected list tests: **34/34 pass**.
* The independent probes in `tests/review-panel-platform-20261029.mjs` produce **21 failing assertions** on the submitted #240 tip, covering the 11 findings below in both houses where applicable. These are required-behavior assertions, not test-runner failures. R8 is now fixed on #228 but not yet merged forward into the submitted #240 head.
* Local probes used Node 24.22.1, an in-memory DB with optional API row caps and fault injection, and the actual application modules. Import probes substitute only the admin-client provider, unused server page guard, and external translation service; the import engine and translation-fill code are real. They do **not** constitute a real PostgREST/Storage integration run.
* No production files were downloaded to demonstrate the document issue. R1 is a configuration/data-path proof: migrations 06/10 declare the buckets public and the new document uploader places drafts in those same buckets.

The tests intentionally live outside the normal `*.test.mjs` glob. Run on the submitted stack:

```bash
node --test --test-reporter=tap tests/review-panel-platform-20261029.mjs
```

Keep the safe assertions and turn them into permanent regression tests while fixing the owning branches. A changed architecture may require updating test seams; do not merely weaken assertions or remove coverage.

## Findings and required fixes

### R1 — High: draft / hidden documents are stored publicly (#235)

`lib/operator/documents.js` chooses `product-images` / `beauty-product-images`.
`addDocument` in `documentsCore.js` uploads there **before** inserting `is_published:false`.
Migrations 06 and 10 mark these buckets public and grant read by bucket ID. The private document table and public-list RPC only hide the listing; they do not gate the object bytes. Unpublishing, expiry, or archiving its product does not revoke a known object URL.

Use private document storage with a server download route that checks current publication / expiry / active parent for public access and the correct house/session/permission for staff access. Public responses must never reveal an unrestricted storage path. Account for cache revocation when hiding/expiring a document. Do not privatize existing image buckets and break product images. Test direct unauthenticated GETs for draft, hidden, expired, archived-parent and other-house files, plus permitted publication, on a real local Storage/API setup.

The existing PDF heuristic is not an antivirus and accepts compressed object streams; retain that limit explicitly. Do not claim malicious-PDF sanitization without an actual parser/scanner.

### R2 — High: document deletion ignores failed audit attempts (#235)

The local `log()` swallows exceptions and ignores an audit return of `{ok:false}`.
`deleteDocument()` then removes the row/file even when the attempted deletion was never recorded. The approved document executor also lacks the common mandatory pre-delete attempt. This violates the existing permanent rule in `auditedDelete.js`.

Use the existing attempt/outcome contract for direct AND approved document deletion, with the appropriate audit adapter. Missing audit table, missing writer, returned failure and thrown failure must all prevent deletion. Write separate success/failure outcomes; report file-removal errors honestly.

### R3 — High: approved request deletion has a check/delete race (#229)

`executeApprovedQuoteDelete()` compares `_versions`, then calls `deleteQuotesGuarded()`, whose DELETE filters only IDs.
Probe: change the quote's `updated_at` and status to answered in the mandatory audit callback, after the snapshot check. The later DELETE still succeeds and removes the newer quote. This is reproducible for both houses.

Perform version verification and deletion in one database transaction, locking/conditioning **every row** and preserving all-or-nothing semantics for a multi-delete. A single stale/missing/changed row must delete none. Add real overlapping PostgreSQL sessions and an audit-failure control.

### R4 — Medium: media deletion breaks version restoration (#234)

`usageMap()` scans current products/categories/brands and top-level pending proposal image keys, but never `product_versions` / `beauty_product_versions`.
An old image referenced in a restorable version's `before`/`after` is treated as unused and removed. Reverting later writes a broken image reference.

Protect images in every restorable version (and nested import/bulk proposal payloads as appropriate). Paginate scans, fail closed on unreadable references, preserve shared files, and test restoration after attempted media deletion. Also retain the earlier brand-schema/pagination regressions.

### R5 — High: import bypasses per-field authorization / approval (#239)

`products.import` maps to `products.create`. A default product manager gets `products.import:direct` while `products.price` and `products.publish` need approval. `commitProductRows()` checks only the import operation; the engine accepts `price` and `is_active` and writes them directly.
Probe: an import changes an inactive product's price **10 → 999** and makes it active without filing any change request. The same problem affects restrictions on content/archiving/stock/category creation as dictated by the file.

Derive the union of operations from the **actual planned changes**, enforce each for the requesting actor, and file one approval if any requires it. Recheck that actor's current rights at execution; do not borrow the reviewer's unrestricted authority. The import operation alone must never authorize all columns or publication. Test both direct and approved paths, denied operations, changed rights, and automatic category creation.

### R6 — Medium: import/bulk still omit product versions and stale-basis protection (#239)

The import engines update by ID with no expected version and never call `recordVersion`. `runApprovedImport()` replans against today's data and stores only an aggregate import log. `applyBulkChange()` likewise updates chunks without per-product before/after versions. Existing version history cannot explain or revert these changes.

Carry per-row version bases through review/apply, refuse stale changes rather than overwriting them, and record actor, request, before and after for each changed product. A summary/count is not a product version. Make any chunk-level partial success visible with exact completed/failed IDs and honest audit outcomes; do not return a generic failure that hides previous writes. Full-file atomicity is optional only if these partial outcomes are explicit and retries are safe.

### R7 — Medium: imported automatic translations are labeled human (#239)

`importTranslate.js` fills missing language fields but does not set `translation_meta[field]='auto'`; the import engine does not add it either. Probe runs the actual fill module with a deterministic translator; the generated Tajik name is stored without its automatic mark.

Use the existing translation-meta rules in imports: generated fields must be marked automatic, preserve/reconcile previous markers on edits, and protect human-reviewed text unless an appropriately authorized explicit replacement was requested. Include before/after history and tests for both houses.

### R8 — Medium: customer history silently stops at 1000 while labeled full (#228) — fixed on owning branch

`readQuotesPage()` used `.limit(1000)` for related requests and returned `customerFile:'full'`.
Probe with 1100 related rows returns only 1000 in each house.

Our fix uses the existing ordered chunked `readAll()` and rejects a failed later page instead of presenting a partial history. Added two permanent tests (both houses), verified red before / green after. Commit `b0d42d8c96ef9676629012923e6f35932c92a0a5` on `feat/n1-list-paging`; bring this commit forward through the remaining stack by ordinary merges.

### R9 — High: category deletion only plans the first API page (#229)

`planCategoryDelete()` uses plain `.select('id')` for attached products (both FK and Health legacy-slug lookup) without pagination. With 1100 attached products and an API cap of 1000, it reports/plans only 1000.

Read every attached product, deduplicate correctly, and move/delete transactionally with no unmoved or silently detached remainder. Test FK and legacy references beyond the cap, database failure and both houses. Do not equate a truncated count with the category's real membership.

### R10 — High: destructive category/brand approvals do not pin the actual basis (#229)

Category approval stores only slug + product **count**. Swap one member product for another without changing the count: the approved executor moves the new product and deletes the category even though that was not the reviewed set. Brand approval compares only slug/name and its DELETE is unconditioned, so other edits and edits after the read are not protected either.

Pin the actual category/brand version and affected membership/version basis, and verify atomically with the destructive write. Same count/name is not unchanged data. Test equal-count membership replacement, other field changes and real concurrent sessions. Preserve mandatory audit attempts.

### R11 — High: bulk quality gate checks the old row instead of the resulting patch (#233/#239)

`applyBulkChange()` calls `gateBulkPublish()` with IDs only; that helper checks old rows plus `is_active:true`, then a separate update applies the whole patch.
Probe: required category is enabled, an inactive product has a category, and the bulk patch publishes it **and clears the category**. The gate passes and the incomplete product becomes public. A category-only patch on a live product is not checked at all.

Evaluate every resulting row with its complete cleaned patch, including edits to already-live products, in direct and approved bulk paths. Couple the check to version-conditional writes so a concurrent edit cannot invalidate the checked basis. Keep the existing exception for pre-existing gaps exactly as documented.

## Incomplete scope / report corrections (distinct from security defects)

* N10 is explicitly partial: default page size, dashboard arrangement, keyboard preferences and server-saved language/theme are not implemented. Do not headline all 13 requests as finished.
* N9 stores filters/sort/size but has **no configurable saved column selection/order**. The original request included columns.
* Content publication (banner/FAQ/contact/featured) still has no approval executor. Not offering an option avoids a misleading control but does not finish the original per-user approval requirement. Explain any intentional scope deferral and get owner agreement rather than labeling it done.
* N11 omits editable gateway email, address, hours and social links. Existing content can be preserved; unknown company details must not be invented.
* Per-lot counting, outbound expiry/low-stock alerts, unsaved-variant preview and human translation review remain documented limits, not independently completed work.
* `npm run check:mobile` was not run by the author despite the repository's explicit requirement. E2E viewport checks are useful, but do not claim that command passed. Run it with actual representative routes, long text and open controls.
* `PANEL_RELEASE_RUNBOOK.md` section 6 still says variants/lots/paging/etc. are not built while its new migration table describes them. Reconcile current state, keep historical notes dated, and keep the genuinely incomplete items.
* No real production restore drill or outside alert delivery is proved. An integration test on a temporary database is valuable and distinct from restoring an actual encrypted snapshot.

## Next steps for the implementation owner

1. Start with the updated #228 branch and merge its customer-history fix forward normally; no force push.
2. Fix the findings on owning branches with red-before/green-after behavior tests. Preserve all earlier R1–R8 review fixes, especially microsecond-precise approved product deletion.
3. Re-run unit tests, PostgreSQL integration tests, lint/build, the complete browser suite, the required mobile checker, and the added real transport/storage/concurrency cases. Read exact-head CI; classify infrastructure reruns separately from code fixes.
4. Correct the requirement table, work log and runbook; state completed, partial and owner/server-only verification separately.
5. Commit/push for independent rereview. Do not merge the held stack or deploy/apply migrations/change production settings.

The pending platform rollout still includes **34–42** as well as the new **43–52**. The last owner-reported deployed application remains `5ac0592`; this review does not change that production evidence. A future release needs a fresh verified local + encrypted R2 backup, saved rollback image, verified migration inventory, supervised owner-account enablement and real post-deployment checks.
