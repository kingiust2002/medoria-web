#!/usr/bin/env node
// Mobile-width law: no page may ever be wider than a phone screen.
//
//   npm run build && npm start        # in one terminal
//   npm run check:mobile              # http://localhost:3000, default routes
//   npm run check:mobile -- https://medoriaco.com --widths=320,390
//   npm run check:mobile -- --routes=/health/en,/health/en/catalog/some-slug
//
// Opens each route in a phone-sized browser (320, 360, 390, 430 px) and fails if
// any element that is not inside a clipping/scrolling container, a fixed layer or
// an aria-hidden decoration pokes past the screen edge. It looks at elements, not
// at `scrollWidth`: the global `overflow-x: clip` guard hides sideways scrolling,
// so a clipped (cut-off) layout would otherwise pass unnoticed.
//
// Needs Playwright, which is not a project dependency: `npm i --no-save playwright`
// (in the Claude Code cloud sandbox it is pre-installed). Pass real product slugs
// with --routes to cover the pages whose content comes from the database.
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export const DEFAULT_WIDTHS = [320, 360, 390, 430];
export const LOCALES = ["tg", "ru", "en", "fa"];
const PAGES = ["", "/catalog", "/categories", "/about", "/contact", "/compare", "/wishlist"];

export function defaultRoutes() {
  const routes = ["/"];
  for (const house of ["health", "beauty"]) {
    for (const l of LOCALES) for (const p of PAGES) routes.push(`/${house}/${l}${p}`);
    for (const l of LOCALES) routes.push(`/${house}/${l}/brands`, `/${house}/${l}/worlds`);
  }
  return routes;
}

// Runs inside the page. Returns the elements that overflow the screen edge.
export function measureInPage() {
  const vw = document.documentElement.clientWidth;
  const clips = (o) => /(hidden|clip|auto|scroll)/.test(o.overflowX);
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    let skip = false;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (p !== el && clips(cs)) { skip = true; break; }               // inside a clipping / scrolling box
      if (cs.position === "fixed") { skip = true; break; }              // fixed layers are laid out against the screen
      if (p.getAttribute("aria-hidden") === "true") { skip = true; break; } // decoration
    }
    if (skip) continue;
    out.push({ tag: el.tagName.toLowerCase(), cls: String(el.className?.baseVal ?? el.className).slice(0, 80), left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || "").trim().slice(0, 40) });
  }
  return { vw, offenders: out.slice(0, 8), count: out.length };
}

async function loadPlaywright() {
  const require = createRequire(import.meta.url); // honours NODE_PATH (ESM import() does not)
  for (const name of ["playwright", "playwright-core"]) {
    try { return require(name); } catch { /* try next */ }
    try { return await import(name); } catch { /* try next */ }
  }
  throw new Error("Playwright is not installed. Run `npm i --no-save playwright` first.");
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const base = (args.find((a) => /^https?:\/\//.test(a)) || "http://localhost:3000").replace(/\/$/, "");
  const widths = (opt("widths")?.split(",").map(Number) || DEFAULT_WIDTHS).filter(Boolean);
  const routes = opt("routes")?.split(",") || defaultRoutes();

  const pw = await loadPlaywright();
  const chromium = (pw.chromium || pw.default?.chromium);
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  const failures = [];
  let checked = 0;
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    for (const route of routes) {
      try { await page.goto(base + route, { waitUntil: "networkidle", timeout: 30000 }); } catch { /* measure what loaded */ }
      await page.waitForTimeout(600);
      const res = await page.evaluate(measureInPage);
      checked++;
      if (res.count > 0) failures.push({ width, route, ...res });
    }
    await ctx.close();
  }
  await browser.close();

  if (failures.length === 0) {
    console.log(`✓ PASS  ${checked} page loads (${routes.length} routes × ${widths.join("/")} px): nothing wider than the screen`);
    return;
  }
  for (const f of failures) {
    console.error(`✗ FAIL  ${f.route} @ ${f.width}px — ${f.count} element(s) past the screen edge:`);
    for (const o of f.offenders) console.error(`    <${o.tag}> ${o.left}→${o.right} (screen ${f.vw}) class="${o.cls}" ${o.text ? `“${o.text}”` : ""}`);
  }
  console.error(`\n${failures.length} of ${checked} page loads overflow. See CLAUDE.md "Mobile-width law".`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message || e); process.exitCode = 2; });
}
