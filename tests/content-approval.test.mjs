// Site content under approval (round 3, N11): publishing, scheduling and deleting a banner / FAQ / contact / featured item can be "needs approval" for a
// person, and then it is a REAL request a reviewer reads and applies — not a refusal and not a button that cannot work. Both houses, the real approval
// framework: a new item is saved as a DRAFT and only its publication waits; an edit that changes publication waits as a whole; a delete waits and
// follows the attempt-first history rule; an old request, a changed item, a lost right and the person's own approval are refused; the houses stay apart.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import * as content from "../lib/content/actionsCore.js";
import { requireAll, evaluateAll } from "../lib/operator/access.js";
import { fileForApproval } from "../lib/operator/approvalFlow.js";
import { approveRequest, rejectRequest } from "../lib/operator/approvals.js";
import { rowToUser, invalidateSessionUser } from "../lib/operator/accounts.js";
import { isLive } from "../lib/siteContent.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const urow = (n, o = {}) => ({ id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [],
  approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, ...o });
const editor = (n = 1, houses = ["health"]) => urow(n, { role: "viewer", houses, allow_perms: houses.flatMap((h) => [`${h}.content.create`, `${h}.content.edit`, `${h}.content.publish`, `${h}.content.schedule`, `${h}.content.delete`]), approval: Object.fromEntries(houses.map((h) => [h, ["content.publish", "content.schedule", "content.delete"]])) });
const reviewer = (n = 2, houses = ["health"]) => urow(n, { role: "house_admin", houses });
let db, audits, purged, nextId;
const ts = "2026-10-01T10:00:00.000Z";
function ctxFor(row, panel = "health") {
  const user = rowToUser(db.tables.operator_users.find((r) => r.id === row.id));
  const session = { sid: "s", uid: user.id, user, username: user.username };
  const audit = async (action, meta = {}) => { audits.push({ action, ...meta }); return { ok: true }; };
  return { admin: db, session, panel, audit, require: (ops) => requireAll({ session, panel, operations: [].concat(ops), audit }), evaluate: (ops) => evaluateAll({ session, panel, operations: [].concat(ops), audit }),
    file: (spec) => fileForApproval({ admin: db, session, audit, panel }, spec), revalidate: () => purged.push(panel) };
}
const approve = (panel, who, req, extra = {}) => {
  const user = rowToUser(db.tables.operator_users.find((r) => r.id === who.id));
  const audit = extra.audit || (async (e) => { audits.push(e); return { ok: true }; });
  return approveRequest(db, { reviewer: user, panel, id: req.id, executors: content.makeContentExecutors({ panel, audit, revalidate: () => purged.push(panel) }) });
};
const banner = (o = {}) => ({ text: { tg: "Салом" }, tone: "info", is_published: false, ...o });
const requests = () => db.tables.operator_change_requests;

for (const panel of ["health", "beauty"]) {
  test(`${panel}: edits to already-published content must respect publication approval`, async () => {
    const owner = ctxFor(reviewer(5), panel);
    const made = await content.createContent(owner, "banner", banner({ text: { tg: "Original" }, is_published: true }));
    const c = ctxFor(editor(panel === "health" ? 1 : 3), panel);
    const result = await content.updateContent(c, made.row.id, banner({ text: { tg: "Unreviewed replacement" }, is_published: true }), 1);
    assert.equal(result.pending, true);
    assert.equal(db.tables.site_content[0].data.text.tg, "Original");
    assert.ok(requests()[0].proposed.__ops.includes("content.edit"));
    assert.equal((await approve(panel, reviewer(5), requests()[0])).ok, true);
    assert.equal(db.tables.site_content[0].data.text.tg, "Unreviewed replacement");
  });

  test(`${panel}: a denied publication right cannot be bypassed by editing an existing published item`, async () => {
    const made = await content.createContent(ctxFor(reviewer(5), panel), "banner", banner({ is_published: true }));
    const row = db.tables.operator_users.find((r) => r.id === id(panel === "health" ? 1 : 3));
    row.deny_perms = [`${panel}.content.publish`];
    const result = await content.updateContent(ctxFor(row, panel), made.row.id, banner({ text: { tg: "Denied" }, is_published: true }), 1);
    assert.equal(result.denied, true);
    assert.equal(db.tables.site_content[0].data.text.tg, "Салом");
  });
}

