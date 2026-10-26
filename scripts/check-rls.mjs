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
//      beauty_import_logs, operator_* (log, sessions, 2FA state) → not readable (private). The lock-down
//      (migration 28) removes anon's table grants, so the proof is an explicit
//      HTTP 401/403 "permission denied". An empty 200 is NOT proof: it can be an empty
//      table or a policy that happens to filter everything.
//   4. Supabase Auth signup → disabled (the app never uses Supabase Auth, so an
//      open signup only lets strangers become "authenticated" users)
//   5. quote_requests / beauty_quote_requests INSERT → blocked — run ONLY with
//      --insert-test, because if a policy is still open this WRITES one obvious
//      test row you must delete.
//
// Every check ends in one of three results, never two:
//   ✓ PASS     the answer proves the protection holds
//   ✗ FAIL     the answer proves it does not (data or write access is open)
//   ? UNKNOWN  the answer proves nothing: a server error (5xx, e.g. PGRST002 "schema cache"), a
//              page that is not JSON, a network failure, a timeout, an empty answer where only a
//              denial is proof, an unexpected status. An error must never be read as "private".
//
// Exit code 0 = every check passed, 1 = at least one FAIL, 3 = no FAIL but at least one UNKNOWN
// (inconclusive: fix the API/network problem and run again), 2 = bad usage.
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const doInsertTest = process.argv.includes("--insert-test");
const TIMEOUT_MS = Number(process.env.RLS_CHECK_TIMEOUT_MS) || 15000;

if (!url || !anon) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (anon key only — never the service role).");
  process.exit(2);
}

const headers = { apikey: anon, Authorization: `Bearer ${anon}` };
const counts = { PASS: 0, FAIL: 0, UNKNOWN: 0 };

function report(name, result, detail) {
  const mark = { PASS: "✓ PASS", FAIL: "✗ FAIL", UNKNOWN: "? UNKNOWN" }[result];
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  counts[result]++;
}

// Turns whatever came back into one of: denied · rows · empty · missing · server_error · invalid ·
// network · other. `status` is the HTTP status when there was one.
async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return { kind: "network", status: 0, detail: timedOut ? `no answer within ${TIMEOUT_MS / 1000}s` : "could not reach the API" };
  }
  const status = res.status;
  const text = await res.text().catch(() => "");
  let body; let parsed = true;
  try { body = text ? JSON.parse(text) : null; } catch { parsed = false; }
  if (status >= 500) return { kind: "server_error", status, detail: `HTTP ${status}${body?.code ? ` ${body.code}` : ""}` };
  if (status === 401 || status === 403) return { kind: "denied", status, detail: `HTTP ${status}${body?.code ? ` ${body.code}` : ""}`, body };
  if (status === 404 && parsed && body?.code === "PGRST205") return { kind: "missing", status, detail: "table not in the API schema" };
  if (status >= 200 && status < 300) {
    if (!parsed) return { kind: "invalid", status, detail: `HTTP ${status}, the answer is not JSON` };
    if (Array.isArray(body)) return body.length ? { kind: "rows", status, detail: `HTTP ${status}, ${body.length} row(s)`, body } : { kind: "empty", status, detail: `HTTP ${status}, empty list`, body };
    return { kind: "ok", status, detail: `HTTP ${status}`, body };
  }
  return { kind: "other", status, detail: `unexpected HTTP ${status}` };
}

// `extra` is an optional PostgREST filter such as "&is_active=eq.false".
const select = (table, extra = "") => call(`/rest/v1/${table}?select=id&limit=1${extra}`);

const INCONCLUSIVE = { server_error: 1, invalid: 1, network: 1, other: 1 };

// Public data that must be readable.
function expectReadable(name, p) {
  if (p.kind === "rows") return report(name, "PASS", p.detail);
  if (p.kind === "empty") return report(name, "UNKNOWN", `${p.detail}: nothing to read, so public read is not shown`);
  if (p.kind === "denied" || p.kind === "missing") return report(name, "FAIL", p.detail);
  return report(name, "UNKNOWN", p.detail);
}

