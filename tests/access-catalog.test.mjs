// The tick-box vocabulary (lib/operator/accessCatalog.js): every permission has a tick, every tick has a clear title, ticks turn into the stored
// allow/deny lists and back WITHOUT changing what a person can do, "edit price" is a tick of its own (still implied by "edit" for old accounts),
// and "direct / needs approval" is offered only where a real approval path exists.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PERMISSIONS, APPROVABLE_OPERATIONS, HOUSES, OPERATIONS, ROLE_IDS, approvableFor, can, decide, effectivePermissions,
} from "../lib/operator/authz.js";
import {
  GROUPS, catalogFor, codeOf, describePermission, diffAccess, listsFromTicks, permissionTitle, roleDefaults, ticksOf, uncoveredPermissions, GLOBAL_ITEMS,
} from "../lib/operator/accessCatalog.js";
import { OPERATION_LABELS } from "../lib/operator/userLabels.js";
import { isValidPattern } from "../lib/operator/authz.js";
import { UNBUILT, isBuilt } from "../lib/operator/accessCatalog.js";
import fs from "node:fs";
import path from "node:path";

const U = (o) => ({ id: "u", status: "active", role: "viewer", houses: ["health"], allow: [], deny: [], approval: {}, ...o });
const scopeOf = (houses) => ALL_PERMISSIONS.filter((p) => isBuilt(p) && (p.startsWith("users.") || houses.some((h) => p.startsWith(`${h}.`))));

test("every permission of the model has exactly one tick (nothing hidden, nothing invented)", () => {
  assert.deepEqual(uncoveredPermissions(), []);
  const seen = new Map();
  for (const h of HOUSES) for (const g of catalogFor(h)) for (const i of g.items) {
    assert.ok(ALL_PERMISSIONS.includes(i.permission), `${i.permission} is not a permission`);
    assert.equal(seen.has(i.permission), false, `${i.permission} appears twice`);
    seen.set(i.permission, g.id);
  }
  assert.equal(seen.size + GLOBAL_ITEMS.length, ALL_PERMISSIONS.filter(isBuilt).length);
  assert.ok(!catalogFor("health").some((g) => g.id === "brands"), "Health has no brands");
  assert.ok(catalogFor("beauty").some((g) => g.id === "brands"));
  assert.deepEqual(GROUPS.map((g) => g.id).slice(0, 8), ["products", "categories", "brands", "media", "documents", "quotes", "inventory", "content"]);
});

test("clear operation titles: view, create, edit, edit price, archive, delete, publish, export, approve changes — and no raw code is ever a title", () => {
  const products = catalogFor("health").find((g) => g.id === "products");
  const titles = Object.fromEntries(products.items.map((i) => [i.rel, i.title]));
  for (const rel of ["products.view", "products.create", "products.edit", "products.price", "products.archive", "products.delete", "products.publish", "products.export", "products.approve"]) {
    assert.ok(titles[rel] && titles[rel] !== rel, rel);
  }
  assert.equal(new Set(Object.values(titles)).size, Object.values(titles).length, "no two ticks of a group share a title");
  for (const h of HOUSES) for (const g of catalogFor(h)) for (const i of g.items) assert.ok(!/^[a-z]+\.[a-z_]+$/.test(permissionTitle(i.rel)), `${i.permission} has no human title`);
  assert.deepEqual([describePermission("health.products.price").house, describePermission("users.manage").house], ["health", null]);
});

test("direct / needs approval is offered ONLY for operations that really have an approval path, in the group they belong to", () => {
  for (const h of HOUSES) {
    const offered = catalogFor(h).flatMap((g) => g.operations.map((o) => o.op));
    assert.deepEqual([...offered].sort(), [...approvableFor(h)].sort(), `${h}: exactly the approvable operations`);
    for (const op of offered) assert.ok(APPROVABLE_OPERATIONS.includes(op) && OPERATION_LABELS[op], op);
    for (const g of catalogFor(h)) for (const o of g.operations) {
      assert.equal(o.permission, `${h}.${OPERATIONS[o.op]}`);
      assert.ok(g.items.some((i) => i.permission === o.permission), `${o.op}: its permission is a tick of the same group`);
    }
  }
  assert.ok(!catalogFor("health").flatMap((g) => g.operations).some((o) => o.op.startsWith("brands.")));
});

