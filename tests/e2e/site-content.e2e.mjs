// Site content (banner + FAQ) end to end, against the fake database (whose public reads mirror migration 42's policy: live rows, public
// columns only): a person creates an announcement and an FAQ item in the panel, the public pages show them (server-rendered, JS off) in the
// visitor's language with the Tajik/English fallback, an unsafe link is refused, markup in a text stays text, switching it off removes it,
// Health's content never appears in Beauty, and a stale save is refused.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login, poll } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const html = async (path) => (await fetch(`${BASE}${path}`, { headers: { accept: "text/html" } })).text();
const publicHas = (path, needle, want = true) => poll(async () => (await html(path)).includes(needle) === want, { label: `${path} ${want ? "has" : "lacks"} ${needle}`, timeout: 30000 });

async function openContent(page, house = "health", kindTab) {
  await login(page, house);
  await page.goto(`${BASE}${house === "beauty" ? "/beauty/operator" : "/operator"}/content`, { waitUntil: "networkidle" });
  if (kindTab) await page.getByTestId(`ct-tab-${kindTab}`).click();
}
async function fillLang(page, lang, fields) {
  await page.getByTestId(`ct-lang-${lang}`).click();
  for (const [testid, value] of Object.entries(fields)) await page.getByTestId(testid).fill(value);
}

test("Health: a banner is created in the panel and shown on the public pages in the visitor's language; switching it off removes it; Beauty never shows it", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openContent(page);
  await page.getByText("هنوز اعلانی ساخته نشده").waitFor();
  assert.equal(await (await fetch(`${BASE}/health/en`)).text().then((t) => t.includes("site-banner")), false, "nothing is published: the page is exactly as before");

  await page.getByTestId("ct-new").click();
  await fillLang(page, "tg", { "ct-text": "Эълони санҷишӣ E2E" });
  await fillLang(page, "en", { "ct-text": "E2E test announcement" });
  await page.getByTestId("ct-link").fill("/health/en/catalog");
  await page.getByRole("switch", { name: /منتشر شود/ }).click();
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-form").waitFor({ state: "detached" });

  let st = await state();
  assert.deepEqual([st.site_content.length, st.site_content[0].house, st.site_content[0].kind, st.site_content[0].is_published], [1, "health", "banner", true]);
  assert.equal(st.site_content[0].data.link, "/health/en/catalog");
  assert.ok(st.operator_audit_log.some((r) => r.action === "content.create" && r.result === "success"));

  await publicHas("/health/en", "E2E test announcement");
  assert.match(await html("/health/en"), /data-testid="site-banner"/);
  await publicHas("/health/tg", "Эълони санҷишӣ E2E");
  await publicHas("/health/ru", "Эълони санҷишӣ E2E");      // no Russian text: the Tajik one is the fallback
  assert.equal((await html("/beauty/en")).includes("E2E test announcement"), false, "Health's banner is not Beauty's");

  // a visitor with JS off sees it too; the link is a real anchor
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const pub = await noJs.newPage();
  await pub.goto(`${BASE}/health/en`, { waitUntil: "domcontentloaded" });
  assert.match(await pub.getByTestId("site-banner").innerText(), /E2E test announcement/);
  assert.equal(await pub.getByTestId("site-banner").locator("a").first().getAttribute("href"), "/health/en/catalog");
  await noJs.close();

  // switch it off
  await page.getByTestId("ct-open").first().click();
  await page.getByRole("switch", { name: /منتشر شود/ }).click();
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-form").waitFor({ state: "detached" });
  assert.equal((await state()).site_content[0].is_published, false);
  await publicHas("/health/en", "E2E test announcement", false);
  await ctx.close();
});

