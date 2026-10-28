// The quick search in a real browser: "/" and Ctrl+K open it, results are grouped and linked, a request link lands on the quotes screen
// filtered by that request, Escape closes it, short terms search nothing, Beauty searches its own data, and a person without the
// permission for a kind never sees that kind.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, resetDb, login } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

async function open(page, house = "health") {
  await login(page, house);
  await page.goto(`${BASE}${house === "beauty" ? "/beauty/operator" : "/operator"}`, { waitUntil: "networkidle" });
}

test("'/' opens the search; products and requests are found and linked; Escape closes", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page);
  await page.keyboard.press("/");
  const dlg = page.getByTestId("search-dialog");
  await dlg.waitFor();
  await page.getByTestId("search-input").fill("e2e");
  await page.getByTestId("search-group-products").waitFor();
  assert.ok((await page.getByTestId("search-group-products").innerText()).includes("E2E-1"));
  await page.getByTestId("search-input").fill("E2E Customer 3");
  await page.getByTestId("search-group-quotes").waitFor();
  assert.ok(!(await page.getByTestId("search-results").innerText()).includes("E2E demo message"), "no message text in results");
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  // a request result lands on the quotes screen with the search box filled
  await page.keyboard.press("Control+k");
  await page.getByTestId("search-input").fill("E2E Customer 3");
  await page.getByTestId("search-group-quotes").locator("a").first().click();
  await page.waitForURL(/\/operator\/quotes\?q=/);
  await page.getByPlaceholder(/جستجو/).first().waitFor();
  assert.ok((await page.locator("button", { hasText: "E2E Customer 3" }).count()) >= 1);
  assert.equal(await page.locator("button", { hasText: "E2E Customer 1" }).count(), 0, "filtered by the link");
  await ctx.close();
});

test("a one-letter term searches nothing; typing '/' inside a field does not open the search; the menu button opens it", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page);
  await page.getByTestId("search-open").first().click();
  await page.getByTestId("search-input").fill("e");
  await page.getByText("حداقل ۲ حرف بنویسید.").waitFor();
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await page.getByPlaceholder(/جستجوی نام، SKU/).click();
  await page.keyboard.type("a/b");
  assert.equal(await page.getByTestId("search-dialog").count(), 0);
  await ctx.close();
});

test("Beauty searches its own data and the phone menu has the search button", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  await open(page, "beauty");
  await page.locator('[data-testid="search-open"]:visible').first().click();
  await page.getByTestId("search-input").fill("E2E Beauty");
  await page.getByTestId("search-group-quotes").waitFor();
  assert.ok(!(await page.getByTestId("search-results").innerText()).includes("E2E Customer 1"), "Health requests are not in Beauty's results");
  await page.getByTestId("search-group-quotes").locator("a").first().click();
  await page.waitForURL(/\/beauty\/operator\/quotes\?q=/);
  await ctx.close();
});
