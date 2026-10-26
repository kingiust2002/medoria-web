// End-to-end, real browser: the Quotes screen stays truthful and usable (reproduced 2026-10-26).
//   * a request that arrives while the screen is open shows up after the next refresh (it stayed invisible
//     until a full reload); changes and removals made in another session follow too; an edit still being
//     typed is not overwritten
//   * the single-delete dialog keeps Confirm and Cancel on screen at 320×568 with a long message, also with an
//     error showing, and so does the bulk dialog
// Both panels use the same screen; the data is restored before every test.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, poll, login, setFault, clearFaults } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await clearFaults(); await resetDb(); });

const SERVICE = "service-test-key";
const rest = (table, method, query = "", body) => fetch(`${DB}/rest/v1/${table}${query}`, { method, headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
const row = (extra = {}) => ({ name: "E2E Other Session", status: "new", phone: "+992900000077", preferred_contact: "whatsapp", language: "en", message: "", internal_notes: "", created_at: "2026-10-25T10:00:00.000Z", ...extra });

const HOUSES = [
  { house: "health", table: "quote_requests", path: "/operator/quotes", seedName: "E2E Customer" },
  { house: "beauty", table: "beauty_quote_requests", path: "/beauty/operator/quotes", seedName: "E2E Beauty Customer" },
];

for (const h of HOUSES) {
  test(`${h.house}: a request added elsewhere appears after the next refresh, without a full reload`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await login(page, h.house);
    await page.goto(`${BASE}${h.path}`, { waitUntil: "load" });
    await page.getByText(h.seedName).first().waitFor();
    assert.equal(await page.getByText("E2E Other Session").count(), 0);

    assert.equal((await rest(h.table, "POST", "", row())).status, 201);         // "another session" files a request
    // any successful action ends in router.refresh(): archive the first request
    await page.getByLabel(new RegExp(`^انتخاب ${h.seedName}`)).first().check();
    await page.getByRole("button", { name: "آرشیو", exact: true }).first().click();
    await page.getByText(/به آرشیو منتقل شد/).waitFor({ timeout: 10000 });
    await page.getByText("E2E Other Session").first().waitFor({ timeout: 10000 });   // red before the fix: stays absent until reload
    await ctx.close();
  });
}

test("health: changes and removals made in another session follow; a note being typed is kept, an untouched one follows", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/quotes`, { waitUntil: "load" });
  await page.getByText("E2E Customer 1").first().waitFor();

  // open request 1 and start typing a note; open request 2 (untouched note)
  await page.getByText("E2E Customer 1").first().click();
  const notes = page.getByPlaceholder("یادداشت پیگیری…");
  await notes.first().fill("my unsaved draft");

  // another session: request 2 becomes spam, request 1 gets a saved note, request 5 (archived) is deleted, a new one arrives
  await rest("quote_requests", "PATCH", "?id=eq.2", { status: "spam" });
  await rest("quote_requests", "PATCH", "?id=eq.1", { internal_notes: "note from elsewhere" });
  await rest("quote_requests", "DELETE", "?id=eq.5");
  await rest("quote_requests", "POST", "", row({ name: "E2E Arrived Later" }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));               // coming back to the tab
  await page.getByText("E2E Arrived Later").first().waitFor({ timeout: 10000 });
  assert.equal(await page.getByText("E2E Customer 2").count(), 0, "request 2 moved to spam elsewhere: gone from the active tab");
  assert.equal(await notes.first().inputValue(), "my unsaved draft", "text being typed must not be overwritten");

  await page.getByRole("tab", { name: /آرشیو/ }).click();
  assert.equal(await page.getByText("E2E Customer 5").count(), 0, "a request deleted elsewhere disappears");
  await page.getByRole("tab", { name: /اسپم/ }).click();
  await page.getByText("E2E Customer 2").first().waitFor();
  await ctx.close();
});

async function longRequest() {
  await rest("quote_requests", "POST", "", row({
    name: "E2E Long Message", organization: "Very Long Organisation Name LLC", phone: "+992900123456", product_name: "Surgical gloves nitrile powder-free box of 100",
    product_sku: "GLV-NIT-100-M", message: "x".repeat(40) + " " + "A long customer message that describes quantities, delivery terms and many other things. ".repeat(4),
  }));
}

test("the single-delete dialog keeps Confirm and Cancel on screen at 320×568, with a long message and with an error showing", async () => {
  await longRequest();
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/quotes`, { waitUntil: "load" });
  await page.getByText("E2E Long Message").first().waitFor();
  await page.getByRole("button", { name: "حذف درخواست E2E Long Message" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();

  const inside = async (locator, label) => {
    const b = await locator.boundingBox();
    assert.ok(b, `${label}: not visible`);
    assert.ok(b.y >= 0 && b.y + b.height <= 568 + 1, `${label}: y ${Math.round(b.y)}..${Math.round(b.y + b.height)} is outside the 568px screen`);
    assert.ok(b.x >= 0 && b.x + b.width <= 320 + 1, `${label}: x ${Math.round(b.x)}..${Math.round(b.x + b.width)} is outside the 320px screen`);
  };
  const box = await dialog.boundingBox();
  assert.ok(box.height <= 568, `the dialog (${Math.round(box.height)}px) is taller than the screen`);
  await inside(dialog.getByRole("button", { name: "حذف درخواست", exact: true }), "Confirm");
  await inside(dialog.getByRole("button", { name: "انصراف" }), "Cancel");

  // an error message makes the dialog taller still: the buttons must stay reachable
  await setFault("quote_requests", "DELETE", 500);
  await dialog.getByRole("button", { name: "حذف درخواست", exact: true }).click();
  await dialog.getByRole("alert").waitFor({ timeout: 10000 });
  await inside(dialog.getByRole("button", { name: "حذف درخواست", exact: true }), "Confirm (with error)");
  await inside(dialog.getByRole("button", { name: "انصراف" }), "Cancel (with error)");

  // and the retry works once the fault is gone
  await clearFaults();
  await dialog.getByRole("button", { name: "حذف درخواست", exact: true }).click();
  await poll(async () => !(await state()).quote_requests.some((q) => q.name === "E2E Long Message"), { label: "the request to be deleted" });
  await ctx.close();
});

test("the bulk-delete dialog keeps its buttons on screen at 320×568 too", async () => {
  for (let i = 0; i < 6; i++) await rest("quote_requests", "POST", "", row({ name: `E2E Bulk ${i}`, organization: "Organisation With A Long Name LLC", product_name: "Surgical gloves nitrile powder-free box of 100" }));
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/quotes`, { waitUntil: "load" });
  await page.getByText("E2E Bulk 0").first().waitFor();
  await page.getByLabel(/انتخاب همه/).check();
  await page.getByRole("button", { name: "حذف", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const box = await dialog.boundingBox();
  assert.ok(box.height <= 568, `the dialog (${Math.round(box.height)}px) is taller than the screen`);
  for (const name of [/^حذف \d+ درخواست$/, "انصراف"]) {
    const b = await dialog.getByRole("button", { name }).boundingBox();
    assert.ok(b && b.y >= 0 && b.y + b.height <= 569, `${name}: y ${Math.round(b?.y)}..${Math.round((b?.y || 0) + (b?.height || 0))} outside the screen`);
  }
  await ctx.close();
});
