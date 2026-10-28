// Personal panel preferences (N10): the start page and up to six pinned shortcuts of one person in one house. Proves which addresses a person may
// choose (only ones they can open, in their own house), the cleaning, save / read against an in-memory database (own row only, own house, upsert),
// that a right taken away drops the shortcut when reading, that the shared login keeps nothing, and that menu, shells, settings, dashboard and login are wired.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { openableTargets, menuHrefs, SHORTCUT_LIMIT } from "../lib/operator/navAccess.js";
import { cleanPreferences, effectivePreferences, PREF_MESSAGES } from "../lib/operator/preferences.js";
import { readPreferences, savePreferences } from "../lib/operator/preferencesCore.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const person = (id, role, houses = ["health", "beauty"]) => ({ user: { id, username: id, status: "active", role, houses, allow: [], deny: [], approval: {} } });
const owner = person("o", "owner"), viewer = person("v", "viewer"), wh = person("w", "warehouse_manager", ["health"]);
const hrefs = (s, p) => openableTargets(s, p).map((x) => x.href);

test("what a person can choose: the pages they can open, in their own house only", () => {
  assert.ok(hrefs(owner, "health").includes("/operator/products") && hrefs(owner, "health").includes("/operator/users"));
  assert.ok(hrefs(owner, "beauty").every((h) => h.startsWith("/beauty/operator")) && hrefs(owner, "health").every((h) => !h.startsWith("/beauty")));
  assert.ok(hrefs(owner, "beauty").includes("/beauty/operator/brands") && !hrefs(owner, "health").includes("/operator/brands"), "brands exist in Beauty only");
  const w = hrefs(wh, "health");
  assert.ok(w.includes("/operator/warehouse") && !w.includes("/operator/users") && !w.includes("/operator/products/new"), w.join());
  assert.deepEqual(hrefs(wh, "beauty"), ["/beauty/operator", "/beauty/operator/settings"].filter((h) => hrefs(wh, "beauty").includes(h)), "a person outside the house has nothing but the always-open pages");
  assert.ok(openableTargets(viewer, "health")[0].href === "/operator" && !hrefs(viewer, "health").includes("/operator/products/new"));
  assert.ok(!menuHrefs(owner, "health").includes("/operator/products/new"), "a shortcut-only entry is not a menu entry");
  const legacy = {};                                                                       // the old shared login: an owner of its own house, no person
  assert.ok(hrefs(legacy, "health").includes("/operator/products") && !hrefs(legacy, "health").includes("/operator/users") && !hrefs(legacy, "health").includes("/operator/approvals"));
});

