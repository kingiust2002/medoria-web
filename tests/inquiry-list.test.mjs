// The inquiry list (several products, one request): what the browser may send, what the server keeps,
// and what happens before migration 33 exists.
//   * only { id, quantity } is accepted from the browser; duplicates merge; bad ids reject the whole list
//   * names and SKUs come from the database; archived / unknown ids are dropped; order is the visitor's
//   * the insert falls back to the message text when the database has no `items` column
//   * the Telegram notice lists the first products; the panel shows the list; the header/robots are wired
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseItemRequests, buildStoredItems, summarizeItems, itemsAsText, MAX_ITEMS, MAX_QTY } from "../lib/inquiry/items.js";
import { resolveItems, insertRequest } from "../lib/inquiry/save.js";
import { formatQuoteNotice } from "../lib/notify/telegram.js";
import { listMessage, COPY } from "../lib/inquiry/copy.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("parseItemRequests: ids and quantities, duplicates merged and capped", () => {
  assert.deepEqual(parseItemRequests([{ id: 3, quantity: 5 }, { id: "4", quantity: "2" }]).items, [{ id: 3, quantity: 5 }, { id: 4, quantity: 2 }]);
  assert.deepEqual(parseItemRequests([{ id: 3, quantity: 5 }, { id: 3, quantity: 6 }]).items, [{ id: 3, quantity: 11 }]);
  assert.deepEqual(parseItemRequests([{ id: 3 }]).items, [{ id: 3, quantity: 1 }], "no quantity means 1");
  assert.deepEqual(parseItemRequests([{ id: 3, quantity: 0 }, { id: 4, quantity: -5 }, { id: 5, quantity: "x" }, { id: 6, quantity: 2.6 }]).items.map((i) => i.quantity), [1, 1, 1, 3]);
  assert.equal(parseItemRequests([{ id: 3, quantity: 9e12 }]).items[0].quantity, MAX_QTY);
  assert.equal(parseItemRequests([{ id: 3, quantity: MAX_QTY }, { id: 3, quantity: MAX_QTY }]).items[0].quantity, MAX_QTY);
});

test("parseItemRequests: anything but a clean list rejects the WHOLE call", () => {
  const bad = [null, undefined, "3", 3, {}, [], [null], [3], ["3"], [[3]], [{}], [{ id: 0 }], [{ id: -1 }], [{ id: 1.5 }], [{ id: "1 or 1=1" }], [{ id: "" }],
    [{ id: 1 }, { id: "x" }], [{ id: 2 ** 60 }], [{ id: "0123" }], [{ id: { $gt: 0 } }], [{ id: [1] }]];
  for (const b of bad) assert.deepEqual(parseItemRequests(b), { error: "invalid" }, JSON.stringify(b));
  const many = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({ id: i + 1 }));
  assert.deepEqual(parseItemRequests(many), { error: "invalid" });
  assert.equal(parseItemRequests(many.slice(0, MAX_ITEMS)).items.length, MAX_ITEMS);
});

const ROWS = [
  { id: 1, sku: "G-1", name_en: "Gloves", name_ru: "Перчатки", is_active: true },
  { id: 2, sku: "M-2", name_en: "Masks", is_active: true },
  { id: 3, sku: "H-3", name_en: "Hidden", is_active: false },
  { id: 4, sku: null, name_en: null, name_ru: "Только RU", is_active: true },
];

test("buildStoredItems: names/SKUs from the database, archived and unknown dropped, visitor's order kept", () => {
  const out = buildStoredItems([{ id: 2, quantity: 5 }, { id: 99, quantity: 1 }, { id: 3, quantity: 1 }, { id: 1, quantity: 7 }, { id: 4, quantity: 2 }], ROWS);
  assert.deepEqual(out, [
    { product_id: 2, sku: "M-2", name: "Masks", quantity: 5 },
    { product_id: 1, sku: "G-1", name: "Gloves", quantity: 7 },
    { product_id: 4, sku: null, name: "Только RU", quantity: 2 },
  ]);
  assert.deepEqual(buildStoredItems([{ id: 1, quantity: 1 }], []), []);
  assert.deepEqual(buildStoredItems([{ id: 1, quantity: 1 }], null), []);
  // control characters and absurd lengths in a stored name cannot get through
  const long = buildStoredItems([{ id: 7, quantity: 1 }], [{ id: 7, sku: "S\u0000K", name_en: "N".repeat(900) + "\u0007", is_active: true }])[0];
  assert.equal(long.name.length, 300);
  assert.equal(long.sku, "SK");
});

