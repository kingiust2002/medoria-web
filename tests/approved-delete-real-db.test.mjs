// The panels' REAL executors (lib/operator/destructiveApproval.js, categoryDelete.js) driven against the REAL functions of migration 53 on a
// real throw-away PostgreSQL: the independent review's R3, R9 and R10, red before / green after. (The same probes against the old code
// are in tests/review-panel-platform-20261029.mjs on the review branch: the delete happened.) Skipped where PostgreSQL is not installed.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";
import { pgRpcAdmin } from "./helpers/pgRpcAdmin.mjs";
import { SCHEMA } from "./helpers/atomicDeleteSchema.mjs";
import { executeApprovedQuoteDelete, snapshotQuotes, quoteDeleteSpec, executeApprovedBrandDelete, planBrandDelete } from "../lib/operator/destructiveApproval.js";
import { planCategoryDelete, executeApprovedCategoryDelete } from "../lib/operator/categoryDelete.js";

const pg = createCluster("pg53b", 7700);
before(() => { pg.start({ migrations: { 53: "53_atomic_approved_deletes.sql" } }); if (!SKIP) { pg.must(pg.script("schema.sql", SCHEMA)); pg.must(pg.psql(pg.M(53), { file: true })); } });
after(() => pg.stop());
const su = (q) => pg.must(pg.psql(q));
const val = (q) => pg.must(pg.psql(q));
const admin = () => pgRpcAdmin(pg);
const session = { sid: "s", uid: "reviewer" };
const trail = () => { const a = []; return { a, fn: async (e) => { a.push(e.action); return { ok: true }; } }; };

for (const house of ["health", "beauty"]) {
  const Q = house === "health" ? "quote_requests" : "beauty_quote_requests";
  const C = house === "health" ? "categories" : "beauty_categories";
  const P = house === "health" ? "products" : "beauty_products";
  // the request exactly as the asker's screen files it
  const fileQuotes = async (ids) => {
    const snap = await snapshotQuotes({ admin: admin(), house, ids });
    assert.equal(snap.ok, true);
    return { proposed: quoteDeleteSpec({ rows: snap.rows }).proposed };
  };
  const seedQuotes = () => su(`TRUNCATE ${Q} RESTART IDENTITY; INSERT INTO ${Q}(name) VALUES ('a'),('b')`);

  test(`${house} R3: the approved request deletes exactly the reviewed requests, with the attempt first and the outcome after`, { skip: SKIP }, async () => {
    seedQuotes();
    const request = await fileQuotes([1, 2]);
    const t = trail();
    const res = await executeApprovedQuoteDelete({ admin: admin(), house, request, session, audit: t.fn });
    assert.deepEqual(res, { ok: true });
    assert.equal(val(`SELECT count(*) FROM ${Q}`), "0");
    assert.deepEqual(t.a, ["quote.delete_attempt", "quote.delete"]);
  });

  test(`${house} R3: a request answered between the snapshot check and the DELETE (inside the audit write) is NOT deleted`, { skip: SKIP }, async () => {
    seedQuotes();
    const request = await fileQuotes([1]);
    const t = trail();
    const res = await executeApprovedQuoteDelete({
      admin: admin(), house, request, session,
      audit: async (e) => { t.a.push(e.action); if (e.action === "quote.delete_attempt") su(`UPDATE ${Q} SET status = 'answered' WHERE id = 1`); return { ok: true }; },
    });
    assert.deepEqual(res, { ok: false, error: "stale" });
    assert.equal(val(`SELECT count(*) FROM ${Q}`), "2", "the newer, answered request survives");
    assert.equal(val(`SELECT status FROM ${Q} WHERE id = 1`), "answered");
    assert.deepEqual(t.a, ["quote.delete_attempt", "quote.delete_failed"], "the failure is on record as a failure, never as a delete");
  });

  test(`${house} R3: one stale request among several: nothing at all is deleted`, { skip: SKIP }, async () => {
    seedQuotes();
    const request = await fileQuotes([1, 2]);
    su(`UPDATE ${Q} SET status = 'answered' WHERE id = 2`);
    const res = await executeApprovedQuoteDelete({ admin: admin(), house, request, session, audit: trail().fn });
    assert.deepEqual(res, { ok: false, error: "stale" });
    assert.equal(val(`SELECT count(*) FROM ${Q}`), "2");
  });

  test(`${house} R3: a failing or missing audit writer blocks the deletion before the database is touched`, { skip: SKIP }, async () => {
    seedQuotes();
    const request = await fileQuotes([1]);
    const a = admin();
    for (const audit of [undefined, async () => ({ ok: false }), async () => ({ ok: false, unavailable: true }), async () => { throw new Error("log down"); }]) {
      assert.deepEqual(await executeApprovedQuoteDelete({ admin: a, house, request, session, audit }), { ok: false, error: "failed" });
    }
    assert.equal(val(`SELECT count(*) FROM ${Q}`), "2");
    assert.equal(a.log.length, 0, "the delete function was never called");
  });

  test(`${house} R9: a category with 1500 products is planned in full and every product is moved`, { skip: SKIP }, async () => {
    su(`TRUNCATE ${P}, ${C} RESTART IDENTITY CASCADE; INSERT INTO ${C}(slug) VALUES ('one'),('two'); INSERT INTO ${P}(sku, category, category_id) SELECT 'S' || g, 'one', 1 FROM generate_series(1, 1500) g`);
    const planned = await planCategoryDelete({ admin: admin(), house, id: 1, moveToId: 2 });
    assert.equal(planned.ok, true);
    assert.equal(planned.plan.count, 1500, "not 1000");
    const request = { entity_id: 1, proposed: { moveToId: 2, _basis: planned.plan.basis } };
    assert.deepEqual(await executeApprovedCategoryDelete({ admin: admin(), house, request, audit: trail().fn }), { ok: true });
    assert.equal(val(`SELECT count(*) FROM ${P} WHERE category_id = 2`), "1500");
    assert.equal(val(`SELECT count(*) FROM ${C} WHERE id = 1`), "0");
  });

  test(`${house} R10: same count, different product: the approval is stale and the category stays`, { skip: SKIP }, async () => {
    su(`TRUNCATE ${P}, ${C} RESTART IDENTITY CASCADE; INSERT INTO ${C}(slug) VALUES ('one'),('two'); INSERT INTO ${P}(sku, category, category_id) VALUES ('A','one',1), ('B','two',2)`);
    const planned = await planCategoryDelete({ admin: admin(), house, id: 1, moveToId: 2 });
    assert.equal(planned.plan.count, 1);
    su(`UPDATE ${P} SET category_id = 2, category = 'two' WHERE sku = 'A'; UPDATE ${P} SET category_id = 1, category = 'one' WHERE sku = 'B'`);
    const t = trail();
    const res = await executeApprovedCategoryDelete({ admin: admin(), house, request: { entity_id: 1, proposed: { moveToId: 2, _basis: planned.plan.basis } }, audit: t.fn });
    assert.deepEqual(res, { ok: false, error: "stale" });
    assert.equal(val(`SELECT count(*) FROM ${C} WHERE id = 1`), "1");
    assert.equal(val(`SELECT category_id FROM ${P} WHERE sku = 'B'`), "1", "the product that was never reviewed was not moved");
    assert.deepEqual(t.a, ["category.delete_attempt", "category.delete_failed"]);
  });

  test(`${house} R10: a request without a basis (filed by older code) is refused as stale before anything is written`, { skip: SKIP }, async () => {
    const t = trail();
    assert.deepEqual(await executeApprovedCategoryDelete({ admin: admin(), house, request: { entity_id: 1, before: { slug: "one", products: 1 }, proposed: { moveToId: 2 } }, audit: t.fn }), { ok: false, error: "stale" });
    assert.deepEqual(t.a, []);
  });
}

