// The approval path is complete (N2): an operation is offered as "needs approval" only if an action FILES the request, a reviewer CAN decide
// it, and an executor APPLIES it — for both houses. An operation that cannot do all three is never offered and is closed (denied) if a stored
// policy still lists it. Old requests, revoked permissions and a person approving their own change are refused for every executor.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import {
  APPROVABLE_OPERATIONS, OPERATIONS, ROLES, ROLE_IDS, approvableFor, canReview, checkUserChange, decide, isApprovable, ALL_PERMISSIONS,
} from "../lib/operator/authz.js";
import { RESUBMITTABLE_OPERATIONS, canResubmit, prepareFor } from "../lib/operator/approvable.js";
import { approveRequest, rejectRequest, resubmitRequest, listRequests } from "../lib/operator/approvals.js";
import { fileForApproval } from "../lib/operator/approvalFlow.js";
import { makeProductExecutors } from "../lib/operator/approvalExecutors.js";
import { makeProductPrepare } from "../lib/operator/approvalPrepare.js";
import { makeDestructiveExecutors, makeDestructivePrepare } from "../lib/operator/destructiveApproval.js";
import { categoryDeleteFlow, brandDeleteFlow, quotesDeleteFlow } from "../lib/operator/destructiveFlow.js";
import { makeWarehouseExecutors } from "../lib/warehouse/actionsCore.js";
import { makeCountExecutors } from "../lib/warehouse/countsActions.js";
import { makeMediaExecutors } from "../lib/operator/mediaLibrary.js";
import { makeDocumentExecutors } from "../lib/operator/documentsCore.js";
import { rowToUser, invalidateSessionUser } from "../lib/operator/accounts.js";
import { userResolver } from "../lib/operator/quoteFollowUpCore.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// ── the registry ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// the key an executor is registered under for an operation (a restore is filed as a content change; the others are filed as themselves)
const EXECUTOR_KEY = { "products.restore_version": "products.content" };
const noop = async () => ({ ok: true });

test("every approvable operation is a real operation; role defaults and the people screen use only those", () => {
  for (const op of APPROVABLE_OPERATIONS) assert.ok(op in OPERATIONS, op);
  assert.equal(new Set(APPROVABLE_OPERATIONS).size, APPROVABLE_OPERATIONS.length, "no duplicates");
  for (const id of ROLE_IDS) for (const op of ROLES[id].approval) assert.ok(isApprovable(op), `role ${id} sends ${op} for approval, which cannot be approved`);
  assert.ok(!approvableFor("health").some((op) => op.startsWith("brands.")), "Health has no brands");
  assert.ok(approvableFor("beauty").includes("brands.delete"));
  assert.match(read("components/operator/UsersManager.jsx"), /const opsOf = \(house\) => approvableFor\(house\)/, "the people screen must offer only approvable operations");
  assert.ok(!/OPERATION_CHOICES/.test(read("components/operator/UsersManager.jsx")));
});

test("a stored policy that lists an operation which cannot be approved CLOSES it; supported ones still need approval", () => {
  const pm = (approval) => ({ id: "p", status: "active", role: "product_manager", houses: ["health", "beauty"], allow: ["health.products.bulk"], deny: [], approval });
  for (const house of ["health", "beauty"]) for (const op of Object.keys(OPERATIONS).filter((o) => !isApprovable(o) && (house === "beauty" || !o.startsWith("brands.")))) {
    const u = { id: "p", status: "active", role: "house_admin", houses: ["health", "beauty"], allow: [], deny: [], approval: { health: [op], beauty: [op] } };
    const d = decide(u, house, op);
    assert.equal(d.mode, "denied", `${house} ${op}: a stored approval entry must not become a promise`);
    assert.equal(d.reason, "approval_unsupported");
  }
  for (const op of APPROVABLE_OPERATIONS.filter((o) => !o.startsWith("brands."))) {
    const u = { id: "p", status: "active", role: "house_admin", houses: ["health"], allow: [], deny: [], approval: { health: [op] } };
    assert.equal(decide(u, "health", op).mode, "approval", op);
  }
  assert.equal(decide(pm({ health: [] }), "health", "products.price").mode, "direct");
});

