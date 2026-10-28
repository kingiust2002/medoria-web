// Scheduled publishing (migration 39): the date helpers (the team's time, UTC storage, who may set what), and the scheduler that applies
// due schedules for both houses — conditional on the schedule that was read, the later of two due events wins, a missing migration is
// skipped, every change is in the history and the activity log, the answer is counts only.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { localToIso, isoToLocal, sameInstant, checkSchedule, SCHEDULE_MESSAGES as M } from "../lib/operator/schedule.js";
import { runScheduledPublishing } from "../lib/operator/scheduledPublishing.js";

const NOW = Date.parse("2026-10-27T10:00:00Z");
const at = (h) => new Date(NOW + h * 3_600_000).toISOString();

test("a time typed in the team's zone (UTC+5) is stored as a UTC instant and shown back unchanged", () => {
  assert.equal(localToIso("2026-10-30T09:30"), "2026-10-30T04:30:00.000Z");
  assert.equal(isoToLocal("2026-10-30T04:30:00.000Z"), "2026-10-30T09:30");
  assert.equal(isoToLocal("2026-10-30T04:30:00+00:00"), "2026-10-30T09:30", "the database's own format reads the same");
  assert.equal(localToIso(""), null); assert.equal(localToIso(null), null);
  for (const bad of ["2026-10-30", "2026-02-30T10:00", "2026-10-30T25:00", "2026-10-30T10:61", "soon", 5]) assert.equal(localToIso(bad), undefined, String(bad));
  assert.equal(isoToLocal(""), ""); assert.equal(isoToLocal("nonsense"), "");
  assert.equal(sameInstant("2026-10-30T04:30:00.000Z", "2026-10-30T04:30:00+00:00"), true);
  assert.equal(sameInstant(null, null), true); assert.equal(sameInstant(null, "2026-10-30T04:30:00Z"), false);
});

test("checkSchedule: changed values must lie in the future (at most two years), unchanged ones are never re-judged, archiving comes after publishing", () => {
  assert.deepEqual(checkSchedule({ publish_at: at(5), unpublish_at: null }, {}, NOW), { ok: true, values: { publish_at: at(5), unpublish_at: null } });
  assert.equal(checkSchedule({ publish_at: at(-1) }, {}, NOW).error, M.past);
  assert.equal(checkSchedule({ publish_at: at(24 * 800) }, {}, NOW).error, M.far);
  assert.equal(checkSchedule({ publish_at: "garbage" }, {}, NOW).error, M.bad);
  assert.equal(checkSchedule({ publish_at: at(-1) }, { publish_at: at(-1) }, NOW).ok, true, "a due-but-unapplied schedule can be saved again");
  assert.equal(checkSchedule({ publish_at: at(5), unpublish_at: at(3) }, {}, NOW).error, M.order);
  assert.equal(checkSchedule({ unpublish_at: at(3) }, { publish_at: at(5) }, NOW).error, M.order, "the stored publish time counts when only the archive time is sent");
  assert.deepEqual(checkSchedule({ name: "x" }, {}, NOW), { ok: true, values: {} }, "a form that sends no schedule changes none");
});

function setup(health = [], beauty = []) {
  const logged = [];
  const db = createMemoryAdmin({ products: health, beauty_products: beauty, product_versions: [], beauty_product_versions: [] });
  return { db, logged, audit: async (e) => logged.push(e), revalidated: [] };
}
const prod = (id, o = {}) => ({ id, slug: `p${id}`, is_active: false, publish_at: null, unpublish_at: null, ...o });

