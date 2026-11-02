// The publish quality rule (N6): which gaps of a product BLOCK publishing it, chosen per house by the main manager, applied by ONE function to
// every way a product can become public — direct save, approved request, scheduled publication, bulk publish, import and restore of a version.
// Proves the pure rule (grandfathering, schedules, variants), the gate (fail closed, no read when nothing goes public), each path against an
// in-memory database, the save of the rule (right, lock, audit) and that every product-writing path in the source really goes through the gate.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanRules, publishBlockers, blockerCodes, goesPublic, rulesFromRow, ALL_GAP_CODES, PUBLISH_MESSAGES, blockedText, codesText } from "../lib/operator/publishRules.js";
import { readRules, gateItems, gateOne, gateBulkPublish, applyRulesToPlans } from "../lib/operator/publishGate.js";
import { savePublishRules } from "../lib/operator/publishRulesCore.js";
import { runScheduledPublishing } from "../lib/operator/scheduledPublishing.js";
import { makeProductExecutors } from "../lib/operator/approvalExecutors.js";
import { restoreVersion } from "../lib/operator/productRestoreCore.js";
import { recordVersion } from "../lib/operator/productVersions.js";
import { makeT } from "../lib/panel/i18n.js";
import tg from "../lib/panel/dict/tg.js";
import en from "../lib/panel/dict/en.js";
import { OPERATIONS, isValidOperation } from "../lib/operator/authz.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const full = (o = {}) => ({
  id: 1, slug: "p", sku: "S-1", image_url: "a.png", category_id: 3, is_active: false, publish_at: null, variant_of: null,
  specs: { Size: "M" }, name_fa: "ن", name_en: "N", name_ru: "Н", name_tg: "Н", description_fa: "د", description_en: "D", description_ru: "Д", description_tg: "Д", ...o,
});
const NOW = Date.parse("2026-10-27T10:00:00Z");
const at = (h) => new Date(NOW + h * 3_600_000).toISOString();

// ── the pure rule ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test("rule lists: only the known gap codes, de-duplicated, in the display order; a stored list with unknown codes is read leniently", () => {
  assert.deepEqual(ALL_GAP_CODES.slice(0, 3), ["image", "sku", "category"]);
  assert.equal(ALL_GAP_CODES.length, 12);
  assert.deepEqual(cleanRules(["specs", "image", "image"]), { ok: true, rules: ["image", "specs"] });
  assert.deepEqual(cleanRules([]), { ok: true, rules: [] });
  for (const bad of [null, "image", { image: true }, ["price"], ["image", 5], [null], ["IMAGE"]]) assert.deepEqual(cleanRules(bad), { ok: false, error: PUBLISH_MESSAGES.badRules }, JSON.stringify(bad));
  assert.deepEqual(rulesFromRow(["sku", "future_code", "image"]), ["image", "sku"], "a code this version does not know is ignored, never a crash");
  assert.deepEqual(rulesFromRow(null), []);
});

test("publishBlockers: only a product that goes public is judged, only by the chosen gaps; a draft is never blocked", () => {
  const rules = ["image", "name_tg", "specs"];
  assert.deepEqual(publishBlockers(full({ is_active: true, image_url: null, name_tg: "", specs: {} }), rules).map((g) => g.code), ["image", "name_tg", "specs"]);
  assert.deepEqual(publishBlockers(full({ is_active: true, image_url: null, description_tg: "" }), rules).map((g) => g.code), ["image"], "a gap that is not chosen does not block");
  assert.deepEqual(publishBlockers(full({ is_active: false, image_url: null }), rules), [], "an inactive draft with nothing scheduled may be incomplete");
  assert.deepEqual(publishBlockers(full({ is_active: true, image_url: null }), []), [], "no rule, no block (the behaviour before this feature)");
  assert.deepEqual(publishBlockers(full({ is_active: true, image_url: null }), null), []);
  assert.deepEqual(publishBlockers(null, rules), []);
  assert.equal(goesPublic(full({ is_active: true })), true);
  assert.equal(goesPublic(full({ publish_at: at(5) })), true, "a schedule is a promise to publish");
  assert.equal(goesPublic(full()), false);
  assert.deepEqual(publishBlockers(full({ publish_at: at(5), image_url: null }), rules).map((g) => g.code), ["image"], "scheduling an incomplete draft is refused too");
  assert.deepEqual(publishBlockers(full({ is_active: true, image_url: null, variant_of: 9 }), rules), [], "a variant is not a page of its own");
});

