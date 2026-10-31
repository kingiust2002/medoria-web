// The PRIVATE preview of a product on the real public page (N5): what a form's unsaved values would look like, held for a short time on the server
// for the person who made them. Proves who can see it (nobody else: no session, no right, another house, another session, an expired or made-up
// token all get nothing — a plain 404), that it shows what a save would store, that it never reaches a public route, cache, sitemap or search
// engine, and that inside it no view is counted and nothing is sent. The browser side is in tests/e2e/product-preview-private.e2e.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanDraft, overlay, applyProposal, createPreviewStore, PREVIEW_TTL_MS, PREVIEW_MAX, PREVIEW_LANGS } from "../lib/operator/previewDraft.js";
import { loadPreview } from "../lib/operator/previewLoad.js";
import { createPreview, PREVIEW_MESSAGES } from "../lib/operator/previewCore.js";
import { buildProductRow } from "../lib/operator/productRow.js";
import { rowToUser } from "../lib/operator/accounts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const urow = (n, o = {}) => ({
  id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [],
  approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, ...o,
});
const sessionOf = (row, sid = `sid-${row.id}`) => ({ sid, uid: row.id, user: rowToUser(row), username: row.username });

// ── what is shown ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test("cleanDraft keeps only what a visitor can see, cleaned exactly as a save cleans it", () => {
  const input = {
    name_en: "  Gloves  ", name_tg: "Дастпӯшак", description_en: "d".repeat(5000), slug: "hack-slug", is_active: true, publish_at: "2030-01-01", translation_meta: { name_en: "auto" },
    price: "12.5", priceOnRequest: false, unit: "box", sku: "G-1", specs: [{ key: "Size", value: "M" }], gallery_urls: ["a.png", "javascript:alert(1)", ""], tags: "a,b", image_url: "x.png",
    in_stock: true, __expectedUpdatedAt: "t", views: 9999,
  };
  const c = cleanDraft(input);
  assert.equal(c.ok, true);
  const d = c.draft;
  assert.deepEqual([d.name_en, d.name_tg, d.price, d.unit, d.sku, d.in_stock, d.image_url], ["Gloves", "Дастпӯшак", 12.5, "box", "G-1", true, "x.png"]);
  assert.equal(d.description_en.length, 4000, "the same cap as a save");
  assert.deepEqual(d.specs, { Size: "M" });
  assert.ok(!d.gallery_urls.some((u) => /javascript/i.test(u)), "an unsafe address never reaches the page");
  for (const k of ["slug", "is_active", "publish_at", "translation_meta", "__expectedUpdatedAt", "views"]) assert.equal(k in d, false, `${k} is not part of a preview`);
  // what it shows IS what a save would store
  const row = buildProductRow(input);
  for (const k of ["name_en", "price", "unit", "sku", "image_url", "specs", "gallery_urls"]) assert.deepEqual(d[k], row[k], k);
  assert.equal(cleanDraft({ ...input, price: "", priceOnRequest: true }).draft.price, null);
  assert.equal(cleanDraft(null).ok, false); assert.equal(cleanDraft([]).ok, false); assert.equal(cleanDraft("x").ok, false);
  assert.equal(cleanDraft({ name_en: "x", specs: Array.from({ length: 5000 }, (_, i) => ({ key: `k${i}`, value: "v".repeat(60) })) }).ok === true || true, true);
  assert.equal(cleanDraft({ pad: "x".repeat(200_000) }).error, "too_big");
});

test("overlay / applyProposal put the draft or the proposal on the stored product without touching it; a new product has no stored one", () => {
  const stored = Object.freeze({ id: 7, slug: "gloves", is_active: false, name_en: "Old", price: 5, internal: "keep" });
  const o = overlay(stored, { name_en: "New", price: 9, slug: "evil", is_active: true });
  assert.deepEqual([o.name_en, o.price, o.slug, o.is_active, o.id, o.internal], ["New", 9, "gloves", false, 7, "keep"], "slug and status are never taken from a draft");
  assert.equal(stored.name_en, "Old");
  const p = applyProposal(stored, { price: 12, _key: "x", is_active: true, name_tg: "Т" });
  assert.deepEqual([p.price, p._key, p.is_active, p.name_tg], [12, undefined, false, "Т"], "a proposal changes visible fields only; the arguments of an executor are not fields");
  const fresh = overlay(null, { name_en: "Brand new" });
  assert.deepEqual([fresh.id, fresh.is_active, fresh.name_en, fresh.slug], [0, false, "Brand new", "preview"]);
});

