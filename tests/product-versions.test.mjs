// Product history and "revert this change" (lib/operator/productVersions.js, productRestoreCore.js) against an in-memory database:
// only changed fields are recorded; a revert writes the old values back as a NEW recorded change, only to the version the person saw;
// identifying fields are never reverted; price / visibility keep their own rights; a revert that needs approval is filed, not applied.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { recordVersion, listVersions, getVersion, revertPlan, versionTable, NEVER_REVERTED, VERSION_MESSAGES } from "../lib/operator/productVersions.js";
import { restoreVersion, conflictInfo, whoOf } from "../lib/operator/productRestoreCore.js";

const T1 = "2026-10-01T10:00:00.000Z", T2 = "2026-10-02T10:00:00.000Z";
const product = (o = {}) => ({ id: 7, slug: "gloves", sku: "G-7", name_en: "Gloves", price: 12, is_active: true, in_stock: true, tags: ["a"], updated_at: T2, ...o });
function setup(extra = {}) {
  let vid = 0;
  const nextVersion = () => ({ id: ++vid, created_at: `2026-10-02T10:00:0${vid}.000Z` });     // what the database's identity column and default do
  const db = createMemoryAdmin({ products: [product()], product_versions: [], beauty_product_versions: [], ...extra }, {
    defaults: { product_versions: nextVersion, beauty_product_versions: nextVersion },
    beforeUpdate: { products: (old, next) => { if (JSON.stringify(old) !== JSON.stringify(next)) next.updated_at = "2026-10-03T10:00:00.000Z"; return null; } },
  });
  return db;
}
const a = (db, over = {}) => {
  const logged = [], filed = [];
  return { admin: db, session: { user: { id: "u1", username: "sara" } }, audit: async (...x) => logged.push(x), evaluate: async () => ({ mode: "direct" }), file: async (s) => { filed.push(s); return { ok: true, pending: true }; }, needsApproval: false, logged, filed, ...over };
};

test("tables per house; only changed fields are recorded; system fields never are; a failure never throws", async () => {
  assert.equal(versionTable("health"), "product_versions");
  assert.equal(versionTable("beauty"), "beauty_product_versions");
  const db = setup();
  const r = await recordVersion(db, "health", { productId: 7, kind: "update", before: { price: 10, name_en: "G" }, after: { price: 12, updated_at: "x", id: 7 }, who: { userId: "u1", label: "sara" } });
  assert.equal(r.ok, true);
  const row = db.tables.product_versions[0];
  assert.deepEqual([row.changed, row.before, row.after, row.actor_label, row.kind], [["price"], { price: 10 }, { price: 12 }, "sara", "update"]);
  assert.equal((await recordVersion(db, "health", { productId: 7, kind: "update", before: {}, after: {} })).skipped, true, "no change, no row");
  db.fail = () => ({ code: "42P01", message: "relation does not exist" });
  assert.equal((await recordVersion(db, "health", { productId: 7, kind: "update", before: { a: 1 }, after: { a: 2 } })).ok, false, "a missing table is not an exception");
  assert.equal((await recordVersion(null, "health", { productId: 1, kind: "update", before: { a: 1 }, after: { a: 2 } })).ok, false);
  assert.equal(whoOf({ user: { id: "u9", username: "ali" } }).label, "ali");
  assert.deepEqual(whoOf({ username: "env" }), { userId: null, label: "env" });
});

test("revertPlan: the old values of the fields that differ now; identifying fields are never written back; later changes are flagged", () => {
  const v = { before: { price: 10, name_en: "Gloves", slug: "old-slug", sku: "OLD", is_active: false }, after: { price: 11, name_en: "Gloves", slug: "gloves", sku: "G-7", is_active: true } };
  const cur = product({ price: 12 });
  const plan = revertPlan(cur, v);
  assert.deepEqual(plan.fields, { price: 10, is_active: false });
  assert.deepEqual(plan.changedSince, ["price"], "price was changed again after this version (11 → 12)");
  for (const k of NEVER_REVERTED) assert.ok(!(k in plan.fields), k);
  assert.deepEqual(revertPlan(product({ price: 10, is_active: false }), v).fields, {}, "already like that");
  assert.deepEqual(revertPlan(cur, { before: { tags: ["a"] }, after: {} }).fields, {}, "objects compare by value");
});

