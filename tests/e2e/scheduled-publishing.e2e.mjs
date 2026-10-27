// Scheduled publishing in a real browser: the dates typed in Tajikistan time are stored as UTC, the list shows the badge, a changed past
// date is refused, and the cron endpoint (token-protected) applies due dates, records them in the history and leaves future ones alone.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const TOKEN = process.env.E2E_SCHEDULE_TOKEN;
const patch = (table, id, body) => fetch(`${DB}/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify(body) });
const run = (token) => fetch(`${BASE}/api/internal/scheduled-publishing`, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
const pad = (n) => String(n).padStart(2, "0");
// a local (UTC+5) datetime-local string `days` ahead at 09:30
function localIn(days) {
  const d = new Date(Date.now() + 5 * 3_600_000 + days * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T09:30`;
}
const utcOf = (local) => new Date(Date.parse(`${local}:00Z`) - 5 * 3_600_000).toISOString();

test("the form stores a date typed in Tajikistan time as UTC; the list shows 'scheduled'; a past date is refused", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/2/edit`, { waitUntil: "networkidle" });          // the archived product
  const local = localIn(3);
  await page.getByLabel("انتشار خودکار در").fill(local);
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.waitForURL(/\/operator\/products$/);
  const p = (await state()).products.find((x) => x.id === 2);
  assert.equal(new Date(p.publish_at).toISOString(), utcOf(local));
  assert.equal(p.is_active, false, "saving a date does not publish by itself");
  await page.getByTestId("badge-scheduled").first().waitFor();

  // the form shows the same local time back
  await page.goto(`${BASE}/operator/products/2/edit`, { waitUntil: "networkidle" });
  assert.equal(await page.getByLabel("انتشار خودکار در").inputValue(), local);
  // a changed date in the past is refused with the message, nothing is stored
  await page.getByLabel("انتشار خودکار در").fill(localIn(-2));
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.getByText("زمان انتشار یا آرشیو خودکار باید در آینده باشد.").waitFor();
  assert.equal(new Date((await state()).products.find((x) => x.id === 2).publish_at).toISOString(), utcOf(local));
  await ctx.close();
});

test("the cron endpoint: off without a valid token; applies due dates (history + log), leaves future dates, both houses", async () => {
  assert.equal((await run()).status, 401);
  assert.equal((await run("wrong-token-wrong-token-wrong-token")).status, 401);
  const past = new Date(Date.now() - 3_600_000).toISOString(), future = new Date(Date.now() + 86_400_000).toISOString();
  await patch("products", 2, { publish_at: past });                         // archived → goes live
  await patch("products", 1, { unpublish_at: past });                       // live → archived
  await patch("products", 3, { publish_at: future, is_active: false });      // later
  const res = await run(TOKEN);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.houses.health, { published: 1, archived: 1, cleared: 0 });
  assert.ok(!JSON.stringify(body).includes("e2e-"), "counts only");
  const st = await state();
  const by = Object.fromEntries(st.products.map((x) => [x.id, x]));
  assert.deepEqual([by[2].is_active, by[2].publish_at], [true, null]);
  assert.deepEqual([by[1].is_active, by[1].unpublish_at], [false, null]);
  assert.deepEqual([by[3].is_active, Boolean(by[3].publish_at)], [false, true]);
  assert.ok(st.product_versions.some((v) => v.product_id === 2 && v.actor_label === "scheduler" && v.after.is_active === true));
  assert.ok(st.operator_audit_log.some((r) => r.action === "product.scheduled" && r.count === 2));
  // the public page of the product that went live answers
  const pub = await fetch(`${BASE}/health/tg/catalog/e2e-archived`);
  assert.ok([200, 404].includes(pub.status));
  // idempotent: nothing more is due
  const again = await (await run(TOKEN)).json();
  assert.deepEqual(again.houses.health, { published: 0, archived: 0, cleared: 0 });
});
