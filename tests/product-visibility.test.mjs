// Archived (is_active = false) Health products must not be served by the data
// layer, and public reads must carry a bounded cache lifetime. Runs the real
// lib/supabase.js against a tiny PostgREST-style mock server (no network, no Next).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const ROWS = [
  { id: 1, slug: "active-one", name_en: "Active one", is_active: true },
  { id: 2, slug: "hidden-one", name_en: "Hidden one", is_active: false },
];

const seen = [];
let server;
let lib;
let failNext = false;
let missingActiveColumn = false;

function handle(req, res) {
  const u = new URL(req.url, "http://mock");
  seen.push(`${req.method} ${u.pathname}${u.search}`);
  const send = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json", "Content-Range": "0-0/*" });
    res.end(JSON.stringify(body));
  };
  if (failNext) {
    failNext = false;
    return send(500, { code: "XX000", message: "boom" });
  }
  if (!u.pathname.startsWith("/rest/v1/products")) return send(200, []);
  let rows = ROWS.slice();
  for (const [key, value] of u.searchParams) {
    if (["select", "order", "limit", "offset", "or"].includes(key)) continue;
    if (key === "is_active" && missingActiveColumn) {
      return send(400, { code: "42703", message: "column products.is_active does not exist" });
    }
    if (value.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === value.slice(3));
  }
  send(200, rows);
}

before(async () => {
  server = http.createServer(handle);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  lib = await import("../lib/supabase.js"); // reads the env above at import time
});

after(() => server.close());

test("getProductBySlug returns an active product and asks only for active rows", async () => {
  seen.length = 0;
  const p = await lib.getProductBySlug("active-one");
  assert.equal(p?.id, 1);
  assert.ok(seen.some((r) => r.includes("is_active=eq.true")), `no is_active filter in: ${seen.join(" | ")}`);
});

test("getProductBySlug returns null for an archived product (by slug)", async () => {
  assert.equal(await lib.getProductBySlug("hidden-one"), null);
});

test("getProductBySlug returns null for an archived product (by numeric id) but finds an active one", async () => {
  assert.equal(await lib.getProductBySlug("2"), null);
  assert.equal((await lib.getProductBySlug("1"))?.slug, "active-one");
});

test("getProductBySlug returns null for an unknown slug", async () => {
  assert.equal(await lib.getProductBySlug("does-not-exist"), null);
});

test("getProducts lists active products only", async () => {
  const list = await lib.getProducts();
  assert.deepEqual(list.map((p) => p.slug), ["active-one"]);
});

test("a database error fails an ISR render (throwOnError) instead of caching a false 404", async () => {
  failNext = true;
  await assert.rejects(() => lib.getProductBySlug("active-one", { throwOnError: true }), /PRODUCT_FETCH_FAILED/);
  failNext = true;
  assert.equal(await lib.getProductBySlug("active-one"), null); // non-ISR callers just get null
});

test("public GET requests carry a short cache lifetime; RPC/POST requests are left alone", async () => {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push(init);
    return new Response("[]");
  };
  try {
    await lib.publicFetch("http://x/rest/v1/products", { method: "GET", headers: { a: "b" } });
    await lib.publicFetch("http://x/rest/v1/products");
    await lib.publicFetch("http://x/rest/v1/rpc/increment_product_views", { method: "POST", body: "{}" });
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(lib.PUBLIC_DATA_TTL_SECONDS, 60);
  assert.equal(calls[0].next.revalidate, 60);
  assert.equal(calls[0].headers.a, "b");
  assert.equal(calls[1].next.revalidate, 60);
  assert.equal(calls[2].next, undefined);
});

// Must stay LAST: it flips the module's one-time "is_active column exists" memory.
test("before migration 04 (no is_active column) the lookup falls back to unfiltered, as documented", async () => {
  missingActiveColumn = true;
  const p = await lib.getProductBySlug("hidden-one");
  assert.equal(p?.id, 2, "legacy databases without the column keep working");
});
