// The product form's preview per language and its checklist, in a real browser: what a visitor of each language sees (the public site's
// fallback to English is shown as a badge), it updates while typing, the checklist names what is missing, and none of it blocks a save.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, state, resetDb, login } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

test("Health: the preview follows the visitor's language, shows the fallback while typing, lists the gaps, and a save still works", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  const view = page.getByTestId("preview-languages");
  await view.waitFor();
  assert.match(await page.getByTestId("pv-name").innerText(), /E2E Product 1/, "Tajik is the first tab and has its own text");
  assert.equal(await page.getByTestId("pv-name-fallback").count(), 0);

  await page.getByText("نام‌های روسی و تاجیکی (اختیاری)").click();                // the Russian / Tajik names sit in a collapsed section
  await page.getByLabel("نام (تاجیکی)").fill("");                               // the Tajik name is removed in the form
  await page.getByTestId("pv-lang-tg").click();
  await page.getByTestId("pv-name-fallback").waitFor();
  assert.match(await page.getByTestId("pv-name-fallback").innerText(), /EN/, "the badge says English is shown instead");
  assert.match(await page.getByTestId("pv-name").innerText(), /E2E Product 1/);

  await page.getByTestId("pv-lang-fa").click();
  assert.equal(await page.getByTestId("pv-view").getAttribute("dir"), "rtl");

  const list = await page.getByTestId("pv-checklist").innerText();
  assert.match(list, /هنوز کامل نیست/);
  assert.match(list, /تصویر/, "the product has no image");
  assert.match(list, /نام \(تاجیکی\)/, "and now no Tajik name");

  // none of this blocks the save
  await page.getByRole("button", { name: /ذخیره/ }).first().click();
  await page.waitForURL(/\/operator\/products(\?|$)/, { timeout: 15000 }).catch(() => {});
  const saved = (await state()).products.find((p) => p.id === 1);
  assert.ok(!saved.name_tg, "the saved product has the emptied Tajik name (stored as empty)");
  await ctx.close();
});
