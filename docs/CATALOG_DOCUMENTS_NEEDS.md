# Catalog, price list, pro-forma: what exists, what is missing, what only the owner can supply

Nothing below is invented: where a fact is needed (a company detail, a certificate, a price), it is listed as an **input from the owner**, and the software prints nothing for a field that has no value.

## 1. What exists now (code ready; not deployed)

| Piece | Where | Languages |
| --- | --- | --- |
| **Printable catalog** (A4, grouped by category, image, name, SKU, brand, description, up to 8 specification rows, unit, minimum order, price or "price on request") | `/health/{lang}/print-catalog` (optionally `?category=<slug>` for one branch); link "Printable catalog (PDF)" on the catalog page; browser print → "Save as PDF" | fa (right-to-left), ru, tg, en: product text from the product's own translations, falling back to English; headings and labels in the page language |
| **Inquiry list** (several products, quantities, one request) | `docs/INQUIRY_LIST.md` | all four |
| **Completeness markers** in both panels: filter "اطلاعات: ناقص / کامل", a badge per product naming what is missing, a dashboard count | operator panels → Products, Dashboard | Persian (panel) |

How to make a PDF: open the catalog page → "Printable catalog (PDF)" → the print dialog → destination "Save as PDF", paper A4, margins "default", background graphics on. The page is generated from the live database at that moment (never a 60-second-old copy).

Not printed unless configured: the contact block shows the site address, `NEXT_PUBLIC_EMAIL_HEALTH` / `NEXT_PUBLIC_EMAIL` and `NEXT_PUBLIC_PHONE` only when they are set in the build; there is no placeholder number.

Beauty: the product data model and the panel markers are shared, but **a printable Beauty catalog and a Beauty inquiry-list page are not built** (the vertical has no published products yet).

## 2. Product information: what is missing and who can fill it

The panel now shows, per product, which of these are empty: image, SKU, category, name in each of 4 languages, description in each of 4 languages, specifications table. "Price on request" is **not** treated as a gap.

Fields the site can show today: names and descriptions ×4, image, SKU, brand, unit, minimum order quantity, price + currency (or on request), badge (NEW / TOP / SALE), tags, a free **specifications table** (label → value, any labels), SEO title/description.

Inputs from the owner, per product (only if true and documented by the manufacturer or supplier):

- the supplier's datasheet or product page, or the facts typed from it: composition/material, sizes, packaging (pieces per box, boxes per carton), storage conditions, shelf life, sterile / non-sterile, single-use / reusable;
- the manufacturer's or brand's exact name and country of origin;
- **claims** such as CE / ISO / registration numbers or standards: only with the certificate in hand; the brand rules forbid unsupported certifications, so these stay empty until a document exists and then are copied exactly;
- real photographs (or the supplier's permission to use theirs);
- the translations: the panel has an automatic translation helper; its output is a draft. Tajik and Persian medical wording should be checked by a native speaker before it is printed in a catalog.

Suggested specification labels (examples to type into the existing specs table, not a fixed schema): Material, Size, Packaging, Sterility, Shelf life, Storage, Country of origin.

## 3. Pro-forma invoice: not built, because it cannot be built from the repository alone

A pro-forma is a commercial document in the company's name. Before any code, the owner has to provide:

1. **Seller**: legal name, registered address, registration / tax number as it should appear, signatory name and role, stamp/signature policy.
2. **Bank details**: bank, account/IBAN, SWIFT, currency accounts; or "details sent on request".
3. **Commercial rules**: invoice currency; whether prices include VAT/taxes; payment terms; validity period (e.g. 14 days); delivery terms (Incoterms) and what is included; minimum order and lead times.
4. **Numbering**: the pro-forma number format (e.g. `PF-2026-0001`) and who may issue them.
5. **Prices**: a person sets the agreed unit prices per request. Most products are "price on request", so a pro-forma is created **from a customer request after the price is agreed**, not automatically from the list.
6. **Languages**: which of the four the document should be issued in (legal wording per language needs review).
7. **Storage**: whether issued pro-formas must be kept (and for how long): this decides whether a database table is needed.

When these are given, the intended shape is small: a panel action on a request ("create pro-forma") with editable prices and quantities → a print page like the catalog (A4, chosen language) with the numbering and the stored details. It would be a separate change with its own tests.

## 4. A customer price list

Same mechanism as the catalog: only products with a price print one; "price on request" stays as such. A price-list-only variant (no images, table form) is a small addition once the owner decides the currency, validity wording and who may receive it. Not built.

## 5. Decisions needed from the owner (short)

1. Should the printable catalog show prices at all for products that have them (public) or only on request? (Today: shown as stored.)
2. Contact details to print: confirm `NEXT_PUBLIC_PHONE`, `NEXT_PUBLIC_EMAIL_HEALTH` are the public ones.
3. For the pro-forma: items 1–7 above.
4. Who reviews Tajik and Persian product text, and is a Beauty printable catalog wanted before products are published?
