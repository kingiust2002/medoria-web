// Independent review round 3 — R5, R6, R7, R11, red before / green after, both houses, with the REAL planner / runner / bulk code against an in-memory database:
//  R5   an import is judged on what its rows REALLY change: a price, a publication, an archive, a stock flag, a new category each need their own right; the import
//       operation alone never authorises them; the approved run re-checks the REQUESTER (not the reviewer); no authoriser = nothing written
//  R6   an update is written against the version it was planned on (and the version a reviewer saw), never over a newer edit; each changed product gets history;
//       a bulk edit writes per-product versions, reports stale products and, after a database error, exactly what was and was not done
//  R7   a text made by the translator is marked "auto"; a text typed in the file replaces an "auto" mark; the translator never overwrites a text
//  R11  a bulk edit is judged on the row it WILL BE (publishing + clearing a required category; changing a live product's category), not on the old row
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { runProductBatch, opsOfBatch, reconcileMeta, IMPORT_RUN_MESSAGES } from "../lib/operator/importRun.js";
import { makeImportAuthorizer } from "../lib/operator/importAuthorize.js";
import { runApprovedImport } from "../lib/operator/importApproved.js";
import { fillTranslations } from "../lib/operator/importTranslateCore.js";
import { applyBulkChange, fileBulkChange, planBulkChange, bulkResult } from "../lib/operator/bulkCore.js";
import { makeProductExecutors } from "../lib/operator/approvalExecutors.js";
import { approveRequest } from "../lib/operator/approvals.js";
import { decide } from "../lib/operator/authz.js";

const T = "2026-10-28T10:00:00.000001+00:00";
const user = (o = {}) => ({ id: "00000000-0000-4000-8000-000000000001", username: "pm", status: "active", role: "product_manager", houses: ["health", "beauty"], allow: [], deny: [], approval: {}, ...o });
const session = (u = user()) => ({ user: u });
const PRODUCTS = { health: "products", beauty: "beauty_products" }, CATS = { health: "categories", beauty: "beauty_categories" }, VERS = { health: "product_versions", beauty: "beauty_product_versions" };
let tick;
function world(house, { products = [], rules = [] } = {}) {
  tick = 0;
  return createMemoryAdmin({
    [PRODUCTS[house]]: products.map((p) => ({ updated_at: T, ...p })), [CATS[house]]: [{ id: 1, slug: "gloves", is_active: true }, { id: 2, slug: "masks", is_active: true }], [VERS[house]]: [], publish_rules: rules,
  }, { beforeUpdate: { [PRODUCTS[house]]: (old, next) => { next.updated_at = `2026-11-01T10:00:00.${String(++tick).padStart(6, "0")}+00:00`; return null; } } });
}
const P = (o = {}) => ({ id: 1, sku: "S1", slug: "s1", name_en: "Old", price: 10, is_active: false, in_stock: true, category_id: 1, category: "gloves", ...o });
const run = (db, house, rows, options = {}, user_ = user()) => runProductBatch({ admin: db, house, rawRows: rows, options: { mode: "update", authorize: makeImportAuthorizer({ session: session(user_), panel: house }), ...options } });

for (const house of ["health", "beauty"]) {
  test(`${house}: bulk approval must use the versions captured when the request was filed`, async () => {
    const db = world(house, { products: [P()] });
    let request;
    await fileBulkChange({ admin: db, file: async (spec) => { request = { ...spec, requested_by: user().id, proposed: spec.proposed }; return { ok: true }; } }, { house, ids: [1], allowed: { price: null } });
    const product = db.tables[PRODUCTS[house]][0];
    product.price = 25;
    product.updated_at = "2026-11-02T10:00:00.000009+00:00";
    const executor = makeProductExecutors({ panel: house, session: session(user({ role: "house_admin" })), audit: async () => ({ ok: true }) });
    const result = await executor["products.bulk"]({ admin: db, request, requester: user() });
    assert.equal(result.ok, false);
    assert.equal(product.price, 25, "a newer price must survive approval of the older request");
  });
}

