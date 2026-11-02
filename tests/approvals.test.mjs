// The approval queue (lib/operator/approvals.js + approvalExecutors.js) against an in-memory database and the real authz rules.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { submitChange, listRequests, cancelRequest, rejectRequest, approveRequest, resubmitRequest, resourceOf } from "../lib/operator/approvals.js";
import { makeProductExecutors, productOps, diffRow } from "../lib/operator/approvalExecutors.js";
import { rowToUser, invalidateSessionUser } from "../lib/operator/accounts.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const urow = (n, o = {}) => ({
  id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [],
  approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, ...o,
});
const requesterRow = urow(1, { role: "product_manager", allow_perms: [] });                    // may ask; price/publish/delete need approval
const reviewerRow = urow(2, { role: "house_admin" });                                           // may review products
const outsiderRow = urow(3, { role: "quote_manager" });                                         // cannot review products
const ts = "2026-10-01T10:00:00.000Z";
let db, audits;

function setup(extra = {}) {
  const requests = [];
  const trigger = (old, next) => {                      // the database's own guard: only pending can be decided; decided rows are frozen
    if (old.status !== "pending" && !(old.status === "approved" && (next.status === "failed" || next.executed_at))) return { code: "P0001", message: "a decided change request cannot be changed" };
    if (next.reviewed_by && next.reviewed_by === old.requested_by) return { code: "23514", message: "not self" };
    return null;
  };
  db = createMemoryAdmin({
    operator_users: [requesterRow, reviewerRow, outsiderRow].map((r) => ({ ...r })),
    operator_change_requests: requests,
    products: [{ id: 7, slug: "gloves", sku: "G-7", name_en: "Gloves", price: 10, is_active: true, in_stock: true, updated_at: ts }, { id: 8, slug: "old", sku: "O-8", name_en: "Old", price: 5, is_active: false, in_stock: true, updated_at: ts }],
    ...extra,
  }, {
    unique: {}, beforeUpdate: { operator_change_requests: trigger, products: (old, next) => { if (JSON.stringify(old) !== JSON.stringify(next)) next.updated_at = "2026-10-02T00:00:00.000Z"; return null; } },
    defaults: { operator_change_requests: () => ({ id: `00000000-0000-4000-9000-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`, status: "pending", requested_at: ts }) },
  });
  audits = [];
}
const U = (r) => rowToUser(r);
const requester = () => U(db.tables.operator_users.find((x) => x.id === requesterRow.id));
const reviewer = () => U(db.tables.operator_users.find((x) => x.id === reviewerRow.id));
const outsider = () => U(db.tables.operator_users.find((x) => x.id === outsiderRow.id));
const session = (u) => ({ sid: "s", uid: u.id, user: u });
const executors = () => makeProductExecutors({ panel: "health", session: session(reviewer()), audit: async (e) => { audits.push(e); return { ok: true }; } });
const product = (pid) => db.tables.products.find((p) => p.id === pid);
const priceSpec = (price = 12) => ({ operation: "products.price", ops: ["products.price"], entity: "products", entityId: 7, subject: "G-7", before: { price: 10 }, proposed: { price }, baseUpdatedAt: ts });
beforeEach(() => { invalidateSessionUser(); setup(); });

test("a request is filed only for operations the person may ask for; the live data is untouched while it is pending", async () => {
  const r = await submitChange(db, { actor: requester(), panel: "health", spec: priceSpec() });
  assert.equal(r.ok, true);
  assert.equal(r.request.status, "pending");
  assert.equal(product(7).price, 10, "nothing changed yet");
  assert.deepEqual(r.request.proposed.__ops, ["products.price"]);
  // somebody who has no right to even ask: a refusal, not a request
  const viewer = U(urow(9, { role: "viewer" }));
  assert.equal((await submitChange(db, { actor: viewer, panel: "health", spec: priceSpec() })).error, "notAllowed");
  assert.equal((await submitChange(db, { actor: requester(), panel: "beauty", spec: priceSpec() })).error, "notAllowed", "another house");
  assert.equal((await submitChange(db, { actor: requester(), panel: "health", spec: { ...priceSpec(), operation: "products.fly" } })).error, "unsupported");
  assert.equal(db.tables.operator_change_requests.length, 1);
});

