# The image library (stage S5d, no migration)

`/operator/media` and `/beauty/operator/media` (permission `media.view`; upload `media.upload`; removal `media.delete`).

* **What it lists**: every file in this house's storage buckets and folders — Health: `product-images/products`; Beauty:
  `beauty-product-images/products` and `/categories`, `beauty-brand-logos/logos` — newest first (the newest 200 per folder), with a
  thumbnail, size, date and **where it is used** (products' main image and gallery, categories' image, Beauty brands' logo). A
  reference may be a bare storage path or a full public URL; both count. A failing usage read is reported as "unavailable", never as
  "everything is unused".
* **Remove**: only a file nothing uses. The usage is read again at the moment of removal (a page may be minutes old); a file that
  became used meanwhile is refused with the list of users. A person whose policy says "approve" (`media.delete` is on the product
  manager's default list) files a request; the reviewer's approval runs the same checks again, and a file that became used fails the
  request safely as *stale*. Every removal is logged (`media.delete`: bucket and folder, never the customer or product).
* **Upload**: the existing product-image upload (type and size limits, magic-byte sniffing); the new file appears in the list.
* **Copy link**: the public URL, for use in a description or a message.
* **Limits**: one house never lists or removes another house's bucket or a folder outside the list above (`..`, nested paths and other
  buckets are refused). Category/brand image *upload* stays where it is (the category and brand screens); documents/PDF
  brochures are not part of this library.
* Tests: `tests/media-library.test.mjs` (unit), `tests/e2e/media-library.e2e.mjs` (browser, with a fake storage in the e2e database).