test("saving a policy with an operation that cannot be approved is refused; a supported one is accepted", () => {
  const owner = { id: "o", status: "active", role: "owner", houses: ["health", "beauty"], allow: [], deny: [], approval: {} };
  const change = (approval) => checkUserChange({ actor: owner, target: null, change: { role: "product_manager", houses: ["health", "beauty"], approval, status: "active" }, users: [owner] });
  assert.ok(change({ health: ["products.import"] }).errors.includes("approval_unsupported"));
  assert.ok(change({ beauty: ["inventory.receive"] }).errors.includes("approval_unsupported"));
  assert.ok(change({ health: ["brands.delete"] }).errors.includes("approval_unsupported"), "Health has no brand deletion");
  assert.equal(change({ health: ["products.price", "categories.delete", "quotes.delete"], beauty: ["brands.delete", "media.delete"] }).ok, true);
});

test("every approvable operation has an executor in BOTH houses (brands only in Beauty)", () => {
  const session = { user: { id: "r" } };
  for (const panel of ["health", "beauty"]) {
    const keys = new Set(Object.keys({
      ...makeProductExecutors({ panel, session, audit: noop }), ...makeWarehouseExecutors({ panel }), ...makeCountExecutors({ panel }), ...makeMediaExecutors({ panel }), ...makeDocumentExecutors({ panel }),
      ...makeDestructiveExecutors({ panel, session, audit: noop }),
    }));
    for (const op of approvableFor(panel)) assert.ok(keys.has(EXECUTOR_KEY[op] || op), `${panel}: nothing applies an approved ${op}`);
  }
});

test("every approvable operation can be decided by SOMEONE: the owner and the house admin may review its resource (this caught media and requests)", () => {
  const owner = { id: "o", status: "active", role: "owner", houses: ["health", "beauty"], allow: [], deny: [], approval: {} };
  const admin = (h) => ({ id: "a", status: "active", role: "house_admin", houses: [h], allow: [], deny: [], approval: {} });
  for (const house of ["health", "beauty"]) for (const op of approvableFor(house)) {
    const resource = op.split(".")[0];
    assert.ok(ALL_PERMISSIONS.includes(`${house}.${resource}.approve`), `${house}: there is no "${resource}.approve" permission, so ${op} could never be approved`);
    assert.equal(canReview(owner, "someone-else", house, resource), true, `${house} owner cannot review ${op}`);
    assert.equal(canReview(admin(house), "someone-else", house, resource), true, `${house} house admin cannot review ${op}`);
  }
  // …and the other house's admin cannot
  assert.equal(canReview(admin("beauty"), "x", "health", "quotes"), false);
});

test("every approvable operation is filed by an action, and each is filed with its own name", () => {
  const files = ["lib/operator/actions.js", "lib/beauty/operator/actions.js", "lib/operator/destructiveFlow.js", "lib/warehouse/actionsCore.js", "lib/warehouse/countsActions.js", "lib/operator/productRestoreCore.js", "lib/operator/categoryTreeActions.js", "lib/operator/importActions.js", "lib/operator/documentsCore.js"];
  const src = files.map(read).join("\n");
  const named = new Set([...src.matchAll(/(?:authed|buildActionCtx)\((?:\{[^}]*operation: )?"([a-z]+\.[a-z_]+)"[^)]*approvable: true|operation: "([a-z]+\.[a-z_]+)"|evaluate\("([a-z]+\.[a-z_]+)"\)/g)].flatMap((m) => [m[1], m[2], m[3]]).filter(Boolean));
  // quick edits / the publish toggle choose their operation by name at run time; they file under these names
  for (const op of ["products.publish", "products.archive", "products.price", "products.stock_flag", "products.content"]) named.add(op);
  for (const op of APPROVABLE_OPERATIONS) assert.ok(named.has(op), `no action files ${op}`);
});