test("a product that is already live keeps its old gaps; only a gap an edit newly creates blocks that edit", () => {
  const rules = ["image", "specs", "name_tg"];
  const before = full({ is_active: true, image_url: null });
  assert.deepEqual(publishBlockers({ ...before, price: 5 }, rules, before), [], "an unrelated edit of a live product with an old gap goes through");
  assert.deepEqual(publishBlockers({ ...before, specs: {} }, rules, before).map((g) => g.code), ["specs"], "but a NEW gap is blocked (the old one is not repeated)");
  assert.deepEqual(publishBlockers({ ...before, name_tg: "" }, rules, before).map((g) => g.code), ["name_tg"]);
  // switching ON an inactive product is judged in full
  const off = full({ is_active: false, image_url: null });
  assert.deepEqual(publishBlockers({ ...off, is_active: true }, rules, off).map((g) => g.code), ["image"]);
  // a live product that gets a publish date is judged in full as well (the date is a new promise)
  assert.deepEqual(publishBlockers({ ...before, publish_at: at(3) }, rules, before).map((g) => g.code), ["image"]);
});

test("the words for the screens come out in the person's language, item by item", () => {
  const tT = makeT("tg", tg), tE = makeT("en", en), tF = makeT("fa", null);
  const res = { ok: false, error: PUBLISH_MESSAGES.blocked, publishBlocked: ["image", "name_tg", "specs"] };
  assert.match(blockedText(res, tF), /تصویر.*نام \(تاجیکی\).*مشخصات فنی/);
  assert.match(blockedText(res, tE), /Incomplete parts: Image, Name \(Tajik\), Technical specifications/i);
  assert.match(blockedText(res, tT), /Қисматҳои нопурра: /);
  assert.ok(!/[؀-ۿ]/.test(blockedText(res, tE)), "no Persian word leaks into the English text");
  assert.ok(!/[؀-ۿ]/.test(blockedText(res, tT)), "nor into the Tajik one");
  const many = { ok: false, error: "x", publishBlocked: [{ id: 1, sku: "A-1", codes: ["image"] }, { id: 2, sku: null, codes: ["sku", "specs"] }], blockedCount: 2 };
  assert.match(blockedText(many, tE), /A-1: Image · #2: Product code \(SKU\), Technical specifications/);
  assert.equal(blockedText({ error: PUBLISH_MESSAGES.unavailable }, tE), tE(PUBLISH_MESSAGES.unavailable));
  assert.equal(codesText(["nope"], tE), "nope");
});

// ── reading the rule and the gate ─────────────────────────────────────────────────────────────────────────────────────────
let versionSeq = 0;
const rulesDb = (rows, extra = {}) => createMemoryAdmin({ publish_rules: rows, products: [], beauty_products: [], product_versions: [], beauty_product_versions: [], ...extra }, {
  defaults: { publish_rules: () => ({ version: 1 }), product_versions: () => ({ id: ++versionSeq, created_at: "2026-10-02T10:00:00.000Z" }), beauty_product_versions: () => ({ id: ++versionSeq, created_at: "2026-10-02T10:00:00.000Z" }) },
  beforeUpdate: { publish_rules: (old, next) => { next.version = old.version + 1; return null; } },    // what the database trigger does
});

test("readRules: a row, no row yet, a table that does not exist (migration 46 not applied → no rule), any other failure → error", async () => {
  const db = rulesDb([{ house: "health", blocking: ["image", "bogus"], version: 3, updated_at: "t", updated_label: "sara" }]);
  assert.deepEqual(await readRules(db, "health"), { state: "ok", rules: ["image"], version: 3, updatedAt: "t", updatedLabel: "sara", ready: true });
  assert.deepEqual(await readRules(db, "beauty"), { state: "ok", rules: [], version: 0, updatedAt: null, updatedLabel: null, ready: true });
  const missing = createMemoryAdmin({});
  assert.deepEqual(await readRules(missing, "health"), { state: "none", rules: [], ready: false });
  db.fail = (table) => (table === "publish_rules" ? { code: "XX000", message: "boom" } : null);
  assert.deepEqual(await readRules(db, "health"), { state: "error" });
  assert.deepEqual(await readRules(null, "health"), { state: "error" });
});

test("the gate: nothing that goes public → the rules are not even read; an unreadable rule FAILS CLOSED for a publication only", async () => {
  const db = rulesDb([{ house: "health", blocking: ["image"], version: 1 }]);
  let reads = 0; const orig = db.from; db.from = (t) => { if (t === "publish_rules") reads++; return orig(t); };
  assert.deepEqual(await gateItems({ admin: db, house: "health", items: [{ before: null, after: full({ is_active: false, image_url: null }) }] }), { state: "ok", blocked: [] });
  assert.equal(reads, 0, "saving a draft costs nothing extra");
  const blocked = await gateOne({ admin: db, house: "health", before: null, after: full({ is_active: true, image_url: null }) });
  assert.deepEqual([blocked.ok, blocked.error, blocked.publishBlocked], [false, PUBLISH_MESSAGES.blocked, ["image"]]);
  assert.equal(await gateOne({ admin: db, house: "health", before: null, after: full({ is_active: true }) }), null, "a complete product passes");
  assert.equal(await gateOne({ admin: db, house: "beauty", before: null, after: full({ is_active: true, image_url: null }) }), null, "the other house has its own rule (none)");
  db.fail = (t) => (t === "publish_rules" ? { code: "XX000", message: "down" } : null);
  const down = await gateOne({ admin: db, house: "health", before: null, after: full({ is_active: true }) });
  assert.deepEqual([down.ok, down.error, down.publishUnavailable], [false, PUBLISH_MESSAGES.unavailable, true], "cannot read the rule → do not publish");
  assert.equal(await gateOne({ admin: db, house: "health", before: null, after: full({ is_active: false }) }), null, "…but a draft is still saved");
  assert.equal(await gateOne({ admin: createMemoryAdmin({}), house: "health", before: null, after: full({ is_active: true, image_url: null }) }), null, "migration 46 not applied: behaviour as before");
});

// ── the paths ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("approved requests are checked again when they are applied: a product that became incomplete, or a rule that was tightened, fails the request and changes nothing", async () => {
  const live = full({ id: 5, is_active: false, updated_at: "u1", image_url: null });
  const db = rulesDb([{ house: "health", blocking: ["image"], version: 1 }], { products: [live] });
  const ex = makeProductExecutors({ panel: "health", session: null, audit: async () => {} });
  const publish = { id: "r1", entity_id: 5, base_updated_at: "u1", proposed: { is_active: true }, requested_by: "u9" };
  assert.deepEqual(await ex["products.publish"]({ admin: db, request: publish }), { ok: false, error: "quality" });
  assert.equal(db.tables.products[0].is_active, false, "nothing was changed");
  db.tables.products[0].image_url = "a.png";
  assert.deepEqual(await ex["products.publish"]({ admin: db, request: publish }), { ok: true });
  assert.equal(db.tables.products[0].is_active, true);
  // a request to create a live product
  const create = { id: "r2", entity_id: null, proposed: { ...full({ is_active: true, slug: "new", sku: "N-1", image_url: null }) }, requested_by: "u9" };
  delete create.proposed.id;
  assert.deepEqual(await ex["products.create"]({ admin: db, request: create }), { ok: false, error: "quality" });
  assert.equal(db.tables.products.length, 1);
  create.proposed.is_active = false;
  assert.equal((await ex["products.create"]({ admin: db, request: create })).ok, true, "the same product as a draft is created");
  // the rule being unreadable at that moment fails the request instead of publishing
  db.tables.products[0].is_active = false;
  db.fail = (t) => (t === "publish_rules" ? { code: "XX000", message: "down" } : null);
  assert.deepEqual(await ex["products.publish"]({ admin: db, request: { ...publish, base_updated_at: db.tables.products[0].updated_at } }), { ok: false, error: "quality" });
});

