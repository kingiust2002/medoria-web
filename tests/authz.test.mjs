import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PERMISSIONS, ROLES, ROLE_IDS, OPERATIONS, HOUSES, isValidPermission, isValidPattern, expandPattern,
  effectivePermissions, can, decide, approvalList, canReview, checkUserChange, sessionPolicy, canEraseUser,
} from "../lib/operator/authz.js";

const U = (o) => ({ id: "u", status: "active", role: "viewer", houses: ["health"], allow: [], deny: [], approval: undefined, ...o });
const owner = (o) => U({ id: "o1", role: "owner", houses: ["health", "beauty"], ...o });

test("catalog: every operation maps to a real permission in both houses (beauty-only brands excepted in health)", () => {
  for (const [op, rel] of Object.entries(OPERATIONS)) {
    for (const h of HOUSES) {
      if (h === "health" && rel.startsWith("brands.")) continue;
      assert.ok(isValidPermission(`${h}.${rel}`), `${op} -> ${h}.${rel}`);
    }
  }
  assert.ok(!isValidPermission("health.brands.view"), "Health has no brands");
  assert.ok(isValidPermission("beauty.brands.view"));
});

test("role presets only reference real permissions and operations", () => {
  for (const id of ROLE_IDS) for (const p of ROLES[id].perms || []) {
    assert.ok(p.startsWith("users.") ? isValidPermission(p) : expandPattern(`beauty.${p}`).length > 0, `${id}: ${p}`);
  }
  for (const id of ROLE_IDS) for (const op of ROLES[id].approval) assert.ok(op in OPERATIONS, `${id}: ${op}`);
});

test("default closed: no role, no grants, an unknown role or an unknown permission = nothing", () => {
  assert.equal(effectivePermissions(U({ role: "nonsense" })).size, 0);
  assert.equal(can(U({ role: "viewer" }), "health.products.edit"), false);
  assert.equal(can(owner(), "health.products.nonexistent"), false);
  assert.equal(can(null, "health.products.view"), false);
  assert.equal(can(undefined, "users.manage"), false);
});

test("a user who is not active can do nothing, whatever the role", () => {
  for (const status of ["disabled", "blocked", "weird", undefined]) {
    assert.equal(effectivePermissions(owner({ status })).size, 0, String(status));
  }
});

test("houses are separate: a Health user has no Beauty permission, even by allow", () => {
  const u = U({ role: "product_manager", houses: ["health"], allow: ["beauty.products.delete", "beauty.*"] });
  assert.equal(can(u, "health.products.edit"), true);
  for (const p of ALL_PERMISSIONS.filter((x) => x.startsWith("beauty."))) assert.equal(can(u, p), false, p);
});

test("deny beats allow, role and owner", () => {
  const u = owner({ deny: ["health.products.delete", "beauty.inventory.*"] });
  assert.equal(can(u, "health.products.delete"), false);
  assert.equal(can(u, "health.products.edit"), true);
  assert.equal(can(u, "beauty.inventory.adjust"), false);
  const v = U({ role: "viewer", allow: ["health.products.edit"], deny: ["health.products.*"] });
  assert.equal(can(v, "health.products.edit"), false);
  assert.equal(can(v, "health.products.view"), false);
});

test("explicit allow adds to the role inside the user's houses only", () => {
  const u = U({ role: "viewer", houses: ["health"], allow: ["health.quotes.edit"] });
  assert.equal(can(u, "health.quotes.edit"), true);
  assert.equal(can(u, "health.quotes.delete"), false);
});

test("invalid patterns grant nothing", () => {
  assert.ok(!isValidPattern("health.nothing.here"));
  assert.ok(!isValidPattern("health..x"));
  const u = U({ allow: ["health.nothing.here", "", 5, null] });
  assert.equal(effectivePermissions(u).size, effectivePermissions(U()).size);
});

