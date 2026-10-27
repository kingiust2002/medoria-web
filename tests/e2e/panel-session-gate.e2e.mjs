// A panel page must not rely on the layout's session check: on a client-side navigation Next.js renders only the
// page segment, NOT the layout, so a page that reads customer data on its own would answer a session that was ended
// (logout, "end all sessions") as long as the browser still holds the cookie. This replays such a navigation request
// after the session was revoked, for both panels, and for a plain forged cookie.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, resetDb, apiLogin, freshCode } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const HOUSES = [
  { house: "health", home: "/operator", quotes: "/operator/quotes", logout: "/api/operator/logout", cookie: "medoria_operator", secretLabel: "E2E Customer 1", navText: /استعلام/ },
  { house: "beauty", home: "/beauty/operator", quotes: "/beauty/operator/quotes", logout: "/api/beauty-operator/logout", cookie: "medoria_beauty_operator", secretLabel: "E2E Beauty Customer", navText: /استعلام/ },
];

async function login(h) {
  const r = h.house === "beauty" ? await apiLogin("beauty", { code: await freshCode(process.env.E2E_BEAUTY_TOTP_SECRET) }) : await apiLogin("health");
  assert.equal(r.status, 200, `login ${h.house}: ${JSON.stringify(r.body)}`);
  return r.cookie;                                   // "name=value"
}

for (const h of HOUSES) {
  test(`${h.house}: a navigation request replayed after the session was ended returns no customer data`, async () => {
    const cookie = await login(h);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const [name, ...rest] = cookie.split("=");
    await ctx.addCookies([{ name, value: rest.join("="), url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(BASE + h.home, { waitUntil: "load" });

    // record the real client-side navigation request (RSC) the browser sends when the Quotes link is clicked
    let captured = null;
    page.on("request", (req) => { if (req.url().includes(h.quotes) && req.headers()["rsc"] === "1") captured = { url: req.url(), headers: req.headers() }; });
    await page.locator(`a[href="${h.quotes}"]`).first().click();
    await page.waitForURL(`**${h.quotes}`);
    await page.getByText(h.secretLabel).first().waitFor();            // the page really shows customer data while the session is valid
    assert.ok(captured, "the Quotes navigation did not use a client-side (RSC) request");

    // end the session on the server (the browser keeps its copy of the cookie)
    const out = await fetch(BASE + h.logout, { method: "POST", headers: { cookie, origin: BASE } });
    assert.equal(out.status, 200);

    // replay the exact navigation request with the old cookie
    const { host, connection, "content-length": _cl, ...forward } = captured.headers;
    const res = await fetch(captured.url, { redirect: "manual", headers: { ...forward, cookie } });
    const text = await res.text();
    assert.ok(!text.includes(h.secretLabel), `customer data was served to an ended session (HTTP ${res.status})`);
    assert.ok(!/E2E demo message|\+9929000000/.test(text), "customer details leaked");
    await ctx.close();
  });
}

test("a forged cookie value reaches neither panel's data (middleware only checks that a cookie exists)", async () => {
  for (const h of HOUSES) {
    const res = await fetch(BASE + h.quotes, { redirect: "manual", headers: { cookie: `${h.cookie}=forged.value`, rsc: "1" } });
    const text = await res.text();
    assert.ok(!text.includes(h.secretLabel), `${h.house}: data served to a forged cookie`);
    assert.ok(res.status >= 300 || !/E2E demo message/.test(text));
  }
});
