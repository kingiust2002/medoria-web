// Server-side paging of the panel lists (N1): the database filters, sorts and counts over ALL rows; nothing stops at a cap; a failed read is
// an error, never an empty list; the two houses never touch each other's tables. The in-memory client emulates the API's silent per-request
// row cap (maxRows = 1000, as on Supabase), so a read that forgets to page loses rows here exactly as it would in production.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import {
  parsePage, parseSize, sanitizeTerm, parseProductParams, parseQuoteParams, productHref, quoteHref, pageWindow, pageCountOf, readAll, runPage,
  applyProductFilters, applyProductSort, PAGE_SIZES, DEFAULT_PAGE_SIZE, MAX_PAGE,
} from "../lib/operator/listQuery.js";
import { readProductsPage, readQuotesPage, readDashboard, readProductCounts, readBrandRoster, HOUSE_TABLES } from "../lib/operator/listReaders.js";
import { productGaps } from "../lib/operator/completeness.js";
import { isOverdue, notifyFailed, followUpState, summarizeQuotes, phoneKey, teamDay } from "../lib/operator/quoteOps.js";
import { loadWarehouse } from "../lib/warehouse/pageData.js";
import * as countsStore from "../lib/warehouse/countsStore.js";
import { listRequests, pendingForReview, countToReview } from "../lib/operator/approvals.js";
import { rowToUser, listUsers } from "../lib/operator/accounts.js";
import { auditCsv } from "../lib/operator/auditView.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-28T10:00:00.000Z");

// ── data ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const product = (i, house = "health") => {
  const full = i % 4 === 0;                                    // a quarter of the products lack nothing
  return {
    id: i, sku: i % 11 === 0 ? "" : `SKU-${String(i).padStart(5, "0")}`, brand: i % 3 === 0 ? "Acme" : "Zeta",
    name_fa: `محصول ${i}`, name_en: full || i % 2 ? `Product ${String(i).padStart(5, "0")}` : null, name_ru: full ? `Товар ${i}` : null, name_tg: full ? `Маҳсулот ${i}` : null,
    description_fa: full ? "d" : null, description_en: full ? "d" : "", description_ru: full ? "d" : null, description_tg: full ? "d" : null,
    image_url: full ? `p/${i}.jpg` : i % 5 === 0 ? "" : `p/${i}.jpg`, specs: full ? { a: 1 } : i % 2 ? {} : null,
    category_id: i % 7 === 0 ? null : (i % 6) + 1, category: house === "health" && i % 7 !== 0 ? `cat-${(i % 6) + 1}` : null,
    in_stock: i % 3 !== 0, is_active: i % 10 === 0 ? false : i % 13 === 0 ? null : true, price: i % 9 === 0 ? null : i % 17 === 0 ? 0 : 10 + i,
    created_at: new Date(NOW - i * 3_600_000).toISOString(), updated_at: new Date(NOW - ((i * 7919) % 5000) * 60_000).toISOString(),
  };
};
const makeProducts = (n, house) => Array.from({ length: n }, (_, k) => product(k + 1, house));
const tablesFor = (house, n) => ({ [HOUSE_TABLES[house].products]: makeProducts(n, house), [HOUSE_TABLES[house].categories]: [1, 2, 3, 4, 5, 6].map((id) => ({ id, slug: `cat-${id}`, world: id <= 3 ? "skincare" : "makeup" })) });
const dbWith = (seed, extra = {}) => createMemoryAdmin(seed, { maxRows: 1000, computed: { products: { gap_count: (r) => productGaps(r).length }, beauty_products: { gap_count: (r) => productGaps(r).length } }, ...extra });
const params = (sp = {}) => parseProductParams(sp);
const gapped = (r) => productGaps(r).length > 0;

// ── parsing: everything from the address is checked ──────────────────────────────────────────────────────────────────────────
test("page and size come from the address only in valid shapes; anything else is the default", () => {
  assert.equal(parsePage("3"), 3); assert.equal(parsePage(["4", "9"]), 4);
  for (const bad of [undefined, "", "0", "-1", "1.5", "abc", "1e3", " ", "9999999", "１２", "3; DROP", `${MAX_PAGE + 1}`]) assert.equal(parsePage(bad), 1, String(bad));
  assert.equal(parseSize("50"), 50); assert.equal(parseSize("100"), 100);
  for (const bad of [undefined, "7", "1000", "-25", "x", "25.0"]) assert.equal(parseSize(bad), DEFAULT_PAGE_SIZE, String(bad));
  assert.deepEqual(PAGE_SIZES, [25, 50, 100]);
});

