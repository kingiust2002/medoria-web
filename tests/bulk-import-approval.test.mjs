// Bulk edits and imports under the same rules (N12): a person whose policy says "needs approval" no longer gets a refusal — the WHOLE bulk change, or the
// whole (already dry-run) import file, travels as ONE request; nothing changes while it is pending; when somebody else approves it, it is applied by the same
// function and under the same rules as a direct change (the publish quality rule is judged per product at that moment, the import is planned again against
// today's catalogue). Also proved: the cleaning of what a request may carry, the house separation, the reviewer's summary, and that the direct path is intact.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanBulkPatch, bulkOpsOf, cleanIds, cleanAllowedColumns, applyBulkChange, fileBulkChange, BULK_MAX_IDS } from "../lib/operator/bulkCore.js";
import { submitImport, cleanImportRows, IMPORT_SUBMIT_MESSAGES as M } from "../lib/operator/importSubmit.js";
import { runApprovedImport } from "../lib/operator/importApproved.js";
import { makeProductExecutors } from "../lib/operator/approvalExecutors.js";
import { approveRequest } from "../lib/operator/approvals.js";
import { fileForApproval } from "../lib/operator/approvalFlow.js";
import { evaluateAll } from "../lib/operator/access.js";
import { rowToUser, invalidateSessionUser } from "../lib/operator/accounts.js";
import { MAX_ROWS_PER_FILE } from "../lib/operator/importCore.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const urow = (n, o = {}) => ({
  id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [],
  approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, ...o,
});
// a product manager whose policy sends bulk edits, publishing and imports for approval; a house admin reviews
const requesterRow = urow(1, { role: "product_manager", houses: ["health", "beauty"], approval: { health: ["products.bulk", "products.import"], beauty: ["products.bulk", "products.import"] } });
const directRow = urow(4, { role: "house_admin", houses: ["health", "beauty"] });
const reviewerRow = urow(2, { role: "house_admin", houses: ["health", "beauty"] });
const ts = "2026-10-01T10:00:00.000Z";
const full = (n, o = {}) => ({ id: n, slug: `p-${n}`, sku: `S-${n}`, name_en: `Product ${n}`, name_fa: `کالا ${n}`, image_url: "a.png", price: 10, is_active: false, in_stock: true, updated_at: ts, ...o });
let db, filed;

function setup() {
  filed = [];
  db = createMemoryAdmin({
    operator_users: [requesterRow, directRow, reviewerRow].map((r) => ({ ...r })),
    operator_change_requests: [],
    publish_rules: [],
    products: [full(1), full(2), full(3, { image_url: null }), full(4, { is_active: true })],
    beauty_products: [full(1, { sku: "B-1" }), full(2, { sku: "B-2" })],
  }, {
    beforeUpdate: { operator_change_requests: () => null, publish_rules: (old, next) => { next.version = old.version + 1; return null; } },
    defaults: { operator_change_requests: () => ({ id: `00000000-0000-4000-9000-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`, status: "pending", requested_at: ts }), publish_rules: () => ({ version: 1 }) },
  });
}
const U = (r) => rowToUser(db.tables.operator_users.find((x) => x.id === r.id));
const session = (u) => ({ sid: "s", uid: u.id, user: u });
const actx = (row, panel = "health") => {
  const s = session(U(row));
  const audit = async (action, meta = {}) => { filed.push({ action, ...meta }); };
  return { admin: db, session: s, panel, audit, file: (spec) => fileForApproval({ admin: db, session: s, audit, panel }, spec) };
};
const reqs = () => db.tables.operator_change_requests;
const exec = (panel = "health", importRunner = null) => makeProductExecutors({ panel, session: session(U(reviewerRow)), audit: async () => ({ ok: true }), importRunner });
const approve = (rid, panel = "health", importRunner = null) => approveRequest(db, { reviewer: U(reviewerRow), panel, id: rid, executors: exec(panel, importRunner) });
beforeEach(() => { invalidateSessionUser(); setup(); });