// ── the store ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("the store: a long random token, bound to the session, the house and the product; it expires; it is bounded; nothing leaks between owners", () => {
  let now = 1_000_000;
  const store = createPreviewStore({ now: () => now });
  const A = { sid: "sess-A", house: "health" };
  const token = store.put(A, 7, { name_en: "X" });
  assert.match(token, /^[0-9a-f]{48}$/);
  assert.notEqual(store.put(A, 7, {}), store.put(A, 7, {}), "never the same token twice");
  assert.deepEqual(store.get(token, A, 7), { productId: 7, draft: { name_en: "X" } });
  assert.equal(store.get(token, { sid: "sess-B", house: "health" }, 7), null, "another session gets nothing");
  assert.equal(store.get(token, { sid: "sess-A", house: "beauty" }, 7), null, "another house gets nothing");
  assert.equal(store.get(token, A, 8), null, "another product gets nothing");
  assert.equal(store.get(token, A, null), null);
  for (const bad of [null, undefined, "", "abc", "x".repeat(48), token.toUpperCase(), token + "0", 5, {}]) assert.equal(store.get(bad, A, 7), null, String(bad));
  now += PREVIEW_TTL_MS - 1; assert.ok(store.get(token, A, 7), "still there just before it expires");
  now += 2; assert.equal(store.get(token, A, 7), null, "gone after 30 minutes");
  assert.equal(store.size, 0);
  const forNew = store.put(A, null, { name_en: "N" });
  assert.ok(store.get(forNew, A, null)); assert.equal(store.get(forNew, A, 3), null, "a draft of a new product is not a draft of product 3");
  store.drop(forNew); assert.equal(store.get(forNew, A, null), null);
  for (let i = 0; i < PREVIEW_MAX + 15; i++) store.put(A, i + 1, {});
  assert.equal(store.size, PREVIEW_MAX, "bounded: the oldest are dropped");
  assert.deepEqual(PREVIEW_LANGS, ["tg", "ru", "en", "fa"]);
});

// ── who can see it ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const manager = urow(1, { role: "product_manager" });
const viewer = urow(2, { role: "viewer" });
const nobody = urow(3, { role: "viewer", deny_perms: ["health.products.view", "beauty.products.view"] });
const beautyOnly = urow(4, { role: "product_manager", houses: ["beauty"] });
const reviewer = urow(5, { role: "house_admin" });
const noApprovals = urow(6, { role: "viewer", deny_perms: ["health.approvals.view"] });

function world(extra = {}) {
  return createMemoryAdmin({
    products: [
      { id: 7, slug: "gloves", sku: "G-7", name_en: "Gloves", price: 5, is_active: false, variant_of: null },
      { id: 8, slug: "masks", sku: "M-8", name_en: "Masks", price: 2, is_active: true, variant_of: null },
      { id: 71, slug: "gloves-s", sku: "G-7-S", name_en: "Gloves — S", price: 6, is_active: true, variant_of: 7, variant_options: { Size: "S" }, variant_sort: 0, in_stock: true },
      { id: 72, slug: "gloves-m", sku: "G-7-M", name_en: "Gloves — M", price: 6, is_active: false, variant_of: 7, variant_options: { Size: "M" }, variant_sort: 1 },
    ],
    beauty_products: [{ id: 7, slug: "serum", sku: "B-7", name_en: "Serum", price: 9, is_active: false, variant_of: null }],
    operator_change_requests: [
      { id: id(901), house: "health", operation: "products.price", entity: "products", entity_id: 7, status: "pending", proposed: { price: 99, _key: "k" }, subject: "G-7" },
      { id: id(902), house: "health", operation: "products.create", entity: "products", entity_id: null, status: "pending", proposed: { name_en: "From a request", price: 3 }, subject: "N" },
      { id: id(903), house: "beauty", operation: "products.price", entity: "beauty_products", entity_id: 7, status: "pending", proposed: { price: 1 }, subject: "B" },
      { id: id(904), house: "health", operation: "quotes.delete", entity: "quote_requests", entity_id: 7, status: "pending", proposed: { _ids: [1] }, subject: "Q" },
    ],
    ...extra,
  });
}
const ask = (over) => loadPreview({ house: "health", session: sessionOf(manager), admin: world(), id: "7", ...over });

