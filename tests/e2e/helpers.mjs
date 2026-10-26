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

export const setFault = (table, method, status, code, message) => fetch(`${DB}/__fault`, { method: "POST", body: JSON.stringify({ table, method, status, code, message }) });
export const clearFaults = () => fetch(`${DB}/__fault/clear`, { method: "POST" });

// A TOTP code that the server will still accept: a time step newer than the last one it accepted, within
// the ±1 window. Several test files log in separately, so look at what the fake database remembers.
export async function freshCode(secret) {
  const { totpAt, stepOf } = await import("../../lib/operator/security.js");
  for (let i = 0; i < 40; i++) {
    const last = Number((await state()).operator_totp_state?.find((r) => r.panel === "beauty")?.last_step || 0);
    const now = stepOf(Date.now());
    const step = [now, now + 1].find((s) => s > last);
    if (step) return totpAt(secret, step);
    await new Promise((r) => setTimeout(r, 1500));   // the window has no newer step yet
  }
  throw new Error("no usable two-step code (the 30 s window is used up)");
}

// Log in through the API (no browser). `ip` varies x-real-ip so the per-IP login throttle (8 a minute)
// does not couple unrelated tests. Returns { status, body, cookie }.
let ipCounter = 10;
export async function apiLogin(house, { user, password, code, recovery, ip } = {}) {
  const path = house === "beauty" ? "/api/beauty-operator/login" : "/api/operator/login";
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "x-real-ip": ip || `198.51.100.${ipCounter++}` },
    body: JSON.stringify({ username: user ?? process.env[`E2E_${house.toUpperCase()}_USER`], password: password ?? process.env[`E2E_${house.toUpperCase()}_PASSWORD`], code, recovery }),
  });
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).find((c) => /^medoria_/.test(c)) || "";
  return { status: res.status, body: await res.json().catch(() => ({})), cookie };
}

// Logs `page` into the panel. The login endpoint is rate limited (8 per minute per IP), so the browser form
// is used ONCE per house per process and the session is reused afterwards. Beauty has two-step login enabled in
// the e2e setup, so its form asks for a code too.
export async function login(page, house = "health") {
  if (!sessions[house]) {
    const user = process.env[`E2E_${house.toUpperCase()}_USER`];
    const pass = process.env[`E2E_${house.toUpperCase()}_PASSWORD`];
    await page.goto(`${BASE}/login/${house}`, { waitUntil: "networkidle" });
    await page.fill('input[name="username"]', user);
    await page.fill('input[name="password"]', pass);
    if (house === "beauty") {
      await page.click('button[type="submit"]');                        // first attempt: the server asks for the code
      await page.fill('input[name="code"]', await freshCode(process.env.E2E_BEAUTY_TOTP_SECRET));
    }
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
