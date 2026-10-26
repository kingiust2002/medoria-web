// A database or schema-cache OUTAGE is not "the table is missing" (reproduced 2026-10-26).
// isMissingTable() matched the words "schema cache" under any code, so PostgREST's PGRST002 ("Could not query the
// database for the schema cache. Retrying.") was read as "migration 30 not applied yet": the session check was skipped
// and every signed cookie opened the panel. Only a REAL missing table keeps the pre-migration behaviour; any other
// failure must refuse. These run the real functions of lib/operator/security.js against a stand-in database client.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isMissingTable, sessionStatus, registerSession, revokeSession, revokeSessions, writeAudit, verifySecondFactor,
  totpAt, stepOf, clearSessionCache,
} from "../lib/operator/security.js";
import { deleteQuoteGuarded, deleteQuotesGuarded } from "../lib/operator/quoteDelete.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const OUTAGES = {
  "PGRST002 schema cache": { code: "PGRST002", message: "Could not query the database for the schema cache. Retrying." },
  "PGRST002 without code": { message: "Could not query the database for the schema cache. Retrying." },
  "PGRST000 connection": { code: "PGRST000", message: "Could not connect with the database. Error: connection refused" },
  "PGRST001 internal": { code: "PGRST001", message: "Internal connection error" },
  "network failure": { message: "TypeError: fetch failed" },
  "timeout": { message: "The operation was aborted due to timeout" },
  "permission denied": { code: "42501", message: "permission denied for table operator_sessions" },
  "unknown": { code: "XX000", message: "boom" },
};
const MISSING = {
  "undefined table": { code: "42P01", message: 'relation "public.operator_sessions" does not exist' },
  "not in the schema cache": { code: "PGRST205", message: "Could not find the table 'public.operator_sessions' in the schema cache" },
  "message only": { message: "Could not find the table 'public.operator_sessions' in the schema cache" },
};

// A client whose every query ends in `{ data, error }`, whatever is chained.
function clientWith(error, data = null, log = []) {
  const chain = (table, op) => {
    const c = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject);
        return (...args) => { log.push([table, op, String(prop), args]); return c; };
      },
      apply() { return c; },
    });
    return c;
  };
  return { from: (table) => ({ select: (...a) => chain(table, "select"), insert: (...a) => chain(table, "insert"), update: (...a) => chain(table, "update"), delete: (...a) => chain(table, "delete") }) };
}

test("isMissingTable: only a table that really is not there", () => {
  for (const [name, err] of Object.entries(MISSING)) assert.equal(isMissingTable(err), true, name);
  for (const [name, err] of Object.entries(OUTAGES)) assert.equal(isMissingTable(err), false, `${name} is an outage, not a missing table`);
  assert.equal(isMissingTable(null), false);
  assert.equal(isMissingTable(undefined), false);
  assert.equal(isMissingTable({}), false);
});

const SID = "0123456789abcdef01234567";

test("sessionStatus: an outage rejects the session (invalid); a missing registry keeps the legacy behaviour", async () => {
  for (const [name, err] of Object.entries(OUTAGES)) {
    clearSessionCache();
    assert.equal(await sessionStatus(clientWith(err), { panel: "health", sid: SID }), "invalid", `signed session during: ${name}`);
    assert.equal(await sessionStatus(clientWith(err), { panel: "beauty", sid: SID }), "invalid", `beauty session during: ${name}`);
    assert.equal(await sessionStatus(clientWith(err), { panel: "health", sid: undefined }), "invalid", `cookie without a sid during: ${name}`);
    assert.equal(await sessionStatus(clientWith(err), { panel: "health", sid: "not-a-sid" }), "invalid", `malformed sid during: ${name}`);
  }
  for (const [name, err] of Object.entries(MISSING)) {
    clearSessionCache();
    assert.equal(await sessionStatus(clientWith(err), { panel: "health", sid: SID }), "unavailable", `legacy: ${name}`);
    assert.equal(await sessionStatus(clientWith(err), { panel: "health", sid: undefined }), "unavailable", `legacy without sid: ${name}`);
  }
  clearSessionCache();
  const future = new Date(Date.now() + 3600e3).toISOString();
  assert.equal(await sessionStatus(clientWith(null, [{ sid: SID, revoked_at: null, expires_at: future }]), { panel: "health", sid: SID }), "valid");
  clearSessionCache();
  assert.equal(await sessionStatus(clientWith(null, [{ sid: SID, revoked_at: "2026-10-26T00:00:00Z", expires_at: future }]), { panel: "health", sid: SID }), "invalid", "revoked");
  clearSessionCache();
  assert.equal(await sessionStatus(clientWith(null, []), { panel: "health", sid: SID }), "invalid", "unknown session");
});