test("unknown sort, status, stock or complete values fall back; the category and world are plain slugs only", () => {
  const p = params({ sort: "price; drop", status: "weird", stock: "maybe", complete: "x", cat: "a,b", world: "SKIN care", q: "x".repeat(500) });
  assert.deepEqual({ sort: p.sort, status: p.status, stock: p.stock, complete: p.complete, cat: p.cat, world: p.world, qlen: p.q.length }, { sort: "updated", status: "", stock: "", complete: "", cat: "", world: "", qlen: 80 });
  const ok = params({ cat: "12", world: "skincare", sort: "name", status: "inactive", stock: "out", complete: "incomplete" });
  assert.deepEqual({ cat: ok.cat, world: ok.world, sort: ok.sort, status: ok.status, stock: ok.stock, complete: ok.complete }, { cat: "12", world: "skincare", sort: "name", status: "inactive", stock: "out", complete: "incomplete" });
  const qp = parseQuoteParams({ tab: "x", status: "new; --", who: "  Sara ", attention: "1" });
  assert.deepEqual({ tab: qp.tab, status: qp.status, who: qp.who, attention: qp.attention }, { tab: "active", status: "", who: "Sara", attention: true });
});

test("search text cannot add a filter: filter syntax is stripped and wildcards escaped", () => {
  assert.equal(sanitizeTerm("a,b(c)\"d'e\\f*g"), "a b c d e f g");
  assert.equal(sanitizeTerm("100%_off"), "100\\%\\_off");
  assert.equal(sanitizeTerm("x".repeat(200)).length, 80);
  // a hostile term must still build exactly ONE or-group of six ilike alternatives (the grammar parser of the test double rejects anything else)
  const db = dbWith({ products: [{ id: 1, name_fa: "a", is_active: true }, { id: 2, name_fa: "b", is_active: false }] });
  const q = applyProductFilters(db.from("products").select("*"), params({ q: "zzz),is_active.eq.false,(x" }));
  return q.then((r) => { assert.equal(r.error, null); assert.deepEqual(r.data, []); });      // matches nothing; did NOT turn into "is_active = false"
});

test("addresses carry only what differs from the defaults and parse back to the same state", () => {
  assert.equal(productHref("/operator/products", params()), "/operator/products");
  const p = params({ q: "کرم", cat: "3", status: "active", sort: "name", page: "4", size: "50" });
  const href = productHref("/operator/products", p);
  assert.match(href, /^\/operator\/products\?/);
  const back = params(Object.fromEntries(new URL(href, "http://x").searchParams));
  assert.deepEqual(back, p);
  assert.equal(productHref("/p", p, { status: "inactive" }), "/p?size=50&q=%DA%A9%D8%B1%D9%85&cat=3&status=inactive&sort=name", "a filter change returns to page 1");
  assert.match(productHref("/p", p, { page: 5 }, false), /page=5/);
  const qp = parseQuoteParams({ tab: "archived", attention: "1", page: "2" });
  assert.equal(quoteHref("/q", qp, { tab: "active" }), "/q?attention=1");
  assert.equal(quoteHref("/q", parseQuoteParams({})), "/q");
});

test("the pager window always shows the first, the last and the neighbours of the current page", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(1, 5), [1, 2, "gap", 5]);
  assert.deepEqual(pageWindow(10, 40), [1, "gap", 9, 10, 11, "gap", 40]);
  assert.deepEqual(pageWindow(2, 3), [1, 2, 3]);
  assert.equal(pageCountOf(0, 25), 1); assert.equal(pageCountOf(26, 25), 2); assert.equal(pageCountOf(50, 50), 1);
});

// ── products: 3500 rows, more than the old 2000 cap and the API's 1000-row limit ────────────────────────────────────────────
test("every product is reachable page by page: exact total, no overlap, no gap, in both houses", async () => {
  for (const house of ["health", "beauty"]) {
    const db = dbWith(tablesFor(house, 3500));
    const first = await readProductsPage(db, house, params({ size: "100" }));
    assert.equal(first.ok, true); assert.equal(first.total, 3500); assert.equal(first.pageCount, 35);
    const seen = new Set();
    for (let page = 1; page <= first.pageCount; page++) {
      const r = await readProductsPage(db, house, params({ size: "100", page: String(page) }));
      assert.equal(r.page, page);
      assert.equal(r.rows.length, page < 35 ? 100 : 100);
      for (const row of r.rows) { assert.ok(!seen.has(row.id), `${house}: product ${row.id} listed twice`); seen.add(row.id); }
    }
    assert.equal(seen.size, 3500, `${house}: products went missing`);
  }
});

test("the default order is newest change first and ties never reorder between pages", async () => {
  const db = dbWith({ products: Array.from({ length: 120 }, (_, k) => ({ id: k + 1, name_fa: "x", is_active: true, updated_at: "2026-10-01T00:00:00.000Z", created_at: "2026-10-01T00:00:00.000Z" })) });
  const ids = [];
  for (let page = 1; page <= 5; page++) ids.push(...(await readProductsPage(db, "health", params({ page: String(page) }))).rows.map((r) => r.id));
  assert.deepEqual(ids, Array.from({ length: 120 }, (_, k) => 120 - k), "equal timestamps fall back to the id, so pages do not overlap");
});