test("a double click is not two requests", async () => {
  db.tables.operator_change_requests = [];
  const dupDb = createMemoryAdmin({ operator_change_requests: [] }, { unique: { operator_change_requests: [["requested_by", "operation", "entity_id"]] }, defaults: { operator_change_requests: () => ({ id: id(50), status: "pending" }) } });
  const a = await submitChange(dupDb, { actor: requester(), panel: "health", spec: priceSpec() });
  const b = await submitChange(dupDb, { actor: requester(), panel: "health", spec: priceSpec() });
  assert.equal(a.ok, true);
  assert.deepEqual([b.ok, b.duplicate], [true, true]);
  assert.equal(dupDb.tables.operator_change_requests.length, 1);
});

test("who sees what: the reviewer sees pending requests of the kinds he may review, the requester sees his own, nobody sees his own as reviewable", async () => {
  await submitChange(db, { actor: requester(), panel: "health", spec: priceSpec() });
  const asReviewer = await listRequests(db, { actor: reviewer(), panel: "health" });
  assert.equal(asReviewer.toReview.length, 1);
  assert.equal(asReviewer.mine.length, 0);
  const asRequester = await listRequests(db, { actor: requester(), panel: "health" });
  assert.equal(asRequester.mine.length, 1);
  assert.equal(asRequester.toReview.length, 0, "never his own");
  const asOutsider = await listRequests(db, { actor: outsider(), panel: "health" });
  assert.equal(asOutsider.toReview.length, 0, "a request manager cannot review product changes");
  assert.equal((await listRequests(db, { actor: reviewer(), panel: "beauty" })).toReview.length, 0, "another house");
});

test("approve: only an allowed other person; the change is applied once, to the version it was prepared against", async () => {
  const { request } = await submitChange(db, { actor: requester(), panel: "health", spec: priceSpec(12) });
  assert.equal((await approveRequest(db, { reviewer: requester(), panel: "health", id: request.id, executors: executors() })).error, "own");
  assert.equal((await approveRequest(db, { reviewer: outsider(), panel: "health", id: request.id, executors: executors() })).error, "notAllowed");
  assert.equal(product(7).price, 10);
  const ok = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: request.id, executors: executors() });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(product(7).price, 12);
  const row = db.tables.operator_change_requests[0];
  assert.deepEqual([row.status, row.reviewed_by], ["approved", reviewerRow.id]);
  assert.ok(row.executed_at);
  assert.equal((await approveRequest(db, { reviewer: reviewer(), panel: "health", id: request.id, executors: executors() })).error, "decided", "not twice");
});

test("two reviewers at the same moment: exactly one executes", async () => {
  const second = urow(4, { role: "house_admin" });
  db.tables.operator_users.push(second);
  const { request } = await submitChange(db, { actor: requester(), panel: "health", spec: priceSpec(13) });
  let runs = 0;
  const counting = { "products.price": async (ctx) => { runs++; return makeProductExecutors({ panel: "health" })["products.price"](ctx); } };
  const [a, b] = await Promise.all([
    approveRequest(db, { reviewer: reviewer(), panel: "health", id: request.id, executors: counting }),
    approveRequest(db, { reviewer: U(second), panel: "health", id: request.id, executors: counting }),
  ]);
  assert.equal([a.ok, b.ok].filter(Boolean).length, 1);
  assert.equal(runs, 1);
  assert.equal(product(7).price, 13);
});