test("round trip: any set of ticks becomes allow/deny lists that give EXACTLY those ticks, for every role and house set", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const role of ROLE_IDS) for (const houses of [["health"], ["beauty"], ["health", "beauty"]]) {
    const defaults = roleDefaults({ role, houses });
    const scope = scopeOf(houses);
    for (let round = 0; round < 25; round++) {
      const ticks = new Set(scope.filter(() => rnd() < (round === 0 ? 0 : round === 1 ? 1 : 0.5)));
      for (const h of houses) if (!ticks.has(`${h}.products.edit`)) ticks.delete(`${h}.products.price`);       // a price right needs the right to edit
      const { allow, deny } = listsFromTicks({ role, houses, ticks });
      for (const x of [...allow, ...deny]) assert.ok(isValidPattern(x), x);
      const got = new Set([...effectivePermissions(U({ role, houses, allow, deny }))].filter(isBuilt));
      assert.deepEqual([...got].sort(), [...ticks].sort(), `${role} ${houses}: ticks must equal what the person can do`);
    }
    // nothing is stored when the ticks equal the role
    assert.deepEqual(listsFromTicks({ role, houses, ticks: defaults }), { allow: [], deny: [] }, `${role} ${houses}`);
  }
});

test("an existing account (wildcards, typed patterns) opens as ticks, and saving those ticks changes nothing it can do", () => {
  const accounts = [
    U({ role: "viewer", houses: ["health", "beauty"], allow: ["beauty.*", "health.quotes.edit"], deny: ["beauty.products.delete"] }),
    U({ role: "product_manager", houses: ["health"], allow: ["health.inventory.*"], deny: ["health.products.*"] }),
    U({ role: "house_admin", houses: ["beauty"], deny: ["beauty.brands.delete", "beauty.audit.*"] }),
    U({ role: "quote_manager", houses: ["health"], allow: ["users.view"] }),
  ];
  for (const a of accounts) {
    const ticks = ticksOf(a);
    const { allow, deny } = listsFromTicks({ role: a.role, houses: a.houses, ticks });
    assert.deepEqual([...effectivePermissions({ ...a, allow, deny })].filter(isBuilt).sort(), [...ticks].filter(isBuilt).sort());
  }
});

test("unticking really denies; ticking really grants; the role never silently wins", () => {
  const pm = U({ role: "product_manager", houses: ["health"] });
  const ticks = ticksOf(pm);
  assert.ok(ticks.has("health.products.edit") && ticks.has("health.products.price"), "the role gives edit and price");
  const without = new Set(ticks); without.delete("health.products.price");
  const { allow, deny } = listsFromTicks({ role: "product_manager", houses: ["health"], ticks: without });
  assert.deepEqual([allow, deny], [[], ["health.products.price"]]);
  const stored = { ...pm, allow, deny };
  assert.equal(can(stored, "health.products.edit"), true, "still edits");
  assert.equal(can(stored, "health.products.price"), false, "…but the price is closed");
  assert.equal(decide(stored, "health", "products.price").mode, "denied");
  assert.equal(decide(stored, "health", "products.content").mode, "direct");
  // a closed edit closes the price too, and a price right alone gives nothing
  assert.equal(can(U({ role: "product_manager", houses: ["health"], deny: ["health.products.edit"] }), "health.products.price"), false);
  assert.equal(can(U({ role: "viewer", houses: ["health"], allow: ["health.products.price"] }), "health.products.price"), false);
  // an extra grant is an allow
  const more = new Set(ticks); more.add("health.quotes.view");
  assert.deepEqual(listsFromTicks({ role: "product_manager", houses: ["health"], ticks: more }), { allow: ["health.quotes.view"], deny: [] });
});

test("old accounts keep their price right: everybody who could edit a product still changes its price, until someone closes it", () => {
  for (const role of ["house_admin", "product_manager", "owner"]) assert.equal(can(U({ role, houses: ["health"] }), "health.products.price"), true, role);
  assert.equal(can(U({ role: "viewer", houses: ["health"], allow: ["health.products.edit"] }), "health.products.price"), true, "an explicit edit grant implies price");
  assert.equal(can(U({ role: "owner", houses: ["health", "beauty"], deny: ["beauty.products.price"] }), "beauty.products.price"), false, "an owner is not exempt from a deny");
});

