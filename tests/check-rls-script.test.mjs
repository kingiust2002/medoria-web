// scripts/check-rls.mjs is the post-deploy proof that the protections hold.
// Run it against a mock API that behaves like (a) a hardened and (b) an open
// Supabase project, and check that it passes / fails accordingly.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const script = fileURLToPath(new URL("../scripts/check-rls.mjs", import.meta.url));
let mode = "closed";
const writes = [];
let server;
let base;
// These migrations deliberately use natural/composite keys, without `id`.
// Read their column declarations independently of the checker's key mapping so
// the mock cannot hide a bad SELECT behind a generic permission denial.
const keylessColumns = Object.fromEntries(Object.entries({
  publish_rules: "46_publish_rules.sql",
  operator_preferences: "50_operator_preferences.sql",
  operator_table_columns: "55_operator_table_columns.sql",
  ops_status: "52_ops_status.sql",
}).map(([table, migration]) => {
  const sql = readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
  const definition = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1];
  assert.ok(definition, `${table}: fixture must find the real table`);
  const columns = definition.split("\n").flatMap((line) => /^\s+([a-z_]+)\s+[A-Z]/.exec(line)?.slice(1) || []);
  assert.ok(columns.length && !columns.includes("id"), `${table}: a keyless fixture is required`);
  return [table, columns];
}));

