#!/usr/bin/env node
// scripts/check-rls.mjs — verifies the live Supabase RLS posture matches the
// app's security assumptions, using ONLY the public anon key (what any
// stranger on the internet has). Read-only by default.
//
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run check:rls
//
// Checks (anon perspective):
//   1. products       SELECT → allowed   (public catalog read)
//   2. categories     SELECT → allowed   (public catalog read)
//   3. quote_requests SELECT → blocked   (inquiries are private)
//   4. import_logs    SELECT → blocked   (operator-only)
//   5. quote_requests INSERT → blocked   — run ONLY with --insert-test, because
//      if the policy is still open this WRITES one obvious test row you must
//      delete. Closed policy = migration 09 step 3 has been applied.
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

async function selectProbe(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, { headers });
  if (!res.ok) return { readable: false, detail: `HTTP ${res.status}` };
  const rows = await res.json().catch(() => []);
  // RLS commonly yields 200 + empty set rather than an error.
  return { readable: Array.isArray(rows) && rows.length > 0, detail: `HTTP 200, ${Array.isArray(rows) ? rows.length : "?"} row(s)` };
}

const products = await selectProbe("products");
report("anon can read products", products.readable, products.detail);

const categories = await selectProbe("categories");
report("anon can read categories", categories.readable, categories.detail);

const quotes = await selectProbe("quote_requests");
report("anon CANNOT read quote_requests", !quotes.readable, quotes.detail);

const logs = await selectProbe("import_logs");
report("anon CANNOT read import_logs", !logs.readable, logs.detail);

if (doInsertTest) {
  const res = await fetch(`${url}/rest/v1/quote_requests`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ name: "__rls_check_delete_me__", preferred_contact: "whatsapp" }),
  });
  const blocked = !res.ok; // 401/403 = policy closed (migration 09 step 3 applied)
  report("anon CANNOT insert quote_requests", blocked, `HTTP ${res.status}`);
  if (!blocked) {
    console.log("  ⚠ The public-insert policy is STILL OPEN: run migration 09 step 3,");
    console.log("    then DELETE FROM quote_requests WHERE name = '__rls_check_delete_me__';");
  }
} else {
  console.log("• SKIP  anon insert probe (writes a test row) — rerun with --insert-test");
}

process.exit(failures ? 1 : 0);