test("search finds a product deep in the catalogue by SKU, brand or name in any language", async () => {
  const db = dbWith(tablesFor("health", 3500));
  const bySku = await readProductsPage(db, "health", params({ q: "sku-03334" }));
  assert.equal(bySku.total, 1); assert.equal(bySku.rows[0].id, 3334);
  const byBrand = await readProductsPage(db, "health", params({ q: "acme" }));
  assert.equal(byBrand.total, makeProducts(3500, "health").filter((p) => p.brand === "Acme").length);
  const byRu = await readProductsPage(db, "health", params({ q: "Товар 3496" }));
  assert.ok(byRu.rows.some((r) => r.id === 3496));
  const none = await readProductsPage(db, "health", params({ q: "no-such-thing" }));
  assert.deepEqual([none.ok, none.total, none.rows.length, none.pageCount], [true, 0, 0, 1]);
});

test("every filter is applied to ALL products and the total is exact (compared with the old in-browser rules)", async () => {
  const all = makeProducts(3500, "health");
  const db = dbWith({ products: all, categories: [] });
  const cases = [
    [{ status: "active" }, (p) => p.is_active !== false],
    [{ status: "inactive" }, (p) => p.is_active === false],
    [{ stock: "in" }, (p) => p.in_stock],
    [{ stock: "out" }, (p) => !p.in_stock],
    [{ cat: "3" }, (p) => String(p.category_id) === "3" || p.category === "3"],
    [{ cat: "cat-4" }, (p) => p.category === "cat-4"],
    [{ complete: "incomplete" }, gapped],
    [{ complete: "complete" }, (p) => !gapped(p)],
    [{ status: "active", stock: "out", complete: "incomplete", cat: "2" }, (p) => p.is_active !== false && !p.in_stock && gapped(p) && (String(p.category_id) === "2" || p.category === "2")],
    [{ q: "acme", status: "active" }, (p) => p.is_active !== false && p.brand === "Acme"],
  ];
  for (const [sp, rule] of cases) {
    const r = await readProductsPage(db, "health", params(sp));
    assert.equal(r.ok, true, JSON.stringify(sp));
    assert.equal(r.total, all.filter(rule).length, JSON.stringify(sp));
  }
});

test("name sort follows the panel language and puts missing names last; category sort groups by category", async () => {
  const db = dbWith(tablesFor("health", 300));
  const en = await readProductsPage(db, "health", params({ sort: "name", size: "100" }), { lang: "en" });
  const names = en.rows.map((r) => r.name_en).filter(Boolean);
  assert.deepEqual(names, [...names].sort(), "English order");
  assert.equal(en.rows.filter((r) => r.name_en == null).length === 0 || en.rows.findIndex((r) => r.name_en == null) > en.rows.findIndex((r) => r.name_en), true);
  const cat = await readProductsPage(db, "health", params({ sort: "category", size: "100" }));
  const cids = cat.rows.map((r) => r.category_id).filter((x) => x != null);
  assert.deepEqual(cids, [...cids].sort((a, b) => a - b));
});

test("a page past the end answers the last page that exists, with the exact total", async () => {
  const db = dbWith(tablesFor("health", 130));
  const r = await readProductsPage(db, "health", params({ page: "99" }));
  assert.deepEqual([r.ok, r.total, r.page, r.pageCount, r.rows.length, r.clamped], [true, 130, 6, 6, 5, true]);
});

test("the Beauty world filter keeps only the categories of that world", async () => {
  const db = dbWith(tablesFor("beauty", 600));
  const r = await readProductsPage(db, "beauty", params({ world: "makeup" }));
  assert.equal(r.total, makeProducts(600, "beauty").filter((p) => [4, 5, 6].includes(p.category_id)).length);
  const none = await readProductsPage(dbWith({ ...tablesFor("beauty", 20), beauty_categories: [] }), "beauty", params({ world: "makeup" }));
  assert.equal(none.total, 0, "a world without categories lists nothing");
});

test("a failed read is an error, never an empty list; the completeness filter says migration 43 is missing", async () => {
  const db = dbWith(tablesFor("health", 50));
  db.fail = (table) => (table === "products" ? { code: "57014", message: "timeout" } : null);
  assert.deepEqual(await readProductsPage(db, "health", params()), { ok: false, error: "unavailable" });
  // migration 43 not applied: the database does not know gap_count (42703), the other filters still work
  const noFn = dbWith(tablesFor("health", 50), { computed: {}, schema: { products: Object.keys(product(1)) } });
  assert.deepEqual(await readProductsPage(noFn, "health", params({ complete: "incomplete" })), { ok: false, error: "needs_migration" });
  assert.equal((await readProductsPage(noFn, "health", params({ status: "active" }))).ok, true, "the other filters work without migration 43");
});

