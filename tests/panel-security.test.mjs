// Panel security building blocks (lib/operator/security.js), run against the stateful fake
// database through the real supabase-js client, plus static guards on migration 30 and on the
// wiring (every changing action is logged, both panels keep their own rows).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createFakeDb, SERVICE_KEY } from "./e2e/fakeDb.mjs";
import { seed } from "./e2e/seed.mjs";
import * as sec from "../lib/operator/security.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// a free local port (the fake database needs a fixed one)
const freePort = () => new Promise((resolve) => { const srv = net.createServer().listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => resolve(p)); }); });

async function setup() {
  const port = await freePort();
  const db = createFakeDb(seed);
  await db.start(port);
  const admin = createClient(`http://127.0.0.1:${port}`, SERVICE_KEY, { auth: { persistSession: false } });
  sec.clearSessionCache();
  return { db, admin, port, close: () => db.stop() };
}

// A "database" whose operator tables do not exist yet (migration 30 not applied).
async function missingTablesDb() {
  const server = http.createServer((req, res) => { res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ code: "PGRST205", message: "Could not find the table in the schema cache" })); });
  const port = await freePort();
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { admin: createClient(`http://127.0.0.1:${port}`, SERVICE_KEY, { auth: { persistSession: false } }), close: () => new Promise((r) => server.close(r)) };
}

// ───────────────────────────────────────────────────────────────────────── TOTP
test("TOTP matches the RFC 6238 test vectors (SHA-1, 6 digits)", () => {
  const key = Buffer.from("12345678901234567890");
  const vectors = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]];
  for (const [t, code] of vectors) assert.equal(sec.hotp(key, Math.floor(t / 30)), code, `T=${t}`);
  const b32 = sec.base32Encode(key);
  assert.equal(b32, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(sec.base32Decode(b32), key);
  assert.equal(sec.totpAt(b32, 1), "287082");
});

test("matchTotp accepts one step of clock drift either way, nothing else, and bad input never matches", () => {
  const secret = sec.generateTotpSecret();
  const now = 1_700_000_000_000;
  const step = sec.stepOf(now);
  assert.equal(sec.matchTotp({ secret, code: sec.totpAt(secret, step), nowMs: now }), step);
  assert.equal(sec.matchTotp({ secret, code: sec.totpAt(secret, step - 1), nowMs: now }), step - 1);
  assert.equal(sec.matchTotp({ secret, code: sec.totpAt(secret, step + 1), nowMs: now }), step + 1);
  assert.equal(sec.matchTotp({ secret, code: sec.totpAt(secret, step + 2), nowMs: now }), null);
  assert.equal(sec.matchTotp({ secret, code: sec.totpAt(secret, step - 2), nowMs: now }), null);
  for (const bad of ["", "12345", "1234567", "abcdef", null, undefined, "12 34 5", "٠٠٠٠٠٠"]) assert.equal(sec.matchTotp({ secret, code: bad, nowMs: now }), null, `accepted ${JSON.stringify(bad)}`);
  assert.equal(sec.matchTotp({ secret: "not base32!!", code: "123456", nowMs: now }), null);
  // a code typed with a space in the middle is the same code
  const c = sec.totpAt(secret, step);
  assert.equal(sec.matchTotp({ secret, code: `${c.slice(0, 3)} ${c.slice(3)}`, nowMs: now }), step);
});