test("registerSession (login): an outage refuses the login; a missing table still allows it", async () => {
  for (const [name, err] of Object.entries(OUTAGES)) {
    const r = await registerSession(clientWith(err), { panel: "health", sid: SID, ttlMs: 1000, ip: "1.2.3.4", secret: "s" });
    assert.equal(r.ok, false, name);
  }
  for (const [name, err] of Object.entries(MISSING)) {
    const r = await registerSession(clientWith(err), { panel: "health", sid: SID, ttlMs: 1000, ip: "1.2.3.4", secret: "s" });
    assert.equal(r.ok, true, name);
    assert.equal(r.unavailable, true);
  }
});

test("revokeSession / revokeSessions: an outage is a FAILURE (ok:false), never a success", async () => {
  for (const [name, err] of Object.entries(OUTAGES)) {
    assert.equal((await revokeSession(clientWith(err), { panel: "health", sid: SID })).ok, false, `revokeSession during ${name}`);
    assert.equal((await revokeSessions(clientWith(err), { panel: "health" })).ok, false, `revokeSessions during ${name}`);
  }
  for (const [name, err] of Object.entries(MISSING)) {
    assert.equal((await revokeSession(clientWith(err), { panel: "health", sid: SID })).ok, true, `legacy: ${name}`);
  }
  assert.deepEqual(await revokeSession(clientWith(null, [{ sid: SID }]), { panel: "health", sid: SID }), { ok: true, count: 1 });
});

test("writeAudit: an outage is a failure, not 'the log table does not exist yet'", async () => {
  for (const [name, err] of Object.entries(OUTAGES)) {
    const r = await writeAudit(clientWith(err), { panel: "health", action: "quote.delete", entity: "quote_requests", ids: [1] });
    assert.equal(r.ok, false, name);
    assert.ok(!r.unavailable, `${name} must not be reported as unavailable (= table missing)`);
  }
  for (const [name, err] of Object.entries(MISSING)) {
    const r = await writeAudit(clientWith(err), { panel: "health", action: "quote.delete" });
    assert.deepEqual([r.ok, r.unavailable], [false, true], name);
  }
});

test("a DELETE is refused while the log is in an outage, and still allowed when the log table does not exist yet", async () => {
  for (const [name, err] of Object.entries(OUTAGES)) {
    const log = [];
    const admin = clientWith(null, [{ id: 7 }], log);
    const audit = (entry) => writeAudit(clientWith(err), { panel: "health", ...entry });
    const one = await deleteQuoteGuarded({ getSession: async () => ({ role: "admin" }), getAdminClient: () => admin, table: "quote_requests", id: 7, audit });
    assert.equal(one.ok, false, name);
    const many = await deleteQuotesGuarded({ getSession: async () => ({ role: "admin" }), getAdminClient: () => admin, table: "quote_requests", ids: [7, 8], audit });
    assert.equal(many.ok, false, name);
    assert.ok(!log.some(([, op]) => op === "delete"), `${name}: a delete reached the table although the log could not be written`);
  }
  const log = [];
  const admin = clientWith(null, [{ id: 7 }], log);
  const audit = (entry) => writeAudit(clientWith(MISSING["undefined table"]), { panel: "health", ...entry });
  const ok = await deleteQuoteGuarded({ getSession: async () => ({ role: "admin" }), getAdminClient: () => admin, table: "quote_requests", id: 7, audit });
  assert.equal(ok.ok, true, "log table not created yet: previous behaviour");
});

test("second factor: an outage in the replay memory refuses the code (fail closed); a missing table does not", async () => {
  const secret = "JBSWY3DPEHPK3PXP";
  const nowMs = Date.now();
  const code = totpAt(secret, stepOf(nowMs));
  for (const [name, err] of Object.entries(OUTAGES)) {
    const r = await verifySecondFactor({ admin: clientWith(err), panel: "health", secret, recoveryHashes: [], code, recovery: "", nowMs });
    assert.equal(r.ok, false, `a valid code during: ${name}`);
  }
  const legacy = await verifySecondFactor({ admin: clientWith(MISSING["undefined table"]), panel: "health", secret, recoveryHashes: [], code, recovery: "", nowMs });
  assert.equal(legacy.ok, true, "no replay table yet: accepted like before");
});

test("both panels' getSession reject 'invalid' and nothing else lets an unchecked session through", () => {
  for (const [f, panel] of [["lib/operator/auth.js", "health"], ["lib/beauty/operator/auth.js", "beauty"]]) {
    const s = read(f);
    assert.match(s, new RegExp(`sessionStatus\\(getAdminClient\\(\\), \\{ panel: "${panel}", sid: payload\\.sid \\}\\)`), f);
    assert.match(s, /if \(status === "invalid"\) return null;/, f);
  }
  const sec = read("lib/operator/security.js");
  assert.ok(!/schema cache\|/.test(sec) && !/\|schema cache/.test(sec), "the classifier must not match the bare words 'schema cache'");
});