test("an action that cannot file a request never offers the operation to a person who would need approval (bulk actions)", () => {
  for (const f of ["components/operator/ProductsTable.jsx", "components/beauty/operator/ProductsTable.jsx"]) {
    const s = read(f);
    assert.match(s, /bulkPublish = useMode\("products\.publish"\) === "direct"/, f);
    for (const k of ["bulkPublish", "bulkArchive", "bulkPrice", "bulkContent"]) assert.match(s, new RegExp(`canBulk && ${k}`), `${f}: ${k} is not required for the bulk button`);
  }
});

test("the approval screen asks again only for the kinds of request that can be asked again", () => {
  for (const op of RESUBMITTABLE_OPERATIONS) assert.ok(isApprovable(op), op);
  assert.equal(canResubmit("media.delete"), false); assert.equal(canResubmit("inventory.adjust"), false); assert.equal(canResubmit("categories.delete"), true);
  assert.match(read("components/operator/ApprovalsManager.jsx"), /r\.canResubmit !== false && \["rejected", "failed", "superseded", "cancelled"\]/);
});

// ── behaviour: file → pending → decide → applied, for the newly approvable operations, both houses ─────────────────────────────────────────
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const urow = (n, o = {}) => ({ id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [], approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, ...o });
const ts = "2026-10-01T10:00:00.000Z";
let db, audits;

function setup() {
  const trigger = (old, next) => {
    if (old.status !== "pending" && !(old.status === "approved" && (next.status === "failed" || next.executed_at))) return { code: "P0001", message: "a decided change request cannot be changed" };
    if (next.reviewed_by && next.reviewed_by === old.requested_by) return { code: "23514", message: "not self" };
    return null;
  };
  let n = 0;
  db = createMemoryAdmin({
    operator_users: [
      urow(1, { role: "product_manager", houses: ["health", "beauty"], approval: { health: ["categories.delete", "quotes.delete", "products.price", "products.create"], beauty: ["categories.delete", "brands.delete", "quotes.delete"] }, allow_perms: ["health.quotes.delete", "beauty.quotes.delete", "beauty.brands.delete"] }),
      urow(2, { role: "house_admin", houses: ["health", "beauty"] }),
      urow(3, { role: "house_admin", houses: ["beauty"] }),
    ],
    operator_change_requests: [],
    categories: [{ id: 1, slug: "gloves", parent_id: null }, { id: 2, slug: "masks", parent_id: null }, { id: 3, slug: "child", parent_id: 2 }],
    products: [{ id: 10, slug: "a", category_id: 1, category: "gloves", updated_at: ts }, { id: 11, slug: "b", category_id: null, category: "gloves", updated_at: ts }, { id: 12, slug: "c", category_id: 2, category: "masks", updated_at: ts }],
    beauty_categories: [{ id: 1, slug: "lips" }, { id: 2, slug: "eyes" }],
    beauty_products: [{ id: 20, slug: "x", category_id: 1, category: "lips", updated_at: ts }],
    beauty_brands: [{ id: 5, slug: "chanel", name: "Chanel" }, { id: 6, slug: "dior", name: "Dior" }],
    quote_requests: [1, 2, 3].map((q) => ({ id: q, tracking_code: `MH-${q}`, status: "new", name: "Private Person", phone: "+99290000000", updated_at: ts })),
    beauty_quote_requests: [{ id: 1, tracking_code: "MB-1", status: "new", updated_at: ts }],
  }, {
    beforeUpdate: { operator_change_requests: trigger },
    defaults: { operator_change_requests: () => ({ id: `00000000-0000-4000-9000-${String(++n).padStart(12, "0")}`, status: "pending", requested_at: ts }) },
  });
  audits = [];
}
beforeEach(() => { invalidateSessionUser(); setup(); });
const user = (n) => rowToUser(db.tables.operator_users.find((u) => u.id === id(n)));
const session = (u) => ({ sid: "s", uid: u.id, user: u });
const auditFn = async (e) => { audits.push(e); return { ok: true }; };

