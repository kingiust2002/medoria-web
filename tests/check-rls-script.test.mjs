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
  if (req.method === "POST") {
    writes.push(u.pathname);
    return open ? json(201, {}) : json(401, { code: "42501", message: "permission denied" });
  }
  const table = u.pathname.replace("/rest/v1/", "");
  // Match migration 30's real schema. SQL resolves selected columns before checking table grants:
  // querying the nonexistent `id` must not be hidden by this fixture's generic 403 response.
  const securityColumns = {
    operator_sessions: ["sid", "panel", "created_at", "expires_at", "revoked_at", "ip_hash"],
    operator_totp_state: ["panel", "last_step", "updated_at"],
    operator_recovery_used: ["panel", "code_hash", "used_at"],
  };
  if (securityColumns[table] && u.searchParams.get("select")?.split(",").some((c) => !securityColumns[table].includes(c))) {
    return json(400, { code: "42703", message: "selected column does not exist" });
  }
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

test("an open project fails: archived products, customer data and open signup are all reported", async () => {
  mode = "open";
  const { code, out } = await run();
  assert.equal(code, 1, out);
  assert.match(out, /✗ FAIL\s+anon CANNOT see archived \(inactive\) Health products/);
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