test("each house reads only its own tables", async () => {
  for (const house of ["health", "beauty"]) {
    const other = house === "health" ? "beauty" : "health";
    const db = dbWith({ ...tablesFor(house, 60), [HOUSE_TABLES[other].products]: makeProducts(60, other), [HOUSE_TABLES[other].quotes]: [], [HOUSE_TABLES[house].quotes]: [] });
    await readProductsPage(db, house, params({ world: house === "beauty" ? "skincare" : "", complete: "incomplete" }));
    await readQuotesPage(db, house, parseQuoteParams({}), { now: NOW });
    await readDashboard(db, house, { now: NOW });
    await readProductCounts(db, house);
    const touched = new Set(db.log.map(([t]) => t));
    for (const t of Object.values(HOUSE_TABLES[other])) if (t) assert.ok(!touched.has(t), `${house} reader touched ${t}`);
  }
});

// ── requests ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const STATUSES = ["new", "contacted", "in_progress", "quoted", "closed", "archived", "spam"];
const quote = (i) => ({
  id: i, name: `مشتری ${i}`, phone: `+992 90${String(i % 400).padStart(3, "0")} ${String(i % 90).padStart(2, "0")} 00`, product_name: i % 4 ? "کرم" : "Gel", organization: i % 5 ? "" : "Org",
  tracking_code: `MH-${String(i).padStart(4, "0")}`, assigned_to: i % 6 === 0 ? "Sara" : i % 6 === 1 ? "Ali" : null, status: STATUSES[i % STATUSES.length],
  created_at: new Date(NOW - i * 1_800_000).toISOString(), first_response_at: ["contacted", "in_progress", "quoted", "closed"].includes(STATUSES[i % 7]) ? new Date(NOW - i * 1_800_000 + 600_000).toISOString() : null,
  notify_status: i % 9 === 0 ? "failed" : "sent", follow_up_at: i % 8 === 0 ? `${new Date(NOW + ((i % 5) - 2) * 86_400_000).toISOString().slice(0, 10)}T12:00:00.000Z` : null,
});
const makeQuotes = (n) => Array.from({ length: n }, (_, k) => quote(k + 1));
const withPhoneKey = (rows) => rows.map((r) => ({ ...r, phone_key: phoneKey(r.phone) }));
const quoteDb = (n, table = "quote_requests") => createMemoryAdmin({ [table]: withPhoneKey(makeQuotes(n)) }, { maxRows: 1000 });
const needsAttention = (x) => isOverdue(x, { now: NOW }) || notifyFailed(x) || ["overdue", "today"].includes(followUpState(x, NOW));
const inTab = (x, tab) => (tab === "all" ? true : tab === "active" ? x.status !== "archived" && x.status !== "spam" : x.status === tab);

test("the exact count of every tab, every status and the follow-up filter is computed over all 2600 requests", async () => {
  const all = makeQuotes(2600);
  const db = quoteDb(2600);
  const r = await readQuotesPage(db, "health", parseQuoteParams({}), { now: NOW });
  assert.equal(r.ok, true);
  for (const tab of ["active", "archived", "spam", "all"]) assert.equal(r.tabCounts[tab], all.filter((x) => inTab(x, tab)).length, tab);
  for (const s of ["new", "contacted", "in_progress", "quoted", "closed"]) assert.equal(r.statusCounts[s], all.filter((x) => x.status === s).length, s);
  assert.equal(r.attentionCount, all.filter((x) => inTab(x, "active") && needsAttention(x)).length, "the 'needs follow-up' number equals the old in-browser rule");
  assert.equal(r.total, all.filter((x) => inTab(x, "active")).length);
});

test("tab, text, status, assignee and 'needs follow-up' filter the whole table, newest first, without overlap", async () => {
  const all = makeQuotes(2600);
  const db = quoteDb(2600);
  const cases = [
    [{ tab: "archived" }, (x) => inTab(x, "archived")],
    [{ tab: "all" }, () => true],
    [{ tab: "active", status: "quoted" }, (x) => inTab(x, "active") && x.status === "quoted"],
    [{ tab: "all", who: "Sara" }, (x) => x.assigned_to === "Sara"],
    [{ tab: "all", who: "__none" }, (x) => !x.assigned_to],
    [{ tab: "active", q: "mh-02" }, (x) => inTab(x, "active") && x.tracking_code.toLowerCase().includes("mh-02")],
    [{ tab: "all", q: "org" }, (x) => [x.name, x.phone, x.product_name, x.organization, x.tracking_code, x.assigned_to].filter(Boolean).some((v) => v.toLowerCase().includes("org"))],
    [{ tab: "active", attention: "1" }, (x) => inTab(x, "active") && needsAttention(x)],
    [{ tab: "all", attention: "1", who: "Ali" }, (x) => needsAttention(x) && x.assigned_to === "Ali"],
  ];
  for (const [sp, rule] of cases) {
    const p = parseQuoteParams({ ...sp, size: "100" });
    const first = await readQuotesPage(db, "health", p, { now: NOW });
    const want = all.filter(rule).sort((a, b) => a.id - b.id).map((x) => x.id);       // id 1 is the newest request
    assert.equal(first.total, want.length, JSON.stringify(sp));
    const got = [];
    for (let page = 1; page <= first.pageCount; page++) got.push(...(await readQuotesPage(db, "health", { ...p, page }, { now: NOW })).rows.map((x) => x.id));
    assert.deepEqual(got, want, JSON.stringify(sp));
  }
});