function handle(req, res) {
  const u = new URL(req.url, "http://mock");
  const json = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const open = mode === "open";
  // failure modes: the checker must never read these as "private"
  if (mode === "server500") return json(500, { message: "boom" });
  if (mode === "schemacache") return json(503, { code: "PGRST002", message: "Could not query the database for the schema cache. Retrying." });
  if (mode === "badjson") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<html>gateway welcome</html>"); }
  if (mode === "insert400" && req.method === "POST") return json(400, { code: "23502", message: "null value in column" });
  if (mode === "missingtables" && (u.pathname.endsWith("/contact_inquiries") || u.pathname.endsWith("/beauty_import_logs"))) {
    return json(404, { code: "PGRST205", message: "Could not find the table in the schema cache" });
  }
  if (mode === "emptyprivate" && ["quote_requests", "beauty_quote_requests", "contact_inquiries", "import_logs", "beauty_import_logs"].some((t) => u.pathname.endsWith("/" + t))) return json(200, []);
  if (u.pathname === "/auth/v1/settings") {
    return json(200, { disable_signup: open ? false : true, phone_autoconfirm: open });
  }
  // migration 53: the approved-deletion functions are for the service role only
  if (u.pathname.startsWith("/rest/v1/rpc/")) {
    if (mode === "fnmissing") return json(404, { code: "PGRST202", message: "Could not find the function in the schema cache" });
    return open ? json(200, { ok: true }) : json(403, { code: "42501", message: "permission denied for function" });
  }
  // migration 54: the document buckets are private — Supabase answers "Bucket not found" for any object address; a public bucket serves (or says "Object not found")
  if (u.pathname.startsWith("/storage/v1/object/public/")) {
    if (mode === "bucketpublic") return json(404, { statusCode: "404", error: "not_found", message: "Object not found" });
    if (open) { res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end("%PDF-1.4 leaked"); }
    return json(400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
  }
  if (req.method === "POST") {
    writes.push(u.pathname);
    return open ? json(201, {}) : json(401, { code: "42501", message: "permission denied" });
  }
  const table = u.pathname.replace("/rest/v1/", "");
  // Match migration 30's real schema. SQL resolves selected columns before checking table grants:
  // querying the nonexistent `id` must not be hidden by this fixture's generic 403 response.
  const securityColumns = {
    ...keylessColumns,
    operator_sessions: ["sid", "panel", "created_at", "expires_at", "revoked_at", "ip_hash"],
    operator_totp_state: ["panel", "last_step", "updated_at"],
    operator_recovery_used: ["panel", "code_hash", "used_at"],
  };
  if (securityColumns[table] && u.searchParams.get("select")?.split(",").some((c) => !securityColumns[table].includes(c))) {
    return json(400, { code: "42703", message: "selected column does not exist" });
  }
  if (mode === "keyless400" && keylessColumns[table]) return json(400, { code: "42703", message: "selected column does not exist" });
  if (mode === "emptyproducts" && table === "products") return json(200, []);
  // migration 44: a variant is not a public row (the public policy requires variant_of IS NULL); an open project would show them
  if (u.searchParams.get("variant_of") === "not.is.null" && (table === "products" || table === "beauty_products")) return json(200, open ? [{ id: 4 }] : []);
  const archivedOnly = u.searchParams.get("is_active") === "eq.false";
  if (table === "products" || table === "categories") return json(200, archivedOnly ? (open ? [{ id: 2 }] : []) : [{ id: 1 }]);
  if (table === "beauty_products") return json(200, archivedOnly && open ? [{ id: 3 }] : []);
  // private tables: a hardened project denies (migration 28 removes anon's table grants), an open one leaks rows
  if (open) return json(200, [{ id: 9 }]);
  return json(403, { code: "42501", message: `permission denied for table ${table}` });
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

test("keyless private tables use columns from the real migrations and prove actual denials", async () => {
  mode = "closed";
  const { code, out } = await run();
  assert.equal(code, 0, out);
  for (const table of Object.keys(keylessColumns)) {
    assert.match(out, new RegExp(`✓ PASS\\s+anon CANNOT read ${table}\\s+— HTTP 403 42501`), out);
  }
});

test("a real 400 for a keyless table stays UNKNOWN, never a privacy pass", async () => {
  mode = "keyless400";
  const { code, out } = await run();
  assert.equal(code, 3, out);
  for (const table of Object.keys(keylessColumns)) {
    assert.match(out, new RegExp(`\\? UNKNOWN\\s+anon CANNOT read ${table}\\s+— unexpected HTTP 400`), out);
  }
});

test("no active Health products stays inconclusive while keyless privacy probes can pass", async () => {
  mode = "emptyproducts";
  const { code, out } = await run();
  assert.equal(code, 3, out);
  assert.match(out, /\? UNKNOWN\s+anon can read products/);
  assert.match(out, /57 passed, 0 failed, 1 unknown/);
  for (const table of Object.keys(keylessColumns)) {
    assert.match(out, new RegExp(`✓ PASS\\s+anon CANNOT read ${table}`), out);
  }
});

test("an open project fails: archived products, customer data and open signup are all reported", async () => {
  mode = "open";
  const { code, out } = await run();
  assert.equal(code, 1, out);
  assert.match(out, /✗ FAIL\s+anon CANNOT see archived \(inactive\) Health products/);
  assert.match(out, /✗ FAIL\s+anon CANNOT see product variants as products \(Health\)/);
  assert.match(out, /✗ FAIL\s+anon CANNOT see product variants as products \(Beauty\)/);
  for (const label of ["Health categories", "Beauty categories", "Beauty brands"]) assert.match(out, new RegExp(`✗ FAIL\\s+anon CANNOT see inactive ${label}`), `${label} (migration 31)`);
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

// ── a failing or unclear answer is NOT proof of privacy ─────────────────────────────────────────────────
// (reproduced 2026-10-26: HTTP 500 on every probe printed PASS and exited 0)
for (const failing of ["server500", "schemacache", "badjson"]) {
  test(`${failing}: nothing is reported as private, nothing passes, the exit code is not 0`, async () => {
    mode = failing;
    const { code, out } = await run();
    assert.notEqual(code, 0, out);
    assert.equal(code, 3, `an inconclusive run exits 3 (not 1 = a proven leak, not 0)\n${out}`);
    for (const t of ["quote_requests", "beauty_quote_requests", "contact_inquiries", "import_logs", "beauty_import_logs"]) {
      assert.match(out, new RegExp(`\\? UNKNOWN\\s+anon CANNOT read ${t}\\b`), `${t} must be UNKNOWN\n${out}`);
    }
    assert.match(out, /\? UNKNOWN\s+anon CANNOT see archived \(inactive\) Health products/);
    for (const label of ["Health categories", "Beauty categories", "Beauty brands"]) assert.match(out, new RegExp(`\\? UNKNOWN\\s+anon CANNOT see inactive ${label}`), `${label} must be UNKNOWN on an error answer`);
    assert.ok(!/✓ PASS\s+anon CANNOT/.test(out), `no "CANNOT" check may pass on an error answer\n${out}`);
    assert.match(out, /inconclusive/i);
  });

  test(`${failing}: the insert probe does not read an error as 'denied'`, async () => {
    mode = failing;
    const { code, out } = await run(["--insert-test"]);
    assert.equal(code, 3, out);
    assert.match(out, /\? UNKNOWN\s+anon CANNOT insert quote_requests/);
    assert.ok(!/✓ PASS\s+anon CANNOT insert/.test(out), out);
  });
}

test("an unreachable API is inconclusive (UNKNOWN, exit 3), not a crash and not a pass", async () => {
  const { code, out } = await run([], { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9" });   // nothing listens on port 9
  assert.equal(code, 3, out);
  assert.match(out, /\? UNKNOWN/);
  assert.ok(!/✓ PASS/.test(out), out);
  assert.ok(!/at .*check-rls\.mjs/.test(out), "no stack trace for an expected network failure");
});

test("an EMPTY answer for a private table proves nothing (the lock-down answers 401/403); a real denial does", async () => {
  mode = "emptyprivate";
  const empty = await run();
  assert.equal(empty.code, 3, empty.out);
  assert.match(empty.out, /\? UNKNOWN\s+anon CANNOT read quote_requests/);
  assert.match(empty.out, /empty/i);
  mode = "closed";
  const closed = await run();
  assert.equal(closed.code, 0, closed.out);
  assert.match(closed.out, /✓ PASS\s+anon CANNOT read quote_requests\s+— HTTP 403/);
});

test("a table that is not in the API schema is reported as such, and does not fail the run", async () => {
  mode = "missingtables";
  const { code, out } = await run();
  assert.equal(code, 0, out);
  assert.match(out, /✓ PASS\s+anon CANNOT read contact_inquiries\s+— table not in the API schema/);
});

test("an insert that gets any non-denial 4xx is UNKNOWN; only 401/403 is 'denied'; 2xx is a leak", async () => {
  mode = "insert400";
  const r = await run(["--insert-test"]);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /\? UNKNOWN\s+anon CANNOT insert quote_requests/);
  mode = "closed";
  assert.equal((await run(["--insert-test"])).code, 0);
  mode = "open";
  assert.equal((await run(["--insert-test"])).code, 1);
});

// ── round 3: the functions of migration 53 and the private buckets of migration 54 ─────────────────────────────────────────────────────────
test("hardened: the approved-deletion functions refuse anon and the document buckets answer 'Bucket not found' (all PASS, exit 0)", async () => {
  mode = "closed";
  const { code, out } = await run();
  assert.equal(code, 0, out);
  for (const fn of ["operator_delete_quotes_checked", "operator_category_basis", "operator_delete_category_checked", "operator_brand_basis", "operator_delete_brand_checked"]) assert.match(out, new RegExp(`✓ PASS\\s+anon CANNOT call ${fn}`), fn);
  for (const b of ["product-documents", "beauty-product-documents"]) assert.match(out, new RegExp(`✓ PASS\\s+anon CANNOT reach the objects of the private bucket ${b}`), b);
  assert.match(out, /anon CANNOT read operator_table_columns/);
});

test("open: a function anon can call and a bucket that serves objects are FAIL (exit 1)", async () => {
  mode = "open";
  const { code, out } = await run();
  assert.equal(code, 1, out);
  assert.match(out, /✗ FAIL\s+anon CANNOT call operator_delete_quotes_checked/);
  assert.match(out, /✗ FAIL\s+anon CANNOT call operator_delete_category_checked/);
  assert.match(out, /✗ FAIL\s+anon CANNOT reach the objects of the private bucket product-documents/);
});

test("migration 53 not applied: 'function not found' is private (PASS); a bucket that answers 'Object not found' is NOT proof (UNKNOWN, exit 3)", async () => {
  mode = "fnmissing";
  const missing = await run();
  assert.match(missing.out, /✓ PASS\s+anon CANNOT call operator_brand_basis/);
  mode = "bucketpublic";
  const pub = await run();
  assert.match(pub.out, /\? UNKNOWN\s+anon CANNOT reach the objects of the private bucket product-documents/);
  assert.notEqual(pub.code, 0, "an unproven check never exits 0");
  mode = "closed";
});

test("the function probes carry the real argument names (an anon call with wrong names would be 'not found' and prove nothing)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(script, "utf8");
  const sql = fs.readFileSync(fileURLToPath(new URL("../migrations/53_atomic_approved_deletes.sql", import.meta.url)), "utf8");
  for (const [fn, args] of [["operator_delete_quotes_checked", ["p_house", "p_ids", "p_versions"]], ["operator_category_basis", ["p_house", "p_id"]], ["operator_delete_category_checked", ["p_house", "p_id", "p_move_to", "p_basis"]], ["operator_brand_basis", ["p_id"]], ["operator_delete_brand_checked", ["p_id", "p_basis"]]]) {
    const def = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(([^)]*)\\)`).exec(sql)?.[1] || "";
    for (const a of args) { assert.ok(def.includes(a + " "), `${fn}: migration 53 declares ${a}`); assert.ok(new RegExp(`${fn}: \\{[^}]*${a}`).test(src), `${fn}: the probe sends ${a}`); }
  }
});