test("generated secrets and recovery codes have the promised shape; only hashes are stored", () => {
  const s = sec.generateTotpSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
  assert.notEqual(s, sec.generateTotpSecret());
  const codes = sec.generateRecoveryCodes(8);
  assert.equal(new Set(codes.map((c) => c.code)).size, 8);
  for (const c of codes) {
    assert.match(c.code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    assert.match(c.hash, /^[0-9a-f]{64}$/);
    assert.equal(sec.hashRecovery(c.code.toLowerCase().replace(/-/g, " ")), c.hash, "case, dashes and spaces must not matter");
    assert.ok(!c.hash.includes(c.code.replace(/-/g, "").toLowerCase()));
  }
  assert.deepEqual(sec.parseRecoveryHashes(`${codes[0].hash}, ${codes[1].hash}\n,junk,${"g".repeat(64)}`), [codes[0].hash, codes[1].hash]);
  assert.match(sec.otpauthUri({ secret: s, account: "a b", issuer: "Medoria Health" }), /^otpauth:\/\/totp\/Medoria%20Health%3Aa%20b\?secret=[A-Z2-7]{32}&issuer=Medoria%20Health&algorithm=SHA1&digits=6&period=30$/);
});

// ───────────────────────────────────────────────────────────── second factor + DB
test("a TOTP code works once (replay refused), the next time step works", async () => {
  const { admin, close } = await setup();
  try {
    const secret = sec.generateTotpSecret();
    const now = 1_700_000_000_000;
    const step = sec.stepOf(now);
    const args = (code, nowMs = now) => ({ admin, panel: "health", secret, code, nowMs });
    const first = await sec.verifySecondFactor(args(sec.totpAt(secret, step)));
    assert.deepEqual(first, { ok: true, method: "totp" });
    const replay = await sec.verifySecondFactor(args(sec.totpAt(secret, step)));
    assert.deepEqual(replay, { ok: false, reason: "replay" });
    const older = await sec.verifySecondFactor(args(sec.totpAt(secret, step - 1)));
    assert.deepEqual(older, { ok: false, reason: "replay" }, "an older step than the last accepted must not work");
    const next = await sec.verifySecondFactor(args(sec.totpAt(secret, step + 1), now + 30_000));
    assert.equal(next.ok, true);
    assert.deepEqual(await sec.verifySecondFactor(args("000000")), { ok: false, reason: "bad_code" });
  } finally { await close(); }
});

test("the two panels keep separate second-factor state", async () => {
  const { admin, close } = await setup();
  try {
    const now = 1_700_000_000_000, step = sec.stepOf(now);
    const secret = sec.generateTotpSecret();
    const code = sec.totpAt(secret, step);
    assert.equal((await sec.verifySecondFactor({ admin, panel: "health", secret, code, nowMs: now })).ok, true);
    assert.equal((await sec.verifySecondFactor({ admin, panel: "beauty", secret, code, nowMs: now })).ok, true, "Health's used code must not block Beauty");
    assert.equal((await sec.verifySecondFactor({ admin, panel: "health", secret, code, nowMs: now })).reason, "replay");
  } finally { await close(); }
});

test("recovery codes work exactly once, per panel; unknown codes are refused", async () => {
  const { admin, close } = await setup();
  try {
    const codes = sec.generateRecoveryCodes(3);
    const hashes = codes.map((c) => c.hash);
    const base = { admin, panel: "health", recoveryHashes: hashes };
    assert.deepEqual(await sec.verifySecondFactor({ ...base, recovery: codes[0].code }), { ok: true, method: "recovery" });
    assert.deepEqual(await sec.verifySecondFactor({ ...base, recovery: codes[0].code }), { ok: false, reason: "recovery_used" });
    assert.deepEqual(await sec.verifySecondFactor({ ...base, recovery: "AAAA-AAAA-AAAA" }), { ok: false, reason: "bad_code" });
    assert.equal((await sec.verifySecondFactor({ ...base, recovery: codes[1].code.toLowerCase() })).ok, true);
    // the same code string configured for the other panel is a different row
    assert.equal((await sec.verifySecondFactor({ admin, panel: "beauty", recoveryHashes: hashes, recovery: codes[0].code })).ok, true);
  } finally { await close(); }
});

test("without the migration: TOTP still works (no replay memory), recovery codes are refused", async () => {
  const m = await missingTablesDb();
  try {
    const secret = sec.generateTotpSecret();
    const now = 1_700_000_000_000;
    assert.equal((await sec.verifySecondFactor({ admin: m.admin, panel: "health", secret, code: sec.totpAt(secret, sec.stepOf(now)), nowMs: now })).ok, true);
    const c = sec.generateRecoveryCodes(1)[0];
    const r = await sec.verifySecondFactor({ admin: m.admin, panel: "health", recoveryHashes: [c.hash], recovery: c.code });
    assert.deepEqual(r, { ok: false, reason: "recovery_unavailable" });
  } finally { await m.close(); }
});

// ─────────────────────────────────────────────────────────────── session registry
test("a registered session is valid, logout/revocation ends it at once, other panel and other sessions are untouched", async () => {
  const { admin, close } = await setup();
  try {
    const mk = async (panel) => { const sid = sec.newSessionId(); assert.deepEqual(await sec.registerSession(admin, { panel, sid, ttlMs: 3600e3, ip: "203.0.113.9", secret: "s" }), { ok: true }); return sid; };
    const [a, b] = [await mk("health"), await mk("health")];
    const beauty = await mk("beauty");
    for (const [panel, sid] of [["health", a], ["health", b], ["beauty", beauty]]) assert.equal(await sec.sessionStatus(admin, { panel, sid }), "valid");
    assert.equal(await sec.sessionStatus(admin, { panel: "beauty", sid: a }), "invalid", "a Health session id must not be valid for Beauty");

    assert.deepEqual(await sec.revokeSession(admin, { panel: "health", sid: a }), { ok: true, count: 1 });
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid: a }), "invalid", "revocation must beat the cache");
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid: b }), "valid");

    const all = await sec.revokeSessions(admin, { panel: "health" });
    assert.equal(all.count, 1);
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid: b }), "invalid");
    assert.equal(await sec.sessionStatus(admin, { panel: "beauty", sid: beauty }), "valid", "revoking Health must not touch Beauty");
  } finally { await close(); }
});