// what `authed(op, { approvable: true })` hands to an action
function ctxFor(panel, who, needsApproval = true) {
  const s = session(who);
  return {
    ok: true, admin: db, session: s, needsApproval, auditEntry: auditFn,
    file: (spec) => fileForApproval({ admin: db, session: s, audit: auditFn, panel }, spec),
  };
}
const executorsFor = (panel, reviewer) => makeDestructiveExecutors({ panel, session: session(reviewer), audit: auditFn });
const approve = (panel, reviewer, req) => approveRequest(db, { reviewer, panel, id: req.id, executors: executorsFor(panel, reviewer) });
const pendingRows = () => db.tables.operator_change_requests;

test("categories.delete (Health): filed on a plan, the live data is untouched, the reviewer's approval moves the products and deletes", async () => {
  const r = await categoryDeleteFlow({ a: ctxFor("health", user(1)), house: "health", id: 1, moveToId: 2 });
  assert.equal(r.ok, true); assert.equal(r.pending, true);
  assert.deepEqual(db.tables.categories.map((c) => c.id), [1, 2, 3], "nothing deleted yet");
  assert.equal(db.tables.products.find((p) => p.id === 10).category_id, 1, "nothing moved yet");
  const req = pendingRows()[0];
  assert.deepEqual([req.operation, req.resource, req.entity, req.entity_id, req.before, req.proposed.moveToId], ["categories.delete", "categories", "categories", 1, { slug: "gloves", products: 2 }, 2]);
  const ok = await approve("health", user(2), req);
  assert.equal(ok.ok, true);
  assert.deepEqual(db.tables.categories.map((c) => c.id), [2, 3]);
  assert.deepEqual(db.tables.products.filter((p) => [10, 11].includes(p.id)).map((p) => [p.category_id, p.category]), [[2, "masks"], [2, "masks"]]);
  const actions = audits.map((e) => e.action);
  assert.ok(actions.indexOf("category.delete_attempt") >= 0 && actions.indexOf("category.delete_attempt") < actions.indexOf("category.delete"), "attempt, then outcome");
  assert.equal(db.tables.operator_change_requests[0].status, "approved");
});

test("categories.delete: a category that changed since the request (another product, a child) is STALE; nothing is deleted", async () => {
  await categoryDeleteFlow({ a: ctxFor("health", user(1)), house: "health", id: 1, moveToId: 2 });
  db.tables.products.push({ id: 13, slug: "d", category_id: 1, category: "gloves", updated_at: ts });
  const res = await approve("health", user(2), pendingRows()[0]);
  assert.deepEqual([res.ok, res.error], [false, "stale"]);
  assert.deepEqual(db.tables.categories.map((c) => c.id), [1, 2, 3]);
  assert.equal(pendingRows()[0].status, "failed");
  assert.equal(pendingRows()[0].exec_error, "stale");
  // a gone category is "not found", not a crash
  setup();
  await categoryDeleteFlow({ a: ctxFor("health", user(1)), house: "health", id: 1, moveToId: 2 });
  db.tables.categories = db.tables.categories.filter((c) => c.id !== 1);
  assert.equal((await approve("health", user(2), pendingRows()[0])).ok, false);
});

test("categories.delete: the person who asked cannot approve their own request; a reviewer from the other house cannot decide it", async () => {
  await categoryDeleteFlow({ a: ctxFor("health", user(1)), house: "health", id: 1, moveToId: 2 });
  const req = pendingRows()[0];
  assert.equal((await approve("health", user(1), req)).error, "own");
  assert.equal((await approve("health", user(3), req)).error, "notAllowed", "a Beauty-only admin has no right in Health");
  assert.equal((await approveRequest(db, { reviewer: user(3), panel: "beauty", id: req.id, executors: executorsFor("beauty", user(3)) })).error, "notFound");
  assert.equal(db.tables.categories.length, 3);
});

