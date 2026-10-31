// lib/operator/scheduledPublishing.js — applies the due schedules of BOTH houses (migration 39). Called by the host cron through
// app/api/internal/scheduled-publishing/route.js. Plain module (the client and the side effects are passed in): unit-tested.
//
//   publish_at   <= now and the product is inactive → active, schedule cleared
//   unpublish_at <= now and the product is active   → inactive, schedule cleared
//   both due: the LATER one wins (a publish after an archive leaves it live; an archive after a publish leaves it archived)
//   a due schedule that no longer matters (already live / already archived) is just cleared
// Every change is a conditional update on the exact schedule that was read (a person who edited it meanwhile wins), is recorded in the
// product history (kind "quick", actor "scheduler") and in the activity log. Never throws; a house whose columns are missing is skipped.
import { recordVersion } from "./productVersions.js";
import { sameInstant } from "./schedule.js";
import { gateItems, readRules } from "./publishGate.js";

export const HOUSES = [{ panel: "health", table: "products" }, { panel: "beauty", table: "beauty_products" }];
const BATCH = 200;
const missingColumn = (e) => e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist/i.test(String(e.message || "")));
const WHO = { userId: null, label: "scheduler" };

async function runHouse({ admin, panel, table, now, audit }) {
  const iso = new Date(now).toISOString();
  const out = { published: 0, archived: 0, cleared: 0, blocked: 0 };
  const due = new Map();
  for (const col of ["publish_at", "unpublish_at"]) {
    const { data, error } = await admin.from(table).select("*").lte(col, iso).not(col, "is", null).limit(BATCH);
    if (error) return missingColumn(error) ? { skipped: "not_migrated" } : { error: "read_failed" };
    for (const r of data || []) due.set(r.id, r);
  }
  const touched = [];
  let rules = null;                                         // read once per run, and only when a product is about to go live
  for (const r of due.values()) {
    const pubDue = r.publish_at && Date.parse(r.publish_at) <= now, unpubDue = r.unpublish_at && Date.parse(r.unpublish_at) <= now;
    // the later due event decides
    let target = null;                                     // true = live, false = archived, null = leave as is
    if (pubDue && unpubDue) target = Date.parse(r.publish_at) >= Date.parse(r.unpublish_at);
    else if (pubDue) target = true;
    else if (unpubDue) target = false;
    // the publish rule: a product that is about to go live must satisfy it NOW (fields may have changed since the date was set). A blocked
    // one is left exactly as it is — still inactive, its date kept — and tried again at the next run, so fixing it publishes it.
    if (target === true && !r.is_active) {
      rules ??= await readRules(admin, panel);
      const g = await gateItems({ admin, house: panel, items: [{ before: r, after: { ...r, is_active: true } }], rules });
      if (g.state === "error" || g.blocked.length) { out.blocked++; continue; }
    }
    const patch = {};
    if (pubDue) patch.publish_at = null;
    if (unpubDue) patch.unpublish_at = null;
    if (target !== null && Boolean(r.is_active) !== target) patch.is_active = target;
    let q = admin.from(table).update(patch).eq("id", r.id);
    for (const c of ["publish_at", "unpublish_at"]) q = r[c] ? q.eq(c, r[c]) : q.is(c, null);     // only the schedule that was read
    const { data, error } = await q.select("id");
    if (error || !data?.length) continue;                  // edited meanwhile, or a transient failure: the next run decides again
    if ("is_active" in patch) {
      out[patch.is_active ? "published" : "archived"]++;
      touched.push(r);
      await recordVersion(admin, panel, { productId: r.id, kind: "quick", before: { is_active: r.is_active, ...(pubDue ? { publish_at: r.publish_at } : {}), ...(unpubDue ? { unpublish_at: r.unpublish_at } : {}) }, after: { is_active: patch.is_active, ...(pubDue ? { publish_at: null } : {}), ...(unpubDue ? { unpublish_at: null } : {}) }, who: WHO });
    } else out.cleared++;
  }
  if (touched.length && audit) {
    try {
      await audit({ panel, action: "product.scheduled", entity: table, ids: touched.map((t) => t.id).slice(0, 50), count: touched.length, detail: { moved: out.published, kept: out.archived } });
    } catch { /* the history rows exist */ }
  }
  if (out.blocked && audit) {
    try { await audit({ panel, action: "product.scheduled_blocked", entity: table, count: out.blocked, detail: { count: out.blocked } }); } catch { /* the counter is in the answer */ }
  }
  return { ...out, slugs: touched.map((t) => t.slug).filter(Boolean) };
}

// → { ok, houses: { health: {published, archived, cleared} | {skipped} | {error}, beauty: ... } }
export async function runScheduledPublishing({ admin, now = Date.now(), audit = null, revalidate = {} } = {}) {
  const houses = {};
  let ok = true;
  for (const { panel, table } of HOUSES) {
    try {
      const r = await runHouse({ admin, panel, table, now, audit });
      if (r.error) ok = false;
      if (r.published || r.archived) { try { revalidate[panel]?.(); } catch { /* the pages refresh on their own within minutes */ } }
      const { slugs, ...rest } = r;                                      // the answer carries counts only
      houses[panel] = rest;
    } catch { houses[panel] = { error: "failed" }; ok = false; }
  }
  return { ok, houses };
}

export { sameInstant };