test("the summary before saving: permissions added / removed, houses, role, direct ⇄ needs-approval", () => {
  const before = U({ role: "product_manager", houses: ["health"] });
  const after = { ...before, deny: ["health.products.price"], approval: { health: [] } };
  const d = diffAccess(before, after);
  assert.deepEqual(d.removed, ["health.products.price"]);
  assert.deepEqual(d.added, []);
  const ops = d.modes.map((m) => [m.op, m.from, m.to]);
  assert.ok(ops.some((m) => m[0] === "products.publish" && m[1] === "approval" && m[2] === "direct"), "publish became direct");
  assert.ok(!ops.some((m) => m[0] === "products.price"), "the price is closed, not 'direct' — it shows under removed");
  assert.equal(diffAccess(before, before).empty, true);
  const more = diffAccess(before, { ...before, houses: ["health", "beauty"] });
  assert.deepEqual(more.houses, { added: ["beauty"], removed: [] });
  assert.ok(more.added.every((p) => p.startsWith("beauty.")));
  assert.equal(diffAccess(before, { ...before, role: "viewer" }).roleChanged, true);
  assert.equal(codeOf("health.products.price"), "health_products_price");
  assert.match(codeOf("beauty.inventory.quarantine"), /^[a-z_]{1,40}$/, "fits the history's safe-code rule");
});

// ── review R2: a tick must do something ─────────────────────────────────────────────────────────────────────────────────
function sourceFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", ".next", ".next-e2e"].includes(e.name)) sourceFiles(p, out); }
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const ROOT = new URL("..", import.meta.url).pathname;
const SKIP_FILES = new Set(["lib/operator/authz.js", "lib/operator/accessCatalog.js", "lib/operator/userLabels.js"]);
const SOURCES = ["app", "lib", "components"].flatMap((d) => sourceFiles(path.join(ROOT, d))).filter((f) => !SKIP_FILES.has(path.relative(ROOT, f))).map((f) => fs.readFileSync(f, "utf8"));
const opPermissions = new Set(Object.values(OPERATIONS));
const AUTHZ_TEXT = fs.readFileSync(path.join(ROOT, "lib/operator/authz.js"), "utf8");
// does the application ask for this permission anywhere? by an operation, by the approval rule (`<resource>.approve`), or by naming it
const hasCodePath = (rel) => opPermissions.has(rel) || (rel.endsWith(".approve") && AUTHZ_TEXT.includes("${house}.${resource}.approve"))      // canReview(): the one place that asks for `<resource>.approve`
  || SOURCES.some((s) => new RegExp(`["'\`]${rel.replace(".", "\\.")}["'\`]`).test(s));

test("every tick the editor offers has a real code path behind it; every permission it does not offer has none (so nothing is promised that cannot happen)", () => {
  for (const h of HOUSES) for (const g of catalogFor(h)) for (const i of g.items) assert.ok(hasCodePath(i.rel), `${i.permission} is offered but nothing in the application asks for it`);
  for (const i of GLOBAL_ITEMS) assert.ok(hasCodePath(i.rel), i.permission);
  for (const rel of UNBUILT) assert.equal(hasCodePath(rel), false, `${rel} now has a code path: move it out of UNBUILT so the editor offers it`);
  // and the model itself still names them (an old role or stored grant may), they just are not ticks
  for (const rel of UNBUILT) assert.ok(ALL_PERMISSIONS.some((p) => p.endsWith(`.${rel}`)), rel);
});

test("the not-yet-built permissions never appear in a summary and are not stored by the editor", () => {
  const before = U({ role: "viewer", houses: ["health"] }), after = U({ role: "house_admin", houses: ["health"] });
  const d = diffAccess(before, after);
  assert.ok(d.added.length > 0 && d.added.every(isBuilt), "a role change lists only permissions that do something");
  assert.ok(!d.added.some((p) => p.includes("customers.merge") || p.includes("customers.edit")));
  const ticks = ticksOf(after);
  const { allow, deny } = listsFromTicks({ role: "house_admin", houses: ["health"], ticks: new Set([...ticks].filter(isBuilt)) });
  assert.deepEqual([allow, deny], [[], []], "ticks equal to the role store nothing, and unbuilt permissions are not stored either way");
});