test("approval of an edited item rechecks the requester's content.edit right", async () => {
  const made = await content.createContent(ctxFor(reviewer(5)), "banner", banner({ is_published: false }));
  await content.updateContent(ctxFor(editor(1)), made.row.id, banner({ text: { tg: "Proposed" }, is_published: true }), 1);
  db.tables.operator_users[0].deny_perms = ["health.content.edit"];
  invalidateSessionUser();
  const result = await approve("health", reviewer(2), requests()[0]);
  assert.equal(result.ok, false);
  assert.equal(db.tables.site_content[0].is_published, false);
});
beforeEach(() => {
  invalidateSessionUser();
  audits = []; purged = []; nextId = 0;
  let n = 0;
  db = createMemoryAdmin({ operator_users: [editor(1), reviewer(2), editor(3, ["beauty"]), reviewer(4, ["beauty"]), reviewer(5, ["health", "beauty"])], site_content: [], operator_change_requests: [], products: [{ id: 1, sku: "S1", is_active: true }], beauty_products: [] }, {
    defaults: {
      site_content: () => ({ id: ++nextId, version: 1, created_at: ts, updated_at: ts }),
      operator_change_requests: () => ({ id: `00000000-0000-4000-9000-${String(++n).padStart(12, "0")}`, status: "pending", requested_at: ts }),
    },
    beforeUpdate: {
      site_content: (old, next) => { next.version = old.version + 1; next.updated_at = `2026-11-0${next.version}T10:00:00.000000Z`; return null; },
      operator_change_requests: (old, next) => (old.status !== "pending" && !(old.status === "approved" && (next.status === "failed" || next.executed_at)) ? { code: "P0001", message: "decided" } : next.reviewed_by && next.reviewed_by === old.requested_by ? { code: "23514", message: "not self" } : null),
    },
  });
});

test("a new item whose publication needs approval is saved as a DRAFT; the request names the publication; the reviewer's approval makes it live", async () => {
  const r = await content.createContent(ctxFor(editor(1)), "banner", banner({ is_published: true, publish_at: null }));
  assert.equal(r.ok, true); assert.equal(r.pending, true); assert.equal(r.saved, true);
  const row = db.tables.site_content[0];
  assert.deepEqual([row.is_published, row.house], [false, "health"], "the item exists but is NOT public");
  assert.equal(isLive(row), false);
  const req = requests()[0];
  assert.deepEqual([req.operation, req.resource, req.entity, req.entity_id, req.house, req.proposed.is_published, req.proposed.__ops], ["content.publish", "content", "site_content", row.id, "health", true, ["content.publish"]]);
  const ok = await approve("health", reviewer(2), req);
  assert.equal(ok.ok, true);
  assert.equal(db.tables.site_content[0].is_published, true);
  assert.equal(isLive(db.tables.site_content[0]), true);
  assert.ok(purged.includes("health"), "the public pages are refreshed");
  assert.equal(requests()[0].status, "approved");
});

test("only the dates change → filed as content.schedule, applied, and the dates are validated again", async () => {
  const c = ctxFor(editor(1));
  const base = await content.createContent(c, "banner", banner({ is_published: false }));
  assert.equal(base.ok, true); assert.equal(requests().length, 0, "a draft with no publication needs no request");
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const r = await content.updateContent(c, base.row.id, banner({ is_published: false, publish_at: future }), 1);
  assert.equal(r.pending, true);
  assert.equal(requests()[0].operation, "content.schedule");
  assert.equal(db.tables.site_content[0].publish_at ?? null, null, "nothing applied yet");
  assert.equal((await approve("health", reviewer(2), requests()[0])).ok, true);
  assert.equal(Date.parse(db.tables.site_content[0].publish_at), Date.parse(future));
});

