// Product documents in a real browser, both houses (docs/PANEL_PRODUCT_DOCUMENTS.md): a PDF is uploaded as a DRAFT, published, shown on the public product
// page with a working link, hidden again, edited (an expired certificate disappears), deleted with its file; unsafe or wrong files are refused in words;
// the section fits a 320 px phone.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, poll, login, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const ts = "2026-10-01T10:00:00.000Z";
const insert = async (table, rows) => { const r = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) }); assert.equal(r.status, 201); return r.json(); };
const pdf = (extra = "") => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\n${extra}\ntrailer << /Root 1 0 R >>\n%%EOF\n`, "latin1");
const beautyProduct = { id: 11, slug: "e2e-serum", sku: "B-11", name_en: "E2E Serum", name_fa: "E2E Serum", name_ru: "E2E Serum", name_tg: "E2E Serum", price: 30, in_stock: true, is_active: true, brand: "Luxe", unit: "pcs", min_order_qty: 1, specs: {}, tags: [], gallery_urls: [], created_at: ts, updated_at: ts };
// E2E_SHOTS=<dir> saves screenshots for a visual check (not part of the assertions)
const shot = async (page, name) => { if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png`, fullPage: true }); };
const docs = async (table = "product_documents") => (await state())[table] || [];
const objects = async () => (await state()).storage_objects || [];

async function addDoc(page, { name = "datasheet-2026.pdf", buffer = pdf(), title, kind, lang, valid_until } = {}) {
  await page.getByTestId("document-add").click();
  await page.getByTestId("document-file").setInputFiles({ name, mimeType: "application/pdf", buffer });
  if (title !== undefined) await page.getByTestId("document-title").fill(title);
  if (kind) await page.getByTestId("document-kind").selectOption(kind);
  const form = page.getByTestId("document-form");
  if (lang) await form.locator("select").nth(1).selectOption(lang);
  if (valid_until) await form.locator('input[type="date"]').fill(valid_until);
  await page.getByTestId("document-submit").click();
}

test("Health: upload as a draft → publish → public link works → hide → expired certificate not shown → delete removes the file", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await page.getByTestId("documents-empty").waitFor();

  await addDoc(page, { kind: "datasheet", lang: "en" });
  const row = page.getByTestId("document-row").first();
  await row.waitFor();
  assert.equal(await page.getByTestId("document-title").count(), 0, "the form closed");
  assert.match(await row.innerText(), /datasheet 2026/, "the title was taken from the file name");
  assert.match(await row.getByTestId("document-state").innerText(), /پیش‌نویس/);
  let [d] = await docs();
  assert.deepEqual([d.product_id, d.kind, d.lang, d.is_published], [1, "datasheet", "en", false]);
  assert.match(d.file_path, /^documents\/\d+-[a-z0-9]+-datasheet-2026\.pdf$/);
  assert.deepEqual((await objects()).map((o) => [o.bucket, o.name]), [["product-images", d.file_path]]);
  assert.equal((await state()).operator_audit_log.filter((r) => r.action === "document.create").length, 1);

  // a draft is not on the public page
  const pub = await ctx.newPage();
  await pub.goto(`${BASE}/health/en/catalog/e2e-gloves`, { waitUntil: "networkidle" });
  assert.equal(await pub.getByTestId("product-documents").count(), 0);

  // publish → public section with a link that serves the PDF
  await row.getByTestId("document-publish").click();
  await poll(async () => (await docs())[0].is_published === true, { label: "published" });
  await poll(async () => { await pub.reload({ waitUntil: "load" }); return (await pub.getByTestId("product-documents").count()) === 1; }, { timeout: 60000, interval: 1500, label: "the public page shows the document" });
  await shot(pub, "docs-public-health");
  await shot(page, "docs-panel-health");
  const link = pub.getByTestId("product-document-link").first();
  assert.match(await link.innerText(), /datasheet 2026/); assert.match(await link.innerText(), /Datasheet/); assert.match(await link.innerText(), /English/);
  assert.equal(await link.getAttribute("target"), "_blank"); assert.match(await link.getAttribute("rel"), /noopener/);
  const res = await fetch(await link.getAttribute("href"));
  assert.equal(res.status, 200); assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.ok((await res.text()).startsWith("%PDF-"));

  // hide → gone from the public page again
  await row.getByTestId("document-hide").click();
  await poll(async () => (await docs())[0].is_published === false, { label: "hidden" });
  await poll(async () => { await pub.reload({ waitUntil: "load" }); return (await pub.getByTestId("product-documents").count()) === 0; }, { timeout: 60000, interval: 1500, label: "gone from the public page" });

  // edit: kind / title / an expiry date in the past (published again → still not shown) 
  await row.getByTestId("document-edit").click();
  const ef = page.getByTestId("document-edit-form");
  await ef.locator("input").first().fill("ISO certificate");
  await ef.locator("select").first().selectOption("certificate");
  await ef.locator('input[type="date"]').fill("2020-01-01");
  await ef.getByRole("button", { name: "ذخیره" }).click();
  await poll(async () => (await docs())[0].title === "ISO certificate", { label: "edited" });
  [d] = await docs();
  assert.deepEqual([d.kind, d.valid_until], ["certificate", "2020-01-01"]);
  assert.match(await page.getByTestId("document-row").first().innerText(), /منقضی/);

  // delete: asks first; the row and the file go together
  const row2 = page.getByTestId("document-row").first();
  await row2.getByTestId("document-delete").click();
  assert.equal((await docs()).length, 1, "asking is not deleting");
  await row2.getByTestId("document-delete-confirm").click();
  await poll(async () => (await docs()).length === 0, { label: "row deleted" });
  assert.equal((await objects()).length, 0, "the file went with it");
  assert.ok((await state()).operator_audit_log.some((r) => r.action === "document.delete"));
  await ctx.close();
});

