// Site content under approval with personal accounts (round 3, N11): an editor whose publishing needs approval creates a banner → it is saved as a DRAFT, the
// public site shows nothing, a request waits; the reviewer approves it in the approvals screen → the banner is live on the public page; the same for a delete.
// Both houses keep their own; the editor sees an honest message, never a button that cannot work.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, apiLogin, poll } from "./helpers.mjs";
import { hashPassword } from "../../lib/operator/passwords.js";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const PW = "Strong-Passw0rd-77";
const rest = (path, init = {}) => fetch(`${DB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) } });
async function addUser(o) { const res = await rest("operator_users", { method: "POST", body: JSON.stringify({ display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o }) }); return (await res.json())[0]; }
async function pageAs(user, house = "health") {
  const s = await apiLogin(house, { user, password: PW });
  assert.ok(s.cookie, `login failed: ${s.status}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const [name, ...parts] = s.cookie.split("=");
  await ctx.addCookies([{ name, value: parts.join("="), url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}
const html = async (path) => (await fetch(`${BASE}${path}`, { headers: { accept: "text/html" } })).text();
const content = async () => (await state()).site_content || [];
const requests = async () => (await state()).operator_change_requests || [];

async function seedPeople() {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "ed.itor", role: "viewer", houses: ["health", "beauty"], allow_perms: ["health.content.create", "health.content.edit", "health.content.publish", "health.content.schedule", "health.content.delete", "beauty.content.create", "beauty.content.edit", "beauty.content.publish", "beauty.content.delete"], approval: { health: ["content.publish", "content.schedule", "content.delete"], beauty: ["content.publish", "content.delete"] } });
  await addUser({ username: "rev.admin", role: "house_admin", houses: ["health", "beauty"] });
}
async function newBanner(page, house, text) {
  await page.goto(`${BASE}${house === "beauty" ? "/beauty/operator" : "/operator"}/content`, { waitUntil: "networkidle" });
  await page.getByTestId("ct-new").click();
  await page.getByTestId("ct-lang-en").click();
  await page.getByTestId("ct-text").fill(text);
  await page.getByRole("switch", { name: /منتشر شود/ }).click();
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-form").waitFor({ state: "detached" });
}

test("Health: publishing waits for approval — draft saved, nothing public, request filed; the reviewer approves and the banner is live; the editor's message is honest", async () => {
  await seedPeople();
  const e = await pageAs("ed.itor");
  await newBanner(e.page, "health", "Approval banner E2E");
  await e.page.getByText("برای تأیید ارسال شد").first().waitFor();
  const [row] = await content();
  assert.deepEqual([row.house, row.kind, row.is_published], ["health", "banner", false], "saved as a draft");
  assert.equal((await html("/health/en")).includes("Approval banner E2E"), false, "not public");
  const [req] = await requests();
  assert.deepEqual([req.status, req.operation, req.house, req.entity, req.entity_id], ["pending", "content.publish", "health", "site_content", row.id]);
  await e.ctx.close();

  const r = await pageAs("rev.admin");
  await r.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await r.page.getByTestId("approve").first().click();
  await r.page.getByText("تأیید شد و اعمال شد.").waitFor();
  assert.equal((await content())[0].is_published, true);
  await poll(async () => (await html("/health/en")).includes("Approval banner E2E"), { label: "the banner is public after approval", timeout: 40000 });
  assert.equal((await html("/beauty/en")).includes("Approval banner E2E"), false, "Health's banner is not Beauty's");
  await r.ctx.close();
});

test("a delete waits for approval; the reviewer's approval removes it and the log has the attempt and the outcome", async () => {
  await seedPeople();
  const owner = await pageAs("rev.admin");
  await newBanner(owner.page, "health", "To be removed E2E");            // a house admin publishes at once
  assert.equal((await content())[0].is_published, true);
  await owner.ctx.close();

  const e = await pageAs("ed.itor");
  await e.page.goto(`${BASE}/operator/content`, { waitUntil: "networkidle" });
  await e.page.getByTestId("ct-delete").first().click();
  await e.page.getByText("برای تأیید ارسال شد").first().waitFor();
  assert.equal((await content()).length, 1, "still there");
  assert.equal((await requests())[0].operation, "content.delete");
  await e.ctx.close();

  const r = await pageAs("rev.admin");
  await r.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await r.page.getByTestId("approve").first().click();
  await r.page.getByText("تأیید شد و اعمال شد.").waitFor();
  assert.equal((await content()).length, 0);
  const actions = (await state()).operator_audit_log.map((l) => l.action).filter((a) => a.startsWith("content.delete"));
  assert.deepEqual(actions, ["content.delete_attempt", "content.delete"]);
  await r.ctx.close();
});

test("Beauty has its own queue: its editor's request is not on the Health approvals screen", async () => {
  await seedPeople();
  const e = await pageAs("ed.itor", "beauty");
  await newBanner(e.page, "beauty", "Beauty approval banner");
  await e.page.getByText("برای تأیید ارسال شد").first().waitFor();
  assert.equal((await requests())[0].house, "beauty");
  await e.ctx.close();
  const h = await pageAs("rev.admin", "health");
  await h.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  assert.equal(await h.page.getByTestId("to-review").getByTestId("request").count(), 0, "Health sees nothing of Beauty's request");
  await h.ctx.close();
});
