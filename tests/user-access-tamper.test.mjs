// Access changes through the people-screen core (userActionsCore.js) with request bodies a browser would never send: whatever the screen offered, the
// SERVER decides. A limited manager cannot hand out more than they hold, nor take over a stronger account; nobody edits their own power; unsupported
// approval modes, unknown or oversized lists, other houses and owners are refused; the last owner stays; and a refusal changes nothing. (The server
// actions are thin wrappers around these functions; tests/panel-actions-guard.test.mjs pins that each opens with the session check.)
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { createPerson, updatePerson, restorePerson } from "../lib/operator/userActionsCore.js";
import { rowToUser, invalidateSessionUser } from "../lib/operator/accounts.js";
import { can, decide } from "../lib/operator/authz.js";
import { hashPassword } from "../lib/operator/passwords.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HASH = hashPassword("Correct-horse-42");
const row = (n, o = {}) => ({
  id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: HASH, status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [], approval: {},
  require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, created_at: "2026-01-01", ...o,
});
const ADMIN = ["username", "display_name", "status", "role", "houses", "allow_perms", "deny_perms", "approval", "require_2fa", "password_hash"];
let db, logs;
const setup = (rows) => {
  db = createMemoryAdmin({ operator_users: rows, operator_sessions: [] }, {
    unique: { operator_users: [["username"]] },
    beforeUpdate: { operator_users: (old, next, all) => {
      if (old.role === "owner" && old.status === "active" && !(next.role === "owner" && next.status === "active" && next.houses.length === 2) && !all.some((r) => r !== old && r.role === "owner" && r.status === "active" && r.houses.length === 2)) return { code: "P0001", message: "the last active owner cannot be demoted" };
      if (ADMIN.some((f) => JSON.stringify(old[f]) !== JSON.stringify(next[f]))) next.version = old.version + 1;
      return null;
    } },
    defaults: { operator_users: () => ({ id: `00000000-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`, version: 1, authz_version: 1 }) },
  });
  logs = []; invalidateSessionUser();
};
const RE = { password: "pw" };
const ctx = (actorRow) => ({
  admin: db, session: { sid: "s", uid: actorRow.id, user: rowToUser(db.tables.operator_users.find((r) => r.id === actorRow.id)) }, panel: "health",
  audit: async (action, meta) => { logs.push({ action, ...meta }); return { ok: true }; }, reauthenticate: async (i) => (i?.password === "pw" ? { ok: true } : { ok: false, error: "wrongPassword" }),
});
const owner = row(1, { username: "boss", role: "owner", houses: ["health", "beauty"] });
const hadmin = row(2, { username: "hadmin", role: "house_admin", houses: ["health"], allow_perms: ["users.manage"] });            // Health manager
const pmgr = row(3, { username: "pmgr", role: "product_manager", houses: ["health"], allow_perms: ["users.manage"] });          // price/publish/delete need APPROVAL for them
const staff = row(4, { username: "staff", role: "product_manager", houses: ["health"] });
const viewer = row(5, { username: "viewer", role: "viewer", houses: ["health"] });
const stored = (n) => rowToUser(db.tables.operator_users.find((r) => r.id === id(n)));
const untouched = (n, before) => assert.deepEqual(JSON.stringify(stored(n)), before, "a refusal changes nothing");
beforeEach(() => setup([owner, hadmin, pmgr, staff, viewer]));

test("the access editor's lists work end to end: unticking a thing the role gives really closes it, and the history says which permission", async () => {
  const r = await updatePerson(ctx(owner), id(4), { allow: [], deny: ["health.products.price"] }, 1, RE);
  assert.equal(r.ok, true, JSON.stringify(r));
  const u = stored(4);
  assert.equal(can(u, "health.products.edit"), true);
  assert.equal(can(u, "health.products.price"), false);
  assert.equal(decide(u, "health", "products.price").mode, "denied");
  const entry = logs.find((l) => l.action === "user.update" && l.result === "success");
  assert.deepEqual(entry.detail.perms_removed, ["health_products_price"], "the history names the permission (as a safe code)");
  assert.ok(!JSON.stringify(logs).includes("pw"));
});

test("a limited manager cannot hand out a permission they do not hold: a named one, a wildcard, or the user-management right", async () => {
  const before = JSON.stringify(stored(5));
  for (const allow of [["health.inventory.adjust"], ["health.*"], ["*"], ["users.manage"], ["beauty.products.view"]]) {
    const r = await updatePerson(ctx(pmgr), id(5), { allow }, 1, RE);
    assert.equal(r.ok, false, JSON.stringify(allow));
  }
  untouched(5, before);
  // what they DO hold can be handed out
  assert.equal((await updatePerson(ctx(hadmin), id(5), { allow: ["health.inventory.adjust"] }, 1, RE)).ok, true);
  // …but not user management, which only an owner gives
  assert.equal((await updatePerson(ctx(hadmin), id(5), { allow: ["users.manage"] }, 2, RE)).ok, false);
  assert.equal((await updatePerson(ctx(owner), id(5), { allow: ["users.manage"] }, 2, RE)).ok, true);
});

