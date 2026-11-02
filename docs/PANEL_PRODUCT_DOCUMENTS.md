# Product documents: brochure, datasheet, certificate, manual (N8)

**Status: complete in code and tests for both houses. Migration 48 is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere; until it is applied the panel says so and the public pages show nothing new. Not deployed. Tajik / English texts of the panel are machine-prepared; the public labels (tg / ru / en / fa) need a human read.**

## What it is

On the edit page of a product (both houses) a **Documents** section: add a PDF with a title, a kind (brochure · datasheet · certificate · manual · other), the document's language and an optional **valid-until** date. A new document is always a **draft**. Making it public is a separate step with its own right and may need approval. On the public product page (Health `ProductDetailClient`, Beauty `BeautyProductView`) the published, still valid documents are listed with a download link, in the visitor's language.

| Rule | How |
| --- | --- |
| PDF only, ≤ 15 MB, ≤ 30 per product, the same content not twice on a product | `lib/operator/documents.js`, SHA-256, unique `(product_id, sha256)` |
| A PDF is **looked at before it is stored in the house's private bucket**: must start with `%PDF-` and end with `%%EOF`; refused when it carries script (`/JavaScript`, `/JS`), an attached file, rich media, XFA, a form-submission or launch action, a remote go-to, or encryption (cannot be inspected); names written with `#xx` escapes are decoded first | `scanPdf` |
| Files live in the house's own **private** bucket (`product-documents` / `beauty-product-documents`, migration 54) under `documents/`; the stored type is always `application/pdf`; the path is only letters, digits, dot, dash. No address works without the download route (see round 3) | `documentPath`, DB CHECK, `lib/documentServe.js` |
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

## Round 3 (independent review R1, R2)

### R1 — draft / hidden documents were stored publicly (fixed; migration 54, not applied)
Migration 48's uploader put every file — drafts included — into the houses' **public** image buckets. Hiding, expiring, or archiving the product only hid the *listing*; whoever knew an object's address kept getting the file.
* **Private buckets** `product-documents` and `beauty-product-documents` (migration 54): `public = false`, 15 MB / `application/pdf` where the storage version has those columns, and no policy of `storage.objects` names them. Anonymous and signed-in API roles cannot list or read one object in them (tested at the policy level on PostgreSQL with the real policy text of migrations 06/10). The image buckets stay public and untouched — product pictures keep working.
* **One door to the bytes** (`lib/documentServe.js`, three routes):
  * `GET /api/documents/<health|beauty>/<id>` — anonymous; served only if `public_*_product_document_visible(id)` says the document is public **at this moment** (published, not expired, active parent, not a variant). Draft, hidden, expired, archived parent, variant, other house, nonexistent id: the *same* 404 — an outsider learns nothing.
  * `GET /api/operator/documents/<id>` and `/api/beauty-operator/documents/<id>` — a signed-in person of **that house** with the right to see documents (`documents.view`); any state of a document of the house's own table. No session / no right / the other house's session: 404.
  * Responses: always `application/pdf` (and only if the stored bytes start with `%PDF-`), `nosniff`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`. **Nothing is cached**, so hiding or expiring a document takes effect on the very next request — not after a cache lifetime. (The listing on the product page still has the public data layer's 60 s lifetime; its link is already dead.)
* The public list functions no longer return `file_path`; the product pages link to `/api/documents/<house>/<id>`; the panel's "view" opens the panel route.
* **Moving files** (only if migration 48 was ever applied and used anywhere — production is proven only at `5ac0592`, where it was not): migration 54 prints a WARNING with the number of existing rows. Their files are in `product-images/documents/` (or `beauty-product-images/documents/`) and stay publicly readable there until you copy each to the same path in the private bucket and delete the old copy; until then the route answers 404 for them. A rehearsal on a copy is advised.
* Limit, stated plainly: the PDF check is a **heuristic, not an antivirus** — it accepts compressed object streams (`/ObjStm`, reported as `compressed`). No claim of malicious-PDF sanitisation is made; the file is only ever served as `application/pdf` with `nosniff`, never as a page of the site. Large files are read into memory (≤ 15 MB) before being sent.
* Tests: `tests/private-product-documents-migration.test.mjs` (PostgreSQL: private buckets, invisibility to anon/authenticated, visibility function per house, self-check refuses an exposing policy), `tests/document-access-real-db.test.mjs` (the real serving code over real rows and the real anonymous role: draft/hidden/expired/archived/variant/other-house/nonexistent, immediate revocation, wrong object, non-PDF bytes, header injection; the *bytes* come from an in-memory stand-in for Storage), e2e `product-documents-access` (the running app: anonymous, no session, wrong house, the old public address no longer exists). **Not proven here:** a real Supabase Storage server refusing an anonymous read of the private bucket (cannot run it in this environment) — the first post-release probe in the runbook does exactly that with `curl`.

### R2 — document deletion ignored a failed audit attempt (fixed)
`deleteDocument` and the approved executor now follow `lib/operator/auditedDelete.js`: the **attempt** entry is written first; a missing table, a missing writer, a returned `{ok:false}`, a thrown error, or no return value all refuse the deletion (nothing is removed, row or file). The row is deleted conditional on the version the person saw; the **outcome** is a separate entry (`document.delete` / `document.delete_failed` with the reason); then the file is removed. If the file cannot be removed the row is already gone: the answer carries `fileRemoved:false` and the outcome records `file_removed:false` — an orphan file is known, never silent. The approved executor takes the reviewer's audit writer (`makeDocumentExecutors({ panel, audit })`). Tests: `tests/document-delete-audit.test.mjs` (28, both houses, direct and approved; red before / green after).