test("STALE: the record changed after the request was prepared → the approval does NOT overwrite the newer change", async () => {
  const { request } = await submitChange(db, { actor: requester(), panel: "health", spec: priceSpec(12) });
  product(7).price = 99; product(7).updated_at = "2026-10-05T00:00:00.000Z";            // somebody else changed it meanwhile
  const res = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: request.id, executors: executors() });
  assert.equal(res.ok, false);
  assert.equal(res.error, "stale");
  assert.equal(product(7).price, 99, "the newer value survives");
  const row = db.tables.operator_change_requests[0];
  assert.deepEqual([row.status, row.exec_error], ["failed", "stale"]);
  // the requester can resubmit against the current record
  const again = await resubmitRequest(db, { actor: requester(), panel: "health", id: request.id, prepare: async () => ({ before: { price: 99 }, baseUpdatedAt: product(7).updated_at }) });
  assert.equal(again.ok, true);
  assert.equal(again.request.resubmitted_from, request.id);
  const ok = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: again.request.id, executors: executors() });
  assert.equal(ok.ok, true);
  assert.equal(product(7).price, 12);
});

test("the requester's account is re-read at approval: disabled, moved out of the house or stripped of the right → nothing is executed", async () => {
  for (const mutate of [(r) => { r.status = "disabled"; }, (r) => { r.houses = ["beauty"]; }, (r) => { r.deny_perms = ["health.products.edit"]; }]) {
    setup();
    const { request } = await submitChange(db, { actor: requester(), panel: "health", spec: priceSpec(12) });
    mutate(db.tables.operator_users.find((x) => x.id === requesterRow.id));
    invalidateSessionUser();
    const res = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: request.id, executors: executors() });
    assert.equal(res.error, "requesterGone");
    assert.equal(product(7).price, 10);
    assert.equal(db.tables.operator_change_requests[0].status, "superseded");
  }
});

test("reject: needs a reason; the requester sees it; a rejected request is final but can be resubmitted", async () => {
  const { request } = await submitChange(db, { actor: requester(), panel: "health", spec: priceSpec(12) });
  assert.equal((await rejectRequest(db, { reviewer: reviewer(), panel: "health", id: request.id, reason: "  " })).error, "reasonNeeded");
  assert.equal((await rejectRequest(db, { reviewer: requester(), panel: "health", id: request.id, reason: "because" })).error, "own");
  assert.equal((await rejectRequest(db, { reviewer: outsider(), panel: "health", id: request.id, reason: "because" })).error, "notAllowed");
  const ok = await rejectRequest(db, { reviewer: reviewer(), panel: "health", id: request.id, reason: "price too low" });
  assert.equal(ok.ok, true);
  const mine = (await listRequests(db, { actor: requester(), panel: "health" })).mine[0];
  assert.deepEqual([mine.status, mine.review_reason], ["rejected", "price too low"]);
  assert.equal((await approveRequest(db, { reviewer: reviewer(), panel: "health", id: request.id, executors: executors() })).error, "decided");
  assert.equal(product(7).price, 10);
  const again = await resubmitRequest(db, { actor: requester(), panel: "health", id: request.id, prepare: async () => ({ before: { price: 10 }, baseUpdatedAt: ts }) });
  assert.equal(again.ok, true);
});

test("withdraw: only the requester, only while pending", async () => {
  const { request } = await submitChange(db, { actor: requester(), panel: "health", spec: priceSpec() });
  assert.equal((await cancelRequest(db, { actor: reviewer(), panel: "health", id: request.id })).error, "notFound", "somebody else's request");
  assert.equal((await cancelRequest(db, { actor: requester(), panel: "health", id: request.id })).ok, true);
  assert.equal((await cancelRequest(db, { actor: requester(), panel: "health", id: request.id })).error, "decided");
  assert.equal((await approveRequest(db, { reviewer: reviewer(), panel: "health", id: request.id, executors: executors() })).error, "decided");
});

test("an operation without an executor is refused at approval, not half-done; unknown ids are 'not found'", async () => {
  const { request } = await submitChange(db, { actor: requester(), panel: "health", spec: { ...priceSpec(), operation: "categories.delete", ops: ["categories.delete"] } });      // nothing in the product executors applies a category deletion
  const res = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: request.id, executors: executors() });
  assert.equal(res.error, "unsupported");
  assert.equal(db.tables.operator_change_requests[0].status, "pending", "still pending, nothing claimed");
  assert.equal((await approveRequest(db, { reviewer: reviewer(), panel: "health", id: "nope", executors: executors() })).error, "notFound");
  assert.equal((await approveRequest(db, { reviewer: reviewer(), panel: "health", id: id(404), executors: executors() })).error, "notFound");
});