test("revokeSessions can keep the current session; the list shows only live sessions and no raw IP", async () => {
  const { admin, close } = await setup();
  try {
    const sids = [];
    for (let i = 0; i < 3; i++) { const sid = sec.newSessionId(); sids.push(sid); await sec.registerSession(admin, { panel: "health", sid, ttlMs: 3600e3, ip: "198.51.100.7", secret: "s" }); }
    const r = await sec.revokeSessions(admin, { panel: "health", exceptSid: sids[0] });
    assert.equal(r.count, 2);
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid: sids[0] }), "valid");
    const list = await sec.listSessions(admin, { panel: "health" });
    assert.deepEqual(list.map((s) => s.sid), [sids[0]]);
    assert.ok(!JSON.stringify(await sec.listSessions(admin, { panel: "health" })).includes("198.51.100.7"), "a raw IP address was stored");
  } finally { await close(); }
});

test("expired sessions, unknown ids and tokens without a session id are invalid; the cache expires", async () => {
  const { admin, db, close } = await setup();
  try {
    const sid = sec.newSessionId();
    const t0 = 1_800_000_000_000;
    await sec.registerSession(admin, { panel: "health", sid, ttlMs: 1000, ip: "x", secret: "s", nowMs: t0 });
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid, nowMs: t0 + 500 }), "valid");
    sec.clearSessionCache();
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid, nowMs: t0 + 5000 }), "invalid", "expired");
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid: sec.newSessionId() }), "invalid", "unknown");
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid: undefined }), "invalid", "issued before the registry existed");
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid: "../etc" }), "invalid");

    // revocation done by someone else (e.g. another server process) is seen once the 20 s cache lapses
    const s2 = sec.newSessionId();
    await sec.registerSession(admin, { panel: "health", sid: s2, ttlMs: 3600e3, ip: "x", secret: "s", nowMs: t0 });
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid: s2, nowMs: t0 }), "valid");
    const row = db.state().operator_sessions.find((r) => r.sid === s2);
    await admin.from("operator_sessions").update({ revoked_at: new Date(t0).toISOString() }).eq("sid", s2);
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid: s2, nowMs: t0 + 5_000 }), "valid", "still cached");
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid: s2, nowMs: t0 + 25_000 }), "invalid", "cache lapsed");
    assert.ok(row);
  } finally { await close(); }
});

