// Review R2: deleting a product document is an irreversible action, so it follows the history rule of lib/operator/auditedDelete.js — the attempt is
// written FIRST and a log that is missing, failing or throwing refuses the deletion; the outcome is a separate entry; an approved deletion is held to
// the same rule. Both houses, direct and approved. (Red before: the old code swallowed the failure and deleted row and file.)
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { deleteDocument, makeDocumentExecutors } from "../lib/operator/documentsCore.js";
import { DOC_TABLES, DOC_BUCKETS } from "../lib/operator/documents.js";

const stamp = "2026-10-28T10:00:00.000001Z";
function world(house, { removeFails = false } = {}) {
  const T = DOC_TABLES[house];
  const db = createMemoryAdmin({ [T]: [{ id: 1, product_id: 1, title: "Brochure", version: 1, updated_at: stamp, file_path: "documents/test.pdf" }] });
  db.removedFiles = [];
  db.storage = { from: (bucket) => ({ remove: async (paths) => { if (removeFails) return { error: { message: "storage down" } }; db.removedFiles.push(...paths.map((p) => `${bucket}/${p}`)); return { error: null }; } }) };
  return db;
}
const ctxFor = (db, house, audit) => ({ admin: db, panel: house, evaluate: async () => ({ mode: "direct" }), audit, revalidate: () => {} });
const trail = () => { const a = []; return { a, audit: async (action, meta) => { a.push([action, meta?.result, meta?.detail]); return { ok: true }; } }; };

for (const house of ["health", "beauty"]) {
  const T = DOC_TABLES[house];
  const BAD_WRITERS = {
    "no writer at all": undefined,
    "the log table is missing": async () => ({ ok: false, unavailable: true }),
    "the log write fails": async () => ({ ok: false }),
    "the log throws": async () => { throw new Error("log down"); },
    "the log returns nothing": async () => undefined,
  };
  for (const [label, audit] of Object.entries(BAD_WRITERS)) {
    test(`${house} R2: ${label} → the document and its file are NOT deleted (direct)`, async () => {
      const db = world(house);
      const res = await deleteDocument(ctxFor(db, house, audit), 1, 1);
      assert.equal(res.ok, false);
      assert.equal(db.tables[T].length, 1, "the row is still there");
      assert.deepEqual(db.removedFiles, [], "the file is still there");
    });
    test(`${house} R2: ${label} → an APPROVED deletion is refused too, nothing deleted`, async () => {
      const db = world(house);
      const entryAudit = audit ? async (e) => audit(e.action, e) : undefined;
      const ex = makeDocumentExecutors({ panel: house, audit: entryAudit });
      const res = await ex["documents.delete"]({ admin: db, request: { entity_id: 1, base_updated_at: stamp } });
      assert.equal(res.ok, false);
      assert.equal(db.tables[T].length, 1); assert.deepEqual(db.removedFiles, []);
    });
  }

  test(`${house} R2: the attempt comes first, the outcome is a separate entry, then the file goes`, async () => {
    const db = world(house), t = trail();
    const res = await deleteDocument(ctxFor(db, house, t.audit), 1, 1);
    assert.deepEqual(res, { ok: true, fileRemoved: true });
    assert.deepEqual(t.a.map((x) => x[0]), ["document.delete_attempt", "document.delete"]);
    assert.equal(t.a[1][2].file_removed, true);
    assert.deepEqual(db.removedFiles, [`${DOC_BUCKETS[house]}/documents/test.pdf`], "the file of the house's PRIVATE bucket");
    assert.equal(db.tables[T].length, 0);
  });

  test(`${house} R2: a file that cannot be removed is reported, not hidden (the row is already gone, the outcome says so)`, async () => {
    const db = world(house, { removeFails: true }), t = trail();
    const res = await deleteDocument(ctxFor(db, house, t.audit), 1, 1);
    assert.deepEqual(res, { ok: true, fileRemoved: false });
    assert.equal(t.a[1][2].file_removed, false);
  });

  test(`${house} R2: a document changed since the person saw it is not deleted; the failure is on record as a failure`, async () => {
    const db = world(house), t = trail();
    const res = await deleteDocument(ctxFor(db, house, t.audit), 1, 7);
    assert.equal(res.conflict, true);
    assert.equal(db.tables[T].length, 1);
    const db2 = world(house), t2 = trail();
    const ex = makeDocumentExecutors({ panel: house, audit: async (e) => (t2.a.push([e.action, e.detail]), { ok: true }) });
    assert.deepEqual(await ex["documents.delete"]({ admin: db2, request: { entity_id: 1, base_updated_at: "2026-10-28T10:00:00.000002Z" } }), { ok: false, error: "stale" });
    assert.deepEqual(t2.a.map((x) => x[0]), ["document.delete_attempt", "document.delete_failed"]);
    assert.equal(db2.tables[T].length, 1); assert.deepEqual(db2.removedFiles, []);
  });

  test(`${house} R2: an approved deletion by a reviewer is recorded with the same attempt and outcome`, async () => {
    const db = world(house), seen = [];
    const ex = makeDocumentExecutors({ panel: house, audit: async (e) => (seen.push(e.action), { ok: true }) });
    assert.deepEqual(await ex["documents.delete"]({ admin: db, request: { entity_id: 1, base_updated_at: stamp } }), { ok: true });
    assert.deepEqual(seen, ["document.delete_attempt", "document.delete"]);
    assert.equal(db.tables[T].length, 0);
  });
}
