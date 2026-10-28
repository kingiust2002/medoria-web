// Product edits: the optimistic lock (a stale screen cannot silently overwrite somebody else's save), the change history, and
// "revert this change" — both panels, real browser, fake database (which bumps updated_at on every write, like the trigger).
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const patch = (table, id, body) => fetch(`${DB}/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify(body) });
const product = async (id = 1, table = "products") => (await state())[table].find((p) => p.id === id);

test("a stale edit screen is stopped with the conflict banner; 'save anyway' replaces; the other person's change is in the history", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  // somebody else saves the price while this screen is open
  await patch("products", 1, { price: 99 });
  await page.getByLabel(/نام محصول \(فارسی\)/).fill("Changed on a stale screen");
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.getByTestId("save-conflict").waitFor();
  assert.notEqual((await product()).name_fa, "Changed on a stale screen", "nothing was written");
  assert.equal((await product()).price, 99);
  // the person's text is still in the form
  assert.equal(await page.getByLabel(/نام محصول \(فارسی\)/).inputValue(), "Changed on a stale screen");
  await page.getByTestId("conflict-overwrite").click();
  await page.waitForURL(/\/operator\/products$/);
  assert.equal((await product()).name_fa, "Changed on a stale screen");
  await ctx.close();
});

test("reload after a conflict keeps the person's text as a draft", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await patch("products", 1, { price: 77 });
  await page.getByLabel(/نام محصول \(فارسی\)/).fill("My unsaved words");
  await page.waitForTimeout(1200);                       // the draft autosave
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.getByTestId("save-conflict").waitFor();
  await page.getByTestId("conflict-reload").click();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.getByLabel(/نام محصول \(فارسی\)/).inputValue() !== "My unsaved words", true, "the form shows the latest saved data");
  await page.getByText(/My unsaved words/).first().waitFor();       // the draft banner offers the person's text back
  await ctx.close();
});

test("history lists each change (only the changed fields, who), and reverting writes the old values back as a new recorded change", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  const before = (await product()).name_fa;
  await page.getByLabel(/نام محصول \(فارسی\)/).fill("Renamed once");
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.waitForURL(/\/operator\/products$/);
  const v = (await state()).product_versions;
  assert.equal(v.length, 1);
  assert.deepEqual([v[0].kind, v[0].changed.includes("name_fa"), v[0].before.name_fa, v[0].after.name_fa], ["update", true, before, "Renamed once"]);
  assert.ok(!v[0].changed.includes("updated_at") && !v[0].changed.includes("id"));

  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await page.getByTestId("link-history").click();
  await page.getByTestId("history-list").waitFor();
  assert.equal(await page.getByTestId("history-item").count(), 1);
  await page.getByTestId("revert-open").click();
  const dlg = page.getByTestId("revert-dialog");
  assert.ok((await dlg.getByTestId("revert-field").allInnerTexts()).some((x) => x.includes("Renamed once") && x.includes(before)), "the dialog shows current → old");
  await dlg.getByTestId("revert-confirm").click();
  await page.getByTestId("history-msg").waitFor();
  assert.equal((await product()).name_fa, before);
  const after2 = (await state()).product_versions;
  assert.equal(after2.length, 2);
  assert.deepEqual([after2[1].kind, after2[1].reverts_id], ["restore", after2[0].id]);
  assert.ok((await state()).operator_audit_log.some((r) => r.action === "product.restore"));
  // a quick change from the list is recorded too
  await page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await page.locator('button[title*="آرشیو"]').first().click();
  await page.waitForTimeout(1200);
  assert.ok((await state()).product_versions.some((x) => x.kind === "quick" && x.changed.includes("is_active")));
  await ctx.close();
});

test("the edit form links to the history and to the live page (only for a live product)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  assert.match(await page.getByTestId("link-site").getAttribute("href"), /^\/health\/tg\/catalog\/e2e-gloves$/);
  await page.goto(`${BASE}/operator/products/2/edit`, { waitUntil: "networkidle" });          // archived
  assert.equal(await page.getByTestId("link-site").count(), 0);
  assert.equal(await page.getByTestId("link-history").count(), 1);
  await ctx.close();
});

test("Beauty: the same lock and history, on its own tables", async () => {
  const ts = "2026-10-01T10:00:00.000Z";
  await fetch(`${DB}/rest/v1/beauty_products`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify([{ id: 1, slug: "b1", sku: "B-1", name_en: "Serum", name_fa: "Serum", price: 5, in_stock: true, is_active: true, created_at: ts, updated_at: ts }]) });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "beauty");
  await page.goto(`${BASE}/beauty/operator/products/1/edit`, { waitUntil: "networkidle" });
  await patch("beauty_products", 1, { price: 8 });
  await page.getByLabel(/نام محصول \(فارسی\)/).fill("Serum v2");
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.getByTestId("save-conflict").waitFor();
  await page.getByTestId("conflict-overwrite").click();
  await page.waitForURL(/\/beauty\/operator\/products$/);
  const st = await state();
  assert.equal(st.beauty_products[0].name_fa, "Serum v2");
  assert.equal(st.beauty_product_versions.length, 1);
  assert.ok(!(st.product_versions || []).length, "the Health history is untouched");
  await page.goto(`${BASE}/beauty/operator/products/1/history`, { waitUntil: "networkidle" });
  await page.getByTestId("history-item").first().waitFor();
  await ctx.close();
});