test("create and delete through the queue; the delete re-checks 'archived' and the typed text, and writes the history first", async () => {
  const created = await submitChange(db, { actor: requester(), panel: "health", spec: { operation: "products.create", ops: ["products.create"], entity: "products", subject: "NEW-1", proposed: { slug: "new-1", sku: "NEW-1", name_en: "New", price: 3, is_active: true, in_stock: true } } });
  assert.equal(created.ok, true);
  const ok = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: created.request.id, executors: executors() });
  assert.equal(ok.ok, true);
  assert.ok(db.tables.products.some((p) => p.sku === "NEW-1"));

  const del = await submitChange(db, { actor: requester(), panel: "health", spec: { operation: "products.delete", ops: ["products.delete"], entity: "products", entityId: 8, subject: "O-8", before: { sku: "O-8", is_active: false }, proposed: { confirmation: "O-8" }, baseUpdatedAt: ts } });
  assert.equal(del.ok, true);
  db.tables.products.find((p) => p.id === 8).is_active = true;                           // re-activated meanwhile
  const refused = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: del.request.id, executors: executors() });
  assert.equal(refused.ok, false);
  assert.ok(db.tables.products.some((p) => p.id === 8), "a re-activated product is NOT deleted");
  db.tables.products.find((p) => p.id === 8).is_active = false;
  const again = await submitChange(db, { actor: requester(), panel: "health", spec: { operation: "products.delete", ops: ["products.delete"], entity: "products", entityId: 8, subject: "O-8", before: { sku: "O-8", is_active: false }, proposed: { confirmation: "WRONG" }, baseUpdatedAt: ts } });
  assert.equal((await approveRequest(db, { reviewer: reviewer(), panel: "health", id: again.request.id, executors: executors() })).ok, false, "a wrong typed text deletes nothing");
  const good = await submitChange(db, { actor: requester(), panel: "health", spec: { operation: "products.delete", ops: ["products.delete"], entity: "products", entityId: 8, subject: "O-8", before: { sku: "O-8", is_active: false }, proposed: { confirmation: "o-8" }, baseUpdatedAt: ts } });
  const done = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: good.request.id, executors: executors() });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.ok(!db.tables.products.some((p) => p.id === 8));
  assert.deepEqual(audits.filter((a) => /^product\.delete/.test(a.action)).map((a) => a.action).slice(-2), ["product.delete_attempt", "product.delete"]);
});

test("helpers: which operations a product change needs, and the diff shown to the reviewer", () => {
  assert.deepEqual([...productOps({ price: 10, is_active: true, in_stock: true }, { price: 12, is_active: false, in_stock: false })].sort(), ["products.archive", "products.price", "products.stock_flag"]);
  assert.deepEqual([...productOps({ price: 10, is_active: true }, { price: 10, is_active: true, name_en: "x" })], []);
  const d = diffRow({ price: 10, name_en: "A", updated_at: "x" }, { price: 12, name_en: "A", updated_at: "y", id: 5 });
  assert.deepEqual([d.changed, d.old], [{ price: 12 }, { price: 10 }]);
  assert.equal(resourceOf("categories.delete"), "categories");
});

// ── review finding R8: an approved deletion applies only to the product version the reviewer was shown ─────────────────────
const deleteSpec = (over = {}) => ({ operation: "products.delete", ops: ["products.delete"], entity: "products", entityId: 8, subject: "O-8", before: { sku: "O-8", is_active: false }, proposed: { confirmation: "O-8" }, baseUpdatedAt: ts, ...over });
const archived8 = () => db.tables.products.find((p) => p.id === 8);

