# Product documents: brochure, datasheet, certificate, manual (N8)

**Status: complete in code and tests for both houses. Migration 48 is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere; until it is applied the panel says so and the public pages show nothing new. Not deployed. Tajik / English texts of the panel are machine-prepared; the public labels (tg / ru / en / fa) need a human read.**

## What it is

On the edit page of a product (both houses) a **Documents** section: add a PDF with a title, a kind (brochure · datasheet · certificate · manual · other), the document's language and an optional **valid-until** date. A new document is always a **draft**. Making it public is a separate step with its own right and may need approval. On the public product page (Health `ProductDetailClient`, Beauty `BeautyProductView`) the published, still valid documents are listed with a download link, in the visitor's language.

| Rule | How |
| --- | --- |
| PDF only, ≤ 15 MB, ≤ 30 per product, the same content not twice on a product | `lib/operator/documents.js`, SHA-256, unique `(product_id, sha256)` |
| A PDF is **looked at before it is stored in a public bucket**: must start with `%PDF-` and end with `%%EOF`; refused when it carries script (`/JavaScript`, `/JS`), an attached file, rich media, XFA, a form-submission or launch action, a remote go-to, or encryption (cannot be inspected); names written with `#xx` escapes are decoded first | `scanPdf` |
| Files live in the house's own image bucket under `documents/` (no new bucket, no storage setting); the stored type is always `application/pdf`; the path is only letters, digits, dot, dash | `documentPath`, DB CHECK |
| Rights: add = `documents.create`; edit / hide = `documents.edit`; **publish = `documents.publish`** and **delete = `documents.delete`**, both **approvable** (a product manager's default policy sends them for approval; owner and house admin decide; the executor re-checks the version) | `documentsCore.js`, `authz.js`, `makeDocumentExecutors` |
| The row and the file go together (a failed insert removes the uploaded file; a delete removes the row first, then the file) | core |
| The public site reads **only** through `public_product_documents` / `public_beauty_product_documents` (published, valid today in Asia/Dushanbe, **active** product, never a variant, public columns only — no hash, no author) | migration 48, `lib/supabase.js`, `lib/beauty/catalog.js` |
| A product that still has documents cannot be deleted (the database holds it; the panel says "delete the documents first") | `ON DELETE RESTRICT`, `productDelete.js` |

## Migration 48

`migrations/48_product_documents.sql` is **generated** by `scripts/db/gen-product-documents-migration.mjs` (edit the template; a test fails if the SQL drifts): per house a private table (`product_documents`, `beauty_product_documents`: kind / title / language CHECKs, file path pattern, size, SHA-256, `is_published`, `version` bumped by a guard trigger, **product, file and hash never change**), RLS on with no policy, nothing for `anon` / `authenticated`, and the public SECURITY DEFINER function. **Needs 34 and both product tables.** One transaction, idempotent, self-checking. **Rollback** (only after the deployed code no longer uses it): the DROP statements in the file header.

## Tests

* `tests/product-documents-migration.test.mjs` (6, real PostgreSQL, both houses): template agrees; needs 34 / product tables, idempotent; private; every constraint; guard + RESTRICT; the public function (published, valid through today, lapsed hidden, inactive product, variants, other house, public columns only).
* `tests/product-documents.test.mjs` (16): the PDF scan (incl. disguised names), form cleaning, add / refusals / publish / hide / delete / approval filing / executors for **both houses**, rights and house separation, the public list in four languages, pins that the public site never reads the private table.
* e2e `product-documents` (4) and `accounts-product-documents` (1): upload → draft → publish → the public page shows a working link (the PDF is served) → hide → expired certificate edit → delete removes the file; unsafe / fake / wrong files refused in words and nothing stored; duplicate refused; Beauty in its own table and bucket; 320 px with a 150-character unbroken title; approval flow for publish and delete, viewer without buttons. Screenshots (public page, panel at 320 px) were looked at.

## Stated limits

* The scan is a **heuristic, not a virus scanner**. Content inside compressed object streams (`/ObjStm`) cannot be read without a PDF parser: such a file is accepted (flagged internally) and is only ever served as a download / PDF, never as a page of the site.
* Documents attach to the **parent** product, not to a variant. Existing `brochure_url` links keep working next to this.
* No automatic reminder before a certificate's valid-until date; it simply disappears from the public page after that day.
* Replacing a file = add a new document and delete the old one (the file of a document never changes).
* An approval of publishing or deleting goes stale if the document changed after the request was filed (it must be asked again by hand; there is no "ask again" button for documents yet).
