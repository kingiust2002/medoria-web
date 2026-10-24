// scripts/check-rls.mjs is the post-deploy proof that the protections hold.
// Run it against a mock API that behaves like (a) a hardened and (b) an open
// Supabase project, and check that it passes / fails accordingly.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/check-rls.mjs", import.meta.url));
let mode = "closed";
const writes = [];
let server;
let base;

function handle(req, res) {
  const u = new URL(req.url, "http://mock");
  const json = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const open = mode === "open";
  if (u.pathname === "/auth/v1/settings") {
    return json(200, { disable_signup: open ? false : true, phone_autoconfirm: open });
  }
  if (req.method === "POST") {
    writes.push(u.pathname);
    return open ? json(201, {}) : json(401, { code: "42501", message: "permission denied" });
  }
  const table = u.pathname.replace("/rest/v1/", "");
  const archivedOnly = u.searchParams.get("is_active") === "eq.false";
  if (table === "products" || table === "categories") return json(200, archivedOnly ? (open ? [{ id: 2 }] : []) : [{ id: 1 }]);
  if (table === "beauty_products") return json(200, archivedOnly && open ? [{ id: 3 }] : []);
  // private tables: a hardened project answers 401 or an empty set, an open one leaks rows
  if (open) return json(200, [{ id: 9 }]);
  return table === "quote_requests" ? json(401, { code: "42501" }) : json(200, []);
}

before(async () => {
  server = http.createServer(handle);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function run(args = [], env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { PATH: process.env.PATH, NEXT_PUBLIC_SUPABASE_URL: base, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test", ...env },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

test("a hardened project passes every check", async () => {
  mode = "closed";
  const { code, out } = await run();
  assert.equal(code, 0, out);
  assert.ok(!out.includes("✗ FAIL"), out);
  assert.match(out, /archived \(inactive\) Health products/);
  assert.match(out, /beauty_quote_requests/);
  assert.match(out, /signup is disabled/);
});

test("an open project fails: archived products, customer data and open signup are all reported", async () => {
  mode = "open";
  const { code, out } = await run();
  assert.equal(code, 1, out);
  assert.match(out, /✗ FAIL\s+anon CANNOT see archived \(inactive\) Health products/);
  assert.match(out, /✗ FAIL\s+anon CANNOT read quote_requests/);
  assert.match(out, /✗ FAIL\s+anon CANNOT read beauty_quote_requests/);
  assert.match(out, /✗ FAIL\s+Supabase Auth signup is disabled/);
  assert.match(out, /✗ FAIL\s+Phone auto-confirm is off/);
});

test("the insert probe passes when closed and fails (exit 1) when a table accepts anonymous inserts", async () => {
  writes.length = 0;
  mode = "closed";
  assert.equal((await run(["--insert-test"])).code, 0);
  mode = "open";
  const open = await run(["--insert-test"]);
  assert.equal(open.code, 1);
  assert.match(open.out, /still accepts anonymous inserts/);
  assert.ok(writes.some((p) => p.endsWith("/quote_requests")) && writes.some((p) => p.endsWith("/beauty_quote_requests")));
});

test("without --insert-test the script never writes", async () => {
  writes.length = 0;
  mode = "open";
  await run();
  assert.equal(writes.length, 0);
});

test("missing configuration is a usage error (exit 2), not a pass", async () => {
  const { code } = await run([], { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" });
  assert.equal(code, 2);
});