// Rows that must NOT be visible to anon, where "0 rows" is the protection working (a policy filters them).
function expectInvisible(name, p) {
  if (p.kind === "rows") return report(name, "FAIL", p.detail);
  if (p.kind === "empty" || p.kind === "denied" || p.kind === "missing") return report(name, "PASS", p.kind === "empty" ? `${p.detail} visible to anonymous` : p.detail);
  return report(name, "UNKNOWN", p.detail);
}

// Private tables: the lock-down answers with an explicit denial. Anything else that is not a leak is unproven.
function expectDenied(name, p) {
  if (p.kind === "denied" || p.kind === "missing") return report(name, "PASS", p.detail);
  if (p.kind === "rows") return report(name, "FAIL", p.detail);
  if (p.kind === "empty") return report(name, "UNKNOWN", `${p.detail}: an empty table and a filtering policy look the same; the lock-down (migration 28) answers HTTP 401/403`);
  return report(name, "UNKNOWN", p.detail);
}

// 1) public catalog is readable
expectReadable("anon can read products", await select("products"));
expectReadable("anon can read categories", await select("categories"));

// 2) archived products are not public
expectInvisible("anon CANNOT see archived (inactive) Health products", await select("products", "&is_active=eq.false"));
expectInvisible("anon CANNOT see archived (inactive) Beauty products", await select("beauty_products", "&is_active=eq.false"));

// inactive categories and brands are not public either (migration 31)
for (const [table, label] of [["categories", "Health categories"], ["beauty_categories", "Beauty categories"], ["beauty_brands", "Beauty brands"]]) {
  expectInvisible(`anon CANNOT see inactive ${label}`, await select(table, "&is_active=eq.false"));
}

// 3) customer data and operator logs are private
for (const table of ["quote_requests", "beauty_quote_requests", "contact_inquiries", "import_logs", "beauty_import_logs", "operator_audit_log", "operator_sessions", "operator_totp_state", "operator_recovery_used"]) {
  expectDenied(`anon CANNOT read ${table}`, await select(table));
}

// 4) Supabase Auth signup must be closed
{
  const p = await call("/auth/v1/settings");
  if (p.kind !== "ok" || !p.body || typeof p.body !== "object") {
    report("Supabase Auth signup is disabled", "UNKNOWN", `could not read /auth/v1/settings (${p.detail})`);
  } else {
    const s = p.body;
    report("Supabase Auth signup is disabled (disable_signup = true)", s.disable_signup === true ? "PASS" : "FAIL", `disable_signup=${s.disable_signup}`);
    report("Phone auto-confirm is off", s.phone_autoconfirm !== true ? "PASS" : "FAIL", `phone_autoconfirm=${s.phone_autoconfirm}`);
  }
}

// 5) optional write probe
if (doInsertTest) {
  for (const table of ["quote_requests", "beauty_quote_requests"]) {
    const name = `anon CANNOT insert ${table}`;
    let res = null;
    try {
      res = await fetch(`${url}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ name: "__rls_check_delete_me__", preferred_contact: "whatsapp" }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      report(name, "UNKNOWN", "could not reach the API");
      continue;
    }
    if (res.status === 401 || res.status === 403) report(name, "PASS", `HTTP ${res.status}`);
    else if (res.status === 201 || res.status === 204) {   // what PostgREST answers to a stored row; a 200 page is a gateway, not a write
      report(name, "FAIL", `HTTP ${res.status}`);
      console.log(`  ⚠ ${table} still accepts anonymous inserts: apply migrations 27/28, then`);
      console.log(`    DELETE FROM ${table} WHERE name = '__rls_check_delete_me__';`);
    } else {
      // 5xx, 400 (a constraint was reached), 404, ...: not an explicit permission denial, so not proof.
      report(name, "UNKNOWN", `HTTP ${res.status}: not an explicit denial (401/403)`);
    }
  }
} else {
  console.log("• SKIP  anon insert probe (writes a test row) — rerun with --insert-test");
}

console.log(`\n${counts.PASS} passed, ${counts.FAIL} failed, ${counts.UNKNOWN} unknown.`);
if (counts.FAIL) process.exit(1);
if (counts.UNKNOWN) {
  console.log("Result: inconclusive. At least one answer proves nothing (server error, unreachable API, empty or unexpected response). Fix that and run again; this is NOT a pass.");
  process.exit(3);
}
process.exit(0);
