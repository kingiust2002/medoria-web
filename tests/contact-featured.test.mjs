// Editable contact details and featured products (N11): the two new kinds of the site content (migration 51; the database side is proved on real
// PostgreSQL in site-content-contact-featured-migration.test.mjs). Proves the cleaning of phone / WhatsApp / Telegram / e-mail, what the public takes from
// a row (the live values over the defaults, judged again, newest wins), the order and de-duplication of the featured list, the actions (one contact
// per house, SKU lookup in the house's own products, no variants, no duplicates, the limit, optimistic lock, rights, house isolation) and that every
// public surface reads the details through the one reader instead of the build-time constants.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanContact, cleanContent, pickContact, pickFeaturedIds, CONTENT_MESSAGES as M, CONTENT_KINDS, FEATURED_LIMIT } from "../lib/siteContent.js";
import { contactApi, defaultContact, waLinkFor, tgLinkFor } from "../lib/contactLinks.js";
import * as content from "../lib/content/actionsCore.js";
import { requireAll } from "../lib/operator/access.js";
import { rowToUser, invalidateSessionUser } from "../lib/operator/accounts.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("contact cleaning: values are normalised, then judged; at least one is needed", () => {
  const ok = cleanContact({ phone: "+992 (90) 011-1222", whatsapp: "+992 900 111 222", telegram: "@Medoria_Health", email: " sales@example.com " });
  assert.deepEqual(ok, { ok: true, value: { phone: "+992900111222", whatsapp: "992900111222", telegram: "Medoria_Health", email: "sales@example.com" } });
  assert.deepEqual(cleanContact({ phone: "00992900111222" }).value, { phone: "+992900111222" }, "00 means +");
  assert.deepEqual(cleanContact({ whatsapp: "00992900111222" }).value, { whatsapp: "992900111222" });
  assert.deepEqual(cleanContact({ telegram: "https://t.me/medoria_tj" }).value, { telegram: "medoria_tj" });
  assert.deepEqual(cleanContact({ email: "a@b.co", phone: "" }).value, { email: "a@b.co" }, "an empty field keeps the default (it is simply absent)");
  assert.equal(cleanContact({}).error, M.no_contact); assert.equal(cleanContact({ phone: "  " }).error, M.no_contact); assert.equal(cleanContact(null).error, M.no_contact);
  assert.equal(cleanContact({ phone: "992900111222" }).error, M.bad_phone, "the + is required");
  assert.equal(cleanContact({ phone: "+99" }).error, M.bad_phone);
  assert.equal(cleanContact({ phone: "+1234567890123456" }).error, M.bad_phone, "16 digits");
  assert.equal(cleanContact({ whatsapp: "12ab34567" }).error, M.bad_whatsapp);
  assert.equal(cleanContact({ telegram: "ab" }).error, M.bad_telegram);
  assert.equal(cleanContact({ telegram: "has space" }).error, M.bad_telegram);
  assert.equal(cleanContact({ telegram: "x".repeat(33) }).error, M.bad_telegram);
  for (const bad of ["no email", "a@b", "a@@b.com", `${"a".repeat(120)}@x.com`]) assert.equal(cleanContact({ email: bad }).error, M.bad_email, bad);
  assert.deepEqual(cleanContact({ phone: "+992900111222", website: "https://x.example", evil: "<script>" }).value, { phone: "+992900111222" }, "unknown keys are dropped");
});

test("cleanContent for the new kinds", () => {
  assert.ok(CONTENT_KINDS.includes("contact") && CONTENT_KINDS.includes("featured"));
  const c = cleanContent("contact", { email: "a@b.com", sort_order: "", is_published: true });
  assert.deepEqual([c.ok, c.value.data, c.value.is_published], [true, { email: "a@b.com" }, true]);
  assert.equal(cleanContent("contact", { phone: "x" }).error, M.bad_phone);
  const f = cleanContent("featured", { product_id: "42", sort_order: "2" });
  assert.deepEqual([f.ok, f.value.data, f.value.sort_order], [true, { product_id: 42 }, 2]);
  for (const bad of [undefined, "0", "-1", "abc", "1.5", ""]) assert.equal(cleanContent("featured", { product_id: bad }).error, M.bad_product, String(bad));
  const kept = cleanContent("featured", { product_id: 999, sort_order: 1 }, { data: { product_id: 42 }, publish_at: null, unpublish_at: null });
  assert.deepEqual(kept.value.data, { product_id: 42 }, "an existing entry keeps its product");
});

