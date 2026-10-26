// Permanently deleting a product (lib/operator/productDelete.js): every rule is enforced on the server.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deleteProductGuarded, parseProductId, parseProductIds, expectedConfirmation, confirmationMatches, PRODUCT_DELETE_MESSAGES as M } from "../lib/operator/productDelete.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const ARCHIVED = { id: 7, slug: "gloves", sku: "G-100", name_en: "Gloves", name_fa: "دستکش", is_active: false };

// Records every call; `row` is what the product lookup returns, `deleted` what the delete returns.
function fakeAdmin({ row = ARCHIVED, readError = null, deleted = [{ id: 7 }], deleteError = null } = {}) {
  const calls = [];
  const admin = {
    from(table) {
      const call = { table, op: null, filters: [] };
      calls.push(call);
      const chain = {
        select(cols) { if (!call.op) call.op = "read"; call.cols = cols; return call.op === "delete" ? Promise.resolve({ data: deleteError ? null : deleted, error: deleteError }) : chain; },
        delete() { call.op = "delete"; return chain; },
        eq(col, val) { call.filters.push([col, val]); return chain; },
        maybeSingle() { return Promise.resolve({ data: readError ? null : row, error: readError }); },
      };
      return chain;
    },
  };
  return { admin, calls };
}

async function run(opts = {}) {
  const { session = { role: "admin" }, admin, id = 7, audit, table = "products" } = opts;
  const confirmation = "confirmation" in opts ? opts.confirmation : "G-100";   // an explicit undefined must stay undefined
  let adminRequested = 0;
  const res = await deleteProductGuarded({ getSession: async () => session, getAdminClient: () => { adminRequested++; return admin ?? null; }, table, id, confirmation, audit });
  return { res, adminRequested };
}
const okAudit = () => { const seen = []; return { seen, audit: async (e) => { seen.push(e); return { ok: true }; } }; };

test("ids: only positive integers; bulk lists are capped and any bad entry rejects the whole call", () => {
  assert.equal(parseProductId(12), 12);
  assert.equal(parseProductId("12"), 12);
  for (const bad of [0, -1, 1.5, "0", "012", "1 or 1=1", "1,2", "", null, undefined, NaN, [], [1], {}, true, "9".repeat(20)]) assert.equal(parseProductId(bad), null, JSON.stringify(bad));
  assert.deepEqual(parseProductIds([1, "2", 2]), [1, 2]);
  for (const bad of [[], null, "1", [1, "x"], [1, 2.5], [1, null], Array.from({ length: 501 }, (_, i) => i + 1)]) assert.equal(parseProductIds(bad), null, JSON.stringify(bad)?.slice(0, 40));
  assert.equal(parseProductIds(Array.from({ length: 500 }, (_, i) => i + 1)).length, 500);
});

test("confirmation text: the SKU, else the English name, else the Persian name, else the id; case and spacing do not matter", () => {
  assert.equal(expectedConfirmation({ id: 1, sku: " G-100 ", name_en: "x" }), "G-100");
  assert.equal(expectedConfirmation({ id: 1, sku: "", name_en: "Blue  Gloves" }), "Blue Gloves");
  assert.equal(expectedConfirmation({ id: 1, name_fa: "دستکش" }), "دستکش");
  assert.equal(expectedConfirmation({ id: 9 }), "9");
  assert.equal(confirmationMatches(" g-100 ", { id: 1, sku: "G-100" }), true);
  assert.equal(confirmationMatches("G-1000", { id: 1, sku: "G-100" }), false);
  assert.equal(confirmationMatches("", { id: 1, sku: "G-100" }), false);
  assert.equal(confirmationMatches("anything", {}), false, "nothing to compare with never matches");
});

test("no session: nothing is read or deleted and the database client is never requested", async () => {
  const { admin, calls } = fakeAdmin();
  const { res, adminRequested } = await run({ session: null, admin });
  assert.deepEqual(res, { ok: false, error: M.noSession });
  assert.equal(adminRequested, 0);
  assert.equal(calls.length, 0);
});

test("no service key, bad id: refused before any database call", async () => {
  assert.deepEqual((await run({ admin: null })).res, { ok: false, error: M.noKey });
  const { admin, calls } = fakeAdmin();
  for (const id of ["1 or 1=1", -3, null, [7], "7;drop"]) assert.deepEqual((await run({ admin, id })).res, { ok: false, error: M.badId });
  assert.equal(calls.length, 0);
});

test("a product that does not exist answers notFound and deletes nothing", async () => {
  const { admin, calls } = fakeAdmin({ row: null });
  const { res } = await run({ admin });
  assert.deepEqual(res, { ok: false, notFound: true, error: M.notFound });
  assert.ok(!calls.some((c) => c.op === "delete"));
});

