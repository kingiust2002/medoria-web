// Personal preferences, round 3 (N10): rows per page for the product and request lists, and the dashboard blocks a person shows. Proves the cleaning
// (only the three sizes, only the four block names, the defaults stored as "nothing chosen"), that saving the shortcuts alone never touches the rest,
// reading against an in-memory database (own rows, the older table without the new columns still gives the start page and shortcuts), the address
// logic (a size in the address wins; the standard size can still be chosen explicitly when another default is saved) and the dashboard grouping.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanPreferences, effectivePreferences, PREF_MESSAGES } from "../lib/operator/preferences.js";
import { readPreferences, savePreferences } from "../lib/operator/preferencesCore.js";
import { cleanDash, effectiveDash, groupDash, DEFAULT_DASH } from "../lib/operator/dashboardBlocks.js";
import { defaultSizeOf, withDefaultSize } from "../lib/operator/listSize.js";
import { productHref, quoteHref, parseSize } from "../lib/operator/listQuery.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const UID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = (n = 1) => ({ user: { id: UID(n), username: `u${n}`, status: "active", role: "owner", houses: ["health", "beauty"], allow: [], deny: [], approval: {} } });

test("page sizes: only 25 / 50 / 100; the standard size is stored as 'nothing chosen'; nothing sent = nothing changed", () => {
  const ok = (raw) => cleanPreferences(owner(), "health", raw);
  assert.deepEqual(ok({ shortcuts: [] }).prefs, { start_page: null, shortcuts: [] }, "the shortcuts alone never carry the extras");
  assert.deepEqual(ok({ shortcuts: [], pageSizes: { products: "50", quotes: 100 } }).prefs, { start_page: null, shortcuts: [], page_size_products: 50, page_size_quotes: 100 });
  assert.deepEqual(ok({ shortcuts: [], pageSizes: { products: 25, quotes: "" } }).prefs, { start_page: null, shortcuts: [], page_size_products: null, page_size_quotes: null });
  for (const bad of ["7", 500, "50; drop", -1, {}, [], "1e2", "0x32"]) assert.deepEqual(ok({ shortcuts: [], pageSizes: { products: bad } }), { ok: false, error: PREF_MESSAGES.badSize }, String(bad));
});

test("dashboard blocks: known names only, no repeats, at least one; the default order is stored as 'nothing chosen'", () => {
  const ok = (raw) => cleanPreferences(owner(), "health", raw);
  assert.deepEqual(ok({ shortcuts: [], dashboard: ["quotes", "stats"] }).prefs.dashboard, ["quotes", "stats"]);
  assert.equal(ok({ shortcuts: [], dashboard: DEFAULT_DASH }).prefs.dashboard, null);
  assert.equal(ok({ shortcuts: [], dashboard: null }).prefs.dashboard, null);
  assert.deepEqual(ok({ shortcuts: [], dashboard: ["stats", "stats"] }).prefs.dashboard, ["stats"], "a repeated name collapses");
  for (const bad of [[], ["evil"], ["stats", "evil"], "stats", {}, [1]]) assert.deepEqual(ok({ shortcuts: [], dashboard: bad }), { ok: false, error: PREF_MESSAGES.badDash }, JSON.stringify(bad));
  assert.equal(cleanDash(["products", "x", "products", "stats"]).join(), "products,stats");
  assert.deepEqual(effectiveDash(null), DEFAULT_DASH); assert.deepEqual(effectiveDash(["bogus"]), DEFAULT_DASH);
  assert.deepEqual(groupDash(["quotes", "products", "stats", "actions"]), [{ cards: ["quotes", "products"] }, { key: "stats" }, { key: "actions" }]);
  assert.deepEqual(groupDash(["stats", "quotes", "actions", "products"]), [{ key: "stats" }, { cards: ["quotes"] }, { key: "actions" }, { cards: ["products"] }]);
});

test("effective preferences: unknown stored values are dropped, never trusted", () => {
  const e = effectivePreferences(owner(), "health", { start_page: null, shortcuts: [], page_size_products: 50, page_size_quotes: 7, dashboard: ["quotes", "evil"] });
  assert.deepEqual([e.pageSizes, e.dashboard], [{ products: 50, quotes: null }, ["quotes"]]);
  assert.deepEqual(effectivePreferences(owner(), "health", null).pageSizes, { products: null, quotes: null });
});

