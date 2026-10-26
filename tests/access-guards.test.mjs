// Code-level guards for customer data and archived products:
//   * private tables are only touched through service-role clients, never the anon one
//   * the public quote actions never fall back to the anon key
//   * every browser-side products read excludes archived rows
//   * an unknown or archived product is a real 404
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const rel = (f) => path.relative(root, f).split(path.sep).join("/");

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = ["app", "lib", "components"].flatMap((d) => walk(path.join(root, d)));
const src = new Map(files.map((f) => [rel(f), fs.readFileSync(f, "utf8")]));
const PRIVATE_TABLES = "quote_requests|beauty_quote_requests|contact_inquiries|import_logs|beauty_import_logs|operator_audit_log|operator_sessions|operator_totp_state|operator_recovery_used";
// receiver of every `<receiver>.from("<private table>")`, e.g. `admin`, `a.admin`, `db`
const PRIVATE_FROM_G = new RegExp(`([\\w.]+)\\s*\\.from\\(\\s*["'\`](${PRIVATE_TABLES})["'\`]\\s*\\)`, "g");

test("private tables are only ever queried through a service-role client, never the public `supabase` client", () => {
  let found = 0;
  for (const [file, s] of src) {
    for (const m of s.matchAll(PRIVATE_FROM_G)) {
      found++;
      assert.notEqual(m[1], "supabase", `${file} queries ${m[2]} with the public anon client`);
    }
    if (PRIVATE_FROM_G.test(s) || new RegExp(`from\\(\\s*["']${PRIVATE_TABLES}`).test(s)) {
      if (/createClient\(/.test(s)) {
        assert.match(s, /SUPABASE_SERVICE_ROLE_KEY/, `${file} builds its own client without the service-role key`);
        assert.ok(!/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(s), `${file} references the anon key`);
      }
    }
    PRIVATE_FROM_G.lastIndex = 0;
  }
  assert.ok(found >= 10, `expected the quote/import/operator code paths, found ${found}`);
});

test("the public quote actions have no anon-key fallback", () => {
  for (const file of ["lib/actions/quote.js", "lib/beauty/actions/quote.js"]) {
    const s = src.get(file);
    assert.ok(s, `${file} not found`);
    assert.ok(!s.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"), `${file} still falls back to the anon key`);
    assert.match(s, /SUPABASE_SERVICE_ROLE_KEY/);
  }
});

test("browser-side reads of products exclude archived rows", () => {
  const readers = [...src].filter(
    ([file, s]) =>
      /\.from\(\s*["']products["']\s*\)/.test(s) && !file.startsWith("lib/operator/") && !file.startsWith("lib/beauty/operator/")
  );
  assert.ok(readers.length >= 4, `expected lib/supabase.js, wishlist, compare, drawer; found ${readers.map(([f]) => f)}`);
  for (const [file, s] of readers) {
    assert.match(s, /is_active/, `${file} reads products without an is_active filter`);
  }
});

test("an unknown or archived product renders a real 404, not a 200 empty page", () => {
  const page = src.get("app/health/[lang]/catalog/[slug]/page.jsx");
  assert.match(page, /import\s+\{\s*notFound\s*\}\s+from\s+"next\/navigation"/);
  assert.match(page, /if \(!product\) notFound\(\);/);
  assert.ok(fs.existsSync(path.join(root, "app/health/[lang]/catalog/[slug]/not-found.jsx")), "not-found.jsx is missing");
  const lib = src.get("lib/supabase.js");
  assert.match(lib, /getProductBySlug[\s\S]*?\.eq\("is_active", true\)/);
});