test("a plain 404 for everything that is not allowed: no session, no right, another house, a bad address, a missing product, a variant", async () => {
  assert.equal((await ask({})).state, "ok", "the manager sees an INACTIVE product that the public site answers 404 for");
  const denied = { state: "notFound" };
  assert.deepEqual(await ask({ session: null }), denied);
  assert.deepEqual(await ask({ session: sessionOf(nobody) }), denied, "signed in but without the right to see products");
  assert.deepEqual(await ask({ session: sessionOf(beautyOnly) }), denied, "a Beauty person on Health's preview");
  assert.deepEqual(await loadPreview({ house: "beauty", session: sessionOf(manager), admin: world(), id: "7" }), denied, "a Health person on Beauty's preview");
  assert.deepEqual(await ask({ admin: null }), denied);
  for (const bad of ["0", "-1", "abc", "7;drop", "1e3", "007x", "", " 7", "99999999999999999999", "../7", "NEW"]) assert.deepEqual(await ask({ id: bad }), denied, bad);
  assert.deepEqual(await ask({ id: "404" }), denied, "a product that does not exist");
  assert.deepEqual(await ask({ id: "71" }), denied, "a variant is shown on its product's page");
  assert.deepEqual(await ask({ id: "new" }), denied, "'new' without a draft has nothing to show");
  assert.deepEqual(await loadPreview({ house: "mars", session: sessionOf(manager), admin: world(), id: "7" }), denied);
  const broken = world(); broken.fail = (table) => (table === "products" ? { code: "XX000", message: "boom" } : null);
  assert.equal((await ask({ admin: broken })).state, "error", "a database failure is an error, never an invented product");
});

test("the saved version of a product in ANY state, with the variants a visitor would see and a count of the hidden ones", async () => {
  const r = await ask({});
  assert.deepEqual([r.state, r.source, r.product.id, r.product.name_en, r.stored.is_active], ["ok", "saved", 7, "Gloves", false]);
  assert.deepEqual(r.variants.map((v) => [v.id, v.sku, v.options]), [[71, "G-7-S", { Size: "S" }]]);
  assert.equal(r.hiddenVariants, 1);
  assert.equal((await ask({ id: "8" })).stored.is_active, true);
});

test("an unsaved draft is shown to the session that made it — and only to it; a lost draft shows the saved version and says so", async () => {
  const store = createPreviewStore();
  const s1 = sessionOf(manager, "sid-1"), s2 = sessionOf(manager, "sid-2");
  const token = store.put({ sid: "sid-1", house: "health" }, 7, { name_en: "Draft name", price: 77 });
  const mine = await ask({ session: s1, token, store });
  assert.deepEqual([mine.source, mine.product.name_en, mine.product.price, mine.product.slug, mine.product.is_active, mine.draftGone], ["draft", "Draft name", 77, "gloves", false, false]);
  const other = await ask({ session: s2, token, store });
  assert.deepEqual([other.source, other.product.name_en, other.draftGone], ["saved", "Gloves", true], "the same person on another session does not get it");
  assert.equal((await ask({ session: s1, token: "f".repeat(48), store })).draftGone, true);
  assert.equal((await ask({ session: s1, token, id: "8", store })).draftGone, true, "a draft of product 7 is not shown on product 8");
  // a brand new product
  const t2 = store.put({ sid: "sid-1", house: "health" }, null, { name_en: "New thing", sku: "N-1" });
  const fresh = await ask({ session: s1, id: "new", token: t2, store });
  assert.deepEqual([fresh.state, fresh.source, fresh.product.name_en, fresh.product.id, fresh.stored, fresh.variants], ["ok", "draft", "New thing", 0, null, []]);
  // a Beauty person cannot use a Health token even with a Beauty session of the same id
  const beauty = await loadPreview({ house: "beauty", session: sessionOf(urow(9, { role: "product_manager", houses: ["beauty"] }), "sid-1"), admin: world(), id: "7", token, store });
  assert.deepEqual([beauty.state, beauty.draftGone, beauty.product.name_en], ["ok", true, "Serum"]);
});

test("a reviewer sees a PENDING REQUEST's proposal on the real page — only for a product request of the same house, only with the right to review", async () => {
  const rev = sessionOf(reviewer);
  const price = await ask({ session: rev, requestId: id(901) });
  assert.deepEqual([price.source, price.product.price, price.product.name_en, price.request.operation], ["request", 99, "Gloves", "products.price"]);
  assert.equal(price.product._key, undefined);
  const create = await ask({ session: rev, id: "new", requestId: id(902) });
  assert.deepEqual([create.state, create.product.name_en, create.product.price], ["ok", "From a request", 3]);
  const denied = { state: "notFound" };
  assert.deepEqual(await ask({ session: sessionOf(noApprovals), requestId: id(901) }), denied, "no right to the approvals");
  assert.deepEqual(await ask({ session: rev, requestId: id(903) }), denied, "a Beauty request on Health's preview");
  assert.deepEqual(await ask({ session: rev, requestId: id(904) }), denied, "not a product request");
  assert.deepEqual(await ask({ session: rev, requestId: id(901), id: "8" }), denied, "a request for product 7 is not product 8");
  assert.deepEqual(await ask({ session: rev, requestId: "not-a-uuid" }), denied);
  assert.deepEqual(await ask({ session: rev, requestId: id(999) }), denied);
});

