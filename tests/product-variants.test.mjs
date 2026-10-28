// Product variants (N3), behaviour: the pure helpers (options, derived names, the choice on the product page, schema.org), the shared save
// logic of both houses (rights, approval, SKU rules, version lock, history), the panel lists that show products and not their variants
// (and still work before migration 44), the import that refuses to rewrite a variant, and the public pages that read variants only
// through the database functions. The SQL itself runs on a real PostgreSQL in product-variants-migration.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import {
  cleanOptions, optionLabel, optionsKey, deriveNames, buildVariantRow, groupAxes, findVariant, availableValues, pickVariant, defaultVariant, variantView, variantsJsonLd, VARIANT_LIMITS, VARIANT_MESSAGES,
} from "../lib/operator/variants.js";
import { saveVariantCore, listVariantRows, variantDbError } from "../lib/operator/variantActions.js";
import { readProductsPage, readDashboard, readProductCounts, readBrandRoster } from "../lib/operator/listReaders.js";
import { resetVariantScope, variantsReady } from "../lib/operator/variantScope.js";
import { parseProductParams } from "../lib/operator/listQuery.js";
import { normalizeRow, planBatch } from "../lib/operator/importCore.js";
import { makeProductExecutors } from "../lib/operator/approvalExecutors.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// ── pure helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("options: pairs are cleaned, an empty row of the form is ignored, bad ones are refused", () => {
  assert.deepEqual(cleanOptions([{ key: " Size ", value: "M" }, { key: "", value: "" }, { key: "Colour", value: "Blue" }]), { ok: true, options: { Size: "M", Colour: "Blue" } });
  assert.deepEqual(cleanOptions({ size: "L" }).options, { size: "L" });
  assert.equal(cleanOptions([]).error, VARIANT_MESSAGES.noOptions);
  assert.equal(cleanOptions([{ key: "", value: "" }]).error, VARIANT_MESSAGES.noOptions);
  assert.equal(cleanOptions(null).error, VARIANT_MESSAGES.noOptions);
  assert.equal(cleanOptions([{ key: "size", value: "" }]).error, VARIANT_MESSAGES.badOption);
  assert.equal(cleanOptions([{ key: "", value: "M" }]).error, VARIANT_MESSAGES.badOption);
  assert.equal(cleanOptions([{ key: "Size", value: "M" }, { key: "size", value: "L" }]).error, VARIANT_MESSAGES.badOption, "the same axis twice, whatever the case");
  assert.equal(cleanOptions([{ key: "x".repeat(VARIANT_LIMITS.key + 1), value: "M" }]).error, VARIANT_MESSAGES.badOption);
  assert.equal(cleanOptions([{ key: "a", value: "v".repeat(VARIANT_LIMITS.value + 1) }]).error, VARIANT_MESSAGES.badOption);
  assert.equal(cleanOptions([{ key: "__proto__", value: "x" }]).error, VARIANT_MESSAGES.badOption, "no key that could shadow an object internal");
  assert.equal(cleanOptions([1, 2, 3, 4].map((i) => ({ key: `k${i}`, value: "v" }))).error, VARIANT_MESSAGES.tooManyOptions);
  assert.equal(cleanOptions([{ key: "a\u0000b‮", value: "v\n w" }]).options["a b"], "v w", "control and bidi characters become spaces");
});

test("the same options in any order are the same variant; the label is the values", () => {
  assert.equal(optionsKey({ Size: "M", Colour: "Blue" }), optionsKey({ colour: "blue", size: "m" }));
  assert.notEqual(optionsKey({ size: "M" }), optionsKey({ size: "L" }));
  assert.equal(optionLabel({ Size: "M", Colour: "Blue" }), "M / Blue");
});

const parent = { id: 1, slug: "gloves", sku: "G-1", name_en: "Gloves", name_fa: "دستکش", name_ru: null, brand: "Acme", category: "ppe", category_id: 4, unit: "box", min_order_qty: 5, price: 10, currency: "USD", image_url: "p.png" };

