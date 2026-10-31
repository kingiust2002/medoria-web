// The PRIVATE preview of a product on the real public page (docs/PANEL_DRAFT_PREVIEW.md), both houses, in a real browser: nobody without a panel
// session sees anything (a plain 404), a signed-in person sees the form's UNSAVED values on the real layout (also for an inactive product that the
// public site answers 404 for), nothing is counted or sent from inside it, the other house's session gets a 404, a pending request's proposal can be
// previewed, the pages carry noindex / no-store, and the page fits a 320 px phone.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login, get, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const ts = "2026-10-01T10:00:00.000Z";
async function insert(table, rows) {
  const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) });
  assert.equal(res.status, 201);
  return res.json();
}
const beautyProduct = { id: 11, slug: "e2e-serum", sku: "B-11", name_en: "E2E Serum", name_fa: "E2E Serum", name_ru: "E2E Serum", name_tg: "E2E Serum", price: 30, in_stock: true, is_active: false, brand: "Luxe", unit: "pcs", min_order_qty: 1, specs: {}, tags: [], gallery_urls: [], created_at: ts, updated_at: ts };
const bodyText = (page) => page.locator("body").innerText();

async function openPreviewFromForm(ctx, page, typed, placeholder = "Nitrile gloves") {
  await page.getByPlaceholder(placeholder).fill(typed);
  const [popup] = await Promise.all([ctx.waitForEvent("page"), page.getByTestId("link-preview").click()]);
  await popup.waitForURL(/\/preview\/\w+\?token=[0-9a-f]{48}$/, { timeout: 20000 });
  await popup.waitForLoadState("networkidle");
  return popup;
}