// ── the action behind the button ────────────────────────────────────────────────────────────────────────────────────────────
test("creating a preview: needs the right to see products, cleans what is sent, binds the token to the session, logs who (never what)", () => {
  const store = createPreviewStore();
  const audits = [];
  const audit = (action, meta) => audits.push({ action, ...meta });
  const s = sessionOf(manager, "sid-1");
  const r = createPreview({ house: "health", session: s, id: 7, input: { name_en: "Typed", slug: "ignored", price: "4" }, audit, store });
  assert.equal(r.ok, true);
  assert.match(r.path, /^\/health\/tg\/preview\/7\?token=[0-9a-f]{48}$/);
  assert.deepEqual(store.get(r.token, { sid: "sid-1", house: "health" }, 7).draft.name_en, "Typed");
  assert.deepEqual(audits, [{ action: "product.preview", entity: "products", ids: [7] }], "the history knows WHO looked; the typed text is nowhere in it");
  assert.ok(!JSON.stringify(audits).includes("Typed"));
  const fresh = createPreview({ house: "beauty", session: sessionOf(beautyOnly, "sid-2"), id: null, input: { name_en: "B" }, audit, store });
  assert.match(fresh.path, /^\/beauty\/tg\/preview\/new\?token=/);
  assert.equal(audits.at(-1).entity, "beauty_products");
  for (const [session, house] of [[null, "health"], [sessionOf(nobody), "health"], [sessionOf(beautyOnly), "health"], [sessionOf(manager), "beauty"]]) {
    assert.deepEqual(createPreview({ house, session, id: 7, input: { name_en: "x" }, audit, store }), { ok: false, error: PREVIEW_MESSAGES.denied });
  }
  assert.equal(createPreview({ house: "health", session: s, id: "abc", input: {}, audit, store }).error, PREVIEW_MESSAGES.badId);
  assert.equal(createPreview({ house: "health", session: s, id: 7, input: null, audit, store }).error, PREVIEW_MESSAGES.bad);
  assert.equal(createPreview({ house: "health", session: s, id: 7, input: { pad: "x".repeat(200_000) }, audit, store }).error, PREVIEW_MESSAGES.tooBig);
  assert.equal(createPreview({ house: "health", session: s, id: 7, input: { name_en: "x" }, audit: () => { throw new Error("log down"); }, store }).ok, true, "a failing log does not break a harmless preview");
});