test("a due publish goes live, a due archive goes offline, future schedules wait, both clear their date", async () => {
  const { db, audit, logged } = setup([prod(1, { publish_at: at(-1) }), prod(2, { is_active: true, unpublish_at: at(-2) }), prod(3, { publish_at: at(5) }), prod(4, { is_active: true })]);
  const revalidated = [];
  const r = await runScheduledPublishing({ admin: db, now: NOW, audit, revalidate: { health: () => revalidated.push("health") } });
  assert.deepEqual(r, { ok: true, houses: { health: { published: 1, archived: 1, cleared: 0 }, beauty: { published: 0, archived: 0, cleared: 0 } } });
  const by = Object.fromEntries(db.tables.products.map((p) => [p.id, p]));
  assert.deepEqual([by[1].is_active, by[1].publish_at], [true, null]);
  assert.deepEqual([by[2].is_active, by[2].unpublish_at], [false, null]);
  assert.deepEqual([by[3].is_active, by[3].publish_at], [false, at(5)], "not yet");
  assert.equal(by[4].is_active, true);
  assert.deepEqual(revalidated, ["health"], "only a house where something changed is refreshed");
  assert.equal(logged.length, 1); assert.deepEqual([logged[0].action, logged[0].count, logged[0].panel], ["product.scheduled", 2, "health"]);
  assert.deepEqual(db.tables.product_versions.map((v) => [v.product_id, v.kind, v.actor_label, v.after.is_active]), [[1, "quick", "scheduler", true], [2, "quick", "scheduler", false]]);
});

test("the later of two due events wins; a due date that no longer matters is just cleared", async () => {
  const { db } = setup([
    prod(1, { publish_at: at(-5), unpublish_at: at(-2) }),                                   // published then archived → stays archived
    prod(2, { is_active: false, publish_at: at(-2), unpublish_at: at(-5) }),                 // archived then published → goes live
    prod(3, { is_active: true, publish_at: at(-1) }),                                        // already live
    prod(4, { is_active: false, unpublish_at: at(-1) }),                                     // already archived
  ]);
  const r = await runScheduledPublishing({ admin: db, now: NOW });
  const by = Object.fromEntries(db.tables.products.map((p) => [p.id, p]));
  assert.deepEqual([by[1].is_active, by[1].publish_at, by[1].unpublish_at], [false, null, null]);
  assert.deepEqual([by[2].is_active, by[2].publish_at, by[2].unpublish_at], [true, null, null]);
  assert.deepEqual([by[3].is_active, by[3].publish_at], [true, null]);
  assert.deepEqual([by[4].is_active, by[4].unpublish_at], [false, null]);
  assert.deepEqual(r.houses.health, { published: 1, archived: 0, cleared: 3 });
});

test("a schedule edited between the read and the write is not applied; both houses run; a house without the columns is skipped; counts only", async () => {
  const { db } = setup([prod(1, { publish_at: at(-1) })], [prod(1, { is_active: true, unpublish_at: at(-1) })]);
  const real = db.from.bind(db);
  db.from = (table) => {                                         // somebody moves the date right after the read
    const q = real(table);
    if (table !== "products") return q;
    const upd = q.update.bind(q);
    q.update = (p) => { db.tables.products[0].publish_at = at(48); return upd(p); };
    return q;
  };
  const r = await runScheduledPublishing({ admin: db, now: NOW });
  assert.equal(db.tables.products[0].is_active, false, "the new date wins");
  assert.deepEqual(r.houses.beauty, { published: 0, archived: 1, cleared: 0 });
  assert.equal(db.tables.beauty_products[0].is_active, false);
  assert.ok(db.tables.beauty_product_versions.length === 1 && db.tables.product_versions.length === 0);
  assert.ok(!JSON.stringify(r).includes("p1"), "no slug or name in the answer");

  const noCols = createMemoryAdmin({ products: [prod(1)], beauty_products: [] });
  noCols.fail = (table) => (table === "products" ? { code: "42703", message: 'column "publish_at" does not exist' } : null);
  const r2 = await runScheduledPublishing({ admin: noCols, now: NOW });
  assert.deepEqual(r2.houses.health, { skipped: "not_migrated" }); assert.equal(r2.ok, true);
  const broken = createMemoryAdmin({ products: [], beauty_products: [] });
  broken.fail = () => ({ code: "XX000", message: "boom" });
  const r3 = await runScheduledPublishing({ admin: broken, now: NOW });
  assert.equal(r3.ok, false);
});