test("inventory permissions are separate: product managers and viewers see no stock numbers", () => {
  for (const role of ["product_manager", "viewer", "quote_manager"]) {
    const u = U({ role, houses: ["health", "beauty"] });
    for (const p of ALL_PERMISSIONS.filter((x) => x.includes(".inventory."))) assert.equal(can(u, p), false, `${role} ${p}`);
  }
  assert.equal(can(U({ role: "warehouse_manager" }), "health.inventory.adjust"), true);
  assert.equal(can(U({ role: "warehouse_manager" }), "health.products.edit"), false);
});

test("decide(): direct | approval | denied, per operation and per house", () => {
  const pm = U({ role: "product_manager", houses: ["health", "beauty"] });
  assert.equal(decide(pm, "health", "products.content").mode, "direct");
  assert.equal(decide(pm, "health", "products.publish").mode, "approval", "the role may publish, but only through approval by default");
  assert.equal(decide(U({ role: "viewer" }), "health", "products.publish").mode, "denied");
  const pub = U({ role: "product_manager", houses: ["health"], allow: ["health.products.publish"] });
  assert.equal(decide(pub, "health", "products.publish").mode, "approval", "role default says publish needs approval");
  const trusted = U({ role: "product_manager", houses: ["health"], allow: ["health.products.publish"], approval: { health: [] } });
  assert.equal(decide(trusted, "health", "products.publish").mode, "direct");
  assert.equal(decide(trusted, "beauty", "products.content").mode, "denied");
  assert.equal(decide(trusted, "health", "no.such.op").mode, "denied");
  assert.equal(decide(trusted, "mars", "products.content").mode, "denied");
});

test("'publish directly' does not mean 'may approve others'", () => {
  const trusted = U({ id: "a", role: "product_manager", houses: ["health"], allow: ["health.products.publish"], approval: { health: [] } });
  assert.equal(decide(trusted, "health", "products.publish").mode, "direct");
  assert.equal(canReview(trusted, "b", "health", "products"), false);
  const reviewer = U({ id: "r", role: "house_admin", houses: ["health"] });
  assert.equal(canReview(reviewer, "b", "health", "products"), true);
  assert.equal(canReview(reviewer, "r", "health", "products"), false, "never one's own request");
  assert.equal(canReview(reviewer, "b", "beauty", "products"), false, "other house");
});

test("approval lists: per-house override, else the role's default", () => {
  assert.deepEqual(approvalList(U({ role: "product_manager" }), "health"), ROLES.product_manager.approval);
  assert.deepEqual(approvalList(U({ role: "product_manager", approval: { health: ["products.price"] } }), "health"), ["products.price"]);
  assert.deepEqual(approvalList(U({ role: "product_manager", approval: { health: ["products.price"] } }), "beauty"), ROLES.product_manager.approval);
});

// ── managing accounts ──
const mgr = (o) => U({ id: "m1", role: "house_admin", houses: ["health"], allow: ["users.manage"], ...o });

test("only users.manage may change accounts", () => {
  const r = checkUserChange({ actor: U({ role: "house_admin" }), target: U({ id: "x" }), change: { role: "viewer" }, users: [owner()] });
  assert.deepEqual(r, { ok: false, errors: ["not_allowed"] });
});

test("nobody changes his own role, houses, permissions, approval policy or status", () => {
  const me = owner({ id: "o1" });
  for (const change of [{ role: "viewer" }, { houses: ["health"] }, { allow: ["health.*"] }, { deny: ["health.*"] }, { approval: { health: [] } }, { status: "disabled" }]) {
    const r = checkUserChange({ actor: me, target: me, change, users: [me, owner({ id: "o2" })] });
    assert.equal(r.ok, false, JSON.stringify(change));
    assert.ok(r.errors[0].startsWith("self_"));
  }
  assert.equal(checkUserChange({ actor: me, target: me, change: { role: "owner" }, users: [me] }).ok, true, "a no-op is fine");
});

test("only an owner creates or touches an owner", () => {
  const m = mgr();
  assert.ok(checkUserChange({ actor: m, target: null, change: { role: "owner", houses: ["health"] }, users: [owner()] }).errors.includes("owner_only"));
  assert.ok(checkUserChange({ actor: m, target: owner({ id: "o9" }), change: { status: "disabled" }, users: [owner(), owner({ id: "o9" })] }).errors.includes("owner_only"));
  assert.equal(checkUserChange({ actor: owner(), target: null, change: { role: "owner", houses: ["health", "beauty"] }, users: [owner()] }).ok, true);
});