test("cleaning: a bulk change may touch only its few columns; ids are plain bounded integers", () => {
  assert.deepEqual(cleanBulkPatch("health", { is_active: "false", requestPrice: true, slug: "x", name_en: "x", price: 5, category_id: "3", category: "gloves", brand: "Evil" }), { is_active: false, price: null, category_id: 3, category: "gloves" });
  assert.deepEqual(cleanBulkPatch("beauty", { brand: " Luxe " }), { brand: "Luxe" }, "Beauty also changes the brand");
  assert.deepEqual(cleanBulkPatch("health", null), {});
  assert.deepEqual(bulkOpsOf({ is_active: true, price: null }), ["products.bulk", "products.publish", "products.price"]);
  assert.deepEqual(bulkOpsOf({ is_active: false, category_id: 2 }), ["products.bulk", "products.archive", "products.content"]);
  assert.deepEqual(cleanAllowedColumns("health", { is_active: true, price: 99, slug: "x", category_id: 4, category: "masks", brand: "Z" }), { is_active: true, category_id: 4, category: "masks" }, "a stored request cannot smuggle a price, a slug or a brand into Health");
  assert.deepEqual(cleanAllowedColumns("health", { price: null }), { price: null });
  assert.deepEqual(cleanIds([3, "4", 4, 5]), [3, 4, 5]);
  for (const bad of [[], null, "1,2", [0], [-1], [1.5], ["x"], Array.from({ length: BULK_MAX_IDS + 1 }, (_, i) => i + 1)]) assert.equal(cleanIds(bad), null, JSON.stringify(bad)?.slice(0, 30));
});

test("a person whose policy says 'needs approval' is evaluated as approval for a bulk change, direct for the others", async () => {
  const ev = (row, ops) => evaluateAll({ session: session(U(row)), panel: "health", operations: ops, audit: async () => {} });
  assert.equal((await ev(requesterRow, ["products.bulk", "products.archive"])).mode, "approval");
  assert.equal((await ev(directRow, ["products.bulk", "products.archive"])).mode, "direct");
});

test("approval: ONE request carries the ids and the change; nothing changes while it is pending; the reviewer's approval applies it to exactly those rows", async () => {
  const a = actx(requesterRow);
  const res = await fileBulkChange(a, { house: "health", ids: [1, 2], allowed: { is_active: true }, scope: null });
  assert.equal(res.ok, true); assert.equal(res.pending, true);
  assert.equal(reqs().length, 1);
  const r = reqs()[0];
  assert.deepEqual([r.operation, r.entity, r.base_updated_at], ["products.bulk", "products", null]);
  assert.deepEqual(r.proposed.ids, [1, 2]); assert.deepEqual(r.proposed.patch, { is_active: true }); assert.deepEqual(r.proposed.__ops, ["products.bulk", "products.publish"]);
  assert.deepEqual(r.before, { count: 2, scope: "page", blockedNow: 0, sample: ["S-1", "S-2"] });
  assert.equal(db.tables.products.find((p) => p.id === 1).is_active, false, "still inactive while pending");
  // (the same request filed twice is one request: the database's unique index on the request's content, covered with the other approvals)
  // the requester cannot approve their own; a reviewer can
  assert.equal((await approveRequest(db, { reviewer: U(requesterRow), panel: "health", id: r.id, executors: exec() })).error, "own");
  const ok = await approve(r.id);
  assert.equal(ok.ok, true); assert.equal(ok.result.count, 2);
  const live = (n) => db.tables.products.find((p) => p.id === n).is_active;
  assert.deepEqual([live(1), live(2), live(3), live(4)], [true, true, false, true], "only the two ids changed (4 was already active, 3 was not in the request)");
  assert.equal(reqs()[0].status, "approved");
});