test("without the migration the registry steps aside (old behaviour); other database errors fail closed", async () => {
  const m = await missingTablesDb();
  try {
    assert.equal(await sec.sessionStatus(m.admin, { panel: "health", sid: sec.newSessionId() }), "unavailable");
    assert.equal(await sec.sessionStatus(m.admin, { panel: "health", sid: undefined }), "unavailable");
    assert.deepEqual(await sec.registerSession(m.admin, { panel: "health", sid: sec.newSessionId(), ttlMs: 1, ip: "x", secret: "s" }), { ok: true, unavailable: true });
    assert.equal((await sec.writeAudit(m.admin, { panel: "health", action: "x" })).unavailable, true);
  } finally { await m.close(); }
  // a database that answers with a real error: no session is trusted
  const broken = http.createServer((q, r) => { r.writeHead(500, { "content-type": "application/json" }); r.end(JSON.stringify({ code: "XX000", message: "boom" })); });
  const port = await freePort();
  await new Promise((r) => broken.listen(port, "127.0.0.1", r));
  try {
    const admin = createClient(`http://127.0.0.1:${port}`, SERVICE_KEY, { auth: { persistSession: false } });
    assert.equal(await sec.sessionStatus(admin, { panel: "health", sid: sec.newSessionId() }), "invalid");
    assert.deepEqual(await sec.registerSession(admin, { panel: "health", sid: sec.newSessionId(), ttlMs: 1, ip: "x", secret: "s" }), { ok: false });
    assert.deepEqual(await sec.writeAudit(admin, { panel: "health", action: "x" }), { ok: false });
    assert.equal(await sec.sessionStatus(null, { panel: "health", sid: "x" }), "unavailable", "no database client: legacy behaviour");
  } finally { await new Promise((r) => broken.close(r)); }
});

// ───────────────────────────────────────────────────────────────── activity log
test("the activity log keeps actions, tables, ids and counts, and drops anything that looks like personal data", async () => {
  const { admin, db, close } = await setup();
  try {
    const sid = sec.newSessionId();
    const r = await sec.writeAudit(admin, {
      panel: "beauty", action: "quote.delete", entity: "beauty_quote_requests", ids: [4, "5", -1, 1.5, "x", 6], sid, ip: "203.0.113.77", secret: "k",
      detail: {
        status: "archived", fields: ["price", "name_en", "Bad Field", "x".repeat(60)],
        name: "Alice Customer", phone: "+992900123456", message: "full customer message", email: "a@b.com",
        price: "alice@example.com", reason: "call +992900123456 now", method: "password+totp", rows: 12,
      },
    });
    assert.equal(r.ok, true);
    const row = db.state().operator_audit_log[0];
    assert.deepEqual(row.entity_ids, [4, 5, 6]);
    assert.equal(row.count, 3);
    assert.equal(row.session_id, sid);
    assert.match(row.ip_hash, /^[0-9a-f]{12}$/);
    assert.deepEqual(row.detail, { status: "archived", fields: ["price", "name_en"], method: "password+totp", rows: 12 });
    const text = JSON.stringify(row);
    for (const leak of ["Alice", "992900123456", "customer message", "a@b.com", "alice@example.com", "203.0.113.77"]) assert.ok(!text.includes(leak), `the log row contains ${leak}`);
    assert.equal(sec.sanitizeDetail({ nothing: "allowed" }), null);
    assert.equal(sec.sanitizeDetail(null), null);
    assert.equal((await sec.writeAudit(admin, { panel: "health", action: "a".repeat(200) })).ok, true);
    assert.equal(db.state().operator_audit_log[1].action.length, 60);
  } finally { await close(); }
});

test("the IP hint is a keyed hash: same address and key give the same value, other key or address do not", () => {
  const a = sec.ipHash("203.0.113.5", "k1");
  assert.equal(a, sec.ipHash("203.0.113.5", "k1"));
  assert.notEqual(a, sec.ipHash("203.0.113.5", "k2"));
  assert.notEqual(a, sec.ipHash("203.0.113.6", "k1"));
  assert.match(a, /^[0-9a-f]{12}$/);
});