test("the customer file lists the person's other requests from the whole table, not only the page", async () => {
  const rows = withPhoneKey([
    { ...quote(1), phone: "+992 900 11 22 33" }, { ...quote(2), phone: "992900112233", status: "closed" }, { ...quote(3), phone: "(0372) 21-00-11" },
    ...makeQuotes(1800).slice(10).map((x, k) => ({ ...x, id: 100 + k })),
  ]);
  const db = createMemoryAdmin({ quote_requests: rows }, { maxRows: 1000 });
  const r = await readQuotesPage(db, "health", parseQuoteParams({ tab: "all", q: "MH-0001" }), { now: NOW });
  assert.equal(r.customerFile, "full");
  const hist = r.related.filter((x) => x.phone_key === phoneKey("+992 900 11 22 33")).map((x) => x.id).sort();
  assert.ok(hist.includes(1) && hist.includes(2), "the request on another page of the table is found by phone key");
  const noKey = createMemoryAdmin({ quote_requests: makeQuotes(30) }, { maxRows: 1000 });       // before migration 43: no phone_key column
  assert.equal((await readQuotesPage(noKey, "health", parseQuoteParams({}), { now: NOW })).customerFile, "page_only");
});

test("a failed count or read makes the whole answer an error (never a zero)", async () => {
  for (const op of ["select"]) {
    const db = quoteDb(40);
    let heads = 0;
    db.fail = (table, o) => (table === "quote_requests" && o === op && ++heads === 4 ? { code: "57014", message: "timeout" } : null);   // the 4th request: one of the counts
    assert.deepEqual(await readQuotesPage(db, "health", parseQuoteParams({}), { now: NOW }), { ok: false, error: "unavailable" });
  }
});

// ── dashboard ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("dashboard numbers are exact counts over all rows (the old ones were computed from the newest 5000)", async () => {
  const prods = makeProducts(6200, "health");
  const quotes = makeQuotes(5300);
  const db = createMemoryAdmin({ products: prods, quote_requests: withPhoneKey(quotes) }, { maxRows: 1000, computed: { products: { gap_count: (r) => productGaps(r).length } } });
  const d = await readDashboard(db, "health", { now: NOW });
  const isOnRequest = (p) => p.price == null || p.price === "" || Number(p.price) === 0;
  assert.deepEqual(d.stats, {
    total: 6200, active: prods.filter((p) => p.is_active !== false).length, inactive: prods.filter((p) => p.is_active === false).length,
    noPrice: prods.filter(isOnRequest).length, noImage: prods.filter((p) => !p.image_url).length, incomplete: prods.filter((p) => p.is_active !== false && gapped(p)).length,
    totalQuotes: 5300, newQuotes: quotes.filter((q) => q.status === "new").length, overdueQuotes: summarizeQuotes(quotes, { now: NOW }).overdue,
    notifyFailures: summarizeQuotes(quotes, { now: NOW }).notifyFailures,
  });
  assert.equal(d.recentProducts.length, 6); assert.equal(d.recentQuotes.length, 8);
  assert.equal(d.recentQuotes[0].id, 1, "newest request first");
  assert.equal(d.today, teamDay(NOW));
});

test("a block the person may not see is not read at all", async () => {
  const db = createMemoryAdmin({ products: makeProducts(10, "health"), quote_requests: makeQuotes(10) }, { maxRows: 1000 });
  await readDashboard(db, "health", { products: false, quotes: true, now: NOW });
  assert.ok(db.log.every(([t]) => t === "quote_requests"), "products were read without products.view");
  const db2 = createMemoryAdmin({ products: makeProducts(10, "health"), quote_requests: makeQuotes(10) }, { maxRows: 1000 });
  const none = await readDashboard(db2, "health", { products: false, quotes: false, now: NOW });
  assert.deepEqual([db2.log.length, none.stats], [0, {}]);
});

// ── counts per category / brand, chunked reads ───────────────────────────────────────────────────────────────────────────────
test("counts per category read every product: the plain select loses rows beyond the API limit, the chunked read does not", async () => {
  const prods = makeProducts(2600, "health");
  const db = createMemoryAdmin({ products: prods }, { maxRows: 1000 });
  const naive = await db.from("products").select("id,category_id,category");
  assert.equal(naive.data.length, 1000, "the stand-in really drops rows silently, like the API");
  const counted = await readProductCounts(db, "health");
  assert.equal(counted.ok, true); assert.equal(counted.rows.length, 2600);
});

