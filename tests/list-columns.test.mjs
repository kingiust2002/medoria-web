// "My columns" (N9, round 3): the fields a person chose for the product and request lists. Proves the pure cleaning (only keys of the catalogue, no
// repeats, a cap, a default when nothing valid is left), the server core against an in-memory database (own rows only, own house, own list, needs a
// personal account and the right to see the list, upsert replaces, reset removes, migration missing is said in words), and that both houses' lists,
// pages and actions are wired to it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanColumns, effectiveColumns, columnKeys, COLUMN_CATALOG, DEFAULT_COLUMNS, COLUMN_LIMIT, COLUMN_MESSAGES } from "../lib/operator/listColumns.js";
import { readSavedColumns, saveColumns, resetColumns } from "../lib/operator/listColumnsCore.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const person = (id, role = "owner", houses = ["health", "beauty"], extra = {}) => ({ user: { id, username: id, status: "active", role, houses, allow: [], deny: [], approval: {}, ...extra } });
const UID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const db = () => createMemoryAdmin({ operator_table_columns: [] }, { unique: { operator_table_columns: [["user_id", "house", "list"]] } });
const ctx = (admin, session, panel = "health") => ({ admin, session, panel });

test("cleaning: only keys the screen defines, in the given order, no repeats, capped; nothing valid = null (= the defaults)", () => {
  assert.deepEqual(cleanColumns("products", ["price", "sku", "price", "evil", 5, null, "status"]), ["price", "sku", "status"]);
  assert.deepEqual(cleanColumns("quotes", ["status", "phone"]), ["status", "phone"]);
  assert.equal(cleanColumns("products", ["phone"]), null, "a request field is not a product field");
  for (const bad of [null, undefined, "sku", {}, [], ["__proto__"], ["constructor"], [""], ["../x"]]) assert.equal(cleanColumns("products", bad), null, JSON.stringify(bad));
  assert.equal(cleanColumns("nonsense", ["sku"]), null);
  assert.ok(cleanColumns("products", columnKeys("products")).length <= COLUMN_LIMIT);
});

test("the defaults are exactly what the screens showed before; every default is a catalogue key; a saved choice replaces them", () => {
  for (const list of ["products", "quotes"]) {
    const keys = columnKeys(list);
    for (const k of DEFAULT_COLUMNS[list]) assert.ok(keys.includes(k), `${list}:${k}`);
    assert.deepEqual(effectiveColumns(list, null), DEFAULT_COLUMNS[list]);
    assert.deepEqual(effectiveColumns(list, ["evil"]), DEFAULT_COLUMNS[list], "an invalid stored value falls back to the defaults");
  }
  assert.deepEqual(effectiveColumns("products", ["updated", "sku"]), ["updated", "sku"]);
  for (const list of ["products", "quotes"]) for (const [k, label] of COLUMN_CATALOG[list]) assert.ok(/^[a-z_]{1,24}$/.test(k) && label, `${list}:${k}`);
});

test("save / read / replace / reset: the person's own, per house and list", async () => {
  const admin = db();
  const ann = person(UID(1));
  assert.deepEqual(await saveColumns(ctx(admin, ann), "products", ["sku", "price", "evil", "sku"]), { ok: true, columns: ["sku", "price"] });
  assert.deepEqual(admin.tables.operator_table_columns.map((r) => [r.user_id, r.house, r.list, r.columns]), [[UID(1), "health", "products", ["sku", "price"]]]);
  assert.deepEqual(await readSavedColumns(admin, ann, "health", "products"), { ok: true, columns: ["sku", "price"] });
  // replaced, not duplicated
  await saveColumns(ctx(admin, ann), "products", ["updated"]);
  assert.equal(admin.tables.operator_table_columns.length, 1);
  assert.deepEqual((await readSavedColumns(admin, ann, "health", "products")).columns, ["updated"]);
  // other house, other list, other person: nothing
  assert.equal((await readSavedColumns(admin, ann, "beauty", "products")).columns, null);
  assert.equal((await readSavedColumns(admin, ann, "health", "quotes")).columns, null);
  assert.equal((await readSavedColumns(admin, person(UID(2)), "health", "products")).columns, null);
  await saveColumns(ctx(admin, ann, "beauty"), "products", ["category"]);
  assert.equal(admin.tables.operator_table_columns.length, 2, "Beauty keeps its own row");
  // reset removes only this person's row of this house and list
  assert.deepEqual(await resetColumns(ctx(admin, ann), "products"), { ok: true, columns: null });
  assert.deepEqual(admin.tables.operator_table_columns.map((r) => r.house), ["beauty"]);
});