test("the publish quality rule is judged at APPROVAL time: the ones that pass go live, the rest stay as they are; none passing = the request fails safely", async () => {
  const a = actx(requesterRow);
  await fileBulkChange(a, { house: "health", ids: [1, 3], allowed: { is_active: true } });            // 3 has no image
  db.tables.publish_rules.push({ house: "health", blocking: ["image"], version: 1 });                  // the rule is chosen AFTER the request was filed
  const ok = await approve(reqs()[0].id);
  assert.equal(ok.ok, true); assert.equal(ok.result.count, 1);
  assert.deepEqual([db.tables.products.find((p) => p.id === 1).is_active, db.tables.products.find((p) => p.id === 3).is_active], [true, false]);
  // only blocked products: nothing is filed in the first place
  const none = await fileBulkChange(a, { house: "health", ids: [3], allowed: { is_active: true } });
  assert.equal(none.ok, false); assert.equal(none.blockedCount, 1); assert.equal(reqs().length, 1, "a request that could never be applied is not filed");
  // filed while the rule did not block, then the rule makes every row fail → the approval fails as 'quality' and changes nothing
  db.tables.publish_rules.length = 0;
  db.tables.products.find((p) => p.id === 3).is_active = false;
  await fileBulkChange(a, { house: "health", ids: [3], allowed: { is_active: true } });
  db.tables.publish_rules.push({ house: "health", blocking: ["image"], version: 1 });
  const bad = await approve(reqs()[1].id);
  assert.equal(bad.ok, false); assert.equal(bad.error, "quality");
  assert.equal(db.tables.products.find((p) => p.id === 3).is_active, false);
  assert.equal(reqs()[1].status, "failed");
});

test("house separation: a Beauty request changes only Beauty's table; the executor ignores columns a request should not carry", async () => {
  const a = actx(requesterRow, "beauty");
  await fileBulkChange(a, { house: "beauty", ids: [1, 2], allowed: { is_active: true, brand: "Luxe" } });
  assert.equal(reqs()[0].house, "beauty");
  assert.equal((await approve(reqs()[0].id, "beauty")).ok, true);
  assert.deepEqual(db.tables.beauty_products.map((p) => [p.is_active, p.brand]), [[true, "Luxe"], [true, "Luxe"]]);
  assert.deepEqual(db.tables.products.map((p) => p.is_active), [false, false, false, true], "Health's table was not touched");
  // a tampered request in Health carries a slug and a price: only the allowed columns are applied
  db.tables.operator_change_requests.push({ id: id(900), house: "health", resource: "products", operation: "products.bulk", entity: "products", entity_id: null, subject: "bulk", requested_by: requesterRow.id, requested_at: ts, status: "pending",
    before: null, proposed: { ids: [1], patch: { is_active: true, slug: "hacked", price: 1, name_en: "X" }, __ops: ["products.bulk", "products.publish"] } });
  assert.equal((await approve(id(900))).ok, true);
  const p1 = db.tables.products.find((p) => p.id === 1);
  assert.deepEqual([p1.is_active, p1.slug, p1.price, p1.name_en], [true, "p-1", 10, "Product 1"]);
  // ids that do not exist / malformed
  db.tables.operator_change_requests.push({ id: id(901), house: "health", resource: "products", operation: "products.bulk", entity: "products", entity_id: null, subject: "bulk", requested_by: requesterRow.id, requested_at: ts, status: "pending", before: null, proposed: { ids: [999], patch: { is_active: false }, __ops: ["products.bulk", "products.archive"] } });
  assert.equal((await approve(id(901))).ok, false, "no such product: nothing applied");
  db.tables.operator_change_requests.push({ id: id(902), house: "health", resource: "products", operation: "products.bulk", entity: "products", entity_id: null, subject: "bulk", requested_by: requesterRow.id, requested_at: ts, status: "pending", before: null, proposed: { ids: ["1; drop"], patch: { is_active: false }, __ops: ["products.bulk"] } });
  assert.equal((await approve(id(902))).ok, false);
});

test("direct path unchanged: applyBulkChange counts the rows it changed and reports the ones the rule held back", async () => {
  db.tables.publish_rules.push({ house: "health", blocking: ["image"], version: 1 });
  const res = await applyBulkChange({ admin: db, house: "health", ids: [1, 3], allowed: { is_active: true } });
  assert.equal(res.ok, true); assert.equal(res.count, 1); assert.deepEqual(res.ids, [1]); assert.equal(res.stopped.blockedCount, 1);
  assert.equal((await applyBulkChange({ admin: db, house: "health", ids: [3], allowed: { is_active: true } })).quality, true);
  assert.equal((await applyBulkChange({ admin: db, house: "health", ids: [1], allowed: {} })).ok, false);
  db.fail = (t, op) => (t === "products" && op === "update" ? { message: "boom" } : null);
  assert.ok((await applyBulkChange({ admin: db, house: "health", ids: [2], allowed: { is_active: false } })).dbError);
});