test("a variant row: own SKU and options, names derived from the parent, the rest inherited, never featured", () => {
  const r = buildVariantRow(parent, { options: [{ key: "Size", value: "M" }], sku: " G-1-M ", price: "12.5", in_stock: false, sort: "3" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.row, {
    variant_of: 1, variant_options: { Size: "M" }, variant_sort: 3, sku: "G-1-M",
    name_en: "Gloves — M", name_fa: "دستکش — M",
    brand: "Acme", category: "ppe", category_id: 4, unit: "box", min_order_qty: 5,
    price: 12.5, in_stock: false, is_active: true, is_featured: false, image_url: null, currency: "USD", slug: "gloves-g-1-m",
  });
  assert.equal(deriveNames(parent, { Size: "M" }).name_ru, undefined, "no name in a language the parent has none in");
  const onRequest = buildVariantRow(parent, { options: { s: "x" }, sku: "A", priceOnRequest: true, price: "9" });
  assert.equal(onRequest.row.price, null, "price on request wins over a typed price");
  assert.equal(buildVariantRow(parent, { options: { s: "x" }, sku: "A", price: "-5" }).row.price, 0, "a negative price is never stored (the same clamp as a product's)");
  assert.equal(buildVariantRow(parent, { options: { s: "x" }, sku: "A", unit: "pcs" }).row.unit, "pcs");
  const { currency: _c, ...beautyParent } = parent;
  assert.equal("currency" in buildVariantRow(beautyParent, { options: { s: "x" }, sku: "A" }).row, false, "Beauty has no currency column");
  assert.equal(buildVariantRow(parent, { options: { s: "x" }, sku: "   " }).error, VARIANT_MESSAGES.noSku);
  assert.equal(buildVariantRow({ ...parent, variant_of: 9 }, { options: { s: "x" }, sku: "A" }).error, VARIANT_MESSAGES.parentIsVariant);
  assert.equal(buildVariantRow(null, { options: { s: "x" }, sku: "A" }).error, VARIANT_MESSAGES.badParent);
  const edit = buildVariantRow(parent, { options: { s: "x" }, sku: "A" }, { slug: "keep-this-address" });
  assert.equal(edit.row.slug, "keep-this-address", "an existing variant keeps its address");
});

const V = [
  { id: 11, sku: "A-S-R", options: { Size: "S", Colour: "Red" }, price: 5, in_stock: true, image_url: null },
  { id: 12, sku: "A-S-B", options: { Size: "S", Colour: "Blue" }, price: 5, in_stock: false, image_url: "b.png" },
  { id: 13, sku: "A-L-R", options: { Size: "L", Colour: "Red" }, price: null, in_stock: true, image_url: null },
];

test("the product page: axes, the choice, the nearest variant when a combination does not exist", () => {
  assert.deepEqual(groupAxes(V), [{ key: "Size", values: ["S", "L"] }, { key: "Colour", values: ["Red", "Blue"] }]);
  assert.equal(findVariant(V, { Size: "S", Colour: "Blue" }).id, 12);
  assert.equal(findVariant(V, { Size: "L", Colour: "Blue" }), null);
  assert.equal(findVariant(V, { Size: "S" }), null, "a partial choice is not a variant");
  assert.deepEqual([...availableValues(V, { Size: "L" }, "Colour")], ["Red"]);
  assert.equal(pickVariant(V, { Size: "S", Colour: "Blue" }, "Size", "L").id, 13, "L exists only in red: the choice moves there");
  assert.equal(pickVariant(V, { Size: "L", Colour: "Red" }, "Colour", "Blue").id, 12, "Blue exists only in S: the choice moves there");
  assert.equal(pickVariant(V, { Size: "S", Colour: "Red" }, "Colour", "Red").id, 11);
  assert.equal(pickVariant(V, {}, "Size", "XXL"), null);
  assert.equal(defaultVariant(V).id, 11);
  assert.equal(defaultVariant([{ id: 1, in_stock: false }, { id: 2, in_stock: true }]).id, 2, "opens on something that can be bought");
  assert.equal(defaultVariant([]), null);
});

test("what the visitor buys follows the variant: id, SKU, price, stock, name and picture, with the parent as the fallback", () => {
  const shown = variantView(parent, V[1]);
  assert.equal(shown.id, 12); assert.equal(shown.sku, "A-S-B"); assert.equal(shown.price, 5); assert.equal(shown.in_stock, false);
  assert.equal(shown.image_url, "b.png"); assert.equal(shown.name_en, "Gloves — S / Blue"); assert.equal(shown.brand, "Acme");
  assert.equal(variantView(parent, V[0]).image_url, "p.png", "no picture of its own: the product's");
  assert.equal(variantView(parent, V[2]).price, null, "price on request stays on request (the parent's price is not borrowed)");
  assert.equal(variantView(parent, null), parent);
});

test("schema.org: a ProductGroup with a Product and an Offer per variant, price only when there is one", () => {
  const base = { "@context": "https://schema.org", "@type": "Product", name: "Gloves", sku: "G-1", offers: { "@type": "Offer", price: 10 } };
  assert.equal(variantsJsonLd({ base, variants: [], name: "Gloves", url: "u" }), null);
  const ld = variantsJsonLd({ base, variants: V, name: "Gloves", url: "https://x/y" });
  assert.equal(ld["@type"], "ProductGroup"); assert.equal(ld.productGroupID, "G-1"); assert.deepEqual(ld.variesBy, ["Size", "Colour"]);
  assert.equal(ld.offers, undefined, "the group has no offer of its own");
  assert.equal(ld.hasVariant.length, 3);
  assert.equal(ld.hasVariant[0].offers.price, 5); assert.equal(ld.hasVariant[0].offers.priceCurrency, "USD");
  assert.equal(ld.hasVariant[1].offers.availability, "https://schema.org/OutOfStock");
  assert.equal("price" in ld.hasVariant[2].offers, false, "on request: no price is invented");
  assert.equal(ld.hasVariant[2].name, "Gloves — L / Red");
});

// ── the save logic ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const COLS = ["id", "slug", "sku", "name_en", "name_fa", "name_ru", "name_tg", "brand", "category", "category_id", "price", "currency", "unit", "min_order_qty", "in_stock", "is_active", "is_featured", "image_url", "updated_at", "variant_of", "variant_options", "variant_sort"];
let clock = 0;
function house({ rows = [], schema = true } = {}) {
  let id = 100;
  return createMemoryAdmin({ products: rows, product_versions: [] }, {
    schema: schema ? { products: COLS, product_versions: ["product_id", "kind", "changed", "before", "after", "actor_user_id", "actor_label", "request_id", "reverts_id"] } : { products: COLS.filter((c) => !c.startsWith("variant_")) },
    unique: { products: [["sku"]] },
    defaults: { products: () => ({ id: ++id, updated_at: `t${++clock}`, variant_of: null, variant_options: {}, variant_sort: 0, is_featured: false }) },
    beforeUpdate: { products: (_old, next) => { next.updated_at = `t${++clock}`; return null; } },
  });
}
const P1 = { ...parent, id: 1, is_active: true, in_stock: true, updated_at: "t0", variant_of: null, variant_options: {}, variant_sort: 0, is_featured: false };
const ctxFor = (db, over = {}) => {
  const calls = { audit: [], file: [], evaluate: [], revalidate: [] };
  const a = {
    admin: db, session: { user: { id: "u1", username: "maryam" } }, needsApproval: false,
    audit: async (...x) => { calls.audit.push(x); },
    evaluate: async (ops) => { calls.evaluate.push(ops); return { mode: "direct" }; },
    file: async (spec) => { calls.file.push(spec); return { ok: true, pending: true, message: "sent" }; },
    ...over,
  };
  const args = { house: "health", table: "products", parentId: 1, revalidate: (slug) => calls.revalidate.push(slug), uniqueSlug: async (b) => b };
  return { a, calls, args };
};

test("creating a variant writes a product row that points at the parent; the history and the cache know", async () => {
  const db = house({ rows: [{ ...P1 }] });
  const { a, calls, args } = ctxFor(db);
  const res = await saveVariantCore(a, { ...args, input: { options: [{ key: "Size", value: "M" }], sku: "G-1-M", price: "12" } });
  assert.equal(res.ok, true);
  const row = db.tables.products.find((r) => r.sku === "G-1-M");
  assert.equal(row.variant_of, 1); assert.deepEqual(row.variant_options, { Size: "M" }); assert.equal(row.name_en, "Gloves — M"); assert.equal(row.price, 12);
  assert.deepEqual(calls.audit[0][0], "product.variant.create");
  assert.deepEqual(calls.revalidate, ["gloves"], "the parent's page is refreshed");
  assert.equal(calls.evaluate.length, 1, "an active variant is a publication: the right is asked");
  assert.deepEqual(calls.evaluate[0], ["products.publish"]);
});

test("refusals: unknown or non-top-level parent, duplicate SKU (any case, also a PARENT's SKU), same options, too many, no SKU, no options", async () => {
  const db = house({ rows: [{ ...P1 }, { ...P1, id: 2, slug: "other", sku: "O-1" }] });
  const { a, args } = ctxFor(db);
  const ok = (input) => saveVariantCore(a, { ...args, input });
  assert.equal((await ok({ options: { Size: "M" }, sku: "G-1-M" })).ok, true);
  assert.equal((await ok({ options: { Size: "L" }, sku: "g-1-m" })).error, VARIANT_MESSAGES.skuTaken, "case-insensitive");
  assert.equal((await ok({ options: { Size: "L" }, sku: "O-1" })).error, VARIANT_MESSAGES.skuTaken, "another product's SKU");
  assert.equal((await ok({ options: { size: "m" }, sku: "G-1-M2" })).error, VARIANT_MESSAGES.sameOptions, "the same options of the same product");
  assert.equal((await ok({ options: { Size: "L" }, sku: "" })).error, VARIANT_MESSAGES.noSku);
  assert.equal((await ok({ options: {}, sku: "X" })).error, VARIANT_MESSAGES.noOptions);
  assert.equal((await saveVariantCore(a, { ...args, parentId: 999, input: { options: { s: "x" }, sku: "Z" } })).error, VARIANT_MESSAGES.badParent);
  assert.equal((await saveVariantCore(a, { ...args, parentId: "abc", input: { options: { s: "x" }, sku: "Z" } })).error, VARIANT_MESSAGES.badParent);
  const child = db.tables.products.find((r) => r.sku === "G-1-M");
  assert.equal((await saveVariantCore(a, { ...args, parentId: child.id, input: { options: { s: "x" }, sku: "Z" } })).error, VARIANT_MESSAGES.parentIsVariant, "a variant has no variants");
  for (let i = 0; i < VARIANT_LIMITS.perProduct; i++) db.tables.products.push({ ...P1, id: 500 + i, sku: `bulk-${i}`, slug: `bulk-${i}`, variant_of: 2, variant_options: { n: String(i) } });
  assert.equal((await saveVariantCore(a, { ...args, parentId: 2, input: { options: { n: "new" }, sku: "N-NEW" } })).error, VARIANT_MESSAGES.tooMany);
});

test("a person who needs approval creates NOTHING: the request carries the whole new row", async () => {
  const db = house({ rows: [{ ...P1 }] });
  const { a, calls, args } = ctxFor(db, { needsApproval: true });
  const res = await saveVariantCore(a, { ...args, input: { options: { Size: "M" }, sku: "G-1-M", price: "12" } });
  assert.equal(res.pending, true);
  assert.equal(db.tables.products.length, 1, "no row yet");
  assert.equal(calls.file.length, 1);
  const spec = calls.file[0];
  assert.equal(spec.operation, "products.create"); assert.equal(spec.entity, "products"); assert.equal(spec.subject, "G-1-M");
  assert.equal(spec.proposed.variant_of, 1); assert.deepEqual(spec.proposed.variant_options, { Size: "M" });
  assert.deepEqual(spec.ops, ["products.create", "products.publish"]);
});

test("publishing a new variant can be the part that needs approval, or be refused", async () => {
  let db = house({ rows: [{ ...P1 }] });
  let { a, calls, args } = ctxFor(db, { evaluate: async () => ({ mode: "approval" }) });
  assert.equal((await saveVariantCore(a, { ...args, input: { options: { Size: "M" }, sku: "G-1-M" } })).pending, true);
  assert.equal(db.tables.products.length, 1); assert.equal(calls.file.length, 1);

  db = house({ rows: [{ ...P1 }] });
  const refusal = { ok: false, error: "denied" };
  ({ a, calls, args } = ctxFor(db, { evaluate: async () => ({ mode: "denied", refusal }) }));
  assert.equal(await saveVariantCore(a, { ...args, input: { options: { Size: "M" }, sku: "G-1-M" } }), refusal);
  assert.equal(db.tables.products.length, 1, "nothing written");
  // a DRAFT variant is not a publication: no publish right is asked
  ({ a, calls, args } = ctxFor(db, { evaluate: async () => ({ mode: "denied", refusal }) }));
  const draft = await saveVariantCore(a, { ...args, input: { options: { Size: "M" }, sku: "G-1-M", is_active: false } });
  assert.equal(draft.ok, true); assert.equal(calls.evaluate.length, 0);
});

test("editing: the price and the visibility are their own rights, a stale screen is a conflict, the history keeps before and after", async () => {
  const db = house({ rows: [{ ...P1 }] });
  const { a, calls, args } = ctxFor(db);
  const made = await saveVariantCore(a, { ...args, input: { options: { Size: "M" }, sku: "G-1-M", price: "12" } });
  const v = db.tables.products.find((r) => r.id === made.id);
  const seen = v.updated_at;

  // a newer change since the screen was loaded
  const stale = await saveVariantCore(a, { ...args, variantId: v.id, input: { options: { Size: "M" }, sku: "G-1-M", price: "13", __expectedUpdatedAt: "older" } });
  assert.equal(stale.conflict, true); assert.equal(db.tables.products.find((r) => r.id === v.id).price, 12);

  calls.evaluate.length = 0;
  const done = await saveVariantCore(a, { ...args, variantId: v.id, input: { options: { Size: "M" }, sku: "G-1-M", price: "13", is_active: false, __expectedUpdatedAt: seen } });
  assert.equal(done.ok, true);
  assert.deepEqual([...calls.evaluate[0]].sort(), ["products.archive", "products.price"]);
  const now = db.tables.products.find((r) => r.id === v.id);
  assert.equal(now.price, 13); assert.equal(now.is_active, false); assert.equal(now.variant_of, 1, "the parent is never changed by an edit");
  assert.equal(now.slug, v.slug, "the address stays");
  const hist = db.tables.product_versions.at(-1);
  assert.deepEqual(hist.changed.sort(), ["is_active", "price"]); assert.equal(hist.before.price, 12); assert.equal(hist.after.price, 13);
  assert.equal(calls.audit.at(-1)[0], "product.variant.update");

  // nothing changed → nothing written, no right asked
  calls.evaluate.length = 0;
  const same = await saveVariantCore(a, { ...args, variantId: v.id, input: { options: { Size: "M" }, sku: "G-1-M", price: "13", is_active: false } });
  assert.equal(same.ok, true); assert.equal(db.tables.product_versions.length, 1);
  // a variant of another product is not found through this parent
  assert.equal((await saveVariantCore(a, { ...args, parentId: 2, variantId: v.id, input: { options: { Size: "M" }, sku: "G-1-M" } })).error, VARIANT_MESSAGES.badParent);
});

test("editing under approval files ONLY the changed fields with their old values, prepared against the version seen", async () => {
  const db = house({ rows: [{ ...P1 }] });
  const first = ctxFor(db);
  const made = await saveVariantCore(first.a, { ...first.args, input: { options: { Size: "M" }, sku: "G-1-M", price: "12" } });
  const v = db.tables.products.find((r) => r.id === made.id);
  const { a, calls, args } = ctxFor(db, { needsApproval: true });
  const res = await saveVariantCore(a, { ...args, variantId: v.id, input: { options: { Size: "M" }, sku: "G-1-M", price: "15" } });
  assert.equal(res.pending, true);
  assert.equal(db.tables.products.find((r) => r.id === v.id).price, 12, "the live variant is untouched");
  const spec = calls.file[0];
  assert.equal(spec.operation, "products.content"); assert.equal(spec.entityId, v.id); assert.equal(spec.baseUpdatedAt, v.updated_at);
  assert.deepEqual(spec.proposed, { price: 15 }); assert.deepEqual(spec.before, { price: 12 }); assert.deepEqual(spec.ops, ["products.content", "products.price"]);
});

test("before migration 44 every save says so in words, and the list reader says it too", async () => {
  const db = house({ rows: [{ ...P1 }], schema: false });
  const { a, args } = ctxFor(db);
  const res = await saveVariantCore(a, { ...args, input: { options: { Size: "M" }, sku: "G-1-M" } });
  assert.equal(res.ok, false); assert.equal(res.error, VARIANT_MESSAGES.needsMigration);
  db.fail = (table, op) => (table === "products" && op === "select" ? { code: "42703", message: "column products.variant_of does not exist" } : null);     // what the real API answers for the missing column
  const list = await listVariantRows(db, "products", 1);
  assert.equal(list.needsMigration, true);
  db.fail = () => null;
  assert.equal(variantDbError({ code: "23505" }), VARIANT_MESSAGES.skuTaken);
  assert.equal(variantDbError({ message: "variant:parent_is_variant" }), VARIANT_MESSAGES.parentIsVariant);
  assert.equal(variantDbError({ message: "variant:parent_missing" }), VARIANT_MESSAGES.badParent);
  assert.equal(variantDbError({ code: "XX" }), VARIANT_MESSAGES.generic);
});

test("an APPROVED request creates / changes the variant exactly as proposed; a SKU taken meanwhile or a newer change makes it stale", async () => {
  const db = house({ rows: [{ ...P1 }] });
  const { a, calls, args } = ctxFor(db, { needsApproval: true });
  await saveVariantCore(a, { ...args, input: { options: { Size: "M" }, sku: "G-1-M", price: "12" } });
  const create = calls.file[0];
  const ex = makeProductExecutors({ panel: "health", session: {}, audit: async () => {} });
  const request = { id: 7, requested_by: "u1", entity_id: null, base_updated_at: null, proposed: create.proposed };
  const ok = await ex["products.create"]({ admin: db, request });
  assert.equal(ok.ok, true);
  const row = db.tables.products.find((r) => r.sku === "G-1-M");
  assert.equal(row.variant_of, 1); assert.deepEqual(row.variant_options, { Size: "M" });
  // somebody created the same SKU in the meantime: the database refuses, the request fails as stale, nothing is half-applied
  const again = await ex["products.create"]({ admin: db, request });
  assert.deepEqual(again, { ok: false, error: "stale" });
  assert.equal(db.tables.products.filter((r) => r.sku === "G-1-M").length, 1);

  // a change request is applied only to the version it was prepared against
  const edit = ctxFor(db, { needsApproval: true });
  await saveVariantCore(edit.a, { ...edit.args, variantId: row.id, input: { options: { Size: "M" }, sku: "G-1-M", price: "15" } });
  const spec = edit.calls.file[0];
  const change = { id: 8, requested_by: "u1", entity_id: row.id, base_updated_at: spec.baseUpdatedAt, proposed: spec.proposed };
  db.tables.products.find((r) => r.id === row.id).updated_at = "someone-else-saved";
  assert.deepEqual(await ex["products.content"]({ admin: db, request: change }), { ok: false, error: "stale" });
  assert.equal(db.tables.products.find((r) => r.id === row.id).price, 12);
  change.base_updated_at = "someone-else-saved";
  assert.equal((await ex["products.content"]({ admin: db, request: change })).ok, true);
  assert.equal(db.tables.products.find((r) => r.id === row.id).price, 15);
});

// ── the panel lists show products, not their variants ──────────────────────────────────────────────────────────────────────────
function listDb({ ready = true } = {}) {
  const cols = ready ? COLS : COLS.filter((c) => !c.startsWith("variant_"));
  const mk = (id, sku, over = {}) => ({ id, slug: `p${id}`, sku, name_en: `Name ${id}`, name_fa: null, name_ru: null, name_tg: null, brand: "Acme", category: "ppe", category_id: 4, price: 1, unit: "box", in_stock: true, is_active: true, is_featured: false, image_url: "x.png", updated_at: `t${id}`, ...(ready ? { variant_of: null, variant_options: {}, variant_sort: 0 } : {}), ...over });
  const rows = [mk(1, "P-1"), mk(2, "P-2"), ...(ready ? [mk(3, "P-1-M", { variant_of: 1, variant_options: { s: "M" }, name_en: "Name 1 — M" }), mk(4, "P-1-L", { variant_of: 1, variant_options: { s: "L" }, is_active: false })] : [])];
  return createMemoryAdmin({ products: rows, categories: [], quote_requests: [] }, { schema: { products: [...cols, "gap_count"], categories: ["id"], quote_requests: ["id"] } });
}

test("the product list shows products with their variant count; a search also finds variants by SKU", async () => {
  resetVariantScope();
  const db = listDb();
  const page = await readProductsPage(db, "health", parseProductParams({}));
  assert.equal(page.ok, true);
  assert.deepEqual(page.rows.map((r) => r.sku).sort(), ["P-1", "P-2"], "no variant in the list");
  assert.equal(page.total, 2, "and the count agrees");
  assert.deepEqual(page.variantCounts, { 1: 2 }, "both variants count, archived or not");
  const found = await readProductsPage(db, "health", parseProductParams({ q: "P-1-M" }));
  assert.deepEqual(found.rows.map((r) => r.sku), ["P-1-M"], "a search reaches the variant");
  assert.equal(found.rows[0].variant_of, 1, "and the row says whose variant it is");
});

test("the dashboard, the counts per category and the brand roster count products only", async () => {
  resetVariantScope();
  const db = listDb();
  const dash = await readDashboard(db, "health", { quotes: false });
  assert.equal(dash.stats.total, 2);
  assert.equal(dash.stats.inactive, 0, "an archived VARIANT is not an archived product");
  assert.ok(dash.recentProducts.every((r) => r.variant_of == null));
  const counts = await readProductCounts(db, "health");
  assert.deepEqual(counts.rows.map((r) => r.id).sort(), [1, 2]);
  const brand = await readBrandRoster(createMemoryAdmin({ beauty_products: [
    { id: 1, sku: "B-1", brand: "Luxe", name_en: "A", variant_of: null }, { id: 2, sku: "B-1-X", brand: "Luxe", name_en: "A — X", variant_of: 1 },
  ] }, { schema: { beauty_products: ["id", "sku", "brand", "name_en", "name_fa", "name_tg", "name_ru", "image_url", "variant_of"] } }), "Luxe");
  assert.deepEqual(brand.current.map((r) => r.sku), ["B-1"], "a brand carries its products, not their variants");
});

test("before migration 44 nothing is filtered and the panel works as it did; the probe is asked again after a while", async () => {
  resetVariantScope();
  const db = listDb({ ready: false });
  const page = await readProductsPage(db, "health", parseProductParams({}));
  assert.equal(page.ok, true); assert.equal(page.total, 2); assert.deepEqual(page.variantCounts, {});
  resetVariantScope();
  assert.equal(await variantsReady(db, "products", 1_000), false);
  // the migration is applied while the server runs: within the recheck window the answer is remembered, then it is read again
  const ready = listDb({ ready: true });
  assert.equal(await variantsReady(ready, "products", 2_000), false, "remembered for a short while");
  assert.equal(await variantsReady(ready, "products", 1_000 + 31_000), true, "and then read again");
  resetVariantScope();
});

// ── import ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("a spreadsheet row that names a variant's SKU is an error, never a rewrite of the variant as a product", () => {
  const ctx = {
    mode: "update", autoCreateCategories: false,
    existingBySku: new Map([["g-1-m", { id: 9, slug: "g-1-m", variant: true }], ["g-1", { id: 1, slug: "gloves", variant: false }]]),
    existingBySlug: new Map(), takenSlugs: new Set(["gloves", "g-1-m"]), categoriesBySlug: new Map([["ppe", { id: 4, slug: "ppe" }]]),
  };
  const rows = [{ sku: "G-1-M", name_en: "Hacked", category_slug: "ppe" }, { sku: "G-1", name_en: "Gloves 2", category_slug: "ppe" }].map((r, i) => normalizeRow(r, i + 1));
  const { plans } = planBatch(rows, ctx);
  assert.equal(plans[0].action, "error"); assert.match(plans[0].messages[0], /تنوع/);
  assert.equal(plans[1].action, "update");
  const add = planBatch(rows.slice(0, 1), { ...ctx, mode: "add" }).plans[0];
  assert.equal(add.action, "skip", "add-only mode only reports that the SKU exists");
});