test("save / read against the database: the person's own row; the older table (migration 50 only) still gives the start page and shortcuts", async () => {
  const db = createMemoryAdmin({ operator_preferences: [] }, { unique: { operator_preferences: [["user_id", "house"]] } });
  const s = owner(1);
  assert.equal((await savePreferences({ admin: db, session: s, panel: "health" }, { shortcuts: ["/operator/products"], pageSizes: { products: 50 }, dashboard: ["quotes", "stats"] })).ok, true);
  const row = db.tables.operator_preferences[0];
  assert.deepEqual([row.user_id, row.house, row.shortcuts, row.page_size_products, row.dashboard], [UID(1), "health", ["/operator/products"], 50, ["quotes", "stats"]]);
  const r = await readPreferences(db, s, "health");
  assert.deepEqual([r.ok, r.extras, r.pageSizes.products, r.dashboard], [true, true, 50, ["quotes", "stats"]]);
  // saving only the shortcuts later keeps the page size and the dashboard
  await savePreferences({ admin: db, session: s, panel: "health" }, { shortcuts: [] });
  assert.deepEqual([db.tables.operator_preferences[0].page_size_products, db.tables.operator_preferences[0].dashboard], [50, ["quotes", "stats"]]);
  // other house / other person: nothing
  assert.equal((await readPreferences(db, s, "beauty")).pageSizes.products, null);
  assert.equal((await readPreferences(db, owner(2), "health")).pageSizes.products, null);
  // migration 56 not applied: the select of the new columns fails, the old one still works
  const old = createMemoryAdmin({ operator_preferences: [{ user_id: UID(1), house: "health", start_page: "/operator/products", shortcuts: [] }] }, { schema: { operator_preferences: ["user_id", "house", "start_page", "shortcuts"] } });
  const o = await readPreferences(old, s, "health");
  assert.deepEqual([o.ok, o.extras, o.startPage], [true, false, "/operator/products"]);
  old.fail = (t, op) => (t === "operator_preferences" && op === "upsert" ? { code: "PGRST204", message: "Could not find the 'page_size_products' column of 'operator_preferences' in the schema cache" } : null);
  const saved = await savePreferences({ admin: old, session: s, panel: "health" }, { shortcuts: [], pageSizes: { products: 50 } });
  assert.deepEqual([saved.ok, saved.error], [false, PREF_MESSAGES.needsMigration]);
});

test("a size in the address wins; the person's default fills in only when the address names none; the standard size stays choosable", () => {
  assert.equal(defaultSizeOf({ pageSizes: { products: 50 } }, "products"), 50);
  assert.equal(defaultSizeOf({ pageSizes: { products: 7 } }, "products"), 25); assert.equal(defaultSizeOf(null, "quotes"), 25);
  assert.deepEqual(withDefaultSize({ q: "x" }, 50), { q: "x", size: "50" });
  assert.deepEqual(withDefaultSize({ size: "25" }, 50), { size: "25" }, "an explicit size is never replaced");
  assert.deepEqual(withDefaultSize({ q: "x" }, 25), { q: "x" });
  const params = { page: 1, size: 50, q: "", cat: "", world: "", stock: "", status: "", complete: "", sort: "updated" };
  assert.equal(productHref("/p", params, {}, false, { size: 50 }), "/p", "the person's own default is left out of the address");
  assert.equal(productHref("/p", params, { size: 25 }, undefined, { size: 50 }), "/p?size=25", "choosing the standard size is explicit");
  assert.equal(parseSize("25"), 25);
  assert.equal(quoteHref("/q", { page: 1, size: 100, tab: "active", q: "", status: "", who: "", attention: false }, {}, false, { size: 100 }), "/q");
  assert.equal(productHref("/p", { ...params, size: 25 }, {}, false), "/p", "without a saved default nothing changes");
});

test("both houses' pages, tables and dashboards use them", () => {
  for (const [f, house, list] of [["app/operator/(panel)/products/page.jsx", "health", "products"], ["app/beauty/operator/(panel)/products/page.jsx", "beauty", "products"], ["app/operator/(panel)/quotes/page.jsx", "health", "quotes"], ["app/beauty/operator/(panel)/quotes/page.jsx", "beauty", "quotes"]]) {
    assert.ok(read(f).includes(`defaultSizeOf(await preferencesOf(session, "${house}"), "${list}")`), f);
    assert.match(read(f), /withDefaultSize\(/, f); assert.match(read(f), /defaultSize=\{defaultSize\}/, f);
  }
  for (const f of ["components/operator/ProductsTable.jsx", "components/beauty/operator/ProductsTable.jsx", "components/operator/QuotesPanel.jsx"]) assert.match(read(f), /\{ size: defaultSize \}/, f);
  for (const [f, house] of [["app/operator/(panel)/page.jsx", "health"], ["app/beauty/operator/(panel)/page.jsx", "beauty"]]) {
    assert.ok(read(f).includes(`preferencesOf(session, "${house}")`), f);
    assert.match(read(f), /effectiveDash\(prefs\.dashboard\)/, f); assert.match(read(f), /groupDash\(order\)/, f);
    for (const k of ["stats", "actions", "quotes", "products"]) assert.match(read(f), new RegExp(`\\b${k}: `), `${f}: block ${k}`);
  }
});