test("listVersions / getVersion: newest first, bounded, scoped to the product, a missing table is reported", async () => {
  const db = setup();
  for (let i = 0; i < 3; i++) await recordVersion(db, "health", { productId: 7, kind: "update", before: { price: i }, after: { price: i + 1 } });
  await recordVersion(db, "health", { productId: 8, kind: "update", before: { price: 1 }, after: { price: 2 } });
  const list = await listVersions(db, "health", 7);
  assert.deepEqual(list.versions.map((v) => v.id), [3, 2, 1], "newest first, only this product");
  assert.equal((await listVersions(db, "health", 7, 2)).versions.length, 2);
  assert.equal((await getVersion(db, "health", 8, db.tables.product_versions[0].id)).ok, false, "a version of another product is not found");
  db.fail = () => ({ code: "42P01", message: "x" });
  assert.equal((await listVersions(db, "health", 7)).error, VERSION_MESSAGES.unavailable);
});

async function withVersion(db) {
  await recordVersion(db, "health", { productId: 7, kind: "update", before: { price: 10, is_active: false }, after: { price: 12, is_active: true }, who: { userId: "u1", label: "ali" } });
  return db.tables.product_versions[0].id;
}
const run = (ctx, vid, expected = T2) => restoreVersion(ctx, { panel: "health", table: "products", productId: 7, versionId: vid, expectedUpdatedAt: expected, revalidate: () => {} });

test("revert: old values go back as a NEW recorded change, only to the version the person saw", async () => {
  const db = setup(); const vid = await withVersion(db); const ctx = a(db);
  const r = await run(ctx, vid);
  assert.equal(r.ok, true); assert.deepEqual(r.fields.sort(), ["is_active", "price"]);
  assert.deepEqual([db.tables.products[0].price, db.tables.products[0].is_active], [10, false]);
  const rec = db.tables.product_versions.at(-1);
  assert.deepEqual([rec.kind, rec.reverts_id, rec.changed.sort(), rec.before.price, rec.after.price, rec.actor_label], ["restore", vid, ["is_active", "price"], 12, 10, "sara"]);
  assert.equal(ctx.logged[0][0], "product.restore");
  assert.equal(ctx.logged[0][1].detail.version, vid);
  assert.equal((await run(ctx, vid, db.tables.products[0].updated_at)).error, VERSION_MESSAGES.nothing, "reverting twice has nothing left to do");
});

test("revert: a screen that is out of date gets the conflict answer and nothing is written", async () => {
  const db = setup(); const vid = await withVersion(db); const ctx = a(db);
  const r = await run(ctx, vid, T1);
  assert.equal(r.conflict, true); assert.equal(r.currentUpdatedAt, T2);
  assert.equal(r.lastChange.who, "ali");
  assert.equal(db.tables.products[0].price, 12);
  assert.equal(db.tables.product_versions.length, 1);
});

test("revert: unknown version / product, and a version of another product", async () => {
  const db = setup(); const vid = await withVersion(db); const ctx = a(db);
  assert.equal((await run(ctx, 999)).error, VERSION_MESSAGES.notFound);
  assert.equal((await run(ctx, "abc")).error, VERSION_MESSAGES.notFound);
  assert.equal((await restoreVersion(ctx, { panel: "health", table: "products", productId: 99, versionId: vid, expectedUpdatedAt: T2 })).error, VERSION_MESSAGES.notFound);
});

test("revert: a missing right for the price or visibility refuses the whole revert; approval mode files a request instead of writing", async () => {
  const db = setup(); const vid = await withVersion(db);
  const denied = a(db, { evaluate: async () => ({ mode: "denied", refusal: { ok: false, denied: true, error: "no" } }) });
  assert.equal((await run(denied, vid)).denied, true);
  assert.equal(db.tables.products[0].price, 12);
  const approval = a(db, { evaluate: async (ops) => ({ mode: ops.includes("products.price") ? "approval" : "direct" }) });
  const r = await run(approval, vid);
  assert.equal(r.pending, true);
  assert.equal(db.tables.products[0].price, 12, "nothing is written while it waits");
  const spec = approval.filed[0];
  assert.deepEqual([spec.operation, spec.entityId, spec.baseUpdatedAt], ["products.content", 7, T2]);
  assert.ok(spec.ops.includes("products.price") && spec.ops.includes("products.restore_version") && spec.ops.includes("products.archive"));
  assert.deepEqual(spec.proposed, { price: 10, is_active: false });
  assert.deepEqual(spec.before, { price: 12, is_active: true });
});

test("conflictInfo works without a history table too", async () => {
  const db = setup(); db.fail = () => ({ code: "42P01", message: "x" });
  const r = await conflictInfo(db, "health", 7, { updated_at: T2 });
  assert.deepEqual([r.ok, r.conflict, r.currentUpdatedAt, r.lastChange], [false, true, T2, null]);
});