test("an edit that changes the text AND the publication waits as ONE request: neither is applied until the reviewer decides", async () => {
  const owner = ctxFor(reviewer(5));
  const made = await content.createContent(owner, "banner", banner({ text: { tg: "Кӯҳна" }, is_published: false }));
  const c = ctxFor(editor(1));
  const r = await content.updateContent(c, made.row.id, banner({ text: { tg: "Нав" }, is_published: true }), 1);
  assert.equal(r.pending, true);
  assert.deepEqual([db.tables.site_content[0].data.text.tg, db.tables.site_content[0].is_published], ["Кӯҳна", false], "text and publication both wait");
  assert.equal(requests().length, 1);
  assert.equal((await approve("health", reviewer(2), requests()[0])).ok, true);
  assert.deepEqual([db.tables.site_content[0].data.text.tg, db.tables.site_content[0].is_published], ["Нав", true], "applied together");
});

test("a request is STALE when the item changed since: nothing is applied", async () => {
  const c = ctxFor(editor(1));
  const made = await content.createContent(c, "banner", banner({ is_published: true }));
  const owner = ctxFor(reviewer(5));
  await content.updateContent(owner, made.row.id, banner({ text: { tg: "Тағйир" } }), 1);          // someone else edits the draft meanwhile
  const res = await approve("health", reviewer(2), requests()[0]);
  assert.deepEqual([res.ok, res.error], [false, "stale"]);
  assert.equal(db.tables.site_content[0].is_published, false);
  assert.equal(requests()[0].status, "failed");
});

test("delete needs approval: filed with the item's version, nothing deleted; the approval deletes with the attempt first and the outcome after; a stale version deletes nothing", async () => {
  const owner = ctxFor(reviewer(5));
  const made = await content.createContent(owner, "faq", { q: { tg: "Савол" }, a: { tg: "Ҷавоб" }, is_published: false });
  const r = await content.deleteContent(ctxFor(editor(1)), made.row.id, 1);
  assert.equal(r.pending, true); assert.equal(db.tables.site_content.length, 1);
  assert.equal(requests()[0].operation, "content.delete");
  assert.equal((await approve("health", reviewer(2), requests()[0])).ok, true);
  assert.equal(db.tables.site_content.length, 0);
  const seq = audits.map((e) => e.action).filter((a) => a.startsWith("content.delete"));
  assert.deepEqual(seq, ["content.delete_attempt", "content.delete"]);
  // stale
  const again = await content.createContent(owner, "faq", { q: { tg: "Боз" }, a: { tg: "Ҷ" }, is_published: false });
  await content.deleteContent(ctxFor(editor(1)), again.row.id, 1);
  await content.updateContent(owner, again.row.id, { q: { tg: "Тағйир" }, a: { tg: "Ҷ" } }, 1);
  const stale = await approve("health", reviewer(2), requests().at(-1));
  assert.deepEqual([stale.ok, stale.error], [false, "stale"]);
  assert.equal(db.tables.site_content.length, 1);
});

test("a hard delete follows the history rule: a missing, failing or throwing log refuses it — directly and when approved", async () => {
  const owner = ctxFor(reviewer(5));
  const made = await content.createContent(owner, "faq", { q: { tg: "С" }, a: { tg: "Ҷ" }, is_published: false });
  for (const audit of [undefined, async () => ({ ok: false }), async () => ({ ok: false, unavailable: true }), async () => { throw new Error("down"); }]) {
    const c = { ...owner, audit };
    const res = await content.deleteContent(c, made.row.id, 1);
    assert.equal(res.ok, false);
    assert.equal(db.tables.site_content.length, 1, "nothing deleted");
  }
  // approved: the executor's own writer
  await content.deleteContent(ctxFor(editor(1)), made.row.id, 1);
  for (const audit of [undefined, async () => ({ ok: false })]) {
    const user = rowToUser(db.tables.operator_users.find((r) => r.id === id(2)));
    const res = await approveRequest(db, { reviewer: user, panel: "health", id: requests()[0].id, executors: content.makeContentExecutors({ panel: "health", audit }) });
    assert.equal(res.ok, false);
    assert.equal(db.tables.site_content.length, 1);
    // the request is now failed; refile for the next round
    requests().length = 0; await content.deleteContent(ctxFor(editor(1)), made.row.id, 1);
  }
});