test("summarizeItems and itemsAsText", () => {
  assert.equal(summarizeItems([{ name: "Gloves" }]), "Gloves");
  assert.equal(summarizeItems([{ name: "Gloves" }, { name: "Masks" }, { name: "Gowns" }]), "Gloves +2");
  assert.equal(summarizeItems([]), null);
  assert.equal(summarizeItems([{ name: "x".repeat(400) }, { name: "y" }]).length, 300);
  assert.equal(itemsAsText([{ name: "Gloves", sku: "G-1", quantity: 5 }, { name: "Masks", sku: null, quantity: 1 }]), "- Gloves (G-1) × 5\n- Masks × 1");
});

// A stand-in for the database client: records what it was asked and answers from a script.
function fakeDb({ products = ROWS, insertErrors = [] } = {}) {
  const calls = [];
  const db = {
    from(table) {
      const call = { table };
      calls.push(call);
      const chain = {
        select(cols) { call.select = cols; return chain; },
        in(col, vals) { call.in = [col, vals]; return Promise.resolve({ data: call.table.endsWith("products") ? products.filter((r) => vals.includes(r.id)) : null, error: null }); },
        insert(row) { call.insert = row; return chain; },
        single() { const err = insertErrors.shift(); return Promise.resolve(err ? { data: null, error: err } : { data: { id: 77, ...call.insert }, error: null }); },
      };
      return chain;
    },
  };
  return { db, calls };
}

test("resolveItems asks the right table for the requested ids only, and returns database names", async () => {
  const { db, calls } = fakeDb();
  const r = await resolveItems(db, "products", [{ id: 1, quantity: 2, name: "FORGED", sku: "FORGED" }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(r.items.map((i) => [i.product_id, i.name, i.sku, i.quantity]), [[1, "Gloves", "G-1", 2], [2, "Masks", "M-2", 1]]);
  assert.equal(calls[0].table, "products");
  assert.deepEqual(calls[0].in, ["id", [1, 2, 3]]);
  assert.ok(!JSON.stringify(r).includes("FORGED"), "a name or SKU sent by the browser must never be stored");
  assert.deepEqual(await resolveItems(db, "products", [{ id: 3 }, { id: 99 }]), { error: "invalid" }, "nothing valid left");
  assert.deepEqual(await resolveItems(db, "products", "nope"), { error: "invalid" });
  assert.equal(calls.length, 2, "an invalid list never reaches the database");
  const broken = { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: null, error: { code: "XX000" } }) }) }) };
  assert.deepEqual(await resolveItems(broken, "products", [{ id: 1 }]), { error: "unavailable" });
  const beauty = fakeDb();
  await resolveItems(beauty.db, "beauty_products", [{ id: 1 }]);
  assert.equal(beauty.calls[0].table, "beauty_products");
});

test("insertRequest: normal insert; and without migration 33 the list moves into the message, nothing is lost", async () => {
  const items = [{ product_id: 1, sku: "G-1", name: "Gloves", quantity: 5 }, { product_id: 2, sku: null, name: "Masks", quantity: 1 }];
  const ok = fakeDb();
  const a = await insertRequest(ok.db, "quote_requests", { name: "X", message: "hi", items });
  assert.equal(a.degraded, undefined);
  assert.deepEqual(ok.calls[0].insert.items, items);

  const old = fakeDb({ insertErrors: [{ code: "PGRST204", message: "Could not find the 'items' column of 'quote_requests'" }] });
  const b = await insertRequest(old.db, "quote_requests", { name: "X", message: "hi", items });
  assert.equal(b.degraded, true);
  assert.equal(old.calls.length, 2);
  assert.ok(!("items" in old.calls[1].insert));
  assert.equal(old.calls[1].insert.message, "hi\n\n- Gloves (G-1) × 5\n- Masks × 1");
  assert.equal(b.data.id, 77);

  const noMessage = fakeDb({ insertErrors: [{ code: "42703", message: 'column "items" does not exist' }] });
  const c = await insertRequest(noMessage.db, "quote_requests", { name: "X", message: null, items });
  assert.equal(noMessage.calls[1].insert.message, "- Gloves (G-1) × 5\n- Masks × 1");
  assert.equal(c.degraded, true);

  // a DIFFERENT error is not retried (and is reported)
  const other = fakeDb({ insertErrors: [{ code: "23514", message: "check violation" }] });
  const d = await insertRequest(other.db, "quote_requests", { name: "X", items });
  assert.equal(other.calls.length, 1);
  assert.equal(d.error.code, "23514");
  // a plain single-product insert never retries
  const plain = fakeDb({ insertErrors: [{ code: "42703", message: "column nope" }] });
  assert.ok((await insertRequest(plain.db, "quote_requests", { name: "X" })).error);
  assert.equal(plain.calls.length, 1);
  // the combined message stays under both tables' 4000-character limit
  const huge = Array.from({ length: 30 }, (_, i) => ({ product_id: i + 1, sku: "S".repeat(100), name: "N".repeat(300), quantity: 1 }));
  const big = fakeDb({ insertErrors: [{ code: "PGRST204", message: "items" }] });
  await insertRequest(big.db, "quote_requests", { name: "X", message: "m".repeat(2500), items: huge });
  assert.ok(big.calls[1].insert.message.length <= 3900);
});