test("a non-owner cannot give a house he is not in", () => {
  const r = checkUserChange({ actor: mgr(), target: null, change: { role: "viewer", houses: ["beauty"] }, users: [owner()] });
  assert.ok(r.errors.includes("house_outside_actor"));
  const both = checkUserChange({ actor: mgr(), target: null, change: { role: "viewer", houses: ["health", "beauty"] }, users: [owner()] });
  assert.ok(both.errors.includes("house_outside_actor"));
  assert.equal(checkUserChange({ actor: mgr(), target: null, change: { role: "viewer", houses: ["health"] }, users: [owner()] }).ok, true);
});

test("grant ceiling: nobody grants a permission he does not hold", () => {
  const m = mgr({ deny: ["health.products.delete"] });
  assert.ok(checkUserChange({ actor: m, target: null, change: { role: "viewer", houses: ["health"], allow: ["health.products.delete"] }, users: [owner()] }).errors.includes("grant_above_actor"));
  const m2 = mgr();
  assert.ok(checkUserChange({ actor: m2, target: null, change: { role: "viewer", houses: ["health"], allow: ["users.manage"] }, users: [owner()] }).errors.includes("grant_above_actor"), "a non-owner never hands out users.manage");
});

test("a manager without inventory rights cannot create a warehouse manager", () => {
  const m = mgr({ role: "quote_manager" });
  const r = checkUserChange({ actor: m, target: null, change: { role: "warehouse_manager", houses: ["health"] }, users: [owner()] });
  assert.ok(r.errors.includes("grant_above_actor"));
});

test("the last active owner can't be disabled, blocked, demoted or lose a house", () => {
  const o1 = owner({ id: "o1" });
  const actor = owner({ id: "o2", status: "active" });
  const only = [o1, owner({ id: "o2", status: "disabled" })];
  for (const change of [{ status: "disabled" }, { status: "blocked" }, { role: "house_admin" }, { houses: ["health"] }]) {
    const r = checkUserChange({ actor, target: o1, change, users: only });
    assert.ok(r.errors.includes("last_owner"), JSON.stringify(change));
  }
  const two = [o1, owner({ id: "o2" })];
  assert.equal(checkUserChange({ actor, target: o1, change: { status: "disabled" }, users: two }).ok, true);
});

test("malformed input is rejected, not interpreted", () => {
  const o = owner();
  for (const change of [{ role: "god" }, { houses: [] }, { houses: ["mars"] }, { houses: "health" }, { allow: ["nope.nope"] }, { deny: "x" }, { status: "frozen" }, { approval: { health: ["bad.op"] } }, { approval: { mars: [] } }]) {
    assert.equal(checkUserChange({ actor: o, target: U({ id: "t" }), change, users: [o] }).ok, false, JSON.stringify(change));
  }
});

test("accounts are never erased; session policy ends sessions when power changes", () => {
  assert.equal(canEraseUser(), false);
  const before = U({ role: "viewer", houses: ["health"] });
  assert.equal(sessionPolicy(before, { ...before }), "none");
  assert.equal(sessionPolicy(before, { ...before, role: "owner" }), "end_all");
  assert.equal(sessionPolicy(before, { ...before, status: "blocked" }), "end_all");
  assert.equal(sessionPolicy(before, { ...before, allow: ["health.quotes.edit"] }), "end_all");
  assert.equal(sessionPolicy(before, { ...before }, { passwordChanged: true }), "end_all");
  assert.equal(sessionPolicy(before, { ...before }, { twoFactorChanged: true }), "end_all");
  assert.equal(sessionPolicy(before, { ...before, approval: { health: [] } }), "refresh");
});

test("an owner always has both houses", () => {
  const r = checkUserChange({ actor: owner(), target: null, change: { role: "owner", houses: ["health"] }, users: [owner()] });
  assert.ok(r.errors.includes("owner_needs_both_houses"));
});
