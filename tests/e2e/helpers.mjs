// Shared helpers for the browser tests. Plain Playwright + node:test, no extra runner.
import { chromium } from "playwright";

export const BASE = process.env.E2E_BASE_URL;
export const DB = process.env.E2E_DB_URL;

export async function launch() {
  return chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
}

export const state = async () => (await fetch(`${DB}/__state`)).json();
export const dbLog = async () => (await fetch(`${DB}/__log`)).json();
export const resetDb = () => fetch(`${DB}/__reset`);

export async function poll(fn, { timeout = 20000, interval = 400, label = "condition" } = {}) {
  const t0 = Date.now();
  let last;
  for (;;) {
    try { last = await fn(); if (last) return { value: last, ms: Date.now() - t0 }; } catch (e) { last = e; }
    if (Date.now() - t0 > timeout) throw new Error(`timed out after ${timeout} ms waiting for ${label}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

// Fetch a public page without following redirects; returns { status, text }.
export async function get(path, init = {}) {
  const res = await fetch(BASE + path, { redirect: "manual", ...init });
  return { status: res.status, text: await res.text(), location: res.headers.get("location") };
}

const sessions = {};   // house -> Playwright storageState, filled by the first login

export const setFault = (table, method, status, code) => fetch(`${DB}/__fault`, { method: "POST", body: JSON.stringify({ table, method, status, code }) });
export const clearFaults = () => fetch(`${DB}/__fault/clear`, { method: "POST" });

// Logs `page` into the panel. The login endpoint is rate limited (8 per minute per IP), so the
// browser form is used ONCE per house and the session is reused afterwards.
export async function login(page, house = "health") {
  if (!sessions[house]) {
    const user = process.env[`E2E_${house.toUpperCase()}_USER`];
    const pass = process.env[`E2E_${house.toUpperCase()}_PASSWORD`];
    await page.goto(`${BASE}/login/${house}`, { waitUntil: "networkidle" });
    await page.fill('input[name="username"]', user);
    await page.fill('input[name="password"]', pass);
    await Promise.all([
      page.waitForURL((u) => /\/operator(\/|$)|\/beauty\/operator/.test(u.pathname), { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);
    sessions[house] = await page.context().storageState();
    return;
  }
  await page.context().addCookies(sessions[house].cookies);
  await page.goto(`${BASE}/${house === "beauty" ? "beauty/operator" : "operator"}`, { waitUntil: "networkidle" });
}

// Runs in the page: elements that stick out past the screen edge (see scripts/check-mobile-width.mjs).
export { measureInPage } from "../../scripts/check-mobile-width.mjs";