test("readAll stops with an error on a failed chunk and on an absurd row count, never with a partial answer", async () => {
  const db = createMemoryAdmin({ t: Array.from({ length: 2500 }, (_, k) => ({ id: k })) }, { maxRows: 1000 });
  const all = await readAll((a, b) => db.from("t").select("id").order("id", { ascending: true }).range(a, b));
  assert.deepEqual([all.ok, all.rows.length], [true, 2500]);
  const capped = await readAll((a, b) => db.from("t").select("id").order("id", { ascending: true }).range(a, b), { maxRows: 2000 });
  assert.equal(capped.ok, false); assert.equal(capped.error.code, "TOO_MANY_ROWS");
  let calls = 0;
  const failing = await readAll(async (a, b) => (++calls === 2 ? { data: null, error: { code: "57014", message: "x" } } : db.from("t").select("id").order("id", { ascending: true }).range(a, b)));
  assert.equal(failing.ok, false);
});

test("runPage re-reads a page past the end as the last page, also when the API answers 416", async () => {
  let calls = 0;
  const build = async (from, to) => { calls++; if (from > 50) return { data: null, error: { code: "PGRST103", message: "Requested range not satisfiable" }, count: null }; return { data: Array.from({ length: Math.max(0, Math.min(to, 49) - from + 1) }, (_, k) => ({ id: from + k })), error: null, count: 50 }; };
  const r = await runPage(build, { page: 40, size: 25 });
  assert.deepEqual([r.ok, r.page, r.pageCount, r.total, r.clamped], [true, 2, 2, 50, true]);
  assert.ok(calls <= 3);
});

// ── brand roster ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("a brand's roster and the candidate search come from the database", async () => {
  const prods = makeProducts(2000, "beauty").map((p, i) => ({ ...p, brand: i % 4 === 0 ? "Chanel" : i % 4 === 1 ? "dior" : null }));
  const db = createMemoryAdmin({ beauty_products: prods }, { maxRows: 1000 });
  const r = await readBrandRoster(db, "chanel", "");
  assert.equal(r.ok, true); assert.equal(r.currentTotal, 500); assert.equal(r.current.length, 200);
  assert.ok(r.candidates.every((p) => String(p.brand || "").toLowerCase() !== "chanel"), "the brand's own products are not offered again");
  const s = await readBrandRoster(db, "Chanel", "SKU-01999");
  assert.deepEqual(s.candidates.map((p) => p.id), [1999]);
  assert.equal((await readBrandRoster(db, "   ", "")).ok, false);
  const hostile = await readBrandRoster(db, "Chanel", "x),brand.is.null,(y");
  assert.equal(hostile.ok, true); assert.equal(hostile.candidates.length, 0);
});

// ── warehouse ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const whDb = (n, extra = {}) => createMemoryAdmin({
  health_stock_locations: [{ id: 1, code: "MAIN", name: "Main", is_active: true, sort_order: 1 }, { id: 2, code: "B", name: "Second", is_active: true, sort_order: 2 }],
  health_stock_balances: Array.from({ length: n }, (_, k) => ({ location_id: k % 2 ? 2 : 1, product_id: k + 1, quantity: (k % 5) + 1, reserved: 0, updated_at: new Date(NOW - k * 1000).toISOString() })),
  products: Array.from({ length: n }, (_, k) => ({ id: k + 1, sku: `W-${String(k + 1).padStart(5, "0")}`, name_fa: `کالا ${k + 1}`, name_en: `Item ${k + 1}` })),
  health_stock_levels: Array.from({ length: n }, (_, k) => ({ product_id: k + 1, min_level: k % 50 === 0 ? 100 : 0 })).filter((l) => l.min_level),
  health_stock_counts: [], health_stock_count_lines: [], ...extra,
}, { maxRows: 1000 });

test("the stock tab lists every product with a balance, pages them, and searches the whole catalogue", async () => {
  const db = whDb(2400);
  const p1 = await loadWarehouse(db, "health", { tab: "stock" });
  assert.equal(p1.ok, true); assert.equal(p1.total, 2400); assert.equal(p1.pageCount, 48); assert.equal(p1.items.length, 50);
  assert.deepEqual(p1.items.slice(0, 2).map((i) => i.sku), ["W-00001", "W-00002"], "ordered by SKU, with names");
  const seen = new Set();
  for (let page = 1; page <= 48; page++) for (const it of (await loadWarehouse(db, "health", { tab: "stock", page })).items) { assert.ok(!seen.has(it.productId)); seen.add(it.productId); }
  assert.equal(seen.size, 2400);
  const found = await loadWarehouse(db, "health", { tab: "stock", q: "W-02222" });
  assert.deepEqual(found.items.map((i) => i.sku), ["W-02222"]);
  const low = await loadWarehouse(db, "health", { tab: "stock", low: "1" });
  assert.equal(low.total, 48, "every product below its minimum, from the whole house");
  const one = await loadWarehouse(db, "health", { tab: "stock", location: "2" });
  assert.equal(one.total, 1200);
  const past = await loadWarehouse(db, "health", { tab: "stock", page: 9999 });
  assert.equal(past.page, 48);
});