// ── import ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const fakeEngine = (counts = { total: 2, create: 2, update: 0, skip: 0, error: 0 }) => {
  const calls = [];
  return { calls, processProductBatch: async (rows, o) => { calls.push({ n: rows.length, o }); return { ok: true, dryRun: Boolean(o.dryRun), results: [], counts: { ...counts, total: rows.length, create: o.dryRun ? counts.create : counts.create }, createdCategories: [] }; } };
};

test("import: the file is cleaned, dry-run on the server, and filed as ONE request; nothing is written", async () => {
  const eng = fakeEngine();
  const a = actx(requesterRow);
  a.needsApproval = true;
  const rows = [{ name_en: "Mask", sku: "M-1", price: 5, evil_column: "<script>", slug: "" }, { name_en: "Glove", sku: "G-1", price: "6" }];
  const res = await submitImport(a, { rows, options: { mode: "upsert", strict: false, autoCreateCategories: 1, autoTranslate: 0, junk: "x" }, fileName: "stock.xlsx\n" }, eng);
  assert.equal(res.ok, true); assert.equal(res.pending, true);
  assert.deepEqual(eng.calls.map((c) => c.o.dryRun), [true], "only a dry run");
  const r = reqs()[0];
  assert.deepEqual([r.operation, r.entity, r.subject], ["products.import", "products", "import · stock.xlsx  · 2"]);
  assert.deepEqual(r.proposed.rows, [{ name_en: "Mask", sku: "M-1", price: "5" }, { name_en: "Glove", sku: "G-1", price: "6" }], "only the template's columns, as text");
  assert.deepEqual(r.proposed.options, { mode: "upsert", autoCreateCategories: true, autoTranslate: false, strict: false });
  assert.equal(r.before.counts.create, 2);
  assert.equal(db.tables.products.length, 4, "nothing was imported");
});

test("import: refusals — direct people use the normal path, empty, too many, nothing to do, strict with errors", async () => {
  const eng = fakeEngine();
  const a = actx(requesterRow);
  assert.equal((await submitImport(a, { rows: [{ name_en: "x" }], options: {} }, eng)).error, M.direct, "not flagged as needing approval");
  a.needsApproval = true;
  assert.equal((await submitImport(a, { rows: [], options: {} }, eng)).error, M.noRows);
  assert.equal((await submitImport(a, { rows: "nope", options: {} }, eng)).error, M.noRows);
  assert.equal((await submitImport(a, { rows: Array.from({ length: MAX_ROWS_PER_FILE + 1 }, () => ({ name_en: "x" })), options: {} }, eng)).error, M.tooMany.replace("{max}", String(MAX_ROWS_PER_FILE)));
  assert.equal((await submitImport(a, { rows: [{ name_en: "x" }], options: {} }, fakeEngine({ total: 1, create: 0, update: 0, skip: 1, error: 0 }))).error, M.nothing);
  assert.equal((await submitImport(a, { rows: [{ name_en: "x" }], options: { strict: true } }, fakeEngine({ total: 1, create: 1, update: 0, skip: 0, error: 1 }))).error, M.strict);
  assert.equal((await submitImport(a, { rows: [{ name_en: "x".repeat(5000), description_en: "y".repeat(5000) }].concat(Array.from({ length: 300 }, () => ({ name_en: "x".repeat(5000), description_en: "y".repeat(5000) }))), options: {} }, eng)).error, M.tooBig);
  assert.equal(reqs().length, 0);
  const failing = { processProductBatch: async () => ({ ok: false, error: "engine down" }) };
  assert.equal((await submitImport(a, { rows: [{ name_en: "x" }], options: {} }, failing)).error, "engine down");
  assert.deepEqual(cleanImportRows([null, { sku: 5 }]), [{}, { sku: "5" }]);
});