test("Beauty R10: an approved brand deletion refuses a brand edited after the review, even with the same name and slug", { skip: SKIP }, async () => {
  su("TRUNCATE beauty_brands RESTART IDENTITY; INSERT INTO beauty_brands(slug, name) VALUES ('chanel','Chanel')");
  const planned = await planBrandDelete({ admin: admin(), id: 1 });
  assert.equal(planned.ok, true);
  su("UPDATE beauty_brands SET logo_url = 'brands/new.webp' WHERE id = 1");
  const t = trail();
  assert.deepEqual(await executeApprovedBrandDelete({ admin: admin(), request: { entity_id: 1, proposed: { _basis: planned.plan.basis } }, audit: t.fn }), { ok: false, error: "stale" });
  assert.equal(val("SELECT count(*) FROM beauty_brands"), "1");
  assert.deepEqual(t.a, ["brand.delete_attempt", "brand.delete_failed"]);
  const fresh = await planBrandDelete({ admin: admin(), id: 1 });
  assert.deepEqual(await executeApprovedBrandDelete({ admin: admin(), request: { entity_id: 1, proposed: { _basis: fresh.plan.basis } }, audit: t.fn }), { ok: true });
});

test("without migration 53 the deletions fail closed: nothing deleted, the outcome says why", { skip: SKIP }, async () => {
  su("TRUNCATE quote_requests RESTART IDENTITY; INSERT INTO quote_requests(name) VALUES ('a')");
  const request = await (async () => { const s = await snapshotQuotes({ admin: admin(), house: "health", ids: [1] }); return { proposed: quoteDeleteSpec({ rows: s.rows }).proposed }; })();
  su("DROP FUNCTION public.operator_delete_quotes_checked(text, bigint[], jsonb)");
  try {
    const t = trail();
    assert.deepEqual(await executeApprovedQuoteDelete({ admin: admin(), house: "health", request, session, audit: t.fn }), { ok: false, error: "failed" });
    assert.equal(val("SELECT count(*) FROM quote_requests"), "1");
    assert.deepEqual(t.a, ["quote.delete_attempt", "quote.delete_failed"]);
  } finally { pg.must(pg.psql(pg.M(53), { file: true })); }
});