test("the public takes the live values over the defaults; a bad row is ignored; the newest wins", () => {
  const defaults = { phone: "+992000000000", whatsapp: "992000000000", telegram: "medoria_tj", email: "info@example.com" };
  assert.deepEqual(pickContact([], defaults), defaults);
  assert.deepEqual(pickContact(null, {}), { phone: "", whatsapp: "", telegram: "", email: "" });
  const rows = [{ id: 1, kind: "contact", data: { phone: "+992111111111" } }, { id: 2, kind: "contact", data: { email: "new@example.com", telegram: "newname" } }, { id: 3, kind: "banner", data: { text: { en: "x" } } }];
  assert.deepEqual(pickContact(rows, defaults), { ...defaults, email: "new@example.com", telegram: "newname" }, "only the newest contact row, other kinds ignored");
  assert.deepEqual(pickContact([{ id: 1, kind: "contact", data: { phone: "javascript:1", email: "x" } }], defaults), defaults, "a hand-edited row is judged again and ignored");
  assert.deepEqual(pickContact([{ id: 1, kind: "contact", data: "text" }], defaults), defaults);
});

test("links use the house's own number and user name", () => {
  const a = contactApi({ whatsapp: "992111222333", telegram: "house_one", phone: "+992111222333", email: "x@y.com" });
  assert.equal(a.waLink("hi there"), "https://wa.me/992111222333?text=hi%20there");
  assert.equal(a.tgLink("hi"), "https://t.me/house_one?text=hi");
  assert.deepEqual([a.PHONE, a.EMAIL, a.WA_NUMBER, a.TG_USER], ["+992111222333", "x@y.com", "992111222333", "house_one"]);
  assert.equal(waLinkFor("1", "a b"), "https://wa.me/1?text=a%20b"); assert.equal(tgLinkFor("u", "m"), "https://t.me/u?text=m");
  const d = contactApi(null);
  assert.equal(d.waLink(""), `https://wa.me/${defaultContact().whatsapp}?text=`, "no provider = the built-in defaults");
});

test("featured ids: live rows in order, no repeats, junk ignored, limited", () => {
  const rows = [
    { id: 5, kind: "featured", sort_order: 2, data: { product_id: 30 } }, { id: 1, kind: "featured", sort_order: 1, data: { product_id: 20 } },
    { id: 2, kind: "featured", sort_order: 1, data: { product_id: 10 } }, { id: 3, kind: "featured", sort_order: 0, data: { product_id: 20 } },
    { id: 4, kind: "featured", sort_order: 5, data: { product_id: "x" } }, { id: 6, kind: "banner", sort_order: -1, data: { product_id: 99 } },
  ];
  assert.deepEqual(pickFeaturedIds(rows), [20, 10, 30], "by order then id; the repeat of 20 and the junk are dropped; other kinds ignored");
  assert.deepEqual(pickFeaturedIds(rows, 2), [20, 10]);
  assert.deepEqual(pickFeaturedIds([]), []);
  const many = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, kind: "featured", sort_order: i, data: { product_id: i + 1 } }));
  assert.equal(pickFeaturedIds(many).length, FEATURED_LIMIT);
});