test("import: the approval writes the rows NOW, in chunks, through the engine; a failing chunk fails the request; no runner = safe failure", async () => {
  const a = actx(requesterRow); a.needsApproval = true;
  const rows = Array.from({ length: 450 }, (_, i) => ({ name_en: `P${i}`, sku: `X-${i}` }));
  await submitImport(a, { rows, options: { mode: "add" }, fileName: "big.csv" }, fakeEngine({ total: 0, create: 1, update: 0, skip: 0, error: 0 }));
  const rid = reqs()[0].id;
  const eng = fakeEngine({ total: 0, create: 1, update: 0, skip: 0, error: 0 });
  const logged = [];
  const runner = (job) => runApprovedImport(job, { processProductBatch: eng.processProductBatch, recordImportLog: async (e) => { logged.push(e); } });
  const ok = await approve(rid, "health", runner);
  assert.equal(ok.ok, true);
  assert.deepEqual(eng.calls.map((c) => [c.n, c.o.dryRun]), [[200, false], [200, false], [50, false]], "three chunks, real writes");
  assert.equal(ok.result.counts.total, 450);
  assert.deepEqual([logged.length, logged[0].source, logged[0].total, logged[0].fileName], [1, "approval", 450, "big.csv"]);
  // a chunk that fails: the request is marked failed
  await submitImport(a, { rows: rows.slice(0, 3), options: { mode: "add" }, fileName: "b.csv" }, fakeEngine());
  const failing = (job) => runApprovedImport(job, { processProductBatch: async () => ({ ok: false }), recordImportLog: async () => {} });
  const bad = await approve(reqs()[1].id, "health", failing);
  assert.equal(bad.ok, false); assert.equal(reqs()[1].status, "failed");
  // no runner at all
  await submitImport(a, { rows: rows.slice(0, 2), options: { mode: "add" }, fileName: "c.csv" }, fakeEngine());
  const none = await approve(reqs()[2].id, "health", null);
  assert.equal(none.ok, false); assert.equal(reqs()[2].status, "failed");
  assert.equal((await runApprovedImport({ rows: [] }, {})).ok, false);
  assert.equal((await runApprovedImport({ rows: [{ name_en: "x" }], options: { strict: true } }, { processProductBatch: async () => ({ ok: true, aborted: true, counts: {} }), recordImportLog: async () => {} })).ok, false, "a strict abort is a failure");
});

test("wiring: filing for approval in both houses, the helpers allow people who may ask, the write stays direct-only, the reviewer reads a summary", () => {
  for (const [f, house] of [["lib/operator/importActions.js", "health"], ["lib/beauty/operator/importActions.js", "beauty"]]) {
    const s = read(f);
    for (const fn of ["parseSpreadsheet", "downloadTemplateXlsx", "dryRunProductRows", "checkSkusExist"]) {
      const body = s.slice(s.indexOf(`export async function ${fn}(`), s.indexOf("\n}\n", s.indexOf(`export async function ${fn}(`)));
      assert.match(body, new RegExp(`gateAsk\\(session, "${house}", "products\\.import"\\)`), `${f}:${fn} lets a person who may ASK read, check and download`);
    }
    for (const fn of ["commitProductRows", "finalizeProductBatch"]) {
      const body = s.slice(s.indexOf(`export async function ${fn}(`), s.indexOf("\n}\n", s.indexOf(`export async function ${fn}(`)));
      assert.match(body, new RegExp(`await gate\\(session, "${house}", "products\\.import"\\)`), `${f}:${fn} writes only for a person who may do it directly`);
    }
    assert.match(s, new RegExp(`submitImportForApproval[\\s\\S]*buildActionCtx\\(\\{ panel: "${house}", getSession, operation: "products\\.import", approvable: true \\}\\)`), f);
  }
  for (const f of ["lib/operator/approvalActions.js", "lib/beauty/operator/approvalActions.js"]) assert.match(read(f), /importRunner: \(job\) => runApprovedImport\(job, \{ processProductBatch, recordImportLog \}\)/, f);
  for (const f of ["components/operator/ImportWizard.jsx", "components/beauty/operator/ImportWizard.jsx", "components/operator/BulkAddGrid.jsx", "components/beauty/operator/BulkAddGrid.jsx"]) {
    const s = read(f);
    assert.match(s, /useMode\("products\.import"\)/, f); assert.match(s, /submitImportForApproval\(/, f); assert.match(s, /import-filed/, f);
  }
  assert.match(read("lib/operator/approvalActionsCore.js"), /proposed: proposedView\(r\)/);
  assert.match(read("lib/operator/approvalActionsCore.js"), /r\.operation === "products\.import"/);
});