test("an unsafe link is refused; markup in a text stays text; a scheduled banner is not shown yet", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openContent(page);
  await page.getByTestId("ct-new").click();
  await fillLang(page, "en", { "ct-text": "bad link" });
  await page.getByTestId("ct-link").fill("javascript:alert(1)");
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-error").waitFor();
  assert.match(await page.getByTestId("ct-error").innerText(), /https:\/\//);
  assert.equal((await state()).site_content?.length ?? 0, 0);

  await page.getByTestId("ct-link").fill("");
  await fillLang(page, "en", { "ct-text": '<img src=x onerror=alert(1)> E2E markup' });
  await page.getByRole("switch", { name: /منتشر شود/ }).click();
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-form").waitFor({ state: "detached" });
  await publicHas("/health/en", "E2E markup");
  const body = await html("/health/en");
  assert.ok(body.includes("&lt;img src=x onerror=alert(1)&gt;"), "the text is escaped");
  assert.ok(!body.includes("<img src=x onerror"), "no markup from content");

  // scheduled for tomorrow: saved as scheduled, not live
  await page.getByTestId("ct-new").click();
  await fillLang(page, "en", { "ct-text": "E2E scheduled later" });
  await page.getByRole("switch", { name: /منتشر شود/ }).click();
  const d = new Date(Date.now() + 36 * 3_600_000 + 5 * 3_600_000).toISOString().slice(0, 16);      // team time = UTC+5
  await page.getByTestId("ct-start").fill(d);
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-form").waitFor({ state: "detached" });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator('[data-testid="ct-row"][data-status="scheduled"]').count(), 1);
  assert.equal((await html("/health/en")).includes("E2E scheduled later"), false);
  await ctx.close();
});

test("FAQ: shown on the contact page as server-rendered details with FAQPage data, in order, only what is live", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openContent(page, "health", "faq");
  for (const [n, q, a] of [[2, "E2E second question?", "second answer"], [1, "E2E first question?", "first answer"]]) {
    await page.getByTestId("ct-new").click();
    await fillLang(page, "en", { "ct-q": q, "ct-a": a });
    await page.getByLabel("ترتیب").fill(String(n));
    await page.getByRole("switch", { name: /منتشر شود/ }).click();
    await page.getByTestId("ct-save").click();
    await page.getByTestId("ct-form").waitFor({ state: "detached" });
  }
  await page.getByTestId("ct-new").click();
  await fillLang(page, "en", { "ct-q": "E2E draft question?", "ct-a": "draft answer" });
  await page.getByTestId("ct-save").click();                      // left as a draft
  await page.getByTestId("ct-form").waitFor({ state: "detached" });

  await publicHas("/health/en/contact", "E2E first question?");
  const body = await html("/health/en/contact");
  assert.ok(body.indexOf("E2E first question?") < body.indexOf("E2E second question?"), "ordered by the order number");
  assert.ok(!body.includes("E2E draft question?"), "a draft is not public");
  assert.match(body, /"@type":"FAQPage"/);
  assert.match(body, /data-testid="site-faq-item"/);
  assert.ok(!(await html("/beauty/en/contact")).includes("E2E first question?"));
  // a question without an answer in the same language is refused
  await page.getByTestId("ct-new").click();
  await fillLang(page, "tg", { "ct-q": "Савол бе ҷавоб" });
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-error").waitFor();
  await ctx.close();
});

test("Beauty has its own content; a stale save is refused; delete removes it", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openContent(page, "beauty");
  await page.getByTestId("ct-new").click();
  await fillLang(page, "en", { "ct-text": "E2E beauty announcement" });
  await page.getByRole("switch", { name: /منتشر شود/ }).click();
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-form").waitFor({ state: "detached" });
  await publicHas("/beauty/en", "E2E beauty announcement");
  assert.ok(!(await html("/health/en")).includes("E2E beauty announcement"));
  assert.equal((await state()).site_content[0].house, "beauty");

  // two screens: the second saves first, the first is stale
  const other = await ctx.newPage();
  await other.goto(`${BASE}/beauty/operator/content`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("ct-open").first().click();
  await other.getByTestId("ct-open").first().click();
  await fillLang(other, "en", { "ct-text": "E2E beauty edited by the other" });
  await other.getByTestId("ct-save").click();
  await other.getByTestId("ct-form").waitFor({ state: "detached" });
  await fillLang(page, "en", { "ct-text": "E2E beauty edited late" });
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-error").waitFor();
  assert.match(await page.getByTestId("ct-error").innerText(), /تغییر کرده/);
  assert.equal((await state()).site_content[0].data.text.en, "E2E beauty edited by the other");

  await page.getByRole("button", { name: "بارگذاری دوباره" }).click();
  await page.getByTestId("ct-delete").first().click();
  await poll(async () => ((await state()).site_content || []).length === 0, { label: "row deleted" });
  await publicHas("/beauty/en", "E2E beauty edited by the other", false);
  await ctx.close();
});
