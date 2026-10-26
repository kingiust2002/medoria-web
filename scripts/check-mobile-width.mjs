#!/usr/bin/env node
// Mobile-width law: no page may ever be wider than a phone screen.
//
//   npm run build && npm start        # in one terminal
//   npm run check:mobile              # http://localhost:3000, default routes
//   npm run check:mobile -- https://medoriaco.com --widths=320,390
//   npm run check:mobile -- --routes=/health/en,/health/en/catalog/some-slug
//
// Opens each route in a phone-sized browser (320, 360, 390, 430 px; plus 320×568, a short phone) and fails if:
//   * the page did not load, or answered anything but 2xx (a 404 is not coverage: assert an intended one
//     with --expect=/path:404), or is a "not found" / empty page served with 200;
//   * any element pokes past the screen edge. Elements inside a clipping/scrolling container and aria-hidden /
//     inert decoration are ignored, but position:fixed layers (headers, menus, dialogs, floating buttons) ARE
//     measured: they are laid out against the screen and are exactly what a phone user sees;
//   * a control inside a fixed layer sits outside the screen vertically with nothing to scroll it into view
//     (a dialog whose Confirm button is below the fold cannot be pressed);
//   * the same holds with the mobile menu open (home pages).
// It looks at elements, not at `scrollWidth`: the global `overflow-x: clip` guard hides sideways scrolling,
// so a clipped (cut-off) layout would otherwise pass unnoticed.
//
// Needs Playwright (a devDependency; in the Claude Code cloud sandbox it is pre-installed). Pass real
// product slugs with --routes to cover the pages whose content comes from the database.
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export const DEFAULT_WIDTHS = [320, 360, 390, 430];
export const LOCALES = ["tg", "ru", "en", "fa"];
// Only pages that exist: a route that answers 404 now FAILS the check (it used to pass as "coverage"), so the
// lists are per house. Health has the compare/wishlist/inquiry/print pages; Beauty has brands and worlds.
const PAGES = {
  health: ["", "/catalog", "/categories", "/about", "/contact", "/compare", "/wishlist", "/inquiry", "/print-catalog"],
  beauty: ["", "/catalog", "/about", "/contact", "/brands", "/worlds"],
};

export function defaultRoutes() {
  const routes = ["/"];
  for (const house of ["health", "beauty"]) {
    for (const l of LOCALES) for (const p of PAGES[house]) routes.push(`/${house}/${l}${p}`);
  }
  return routes;
}

// Runs inside the page. Returns the elements that overflow the screen edge (fixed layers included).
export function measureInPage() {
  const vw = document.documentElement.clientWidth;
  const clips = (o) => /(hidden|clip|auto|scroll)/.test(o.overflowX);
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (getComputedStyle(el).visibility === "hidden") continue;
    let skip = false;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      if (p !== el && clips(getComputedStyle(p))) { skip = true; break; }            // inside a clipping / scrolling box
      if (p.getAttribute("aria-hidden") === "true" || p.hasAttribute("inert")) { skip = true; break; } // decoration / closed layer
    }
    if (skip) continue;
    out.push({ tag: el.tagName.toLowerCase(), cls: String(el.className?.baseVal ?? el.className).slice(0, 80), left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || "").trim().slice(0, 40) });
  }
  return { vw, offenders: out.slice(0, 8), count: out.length };
}

// Runs inside the page. Controls inside a position:fixed layer that lie outside the screen vertically and
// cannot be scrolled into view (no scrollable box between the control and the fixed layer).
export function unreachableInPage() {
  const vh = document.documentElement.clientHeight;
  const out = [];
  // (the selector lives inside the function: it is serialized into the page and sees no module variables)
  for (const el of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.top >= -1 && r.bottom <= vh + 1) continue;
    if (getComputedStyle(el).visibility === "hidden") continue;
    let fixed = null, hidden = false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      if (p.getAttribute("aria-hidden") === "true" || p.hasAttribute("inert")) hidden = true;
      if (!fixed && getComputedStyle(p).position === "fixed") fixed = p;
    }
    if (hidden || !fixed) continue;   // closed layers are not shown; normal page content is reached by scrolling the page
    let reachable = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (/(auto|scroll)/.test(c.overflowY) && p.scrollHeight > p.clientHeight + 1) { reachable = true; break; }
      if (p === fixed) break;
    }
    if (!reachable) out.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40), top: Math.round(r.top), bottom: Math.round(r.bottom), vh });
  }
  return { vh, offenders: out.slice(0, 8), count: out.length };
}

// Runs inside the page. Why this page is not real content (empty string = fine).
export function contentProblemsInPage() {
  const text = (document.body?.innerText || "").trim();
  const h1 = (document.querySelector("h1")?.textContent || "").trim();
  if (/could not be found|page not found|^\s*404\b/i.test(document.title) || /^404$|could not be found|page not found/i.test(h1) || /This page could not be found/i.test(text)) return "this is a not-found page";
  if (/Application error|Internal Server Error/i.test(h1) || /Application error: a (client|server)-side exception/i.test(text)) return "this is an error page";
  if (text.length < 80) return `no real content (only ${text.length} characters of text)`;
  return "";
}