test("categories.delete: the requester lost the right meanwhile → the request is superseded and nothing is deleted", async () => {
  await categoryDeleteFlow({ a: ctxFor("health", user(1)), house: "health", id: 1, moveToId: 2 });
  db.tables.operator_users.find((u) => u.id === id(1)).deny_perms = ["health.categories.delete"];
  invalidateSessionUser();
  const res = await approve("health", user(2), pendingRows()[0]);
  assert.deepEqual([res.ok, res.error], [false, "requesterGone"]);
  assert.equal(pendingRows()[0].status, "superseded");
  assert.equal(db.tables.categories.length, 3);
  // …and a disabled account likewise
  setup();
  await categoryDeleteFlow({ a: ctxFor("health", user(1)), house: "health", id: 1, moveToId: 2 });
  db.tables.operator_users.find((u) => u.id === id(1)).status = "disabled";
  invalidateSessionUser();
  assert.equal((await approve("health", user(2), pendingRows()[0])).error, "requesterGone");
});

test("categories.delete: a rejected request can be asked again against what the category looks like now; an old one is refused", async () => {
  await categoryDeleteFlow({ a: ctxFor("health", user(1)), house: "health", id: 1, moveToId: 2 });
  const req = pendingRows()[0];
  const rej = await rejectRequest(db, { reviewer: user(2), panel: "health", id: req.id, reason: "not now" });
  assert.equal(rej.ok, true);
  db.tables.products.push({ id: 13, slug: "d", category_id: 1, category: "gloves", updated_at: ts });       // the category grew meanwhile
  const prepare = prepareFor({ product: makeProductPrepare({ panel: "health", admin: db }), destructive: makeDestructivePrepare({ panel: "health", admin: db }) });
  const again = await resubmitRequest(db, { actor: user(1), panel: "health", id: req.id, prepare });
  assert.equal(again.ok, true);
  const fresh = pendingRows().find((r) => r.status === "pending");
  assert.equal(fresh.before.products, 3, "the new request carries the current number of products");
  assert.equal((await approve("health", user(2), fresh)).ok, true);
  assert.deepEqual(db.tables.categories.map((c) => c.id), [2, 3]);
});

test("categories.delete (Beauty): its own tables; a category with products needs a destination; the Health data is never touched", async () => {
  const noMove = await categoryDeleteFlow({ a: ctxFor("beauty", user(1)), house: "beauty", id: 1 });
  assert.equal(noMove.ok, false); assert.equal(noMove.needsMove, true);
  assert.equal(pendingRows().length, 0, "no request for a deletion that cannot be carried out");
  const r = await categoryDeleteFlow({ a: ctxFor("beauty", user(1)), house: "beauty", id: 1, moveToId: 2 });
  assert.equal(r.pending, true);
  assert.equal((await approve("beauty", user(2), pendingRows()[0])).ok, true);
  assert.deepEqual(db.tables.beauty_categories.map((c) => c.id), [2]);
  assert.equal(db.tables.beauty_products[0].category_id, 2);
  assert.equal(db.tables.categories.length, 3, "Health untouched");
  assert.ok(db.log.filter(([t, op]) => op !== "select" && ["categories", "products", "quote_requests"].includes(t)).length === 0, "Beauty's approval wrote to a Health table");
});

test("brands.delete (Beauty): filed, approved, deleted; products keep their text brand; Health has no executor for it", async () => {
  const r = await brandDeleteFlow({ a: ctxFor("beauty", user(1)), id: 5 });
  assert.equal(r.pending, true);
  assert.equal(db.tables.beauty_brands.length, 2);
  assert.equal((await approve("beauty", user(2), pendingRows()[0])).ok, true);
  assert.deepEqual(db.tables.beauty_brands.map((b) => b.id), [6]);
  assert.ok(audits.some((e) => e.action === "brand.delete") && audits.some((e) => e.action === "brand.delete_attempt"));
  assert.equal("brands.delete" in makeDestructiveExecutors({ panel: "health", session: session(user(2)), audit: auditFn }), false);
  // a renamed brand is stale
  setup();
  await brandDeleteFlow({ a: ctxFor("beauty", user(1)), id: 5 });
  db.tables.beauty_brands.find((b) => b.id === 5).name = "Chanel Paris";
  assert.equal((await approve("beauty", user(2), pendingRows()[0])).error, "stale");
  assert.equal(db.tables.beauty_brands.length, 2);
});

