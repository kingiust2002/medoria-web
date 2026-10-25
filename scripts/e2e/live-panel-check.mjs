#!/usr/bin/env node
// Live check of the Health panel → public site loop, for ONE test product that you made
// for this purpose (price change → archive → 404 → reactivate → page back → price restored).
//
//   LIVE_BASE=https://medoriaco.com LIVE_SLUG=zz-test-product LIVE_NAME="ZZ TEST (delete me)" \
//   LIVE_USER=<panel user> node scripts/e2e/live-panel-check.mjs
//
// The password is read from LIVE_PASSWORD or typed at a hidden prompt; it is never printed or
// written anywhere. The product must exist, have a fixed price (not "request price"), and be
// ACTIVE when you start. The script restores the price and the active state in a `finally`,
// and prints a PASS/FAIL line per step. It changes one test product and nothing else.
//
// The same function runs in CI against the fake database (tests/e2e/live-check.e2e.mjs), so the
// script itself is tested; what is NOT tested without you is the real site and its real data.
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const PRICE_TEST = "7.77";

async function loadChromium() {
  const require = createRequire(import.meta.url);
  for (const n of ["playwright", "playwright-core"]) { try { return require(n).chromium; } catch { /* next */ } }
  throw new Error("Playwright is not installed: run `npm i --no-save playwright` first.");
}

async function status(base, path) {
  const r = await fetch(base + path, { redirect: "manual" });
  return { code: r.status, text: await r.text() };
}

async function waitFor(fn, label, timeout = 30000) {
  const t0 = Date.now();
  for (;;) {
    let v; try { v = await fn(); } catch { v = false; }
    if (v) return Date.now() - t0;
    if (Date.now() - t0 > timeout) throw new Error(`timed out after ${timeout} ms: ${label}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function runLiveCheck({ base, slug, name, user, password, lang = "en", log = console.log, headless = true }) {
  base = base.replace(/\/$/, "");
  const results = [];
  const step = async (label, fn) => {
    try { const extra = await fn(); results.push({ label, ok: true }); log(`✓ PASS  ${label}${extra ? ` (${extra})` : ""}`); }
    catch (e) { results.push({ label, ok: false, error: e.message }); log(`✗ FAIL  ${label} — ${e.message}`); throw e; }
  };

  const pageUrl = `/health/${lang}/catalog/${slug}`;
  const before = await status(base, pageUrl);
  if (before.code !== 200) throw new Error(`the test product page answers ${before.code}, expected 200 (it must exist and be active before the check)`);
  const m = before.text.match(/\$(\d+\.\d{2})/);
  if (!m) throw new Error("the test product has no fixed price on the page; give it one first");
  const originalPrice = m[1];

  const chromium = await loadChromium();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : { headless });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  let archived = false;
  let priceChanged = false;

  const row = () => page.locator("div", { hasText: name }).filter({ has: page.locator('button[title="ویرایش قیمت"]') }).last();
  const setPrice = async (value) => {
    await page.goto(`${base}/operator/products`, { waitUntil: "networkidle" });
    await row().locator('button[title="ویرایش قیمت"]').click();
    await row().locator('input[type="number"]').fill(value);
    await row().locator('input[type="number"]').press("Enter");
    await page.getByText("قیمت ذخیره شد.").first().waitFor({ timeout: 15000 });
  };
  const toggle = async (title, doneText) => {
    await page.goto(`${base}/operator/products`, { waitUntil: "networkidle" });
    await row().locator(`button[title="${title}"]`).click();
    await page.getByText(doneText).first().waitFor({ timeout: 15000 });
  };

  try {
    await step("log in to the Health panel", async () => {
      await page.goto(`${base}/login/health`, { waitUntil: "networkidle" });
      await page.fill('input[name="username"]', user);
      await page.fill('input[name="password"]', password);
      await Promise.all([page.waitForURL((u) => /\/operator(\/|$)/.test(u.pathname), { timeout: 20000 }), page.click('button[type="submit"]')]);
    });

    await step(`change the price ${originalPrice} → ${PRICE_TEST} and see it on the public page`, async () => {
      await setPrice(PRICE_TEST); priceChanged = true;
      const ms = await waitFor(async () => (await status(base, pageUrl)).text.includes(`$${PRICE_TEST}`), "new price on the public page");
      return `${ms} ms`;
    });

    await step("archive the product → the public page becomes a real 404", async () => {
      await toggle("آرشیو (غیرفعال)", "آرشیو شد."); archived = true;
      const ms = await waitFor(async () => (await status(base, pageUrl)).code === 404, "public page to answer 404");
      const sitemap = (await status(base, "/sitemap.xml")).text;
      if (sitemap.includes(slug)) throw new Error("the archived product is still in the sitemap");
      return `${ms} ms`;
    });

    await step("reactivate → the public page is back", async () => {
      await toggle("فعال‌سازی", "فعال شد."); archived = false;
      const ms = await waitFor(async () => (await status(base, pageUrl)).code === 200, "public page to answer 200");
      return `${ms} ms`;
    });

    await step(`restore the price ${PRICE_TEST} → ${originalPrice}`, async () => {
      await setPrice(originalPrice); priceChanged = false;
      const ms = await waitFor(async () => (await status(base, pageUrl)).text.includes(`$${originalPrice}`), "original price on the public page");
      return `${ms} ms`;
    });
  } finally {
    // best-effort restore of the starting state if a step failed half way
    try {
      if (archived) await toggle("فعال‌سازی", "فعال شد.");
      if (priceChanged) await setPrice(originalPrice);
    } catch (e) { log(`! could not restore the starting state automatically: ${e.message} — check the test product by hand`); }
    await browser.close();
  }
  return results;
}

async function hiddenPrompt(question) {
  if (!process.stdin.isTTY) throw new Error("set LIVE_PASSWORD, or run this in a terminal to be asked for it");
  process.stdout.write(question);
  return new Promise((resolve) => {
    let s = "";
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
    process.stdin.on("data", function onData(ch) {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off("data", onData); process.stdout.write("\n"); resolve(s); }
      else if (ch === "\u0003") process.exit(130);
      else if (ch === "\u007f") s = s.slice(0, -1);
      else s += ch;
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { LIVE_BASE, LIVE_SLUG, LIVE_NAME, LIVE_USER } = process.env;
  if (!LIVE_BASE || !LIVE_SLUG || !LIVE_NAME || !LIVE_USER) {
    console.error("Set LIVE_BASE, LIVE_SLUG, LIVE_NAME and LIVE_USER (see the header of this file).");
    process.exit(2);
  }
  const password = process.env.LIVE_PASSWORD || await hiddenPrompt("Panel password (hidden): ");
  try {
    await runLiveCheck({ base: LIVE_BASE, slug: LIVE_SLUG, name: LIVE_NAME, user: LIVE_USER, password });
    console.log("\nAll steps passed. The test product is back to its starting state.");
  } catch (e) {
    console.error(`\nFAILED: ${e.message}`);
    process.exit(1);
  }
}