test("scheduled publication: a blocked product stays inactive with its date kept and is tried again; fixing it publishes it; the counters say so", async () => {
  const logged = [];
  const audit = async (e) => logged.push(e);
  const draft = full({ id: 1, slug: "a", publish_at: at(-1), image_url: null });
  const ok = full({ id: 2, slug: "b", publish_at: at(-1) });
  const db = rulesDb([{ house: "health", blocking: ["image"], version: 1 }], { products: [draft, ok] });
  let r = await runScheduledPublishing({ admin: db, now: NOW, audit });
  assert.deepEqual(r.houses.health, { published: 1, archived: 0, cleared: 0, blocked: 1 });
  const by = () => Object.fromEntries(db.tables.products.map((p) => [p.id, p]));
  assert.deepEqual([by()[1].is_active, by()[1].publish_at], [false, at(-1)], "left exactly as it was");
  assert.deepEqual([by()[2].is_active, by()[2].publish_at], [true, null]);
  assert.ok(logged.some((e) => e.action === "product.scheduled_blocked" && e.count === 1));
  db.tables.products.find((p) => p.id === 1).image_url = "a.png";
  r = await runScheduledPublishing({ admin: db, now: NOW, audit });
  assert.deepEqual([r.houses.health.published, r.houses.health.blocked], [1, 0]);
  assert.equal(by()[1].is_active, true);
  // an unreadable rule: no scheduled publication happens (fail closed), an archive still does
  const db2 = rulesDb([], { products: [full({ id: 3, publish_at: at(-1) }), full({ id: 4, is_active: true, unpublish_at: at(-1) })] });
  db2.fail = (t) => (t === "publish_rules" ? { code: "XX000", message: "down" } : null);
  const r2 = await runScheduledPublishing({ admin: db2, now: NOW, audit });
  assert.deepEqual([r2.houses.health.published, r2.houses.health.archived, r2.houses.health.blocked], [0, 1, 1]);
  assert.equal(db2.tables.products.find((p) => p.id === 3).is_active, false);
  // a house without the rules table behaves as before
  const db3 = createMemoryAdmin({ products: [full({ id: 5, publish_at: at(-1), image_url: null })], beauty_products: [] });
  assert.equal((await runScheduledPublishing({ admin: db3, now: NOW, audit })).houses.health.published, 1);
});

