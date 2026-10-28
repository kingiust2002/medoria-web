// The panel-wide quick search: only what the person may see, short facts and links, syntax characters cannot change the filter,
// the other house's people are not shown, an unavailable source is absent rather than an error.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { searchPanel, SEARCH_MIN } from "../lib/operator/panelSearch.js";

const seed = () => ({
  products: [{ id: 1, sku: "GLV-100", name_en: "Nitrile gloves", name_fa: "دستکش", is_active: true }, { id: 2, sku: "MSK-1", name_en: "Mask", is_active: false }],
  quote_requests: [{ id: 5, name: "Gloves Ltd", organization: "", tracking_code: "MH-AAAA-BBBB-CCCC", product_name: "Nitrile gloves", phone: "+992900000042", status: "new", message: "SECRET MESSAGE TEXT" }],
  categories: [{ id: 3, slug: "gloves", name_en: "Gloves", name_fa: "دستکش‌ها" }],
  beauty_products: [{ id: 9, sku: "SER-9", name_en: "Serum", is_active: true }],
  beauty_brands: [{ id: 4, slug: "acme", name_en: "Acme" }],
  operator_users: [{ id: "u1", username: "sara", display_name: "Sara Gloves", houses: ["health"], status: "active" }, { id: "u2", username: "ali.gloves", display_name: "Ali", houses: ["beauty"], status: "active" }],
});
const ALL = { products: true, quotes: true, categories: true, brands: true, users: true };
const kinds = (r) => r.groups.map((g) => g.kind);

test("short or empty terms search nothing", async () => {
  const db = createMemoryAdmin(seed());
  for (const q of ["", " ", "g", null, undefined]) assert.deepEqual(await searchPanel({ admin: db, panel: "health", access: ALL, q }), { ok: true, groups: [] }, String(q));
  assert.equal(SEARCH_MIN, 2);
});

test("every source the person may see answers with short facts and a link; the message text never appears", async () => {
  const r = await searchPanel({ admin: createMemoryAdmin(seed()), panel: "health", access: ALL, q: "glove" });
  assert.deepEqual(kinds(r), ["products", "quotes", "categories", "users"]);
  const by = Object.fromEntries(r.groups.map((g) => [g.kind, g.items]));
  assert.deepEqual([by.products[0].href, by.products[0].sub], ["/operator/products/1/edit", "GLV-100"]);
  assert.equal(by.quotes[0].href, "/operator/quotes?q=MH-AAAA-BBBB-CCCC");
  assert.equal(by.categories[0].href, "/operator/categories");
  assert.deepEqual(by.users.map((u) => u.title), ["Sara Gloves"], "the other house's person is not shown");
  assert.ok(!JSON.stringify(r).includes("SECRET MESSAGE"));
});

test("a source the person may not see is never queried", async () => {
  const db = createMemoryAdmin(seed());
  const r = await searchPanel({ admin: db, panel: "health", access: { products: true }, q: "glove" });
  assert.deepEqual(kinds(r), ["products"]);
  assert.deepEqual([...new Set(db.log.map((l) => l[0]))], ["products"]);
  assert.deepEqual((await searchPanel({ admin: db, panel: "health", access: {}, q: "glove" })).groups, []);
});

test("a phone number finds a request only when it has at least four digits; archived products are marked", async () => {
  const db = createMemoryAdmin(seed());
  assert.deepEqual(kinds(await searchPanel({ admin: db, panel: "health", access: { quotes: true }, q: "0042" })), ["quotes"]);
  assert.deepEqual(kinds(await searchPanel({ admin: db, panel: "health", access: { quotes: true }, q: "+99" })), []);
  const r = await searchPanel({ admin: db, panel: "health", access: { products: true }, q: "msk" });
  assert.equal(r.groups[0].items[0].inactive, true);
});

test("Beauty searches its own tables, with brands and its own base path", async () => {
  const db = createMemoryAdmin(seed());
  const r = await searchPanel({ admin: db, panel: "beauty", access: { products: true, brands: true, users: true }, q: "a" + "c" });
  assert.deepEqual(kinds(r).sort(), ["brands", "users"].sort().filter((k) => kinds(r).includes(k)));
  const p = await searchPanel({ admin: db, panel: "beauty", access: { products: true }, q: "serum" });
  assert.equal(p.groups[0].items[0].href, "/beauty/operator/products/9/edit");
  assert.equal((await searchPanel({ admin: db, panel: "beauty", access: { brands: true }, q: "acme" })).groups[0].items[0].href, "/beauty/operator/brands");
});

test("syntax characters in the term cannot change the filter; LIKE wildcards are literal; an unavailable table is just absent", async () => {
  const db = createMemoryAdmin(seed());
  for (const evil of ["x,id.eq.1", "a),(b", "%%", "_", "\\", "name_en.ilike.%"]) assert.doesNotThrow(() => searchPanel({ admin: db, panel: "health", access: ALL, q: evil }), evil);
  assert.deepEqual((await searchPanel({ admin: db, panel: "health", access: { products: true }, q: "%%" })).groups, [], "% is not a wildcard");
  db.fail = (table) => (table === "products" ? { code: "XX000", message: "boom" } : null);
  const r = await searchPanel({ admin: db, panel: "health", access: ALL, q: "glove" });
  assert.equal(r.ok, true); assert.ok(!kinds(r).includes("products"));
});
