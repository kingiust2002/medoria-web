// Server-side catalog paging (lib/catalogQuery.js + getProductsPage / getAllProducts in lib/supabase.js),
// run against a small PostgREST-style mock: the REAL query strings the app sends are what is checked.
//   * exact totals, page windows, stable order (id tiebreak), no row twice or missing across pages
//   * filters reach the database (category ids, brand, badge, stock, search with hostile text)
//   * a page past the end answers page 1 (clamped), a hostile ?page= is bounded
//   * getAllProducts reads past the 1000-row request cap (the old getProducts() stopped at 500)
//   * the 500-row ceiling is gone from the catalog/search/sitemap paths
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePage, parsePageSize, parseSort, sanitizeSearchTerm, PAGE_SIZE, MAX_PAGE_SIZE, MAX_PAGE } from "../lib/catalogQuery.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const N = 2600;
const ROWS = Array.from({ length: N }, (_, i) => ({
  id: i + 1, slug: `p-${i + 1}`, name_en: `Product ${i + 1}`, sku: `SKU-${i + 1}`,
  brand: i % 3 === 0 ? "Alpha" : i % 3 === 1 ? "Beta" : null, badge: i % 10 === 0 ? "NEW" : null,
  in_stock: i % 4 !== 0, is_featured: i % 50 === 0, is_active: i % 13 !== 0, category_id: (i % 5) + 1, price: i % 7 === 0 ? null : (i % 40) + 1, views: i % 9,
  created_at: new Date(2026, 0, 1 + (i % 28)).toISOString(),
}));

const seen = [];
let server, lib, q;

function parseFilter(row, key, value) {
  const [op, ...rest] = value.split(".");
  const val = rest.join(".");
  const v = row[key];
  switch (op) {
    case "eq": return v != null && String(v) === val;
    case "is": return val === "null" ? v == null : String(v) === val;
    case "in": return v != null && val.replace(/^\(|\)$/g, "").split(",").includes(String(v));
    case "not": { const [op2, ...r2] = rest; return !(op2 === "is" && r2.join(".") === "null" ? v == null : false); }
    default: return true;
  }
}
function orMatch(row, expr) {
  const parts = expr.replace(/^\(|\)$/g, "").split(/,(?![^()]*\))/);
  return parts.some((p) => {
    const i = p.indexOf("."), col = p.slice(0, i), rest = p.slice(i + 1);
    if (rest.startsWith("ilike.")) {
      const pat = rest.slice(6).replace(/\\([%_])/g, "$1");
      const needle = pat.replace(/^%|%$/g, "").toLowerCase();
      return row[col] != null && String(row[col]).toLowerCase().includes(needle);
    }
    return parseFilter(row, col, rest);
  });
}

function handle(req, res) {
  const u = new URL(req.url, "http://mock");
  seen.push(`${req.method} ${u.pathname}${u.search}`);
  const send = (code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(body)); };
  if (!u.pathname.startsWith("/rest/v1/products")) return send(200, []);
  let rows = ROWS.slice();
  for (const [key, value] of u.searchParams) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    if (key === "or") { rows = rows.filter((r) => orMatch(r, value)); continue; }
    rows = rows.filter((r) => parseFilter(r, key, value));
  }
  const order = (u.searchParams.get("order") || "").split(",").filter(Boolean).map((k) => { const [col, dir = "asc", nulls] = k.split("."); return { col, desc: dir === "desc", nulls }; });
  rows.sort((a, b) => {
    for (const { col, desc, nulls } of order) {
      const x = a[col], y = b[col];
      if (x == null && y == null) continue;
      if (x == null) return nulls === "nullsfirst" ? -1 : 1;
      if (y == null) return nulls === "nullsfirst" ? 1 : -1;
      if (x === y) continue;
      return (x < y ? -1 : 1) * (desc ? -1 : 1);
    }
    return 0;
  });
  const total = rows.length;
  const off = Number(u.searchParams.get("offset") || 0);
  const lim = Math.min(Number(u.searchParams.get("limit") || 1000), 1000);   // the server's own cap, like PostgREST's max-rows
  if (off > 0 && off >= total) return send(416, { code: "PGRST103", message: "Requested range not satisfiable" }, { "Content-Range": `*/${total}` });
  const page = rows.slice(off, off + lim);
  const wantCount = /count=exact/.test(String(req.headers.prefer || ""));
  send(200, page, { "Content-Range": `${page.length ? off : "*"}${page.length ? `-${off + page.length - 1}` : ""}/${wantCount ? total : "*"}` });
}

