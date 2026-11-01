// N7 — category images with a focal point, in a real browser against the fake database + fake storage.
// Health: a category gains a real uploaded image (not just a URL field) and a focal point chosen in the panel; the image lands in
// product-images/categories and the image library lists it as used by that category. Beauty: the same focal point on its own
// category image. The modal with the picker fits a 320 px phone. The picker is keyboard-driven, so the saved value is deterministic.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login, poll } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const call = (method, path, body) => fetch(`${DB}/rest/v1/${path}`, { method, headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function setFocusByKeyboard(page, presses, expected) {
  const box = page.getByTestId("focus-point");
  await box.waitFor();
  await box.focus();
  for (const key of presses) await box.press(key);
  await poll(async () => (await box.getAttribute("data-focus")) === expected, { label: `focus ${expected}` });
}

test("Health: a category gets a real uploaded image + focal point; the library lists it as used", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/categories`, { waitUntil: "networkidle" });

  // edit the first category ("Gloves", id 1 in the seed)
  await page.locator('button[title="ویرایش"]').first().click();
  await page.getByTestId("cat-image-file").setInputFiles({ name: "cat.png", mimeType: "image/png", buffer: PNG });
  // the focal-point picker appears once an image is set; move it off centre (55% 55%) with the arrow keys
  await setFocusByKeyboard(page, ["ArrowRight", "ArrowDown"], "55% 55%");
  await page.getByRole("button", { name: "ذخیره" }).click();
  await page.getByText("دسته ویرایش شد.").waitFor();

  const cat = (await state()).categories.find((c) => c.id === 1);
  assert.ok(/^categories\/.+\.png$/.test(cat.image_url), `image stored under categories/: ${cat.image_url}`);
  assert.equal(cat.image_focus, "55% 55%");
  assert.ok((await state()).storage_objects.some((o) => o.bucket === "product-images" && o.name === cat.image_url), "the file is in the product-images bucket");

  // the image library shows the new category file as used by the category (fresh DB → it is the only file)
  await page.goto(`${BASE}/operator/media`, { waitUntil: "networkidle" });
  const item = page.getByTestId("media-item").first();
  await item.waitFor();
  assert.equal(await page.getByTestId("media-item").count(), 1, "the uploaded Health category image is listed");
  assert.equal(await item.getAttribute("data-unused"), "false", "it is shown as used, never removable while in use");
  assert.match(await item.innerText(), /gloves/, "it says which category uses it");
  assert.equal(await item.getByTestId("media-delete").count(), 0, "a used category image has no delete button");
  await ctx.close();
});

test("Beauty: its own category image carries its own focal point", async () => {
  await call("POST", "beauty_categories", [{ id: 1, slug: "serums", world: "serums", level: 1, parent_id: null, name_fa: "سرم‌ها", name_en: "Serums", name_ru: "", name_tg: "", icon: "", is_active: true, is_featured: false, sort_order: 1 }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "beauty");
  await page.goto(`${BASE}/beauty/operator/categories`, { waitUntil: "networkidle" });

  await page.locator('button[title="بیشتر"]').first().click();
  await page.getByText("ویرایش", { exact: true }).click();
  await page.getByTestId("cat-image-file").setInputFiles({ name: "serum.png", mimeType: "image/png", buffer: PNG });
  await setFocusByKeyboard(page, ["ArrowLeft", "ArrowLeft"], "40% 50%");
  await page.getByRole("button", { name: "ذخیره" }).click();
  await page.getByText("دسته ویرایش شد.").waitFor();

  const cat = (await state()).beauty_categories.find((c) => c.id === 1);
  assert.equal(cat.image_focus, "40% 50%");
  assert.ok(/^categories\/.+\.png$/.test(cat.image_url), `beauty image under categories/: ${cat.image_url}`);
  await ctx.close();
});

test("the category modal with the focal-point picker fits a 320 px phone", async () => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/categories`, { waitUntil: "networkidle" });
  await page.locator('button[title="ویرایش"]').first().click();
  await page.getByTestId("cat-image-file").setInputFiles({ name: "cat.png", mimeType: "image/png", buffer: PNG });
  await page.getByTestId("focus-point").waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `no horizontal overflow at 320 px (was ${overflow}px over)`);
  await ctx.close();
});
