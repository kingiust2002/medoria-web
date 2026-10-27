// The warehouse is INTERNAL. Its tables and functions may be named only by the operator side (and the warehouse library the operator
// actions use); no public page, public API route, shared component, sitemap, print/catalogue path, search or preview may mention them.
// (The database also refuses anon / authenticated — tests/warehouse-migration.test.mjs — this test keeps the code from even trying.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SECRET = /_stock_(locations|balances|movements|reservations|post|reverse|reserve|release)|stock_(locations|balances|movements|reservations)\b|lib\/warehouse|@\/lib\/warehouse/;
const INTERNAL = [/\/operator\//, /^lib\/warehouse\//, /^lib\/operator\//, /^lib\/beauty\/operator\//, /^components\/panel\//, /^lib\/panel\//];

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out); else if (/\.(jsx?|mjs|json)$/.test(e.name)) out.push(rel);
  }
  return out;
}

test("no public file names a warehouse table or function", () => {
  const files = ["app", "components", "lib", "middleware.js", "next.config.js"].flatMap((d) => (fs.existsSync(path.join(ROOT, d)) && fs.statSync(path.join(ROOT, d)).isDirectory() ? walk(d) : [d]));
  let publicFiles = 0;
  for (const f of files) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    const norm = "/" + f.replaceAll("\\", "/");
    if (INTERNAL.some((re) => re.test(f.replaceAll("\\", "/")) || re.test(norm))) continue;
    publicFiles++;
    assert.ok(!SECRET.test(fs.readFileSync(path.join(ROOT, f), "utf8")), `${f} must not touch the warehouse`);
  }
  assert.ok(publicFiles > 100, "the scan really covered the public code");
});

test("the public product readers never ask for anything but catalogue columns, and no product table gets warehouse columns", () => {
  for (const f of ["lib/supabase.js", "lib/beauty/catalog.js", "lib/health/categories.js"]) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    assert.ok(!/stock_?(qty|quantity|level|on_hand|balance)/i.test(fs.readFileSync(path.join(ROOT, f), "utf8")), `${f} reads a stock number`);
  }
  for (const m of fs.readdirSync(path.join(ROOT, "migrations")).filter((n) => /^\d+_.*\.sql$/.test(n))) {
    const sql = fs.readFileSync(path.join(ROOT, "migrations", m), "utf8");
    assert.ok(!/ALTER TABLE\s+(public\.)?(beauty_)?products\s+ADD COLUMN[^;]*(quantity|stock_level|on_hand)/i.test(sql), `${m} adds a stock column to a product table`);
  }
});

test("the public in_stock flag is never computed from warehouse numbers", () => {
  const sql = fs.readFileSync(path.join(ROOT, "migrations/36_warehouse.sql"), "utf8");
  assert.ok(!/UPDATE\s+(public\.)?(beauty_)?products\b/i.test(sql), "migration 36 must not write the product tables");
  assert.ok(!/in_stock/.test(sql.replace(/^--.*$/gm, "")), "migration 36 must not touch in_stock");
});