test("bulk publish: the products that pass are published, the others are listed with what they lack; already-live ones always pass", async () => {
  const db = rulesDb([{ house: "health", blocking: ["image", "sku"], version: 1 }], {
    products: [full({ id: 1 }), full({ id: 2, image_url: null }), full({ id: 3, sku: "", image_url: null }), full({ id: 4, is_active: true, image_url: null })],
  });
  const g = await gateBulkPublish({ admin: db, house: "health", table: "products", ids: [1, 2, 3, 4, 99] });
  assert.equal(g.ok, true);
  assert.deepEqual(g.passIds, [1, 4, 99]);
  assert.deepEqual(g.blocked, [{ id: 2, sku: "S-1", codes: ["image"] }, { id: 3, sku: "", codes: ["image", "sku"] }]);
  assert.equal(g.blockedCount, 2); assert.equal(g.missing, 1);
  db.fail = (t) => (t === "publish_rules" ? { code: "XX000", message: "down" } : null);
  assert.deepEqual(await gateBulkPublish({ admin: db, house: "health", table: "products", ids: [1] }), { ok: false, error: PUBLISH_MESSAGES.unavailable });
  const big = rulesDb([], { products: Array.from({ length: 450 }, (_, i) => full({ id: i + 1 })) });
  assert.equal((await gateBulkPublish({ admin: big, house: "health", table: "products", ids: Array.from({ length: 450 }, (_, i) => i + 1) })).passIds.length, 450, "read in chunks");
});