test("the menu of both layouts comes from the same function and matches the shells' entries", () => {
  for (const [shell, panel] of [["components/operator/OperatorShell.jsx", "health"], ["components/beauty/operator/OperatorShell.jsx", "beauty"]]) {
    const src = read(shell), base = panel === "beauty" ? "/beauty/operator" : "/operator";
    const block = src.slice(src.indexOf("const NAV = ["), src.indexOf("];", src.indexOf("const NAV = [")));
    const nav = [...block.matchAll(/href: (?:"([^"]+)"|`\$\{BASE\}([^`]*)`|BASE)/g)].map((m) => m[1] ?? base + (m[2] ?? ""));
    const all = hrefs(owner, panel).filter((h) => !h.endsWith("/products/new"));
    assert.deepEqual([...nav].sort(), [...all].sort(), `${shell}: every menu entry is a target and vice versa`);
  }
  for (const f of ["app/operator/(panel)/layout.jsx", "app/beauty/operator/(panel)/layout.jsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /\$\{base\}|\bbase\b(?!\w)/, `${f}: no leftover variable from the old menu code`);
    assert.match(src, /menuHrefs\(session, "(health|beauty)"\)/, f); assert.match(src, /preferencesOf\(session, "(health|beauty)"\)/, f); assert.match(src, /shortcuts=\{shortcuts\}/, f);
  }
});

test("cleaning: only openable addresses, no repeats, at most six, dashboard means 'no choice'", () => {
  const ok = cleanPreferences(owner, "health", { startPage: "/operator/quotes", shortcuts: ["/operator/products", "/operator/products", "/operator/quotes"] });
  assert.deepEqual(ok, { ok: true, prefs: { start_page: "/operator/quotes", shortcuts: ["/operator/products", "/operator/quotes"] } });
  assert.deepEqual(cleanPreferences(owner, "health", { startPage: "/operator", shortcuts: [] }).prefs, { start_page: null, shortcuts: [] });
  assert.deepEqual(cleanPreferences(owner, "health", {}).prefs, { start_page: null, shortcuts: [] });
  assert.equal(cleanPreferences(wh, "health", { startPage: "/operator/users" }).error, PREF_MESSAGES.badStart);
  assert.equal(cleanPreferences(owner, "health", { startPage: "/beauty/operator/quotes" }).error, PREF_MESSAGES.badStart, "the other house's page");
  assert.equal(cleanPreferences(owner, "health", { shortcuts: ["/operator/products?x=1"] }).error, PREF_MESSAGES.badShortcut);
  assert.equal(cleanPreferences(owner, "health", { shortcuts: ["https://evil.example/"] }).error, PREF_MESSAGES.badShortcut);
  assert.equal(cleanPreferences(owner, "health", { shortcuts: ["//evil.example"] }).error, PREF_MESSAGES.badShortcut);
  assert.equal(cleanPreferences(owner, "health", { shortcuts: [5] }).error, PREF_MESSAGES.badShortcut);
  const seven = ["/operator/products", "/operator/categories", "/operator/media", "/operator/quotes", "/operator/warehouse", "/operator/content", "/operator/activity"];
  assert.equal(seven.length, SHORTCUT_LIMIT + 1);
  assert.equal(cleanPreferences(owner, "health", { shortcuts: seven }).error, PREF_MESSAGES.tooMany);
  assert.equal(cleanPreferences(owner, "health", { startPage: 5 }).ok, false);
  assert.equal(cleanPreferences(owner, "health", "garbage").ok, true);
});

test("reading drops what the person can no longer open", () => {
  const row = { start_page: "/operator/users", shortcuts: ["/operator/warehouse", "/operator/users", "/operator/products/new", "/beauty/operator/quotes"] };
  assert.deepEqual(effectivePreferences(wh, "health", row), { startPage: null, shortcuts: ["/operator/warehouse"] });
  assert.deepEqual(effectivePreferences(owner, "health", row), { startPage: "/operator/users", shortcuts: ["/operator/warehouse", "/operator/users", "/operator/products/new"] });
  assert.deepEqual(effectivePreferences(owner, "health", null), { startPage: null, shortcuts: [] });
});

const mkDb = () => createMemoryAdmin({ operator_preferences: [] }, { unique: { operator_preferences: [["user_id", "house"]] } });
const ctx = (admin, session, panel = "health") => ({ admin, session, panel });

test("save and read: own row per person and house, saving again replaces it", async () => {
  const db = mkDb();
  assert.equal((await savePreferences(ctx(db, owner), { startPage: "/operator/quotes", shortcuts: ["/operator/products"] })).ok, true);
  assert.equal((await savePreferences(ctx(db, owner), { startPage: null, shortcuts: ["/operator/media", "/operator/quotes"] })).ok, true);
  assert.equal(db.tables.operator_preferences.length, 1, "one row per person and house");
  assert.deepEqual(db.tables.operator_preferences[0], { user_id: "o", house: "health", start_page: null, shortcuts: ["/operator/media", "/operator/quotes"], ...("updated_at" in db.tables.operator_preferences[0] ? { updated_at: db.tables.operator_preferences[0].updated_at } : {}) });
  assert.equal((await savePreferences(ctx(db, owner, "beauty"), { shortcuts: ["/beauty/operator/brands"] })).ok, true);
  assert.equal(db.tables.operator_preferences.length, 2);
  assert.deepEqual(await readPreferences(db, owner, "health"), { ok: true, personal: true, startPage: null, shortcuts: ["/operator/media", "/operator/quotes"] });
  assert.deepEqual((await readPreferences(db, owner, "beauty")).shortcuts, ["/beauty/operator/brands"]);
  const other = await readPreferences(db, viewer, "health");
  assert.deepEqual([other.startPage, other.shortcuts], [null, []], "another person sees nothing of it");
  assert.equal((await savePreferences(ctx(db, viewer), { shortcuts: ["/operator/media"] })).ok, true, "a viewer may pin what a viewer may open");
  assert.equal(db.tables.operator_preferences.find((r) => r.user_id === "o" && r.house === "health").shortcuts.length, 2, "and does not touch the owner's row");
});

test("refusals: shared login, forbidden address, failing database, missing table", async () => {
  const db = mkDb();
  assert.equal((await savePreferences(ctx(db, {}), { shortcuts: [] })).error, PREF_MESSAGES.needsAccount);
  assert.equal((await readPreferences(db, {}, "health")).personal, false);
  assert.equal((await savePreferences(ctx(db, wh), { shortcuts: ["/operator/users"] })).error, PREF_MESSAGES.badShortcut);
  assert.equal(db.tables.operator_preferences.length, 0);
  db.fail = () => ({ message: "boom" });
  assert.equal((await savePreferences(ctx(db, owner), { shortcuts: [] })).error, PREF_MESSAGES.generic);
  const none = createMemoryAdmin({});
  assert.equal((await savePreferences(ctx(none, owner), { shortcuts: [] })).error, PREF_MESSAGES.needsMigration);
  const r = await readPreferences(none, owner, "health");
  assert.equal(r.ok, false); assert.equal(r.needsMigration, true);
});

test("wiring: the settings card, the shortcuts under the menu, the start page after login", () => {
  for (const f of ["app/operator/(panel)/settings/page.jsx", "app/beauty/operator/(panel)/settings/page.jsx"]) assert.match(read(f), /<PreferencesCard targets=\{prefTargets\} initial=\{prefs\} save=\{savePreferencesAction\}/, f);
  for (const f of ["components/operator/OperatorShell.jsx", "components/beauty/operator/OperatorShell.jsx"]) assert.equal((read(f).match(/<Shortcuts items=\{shortcuts\}/g) || []).length, 2, `${f}: desktop and phone menu`);
  assert.match(read("app/login/health/LoginForm.jsx"), /router\.push\("\/operator\?start=1"\)/);
  assert.match(read("app/login/beauty/LoginForm.jsx"), /router\.push\("\/beauty\/operator\?start=1"\)/);
  for (const [f, panel] of [["app/operator/(panel)/page.jsx", "health"], ["app/beauty/operator/(panel)/page.jsx", "beauty"]]) {
    const src = read(f);
    assert.match(src, /\?\.start === "1"/); assert.match(src, new RegExp(`preferencesOf\\(session, "${panel}"\\)`)); assert.match(src, /redirect\(prefs\.startPage\)/);
  }
  assert.doesNotMatch(read("lib/operator/loginFlow.js"), /preferences|startPage/, "the login flow itself is untouched");
  for (const [f, house] of [["lib/operator/preferenceActions.js", "health"], ["lib/beauty/operator/preferenceActions.js", "beauty"]]) {
    const src = read(f);
    assert.match(src, /^"use server";/); assert.match(src, /await getSession\(\)/); assert.match(src, new RegExp(`warehouseCtx\\("${house}"`));
    assert.doesNotMatch(src, /user_id|userId/, "who the person is never comes from the client");
  }
});