// ── the actions ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const urow = (n, o = {}) => ({
  id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [],
  approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, ...o,
});
const boss = urow(1, { role: "house_admin" }), viewer = urow(3, { role: "viewer" });
let db, audits, purged, nextId;
function ctxFor(row, panel = "health") {
  const user = rowToUser(db.tables.operator_users.find((r) => r.id === row.id));
  const session = { sid: "s", uid: user.id, user, username: user.username };
  const audit = async (action, meta = {}) => { audits.push({ action, ...meta }); return { ok: true }; };
  return { admin: db, session, panel, audit, require: (ops) => requireAll({ session, panel, operations: [].concat(ops), audit }), revalidate: () => purged.push(panel) };
}
beforeEach(() => {
  invalidateSessionUser();
  audits = []; purged = []; nextId = 0;
  const products = [
    { id: 5, sku: "SKU-5", name_en: "Five", is_active: true, variant_of: null }, { id: 6, sku: "SKU-6", name_en: "Six", is_active: false, variant_of: null },
    { id: 7, sku: "SKU-7", name_en: "Seven (variant)", is_active: true, variant_of: 5 }, { id: 8, sku: "DUP", name_en: "A", is_active: true, variant_of: null }, { id: 9, sku: "DUP", name_en: "B", is_active: true, variant_of: null },
  ];
  db = createMemoryAdmin({ operator_users: [boss, viewer], site_content: [], products, beauty_products: [{ id: 5, sku: "BEAUTY-5", name_en: "Cream", is_active: true, variant_of: null }] }, {
    unique: { site_content: [] },
    defaults: { site_content: () => ({ id: ++nextId, version: 1, created_at: "2026-10-01T10:00:00.000Z", updated_at: "2026-10-01T10:00:00.000Z" }) },
    beforeUpdate: { site_content: (old, next) => { next.version = old.version + 1; return null; } },
  });
});

test("contact: one row per house, created, edited with the version lock, purged and logged; a viewer can do nothing", async () => {
  const c = ctxFor(boss);
  const made = await content.createContent(c, "contact", { phone: "+992 900 111 222", email: "h@example.com", is_published: true });
  assert.equal(made.ok, true); assert.deepEqual(made.row.data, { phone: "+992900111222", email: "h@example.com" }); assert.deepEqual(purged, ["health"]);
  assert.equal((await content.createContent(c, "contact", { email: "again@example.com" })).error, M.contact_exists);
  assert.equal(db.tables.site_content.length, 1);
  const upd = await content.updateContent(c, made.row.id, { phone: "+992900111222", email: "h@example.com", telegram: "@house_health", is_published: true }, made.row.version);
  assert.equal(upd.ok, true); assert.equal(upd.row.data.telegram, "house_health");
  assert.equal((await content.updateContent(c, made.row.id, { email: "x@y.com", is_published: true }, made.row.version)).stale, true, "the old version is refused");
  assert.equal((await content.createContent(ctxFor(boss, "beauty"), "contact", { email: "b@example.com" })).denied, true, "this person has no Beauty rights");
  const v = ctxFor(viewer);
  assert.equal((await content.createContent(v, "contact", { email: "v@example.com" })).denied, true);
  assert.equal((await content.updateContent(v, made.row.id, { email: "v@example.com" }, 1)).denied, true);
  assert.ok(audits.some((a) => a.action === "content.create" && a.detail?.kind === "contact"));
  assert.ok(!JSON.stringify(audits).includes("h@example.com"), "the log names the kind and fields, not the values");
  assert.equal((await content.createContent(c, "contact", { phone: "nope" })).error, M.bad_phone);
});

test("featured: a SKU of this house's own products, no variants, no repeats, the limit, the list shows the products", async () => {
  const c = ctxFor(boss);
  const a = await content.createContent(c, "featured", { sku: "SKU-5", sort_order: 2, is_published: true });
  assert.equal(a.ok, true); assert.deepEqual(a.row.data, { product_id: 5 });
  assert.equal((await content.createContent(c, "featured", { sku: "SKU-5" })).error, M.featured_exists);
  assert.equal((await content.createContent(c, "featured", { product_id: 5 })).error, M.featured_exists);
  assert.equal((await content.createContent(c, "featured", { sku: "NOPE" })).error, M.bad_product);
  assert.equal((await content.createContent(c, "featured", { sku: "DUP" })).error, M.bad_product, "an ambiguous SKU is never guessed");
  assert.equal((await content.createContent(c, "featured", { sku: "SKU-7" })).error, M.bad_product, "a variant cannot be featured");
  assert.equal((await content.createContent(c, "featured", { sku: "BEAUTY-5" })).error, M.bad_product, "the other house's product");
  assert.equal((await content.createContent(c, "featured", { product_id: 4242 })).error, M.bad_product);
  const inactive = await content.createContent(c, "featured", { sku: "SKU-6", sort_order: 1 });
  assert.equal(inactive.ok, true, "an inactive product can be listed (it is simply not shown until active)");
  const list = await content.listContent(db, "health");
  assert.equal(list.ok, true); assert.equal(list.products[5].sku, "SKU-5"); assert.equal(list.products[6].is_active, false);
  const upd = await content.updateContent(c, a.row.id, { product_id: 9, sort_order: 7, is_published: true }, a.row.version);
  assert.deepEqual([upd.ok, upd.row.data, upd.row.sort_order], [true, { product_id: 5 }, 7], "the product never changes on an edit");
  // the limit
  db.tables.site_content = Array.from({ length: FEATURED_LIMIT }, (_, i) => ({ id: 100 + i, house: "health", kind: "featured", data: { product_id: 1000 + i }, sort_order: i, is_published: true, version: 1 }));
  assert.equal((await content.createContent(c, "featured", { sku: "SKU-5" })).error, M.featured_full);
  assert.equal((await content.createContent(ctxFor(viewer), "featured", { sku: "SKU-5" })).denied, true);
});

