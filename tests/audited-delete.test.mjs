// The history rule for every irreversible action (lib/operator/auditedDelete.js): attempt first, a missing log is a refusal,
// outcome after as a DIFFERENT entry. Quotes, categories and brands follow it like products (tests/product-delete.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { requireAttempt, writeEntry, makeOutcome, AUDIT_DELETE_MESSAGES as M } from "../lib/operator/auditedDelete.js";
import { deleteQuoteGuarded, deleteQuotesGuarded, QUOTE_DELETE_MESSAGES as Q } from "../lib/operator/quoteDelete.js";

const recorder = (resultFor = () => ({ ok: true })) => { const seen = []; return { seen, audit: async (e) => { seen.push(e); return resultFor(e, seen.length); } }; };

test("writeEntry never throws; no audit function, a missing table and a failure are all 'not written'", async () => {
  assert.deepEqual(await writeEntry(undefined, { action: "x" }), { ok: false, unavailable: true });
  assert.deepEqual(await writeEntry(async () => ({ ok: false, unavailable: true }), {}), { ok: false, unavailable: true });
  assert.deepEqual(await writeEntry(async () => ({ ok: false }), {}), { ok: false, unavailable: false });
  assert.deepEqual(await writeEntry(async () => { throw new Error("boom"); }, {}), { ok: false });
  assert.deepEqual(await writeEntry(async () => ({ ok: true }), {}), { ok: true, unavailable: false });
});

test("requireAttempt: null means 'go ahead'; anything else is the refusal to return, with a different text for a missing log", async () => {
  assert.equal(await requireAttempt(async () => ({ ok: true }), {}), null);
  assert.deepEqual(await requireAttempt(async () => ({ ok: false }), {}), { ok: false, error: M.failed });
  assert.deepEqual(await requireAttempt(async () => ({ ok: false, unavailable: true }), {}), { ok: false, error: M.unavailable });
  assert.deepEqual(await requireAttempt(undefined, {}), { ok: false, error: M.unavailable });
});

test("makeOutcome writes <kind>.delete for success and <kind>.delete_failed with a reason, never mixing them", async () => {
  const { seen, audit } = recorder();
  const o = makeOutcome(audit, { kind: "brand", entity: "beauty_brands", ids: [4], detail: { moved: 0 } });
  await o.failed("db_error");
  await o.succeeded();
  assert.deepEqual(seen.map((e) => e.action), ["brand.delete_failed", "brand.delete"]);
  assert.equal(seen[0].detail.reason, "db_error");
  assert.equal(seen[1].detail.reason, undefined);
});

function fakeAdmin({ rows = [{ id: 7 }], error = null, calls = [] } = {}) {
  return { calls, admin: { from(table) { const c = { table }; calls.push(c); const ch = { delete() { c.op = "delete"; return ch; }, eq() { return ch; }, in() { return ch; }, select() { return Promise.resolve({ data: error ? null : rows, error }); } }; return ch; } } };
}
const base = (admin, audit) => ({ getSession: async () => ({ role: "admin" }), getAdminClient: () => admin, table: "quote_requests", audit });

test("quotes: no audit, a missing log table and a failing log each refuse BEFORE the delete (single and bulk)", async () => {
  for (const audit of [undefined, async () => ({ ok: false, unavailable: true }), async () => ({ ok: false }), async () => { throw new Error("down"); }]) {
    const a = fakeAdmin(); const r1 = await deleteQuoteGuarded({ ...base(a.admin, audit), id: 7 });
    assert.equal(r1.ok, false); assert.ok(!a.calls.some((c) => c.op === "delete"));
    const b = fakeAdmin(); const r2 = await deleteQuotesGuarded({ ...base(b.admin, audit), ids: [1, 2] });
    assert.equal(r2.ok, false); assert.ok(!b.calls.some((c) => c.op === "delete"));
  }
});

test("quotes: attempt, delete, outcome; a missing row or a database error is recorded as FAILED, never as deleted", async () => {
  const ok = recorder(); const a = fakeAdmin();
  assert.equal((await deleteQuoteGuarded({ ...base(a.admin, ok.audit), id: 7 })).ok, true);
  assert.deepEqual(ok.seen.map((e) => e.action), ["quote.delete_attempt", "quote.delete"]);

  const gone = recorder(); const g = fakeAdmin({ rows: [] });
  const r = await deleteQuoteGuarded({ ...base(g.admin, gone.audit), id: 7 });
  assert.deepEqual(r, { ok: false, notFound: true, error: Q.notFound });
  assert.deepEqual(gone.seen.map((e) => e.action), ["quote.delete_attempt", "quote.delete_failed"]);

  const bad = recorder(); const e = fakeAdmin({ error: { message: "secret" } });
  assert.deepEqual(await deleteQuoteGuarded({ ...base(e.admin, bad.audit), id: 7 }), { ok: false, error: Q.failed });
  assert.deepEqual(bad.seen.map((x) => x.action), ["quote.delete_attempt", "quote.delete_failed"]);
  assert.ok(!JSON.stringify(bad.seen).includes("secret"));

  const bulk = recorder(); const bk = fakeAdmin({ rows: [{ id: 1 }, { id: 2 }] });
  const rb = await deleteQuotesGuarded({ ...base(bk.admin, bulk.audit), ids: [1, 2, 3] });
  assert.equal(rb.ok, true); assert.equal(rb.missing, 1);
  assert.deepEqual(bulk.seen.map((x) => x.action), ["quote.delete_attempt", "quote.delete"]);
  assert.deepEqual(bulk.seen[0].ids, [1, 2, 3], "the attempt names what was asked");
  assert.deepEqual(bulk.seen[1].ids, [1, 2], "the outcome names what was really removed");
});

test("the activity page has a label for every attempt/failed entry", async () => {
  const { AUDIT_LABELS } = await import("../lib/operator/security.js");
  for (const kind of ["quote", "product", "category", "brand"]) for (const suffix of ["delete_attempt", "delete", "delete_failed"]) assert.ok(AUDIT_LABELS[`${kind}.${suffix}`], `${kind}.${suffix}`);
});