test("import: an incomplete row is still saved — as an inactive draft that says what it lacks; an update never switches a product on; variants are not judged", async () => {
  const db = rulesDb([{ house: "health", blocking: ["image", "name_tg"], version: 1 }], {
    products: [full({ id: 10, is_active: false, image_url: null }), full({ id: 11, is_active: true, image_url: null }), full({ id: 12, is_active: false })],
  });
  const plans = [
    { action: "create", rowNum: 1, write: { ...full({ is_active: true, image_url: null }), id: undefined } },                       // incomplete → draft
    { action: "create", rowNum: 2, write: { ...full({ is_active: true }), id: undefined } },                                         // complete → live
    { action: "create", rowNum: 3, write: { ...full({ is_active: false, image_url: null }), id: undefined } },                      // already a draft
    { action: "update", rowNum: 4, id: 10, write: { is_active: true } },                                                              // switching on an incomplete one
    { action: "update", rowNum: 5, id: 11, write: { price: 9 } },                                                                     // live with an old gap: untouched
    { action: "update", rowNum: 6, id: 12, write: { is_active: true, image_url: "x.png" } },                                          // complete after the patch
    { action: "create", rowNum: 7, write: { ...full({ is_active: true, image_url: null, variant_of: 11 }), id: undefined } },         // a variant
    { action: "error", rowNum: 8 },
  ];
  const res = await applyRulesToPlans({ admin: db, house: "health", table: "products", plans });
  assert.deepEqual(res, { state: "ok", downgraded: 2 });
  assert.deepEqual([plans[0].write.is_active, plans[0].publishBlocked], [false, ["image"]]);
  assert.deepEqual([plans[1].write.is_active, plans[1].publishBlocked], [true, undefined]);
  assert.equal(plans[2].publishBlocked, undefined);
  assert.deepEqual([("is_active" in plans[3].write), plans[3].publishBlocked], [false, ["image"]]);
  assert.deepEqual(plans[4].write, { price: 9 });
  assert.equal(plans[5].write.is_active, true);
  assert.equal(plans[6].write.is_active, true);
  // the rule unreadable: everything that would go live is saved as a draft, and says so
  db.fail = (t) => (t === "publish_rules" ? { code: "XX000", message: "down" } : null);
  const p2 = [{ action: "create", rowNum: 1, write: { ...full({ is_active: true }), id: undefined } }, { action: "update", rowNum: 2, id: 12, write: { price: 1 } }];
  assert.equal((await applyRulesToPlans({ admin: db, house: "health", table: "products", plans: p2 })).state, "error");
  assert.deepEqual([p2[0].write.is_active, p2[0].publishUnavailable, p2[1].write, p2[1].publishUnavailable], [false, true, { price: 1 }, undefined]);
});

test("restoring an old version cannot put an incomplete product back on the site", async () => {
  const T = "2026-10-02T10:00:00.000Z";
  const db = rulesDb([{ house: "health", blocking: ["image"], version: 1 }], { products: [full({ id: 7, is_active: false, image_url: null, updated_at: T, price: 5 })] });
  await recordVersion(db, "health", { productId: 7, kind: "update", before: { is_active: true }, after: { is_active: false } });
  const vid = db.tables.product_versions[0].id;
  const ctx = { admin: db, session: { user: { id: "u1", username: "sara" } }, audit: async () => {}, evaluate: async () => ({ mode: "direct" }), file: async () => ({ ok: true }), needsApproval: false };
  const r = await restoreVersion(ctx, { panel: "health", table: "products", productId: 7, versionId: vid, expectedUpdatedAt: T, revalidate: () => {} });
  assert.deepEqual([r.ok, r.error, r.publishBlocked], [false, PUBLISH_MESSAGES.blocked, ["image"]]);
  assert.equal(db.tables.products[0].is_active, false);
  db.tables.products[0].image_url = "a.png";
  assert.equal((await restoreVersion(ctx, { panel: "health", table: "products", productId: 7, versionId: vid, expectedUpdatedAt: T, revalidate: () => {} })).ok, true);
});

// ── choosing the rule ─────────────────────────────────────────────────────────────────────────────────────────────────────
function ctxFor(db, { allow = true, panel = "health" } = {}) {
  const logged = [];
  return {
    ctx: { admin: db, session: { user: { id: "u1", username: "sara" } }, panel, audit: async (...x) => logged.push(x), require: async (op) => (allow && op === "products.publish_rules" ? null : { ok: false, denied: true, error: "no" }) },
    logged,
  };
}