test("a stock count snapshots EVERY product of the warehouse, and closing reads all its lines", async () => {
  const db = whDb(1700);
  const started = await countsStore.startCount(db, "health", { locationId: 1, note: "" }, { label: "x" });
  assert.equal(started.ok, true); assert.equal(started.lines, 850);
  assert.equal(db.tables.health_stock_count_lines.length, 850, "none of the lines was cut at the API limit");
  const got = await countsStore.getCount(db, "health", started.id);
  assert.equal(got.lines.length, 850);
  const failing = whDb(1700);
  failing.fail = (t) => (t === "health_stock_balances" ? { code: "57014", message: "timeout" } : null);
  const bad = await countsStore.startCount(failing, "health", { locationId: 1 }, { label: "x" });
  assert.equal(bad.ok, false);
  assert.equal(failing.tables.health_stock_counts[0].status, "cancelled", "a snapshot that could not be read completely is cancelled, not left half-built");
});

test("the CSV reports contain every row", async () => {
  const db = whDb(2300);
  const stock = await countsStore.stockRows(db, "health", {});
  assert.equal(stock.ok, true); assert.equal(stock.rows.length, 2300); assert.ok(!("truncated" in stock));
  db.tables.health_stock_movements = Array.from({ length: 2100 }, (_, k) => ({ id: k + 1, created_at: new Date(NOW - k).toISOString(), kind: "receive", sku: "x", product_id: 1, location_id: 1, delta: 1, balance_after: 1 }));
  const mv = await countsStore.movementRows(db, "health", {});
  assert.equal(mv.rows.length, 2100);
});

// ── approvals, people, activity ──────────────────────────────────────────────────────────────────────────────────────────────
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const urow = (n, o = {}) => ({ id: uid(n), username: `user${n}`, display_name: `User ${n}`, password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [], approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, created_at: "2026-10-01T00:00:00Z", ...o });
const change = (i, by, o = {}) => ({ id: `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`, house: "health", resource: "products", operation: "products.price", entity: "products", entity_id: i, subject: `S-${i}`, requested_by: by, requested_at: new Date(NOW - i * 1000).toISOString(), status: "pending", proposed: {}, before: {}, ...o });

test("the approval queue shows every pending request the person may decide, and pages 'my requests'", async () => {
  const reviewer = rowToUser(urow(2, { role: "house_admin" }));
  const rows = [
    ...Array.from({ length: 1300 }, (_, k) => change(k + 1, uid(1))),                                       // 1300 colleagues' requests (more than the old 200 and the API's 1000)
    ...Array.from({ length: 60 }, (_, k) => change(2000 + k, uid(3), { resource: "quotes", operation: "quotes.delete" })),   // a kind this reviewer may not decide? (house_admin may) — counted below by the rule itself
    ...Array.from({ length: 70 }, (_, k) => change(5000 + k, uid(2), { status: k % 2 ? "approved" : "pending" })),       // my own
  ];
  const db = createMemoryAdmin({ operator_change_requests: rows, operator_users: [urow(1), urow(2), urow(3)] }, { maxRows: 1000 });
  const pending = await pendingForReview(db, { actor: reviewer, panel: "health" });
  assert.equal(pending.ok, true);
  const { canReview } = await import("../lib/operator/authz.js");
  const expected = rows.filter((r) => r.status === "pending" && r.requested_by !== reviewer.id && canReview(reviewer, r.requested_by, "health", r.resource)).length;
  assert.ok(expected >= 1300, "the fixture really has more than the old cap");
  assert.equal(pending.toReview.length, expected);
  assert.equal(await countToReview(db, { actor: reviewer, panel: "health" }), expected, "the badge counts them all");
  const p1 = await listRequests(db, { actor: reviewer, panel: "health", page: 1, size: 25 });
  assert.deepEqual([p1.ok, p1.mine.length, p1.mineTotal, p1.pageCount], [true, 25, 70, 3]);
  const p3 = await listRequests(db, { actor: reviewer, panel: "health", page: 3, size: 25 });
  assert.equal(p3.mine.length, 20);
  const ids = new Set(); for (const pg of [1, 2, 3]) for (const r of (await listRequests(db, { actor: reviewer, panel: "health", page: pg })).mine) ids.add(r.id);
  assert.equal(ids.size, 70, "every one of my requests is on exactly one page");
});