test("R8: deletion uses the exact PostgreSQL basis, including microseconds within one JavaScript millisecond", async () => {
  const basis = "2026-10-28T10:00:00.000001+00:00";
  const newer = "2026-10-28T10:00:00.000002+00:00";
  archived8().updated_at = basis;
  const filed = await submitChange(db, { actor: requester(), panel: "health", spec: deleteSpec({ baseUpdatedAt: basis }) });
  assert.equal(filed.ok, true);
  archived8().name_en = "Edited a microsecond after the request";
  archived8().updated_at = newer;
  assert.equal(Date.parse(basis), Date.parse(newer), "JavaScript Date cannot distinguish these versions");
  const res = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: filed.request.id, executors: executors() });
  assert.equal(res.ok, false, "the newer microsecond version must not be deleted");
  assert.equal(res.error, "stale");
  assert.equal(archived8()?.updated_at, newer);
  assert.equal(db.tables.operator_change_requests[0].status, "failed");
});

test("R8: the same microsecond version in a different ISO offset is still deletable", async () => {
  archived8().updated_at = "2026-10-28T13:30:00.123456+03:30";
  const filed = await submitChange(db, { actor: requester(), panel: "health", spec: deleteSpec({ baseUpdatedAt: "2026-10-28T10:00:00.123456Z" }) });
  assert.equal(filed.ok, true);
  const res = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: filed.request.id, executors: executors() });
  assert.equal(res.ok, true);
  assert.equal(archived8(), undefined);
});

test("R8: a product edited after the deletion was requested is NOT deleted — the request fails as stale, the newer record stays, nothing is written to the history", async () => {
  const filed = await submitChange(db, { actor: requester(), panel: "health", spec: deleteSpec() });
  archived8().name_en = "Edited after the request"; archived8().updated_at = "2026-10-05T00:00:00.000Z";        // still archived, same SKU, newer version
  const res = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: filed.request.id, executors: executors() });
  assert.equal(res.ok, false);
  assert.ok(archived8(), "the newer product is intact");
  assert.equal(archived8().name_en, "Edited after the request");
  assert.equal(db.tables.operator_change_requests[0].status, "failed");
  assert.equal(audits.filter((a) => /^product\.delete/.test(a.action)).length, 0, "no attempt was written for a deletion that was never going to run");
});

test("R8: an edit that lands between the check and the delete statement is caught by the delete itself (atomic predicate)", async () => {
  const filed = await submitChange(db, { actor: requester(), panel: "health", spec: deleteSpec() });
  const racing = makeProductExecutors({ panel: "health", session: session(reviewer()), audit: async (e) => {
    audits.push(e);
    if (e.action === "product.delete_attempt") { archived8().name_en = "edited during the approval"; archived8().updated_at = "2026-10-06T00:00:00.000Z"; }   // the concurrent update
    return { ok: true };
  } });
  const res = await approveRequest(db, { reviewer: reviewer(), panel: "health", id: filed.request.id, executors: racing });
  assert.equal(res.ok, false);
  assert.ok(archived8(), "the delete statement matched nothing");
  assert.deepEqual(audits.filter((a) => /^product\.delete/.test(a.action)).map((a) => [a.action, a.detail?.reason]), [["product.delete_attempt", undefined], ["product.delete_failed", "state_changed"]], "a failed delete is never recorded as a success");
});

test("R8: a deletion request without a basis version deletes nothing, and the executor itself refuses a stale version even when called directly", async () => {
  const ex = executors();
  const noBase = await ex["products.delete"]({ admin: db, request: { entity_id: 8, base_updated_at: null, proposed: { confirmation: "O-8" } } });
  assert.deepEqual([noBase.ok, noBase.error], [false, "stale"]);
  const old = await ex["products.delete"]({ admin: db, request: { entity_id: 8, base_updated_at: "2026-09-01T00:00:00.000Z", proposed: { confirmation: "O-8" } } });
  assert.deepEqual([old.ok, old.error], [false, "stale"]);
  assert.ok(archived8());
  const same = await ex["products.delete"]({ admin: db, request: { entity_id: 8, base_updated_at: "2026-10-01T10:00:00Z", proposed: { confirmation: "O-8" } } });
  assert.equal(same.ok, true, "the same instant written in another ISO form is the same version");
  assert.ok(!archived8());
});
