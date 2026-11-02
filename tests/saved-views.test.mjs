// Saved list views (N9): a view is the PERSON's own filters of one list in one house. Proves the pure cleaning (a stored value can only ever be a
// filter the page itself accepts, never a page number), save / list / delete against an in-memory database (own rows only, own house, own list,
// unique name, at most 20, needs a personal account and the right to see the list), and that both houses' lists and pages are wired to it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanViewName, cleanViewParams, viewHref, VIEW_LIMITS, VIEW_MESSAGES } from "../lib/operator/savedViews.js";
import { saveView, deleteView, readSavedViews } from "../lib/operator/savedViewsCore.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const person = (id, role = "owner", houses = ["health", "beauty"]) => ({ user: { id, username: id, status: "active", role, houses, allow: [], deny: [], approval: {} } });
const UID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const mkDb = () => {
  let n = 0;
  return createMemoryAdmin({ operator_saved_views: [] }, {
    unique: { operator_saved_views: [["user_id", "house", "list", "name"]] },
    defaults: { operator_saved_views: () => ({ id: UID(++n + 100), created_at: new Date(1_000 + n).toISOString() }) },
  });
};
const ctx = (admin, session, panel = "health") => ({ admin, session, panel, audit: async () => {} });

test("names: trimmed, one line, 1–40 characters", () => {
  assert.equal(cleanViewName("  Low   stock \n gloves "), "Low stock gloves");
  for (const bad of ["", "   ", null, undefined, 5, {}, "x".repeat(VIEW_LIMITS.name + 1)]) assert.equal(cleanViewName(bad), null, String(bad));
  assert.equal(cleanViewName("x".repeat(VIEW_LIMITS.name)).length, VIEW_LIMITS.name);
});

test("params: only filters the page accepts, no page number, defaults dropped", () => {
  assert.deepEqual(cleanViewParams("products", { status: "active", stock: "out", page: "7", sort: "updated" }), { stock: "out", status: "active" });
  assert.deepEqual(cleanViewParams("products", { status: "evil; drop", cat: "a,b", world: "X Y", evil: "1", __proto__: { x: 1 } }), {});
  assert.deepEqual(cleanViewParams("products", "garbage"), {}); assert.deepEqual(cleanViewParams("products", null), {}); assert.deepEqual(cleanViewParams("products", ["x"]), {});
  assert.deepEqual(cleanViewParams("quotes", { tab: "archived", attention: "1", who: "__none", page: 3 }), { tab: "archived", who: "__none", attention: "1" });
  assert.deepEqual(cleanViewParams("quotes", { tab: "active" }), {});
  assert.equal(cleanViewParams("products", { q: "y".repeat(500) }).q.length, 80);
});

test("a view leads to the list's own address, always on page 1", () => {
  assert.equal(viewHref("products", "/operator/products", { stock: "out", status: "active", page: "9" }), "/operator/products?stock=out&status=active");
  assert.equal(viewHref("quotes", "/beauty/operator/quotes", { tab: "spam" }), "/beauty/operator/quotes?tab=spam");
  assert.equal(viewHref("products", "/operator/products", {}), "/operator/products");
});

test("save, list and delete — the person's own rows only", async () => {
  const db = mkDb();
  const a = person("a"), b = person("b");
  const s1 = await saveView(ctx(db, a), "products", " Out of stock ", { stock: "out", page: 4 });
  assert.equal(s1.ok, true); assert.deepEqual(s1.view.params, { stock: "out" }); assert.equal(s1.view.name, "Out of stock");
  assert.deepEqual(db.tables.operator_saved_views[0].params, { stock: "out" }, "the stored params are the cleaned ones");
  assert.equal(db.tables.operator_saved_views[0].user_id, "a"); assert.equal(db.tables.operator_saved_views[0].house, "health");
  assert.equal((await readSavedViews(db, a, "health", "products")).views.length, 1);
  assert.equal((await readSavedViews(db, b, "health", "products")).views.length, 0, "another person sees nothing");
  assert.equal((await readSavedViews(db, a, "beauty", "products")).views.length, 0, "the other house sees nothing");
  assert.equal((await readSavedViews(db, a, "health", "quotes")).views.length, 0, "the other list sees nothing");
  const id = s1.view.id;
  const foreign = await deleteView(ctx(db, b), "products", id);
  assert.equal(foreign.ok, false); assert.equal(foreign.error, VIEW_MESSAGES.notFound);
  assert.equal((await deleteView(ctx(db, a, "beauty"), "products", id)).ok, false, "not from the other house");
  assert.equal((await deleteView(ctx(db, a), "quotes", id)).ok, false, "not through the other list");
  assert.equal(db.tables.operator_saved_views.length, 1);
  assert.equal((await deleteView(ctx(db, a), "products", id)).ok, true);
  assert.equal(db.tables.operator_saved_views.length, 0);
  assert.equal((await deleteView(ctx(db, a), "products", id)).error, VIEW_MESSAGES.notFound);
  for (const bad of [undefined, 5, "../x", "1 or 1=1"]) assert.equal((await deleteView(ctx(db, a), "products", bad)).ok, false, String(bad));
});