test("quotes.delete: one or several requests are filed together, the queue holds codes and versions only (no customer data), and approval is all-or-nothing", async () => {
  const r = await quotesDeleteFlow({ a: ctxFor("health", user(1)), house: "health", ids: [1, 2] });
  assert.equal(r.pending, true);
  const req = pendingRows()[0];
  const stored = JSON.stringify(req);
  assert.ok(!/Private Person|\+9929/.test(stored), "customer data must not enter the approval queue");
  assert.deepEqual(req.before, { count: 2, codes: ["MH-1", "MH-2"] });
  assert.equal(req.subject, "MH-1, MH-2");
  assert.equal(db.tables.quote_requests.length, 3, "nothing deleted yet");
  // one of them was answered meanwhile → stale, NONE is deleted
  db.tables.quote_requests.find((q) => q.id === 2).updated_at = "2026-10-02T00:00:00.000Z";
  assert.equal((await approve("health", user(2), req)).error, "stale");
  assert.equal(db.tables.quote_requests.length, 3);
  // a fresh request, nothing changed → approved, both deleted, attempt and outcome in the history
  setup();
  await quotesDeleteFlow({ a: ctxFor("health", user(1)), house: "health", ids: [1, 2] });
  assert.equal((await approve("health", user(2), pendingRows()[0])).ok, true);
  assert.deepEqual(db.tables.quote_requests.map((q) => q.id), [3]);
  assert.ok(audits.some((e) => e.action === "quote.delete_attempt") && audits.some((e) => e.action === "quote.delete"));
  // one removed by somebody else → stale
  setup();
  await quotesDeleteFlow({ a: ctxFor("health", user(1)), house: "health", ids: [1, 2] });
  db.tables.quote_requests = db.tables.quote_requests.filter((q) => q.id !== 1);
  assert.equal((await approve("health", user(2), pendingRows()[0])).error, "stale");
  assert.equal(db.tables.quote_requests.length, 2);
});

test("quotes.delete: a single request, the other house's rows are never reachable, a missing one is a plain refusal", async () => {
  assert.equal((await quotesDeleteFlow({ a: ctxFor("health", user(1)), house: "health", ids: 99, single: true })).ok, false);
  assert.equal(pendingRows().length, 0);
  const r = await quotesDeleteFlow({ a: ctxFor("beauty", user(1)), house: "beauty", ids: 1, single: true });
  assert.equal(r.pending, true);
  assert.equal(pendingRows()[0].entity, "quote_requests", "the queue records the kind of thing; the executor uses the house's own table");
  assert.equal((await approve("beauty", user(2), pendingRows()[0])).ok, true);
  assert.equal(db.tables.beauty_quote_requests.length, 0);
  assert.equal(db.tables.quote_requests.length, 3, "Health's requests are untouched");
  const hostile = await quotesDeleteFlow({ a: ctxFor("health", user(1)), house: "health", ids: ["1 or 1=1"] });
  assert.equal(hostile.ok, false);
});

test("quotes.delete: a rejected request is asked again with fresh versions", async () => {
  await quotesDeleteFlow({ a: ctxFor("health", user(1)), house: "health", ids: [1, 2] });
  const req = pendingRows()[0];
  await rejectRequest(db, { reviewer: user(2), panel: "health", id: req.id, reason: "wait for the call" });
  db.tables.quote_requests.find((q) => q.id === 2).updated_at = "2026-10-02T00:00:00.000Z";
  const prepare = prepareFor({ product: makeProductPrepare({ panel: "health", admin: db }), destructive: makeDestructivePrepare({ panel: "health", admin: db }) });
  assert.equal((await resubmitRequest(db, { actor: user(1), panel: "health", id: req.id, prepare })).ok, true);
  const fresh = pendingRows().find((r) => r.status === "pending");
  assert.equal(fresh.proposed._versions[2], "2026-10-02T00:00:00.000Z");
  assert.equal((await approve("health", user(2), fresh)).ok, true);
  assert.deepEqual(db.tables.quote_requests.map((q) => q.id), [3]);
});