before(async () => {
  server = http.createServer(handle);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  lib = await import("../lib/supabase.js");
  q = (await import("../lib/catalogQuery.js"));
});
after(() => server.close());
beforeEach(() => { seen.length = 0; });

const ACTIVE = ROWS.filter((r) => r.is_active);

test("paging: exact total, 24 per page, no row twice or missing across all pages", async () => {
  const first = await lib.getProductsPage({ page: 1 });
  assert.equal(first.total, ACTIVE.length);
  assert.equal(first.pageSize, PAGE_SIZE);
  assert.equal(first.pages, Math.ceil(ACTIVE.length / PAGE_SIZE));
  assert.equal(first.rows.length, PAGE_SIZE);
  const ids = [...first.rows.map((r) => r.id)];
  for (let p = 2; p <= first.pages; p++) {
    const r = await lib.getProductsPage({ page: p });
    assert.equal(r.page, p);
    ids.push(...r.rows.map((x) => x.id));
  }
  assert.equal(ids.length, ACTIVE.length, "every active product appears exactly once");
  assert.equal(new Set(ids).size, ids.length, "no product on two pages");
  assert.ok(ids.every((id) => ACTIVE.some((r) => r.id === id)), "archived products never appear");
});

test("every sort ends with the id, so neighbouring pages never overlap", async () => {
  for (const sort of ["default", "newest", "price_asc", "price_desc", "popular", "name"]) {
    seen.length = 0;
    await lib.getProductsPage({ sort, lang: "en", page: 2 });
    const url = seen.find((s) => /products\?/.test(s));
    assert.match(decodeURIComponent(url), /order=[^&]*id\.asc(&|$)/, `${sort}: no id tiebreak in ${url}`);
  }
  seen.length = 0;
  await lib.getProductsPage({ sort: "name", lang: "ru" });
  assert.match(decodeURIComponent(seen.find((s) => /products\?/.test(s))), /order=name_ru\.asc,id\.asc/);
  seen.length = 0;
  await lib.getProductsPage({ sort: "name", lang: "zz; drop" });   // unknown language falls back, never reaches the query
  assert.match(decodeURIComponent(seen.find((s) => /products\?/.test(s))), /order=name_en\.asc,id\.asc/);
});

test("filters reach the database: categories, brand, badge, stock, search", async () => {
  const cat = await lib.getProductsPage({ categoryIds: [2, 3] });
  assert.equal(cat.total, ACTIVE.filter((r) => [2, 3].includes(r.category_id)).length);
  const brand = await lib.getProductsPage({ brand: "Alpha", stockOnly: true });
  assert.equal(brand.total, ACTIVE.filter((r) => r.brand === "Alpha" && r.in_stock).length);
  const none = await lib.getProductsPage({ badge: "none" });
  assert.equal(none.total, ACTIVE.filter((r) => !r.badge).length);
  const badge = await lib.getProductsPage({ badge: "NEW" });
  assert.equal(badge.total, ACTIVE.filter((r) => r.badge === "NEW").length);
  const search = await lib.getProductsPage({ search: "sku-2599" });
  assert.deepEqual(search.rows.map((r) => r.id), [2599].filter((id) => ACTIVE.some((r) => r.id === id)));
  const empty = await lib.getProductsPage({ categoryIds: [] });
  assert.equal(empty.total, 0, "an empty category list is an empty result, not 'everything'");
});

test("uncategorized products stay visible in the unfiltered list (keepUncategorized) but not inside a chosen category", () => {
  const calls = [];
  const fake = { or: (v) => (calls.push(["or", v]), fake), in: (c, v) => (calls.push(["in", c, v]), fake), eq: () => fake, is: () => fake };
  q.applyFilters(fake, { categoryIds: [1, 2], keepUncategorized: true });
  q.applyFilters(fake, { categoryIds: [1, 2] });
  q.applyFilters(fake, { categoryIds: [], keepUncategorized: true });
  assert.deepEqual(calls, [["or", "category_id.in.(1,2),category_id.is.null"], ["in", "category_id", [1, 2]], ["or", "category_id.is.null"]]);
});