// ───────────────────────────────────────────────────────────────── static guards
test("migration 30: four private tables, row-level security on, no policy, service role only, self-checking", () => {
  const sql = read("migrations/30_operator_security.sql");
  const code = sql.replace(/--.*$/gm, "");
  const tables = ["operator_audit_log", "operator_sessions", "operator_totp_state", "operator_recovery_used"];
  for (const t of tables) {
    assert.match(code, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}\\b`), `${t} is not created`);
    assert.ok(code.includes(`'${t}'`), `${t} is not in the privacy loop`);
  }
  assert.match(code, /ENABLE ROW LEVEL SECURITY/);
  assert.match(code, /REVOKE ALL ON public\.%I FROM PUBLIC, anon, authenticated/);
  assert.match(code, /GRANT ALL ON public\.%I TO service_role/);
  assert.ok(!/CREATE POLICY/i.test(code), "a private table must have no policy");
  assert.match(code, /^BEGIN;/m);
  assert.match(code, /^COMMIT;/m);
  assert.ok(!/\b(DROP TABLE|DELETE FROM|TRUNCATE|UPDATE\s+\w+\s+SET)\b/i.test(code), "migration 30 must not touch existing data");
  assert.match(code, /panel\s+TEXT NOT NULL CHECK \(panel IN \('health', 'beauty'\)\)/);
  assert.match(read("migrations/README.md"), /\| 30 \| `30_operator_security\.sql`/);
  // every table the code reads or writes is one this migration creates, and is also in the live RLS probe
  const used = new Set([...read("lib/operator/security.js").matchAll(/\.from\("(operator_[a-z_]+)"\)/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), [...tables].sort());
  for (const t of tables) assert.ok(read("scripts/check-rls.mjs").includes(`"${t}"`), `check-rls does not probe ${t}`);
});

test("every changing server action writes to the activity log; the few exceptions are named and explained", () => {
  const files = ["lib/operator/actions.js", "lib/beauty/operator/actions.js", "lib/operator/categoryTreeActions.js", "lib/operator/importActions.js", "lib/beauty/operator/importActions.js"];
  // read-only, or storing a file only (the saved row is logged when the form is saved), or logged elsewhere
  const exempt = new Set([
    "translateProductFields", "uploadProductImage", "uploadBrandLogo", "uploadCategoryImage",            // no data row changes
    "parseSpreadsheet", "downloadTemplateXlsx", "dryRunProductRows", "checkSkusExist", "exportProductsCsv", // read-only
    "commitProductRows",                                                                                  // chunks: finalizeProductBatch logs the import once
    "deleteQuote", "deleteQuotes", "updateQuotesStatus",                                                  // logged inside quoteDelete.js via `audit`
    "assignQuote",                                                                                        // logged inside quoteOps.js via `audit` (quote.assign, never the typed name)
    "restoreProductVersion",                                                                             // logged inside productRestoreCore.js (product.restore, with before / after)
    "setQuoteFollowUp", "retryQuoteNotice", "exportQuotesCsv",                                            // logged inside quoteFollowUpCore.js via `audit` (quote.follow_up, quote.notice_retry, quotes.exported)
    "deleteProduct",                                                                                      // logged FIRST inside productDelete.js via `audit` (product.delete)
    "deleteCategorySafe", "deleteBrand", "deleteHealthCategorySafe",                                       // logged inside categoryDelete.js / destructiveApproval.js (attempt first, outcome after); asserted below
    "listBrandRoster",                                                                                    // read-only (the brand screen's roster and search)
    "submitImportForApproval",                                                                              // filing a request: logged by fileForApproval (approval.requested) and, when approved, by the approval log
    "bulkUpdateProducts", "bulkUpdateFilteredProducts", "updateFilteredQuotesStatus",                                            // "all filtered results" (N9): logged inside runBulk (product.bulk, kind filtered) / quoteDelete.js setQuotesStatusGuarded
    "saveVariant",                                                                                        // logged inside variantActions.js via `audit` (product.variant.create / .update); a request is logged by fileForApproval
  ]);
  const missing = [];
  let checked = 0;
  for (const f of files) {
    const s = read(f);
    for (const m of s.matchAll(/export async function (\w+)\([^)]*\) \{([\s\S]*?)\n\}\n/g)) {
      checked++;
      if (exempt.has(m[1])) continue;
      if (!/(\.audit\(|\.auditEntry\b|auditEvent\()/.test(m[2])) missing.push(`${f}:${m[1]}`);
    }
  }
  assert.ok(checked > 50, `expected the panel actions, found ${checked}`);
  assert.deepEqual(missing, [], "these actions change data without writing to the activity log");
  // the exempt quote helpers really do log
  const helper = read("lib/operator/quoteDelete.js");
  assert.match(helper, /action: "quote\.delete_attempt"/);
  assert.match(helper, /logAfter\(audit, \{ action: "quote\.status"/);
  assert.match(read("lib/operator/quoteOps.js"), /action: "quote\.assign"/);
  const fu = read("lib/operator/quoteFollowUpCore.js");
  assert.ok(read("lib/operator/productRestoreCore.js").includes('"product.restore"'), "reverting a product change is not logged");
  for (const a of ["quote.follow_up", "quote.notice_retry", "quotes.exported"]) assert.ok(fu.includes(`action: "${a}"`), `${a} is not logged`);
  assert.match(read("lib/operator/productDelete.js"), /action: "product\.delete_attempt"/);
  assert.match(read("lib/operator/importActions.js"), /action: "product\.import"/);
  for (const f of ["lib/operator/actions.js", "lib/beauty/operator/actions.js"]) assert.match(read(f).slice(read(f).indexOf("async function runBulk(")), /a\.audit\("product\.bulk"/, `${f}: the shared bulk runner logs every bulk change`);
  const variantSrc = read("lib/operator/variantActions.js");
  for (const a of ["product.variant.create", "product.variant.update"]) assert.ok(variantSrc.includes(`"${a}"`), `${a} is not logged`);
});

test("every irreversible action writes an ATTEMPT before it and a separate OUTCOME after it; a missing log is a refusal", () => {
  const order = (body, label) => {
    const att = body.indexOf("delete_attempt"), del = body.search(/\.delete\(\)/), ok = body.lastIndexOf("succeeded(");
    assert.ok(att > 0 && del > att, `${label}: the attempt must come before the delete`);
    assert.ok(ok > del, `${label}: the outcome must come after the delete`);
  };
  const helper = read("lib/operator/quoteDelete.js");
  for (const fn of ["deleteQuoteGuarded", "deleteQuotesGuarded"]) order(helper.match(new RegExp(`export async function ${fn}\\(([\\s\\S]*?)\\n\\}\\n`))[1], fn);
  const productBody = read("lib/operator/productDelete.js").match(/export async function deleteProductGuarded\(([\s\S]*?)\n\}\n/)[1];
  assert.ok(productBody.indexOf("product.delete_attempt") < productBody.indexOf(".delete()"), "deleteProductGuarded deletes before it logs the attempt");
  assert.ok(productBody.indexOf(".delete()") < productBody.lastIndexOf('action: "product.delete"'), "the outcome is written after the delete");
  // categories and brands are deleted by the shared cores (direct and approved deletions use the same code): the attempt comes first and
  // refuses when the log cannot be written, products are moved only after it, the outcome is written last
  const catCore = read("lib/operator/categoryDelete.js").match(/export async function runCategoryDelete\(([\s\S]*?)\n\}\n/)[1];
  order(catCore, "runCategoryDelete");
  assert.ok(catCore.includes("requireAttempt(") && catCore.indexOf("requireAttempt(") < catCore.search(/\.update\(/), "runCategoryDelete must write the attempt before it moves any product");
  const brandCore = read("lib/operator/destructiveApproval.js").match(/export async function runBrandDelete\(([\s\S]*?)\n\}\n/)[1];
  order(brandCore, "runBrandDelete");
  assert.ok(brandCore.includes("requireAttempt("), "runBrandDelete must refuse when the attempt cannot be written");
  for (const [f, fn, via] of [["lib/beauty/operator/actions.js", "deleteCategorySafe", "categoryDeleteFlow("], ["lib/beauty/operator/actions.js", "deleteBrand", "brandDeleteFlow("], ["lib/operator/categoryTreeActions.js", "deleteHealthCategorySafe", "categoryDeleteFlow("], ["lib/operator/importActions.js", "deleteCategorySafe", "categoryDeleteFlow("]]) {
    const body = read(f).match(new RegExp(`export async function ${fn}\\(([\\s\\S]*?)\\n\\}\\n`))[1];
    assert.ok(body.includes(via), `${f}:${fn} must delete through the shared flow`);
    assert.ok(!/\.delete\(\)/.test(body), `${f}:${fn} must not delete by itself`);
  }
  // nothing may still treat a missing log table as permission
  for (const f of ["lib/operator/quoteDelete.js", "lib/operator/productDelete.js", "lib/operator/categoryTreeActions.js", "lib/operator/importActions.js", "lib/beauty/operator/actions.js"]) {
    const src = read(f);
    assert.ok(!/logFirst|auditFirst|logged\.unavailable|r\.ok \|\| r\.unavailable/.test(src), `${f} still has the fail-open history helper`);
  }
});

test("login: every session is registered before its cookie is issued, each panel has its own configuration", () => {
  const flow = read("lib/operator/loginFlow.js");
  assert.ok(flow.indexOf("registerSession(") < flow.indexOf("signSession("), "the cookie must not be signed before the session is registered");
  assert.ok(flow.indexOf("verifySecondFactor(") > flow.indexOf("auth.verifyCredentials("), "the second factor is only asked after the password is right");
  assert.match(flow, /await revokeSession\(admin, \{ panel, sid: payload\.sid \}\)/);
  const health = read("app/api/operator/login/route.js"), beauty = read("app/api/beauty-operator/login/route.js");
  assert.match(health, /panel: "health", cookieName: OP_COOKIE, role: "admin"/);
  assert.match(beauty, /panel: "beauty", cookieName: BOP_COOKIE, role: "beauty-admin"/);
  assert.match(health, /OPERATOR_TOTP_SECRET/); assert.ok(!/BEAUTY_/.test(health.replace(/lib\/beauty/g, "")), "Health login must not read Beauty settings");
  assert.match(beauty, /BEAUTY_OPERATOR_TOTP_SECRET/);
  for (const f of ["app/api/operator/logout/route.js", "app/api/beauty-operator/logout/route.js"]) assert.match(read(f), /handleLogout/);
  // getSession checks the registry of its own panel
  assert.match(read("lib/operator/auth.js"), /sessionStatus\(admin, \{ panel: "health", sid: payload\.sid \}\)/);
  assert.match(read("lib/beauty/operator/auth.js"), /sessionStatus\(admin, \{ panel: "beauty", sid: payload\.sid \}\)/);
  // a personal-account login registers its session (with the person) before the cookie is signed, and asks the second factor only after the password
  const personal = flow.slice(flow.indexOf("async function handleUserLogin"));
  assert.ok(personal.indexOf("registerSession(") < personal.indexOf("signSession("), "personal login: register before sign");
  assert.ok(personal.indexOf("verifyLogin(") < personal.indexOf("consumeRecoveryCode(") && personal.indexOf("verifyLogin(") < personal.indexOf("acceptTotpStep("), "personal login: password before second factor");
  // the revoke actions are bound to their own panel too
  assert.ok(!/panel: "beauty"/.test(read("lib/operator/securityActions.js")));
  assert.ok(!/panel: "health"/.test(read("lib/beauty/operator/securityActions.js")));
});

test("the env preflight refuses half-configured two-step login and never prints the values", () => {
  const s = read("scripts/check-self-host-env.mjs");
  assert.match(s, /OPERATOR_TOTP_SECRET is not a valid base32 secret|_TOTP_SECRET is not a valid base32 secret/);
  assert.match(s, /no way in if the phone is lost/);
  assert.ok(!/fail\(`[^`]*\$\{secret\}/.test(s) && !/fail\(`[^`]*\$\{hashes\}/.test(s), "the preflight must not print secret values");
});

test("the test helper's credentials fingerprint equals the one the panel puts in every session", async () => {
  const { credentialsVersion } = await import("../lib/operator/auth-version.mjs");
  const env = { OPERATOR_USERNAME: "u", OPERATOR_PASSWORD_HASH: "scrypt:1:2:3:aa:bb" };
  const { createHash } = await import("node:crypto");
  assert.equal(credentialsVersion(env), createHash("sha256").update("u\u0000scrypt:1:2:3:aa:bb").digest("hex").slice(0, 16));
  // and it is the same formula as in auth.js (a change there must change the helper too)
  assert.ok(read("lib/operator/auth.js").includes('`${process.env.OPERATOR_USERNAME || ""}\\u0000${process.env.OPERATOR_PASSWORD_HASH || ""}`'));
});
