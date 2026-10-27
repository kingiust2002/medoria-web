// The image library of both panels in a real browser (fake database with a fake storage): files and where they are used, unused-only
// filter, removal of an unused file (logged), a file that became used since the page was loaded cannot be removed, upload, and Beauty's
// own buckets.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const call = (method, path, body) => fetch(`${DB}/rest/v1/${path}`, { method, headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
const obj = (bucket, name, at) => ({ id: `o-${bucket}-${name}`, bucket, name, size: 4096, created_at: at });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function open(page, house = "health") {
  await login(page, house);
  await page.goto(`${BASE}${house === "beauty" ? "/beauty/operator" : "/operator"}/media`, { waitUntil: "networkidle" });
}

test("files and where they are used; unused filter; an unused file is removed and logged; a file used meanwhile is refused", async () => {
  await call("POST", "storage_objects", [obj("product-images", "products/used.webp", "2026-10-03T00:00:00Z"), obj("product-images", "products/free.webp", "2026-10-02T00:00:00Z"), obj("product-images", "products/free2.webp", "2026-10-01T00:00:00Z")]);
  await call("PATCH", "products?id=eq.1", { image_url: "products/used.webp" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page);
  assert.equal(await page.getByTestId("media-item").count(), 3);
  const used = page.locator('[data-testid="media-item"][data-unused="false"]');
  assert.equal(await used.count(), 1);
  assert.match(await used.innerText(), /used\.webp/);
  assert.match(await used.innerText(), /E2E-1/, "it says which product uses it");
  assert.equal(await used.getByTestId("media-delete").count(), 0, "a used file has no delete button");
  await page.getByTestId("media-filter-unused").click();
  assert.equal(await page.getByTestId("media-item").count(), 2);

  // remove free.webp
  await page.locator('[data-testid="media-item"]', { hasText: "free.webp" }).first().getByTestId("media-delete").click();
  await page.getByTestId("media-confirm-yes").click();
  await page.getByText("تصویر حذف شد.").waitFor();
  const st = await state();
  assert.deepEqual(st.storage_objects.map((o) => o.name).sort(), ["products/free2.webp", "products/used.webp"]);
  assert.ok(st.operator_audit_log.some((r) => r.action === "media.delete" && r.result !== "failure"));

  // free2.webp becomes used by another person while this page is open → refused, still there
  await page.locator('[data-testid="media-item"]', { hasText: "free2.webp" }).first().getByTestId("media-delete").click();
  await call("PATCH", "products?id=eq.3", { image_url: "products/free2.webp" });
  await page.getByTestId("media-confirm-yes").click();
  await page.getByText("این تصویر هنوز استفاده می‌شود").waitFor();
  assert.ok((await state()).storage_objects.some((o) => o.name === "products/free2.webp"));
  await ctx.close();
});

test("upload adds a file to the library", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page);
  await page.getByText("تصویری وجود ندارد").waitFor();
  await page.getByTestId("media-file").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: PNG });
  await page.getByText("تصویر بارگذاری شد.").waitFor();
  await page.getByTestId("media-item").first().waitFor();
  assert.equal((await state()).storage_objects.length, 1);
  await ctx.close();
});

test("Beauty lists its own buckets (products, categories, brand logos) and nothing of Health", async () => {
  await call("POST", "storage_objects", [obj("beauty-product-images", "products/p.webp", "2026-10-01T00:00:00Z"), obj("beauty-product-images", "categories/c.webp", "2026-10-02T00:00:00Z"), obj("beauty-brand-logos", "logos/l.png", "2026-10-03T00:00:00Z"), obj("product-images", "products/health.webp", "2026-10-04T00:00:00Z")]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "beauty");
  assert.equal(await page.getByTestId("media-item").count(), 3);
  assert.ok(!(await page.getByTestId("media-grid").innerText()).includes("health.webp"));
  await ctx.close();
});