test("unsafe or wrong files are refused in words; nothing is stored; a duplicate is refused", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await addDoc(page, { name: "evil.pdf", buffer: pdf("<< /S /JavaScript /JS (app.alert(1)) >>") });
  await page.getByTestId("documents-error").waitFor();
  assert.match(await page.getByTestId("documents-error").innerText(), /اسکریپت/);
  await page.getByTestId("document-file").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>not a pdf</html>".padEnd(60, " ")) });
  await page.getByTestId("document-submit").click();
  await poll(async () => /PDF/.test(await page.getByTestId("documents-error").innerText()), { label: "not a pdf message" });
  await page.getByTestId("document-file").setInputFiles({ name: "pic.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) });
  await page.getByTestId("document-submit").click();
  await poll(async () => /فقط فایل PDF/.test(await page.getByTestId("documents-error").innerText()), { label: "wrong type message" });
  assert.equal((await docs()).length, 0); assert.equal((await objects()).length, 0, "nothing was stored by any refusal");
  // an honest one, then the same content again
  const same = pdf("% same");
  await page.getByTestId("document-file").setInputFiles({ name: "one.pdf", mimeType: "application/pdf", buffer: same });
  await page.getByTestId("document-title").fill("One");
  await page.getByTestId("document-submit").click();
  await page.getByTestId("document-row").first().waitFor();
  await addDoc(page, { name: "two.pdf", buffer: same, title: "Two" });
  await poll(async () => /قبلاً برای این محصول/.test(await page.getByTestId("documents-error").innerText()), { label: "duplicate message" });
  assert.equal((await docs()).length, 1);
  await ctx.close();
});

test("Beauty: the same flow in its own table and bucket; the public product page shows the published document", async () => {
  await insert("beauty_products", [beautyProduct]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "beauty");
  await page.goto(`${BASE}/beauty/operator/products/11/edit`, { waitUntil: "networkidle" });
  await addDoc(page, { name: "brochure.pdf", kind: "brochure", lang: "en" });
  await page.getByTestId("document-row").first().waitFor();
  assert.equal((await docs()).length, 0, "Health's table is untouched");
  const [d] = await docs("beauty_product_documents");
  assert.deepEqual([d.product_id, d.kind, d.is_published], [11, "brochure", false]);
  assert.deepEqual((await objects()).map((o) => o.bucket), ["beauty-product-images"]);
  await page.getByTestId("document-publish").click();
  await poll(async () => (await docs("beauty_product_documents"))[0].is_published === true, { label: "published" });
  const pub = await ctx.newPage();
  await poll(async () => { await pub.goto(`${BASE}/beauty/en/catalog/e2e-serum`, { waitUntil: "load" }); return (await pub.getByTestId("product-documents").count()) === 1; }, { timeout: 90000, interval: 3000, label: "Beauty page shows the document" });
  assert.match(await pub.getByTestId("product-document-link").first().innerText(), /brochure/i);
  await ctx.close();
});

test("the documents section fits a 320 px phone, with a long unbroken title", async () => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await addDoc(page, { name: "a.pdf", title: "X".repeat(150) });
  await page.getByTestId("document-row").first().waitFor();
  await page.getByTestId("document-add").click();
  await shot(page, "docs-panel-320");
  const m = await page.evaluate(measureInPage);
  assert.equal(m.count, 0, JSON.stringify(m.offenders?.slice(0, 3)));
  await ctx.close();
});
