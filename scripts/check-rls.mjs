#!/usr/bin/env node
// scripts/check-rls.mjs — verifies the live Supabase posture matches the app's
// security assumptions, using ONLY the public anon key (what any stranger on the
// internet has). Read-only by default.
//
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run check:rls
//
// Checks (anon perspective):
//   1. products / categories SELECT → allowed   (public catalog read)
//   2. ARCHIVED products (is_active = false) → invisible (Health and Beauty)
//   3. quote_requests, beauty_quote_requests, contact_inquiries, import_logs,
//      beauty_import_logs → not readable (customer data is private)
//   4. Supabase Auth signup → disabled (the app never uses Supabase Auth, so an
//      open signup only lets strangers become "authenticated" users)
//   5. quote_requests / beauty_quote_requests INSERT → blocked — run ONLY with
//      --insert-test, because if a policy is still open this WRITES one obvious
//      test row you must delete.
//
// Exit code 0 = every check passed, 1 = at least one failed, 2 = bad usage.
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const doInsertTest = process.argv.includes("--insert-test");

if (!url || !anon) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (anon key only — never the service role).");
  process.exit(2);
}

const headers = { apikey: anon, Authorization: `Bearer ${anon}` };
let failures = 0;

function report(name, pass, detail) {
  console.log(`${pass ? "✓ PASS" : "✗ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

// `extra` is an optional PostgREST filter such as "&is_active=eq.false".
async function selectProbe(table, extra = "") {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1${extra}`, { headers });
  if (!res.ok) return { readable: false, detail: `HTTP ${res.status}` };
  const rows = await res.json().catch(() => []);
  // RLS commonly yields 200 + empty set rather than an error.
  return { readable: Array.isArray(rows) && rows.length > 0, detail: `HTTP 200, ${Array.isArray(rows) ? rows.length : "?"} row(s)` };
}

// 1) public catalog is readable
const products = await selectProbe("products");
report("anon can read products", products.readable, products.detail);

const categories = await selectProbe("categories");
report("anon can read categories", categories.readable, categories.detail);

// 2) archived products are not public
const hiddenHealth = await selectProbe("products", "&is_active=eq.false");
report("anon CANNOT see archived (inactive) Health products", !hiddenHealth.readable, hiddenHealth.detail);

const hiddenBeauty = await selectProbe("beauty_products", "&is_active=eq.false");
report("anon CANNOT see archived (inactive) Beauty products", !hiddenBeauty.readable, hiddenBeauty.detail);

// 3) customer data and operator logs are private
for (const table of ["quote_requests", "beauty_quote_requests", "contact_inquiries", "import_logs", "beauty_import_logs"]) {
  const probe = await selectProbe(table);
  report(`anon CANNOT read ${table}`, !probe.readable, probe.detail);
}

// 4) Supabase Auth signup must be closed
try {
  const res = await fetch(`${url}/auth/v1/settings`, { headers });
  if (!res.ok) {
    report("Supabase Auth signup is disabled", false, `could not read /auth/v1/settings (HTTP ${res.status})`);
  } else {
    const s = await res.json();
    report("Supabase Auth signup is disabled (disable_signup = true)", s.disable_signup === true, `disable_signup=${s.disable_signup}`);
    report("Phone auto-confirm is off", s.phone_autoconfirm !== true, `phone_autoconfirm=${s.phone_autoconfirm}`);
  }
} catch (err) {
  report("Supabase Auth signup is disabled", false, `request failed: ${err?.message || err}`);
}

// 5) optional write probe
if (doInsertTest) {
  for (const table of ["quote_requests", "beauty_quote_requests"]) {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ name: "__rls_check_delete_me__", preferred_contact: "whatsapp" }),
    });
    const blocked = !res.ok; // 401/403 = closed
    report(`anon CANNOT insert ${table}`, blocked, `HTTP ${res.status}`);
    if (!blocked) {
      console.log(`  ⚠ ${table} still accepts anonymous inserts: apply migrations 27/28, then`);
      console.log(`    DELETE FROM ${table} WHERE name = '__rls_check_delete_me__';`);
    }
  }
} else {
  console.log("• SKIP  anon insert probe (writes a test row) — rerun with --insert-test");
}

process.exit(failures ? 1 : 0);