test("both submit actions resolve the list on the server before inserting, and clear the single-product columns", () => {
  for (const [f, products] of [["lib/actions/quote.js", "products"], ["lib/beauty/actions/quote.js", "beauty_products"]]) {
    const s = read(f);
    assert.match(s, new RegExp(`resolveItems\\(db, "${products}", payload\\.items\\)`), f);
    assert.match(s, /items: resolved\.items, product_id: null, product_sku: null, quantity: null/, f);
    assert.match(s, /product_name: summarizeItems\(resolved\.items\)/, f);
    assert.ok(s.indexOf("resolveItems(") < s.indexOf("insertRequest("), `${f}: the list is resolved before the insert`);
    assert.ok(!/payload\.items\s*\.\s*map|payload\.items\[/.test(s), `${f}: browser-supplied items must only pass through resolveItems`);
  }
});

test("Telegram notice: a list request shows the first three products and the rest as a count; no 'Product:' duplicate", () => {
  const row = { name: "Dr K", preferred_contact: "whatsapp", product_name: "Gloves +4", quantity: null,
    items: [1, 2, 3, 4, 5].map((n) => ({ name: `Item ${n}`, quantity: n })) };
  const text = formatQuoteNotice({ kind: "health", id: 9, row, siteUrl: "https://medoriaco.com" });
  assert.match(text, /Products \(5\): Item 1 x 1; Item 2 x 2; Item 3 x 3 \+2 more/);
  assert.ok(!/^Product:/m.test(text) && !/Quantity:/.test(text));
  const single = formatQuoteNotice({ kind: "health", id: 9, row: { name: "A", product_name: "Gloves", quantity: 5 }, siteUrl: "https://medoriaco.com" });
  assert.match(single, /Product: Gloves x 5/);
  assert.ok(!/Products \(/.test(single));
});

test("the visitor message lists every product; every language has the same copy keys", () => {
  const msg = listMessage({ title: "T", lines: [{ name: "Gloves", sku: "G-1", quantity: 5 }, { name: "Masks", sku: "", quantity: 1 }], name: "Dr K", org: "", phone: "+992", note: "", url: "https://x/y",
    labels: { name: "Name", org: "Org", phone: "Phone" } });
  assert.equal(msg, "T\n\n• Gloves (G-1) × 5\n• Masks × 1\n\n👤 Name: Dr K\n🏥 Org: —\n📞 Phone: +992\n\n🔗 https://x/y");
  const keys = Object.keys(COPY.en).sort();
  for (const lang of ["fa", "ru", "tg"]) assert.deepEqual(Object.keys(COPY[lang]).sort(), keys, lang);
  for (const lang of Object.keys(COPY)) for (const [k, v] of Object.entries(COPY[lang])) assert.ok(String(v).trim().length > 1, `${lang}.${k}`);
});

test("the list is wired in: card, detail page, header (width reserved), robots, panel, migration", () => {
  assert.match(read("components/catalog/ProductCard.jsx"), /<InquiryToggle productId=\{p\.id\}/);
  assert.match(read("app/health/[lang]/catalog/[slug]/ProductDetailClient.jsx"), /<InquiryToggle productId=\{product\.id\}/);
  const header = read("components/layout/Header.jsx");
  assert.match(header, /useInquiryList\("health"\)/);
  assert.match(header, /reservedMd=\{586\}/, "a new header control raises the reserved width (CLAUDE.md, mobile-width law)");
  assert.match(read("app/robots.js"), /"\/\*\/inquiry"/);
  assert.match(read("app/health/[lang]/inquiry/page.jsx"), /robots: \{ index: false/);
  assert.match(read("components/operator/QuotesPanel.jsx"), /Array\.isArray\(x\.items\)/);
  const mig = read("migrations/33_quote_items.sql");
  const sql = mig.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(sql, /^BEGIN;/m); assert.match(sql, /^COMMIT;/m);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS items jsonb/);
  assert.match(sql, /jsonb_array_length\(items\) <= 30/);
  assert.ok(!/\bGRANT\b|CREATE POLICY|DROP TABLE|DELETE FROM|TRUNCATE/i.test(sql));
});
