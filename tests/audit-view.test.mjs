// Reading the activity log: filters are cleaned, paged with one extra row to know about the next page, names come from the accounts,
// the CSV carries only technical columns and is safe against spreadsheet formulas.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanFilters, readAudit, auditCsv, auditPeople } from "../lib/operator/auditView.js";
import { sanitizeChange, writeAudit } from "../lib/operator/security.js";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const log = (n, o = {}) => ({ id: n, at: `2026-10-${String(n % 28 + 1).padStart(2, "0")}T10:00:00.000Z`, panel: "health", action: "product.update", user_id: U1, result: "success", ...o });
const setup = (rows) => createMemoryAdmin({
  operator_audit_log: rows,
  operator_users: [{ id: U1, display_name: "Alice", houses: ["health"] }, { id: U2, display_name: "=cmd|calc", houses: ["health", "beauty"] }, { id: "00000000-0000-4000-8000-000000000003", display_name: "Beauty Only", houses: ["beauty"] }],
});

test("filters are cleaned: only known shapes survive", () => {
  assert.deepEqual(cleanFilters({ who: "not-a-uuid", result: "weird", action: "a b", from: "yesterday", page: "-3" }), { page: 1 });
  assert.deepEqual(cleanFilters({ who: U1, result: "rejected", action: "product.update", from: "2026-10-01", to: "2026-10-31", page: "2" }), { who: U1, result: "rejected", action: "product.update", from: "2026-10-01", to: "2026-10-31", page: 2 });
});

test("paging, filters, names", async () => {
  const rows = Array.from({ length: 120 }, (_, i) => log(i + 1, i % 3 === 0 ? { user_id: U2, result: "rejected", action: "access.denied" } : {}));
  rows.push(log(500, { panel: "beauty" }));
  const db = setup(rows);
  const p1 = await readAudit(db, { panel: "health", filters: {}, pageSize: 50 });
  assert.equal(p1.rows.length, 50);
  assert.equal(p1.hasMore, true);
  assert.equal(p1.rows[0].id, 120, "newest first");
  assert.ok(!p1.rows.some((r) => r.panel === "beauty"), "one house's log only");
  assert.equal(p1.names[U1], "Alice");
  const p3 = await readAudit(db, { panel: "health", filters: { page: 3 }, pageSize: 50 });
  assert.equal(p3.rows.length, 20);
  assert.equal(p3.hasMore, false);
  const who = await readAudit(db, { panel: "health", filters: { who: U2 }, pageSize: 50 });
  assert.ok(who.rows.length > 0 && who.rows.every((r) => r.user_id === U2));
  const res = await readAudit(db, { panel: "health", filters: { result: "rejected" }, pageSize: 50 });
  assert.ok(res.rows.every((r) => r.result === "rejected"));
  const out = setup([]); out.fail = () => ({ code: "PGRST002", message: "x" });
  assert.equal((await readAudit(out, { panel: "health", filters: {} })).ok, false, "an outage is not an empty log");
});

test("people to choose: only those of this house", async () => {
  const names = (await auditPeople(setup([]), "health")).map((p) => p.name).sort();
  assert.deepEqual(names, ["=cmd|calc", "Alice"]);
});

test("CSV: header, names, and every cell safe against formulas", async () => {
  const db = setup([log(1, { user_id: U2, before: { price: 10 }, after: { price: 12 } })]);
  const r = await auditCsv(db, { panel: "health", filters: {} });
  assert.equal(r.ok, true);
  assert.match(r.csv, /^﻿time,action,result,person,target person/);
  assert.ok(r.csv.includes("'=cmd|calc"), "a name that looks like a formula is neutralised");
  assert.ok(r.csv.includes('""price"":12') || r.csv.includes('"{""price"":12}"'));
  assert.equal(r.count, 1);
});

test("what may be written as before/after: catalogue fields only, short, never customer data", () => {
  assert.deepEqual(sanitizeChange({ price: 12, name_en: "Gloves", is_active: false, tags: ["a", "b"] }), { price: 12, name_en: "Gloves", is_active: false, tags: ["a", "b"] });
  const s = sanitizeChange({ phone: "+99290000000", customer_name: "x", email: "a@b.c", password_hash: "h", message: "hi", name_en: "ok", "Bad Key": 1 });
  assert.deepEqual(s, { name_en: "ok" });
  assert.equal(sanitizeChange({ description_en: "x".repeat(5000), a: "y".repeat(300) }) === null || JSON.stringify(sanitizeChange({ a: "y".repeat(300) })).length < 400, true);
  assert.equal(sanitizeChange(null), null);
  assert.equal(sanitizeChange([1, 2]), null);
});

test("writeAudit sends the new columns only when there is something to say", async () => {
  const sent = [];
  const admin = { from: () => ({ insert: async (row) => { sent.push(row); return { error: null }; } }) };
  await writeAudit(admin, { panel: "health", action: "auth.login" });
  assert.deepEqual(Object.keys(sent[0]).filter((k) => ["user_id", "target_user_id", "result", "request_id", "before", "after"].includes(k)), [], "an old database never sees the new columns");
  await writeAudit(admin, { panel: "health", action: "product.update", userId: U1, targetUserId: U2, result: "success", requestId: "r1", before: { price: 1 }, after: { price: 2 } });
  assert.deepEqual([sent[1].user_id, sent[1].target_user_id, sent[1].result, sent[1].request_id, sent[1].before, sent[1].after], [U1, U2, "success", "r1", { price: 1 }, { price: 2 }]);
  await writeAudit(admin, { panel: "health", action: "x", userId: "not-a-uuid", result: "maybe" });
  assert.ok(!("user_id" in sent[2]) && !("result" in sent[2]), "malformed values are dropped, not stored");
});