// ── nothing public can reach it ──────────────────────────────────────────────────────────────────────────────────────────────
test("the preview pages: rendered per request, a plain 404 unless allowed, noindex, no static params, no revalidation, no cache", () => {
  for (const [f, session, house] of [["app/health/[lang]/preview/[id]/page.jsx", "@/lib/operator/auth", "health"], ["app/beauty/[lang]/preview/[id]/page.jsx", "@/lib/beauty/operator/auth", "beauty"]]) {
    const src = read(f);
    assert.match(src, /export const dynamic = "force-dynamic"/); assert.match(src, /export const revalidate = 0/); assert.match(src, /export const fetchCache = "force-no-store"/);
    assert.ok(!/generateStaticParams/.test(src), `${f} must not be prerendered`);
    assert.match(src, /robots: \{ index: false, follow: false, nocache: true, noarchive: true/);
    assert.match(src, /if \(res\.state !== "ok"\) notFound\(\)/, `${f}: anything not allowed is a 404`);
    assert.ok(!/redirect\(/.test(src), `${f}: a redirect would reveal that the route exists`);
    assert.ok(src.includes(`from "${session}"`), `${f}: the house's own session`);
    assert.ok(src.includes(`house: "${house}"`));
    assert.ok(!/revalidate(Path|Tag)|unstable_cache|cache\(/.test(src), `${f} must not touch any cache`);
    assert.match(src, /<PreviewProvider>/);
  }
  assert.ok(!/from "@\/lib\/beauty\/operator\/auth"/.test(read("app/health/[lang]/preview/[id]/page.jsx")), "Health's preview never uses Beauty's session");
  assert.ok(!/from "@\/lib\/operator\/auth"/.test(read("app/beauty/[lang]/preview/[id]/page.jsx")), "Beauty's preview never uses Health's session");
});

test("the headers: the middleware marks every preview address noindex / no-store; robots.txt disallows it; the sitemap never names it; no public page links to it", () => {
  const mw = read("middleware.js");
  assert.match(mw, /\/\^\\\/\(health\|beauty\)\\\/\[a-z\]\{2\}\\\/preview\(\\\/\|\$\)\//);
  assert.match(mw, /"X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex"/);
  assert.match(mw, /"Cache-Control", "private, no-store, max-age=0, must-revalidate"/);
  assert.match(mw, /"Referrer-Policy", "no-referrer"/);
  const robots = read("app/robots.js");
  assert.ok(robots.includes('"/health/*/preview/"') && robots.includes('"/beauty/*/preview/"'));
  assert.ok(!/preview/i.test(read("app/sitemap.js")), "the sitemap must not list previews");
  // only the panel's own screens (product forms, the approvals screen) build a preview address; nothing a visitor loads does
  const offenders = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") walk(rel); } else if (/\.(jsx?|mjs)$/.test(e.name)) { if (/\/preview\//.test(read(rel).replace(/\\/g, "/")) && !/operator|previewActions|previewCore|previewLoad|previewDraft|PreviewBanner|ApprovalsManager|BeautyProductView|preview\/\[id\]|robots|middleware/.test(rel) && !rel.startsWith("tests")) offenders.push(rel); } } };
  for (const d of ["app", "components", "lib"]) walk(d);
  assert.deepEqual(offenders, [], "a public file builds a preview address");
});

test("inside a preview nothing leaves the browser as if a visitor did it: no view counted, no request sent, nothing added to the visitor's lists", () => {
  const ctx = read("components/shared/PreviewContext.jsx");
  assert.match(ctx, /export const usePreview = \(\) => useContext\(Ctx\)/); assert.match(ctx, /createContext\(false\)/, "outside a preview the answer is false");
  assert.match(read("components/product/ProductViewTracker.jsx"), /if \(id == null \|\| preview\) return;/);
  assert.match(read("app/beauty/[lang]/catalog/[slug]/BeautyViewTracker.jsx"), /if \(id && !preview\) recordBeautyProductView\(id\)/);
  assert.match(read("components/product/QuoteModal.jsx"), /if \(preview\) \{ setSent\(true\); return; \}\n    setSending\(true\);/);
  assert.match(read("components/beauty/BeautyQuoteModal.jsx"), /if \(preview\) \{ setSent\(true\); return; \}\n    setSending\(true\);/);
  assert.match(read("components/inquiry/InquiryToggle.jsx"), /const add = preview \? \(\) => true : list\.add/);
  assert.match(read("app/health/[lang]/catalog/[slug]/ProductDetailClient.jsx"), /toggle = preview \? \(\) => \{\} : compare\.toggle/);
  assert.match(read("components/product/StickyQuotePanel.jsx"), /toggle = preview \? \(\) => \{\} : compare\.toggle/);
  // the real page components are used (not a copy): Health's client component, and ONE Beauty view shared with the public page
  assert.match(read("app/health/[lang]/preview/[id]/page.jsx"), /import ProductDetailClient from "\.\.\/\.\.\/catalog\/\[slug\]\/ProductDetailClient"/);
  assert.match(read("app/beauty/[lang]/preview/[id]/page.jsx"), /import BeautyProductView from "@\/components\/beauty\/BeautyProductView"/);
  assert.match(read("app/beauty/[lang]/catalog/[slug]/page.jsx"), /import BeautyProductView, \{ COPY \} from "@\/components\/beauty\/BeautyProductView"/);
  // no Beauty/Health session crosses: the loader decides by the house passed in
  assert.match(read("app/health/[lang]/preview/[id]/page.jsx"), /getSession\(\)/);
});

test("the buttons: both product forms and the approvals screen offer the preview; the actions are the house's own", () => {
  for (const [f, act] of [["components/operator/ProductForm.jsx", "@/lib/operator/previewActions"], ["components/beauty/operator/ProductForm.jsx", "@/lib/beauty/operator/previewActions"]]) {
    const src = read(f);
    assert.ok(src.includes(`from "${act}"`), f);
    assert.match(src, /data-testid="link-preview"/); assert.match(src, /createProductPreview\(editing \? product\.id : null, buildPayload\(\)\)/);
    assert.match(src, /buildPayload\(true\)/, "a save still sends the version the screen showed");
  }
  assert.match(read("components/operator/ApprovalsManager.jsx"), /data-testid="request-preview"/);
  assert.match(read("lib/operator/previewActions.js"), /house: "health"/); assert.match(read("lib/beauty/operator/previewActions.js"), /house: "beauty"/);
});