test("the people list and the activity CSV read every row, and fail instead of cutting off", async () => {
  const people = Array.from({ length: 1150 }, (_, k) => urow(k + 1, { username: `u${k + 1}`, created_at: new Date(NOW + k * 1000).toISOString() }));
  const db = createMemoryAdmin({ operator_users: people, operator_audit_log: Array.from({ length: 2300 }, (_, k) => ({ id: k + 1, at: new Date(NOW - k * 1000).toISOString(), panel: "health", action: "product.update", result: "success", entity: "products", entity_ids: [k], detail: {} })) }, { maxRows: 1000 });
  assert.equal((await listUsers(db)).users.length, 1150);
  const csv = await auditCsv(db, { panel: "health", filters: {} });
  assert.equal(csv.ok, true); assert.equal(csv.count, 2300);
  db.fail = (t) => (t === "operator_audit_log" ? { code: "57014", message: "timeout" } : null);
  assert.equal((await auditCsv(db, { panel: "health", filters: {} })).ok, false);
});

// ── source pins ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("no list screen or reader keeps a cap that hides rows; the screens page on the server", () => {
  for (const f of ["lib/operator/data.js", "lib/beauty/operator/data.js"]) {
    const s = read(f);
    assert.ok(!/LIST_LIMIT|DASHBOARD_ROW_LIMIT|mayBeTruncated/.test(s), `${f} still has the old caps`);
    assert.ok(!/from\("(beauty_)?products"\)\s*\.select\("\*"\)\s*\.order/.test(s), `${f} still loads products in bulk`);
  }
  assert.ok(!fs.existsSync(new URL("../lib/operator/listLimits.js", import.meta.url)), "listLimits.js is gone");
  for (const f of ["components/operator/ProductsTable.jsx", "components/beauty/operator/ProductsTable.jsx", "components/operator/QuotesPanel.jsx"]) {
    const s = read(f);
    assert.match(s, /<ListPager data=\{data\}/, `${f} has no pager`);
    assert.match(s, /useListNav\(/, `${f} keeps its filters in state instead of the address`);
    assert.ok(!/\.filter\(\(?p\)? => .*p\.name_fa/.test(s) && !/products\.sort\(|\[\.\.\.products\]/.test(s), `${f} still filters or sorts the list in the browser`);
  }
  for (const f of ["app/operator/(panel)/products/page.jsx", "app/beauty/operator/(panel)/products/page.jsx", "app/operator/(panel)/quotes/page.jsx", "app/beauty/operator/(panel)/quotes/page.jsx"]) {
    assert.match(read(f), /await searchParams|props\.searchParams/, `${f} does not read the address`);
  }
  // the readers check the session and the permission before the database
  for (const [f, fn, guard] of [["lib/operator/data.js", "getProductsPage", "products.view"], ["lib/operator/data.js", "getQuotesPage", "quotes.view"], ["lib/beauty/operator/data.js", "getBeautyProductsPage", "products.view"], ["lib/beauty/operator/data.js", "getBeautyQuotesPage", "quotes.view"]]) {
    const body = read(f).match(new RegExp(`export async function ${fn}\\(([\\s\\S]*?)\\n\\}\\n`))[1];
    assert.ok(body.indexOf(`require${f.includes("beauty") ? "Beauty" : "Health"}Session("${guard}")`) >= 0 && body.indexOf("Session(") < body.indexOf("getAdminClient()"), `${f}:${fn} must check the right before reading`);
  }
});

test("no reader of a product/request table asks for 'everything' in one plain select (the API would stop at 1,000 rows without saying so)", () => {
  // every whole-table read in these files goes through readAll / readProductCounts
  for (const [f, needles] of [
    ["lib/operator/categoryTreeData.js", ['readProductCounts(admin, "health")']],
    ["lib/operator/importActions.js", ['readAll((from, to) => admin.from("products").select("sku")', 'readAll((from, to) => scope(admin.from("products").select("*"))']],
    ["lib/beauty/operator/importActions.js", ['readAll((from, to) => admin.from("beauty_products").select("sku")', 'readAll((from, to) => scope(admin.from("beauty_products").select("*"))']],
    ["lib/operator/importEngine.js", ['readAll((from, to) => admin.from(table).select(cols)']],
    ["lib/beauty/operator/importEngine.js", ['readAll((from, to) => admin.from(table).select(cols)']],
  ]) for (const n of needles) assert.ok(read(f).includes(n), `${f} no longer reads everything in chunks: ${n}`);
  assert.ok(!/from\("products"\)\.select\("id,category_id,category"\)/.test(read("lib/operator/categoryTreeData.js")));
});

test("migration 43 is documented and additive", () => {
  const sql = read("migrations/43_panel_list_paging.sql").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(sql, /^BEGIN;/m); assert.match(sql, /^COMMIT;/m);
  assert.ok(!/\b(DROP TABLE|DELETE FROM|TRUNCATE|DROP COLUMN)\b/i.test(sql));
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.gap_count\(public\.products\) FROM PUBLIC, anon, authenticated/);
  assert.match(read("migrations/README.md"), /\| 43 \| `43_panel_list_paging\.sql`/);
});
