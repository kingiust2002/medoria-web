// "All filtered results" for bulk actions (N9): the server runs the SAME filtered query the list shows, so the ids it acts on are exactly the rows the
// filters match on every page; a changed count, a result above the ceiling or an empty result applies NOTHING; the two houses use their own tables;
// and the actions that use it are the ordinary bulk actions behind the ordinary session / right / approval checks.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { resolveProductScope, resolveQuoteScope, SCOPE_MAX, SCOPE_MESSAGES, describeProductFilters } from "../lib/operator/bulkScope.js";
import { readProductsPage, HOUSE_TABLES } from "../lib/operator/listReaders.js";
import { parseProductParams } from "../lib/operator/listQuery.js";
import { productGaps } from "../lib/operator/completeness.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-28T10:00:00.000Z");
const product = (i) => ({
  id: i, sku: `SKU-${i}`, brand: "Acme", name_fa: `محصول ${i}`, name_en: `Product ${i}`, name_ru: null, name_tg: null,
  description_fa: null, description_en: null, description_ru: null, description_tg: null, image_url: "", specs: null,
  category_id: (i % 3) + 1, category: `cat-${(i % 3) + 1}`, in_stock: i % 2 === 0, is_active: i % 5 !== 0, price: 10, variant_of: null,
  created_at: new Date(NOW - i * 3_600_000).toISOString(), updated_at: new Date(NOW - i * 60_000).toISOString(),
});
const db = (n, house = "health", extra = {}) => createMemoryAdmin({
  [HOUSE_TABLES[house].products]: Array.from({ length: n }, (_, k) => product(k + 1)),
  [HOUSE_TABLES[house].categories]: [1, 2, 3].map((id) => ({ id, slug: `cat-${id}`, world: id === 1 ? "skincare" : "makeup" })),
  ...extra,
}, { maxRows: 1000, computed: { products: { gap_count: (r) => productGaps(r).length }, beauty_products: { gap_count: (r) => productGaps(r).length } } });

test("the scope is exactly the rows of all pages of the same filters", async () => {
  const admin = db(130);
  for (const raw of [{}, { status: "active" }, { stock: "in", cat: "cat-2" }, { q: "Product 1" }, { status: "inactive", sort: "name" }]) {
    const params = parseProductParams(raw);
    const seen = [];
    for (let page = 1; ; page++) {
      const r = await readProductsPage(admin, "health", { ...params, page, size: 25 });
      assert.equal(r.ok, true);
      seen.push(...r.rows.map((x) => x.id));
      if (page >= r.pageCount) break;
    }
    const total = (await readProductsPage(admin, "health", { ...params, page: 1, size: 25 })).total;
    const scope = await resolveProductScope(admin, "health", raw, total);
    assert.equal(scope.ok, true, JSON.stringify(raw));
    assert.deepEqual([...scope.ids].sort((a, b) => a - b), [...seen].sort((a, b) => a - b), JSON.stringify(raw));
    assert.equal(scope.total, total);
  }
});

test("a different count than the screen showed applies nothing", async () => {
  const admin = db(60);
  const r = await resolveProductScope(admin, "health", { status: "active" }, 47);
  assert.equal(r.ok, false); assert.equal(r.scopeChanged, true); assert.equal(r.error, SCOPE_MESSAGES.changed);
  assert.equal(r.ids, undefined, "no ids are handed out when the count moved");
  for (const bad of [undefined, null, "x", -1, 1.5]) assert.equal((await resolveProductScope(admin, "health", { status: "active" }, bad)).ok, false, String(bad));
});

test("more than the ceiling, nothing at all, and a failing read are refused", async () => {
  const big = db(SCOPE_MAX + 5);
  const r = await resolveProductScope(big, "health", {}, SCOPE_MAX + 5);
  assert.equal(r.ok, false); assert.equal(r.error, SCOPE_MESSAGES.tooMany);
  const none = await resolveProductScope(db(10), "health", { q: "no-such-thing" }, 0);
  assert.equal(none.ok, false); assert.equal(none.error, SCOPE_MESSAGES.none);
  const broken = db(10); broken.fail = (table, op) => (table === "products" && op === "select" ? { message: "boom" } : null);
  const bad = await resolveProductScope(broken, "health", {}, 10);
  assert.equal(bad.ok, false); assert.equal(bad.error, SCOPE_MESSAGES.unavailable);
});

