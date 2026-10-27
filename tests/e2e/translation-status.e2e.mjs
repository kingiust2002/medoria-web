// Translation status in the product form: a text the translator wrote is marked 'automatic, not reviewed'; editing it makes it human and the
// stored status is cleaned on save; texts that were never auto stay untouched; saving works for both panels.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const patch = (table, id, body) => fetch(`${DB}/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify(body) });

test("automatic texts are marked; editing one makes it human; the status is saved", async () => {
  await patch("products", 1, { name_tg: "Machine Tajik", name_ru: "Machine Russian", description_tg: "Machine desc", translation_meta: { name_tg: "auto", description_tg: "auto" } });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await page.locator("details summary").first().click();
  const hint = "ترجمهٔ خودکار، بازبینی‌نشده؛ با ویرایش، متن انسانی حساب می‌شود.";
  assert.equal(await page.getByText(hint).count() >= 2, true, "name_tg and description_tg are marked");
  // a person fixes the Tajik name: that one becomes human
  const tg = page.getByLabel("نام (تاجیکی)");
  await tg.fill("Fixed by Sara");
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.waitForURL(/\/operator\/products$/);
  const p = (await state()).products.find((x) => x.id === 1);
  assert.equal(p.name_tg, "Fixed by Sara");
  assert.deepEqual(p.translation_meta, { description_tg: "auto" }, "only the untouched automatic text stays marked");
  assert.equal(p.name_ru, "Machine Russian", "a text that was never marked is not touched");
  await ctx.close();
});

test("a product with no marked texts saves without writing any translation status (works before migration 40)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/3/edit`, { waitUntil: "networkidle" });
  await page.getByLabel(/نام محصول \(فارسی\)/).fill("Plain edit");
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.waitForURL(/\/operator\/products$/);
  const p = (await state()).products.find((x) => x.id === 3);
  assert.equal(p.name_fa, "Plain edit");
  assert.ok(!("translation_meta" in p) || Object.keys(p.translation_meta || {}).length === 0);
  await ctx.close();
});