test("refusals: no filters, bad name, same name twice, no personal account, no right to see the list, a failing write", async () => {
  const db = mkDb(), a = person("a");
  assert.equal((await saveView(ctx(db, a), "products", "Empty", { page: 3, sort: "updated" })).error, VIEW_MESSAGES.emptyFilters);
  assert.equal((await saveView(ctx(db, a), "products", "  ", { stock: "in" })).error, VIEW_MESSAGES.badName);
  assert.equal((await saveView(ctx(db, a), "nope", "X", { stock: "in" })).ok, false);
  assert.equal((await saveView(ctx(db, a), "products", "Dup", { stock: "in" })).ok, true);
  assert.equal((await saveView(ctx(db, a), "products", "Dup", { stock: "out" })).error, VIEW_MESSAGES.nameTaken);
  assert.equal((await saveView(ctx(db, person("b")), "products", "Dup", { stock: "out" })).ok, true, "another person may use the same name");
  assert.equal((await saveView(ctx(db, {}), "products", "Legacy", { stock: "in" })).error, VIEW_MESSAGES.needsAccount, "the shared login has no person");
  assert.deepEqual((await readSavedViews(db, {}, "health", "products")).views, []);
  const noRight = person("c", "warehouse", ["health"]);                    // may not see the requests
  assert.equal((await saveView(ctx(db, noRight), "quotes", "Q", { tab: "spam" })).denied, true);
  assert.equal((await saveView(ctx(db, person("d", "owner", ["beauty"])), "products", "Wrong house", { stock: "in" })).denied, true, "a Beauty person cannot save a Health view");
  db.fail = () => ({ message: "boom" });
  assert.equal((await saveView(ctx(db, a), "products", "Boom", { stock: "in" })).error, VIEW_MESSAGES.generic);
});

test("a table that is not there yet says so; reading gives nothing instead of failing", async () => {
  const db = createMemoryAdmin({});
  const r = await saveView(ctx(db, person("a")), "products", "X", { stock: "in" });
  assert.equal(r.ok, false); assert.equal(r.error, VIEW_MESSAGES.needsMigration);
  const l = await readSavedViews(db, person("a"), "health", "products");
  assert.equal(l.ok, false); assert.equal(l.needsMigration, true); assert.deepEqual(l.views, []);
});

test("at most 20 per list (the database refuses the 21st; the screen stops offering it)", async () => {
  const db = mkDb(), a = person("a");
  db.tables.operator_saved_views = Array.from({ length: 20 }, (_, i) => ({ id: UID(i + 1), user_id: "a", house: "health", list: "products", name: `v${i}`, params: { q: "x" }, created_at: new Date(i).toISOString() }));
  db.fail = (table, op) => (table === "operator_saved_views" && op === "insert" ? { message: "operator_saved_views:too_many" } : null);
  assert.equal((await saveView(ctx(db, a), "products", "21st", { stock: "in" })).error, VIEW_MESSAGES.tooMany);
  assert.equal((await readSavedViews(db, a, "health", "products")).views.length, 20);
  assert.match(read("components/operator/SavedViews.jsx"), /views\.length < VIEW_LIMITS\.perList/);
});

test("a stored row that was tampered with is cleaned again on the way out", async () => {
  const db = mkDb();
  db.tables.operator_saved_views = [{ id: UID(1), user_id: "a", house: "health", list: "products", name: "Odd", params: { stock: "out", page: "99", evil: "x", status: "zzz" }, created_at: "2026-10-01" }];
  const { views } = await readSavedViews(db, person("a"), "health", "products");
  assert.deepEqual(views[0].params, { stock: "out" });
});

test("wiring: both houses' lists show them, the pages hand them over, the actions check the session first", () => {
  for (const f of ["components/operator/ProductsTable.jsx", "components/beauty/operator/ProductsTable.jsx", "components/operator/QuotesPanel.jsx"]) assert.match(read(f), /<SavedViews /, f);
  for (const f of ["components/operator/QuotesManager.jsx", "components/beauty/operator/QuotesManager.jsx"]) assert.match(read(f), /viewActions/, f);
  for (const [f, house] of [["app/operator/(panel)/products/page.jsx", "health"], ["app/operator/(panel)/quotes/page.jsx", "health"], ["app/beauty/operator/(panel)/products/page.jsx", "beauty"], ["app/beauty/operator/(panel)/quotes/page.jsx", "beauty"]]) {
    assert.match(read(f), new RegExp(`savedViewsOf\\(session, "${house}", "(products|quotes)"\\)`), f);
  }
  for (const [f, house] of [["lib/operator/savedViewActions.js", "health"], ["lib/beauty/operator/savedViewActions.js", "beauty"]]) {
    const src = read(f);
    assert.match(src, /^"use server";/);
    assert.equal((src.match(/await getSession\(\)/g) || []).length, 2, f);
    assert.match(src, new RegExp(`warehouseCtx\\("${house}"`), f);
    assert.doesNotMatch(src, /userId|user_id/, `${f}: who the person is never comes from the client`);
  }
  assert.match(read("lib/operator/savedViewsPage.js"), /^\/\/.*\n?import "server-only"/m);
});