test("search text cannot change the filter: syntax characters are stripped, wildcards escaped", async () => {
  assert.equal(sanitizeSearchTerm('a,b(c)"d\'e\\f'), "a b c  d e f");
  assert.ok(!/[,()"']/.test(sanitizeSearchTerm('x,name_en.eq.1),or(id.gt.0')), "no PostgREST syntax character survives");
  assert.equal(sanitizeSearchTerm("50%_off"), "50\\%\\_off");
  assert.equal(sanitizeSearchTerm("x".repeat(500)).length, 80);
  seen.length = 0;
  const r = await lib.getProductsPage({ search: "x,id.gt.0),(name_en.ilike.%" });
  assert.ok(!r.error, "a hostile term must not produce a database error");
  const url = decodeURIComponent(seen.find((s) => /products\?/.test(s)));
  assert.equal((url.match(/\bor=/g) || []).length, 1, "exactly one OR group: the search; text cannot add a second");
});

test("a page past the end answers page 1 and says so; hostile page numbers are bounded", async () => {
  const total = ACTIVE.length;
  const past = await lib.getProductsPage({ page: Math.ceil(total / PAGE_SIZE) + 40 });
  assert.equal(past.clamped, true);
  assert.equal(past.page, 1);
  assert.equal(past.rows.length, PAGE_SIZE);
  const last = await lib.getProductsPage({ page: Math.ceil(total / PAGE_SIZE) });
  assert.equal(last.clamped, false);
  assert.equal(last.rows.length, total % PAGE_SIZE || PAGE_SIZE);
  for (const bad of ["abc", "-3", "0", "1.5", "1e9", "99999", "", null, undefined, NaN, {}, [2]]) assert.equal(parsePage(bad), 1, `parsePage(${String(bad)})`);
  assert.equal(parsePage("7"), 7);
  assert.equal(parsePage(MAX_PAGE), MAX_PAGE);
  assert.equal(parsePage(MAX_PAGE + 1), 1);
  assert.equal(parsePageSize(5000), MAX_PAGE_SIZE);
  assert.equal(parsePageSize("x"), PAGE_SIZE);
  assert.equal(parseSort("price_asc"), "price_asc");
  assert.equal(parseSort("id; drop table"), "default");
});

test("fetchProductPage: an EMPTY page above 1 (200, no error) also falls back to page 1", async () => {
  const calls = [];
  const builder = (rows, count) => { const b = { select: () => b, eq: () => b, in: () => b, or: () => b, is: () => b, order: () => b, range: (from, to) => { calls.push([from, to]); return Promise.resolve({ data: from === 0 ? rows : [], count, error: null }); } }; return b; };
  const res = await q.fetchProductPage(() => builder([{ id: 1 }, { id: 2 }], 2), { page: 3, pageSize: 24 });
  assert.deepEqual(calls, [[48, 71], [0, 23]]);
  assert.equal(res.clamped, true);
  assert.equal(res.page, 1);
  assert.equal(res.total, 2);
  // a genuinely empty catalog on page 1 is just empty, not a loop
  calls.length = 0;
  const none = await q.fetchProductPage(() => builder([], 0), { page: 1 });
  assert.deepEqual(calls, [[0, 23]]);
  assert.equal(none.clamped, false);
  assert.equal(none.total, 0);
});

test("getAllProducts reads every active product past the 1000-row request cap", async () => {
  seen.length = 0;
  const all = await lib.getAllProducts();
  assert.equal(all.length, ACTIVE.length);
  assert.ok(ACTIVE.length > 1000, "the fixture must exceed one request");
  assert.equal(new Set(all.map((r) => r.id)).size, all.length);
  assert.ok(seen.filter((s) => /products\?/.test(s)).length >= 3, "read in several chunks");
});

test("brands for the filter: distinct, sorted, active products only", async () => {
  assert.deepEqual(await lib.getProductBrands(), ["Alpha", "Beta"]);
});

test("the catalog, the search palette, the sitemap and the category pages no longer depend on the 500-row cap", () => {
  assert.match(read("app/health/[lang]/catalog/CatalogInner.jsx"), /getProductsPage/);
  assert.ok(!/getProducts\(/.test(read("app/health/[lang]/catalog/CatalogInner.jsx")), "the catalog must not download every product");
  assert.match(read("components/shared/SearchCommand.jsx"), /getProductsPage\(\{ search: term, pageSize: 6/);
  assert.ok(!/getProducts\(/.test(read("components/shared/SearchCommand.jsx")));
  assert.match(read("app/sitemap.js"), /getAllProducts\(\)/);
  assert.match(read("app/sitemap.js"), /getAllBeautyProducts\(\)/);
  for (const f of ["app/health/[lang]/categories/page.jsx", "app/health/[lang]/categories/[slug]/page.jsx"]) assert.match(read(f), /getAllProducts\(\)/, f);
  assert.match(read("app/beauty/[lang]/catalog/page.jsx"), /getBeautyProductsPage/);
  assert.match(read("app/beauty/[lang]/catalog/page.jsx"), /<Pager /);
});
