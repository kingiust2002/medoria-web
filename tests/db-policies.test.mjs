// Static guards over the SQL migrations: the customer-data and archived-product
// protections must stay in place, and no later migration may quietly re-open them.
// (The migration itself was also exercised against a real PostgreSQL: see the PR.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dir = new URL("../migrations/", import.meta.url);
const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
const num = (f) => Number(f.split("_")[0]);
// Drop whole-line SQL comments so documentation (e.g. rollback recipes) cannot match.
const sql = (f) =>
  fs.readFileSync(new URL(f, dir), "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const PRIVATE = ["quote_requests", "beauty_quote_requests", "contact_inquiries", "import_logs", "beauty_import_logs"];

test("migration 28 locks the five private tables and keeps service_role", () => {
  const f = files.find((x) => x.startsWith("28_"));
  assert.ok(f, "migration 28 is missing");
  const s = sql(f);
  for (const t of PRIVATE) assert.ok(s.includes(`'${t}'`), `28 does not cover ${t}`);
  assert.match(s, /FROM pg_policies/); // drops policies by lookup, not by remembered names
  assert.match(s, /DROP POLICY %I ON public\.%I/);
  assert.match(s, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated/);
  assert.match(s, /GRANT ALL ON TABLE public\.%I TO service_role/);
  assert.match(s, /ENABLE ROW LEVEL SECURITY/);
});

test("migration 28 leaves exactly one products policy, active rows only", () => {
  const s = sql(files.find((x) => x.startsWith("28_")));
  const creates = [...s.matchAll(/CREATE POLICY\s+"([^"]+)"\s+ON\s+public\.products\s+FOR SELECT USING \(([^)]*)\)/gi)];
  assert.equal(creates.length, 1);
  assert.equal(creates[0][2].replace(/\s+/g, " ").trim(), "is_active = true");
  assert.match(s, /tablename = 'products'/); // every existing products policy is dropped first
  assert.match(s, /products must have exactly one policy/);
});

test("migration 28 is one all-or-nothing transaction with self-checks", () => {
  const s = sql(files.find((x) => x.startsWith("28_"))).trim();
  assert.ok(s.startsWith("BEGIN;"));
  assert.ok(s.endsWith("COMMIT;"));
  assert.ok((s.match(/RAISE EXCEPTION/g) || []).length >= 4);
});

test("migration 27 removes the any-signed-in-user read policy and the public inserts", () => {
  const s = sql(files.find((x) => x.startsWith("27_")));
  assert.match(s, /DROP POLICY IF EXISTS "quote_requests_auth_read"\s+ON public\.quote_requests/);
  assert.match(s, /DROP POLICY IF EXISTS "quote_requests_public_insert"\s+ON public\.quote_requests/);
  assert.match(s, /DROP POLICY IF EXISTS "contact_public_insert"\s+ON public\.contact_inquiries/);
});

test("no migration after 28 re-opens a private table or makes products public again", () => {
  for (const f of files.filter((x) => num(x) > 28)) {
    for (const m of sql(f).matchAll(/CREATE POLICY\s+"[^"]+"\s+ON\s+(?:public\.)?(\w+)([\s\S]*?);/gi)) {
      const [, table, rest] = m;
      assert.ok(!PRIVATE.includes(table), `${f} creates a policy on private table ${table}`);
      if (table === "products") {
        assert.ok(!/USING\s*\(\s*true\s*\)/i.test(rest), `${f} makes products readable regardless of is_active`);
      }
    }
    assert.ok(
      !/GRANT\s+[\s\S]*?ON\s+(?:TABLE\s+)?(?:public\.)?(?:quote_requests|beauty_quote_requests|contact_inquiries|import_logs|beauty_import_logs)[\s\S]*?TO\s+[\s\S]*?(anon|authenticated|PUBLIC)/i.test(sql(f)),
      `${f} grants a private table to a public role`
    );
  }
});

test("Beauty already limits public reads to active rows (the model Health now follows)", () => {
  const s = sql("10_beauty_catalog.sql");
  assert.match(s, /beauty_products_public_read[\s\S]*?USING \(is_active = true\)/);
});
