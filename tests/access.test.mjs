// lib/operator/access.js against the real authz rules: who gets through, who is refused, what is logged.
import test from "node:test";
import assert from "node:assert/strict";
import { actorOf, requireOperation, requireAll, mayView, ACCESS_MESSAGES } from "../lib/operator/access.js";
import { OPERATIONS, HOUSES } from "../lib/operator/authz.js";

const person = (o = {}) => ({ id: "00000000-0000-4000-8000-000000000001", status: "active", role: "viewer", houses: ["health"], allow: [], deny: [], approval: {}, ...o });
const session = (user) => ({ sid: "x", uid: user.id, user });
const run = async (user, panel, operation) => {
  const log = [];
  const refusal = await requireOperation({ session: session(user), panel, operation, audit: async (a, m) => { log.push([a, m]); } });
  return { refusal, log };
};

test("the old single env account keeps full power in ITS OWN house, nothing in the other", async () => {
  const legacy = { sid: "x", role: "admin" };                           // no uid / user
  for (const op of Object.keys(OPERATIONS)) {
    if (op.startsWith("brands.")) continue;
    assert.equal(await requireOperation({ session: legacy, panel: "health", operation: op }), null, `legacy health ${op}`);
  }
  assert.equal(await requireOperation({ session: legacy, panel: "beauty", operation: "brands.edit" }), null);
  assert.equal(actorOf(legacy, "health").houses.join(), "health");
  assert.equal(mayView(legacy, "health", "products.view"), true);
});

test("default closed: no session, a claim of a person that was not resolved, an unknown house or operation = refusal", async () => {
  assert.equal(actorOf(null, "health"), null);
  assert.equal(actorOf({ uid: "u1" }, "health"), null, "uid without a resolved user");
  assert.equal(actorOf({ sid: "x" }, "mars"), null);
  for (const [s, p, op] of [[null, "health", "products.create"], [{ uid: "u1" }, "health", "products.create"], [{ sid: "x" }, "mars", "products.create"]]) {
    assert.equal((await requireOperation({ session: s, panel: p, operation: op })).denied, true);
  }
  assert.equal((await run(person({ role: "owner", houses: ["health", "beauty"] }), "health", "products.fly")).refusal.denied, true);
  assert.equal(mayView(null, "health", "products.view"), false);
});

test("a refusal is written to the log with the operation, and says why in a stable message", async () => {
  const { refusal, log } = await run(person({ role: "viewer" }), "health", "products.delete");
  assert.deepEqual([refusal.ok, refusal.denied, refusal.error], [false, true, ACCESS_MESSAGES.denied]);
  assert.deepEqual(log, [["access.denied", { result: "rejected", detail: { reason: "products.delete", method: "denied" } }]]);
  const ok = await run(person({ role: "owner", houses: ["health", "beauty"] }), "health", "products.delete");
  assert.equal(ok.refusal, null);
  assert.deepEqual(ok.log, [], "an allowed call writes nothing here");
});

test("a failing audit writer never turns a refusal into a pass, nor throws", async () => {
  const refusal = await requireOperation({ session: session(person()), panel: "health", operation: "products.delete", audit: async () => { throw new Error("log down"); } });
  assert.equal(refusal.denied, true);
});

test("houses: a Health person has nothing in Beauty, even with an explicit allow", async () => {
  const u = person({ role: "product_manager", houses: ["health"], allow: ["beauty.products.delete", "beauty.*"] });
  assert.equal((await run(u, "beauty", "products.content")).refusal.denied, true);
  assert.equal((await run(u, "health", "products.content")).refusal, null);
  assert.equal(mayView(session(u), "beauty", "products.view"), false);
});

test("roles: who may do what (default policies)", async () => {
  const pm = person({ role: "product_manager", houses: ["health", "beauty"], allow: ["health.products.publish"] });
  const qm = person({ role: "quote_manager" });
  const wm = person({ role: "warehouse_manager" });
  const v = person({ role: "viewer" });
  const ha = person({ role: "house_admin" });
  const cases = [
    // [person, operation, expected]  direct / approval / denied
    [pm, "products.content", null], [pm, "products.create", null], [pm, "products.stock_flag", null], [pm, "products.archive", null],
    [pm, "products.delete", "approval"], [pm, "products.price", "approval"], [pm, "products.publish", "approval"],
    [pm, "quotes.delete", "denied"], [pm, "inventory.adjust", "denied"],
    [qm, "quotes.status", null], [qm, "quotes.assign", null], [qm, "quotes.delete", "approval"], [qm, "products.content", "denied"],
    [wm, "products.content", "denied"], [wm, "quotes.status", "denied"],
    [v, "products.content", "denied"], [v, "quotes.status", "denied"], [v, "media.upload", "denied"],
    [ha, "products.delete", null], [ha, "quotes.delete", null], [ha, "products.export", null],
  ];
  for (const [u, op, expected] of cases) {
    const { refusal } = await run(u, "health", op);
    if (expected === null) assert.equal(refusal, null, `${u.role} ${op}`);
    else {
      assert.ok(refusal, `${u.role} ${op} must be refused`);
      assert.equal(refusal.error, expected === "approval" ? ACCESS_MESSAGES.needsApproval : ACCESS_MESSAGES.denied, `${u.role} ${op}`);
    }
  }
});

test("'needs approval' is a refusal until the queue exists (nothing is half-done)", async () => {
  const pm = person({ role: "product_manager" });
  const { refusal, log } = await run(pm, "health", "products.delete");
  assert.equal(refusal.error, ACCESS_MESSAGES.needsApproval);
  assert.equal(log[0][1].detail.method, "approval");
});

test("requireAll stops at the first refused operation", async () => {
  const pm = person({ role: "product_manager" });
  const r = await requireAll({ session: session(pm), panel: "health", operations: ["products.content", "products.price", "products.stock_flag"] });
  assert.equal(r.denied, true);
  assert.equal(await requireAll({ session: session(pm), panel: "health", operations: ["products.content", "products.stock_flag"] }), null);
});

test("an explicit deny beats the role, even for an owner; a disabled person can do nothing", async () => {
  const owner = person({ role: "owner", houses: ["health", "beauty"], deny: ["health.products.delete"] });
  assert.equal((await run(owner, "health", "products.delete")).refusal.denied, true);
  assert.equal((await run(owner, "beauty", "products.delete")).refusal, null);
  for (const status of ["disabled", "blocked"]) assert.equal((await run(person({ role: "owner", houses: [...HOUSES], status }), "health", "products.content")).refusal.denied, true);
});

test("viewing: permissions of reading are separate from changing", () => {
  const v = session(person({ role: "viewer" }));
  assert.equal(mayView(v, "health", "products.view"), true);
  assert.equal(mayView(v, "health", "quotes.view"), true);
  assert.equal(mayView(v, "health", "audit.view"), false, "the activity log is restricted");
  assert.equal(mayView(v, "health", "inventory.view"), false, "stock is never part of a viewer's reading");
  const qm = session(person({ role: "quote_manager" }));
  assert.equal(mayView(qm, "health", "products.view"), false);
  assert.equal(mayView(qm, "health", "quotes.view"), true);
});