for (const house of ["health", "beauty"]) {
  const prod = PRODUCTS[house], vers = VERS[house];

  // ── R5 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  test(`${house}: approved imports refuse an existing product absent from the filed version map`, async () => {
    const db = world(house, { products: [P()] });
    const result = await runApprovedImport({ rows: [{ sku: "S1", name_en: "Unreviewed overwrite" }], options: { mode: "upsert" } }, {
      processProductBatch: (rows, options) => runProductBatch({ admin: db, house, rawRows: rows, options }), recordImportLog: async () => {},
    }, { authorize: async () => ({ ok: true }), bases: {} });
    assert.deepEqual(result.staleIds, [1]);
    assert.equal(db.tables[prod][0].name_en, "Old");
  });

  test(`${house}: old bulk requests without recorded versions fail closed`, async () => {
    const db = world(house, { products: [P()] });
    const execute = makeProductExecutors({ panel: house, session: session() })["products.bulk"];
    assert.deepEqual(await execute({ admin: db, requester: user(), request: { proposed: { ids: [1], patch: { is_active: true } } } }), { ok: false, error: "stale" });
    assert.equal(db.tables[prod][0].is_active, false);
  });

  test(`${house} R5: the product manager's import may not change a price or publish: the whole file is refused as "needs approval", nothing is written`, async () => {
    const pm = user();
    assert.deepEqual([decide(pm, house, "products.import").mode, decide(pm, house, "products.price").mode, decide(pm, house, "products.publish").mode], ["direct", "approval", "approval"], "the premise: import is direct, price and publication wait for approval");
    const db = world(house, { products: [P()] });
    const res = await run(db, house, [{ sku: "S1", name_en: "Test", price: "999", is_active: "yes" }]);
    assert.equal(res.ok, false); assert.equal(res.needsApproval, true);
    assert.deepEqual(res.ops.sort(), ["products.price", "products.publish"]);
    assert.deepEqual([db.tables[prod][0].price, db.tables[prod][0].is_active, db.tables[prod][0].name_en], [10, false, "Old"], "not even the harmless name was written: the file is one unit");
    assert.deepEqual(db.tables[vers], []);
  });

  test(`${house} R5: a file that changes only content is allowed directly (name edit); a price that does not change, and a file with no price column, ask for nothing`, async () => {
    const db = world(house, { products: [P()] });
    const same = await run(db, house, [{ sku: "S1", name_en: "Better", price: "10" }]);
    assert.equal(same.ok, true); assert.deepEqual(same.authorization.ops, ["products.content"]);
    assert.equal(db.tables[prod][0].name_en, "Better");
    const noPrice = await run(db, house, [{ sku: "S1", name_en: "Even better" }]);
    assert.equal(noPrice.ok, true); assert.ok(!noPrice.authorization.ops.includes("products.price"));
    assert.equal(db.tables[prod][0].price, 10);
  });

  test(`${house} R5: new rows: products.create (+ products.publish when active); an archive and a stock flag are their own operations; an automatic category needs categories.create`, async () => {
    const pm = user();
    const db = world(house, { products: [P({ is_active: true, in_stock: true })] });
    const dry = (rows, o = {}) => run(db, house, rows, { dryRun: true, ...o }, pm);
    assert.deepEqual((await dry([{ sku: "N1", name_en: "New", price: "5", is_active: "no" }], { mode: "add" })).authorization.ops, ["products.create"], "a new row saved as inactive needs only the right to create");
    assert.deepEqual((await dry([{ sku: "N2", name_en: "New", price: "5", is_active: "yes" }], { mode: "add" })).authorization.ops, ["products.create", "products.publish"]);
    assert.deepEqual((await dry([{ sku: "N4", name_en: "New", price: "5" }], { mode: "add" })).authorization.ops, ["products.create", "products.publish"], "the template's default is ACTIVE: a new row is a publication unless the file says otherwise");
    assert.deepEqual((await dry([{ sku: "S1", name_en: "Old", is_active: "no" }])).authorization.ops, ["products.archive", "products.content"]);
    assert.deepEqual((await dry([{ sku: "S1", name_en: "Old", in_stock: "no" }])).authorization.ops, ["products.content", "products.stock_flag"]);
    const cat = await dry([{ sku: "N3", name_en: "New", category_slug: "brand-new" }], { mode: "add", autoCreateCategories: true });
    assert.ok(cat.authorization.ops.includes("categories.create"));
    // the preview reports what the person may do; it writes nothing
    assert.equal((await dry([{ sku: "S1", name_en: "Old", price: "99" }])).authorization.kind, "approval");
    assert.equal(db.tables[prod][0].price, 10);
    // …and the dry run carries the version of every product an update would change (an approval pins these)
    assert.deepEqual((await dry([{ sku: "S1", name_en: "x" }])).bases, { 1: T });
  });

  test(`${house} R5: denied operations refuse the file; an automatic category without categories.create is refused; no authoriser at all writes nothing`, async () => {
    const noCats = user({ deny: [`${house}.categories.create`] });
    const db = world(house, { products: [] });
    const refused = await run(db, house, [{ sku: "N1", name_en: "New", category_slug: "brand-new" }], { mode: "add", autoCreateCategories: true }, noCats);
    assert.equal(refused.ok, false); assert.equal(refused.denied, true); assert.deepEqual(refused.ops, ["categories.create"]);
    assert.equal(db.tables[prod].length, 0); assert.equal(db.tables[CATS[house]].length, 2, "no category was created");
    const none = await runProductBatch({ admin: db, house, rawRows: [{ sku: "N1", name_en: "New" }], options: { mode: "add" } });
    assert.deepEqual([none.ok, none.error], [false, IMPORT_RUN_MESSAGES.noAuthorizer]);
    assert.equal(db.tables[prod].length, 0);
    const viewer = user({ role: "viewer" });
    assert.equal((await run(world(house), house, [{ sku: "N1", name_en: "x" }], { mode: "add" }, viewer)).denied, true);
  });

  test(`${house} R5: the owner / house admin (nothing needs approval) imports prices and publications directly; the old shared login too`, async () => {
    const db = world(house, { products: [P()] });
    const admin = user({ role: "house_admin" });
    assert.equal((await run(db, house, [{ sku: "S1", name_en: "Old", price: "11", is_active: "yes" }], {}, admin)).counts.update, 1);
    assert.deepEqual([db.tables[prod][0].price, db.tables[prod][0].is_active], [11, true]);
    const legacy = await runProductBatch({ admin: db, house, rawRows: [{ sku: "S1", name_en: "Old", price: "12" }], options: { mode: "update", authorize: makeImportAuthorizer({ session: {}, panel: house }) } });
    assert.equal(legacy.counts.update, 1); assert.equal(db.tables[prod][0].price, 12);
  });

  test(`${house} R5: the APPROVED run uses the requester's rights as they are now — approval-mode operations are satisfied, a taken-away right refuses, the reviewer's power is never borrowed`, async () => {
    const requester = user();
    const authorize = makeImportAuthorizer({ panel: house, requester });
    const db = world(house, { products: [P()] });
    const rows = [{ sku: "S1", name_en: "Reviewed", price: "55", is_active: "yes" }];
    const ok = await runApprovedImport({ rows, options: { mode: "update" } }, { processProductBatch: (r, o) => runProductBatch({ admin: db, house, rawRows: r, options: o }), recordImportLog: async () => {} }, { authorize, bases: { 1: T }, recordAs: { userId: requester.id, label: "pm", requestId: "req-1", kind: "approval" } });
    assert.equal(ok.ok, true);
    assert.deepEqual([db.tables[prod][0].price, db.tables[prod][0].is_active], [55, true]);
    // the requester loses the right to change prices before the approval runs
    const db2 = world(house, { products: [P()] });
    const lost = makeImportAuthorizer({ panel: house, requester: user({ deny: [`${house}.products.edit`] }) });
    const refused = await runApprovedImport({ rows, options: { mode: "update" } }, { processProductBatch: (r, o) => runProductBatch({ admin: db2, house, rawRows: r, options: o }), recordImportLog: async () => {} }, { authorize: lost, bases: { 1: T } });
    assert.equal(refused.ok, false); assert.equal(refused.reason, "denied");
    assert.equal(db2.tables[prod][0].price, 10);
    // a disabled requester, or one outside the house, is refused too; no requester at all (nothing to borrow) is refused
    for (const bad of [user({ status: "disabled" }), user({ houses: [house === "health" ? "beauty" : "health"] })]) assert.equal((await makeImportAuthorizer({ panel: house, requester: bad })(["products.content"])).ok, false);
    assert.equal((await makeImportAuthorizer({ panel: house })(["products.content"])).ok, false, "no session and no requester = nobody");
  });

  // ── R6 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  test(`${house} R6: every changed product gets a history entry (before / after, who, request); an unchanged row writes nothing; a new row is recorded as created`, async () => {
    const db = world(house, { products: [P(), P({ id: 2, sku: "S2", slug: "s2", name_en: "Same" })] });
    const admin = user({ role: "house_admin" });
    const res = await run(db, house, [{ sku: "S1", name_en: "New" }, { sku: "S2", name_en: "Same" }, { sku: "N9", name_en: "Fresh" }], { mode: "upsert", recordAs: { userId: admin.id, label: "ann", requestId: "r-7", kind: "approval" } }, admin);
    assert.equal(res.ok, true); assert.deepEqual([res.counts.update, res.counts.skip, res.counts.create], [1, 1, 1]);
    const rows = db.tables[vers];
    assert.equal(rows.length, 2, "S2 changed nothing: no entry");
    const upd = rows.find((v) => v.kind === "approval");
    assert.deepEqual([upd.product_id, upd.changed, upd.before.name_en, upd.after.name_en, upd.actor_user_id, upd.actor_label, upd.request_id], [1, ["name_en"], "Old", "New", admin.id, "ann", "r-7"]);
    assert.equal(rows.find((v) => v.kind === "create").after.sku, "N9");
  });

  test(`${house} R6: a product edited between the plan and the write is NOT overwritten and is reported; the version a reviewer saw is pinned the same way`, async () => {
    const db = world(house, { products: [P(), P({ id: 2, sku: "S2", slug: "s2" })] });
    let hits = 0;
    const authorize = async (ops) => { if (!hits++) db.tables[prod].find((p) => p.id === 1).updated_at = "2026-11-02T00:00:00.000009+00:00"; return { ok: true }; };      // somebody saves product 1 while the import runs
    const res = await runProductBatch({ admin: db, house, rawRows: [{ sku: "S1", name_en: "Import" }, { sku: "S2", name_en: "Import" }], options: { mode: "update", authorize } });
    assert.equal(res.ok, true);
    assert.deepEqual(res.results.map((r) => [r.status, Boolean(r.stale)]), [["error", true], ["update", false]]);
    assert.equal(res.counts.stale, 1);
    assert.equal(db.tables[prod].find((p) => p.id === 1).name_en, "Old", "the newer edit stays");
    assert.equal(db.tables[prod].find((p) => p.id === 2).name_en, "Import");
    // pinned versions (an approved import): the product changed since the reviewer saw it
    const db2 = world(house, { products: [P({ updated_at: "2026-10-30T00:00:00.000001+00:00" })] });
    const r2 = await runProductBatch({ admin: db2, house, rawRows: [{ sku: "S1", name_en: "Import" }], options: { mode: "update", authorize: async () => ({ ok: true }), bases: { 1: T } } });
    assert.equal(r2.results[0].stale, true); assert.equal(db2.tables[prod][0].name_en, "Old");
    // …and the staleIds reach the approval result
    const approved = await runApprovedImport({ rows: [{ sku: "S1", name_en: "Import" }], options: { mode: "update" } }, { processProductBatch: (r, o) => runProductBatch({ admin: db2, house, rawRows: r, options: o }), recordImportLog: async () => {} }, { authorize: async () => ({ ok: true }), bases: { 1: T } });
    assert.deepEqual([approved.ok, approved.staleIds], [true, [1]]);
  });

  // ── R7 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  test(`${house} R7: generated translations are marked auto; an existing text is never overwritten; a text typed in the file replaces an auto mark`, async () => {
    const translator = async () => ({ ok: true, translations: { tg: { name: "ТГ", description: "ТГ-тавсиф" }, fa: { name: "فا", description: "فا" }, ru: { name: "РУ", description: "РУ" } } });
    const write = { name_en: "Source", name_ru: "Человек", description_en: "Desc" };
    const out = await fillTranslations([write], translator);
    assert.equal(write.name_tg, "ТГ"); assert.equal(write.name_ru, "Человек", "a text that is there stays");
    assert.deepEqual(write.translation_meta, { description_fa: "auto", description_ru: "auto", description_tg: "auto", name_fa: "auto", name_tg: "auto" }, "only what the translator filled, sorted");
    assert.equal(out.translated, 5);
    // through the runner (a new product), then an update with a typed text
    const db = world(house, { products: [] });
    const created = await runProductBatch({ admin: db, house, rawRows: [{ sku: "NEW", name_en: "Source" }], options: { mode: "add", autoTranslate: true, authorize: async () => ({ ok: true }) }, translate: (ws) => fillTranslations(ws, translator) });
    assert.equal(created.ok, true);
    const row = db.tables[prod][0];
    assert.equal(row.name_tg, "ТГ"); assert.equal(row.translation_meta.name_tg, "auto"); assert.equal(row.translation_meta.name_en, undefined, "the typed source is human");
    const typed = await runProductBatch({ admin: db, house, rawRows: [{ sku: "NEW", name_en: "Source", name_tg: "Дастӣ" }], options: { mode: "update", authorize: async () => ({ ok: true }) } });
    assert.equal(typed.ok, true);
    const after = db.tables[prod][0];
    assert.equal(after.name_tg, "Дастӣ"); assert.equal(after.translation_meta.name_tg, undefined, "now it is a person's text"); assert.equal(after.translation_meta.name_fa, "auto", "the others stay automatic");
    assert.equal(db.tables[vers].at(-1).kind, "update");
    // reconcile on its own
    assert.equal(reconcileMeta({ translation_meta: { name_tg: "auto" }, name_tg: "x" }, { name_en: "y" }), undefined);
    assert.deepEqual(reconcileMeta({ translation_meta: { name_tg: "auto", name_fa: "auto" }, name_tg: "x" }, { name_tg: "z" }), { name_fa: "auto" });
  });

  test(`${house} R7: a database without migration 40 still saves the texts (the marks cannot be remembered)`, async () => {
    const db = world(house, { products: [] });
    db.fail = (t, op) => (op === "insert" && t === prod ? null : null);
    let first = true;
    const realInsert = db.from;
    db.from = (t) => { const q = realInsert(t); if (t === prod) { const ins = q.insert; q.insert = (p) => { if (first && p && "translation_meta" in p) { first = false; return { select: () => ({ single: async () => ({ data: null, error: { code: "PGRST204", message: "Could not find the 'translation_meta' column of 'products' in the schema cache" } }) }) }; } return ins(p); }; } return q; };
    const translator = async () => ({ ok: true, translations: { tg: { name: "ТГ", description: "" }, fa: { name: "فا", description: "" }, ru: { name: "РУ", description: "" } } });
    const res = await runProductBatch({ admin: db, house, rawRows: [{ sku: "NEW", name_en: "Source" }], options: { mode: "add", autoTranslate: true, authorize: async () => ({ ok: true }) }, translate: (ws) => fillTranslations(ws, translator) });
    assert.equal(res.counts.create, 1);
    assert.equal(db.tables[prod][0].name_tg, "ТГ");
    assert.equal("translation_meta" in db.tables[prod][0], false);
  });

  // ── R11 + R6 for bulk ─────────────────────────────────────────────────────────────────────────────────────────────
  test(`${house} R11: publishing AND clearing a required category in one bulk patch is judged on the resulting row: blocked, nothing public, nothing written`, async () => {
    const db = world(house, { products: [P()], rules: [{ house, blocking: ["category"], version: 1 }] });
    const res = await applyBulkChange({ admin: db, house, ids: [1], allowed: { is_active: true, category_id: null, category: null } });
    assert.equal(res.ok, false); assert.equal(res.quality, true);
    assert.deepEqual([db.tables[prod][0].is_active, db.tables[prod][0].category_id], [false, 1]);
    assert.deepEqual(db.tables[vers], []);
  });

  test(`${house} R11: a category-only patch on a LIVE product is judged too (clearing a required field is blocked, moving it is fine); a pre-existing gap keeps its exception`, async () => {
    const db = world(house, { products: [P({ id: 1, is_active: true }), P({ id: 2, sku: "S2", slug: "s2", is_active: true, category_id: null, category: null })], rules: [{ house, blocking: ["category"], version: 1 }] });
    const clear = await applyBulkChange({ admin: db, house, ids: [1], allowed: { category_id: null, category: null } });
    assert.equal(clear.ok, false); assert.equal(clear.quality, true); assert.equal(db.tables[prod][0].category_id, 1);
    const move = await applyBulkChange({ admin: db, house, ids: [1], allowed: { category_id: 2, category: "masks" } });
    assert.equal(move.ok, true); assert.equal(db.tables[prod][0].category_id, 2);
    // product 2 already lacked its category: the documented exception lets an unrelated bulk edit through (it is not made worse)
    const archive = await applyBulkChange({ admin: db, house, ids: [2], allowed: { is_active: false } });
    assert.equal(archive.ok, true);
    // a mixed selection: the good row is written, the bad one is listed
    const mix = await applyBulkChange({ admin: db, house, ids: [1, 2], allowed: { category_id: null, category: null } });
    assert.equal(mix.ok, true); assert.deepEqual(mix.ids, []); assert.deepEqual(mix.unchanged, [2], "product 2 already had no category: nothing to write"); assert.equal(mix.stopped.blockedCount, 1, "product 1 is listed as blocked");
    assert.equal(db.tables[prod].find((x) => x.id === 1).category_id, 2, "and it was not touched");
  });

  test(`${house} R6: a bulk edit writes each product only against the version it was judged on, reports the ones changed meanwhile, and records a history entry per changed product`, async () => {
    const db = world(house, { products: [P({ id: 1 }), P({ id: 2, sku: "S2", slug: "s2" }), P({ id: 3, sku: "S3", slug: "s3", price: 7 })] });
    const orig = db.from;
    let bumped = false;
    db.from = (t) => { const q = orig(t); if (t === prod && !bumped) { const up = q.update; q.update = (p) => { if (!bumped) { bumped = true; db.tables[prod].find((x) => x.id === 2).updated_at = "2026-11-05T00:00:00.000001+00:00"; } return up(p); }; } return q; };
    const res = await applyBulkChange({ admin: db, house, ids: [1, 2, 3], allowed: { is_active: true }, record: { userId: "u1", label: "bulk-user" } });
    assert.equal(res.ok, true);
    assert.deepEqual(res.ids.sort(), [1, 3]); assert.deepEqual(res.stale, [2]);
    assert.equal(db.tables[prod].find((x) => x.id === 2).is_active, false, "the product somebody edited meanwhile is left alone");
    const v = db.tables[vers];
    assert.deepEqual(v.map((x) => [x.product_id, x.kind, x.actor_label, x.before.is_active, x.after.is_active]).sort(), [[1, "update", "bulk-user", false, true], [3, "update", "bulk-user", false, true]]);
    // an approved bulk change names the request
    const db2 = world(house, { products: [P()] });
    await applyBulkChange({ admin: db2, house, ids: [1], allowed: { is_active: true }, record: { userId: "u2", label: "approved-request", requestId: "req-9", kind: "approval" } });
    assert.deepEqual([db2.tables[vers][0].kind, db2.tables[vers][0].request_id], ["approval", "req-9"]);
  });

  test(`${house} R6: after a database error in the middle of a bulk edit the answer lists exactly what was done and what was not; a retry skips the done rows`, async () => {
    const products = Array.from({ length: 90 }, (_, i) => P({ id: i + 1, sku: `B${i}`, slug: `b${i}` }));
    const db = world(house, { products });
    let calls = 0;
    db.fail = (t, op) => (t === prod && op === "update" && ++calls === 3 ? { code: "XX000", message: "boom" } : null);
    const res = await applyBulkChange({ admin: db, house, ids: products.map((p) => p.id), allowed: { is_active: true } });
    assert.equal(res.ok, false); assert.ok(res.dbError);
    assert.equal(res.partial.doneIds.length, 80); assert.equal(res.partial.notDoneIds.length, 10);
    assert.equal(db.tables[prod].filter((p) => p.is_active).length, 80);
    assert.equal(db.tables[vers].length, 80, "the done rows have their history");
    db.fail = () => null;
    const retry = await applyBulkChange({ admin: db, house, ids: products.map((p) => p.id), allowed: { is_active: true } });
    assert.equal(retry.ok, true); assert.equal(retry.count, 10); assert.equal(retry.unchanged.length, 80);
    const audits = [];
    const r = await bulkResult(res, async (e) => { audits.push(e); return { ok: true }; }, { id: "rq" });
    assert.equal(r.ok, false); assert.equal(r.done.length, 80); assert.equal(audits[0].detail.notDone, 10);
  });

  test(`${house} R6/R5: the APPROVED bulk edit re-checks the requester, judges the rule on the resulting rows and files its history under the request`, async () => {
    const db = world(house, { products: [P({ id: 1 })], rules: [{ house, blocking: ["category"], version: 1 }] });
    const req = { id: "00000000-0000-4000-9000-000000000001", operation: "products.bulk", entity: "products", house, resource: "products", status: "pending", requested_by: user().id, proposed: { ids: [1], bases: { 1: T }, patch: { is_active: true, category_id: null, category: null }, __ops: ["products.bulk", "products.publish", "products.content"] }, base_updated_at: null };
    const ex = makeProductExecutors({ panel: house, session: session(), audit: async () => ({ ok: true }) })["products.bulk"];
    const quality = await ex({ admin: db, request: req, requester: user() });
    assert.deepEqual(quality, { ok: false, error: "quality" });
    const lost = await ex({ admin: db, request: { ...req, proposed: { ids: [1], bases: { 1: T }, patch: { is_active: true } } }, requester: user({ deny: [`${house}.products.publish`] }) });
    assert.deepEqual(lost, { ok: false, error: "failed" }, "the requester lost the right to publish");
    assert.equal(db.tables[prod][0].is_active, false);
    const ok = await ex({ admin: db, request: { ...req, proposed: { ids: [1], bases: { 1: T }, patch: { is_active: true } } }, requester: user() });
    assert.equal(ok.ok, true);
    assert.equal(db.tables[vers][0].request_id, req.id);
    assert.deepEqual(await ex({ admin: db, request: { ...req, proposed: { ids: [1], bases: { 1: T }, patch: { is_active: true } } } }), { ok: false, error: "failed" }, "no requester = nothing to check against = refused");
  });
}

test("opsOfBatch: the union is sorted, an unchanged update asks for nothing", () => {
  const stored = new Map([[1, { id: 1, name_en: "A", price: 5, is_active: true }]]);
  assert.deepEqual(opsOfBatch([{ action: "update", id: 1, write: { name_en: "A" } }], stored), []);
  assert.deepEqual(opsOfBatch([{ action: "update", id: 1, write: { price: 6 } }, { action: "create", write: { is_active: true } }], stored, ["x"]), ["categories.create", "products.content", "products.create", "products.price", "products.publish"]);
});