test("a visible product cannot be deleted - archive it first (also when the column is missing)", async () => {
  for (const row of [{ ...ARCHIVED, is_active: true }, { ...ARCHIVED, is_active: null }, { ...ARCHIVED, is_active: undefined }]) {
    const { admin, calls } = fakeAdmin({ row });
    const { res } = await run({ admin });
    assert.deepEqual(res, { ok: false, error: M.notArchived }, JSON.stringify(row.is_active));
    assert.ok(!calls.some((c) => c.op === "delete"));
  }
});

test("the typed text must match the stored SKU; the server decides, not the browser", async () => {
  const { admin, calls } = fakeAdmin();
  const { seen, audit } = okAudit();
  for (const confirmation of ["", "G-10", "gloves", undefined, null, 7, {}]) {
    assert.deepEqual((await run({ admin, confirmation, audit })).res, { ok: false, error: M.wrongConfirmation }, JSON.stringify(confirmation));
  }
  assert.ok(!calls.some((c) => c.op === "delete"));
  assert.equal(seen.length, 0, "nothing is logged for a refused attempt");
});

test("the activity log is written FIRST; if it cannot be written nothing is deleted, a missing log table is allowed", async () => {
  const a1 = fakeAdmin();
  const failing = await run({ admin: a1.admin, audit: async () => ({ ok: false }) });
  assert.deepEqual(failing.res, { ok: false, error: M.auditFailed });
  assert.ok(!a1.calls.some((c) => c.op === "delete"));
  const a2 = fakeAdmin();
  const throwing = await run({ admin: a2.admin, audit: async () => { throw new Error("db down"); } }).catch((e) => e);
  assert.ok(throwing instanceof Error || throwing.res?.ok === false, "a log failure never turns into a delete");
  assert.ok(!a2.calls.some((c) => c.op === "delete"));
  const a3 = fakeAdmin();
  assert.equal((await run({ admin: a3.admin, audit: async () => ({ ok: false, unavailable: true }) })).res.ok, true);
});

test("success: deletes exactly that archived row of that table, logs the id and SKU, returns the slug for cache refresh", async () => {
  const { admin, calls } = fakeAdmin();
  const { seen, audit } = okAudit();
  const { res } = await run({ admin, audit });
  assert.deepEqual(res, { ok: true, slug: "gloves" });
  assert.deepEqual(seen, [{ action: "product.delete", entity: "products", ids: [7], detail: { sku: "G-100" } }]);
  const del = calls.find((c) => c.op === "delete");
  assert.equal(del.table, "products");
  assert.deepEqual(del.filters, [["id", 7], ["is_active", false]], "the delete repeats the 'archived' condition");
  const beauty = fakeAdmin({ row: { ...ARCHIVED, id: 3 }, deleted: [{ id: 3 }] });
  await run({ admin: beauty.admin, table: "beauty_products", id: 3 });
  assert.equal(beauty.calls.find((c) => c.op === "delete").table, "beauty_products");
});

test("a product re-activated between the check and the delete is NOT deleted", async () => {
  const { admin } = fakeAdmin({ deleted: [] });          // the database matched no archived row any more
  assert.deepEqual((await run({ admin })).res, { ok: false, error: M.changed });
});

test("database errors are reported without details", async () => {
  assert.deepEqual((await run({ admin: fakeAdmin({ readError: { message: "secret detail" } }).admin })).res, { ok: false, error: M.failed });
  assert.deepEqual((await run({ admin: fakeAdmin({ deleteError: { message: "secret detail" } }).admin })).res, { ok: false, error: M.failed });
});

test("both panels wire their own session, table and audit; the buttons exist only for archived rows", () => {
  const health = read("lib/operator/actions.js"), beauty = read("lib/beauty/operator/actions.js");
  assert.match(health, /deleteProductGuarded\(\{\s*getSession, getAdminClient, table: "products", id, confirmation,\s*audit: makeAudit\("health"/);
  assert.match(beauty, /deleteProductGuarded\(\{\s*getSession, getAdminClient, table: "beauty_products", id, confirmation,\s*audit: makeAudit\("beauty"/);
  for (const f of ["components/operator/ProductsTable.jsx", "components/beauty/operator/ProductsTable.jsx"]) {
    const src = read(f);
    assert.match(src, /\{!active && \(\s*<button onClick=\{\(\) => setDeleting\(p\)\}/, `${f}: delete only on archived rows`);
    assert.match(src, /<DeleteProductModal product=\{deleting\}/);
  }
  assert.match(read("lib/operator/security.js"), /"product\.delete":/, "the activity page has a label for it");
});
