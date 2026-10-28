# Private preview of a product on the real public page (N5)

**Status: complete in code and tests for both houses; no database migration; not deployed. Tajik / English texts of the new strip and button are machine-prepared and need a human read.**

Extends `S5b` (the per-language view and gap checklist inside the product form, PR #224), which stays as it is. What was missing there: the product as it really looks on the site — the real header, footer, gallery, price block, variants, JSON-LD-free structure — for a product that is **not public** and with values that are **not saved**.

## What it does

* Both product forms (new and edit, Health and Beauty) have a **«پیش‌نمایش روی سایت»** button. It opens `/{house}/tg/preview/{id|new}?token=…` in a new tab. The page is the **same component tree** as the public product page — Health: `ProductDetailClient`; Beauty: `BeautyProductView`, extracted from the public page so that one component renders both (`components/beauty/BeautyProductView.jsx`) — fed with the form's current values laid over the stored product.
* Works for an **inactive / archived / scheduled** product (the public page answers 404 for those) and for a **new** product (nothing is created).
* A strip over the page (`PreviewBanner`, in the panel's language and direction) says: private, where the content comes from (unsaved form values / saved version / an approval request's proposal / new product), whether the product is live, that no view or request is recorded, how many inactive variants are not shown; it offers the four content languages (tg · ru · en · fa — the same token is kept) and a link back to the form.
* The approvals screen has **«پیش‌نمایش پیشنهاد روی سایت»** on a pending product request (`products.*` operations and creation): the proposal is laid over the stored product and shown the same way; nothing is applied.

## Who can see it — the rules

| Rule | How it is enforced |
| --- | --- |
| Only a signed-in panel person of **that house** with the right to **see products**; everyone else gets a plain **404** (no redirect to a login that would confirm the route exists, no hint of why) | `loadPreview` (`lib/operator/previewLoad.js`): session of the house, `mayView(session, house, "products.view")`, otherwise `notFound` |
| A Health session is a stranger on Beauty's preview and the reverse | each house's page uses only its own session module; tested both ways |
| Unsaved values are held **on the server, in memory, for 30 minutes** (max 40, 60 KB each), under a random 48-hex token bound to the **session id + house + product** — the token alone is worthless; another session, house or product, an expired, malformed or made-up token gets the *saved* version and the strip says the draft is gone | `lib/operator/previewDraft.js` (`createPreviewStore`) |
| A pending request's proposal needs the right to **review approvals** (`approvals.view`) in the same house, must be a product request and belong to **that product**; otherwise 404 | `loadPreview` |
| The draft is cleaned **exactly as a save cleans it** (same row builder `lib/operator/productRow.js`, shared by the save actions), so what is previewed is what a save would store; slug, status, schedule, translation marks, lock version and counters are **never** taken from a draft | `cleanDraft` / `overlay` |
| The preview is never public: rendered per request (`force-dynamic`, `revalidate = 0`, `force-no-store`), no `generateStaticParams`, no cache API, `noindex` in metadata **and** in the middleware's `X-Robots-Tag`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`; `robots.txt` disallows `/health/*/preview/` and `/beauty/*/preview/`; the sitemap never lists it; no public file links to it | pages + `middleware.js` + `app/robots.js` + source pins |
| **Nothing a visitor does is recorded from inside a preview**: no product view counted, the quote form "sends" nothing, the inquiry list / compare / wish list are not touched | `PreviewContext` (`usePreview`) read by the view trackers, both quote modals, `InquiryToggle`, compare buttons |
| Who looked is in the activity log (`product.preview`, entity and id) — **never what was typed** | `createPreview` |

The preview store lives in the Node process (`globalThis`): a restart of the app empties it (the strip then says the draft is gone and shows the saved version) and a second app instance would not share it. The deployment runs one app container, so this is fine today; a future multi-instance deployment needs a shared store (stated below).

## Files

`lib/operator/previewDraft.js` (clean, overlay, store) · `previewLoad.js` (access + data) · `previewCore.js` (the action's logic) · `previewActions.js` and `lib/beauty/operator/previewActions.js` (the two "use server" entry points) · `lib/operator/productRow.js` (row builder extracted from both save actions) · `components/operator/PreviewBanner.jsx` · `components/shared/PreviewContext.jsx` · `app/{health,beauty}/[lang]/preview/[id]/page.jsx` · `components/beauty/BeautyProductView.jsx` · `middleware.js`, `app/robots.js`.

## Tests

* `tests/product-preview-private.test.mjs` (12): draft cleaning equals what a save stores; overlay never takes slug / status; the store (binding, expiry, bound size, no cross-owner); the 404 matrix (no session, no right, other house, bad ids, missing product, variant id, database failure → an error, never an invented product); inactive product and its variants; draft visible only to its session; request proposals (same house, product requests only, needs the review right); the action (rights, audit without content, size limits); the pages' no-cache/noindex pins; headers/robots/sitemap; neutralised side effects; buttons and house-specific actions.
* `tests/e2e/product-preview-private.e2e.mjs` (3) and `tests/e2e/accounts-product-preview.e2e.mjs` (1, personal accounts; the runner gives `accounts-*` files that app configuration) in a real browser: a stranger gets a 404 with noindex/no-store; an inactive product opens with the typed **unsaved** name inside the real layout, the product stays inactive and unchanged, the public address still 404; languages keep the token; no view and no request created; the activity log has no typed text; the same address without the cookie is 404; a new product previews and creates nothing; approvals screen link shows the proposed price while the product keeps its price; a Beauty request cannot be previewed from Health; Beauty and Health sessions are strangers on each other's previews; `robots.txt` / sitemap; 320 and 390 px with a 90-character unbroken name.
* The existing public product page, product-view and S5b preview e2e files run unchanged against the refactored Beauty page.

## Stated limits

* Drafts are held in the app's memory, not in the database: they do not survive a restart and are not shared by several app instances.
* A draft is the product row only. Unsaved **variants**, **images that were chosen but not yet uploaded** and unsaved **translations of other fields the form computes on save** are not part of it; saved variants (active ones) are shown, inactive ones are counted in the strip.
* The preview shows the content languages by switching the route language; the banner is in the panel's language.
* "Not a recorded view" is guaranteed for the client-side tracker and the quote form; the page is still a server render of the public components, so an external image or font request happens as on any page.
* The Tajik and English strings are machine-prepared; a human read is still needed.