test("saving the rule: needs its own right; first save creates the row; the version must be current; everything is cleaned; the change is logged", async () => {
  const db = rulesDb([]);
  const { ctx, logged } = ctxFor(db);
  assert.deepEqual(await savePublishRules(ctxFor(db, { allow: false }).ctx, ["image"], 0), { ok: false, denied: true, error: "no" });
  assert.equal(db.tables.publish_rules.length, 0);
  assert.deepEqual(await savePublishRules(ctx, ["image", "bogus"], 0), { ok: false, error: PUBLISH_MESSAGES.badRules });
  assert.deepEqual(await savePublishRules(ctx, ["sku", "image"], 0), { ok: true, rules: ["image", "sku"], version: 1 }, "stored in the display order");
  assert.deepEqual(db.tables.publish_rules[0].blocking, ["image", "sku"]);
  assert.equal(db.tables.publish_rules[0].updated_label, "sara");
  assert.equal((await savePublishRules(ctx, ["image"], 0)).conflict, true, "the screen showed version 0, the rule is at 1 now");
  assert.deepEqual(await savePublishRules(ctx, [], 1), { ok: true, rules: [], version: 2 }, "clearing all rules is a valid choice");
  assert.equal((await savePublishRules(ctx, ["specs"], "abc")).error, PUBLISH_MESSAGES.conflict);
  assert.equal((await savePublishRules(ctx, ["specs"], -1)).error, PUBLISH_MESSAGES.conflict);
  const entries = logged.filter(([a]) => a === "publish_rules.update");
  assert.equal(entries.length, 2);
  assert.deepEqual([entries[0][1].before, entries[0][1].after], [{ rules: [] }, { rules: ["image", "sku"] }]);
  // the other house is a different row
  const beauty = ctxFor(db, { panel: "beauty" }).ctx;
  assert.equal((await savePublishRules(beauty, ["name_tg"], 0)).ok, true);
  assert.deepEqual(db.tables.publish_rules.map((r) => [r.house, r.blocking]), [["health", []], ["beauty", ["name_tg"]]]);
  // not applied / unreadable
  assert.equal((await savePublishRules(ctxFor(createMemoryAdmin({})).ctx, ["image"], 0)).error, PUBLISH_MESSAGES.notReady);
  db.fail = (t) => (t === "publish_rules" ? { code: "XX000", message: "down" } : null);
  assert.equal((await savePublishRules(ctx, ["image"], 2)).error, PUBLISH_MESSAGES.generic);
});

test("the right to choose the rule: a new operation, held by the owner and the house administrator, not by a product manager", async () => {
  const { can, decide } = await import("../lib/operator/authz.js");
  assert.equal(OPERATIONS["products.publish_rules"], "products.rules");
  assert.equal(isValidOperation("products.publish_rules"), true);
  const u = (role, houses = ["health"]) => ({ id: "x", status: "active", role, houses, allow: [], deny: [], approval: {} });
  assert.equal(can(u("owner"), "health.products.rules"), true);
  assert.equal(can(u("house_admin"), "health.products.rules"), true);
  assert.equal(can(u("product_manager"), "health.products.rules"), false);
  assert.equal(can(u("viewer"), "health.products.rules"), false);
  assert.equal(can(u("house_admin"), "beauty.products.rules"), false, "only in the houses of the account");
  assert.equal(decide(u("house_admin"), "health", "products.publish_rules").mode, "direct");
  assert.equal(decide(u("product_manager"), "health", "products.publish_rules").mode, "denied");
});