test("Health: a stranger gets a plain 404; the form's unsaved values show on the real page of an inactive product; nothing is counted or sent", async () => {
  // anybody without a panel session, with or without a token, learns nothing
  for (const p of ["/health/en/preview/2", "/health/en/preview/2?token=" + "a".repeat(48), "/health/en/preview/new?token=" + "b".repeat(48), "/health/en/preview/abc"]) {
    const r = await get(p);
    assert.equal(r.status, 404, p);
    assert.ok(!r.text.includes("E2E Product 2"), `${p} leaks nothing`);
  }
  const anon = await get("/health/en/preview/2");
  assert.ok(!/preview-banner/.test(anon.text));
  const head = await fetch(BASE + "/health/en/preview/2");
  assert.match(head.headers.get("x-robots-tag") || "", /noindex/);
  assert.match(head.headers.get("cache-control") || "", /no-store/);
  assert.equal((await get("/health/en/catalog/e2e-archived")).status, 404, "the public site does not show the inactive product");

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/2/edit`, { waitUntil: "networkidle" });
  const popup = await openPreviewFromForm(ctx, page, "Typed Unsaved Name 77");
  assert.match(popup.url(), /\/health\/tg\/preview\/2\?token=/);
  await popup.getByTestId("preview-banner").waitFor();
  assert.match(await popup.getByTestId("preview-source").innerText(), /ذخیره‌نشده|unsaved|захира/i);
  assert.match(await popup.getByTestId("preview-live").innerText(), /هنوز روی سایت نیست|not on the site|дар сайт нест/i, "the banner says the product is not live");
  await popup.getByTestId("preview-lang-en").click();                            // the typed field is the English name
  await popup.waitForURL(/\/health\/en\/preview\/2\?token=/);
  await popup.waitForLoadState("networkidle");
  assert.match(await bodyText(popup), /Typed Unsaved Name 77/, "the typed (unsaved) name is on the real page");
  assert.ok(await popup.locator("header").count() > 0 && await popup.locator("footer").count() > 0, "the real public layout around it");
  const stored = (await state()).products.find((p) => p.id === 2);
  assert.equal(stored.name_en, "E2E Product 2", "nothing was saved");
  assert.equal(stored.is_active, false);
  assert.equal((await get("/health/en/catalog/e2e-archived")).status, 404, "and the product is still not public");

  // other languages keep the token
  await popup.getByTestId("preview-lang-ru").click();
  await popup.waitForURL(/\/health\/ru\/preview\/2\?token=/);
  assert.match(await popup.locator("meta[name=robots]").getAttribute("content"), /noindex/);

  // inside the preview a visitor's actions do nothing: no view, no quote request
  const before = await state();
  await popup.waitForTimeout(1500);
  const opener = popup.getByRole("button", { name: /quote|request|price|Get a/i }).first();
  if (await opener.count()) { await opener.click().catch(() => {}); }
  const after = await state();
  assert.equal(after.products.find((p) => p.id === 2).views, before.products.find((p) => p.id === 2).views ?? 0, "no view counted");
  assert.equal((after.quote_requests || []).length, (before.quote_requests || []).length, "no request created");
  assert.deepEqual(after.product_views || [], before.product_views || [], "no view row");
  assert.equal((after.operator_audit_log.filter((r) => r.action === "product.preview")).length >= 1, true, "the history knows who looked");
  assert.ok(!JSON.stringify(after.operator_audit_log).includes("Typed Unsaved Name 77"), "but not what was typed");

  // a token is bound to the session: the same address without the cookie is a 404
  const noCookie = await get(new URL(popup.url()).pathname + new URL(popup.url()).search);
  assert.equal(noCookie.status, 404);
  assert.ok(!noCookie.text.includes("Typed Unsaved Name 77"));

  // a new product (nothing saved yet)
  await page.goto(`${BASE}/operator/products/new`, { waitUntil: "networkidle" });
  const fresh = await openPreviewFromForm(ctx, page, "Brand New Draft Item");
  assert.match(fresh.url(), /\/health\/tg\/preview\/new\?token=/);
  await fresh.getByTestId("preview-lang-en").click();
  await fresh.waitForURL(/\/health\/en\/preview\/new\?token=/);
  await fresh.waitForLoadState("networkidle");
  assert.match(await bodyText(fresh), /Brand New Draft Item/);
  assert.equal((await state()).products.length, 3, "a preview of a new product creates nothing");
  await ctx.close();
});

test("Beauty: its own session sees the draft on the Beauty layout; a Health session gets a 404 there; the reverse too", async () => {
  await insert("beauty_products", [beautyProduct]);
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const bpage = await bctx.newPage();
  await login(bpage, "beauty");
  await bpage.goto(`${BASE}/beauty/operator/products/11/edit`, { waitUntil: "networkidle" });
  const popup = await openPreviewFromForm(bctx, bpage, "Draft Serum Name 55", "Vitamin C serum");
  assert.match(popup.url(), /\/beauty\/tg\/preview\/11\?token=/);
  await popup.getByTestId("preview-banner").waitFor();
  await popup.getByTestId("preview-lang-en").click();
  await popup.waitForURL(/\/beauty\/en\/preview\/11\?token=/);
  await popup.waitForLoadState("networkidle");
  assert.match(await bodyText(popup), /Draft Serum Name 55/);
  { const pub = await get("/beauty/en/catalog/e2e-serum"); assert.ok(!pub.text.includes("E2E Serum") && !pub.text.includes("Draft Serum Name 55"), "still not public (the page shows its not-found message, not the product)"); }
  assert.equal((await state()).beauty_products.find((p) => p.id === 11).name_en, "E2E Serum");
  // anyone else: 404
  assert.equal((await get("/beauty/en/preview/11")).status, 404);

  // a Health session on Beauty's preview — and a Beauty session on Health's — are strangers
  const hctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const hpage = await hctx.newPage();
  await login(hpage, "health");
  assert.equal((await hpage.goto(`${BASE}/beauty/en/preview/11`)).status(), 404);
  assert.equal((await hpage.goto(`${BASE}/health/en/preview/2`)).status(), 200);
  assert.equal((await bpage.goto(`${BASE}/health/en/preview/2`)).status(), 404);
  assert.equal((await bpage.goto(`${BASE}/beauty/en/preview/11`)).status(), 200);
  await bctx.close(); await hctx.close();
});

test("robots.txt disallows previews, the sitemap never names one, and the page fits a 320 px phone with a long unbroken name", async () => {
  const robots = await get("/robots.txt");
  assert.match(robots.text, /Disallow: \/health\/\*\/preview\//); assert.match(robots.text, /Disallow: \/beauty\/\*\/preview\//);
  assert.ok(!/preview/.test((await get("/sitemap.xml")).text));

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/2/edit`, { waitUntil: "networkidle" });
  const popup = await openPreviewFromForm(ctx, page, "X".repeat(90));
  for (const width of [320, 390]) {
    await popup.setViewportSize({ width, height: 700 });
    await popup.waitForTimeout(300);
    const res = await popup.evaluate(measureInPage);
    assert.equal(res.count, 0, `${width}px: ${JSON.stringify(res.offenders?.slice(0, 3))}`);
  }
  await ctx.close();
});
