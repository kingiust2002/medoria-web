// Product documents with personal accounts (OPERATOR_USERS=on): a product manager adds a draft, but making it public — and deleting it — goes through
// the approval queue; a house administrator approves and the change is applied only then; a viewer sees the documents but no buttons.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, poll, apiLogin } from "./helpers.mjs";
import { hashPassword } from "../../lib/operator/passwords.js";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const PW = "Strong-Passw0rd-77";
const rest = (path, init = {}) => fetch(`${DB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) } });
async function addUser(o) { const res = await rest("operator_users", { method: "POST", body: JSON.stringify({ display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o }) }); return (await res.json())[0]; }
async function pageAs(user) {
  const s = await apiLogin("health", { user, password: PW });
  assert.ok(s.cookie, `login failed: ${s.status}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const [name, ...parts] = s.cookie.split("=");
  await ctx.addCookies([{ name, value: parts.join("="), url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}
const pdf = (extra = "") => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\n${extra}\ntrailer << /Root 1 0 R >>\n%%EOF\n`, "latin1");
const docs = async () => (await state()).product_documents || [];

test("publishing and deleting a document need approval for a product manager; the reviewer's approval applies them; a viewer has no buttons", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "pm.requester", role: "product_manager" });
  await addUser({ username: "rev.admin", role: "house_admin" });
  await addUser({ username: "just.viewer", role: "viewer" });

  const pm = await pageAs("pm.requester");
  await pm.page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await pm.page.getByTestId("document-add").click();
  await pm.page.getByTestId("document-file").setInputFiles({ name: "sheet.pdf", mimeType: "application/pdf", buffer: pdf() });
  await pm.page.getByTestId("document-submit").click();
  const row = pm.page.getByTestId("document-row").first();
  await row.waitFor();
  // publish → the button says it needs approval; a request is filed and the document stays a draft
  await row.getByTestId("document-publish").click();
  await pm.page.getByTestId("documents-note").waitFor();
  assert.equal((await docs())[0].is_published, false, "nothing changed yet");
  let reqs = (await state()).operator_change_requests;
  assert.deepEqual([reqs.length, reqs[0].operation, reqs[0].entity], [1, "documents.publish", "product_documents"]);
  await pm.ctx.close();

  // the house administrator approves the publication: applied at that moment
  const rev = await pageAs("rev.admin");
  await rev.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await rev.page.getByTestId("approve").first().click();
  await poll(async () => (await state()).operator_change_requests.some((r) => r.status === "approved"), { label: "approved" });
  assert.equal((await state()).operator_change_requests[0].operation, "documents.publish");
  assert.equal((await docs())[0].is_published, true, "applied at the moment of approval");

  // now the manager asks to delete it: a request again, the document stays until it is approved
  const pm2 = await pageAs("pm.requester");
  await pm2.page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  const row2 = pm2.page.getByTestId("document-row").first();
  await row2.getByTestId("document-delete").click();
  await row2.getByTestId("document-delete-confirm").click();
  await poll(async () => (await state()).operator_change_requests.length === 2, { label: "delete request filed" });
  assert.equal((await docs()).length, 1, "the document is still there");
  await pm2.ctx.close();
  await rev.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await rev.page.getByTestId("approve").first().click();
  await poll(async () => (await docs()).length === 0, { label: "the approved delete was applied" });
  assert.equal(((await state()).storage_objects || []).length, 0, "the file went with the row");
  await rev.ctx.close();

  // a viewer sees the section but cannot change anything
  await rest("product_documents", { method: "POST", body: JSON.stringify({ product_id: 1, kind: "brochure", title: "Seen by all", file_path: "documents/x-y.pdf", file_size: 10, sha256: "a".repeat(64), is_published: true }) });
  const v = await pageAs("just.viewer");
  await v.page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await v.page.getByTestId("document-row").first().waitFor();
  for (const id of ["document-add", "document-edit", "document-publish", "document-hide", "document-delete"]) assert.equal(await v.page.getByTestId(id).count(), 0, id);
  await v.ctx.close();
});