// ── the public site and the panel wiring ───────────────────────────────────────────────────────────────────────────────────────
test("the public pages read variants only through the database functions, and a variant is never a page of its own", () => {
  const sup = read("lib/supabase.js"), bc = read("lib/beauty/catalog.js");
  assert.match(sup, /rpc\("public_product_variants"/); assert.match(sup, /rpc\("public_variant_items"/);
  assert.match(bc, /rpc\("public_beauty_product_variants"/);
  for (const f of ["lib/supabase.js", "lib/beauty/catalog.js", "app/health/[lang]/catalog/[slug]/page.jsx", "app/beauty/[lang]/catalog/[slug]/page.jsx", "components/beauty/BeautyVariantBuy.jsx", "components/product/VariantPicker.jsx"]) {
    assert.ok(!/from\("(beauty_)?products"\)\.select\([^)]*variant_/.test(read(f)), `${f} reads variant columns from the table (RLS hides them): use the function`);
    assert.ok(!/variant_of/.test(read(f)), `${f} must not depend on the table column`);
  }
  assert.match(read("app/health/[lang]/catalog/[slug]/page.jsx"), /getProductVariants\(product\.id\)/);
  assert.match(read("app/beauty/[lang]/catalog/[slug]/page.jsx"), /getBeautyProductVariants\(product\.id\)/);
  assert.match(read("app/beauty/[lang]/catalog/[slug]/page.jsx"), /variants\.length > 0 \?/, "a product without variants keeps its server-rendered card");
  // compare, wish list and "recently viewed" stay on the product (variants are not public rows)
  const detail = read("app/health/[lang]/catalog/[slug]/ProductDetailClient.jsx");
  assert.match(detail, /toggle\(parent\.id\)/); assert.match(detail, /toggleWish\(parent\.id\)/); assert.match(detail, /excludeId=\{parent\.id\}/);
  assert.match(detail, /<StickyQuotePanel product=\{product\} compareId=\{parent\.id\}/);
  // the inquiry list resolves variant ids that the public table hides
  assert.match(read("app/health/[lang]/inquiry/InquiryClient.jsx"), /getVariantItemsByIds\(rest\)/);
});

test("the panel: a variant opens its product's page; the section is hidden before migration 44; deleting a product with variants is explained", () => {
  for (const [f, prefix] of [["app/operator/(panel)/products/[id]/edit/page.jsx", "/operator"], ["app/beauty/operator/(panel)/products/[id]/edit/page.jsx", "/beauty/operator"]]) {
    const s = read(f);
    assert.ok(s.includes("redirect(`" + prefix + "/products/${product.variant_of}/edit`)"), `${f}: a variant must redirect to its product`);
    assert.match(s, /!variants\.hidden/); assert.match(s, /<VariantsManager/);
  }
  assert.match(read("lib/operator/productDelete.js"), /VARIANT_MESSAGES\.hasVariants/);
  // duplicating a variant is refused (a copy is made from the product's page)
  for (const f of ["lib/operator/actions.js", "lib/beauty/operator/actions.js"]) assert.match(read(f), /variant_of != null\) return \{ ok: false, error: VARIANT_MESSAGES\.duplicateVariant/);
  // the actions ask the SAME rights as a product
  assert.match(read("lib/operator/actions.js"), /authed\(variantId \? "products\.content" : "products\.create", \{ approvable: true \}\)/);
  assert.match(read("lib/beauty/operator/actions.js"), /authed\(variantId \? "products\.content" : "products\.create", \{ approvable: true \}\)/);
  assert.match(read("lib/beauty/operator/actions.js"), /table: "beauty_products"/);
  assert.ok(!/beauty_products/.test(read("lib/operator/actions.js").match(/export async function saveVariant[\s\S]*?\n\}\n/)[0]), "Health's action never touches the Beauty table");
});