test("a request for an operation without a registered executor is refused at approval time, not half-applied", async () => {
  const s = session(user(2));
  const row = { operation: "documents.publish", resource: "documents", entity: "documents", entity_id: 1, subject: "x", before: {}, proposed: {}, requested_by: id(1), house: "health", status: "pending", requested_at: ts, id: id(900) };
  db.tables.operator_change_requests.push(row);
  const res = await approveRequest(db, { reviewer: user(2), panel: "health", id: row.id, executors: makeDestructiveExecutors({ panel: "health", session: s, audit: auditFn }) });
  assert.deepEqual([res.ok, res.error], [false, "unsupported"]);
  assert.equal(db.tables.operator_change_requests.find((r) => r.id === row.id).status, "pending", "the request stays pending");
});

test("the queue lists every approvable kind for the reviewer and hides it from people who may not decide it", async () => {
  await categoryDeleteFlow({ a: ctxFor("health", user(1)), house: "health", id: 1, moveToId: 2 });
  await quotesDeleteFlow({ a: ctxFor("health", user(1)), house: "health", ids: [3] });
  const admin = await listRequests(db, { actor: user(2), panel: "health" });
  assert.deepEqual(admin.toReview.map((r) => r.operation).sort(), ["categories.delete", "quotes.delete"]);
  const outsider = await listRequests(db, { actor: user(3), panel: "health" });
  assert.equal(outsider.toReview.length, 0);
});

// ── the screens: a request that was FILED is never reported as DONE ───────────────────────────────────────────────────────────────────
test("every screen that calls an action which can file a request reports 'sent for approval' instead of 'done'", () => {
  const walk = (dir) => fs.readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.jsx$/.test(e.name) ? [`${dir}/${e.name}`] : []));
  const files = [...walk("components/operator"), ...walk("components/beauty/operator")];
  // action → the file(s) that call it must look at `.pending` (or hand the result to code that does)
  const FILING = ["deleteQuote(", "deleteQuotes(", "deleteCategorySafe(", "deleteHealthCategorySafe(", "deleteBrand(", "quickUpdateProduct(", "duplicateProduct(", "setProductActive(", "deleteProduct(", "restoreProductVersion(", "deleteMediaFile("];
  let checked = 0;
  for (const f of files) {
    const src = read(f);
    for (const call of FILING) {
      if (!new RegExp(`await [\\w.]*${call.replace("(", "\\(")}`).test(src) && !new RegExp(`onDelete=\\{(actions\\.)?${call.slice(0, -1)}\\}`).test(src)) continue;
      checked++;
      assert.ok(/pending/.test(src), `${f} calls ${call} but never looks at the "pending" answer: a filed request would be shown as done`);
    }
  }
  assert.ok(checked >= 10, `only ${checked} call sites found: the scanner is broken`);
});

test("the delete screens of requests, categories and brands handle the pending answer in their own parents", () => {
  assert.match(read("components/operator/QuotesPanel.jsx"), /if \(res\?\.pending\) \{[\s\S]*?flash\(t\(res\.message\), true\);\s*\n\s*return;/);
  assert.match(read("components/operator/HealthCategoryTree.jsx"), /result\?\.ok && result\.pending\) onDone\(t\(result\.message\)\)/);
  assert.match(read("components/beauty/operator/CategoryTree.jsx"), /res\?\.ok && res\.pending\) onDone\(t\(res\.message\)\)/);
  for (const f of ["components/operator/CategoriesManager.jsx", "components/beauty/operator/CategoriesManager.jsx"]) assert.match(read(f), /res\.pending \? \{ pending: res\.message \}/, f);
  assert.match(read("components/beauty/operator/BrandsManager.jsx"), /onDone\(res\.pending \? res\.message : undefined\)/);
});