test("each house reads its own tables only", async () => {
  const beauty = db(12, "beauty");
  assert.equal((await resolveProductScope(beauty, "beauty", {}, 12)).ids.length, 12);
  assert.equal((await resolveProductScope(beauty, "health", {}, 12)).ok, false, "Health's table is empty in the Beauty database");
  const quotes = createMemoryAdmin({ beauty_quote_requests: [{ id: 1, status: "new", name: "a", created_at: new Date(NOW).toISOString() }], quote_requests: [] });
  assert.equal((await resolveQuoteScope(quotes, "beauty", { tab: "active" }, 1, NOW)).ids.length, 1);
  assert.equal((await resolveQuoteScope(quotes, "health", { tab: "active" }, 0, NOW)).ok, false);
});

test("quotes: the tab and filters decide the scope", async () => {
  const rows = Array.from({ length: 40 }, (_, k) => ({ id: k + 1, status: k % 4 === 0 ? "archived" : k % 4 === 1 ? "spam" : "new", name: `n${k}`, phone: "1", assigned_to: k % 2 ? "Sara" : null, created_at: new Date(NOW - k * 60_000).toISOString() }));
  const admin = createMemoryAdmin({ quote_requests: rows });
  const active = await resolveQuoteScope(admin, "health", { tab: "active" }, rows.filter((r) => r.status === "new").length, NOW);
  assert.equal(active.ok, true);
  assert.ok(active.ids.every((id) => rows.find((r) => r.id === id).status === "new"));
  const archived = await resolveQuoteScope(admin, "health", { tab: "archived" }, 10, NOW);
  assert.equal(archived.ids.length, 10);
  const mine = await resolveQuoteScope(admin, "health", { tab: "all", who: "Sara" }, 20, NOW);
  assert.equal(mine.ok, true);
});

test("the sentence that names the filters", () => {
  const t = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
  assert.equal(describeProductFilters(parseProductParams({}), t), "بدون فیلتر (همهٔ محصولات)");
  const s = describeProductFilters(parseProductParams({ q: "x", status: "active", stock: "out" }), t);
  assert.ok(s.includes("«x»") && s.includes("فعال") && s.includes("ناموجود"));
});

test("the filtered actions are the ordinary bulk actions: same session check, same right, same runner — in both houses", () => {
  for (const f of ["lib/operator/actions.js", "lib/beauty/operator/actions.js"]) {
    const src = read(f);
    const p = src.slice(src.indexOf("export async function bulkUpdateFilteredProducts"));
    const body = p.slice(0, p.indexOf("\n}\n"));
    assert.match(body, /await authed\(/, `${f}: the session first`);
    assert.match(body, /resolveProductScope\(/, `${f}: the server resolves the scope itself`);
    assert.match(body, /runBulk\(/, `${f}: then the ordinary bulk runner (rules, approval, history)`);
    assert.doesNotMatch(body, /ids\s*[:=]\s*params/, `${f}: ids never come from the client`);
    const q = src.slice(src.indexOf("export async function updateFilteredQuotesStatus"));
    const qb = q.slice(0, q.indexOf("\n}\n"));
    assert.match(qb, /authed\("quotes\.status"\)/); assert.match(qb, /resolveQuoteScope\(/); assert.match(qb, /setQuotesStatusGuarded\(/);
  }
});

test("both lists offer it only after the whole page is ticked, name the filters, and ask first", () => {
  for (const f of ["components/operator/ProductsTable.jsx", "components/beauty/operator/ProductsTable.jsx", "components/operator/QuotesPanel.jsx"]) {
    const src = read(f);
    assert.match(src, /<ScopeNotice /, f); assert.match(src, /<ConfirmFiltered /, f); assert.match(src, /scopeAll/, f);
  }
  assert.match(read("components/operator/QuotesPanel.jsx"), /canDelete && !scopeAll/, "deleting requests stays on the ticked rows");
  assert.match(read("components/operator/BulkScope.jsx"), /confirm-filtered-yes/);
});
