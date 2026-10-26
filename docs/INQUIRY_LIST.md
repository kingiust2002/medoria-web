# Inquiry list: several products in one request

## What the visitor gets (Health)

- **"Add to inquiry list"** on every product card and on the product page (4 languages). The button turns into "In your inquiry list" (a link to the list) with a remove button.
- A **list icon with a count** in the header (desktop) and an entry in the mobile menu.
- **`/health/{lang}/inquiry`**: the products with image, SKU and price (read again from the database), a quantity field per product, the same contact form as the single-product form (name, organization, phone, note, security question, channel WhatsApp / Telegram / phone) and ONE send button. After sending, the list is emptied and the chosen messenger opens with the whole list in the message, exactly as the single-product form does.
- The list lives in the visitor's browser only (`localStorage`, key `medoria.inquiry.health.v1`), at most 30 products, quantities 1–1,000,000. It holds ids and quantities, nothing else. The page is not indexed (`noindex`, and `Disallow: /*/inquiry` in robots).

## What the server does

`submitQuoteRequest` accepts an optional `items: [{ id, quantity }]`.

1. The whole list is rejected if it is not 1–30 entries of valid positive ids (no partial guessing).
2. Duplicates are merged, quantities capped.
3. **Names and SKUs are read from the products table** (`products` for Health, `beauty_products` for Beauty). Nothing the browser sends as a name or SKU is stored. Archived and unknown ids are dropped; if nothing is left the request is refused as invalid.
4. The request is saved with `items` (`[{product_id, sku, name, quantity}]`), a short summary in `product_name` ("Gloves +2"), and the single-product columns cleared. Spam checks (honeypot, captcha, rate limits) run first, unchanged.
5. The Telegram notice lists the first three products and "+N more"; the panel shows the whole list in the opened request.

**Before migration 33 exists** the code still works: the insert is repeated without `items` and the product list is appended to the message text, so no request is lost (tested).

## Rollout (owner's steps)

1. Back up, then run `migrations/33_quote_items.sql` (additive: one nullable column and one CHECK per table; self-checking; idempotent).
2. Deploy the code deliberately.
3. Check on the live site: add two products from the catalog, open the list, send. Verify in the panel that the request shows both products with the quantities, and `SELECT product_name, items FROM quote_requests ORDER BY id DESC LIMIT 1;`. Delete the test request with the delete button.

## Status

| | |
| --- | --- |
| Health: visitor flow, server, panel, Telegram notice | code ready and tested here (unit, PostgreSQL 16 for the migration, real-browser flows incl. a 320 px fit with a 140-character unbroken product name); not deployed; not confirmed on the live site |
| Beauty: database column, server action (`beauty_products`), panel display | ready (same code path), but **there is no visitor-facing add button or list page for Beauty yet** |
| Header | the Health header gained a control, so the brand lockup's reserved width went from 540 to 586 (`reservedMd`), as the mobile-width law requires; the header tests at all ten widths still pass |

## Limits

- No prices are added up: most products are "price on request", and a total would need agreed currency and terms. The list is a request for a quotation, not an order.
- One list per browser: it is not shared between devices.
- A pro-forma invoice from this list is not built: it needs company, bank and tax details and agreed prices that only the owner can supply (listed in `docs/CATALOG_DOCUMENTS_NEEDS.md`).