test("refusals: no list, nothing valid, no personal account, no right to see the list, migration missing, database trouble", async () => {
  const admin = db();
  const ann = person(UID(1));
  assert.equal((await saveColumns(ctx(admin, ann), "weird", ["sku"])).ok, false);
  assert.deepEqual(await saveColumns(ctx(admin, ann), "products", ["evil"]), { ok: false, error: COLUMN_MESSAGES.none });
  assert.deepEqual(await saveColumns(ctx(admin, { user: undefined }), "products", ["sku"]), { ok: false, error: COLUMN_MESSAGES.needsAccount });
  assert.deepEqual(await resetColumns(ctx(admin, { user: undefined }), "products"), { ok: false, error: COLUMN_MESSAGES.needsAccount });
  // a person of the other house only, or without the right to see requests
  const beautyOnly = person(UID(3), "house_admin", ["beauty"]);
  const denied = await saveColumns(ctx(admin, beautyOnly, "health"), "products", ["sku"]);
  assert.deepEqual([denied.ok, denied.denied], [false, true]);
  const noQuotes = person(UID(4), "viewer", ["health"], { deny: ["health.quotes.view"] });
  assert.equal((await saveColumns(ctx(admin, noQuotes), "quotes", ["status"])).denied, true);
  assert.equal(admin.tables.operator_table_columns.length, 0);
  const noTable = createMemoryAdmin({});
  assert.deepEqual(await saveColumns(ctx(noTable, ann), "products", ["sku"]), { ok: false, error: COLUMN_MESSAGES.needsMigration });
  assert.deepEqual(await readSavedColumns(noTable, ann, "health", "products"), { ok: false, columns: null, needsMigration: true });
  const broken = db(); broken.fail = () => ({ code: "XX000", message: "boom" });
  assert.deepEqual(await saveColumns(ctx(broken, ann), "products", ["sku"]), { ok: false, error: COLUMN_MESSAGES.generic });
  assert.equal((await readSavedColumns(broken, ann, "health", "products")).ok, false);
  assert.deepEqual(await readSavedColumns(admin, { user: undefined }, "health", "products"), { ok: true, columns: null }, "the old shared login keeps none");
});

test("both houses' lists, pages and actions are wired: each house's own action file, the chooser on both product lists and the request list", () => {
  for (const [f, auth] of [["lib/operator/listColumnActions.js", "@/lib/operator/auth"], ["lib/beauty/operator/listColumnActions.js", "@/lib/beauty/operator/auth"]]) {
    const s = read(f);
    assert.match(s, /^"use server";/);
    assert.ok(s.includes(`from "${auth}"`), `${f} must use its own session`);
    for (const fn of ["saveListColumns", "resetListColumns"]) assert.match(s, new RegExp(`export async function ${fn}\\([^)]*\\) \\{\\n  const session = await getSession\\(\\);`), `${f}: ${fn} checks the session first`);
  }
  assert.ok(read("lib/beauty/operator/listColumnActions.js").includes('warehouseCtx("beauty"')); assert.ok(read("lib/operator/listColumnActions.js").includes('warehouseCtx("health"'));
  for (const f of ["components/operator/ProductsTable.jsx", "components/beauty/operator/ProductsTable.jsx"]) assert.match(read(f), /<ColumnsChooser list="products"/, f);
  assert.match(read("components/operator/QuotesPanel.jsx"), /<ColumnsChooser list="quotes"/);
  assert.match(read("components/operator/QuotesManager.jsx"), /listColumnActions"/); assert.match(read("components/beauty/operator/QuotesManager.jsx"), /beauty\/operator\/listColumnActions"/);
  assert.match(read("components/beauty/operator/ProductsTable.jsx"), /beauty\/operator\/listColumnActions"/);
  for (const [f, house, list] of [["app/operator/(panel)/products/page.jsx", "health", "products"], ["app/beauty/operator/(panel)/products/page.jsx", "beauty", "products"], ["app/operator/(panel)/quotes/page.jsx", "health", "quotes"], ["app/beauty/operator/(panel)/quotes/page.jsx", "beauty", "quotes"]]) {
    assert.ok(read(f).includes(`columnsOf(session, "${house}", "${list}")`), `${f} reads this house's own columns`);
  }
});