// ── nothing bypasses it ───────────────────────────────────────────────────────────────────────────────────────────────────
test("every path that can make a product public goes through the gate — source pins for both houses", () => {
  for (const [f, house] of [["lib/operator/actions.js", "health"], ["lib/beauty/operator/actions.js", "beauty"]]) {
    const src = read(f);
    const fn = (name) => { const i = src.indexOf(`export async function ${name}(`); assert.ok(i >= 0, name); return src.slice(i, src.indexOf("\nexport async function", i + 10) > 0 ? src.indexOf("\nexport async function", i + 10) : undefined); };
    assert.match(fn("createProduct"), new RegExp(`gateOne\\(\\{ admin: a\\.admin, house: "${house}", before: null, after: row`));
    assert.match(fn("updateProduct"), new RegExp(`gateOne\\(\\{ admin: a\\.admin, house: "${house}", before, after: laidOver\\(before, row\\)`));
    assert.match(fn("setProductActive"), new RegExp(`gateOne\\(\\{ admin: a\\.admin, house: "${house}", before: cur`));
    assert.match(fn("quickUpdateProduct"), new RegExp(`gateOne\\(\\{ admin: a\\.admin, house: "${house}", before: was`));
    // bulk publish: ONE runner serves the ticked rows and "all filtered results" (N9), and the gate is inside it
    const runner = src.slice(src.indexOf("async function runBulk("), src.indexOf("\nexport async function", src.indexOf("async function runBulk(")));
    assert.match(runner, new RegExp(`gateBulkPublish\\(\\{ admin: a\\.admin, house: "${house}"`));
    assert.match(fn("bulkUpdateProducts"), /runBulk\(/); assert.match(fn("bulkUpdateFilteredProducts"), /runBulk\(/);
    // the gate is before the approval branch: a request that could never be applied is not filed
    for (const name of ["createProduct", "updateProduct"]) assert.ok(fn(name).indexOf("gateOne(") < fn(name).indexOf("if (needsApproval)"), `${f}:${name}`);
    assert.ok(fn("setProductActive").indexOf("gateOne(") < fn("setProductActive").indexOf("a.needsApproval"));
  }
  assert.match(read("lib/operator/approvalExecutors.js"), /gateOne\(\{ admin, house: panel, before: cur/);
  assert.match(read("lib/operator/approvalExecutors.js"), /gateOne\(\{ admin, house: panel, before: null, after: fields/);
  assert.match(read("lib/operator/scheduledPublishing.js"), /gateItems\(\{ admin, house: panel/);
  assert.match(read("lib/operator/productRestoreCore.js"), /gateOne\(\{ admin: a\.admin, house: panel, before: current, after: merged/);
  for (const f of ["lib/operator/importEngine.js", "lib/beauty/operator/importEngine.js"]) assert.match(read(f), /await applyRulesToPlans\(\{ admin, house: "(health|beauty)"/);
  assert.ok(read("lib/operator/importEngine.js").indexOf("applyRulesToPlans({") < read("lib/operator/importEngine.js").indexOf("if (options.dryRun)"), "the preview shows the same result as the import");
});

test("no other module writes is_active on a product table: the whitelist of writers is exact", () => {
  const writers = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) walk(rel); else if (/\.(js|mjs)$/.test(e.name)) {
    const src = read(rel);
    if (/is_active/.test(src) && /from\("(beauty_)?products"\)\s*\.(insert|update|upsert)|from\(table\)\s*\.(insert|update|upsert)/.test(src)) writers.push(rel);
  } } };
  walk("lib");
  // each file that writes product rows, and why it is allowed
  const allowed = new Set([
    "lib/operator/actions.js", "lib/beauty/operator/actions.js",                 // direct paths: gated above
    "lib/operator/approvalExecutors.js",                                         // approved requests: gated
    "lib/operator/scheduledPublishing.js",                                       // scheduler: gated
    "lib/operator/productRestoreCore.js",                                        // restore: gated
    "lib/operator/importEngine.js", "lib/beauty/operator/importEngine.js",       // import: plans downgraded before the write
    "lib/operator/variantActions.js",                                            // variants: not judged by design (a variant is not a page of its own)
    "lib/operator/productDelete.js",                                             // deletes
    "lib/inquiry/save.js",                                                       // writes customer requests (it only reads is_active of the product it quotes)
  ]);
  const unexpected = writers.map((w) => w.replace(/\\/g, "/")).filter((w) => !allowed.has(w));
  assert.deepEqual(unexpected, [], "a new module writes product rows: send it through lib/operator/publishGate.js and add it here");
});

test("the screens: the rules card is on both settings pages with the house's own save action; the forms and lists use the same words as the server", () => {
  for (const [f, act] of [["app/operator/(panel)/settings/page.jsx", "@/lib/operator/publishRuleActions"], ["app/beauty/operator/(panel)/settings/page.jsx", "@/lib/beauty/operator/publishRuleActions"]]) {
    const src = read(f);
    assert.ok(src.includes(`from "${act}"`), f);
    assert.match(src, /<PublishRulesCard /); assert.match(src, /canEdit=\{canEditRules\}/);
    assert.match(src, /mayView\(session, "(health|beauty)", "products\.rules"\)/);
  }
  assert.match(read("lib/operator/publishRuleActions.js"), /warehouseCtx\("health"/); assert.match(read("lib/beauty/operator/publishRuleActions.js"), /warehouseCtx\("beauty"/);
  for (const f of ["components/operator/ProductForm.jsx", "components/beauty/operator/ProductForm.jsx"]) { assert.match(read(f), /data-testid="publish-gaps"/); assert.match(read(f), /blockedText\(res, t\)/); }
  for (const f of ["components/operator/ProductsTable.jsx", "components/beauty/operator/ProductsTable.jsx"]) assert.match(read(f), /blockedText\(res, t\)/);
  for (const f of ["app/operator/(panel)/products/new/page.jsx", "app/operator/(panel)/products/[id]/edit/page.jsx", "app/beauty/operator/(panel)/products/new/page.jsx", "app/beauty/operator/(panel)/products/[id]/edit/page.jsx"]) assert.match(read(f), /publishRules=\{rules\.state === "ok" \? rules\.rules : \[\]\}/);
});
