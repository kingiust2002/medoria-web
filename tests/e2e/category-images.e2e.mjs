// Category pictures in a real browser, both houses (docs/PANEL_CATEGORY_IMAGES.md): a picture is chosen, cropped on the person's device, uploaded through
// the safety check, and given a focus point; the public page shows it where the point says; a disguised file is refused in words; brand logos go
// through the same crop step; the dialogs fit a 320 px phone.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { BASE, launch, state, resetDb, poll, login, get, measureInPage } from "./helpers.mjs";

let browser, png;
before(async () => {
  browser = await launch();
  png = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 30, g: 120, b: 200 } } }).png().toBuffer();
});
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

// click a point of the focus picture, given as fractions of its size (waits until the picture has its real height)
async function clickFocus(page, fx, fy) {
  const area = page.getByTestId("focus-picker").locator('[role="group"]');
  await page.getByTestId("focus-picker").locator("img").first().evaluate((i) => (i.complete && i.naturalHeight ? true : new Promise((r) => { i.onload = () => r(true); })));
  await area.scrollIntoViewIfNeeded();
  const box = await area.boundingBox();
  await area.click({ position: { x: box.width * fx, y: box.height * fy } });
}
// E2E_SHOTS=<dir> saves screenshots for a visual check (not part of the assertions)
const shot = async (page, name) => { if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png` }); };
const file = (buffer = png, name = "pic.png", mimeType = "image/png") => ({ name, mimeType, buffer });
const objects = async () => (await state()).storage_objects || [];

test("Health: choose → crop → upload → focus → save; the public tile uses the point; clearing it returns to the centre", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/categories`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /دسته اصلی جدید/ }).click();
  await page.getByLabel("نام انگلیسی").first().fill("Test Tiles");
  await page.getByLabel("نام فارسی").first().fill("کاشی آزمایشی");

  await page.getByTestId("category-image-input").setInputFiles(file());
  const dialog = page.getByTestId("crop-dialog");
  await dialog.waitFor();
  await shot(page, "health-crop-4x3");
  await dialog.getByTestId("crop-aspect-16x9").click();
  await dialog.locator("#crop-zoom").fill("2");
  await dialog.getByTestId("crop-apply").click();
  await page.getByTestId("focus-picker").waitFor({ timeout: 20000 });
  const objs = await objects();
  assert.equal(objs.length, 1, "one file was uploaded");
  assert.match(objs[0].name, /^categories\/\d+-[a-z0-9]+-pic-crop\.png$/);
  assert.equal(objs[0].bucket, "product-images");

  // the focus point: tap the lower-left quarter of the picture
  await clickFocus(page, 0.25, 0.75);
  await shot(page, "health-focus");
  assert.ok(Math.abs(Number(await page.getByTestId("focus-x").inputValue()) - 25) <= 3);
  assert.ok(Math.abs(Number(await page.getByTestId("focus-y").inputValue()) - 75) <= 3);
  const fx = Number(await page.getByTestId("focus-x").inputValue()), fy = Number(await page.getByTestId("focus-y").inputValue());
  assert.match(await page.getByTestId("focus-preview").getAttribute("style"), new RegExp(`object-position:\\s*${fx}% ${fy}%`));
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await poll(async () => (await state()).categories.some((c) => c.slug === "test-tiles"), { label: "category saved" });
  const row = (await state()).categories.find((c) => c.slug === "test-tiles");
  assert.equal(row.image_url, objs[0].name);
  assert.deepEqual([row.image_focus_x, row.image_focus_y], [fx, fy]);

  // the public categories page shows the picture with the point
  const pub = await ctx.newPage();
  await pub.goto(`${BASE}/health/en/categories`, { waitUntil: "networkidle" });
  const img = pub.locator(`img[src$="${objs[0].name}"]`).first();
  await img.waitFor();
  await shot(pub, "health-public-categories");
  assert.match(await img.getAttribute("style"), new RegExp(`object-position:\\s*${fx}% ${fy}%`));

  // edit again: the point is shown, "image centre" clears it
  await page.goto(`${BASE}/operator/categories`, { waitUntil: "networkidle" });
  await page.getByTitle(/ویرایش/).last().click().catch(async () => { await page.getByText("کاشی آزمایشی").first().click(); });
  const picker = page.getByTestId("focus-picker");
  await picker.waitFor();
  assert.equal(Number(await page.getByTestId("focus-x").inputValue()), fx);
  await page.getByTestId("focus-reset").click();
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await poll(async () => (await state()).categories.find((c) => c.slug === "test-tiles").image_focus_x === null, { label: "focus cleared" });
  // (the public site caches the category list for up to two minutes — lib/supabase.js — so the cleared point is checked in the database only)

  // removing the picture from the category does not delete the file; the library still has it, now unused
  await page.goto(`${BASE}/operator/categories`, { waitUntil: "networkidle" });
  await page.getByTitle(/ویرایش/).last().click().catch(async () => { await page.getByText("کاشی آزمایشی").first().click(); });
  await page.getByTestId("category-image-remove").click();
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await poll(async () => !(await state()).categories.find((c) => c.slug === "test-tiles").image_url, { label: "picture removed" });
  assert.equal((await objects()).length, 1, "the file is still there");
  await ctx.close();
});