test("execution modes are a ceiling: a manager who needs approval cannot give direct execution (by role, by list, or by emptying the approval list)", async () => {
  const before = JSON.stringify(stored(4));
  const r1 = await updatePerson(ctx(pmgr), id(4), { approval: { health: [] } }, 1, RE);        // staff is a product manager: price needs approval by role; [] would make it direct
  assert.equal(r1.ok, false);
  assert.match(r1.error, /اجرای مستقیم/);
  const r2 = await updatePerson(ctx(pmgr), id(5), { role: "house_admin" }, 1, RE);
  assert.equal(r2.ok, false, "a role that executes directly what the manager only requests");
  untouched(4, before);
  assert.equal((await updatePerson(ctx(owner), id(4), { approval: { health: [] } }, 1, RE)).ok, true, "an owner may");
});

test("approval is refused for an operation that has no approval path, in a list the screen would never offer", async () => {
  const before = JSON.stringify(stored(4));
  for (const approval of [{ health: ["products.export"] }, { health: ["quotes.status"] }, { health: ["nonsense.op"] }, { mars: ["products.price"] }, { health: "products.price" }]) {
    assert.equal((await updatePerson(ctx(owner), id(4), { approval }, 1, RE)).ok, false, JSON.stringify(approval));
  }
  // brands do not exist in Health
  assert.equal((await updatePerson(ctx(owner), id(4), { approval: { health: ["brands.delete"] } }, 1, RE)).ok, false);
  untouched(4, before);
  assert.equal((await updatePerson(ctx(owner), id(4), { approval: { health: ["products.price"] } }, 1, RE)).ok, true);
});

test("malformed or oversized lists are refused as a whole, never trimmed into something else", async () => {
  const before = JSON.stringify(stored(5));
  const big = Array.from({ length: 201 }, (_, i) => `health.products.view`.concat(i ? "" : ""));
  for (const allow of ["health.products.view", { a: 1 }, [1, 2], ["health.products.fly"], [null], big, ["health.products.view", ""], ["HEALTH.PRODUCTS.VIEW; DROP"]]) {
    const r = await updatePerson(ctx(owner), id(5), { allow }, 1, RE);
    assert.equal(r.ok, false, JSON.stringify(allow).slice(0, 60));
  }
  assert.equal((await updatePerson(ctx(owner), id(5), { deny: "all" }, 1, RE)).ok, false);
  untouched(5, before);
});

test("houses: a Health manager cannot give Beauty, and a Health-only person has no Beauty permission whatever the lists say", async () => {
  const before = JSON.stringify(stored(5));
  assert.equal((await updatePerson(ctx(hadmin), id(5), { houses: ["health", "beauty"] }, 1, RE)).ok, false);
  assert.equal((await updatePerson(ctx(hadmin), id(5), { houses: ["beauty"] }, 1, RE)).ok, false);
  untouched(5, before);
  // an owner stores a Beauty grant for a Health-only person: it is stored but reaches nothing (a permission needs the house)
  assert.equal((await updatePerson(ctx(owner), id(5), { allow: ["beauty.products.edit"] }, 1, RE)).ok, true);
  const u = stored(5);
  assert.equal(can(u, "beauty.products.edit"), false);
  assert.equal(decide(u, "beauty", "products.price").mode, "denied");
});

test("nobody edits their own power, and a manager cannot take over a stronger account or an owner", async () => {
  const beforeSelf = JSON.stringify(stored(2));
  for (const change of [{ allow: ["health.inventory.adjust"] }, { deny: ["health.products.view"] }, { role: "owner" }, { approval: { health: [] } }, { houses: ["health", "beauty"] }, { require2fa: true }]) {
    assert.equal((await updatePerson(ctx(hadmin), id(2), change, 1, RE)).ok, false, JSON.stringify(change));
  }
  untouched(2, beforeSelf);
  const beforeOwner = JSON.stringify(stored(1)), beforeAdmin = JSON.stringify(stored(2));
  assert.equal((await updatePerson(ctx(hadmin), id(1), { deny: ["health.products.view"] }, 1, RE)).ok, false, "an owner is an owner's business");
  assert.equal((await updatePerson(ctx(pmgr), id(2), { deny: ["health.quotes.view"] }, 1, RE)).ok, false, "a weaker manager cannot edit a stronger one");
  untouched(1, beforeOwner); untouched(2, beforeAdmin);
  assert.equal((await createPerson(ctx(hadmin), { username: "wannabe", displayName: "W", role: "owner", houses: ["health", "beauty"] }, RE)).ok, false);
  assert.equal((await createPerson(ctx(hadmin), { username: "wannabe", displayName: "W", role: "viewer", houses: ["health"], allow: ["health.users"] }, RE)).ok, false, "not a permission");
  assert.ok(!db.tables.operator_users.some((r) => r.username === "wannabe"));
});

test("the last owner stays, also through the access lists", async () => {
  const before = JSON.stringify(stored(1));
  setup([owner, hadmin]);
  const r = await updatePerson(ctx(owner), id(1), { role: "house_admin" }, 1, RE);
  assert.equal(r.ok, false);
  setup([owner, hadmin]);
  untouched(1, before);
});

test("restoring from the archive takes the same lists, with the same ceiling", async () => {
  setup([owner, hadmin, pmgr, row(6, { username: "gone", status: "archived", archived_at: "2026-10-01T00:00:00Z" })]);
  assert.equal((await restorePerson(ctx(pmgr), id(6), { allow: ["health.inventory.adjust"] }, 1, RE)).ok, false, "more than the manager holds");
  assert.equal((await restorePerson(ctx(hadmin), id(6), { allow: ["health.inventory.adjust"], deny: ["health.products.view"] }, 1, RE)).ok, true);
  const u = stored(6);
  assert.deepEqual([u.status, can(u, "health.inventory.adjust"), can(u, "health.products.view")], ["active", true, false]);
});