async function loadPlaywright() {
  const require = createRequire(import.meta.url); // honours NODE_PATH (ESM import() does not)
  for (const name of ["playwright", "playwright-core"]) {
    try { return require(name); } catch { /* try next */ }
    try { return await import(name); } catch { /* try next */ }
  }
  throw new Error("Playwright is not installed. Run `npm i --no-save playwright` first.");
}

const HOME_RE = /^\/(health|beauty)\/[a-z]{2}\/?$/;

// Loads every route at every viewport. `expect`: { "/path": 404 } for routes whose intended answer is not 2xx.
// Returns { failures, checked }; a failure is { width, height, route, kind, message?, offenders? }.
export async function checkPages({ browser, base, viewports, routes, expect = {}, menus = true }) {
  const failures = [];
  let checked = 0;
  for (const { width, height } of viewports) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    for (const route of routes) {
      const where = { width, height, route };
      checked++;
      let resp = null;
      try { resp = await page.goto(base + route, { waitUntil: "load", timeout: 30000 }); }
      catch (e) { failures.push({ ...where, kind: "navigation", message: `could not load the page (${String(e?.message || e).split("\n")[0].slice(0, 120)})` }); continue; }
      await page.waitForTimeout(600);

      const status = resp ? resp.status() : 0;
      const want = expect[route];
      if (want != null) {
        if (status !== want) failures.push({ ...where, kind: "status", message: `expected HTTP ${want}, got ${status}` });
      } else if (status < 200 || status >= 300) {
        failures.push({ ...where, kind: "status", message: `HTTP ${status}: not a page to measure (if ${status} is the intended outcome, pass --expect=${route}:${status})` });
        continue;
      } else {
        const why = await page.evaluate(contentProblemsInPage);
        if (why) { failures.push({ ...where, kind: "content", message: why }); continue; }
      }
      await measure(page, where, failures);

      if (menus && want == null && HOME_RE.test(route)) {
        const menu = page.locator('button[aria-label="Menu"]');
        if (await menu.isVisible().catch(() => false)) {
          await menu.click().catch(() => {});
          await page.waitForTimeout(500);
          await measure(page, { ...where, route: `${route} (menu open)` }, failures);
          await page.keyboard.press("Escape").catch(() => {});
        }
      }
    }
    await ctx.close();
  }
  return { failures, checked };
}

async function measure(page, where, failures) {
  const res = await page.evaluate(measureInPage);
  if (res.count > 0) failures.push({ ...where, kind: "overflow", ...res });
  const un = await page.evaluate(unreachableInPage);
  if (un.count > 0) failures.push({ ...where, kind: "unreachable", ...un });
}

export function printFailures(failures, checked) {
  for (const f of failures) {
    const at = `${f.route} @ ${f.width}×${f.height}`;
    if (f.kind === "overflow") {
      console.error(`✗ FAIL  ${at} — ${f.count} element(s) past the screen edge:`);
      for (const o of f.offenders) console.error(`    <${o.tag}> ${o.left}→${o.right} (screen ${f.vw}) class="${o.cls}" ${o.text ? `“${o.text}”` : ""}`);
    } else if (f.kind === "unreachable") {
      console.error(`✗ FAIL  ${at} — ${f.count} control(s) unreachable: below or above the screen with nothing to scroll them into view:`);
      for (const o of f.offenders) console.error(`    <${o.tag}> y ${o.top}→${o.bottom} (screen height ${f.vh}) ${o.text ? `“${o.text}”` : ""}`);
    } else {
      console.error(`✗ FAIL  ${at} — ${f.message}`);
    }
  }
  console.error(`\n${failures.length} problem(s) in ${checked} page loads. See CLAUDE.md "Mobile-width law".`);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const base = (args.find((a) => /^https?:\/\//.test(a)) || "http://localhost:3000").replace(/\/$/, "");
  const widths = (opt("widths")?.split(",").map(Number) || DEFAULT_WIDTHS).filter(Boolean);
  const heightOpt = Number(opt("height")) || 0;
  // every width at 800 px tall, plus the short phone 320×568 (where dialogs run out of room first)
  const viewports = widths.map((width) => ({ width, height: heightOpt || 800 }));
  if (!heightOpt && widths.includes(320)) viewports.push({ width: 320, height: 568 });
  const routes = opt("routes")?.split(",") || defaultRoutes();
  const expect = Object.fromEntries((opt("expect")?.split(",") || []).filter(Boolean).map((e) => { const [path, code] = e.split(":"); return [path, Number(code)]; }));

  const pw = await loadPlaywright();
  const chromium = (pw.chromium || pw.default?.chromium);
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  let result;
  try { result = await checkPages({ browser, base, viewports, routes, expect }); }
  finally { await browser.close(); }

  if (result.failures.length === 0) {
    console.log(`✓ PASS  ${result.checked} page loads (${routes.length} routes × ${viewports.map((v) => `${v.width}×${v.height}`).join(" / ")}): every page loaded and nothing is wider than the screen or out of reach`);
    return;
  }
  printFailures(result.failures, result.checked);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message || e); process.exitCode = 2; });
}