test("featured entries of the other house are not visible to this one", async () => {
  db.tables.site_content.push({ id: 900, house: "beauty", kind: "featured", data: { product_id: 5 }, sort_order: 0, is_published: true, version: 1 });
  const list = await content.listContent(db, "health");
  assert.equal(list.rows.filter((r) => r.kind === "featured").length, 0);
});

test("wiring: every public surface reads the details through the one reader; the old rule stays as the fallback", () => {
  for (const f of ["app/health/[lang]/layout.jsx", "app/beauty/[lang]/layout.jsx"]) { const s = read(f); assert.match(s, /getHouseContact\("(health|beauty)"\)/, f); assert.match(s, /<ContactProvider value=\{contact\}>/, f); }
  const noConst = ["components", "app"].flatMap((d) => walk(d)).filter((f) => !/node_modules/.test(f));
  for (const f of noConst) {
    const s = read(f);
    assert.doesNotMatch(s, /process\.env\.NEXT_PUBLIC_(PHONE|WA_NUMBER|TG_USERNAME|EMAIL_HEALTH|EMAIL_BEAUTY)\b/, `${f}: reads a build-time constant instead of the live details`);
    if (!f.startsWith("app/page.jsx")) assert.doesNotMatch(s, /\bimport\s*\{[^}]*\b(WA_NUMBER|TG_USER)\b[^}]*\}\s*from\s*"@\/lib\/whatsapp"/, `${f}: imports the constant number`);
    assert.doesNotMatch(s, /\bimport\s*\{[^}]*\b(waLink|tgLink)\b[^}]*\}\s*from\s*"@\/lib\/whatsapp"/, `${f}: imports the constant-bound link builders`);
    assert.doesNotMatch(s, /\bimport\s*\{[^}]*\b(EMAIL_HEALTH|EMAIL_BEAUTY)\b[^}]*\}\s*from\s*"@\/lib\/contact"/, `${f}: imports the constant e-mail`);
  }
  for (const f of ["app/api/chat/route.js", "app/api/beauty-chat/route.js"]) assert.match(read(f), /contact\.whatsapp/, f);
  assert.match(read("app/beauty/[lang]/page.jsx"), /getLiveFeatured\("beauty", HERO_FEATURED\)\.then\(\(live\) => \(live\.length \? live : getBeautyProducts\(\{ featured: true/);
  assert.match(read("components/beauty/home/FeaturedProducts.jsx"), /live\.length \? live : await getBeautyProducts\(\{ featured: true/);
  assert.match(read("app/health/[lang]/page.jsx"), /getLiveFeatured\("health", 6\)/);
  assert.match(read("components/home/Hero.jsx"), /operatorFeatured\.length/); assert.match(read("components/home/FeaturedProducts.jsx"), /getProducts\(\{ limit: 6 \}\)/, "the old rule is still there");
  const live = read("lib/featuredLive.js");
  assert.match(live, /\.eq\("is_active", true\)/); assert.match(live, /variant_of == null/); assert.match(live, /import "server-only"/);
  assert.match(read("lib/contactLive.js"), /import "server-only"/);
});
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(rel)); else if (/\.(js|jsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}