test("a disguised file is refused in words and nothing is stored; skipping the crop uploads the original", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/categories`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /دسته اصلی جدید/ }).click();
  await page.getByTestId("category-image-input").setInputFiles(file(Buffer.from("<html><script>alert(1)</script></html>".padEnd(64, " ")), "evil.png"));
  await page.getByTestId("crop-dialog").waitFor();
  await page.getByTestId("crop-skip").click();
  await page.getByText(/محتوای فایل یک تصویر معتبر نیست/).first().waitFor();
  assert.equal((await objects()).length, 0, "nothing was stored");
  await page.getByTestId("category-image-input").setInputFiles(file(png, "ok.png"));
  await page.getByTestId("crop-dialog").waitFor();
  await page.getByTestId("crop-skip").click();
  await page.getByTestId("focus-picker").waitFor({ timeout: 20000 });
  assert.match((await objects())[0].name, /ok\.png$/);
  // a wrong kind of file is stopped before it even leaves the browser
  await page.getByTestId("category-image-input").setInputFiles({ name: "a.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await page.getByText(/فقط JPG/).first().waitFor();
  assert.equal(await page.getByTestId("crop-dialog").count(), 0);
  await ctx.close();
});

test("the dialogs fit a 320 px phone (crop dialog and focus picker)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/categories`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /دسته اصلی جدید/ }).click();
  await page.getByTestId("category-image-input").setInputFiles(file());
  await page.getByTestId("crop-dialog").waitFor();
  await shot(page, "health-crop-320");
  let m = await page.evaluate(measureInPage);
  assert.equal(m.count, 0, `crop dialog: ${JSON.stringify(m.offenders?.slice(0, 3))}`);
  await page.getByTestId("crop-apply").click();
  await page.getByTestId("focus-picker").waitFor({ timeout: 20000 });
  await shot(page, "health-focus-320");
  m = await page.evaluate(measureInPage);
  assert.equal(m.count, 0, `focus picker: ${JSON.stringify(m.offenders?.slice(0, 3))}`);
  await ctx.close();
});

test("Beauty: a department picture with a focus point, a brand logo through the crop step", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "beauty");
  await page.goto(`${BASE}/beauty/operator/categories`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /دپارتمان جدید|دسته جدید/ }).first().click();
  await page.getByPlaceholder("face-serum").fill("test-dept");
  await page.getByPlaceholder("Facial Serum").fill("Test Dept");
  await page.getByPlaceholder("سرم پوست").fill("بخش آزمایشی");
  await page.getByTestId("category-image-input").setInputFiles(file());
  await page.getByTestId("crop-dialog").waitFor();
  await page.getByTestId("crop-apply").click();
  await page.getByTestId("focus-picker").waitFor({ timeout: 20000 });
  await clickFocus(page, 0.8, 0.2);
  const fx = Number(await page.getByTestId("focus-x").inputValue()), fy = Number(await page.getByTestId("focus-y").inputValue());
  assert.ok(fx >= 75 && fy <= 25);
  await page.getByRole("button", { name: "ذخیره", exact: true }).click();
  await poll(async () => (await state()).beauty_categories.some((c) => c.slug === "test-dept"), { label: "department saved" });
  const row = (await state()).beauty_categories.find((c) => c.slug === "test-dept");
  assert.match(row.image_url, /^categories\//);
  assert.deepEqual([row.image_focus_x, row.image_focus_y], [fx, fy]);
  assert.equal((await objects())[0].bucket, "beauty-product-images");

  // a brand logo: the crop dialog is offered, the original can be sent unchanged
  await page.goto(`${BASE}/beauty/operator/brands`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /افزودن برند|برند جدید/ }).first().click();
  await page.locator("#brand-logo-input").setInputFiles(file(png, "logo.png"));
  await page.getByTestId("crop-dialog").waitFor();
  await page.getByTestId("crop-skip").click();
  await poll(async () => (await objects()).some((o) => o.bucket === "beauty-brand-logos" && /^logos\/.*logo\.png$/.test(o.name)), { label: "logo stored" });
  await ctx.close();
});