test("direct people are not slowed down: a house admin publishes and deletes at once; a person with no right is refused, not filed", async () => {
  const owner = ctxFor(reviewer(5));
  const r = await content.createContent(owner, "banner", banner({ is_published: true }));
  assert.deepEqual([r.ok, r.pending, db.tables.site_content[0].is_published], [true, undefined, true]);
  assert.equal(requests().length, 0);
  assert.equal((await content.deleteContent(owner, r.row.id, 1)).ok, true);
  const viewer = urow(9, { role: "viewer" }); db.tables.operator_users.push(viewer);
  const denied = await content.createContent(ctxFor(viewer), "banner", banner({ is_published: true }));
  assert.equal(denied.denied, true); assert.equal(requests().length, 0);
});

test("the person who asked cannot approve their own request; a reviewer of the other house cannot decide it; a lost right supersedes it; content.edit stays direct", async () => {
  await content.createContent(ctxFor(editor(1)), "banner", banner({ is_published: true }));
  const req = requests()[0];
  const self = urow(1, { ...db.tables.operator_users[0] });
  assert.equal((await approve("health", editor(1), req)).error, "own");
  assert.equal((await approve("health", reviewer(4, ["beauty"]), req)).error, "notAllowed", "a Beauty-only admin has no right in Health");
  assert.equal(db.tables.site_content[0].is_published, false);
  // the requester loses the right to publish meanwhile
  db.tables.operator_users.find((u) => u.id === id(1)).deny_perms = ["health.content.publish"];
  invalidateSessionUser();
  const res = await approve("health", reviewer(2), req);
  assert.equal(res.ok, false);
  assert.equal(db.tables.site_content[0].is_published, false);
  assert.ok(self);
});

test("the houses stay apart: Beauty's request is applied to Beauty's row only; Health's row with the same id is never touched", async () => {
  db.tables.site_content.push({ id: 900, house: "health", kind: "banner", data: { text: { tg: "Health" } }, sort_order: 0, is_published: false, publish_at: null, unpublish_at: null, version: 1, created_at: ts, updated_at: ts });
  nextId = 900;
  const r = await content.createContent(ctxFor(editor(3, ["beauty"]), "beauty"), "banner", banner({ is_published: true }));
  assert.equal(r.pending, true);
  const req = requests()[0];
  assert.equal(req.house, "beauty");
  assert.equal((await approve("beauty", reviewer(4, ["beauty"]), req)).ok, true);
  const rows = db.tables.site_content;
  assert.deepEqual(rows.map((x) => [x.id, x.house, x.is_published]), [[900, "health", false], [901, "beauty", true]]);
  // a Health reviewer cannot decide Beauty's request
  const r2 = await content.createContent(ctxFor(editor(3, ["beauty"]), "beauty"), "faq", { q: { tg: "С" }, a: { tg: "Ҷ" }, is_published: true });
  assert.equal(r2.pending, true);
  assert.equal((await approve("health", reviewer(2), requests()[1])).error, "notFound", "the other house's request is not even visible to a Health reviewer");
});

test("contact and featured under approval: still one contact per house and a limit on featured; the publication waits like any other", async () => {
  const c = ctxFor(editor(1));
  const first = await content.createContent(c, "contact", { phone: "+992900000001", is_published: true });
  assert.equal(first.pending, true);
  const second = await content.createContent(c, "contact", { phone: "+992900000002", is_published: true });
  assert.equal(second.ok, false); assert.equal(second.pending, undefined);            // a second contact is refused before anything is filed
  assert.equal(db.tables.site_content.filter((x) => x.kind === "contact").length, 1);
  assert.equal(requests().length, 1);
  const f = await content.createContent(c, "featured", { sku: "S1", is_published: true });
  assert.equal(f.pending, true);
  assert.equal(db.tables.site_content.find((x) => x.kind === "featured").is_published, false);
  assert.equal((await approve("health", reviewer(2), requests()[1])).ok, true);
  assert.equal(db.tables.site_content.find((x) => x.kind === "featured").is_published, true);
});
