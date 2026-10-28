// lib/operator/publishGate.js — applies the publish quality rule (lib/operator/publishRules.js) to rows. Plain module (the database client is
// passed in) so the same code runs in every action, the approval executors, the scheduler, the import and the unit tests.
//
//   readRules(admin, house)          → { state: "ok", rules, version, ... } | { state: "none" } (migration 46 not applied: no rule) | { state: "error" }
//   gateItems({ admin, house, items }) items: [{ before, after }] (before = the stored row or null, after = the row as it will be stored)
//                                    → { state: "ok" | "none" | "error", blocked: [{ index, codes }] }
//   gateOne(...)                     → null (allowed) | a refusal { ok: false, error, publishBlocked: [codes] } for a single change
//
// FAIL CLOSED: when the rules exist but cannot be read, a change that would make a product public is refused ("unavailable"); a change that
// does not make anything public never touches the rules table at all.
import { rulesFromRow, publishBlockers, blockerCodes, goesPublic, PUBLISH_MESSAGES } from "./publishRules.js";

const missingTable = (e) => e && (e.code === "42P01" || e.code === "PGRST205" || /relation .* does not exist|could not find the table/i.test(String(e.message || "")));

export async function readRules(admin, house) {
  if (!admin) return { state: "error" };
  const { data, error } = await admin.from("publish_rules").select("house,blocking,version,updated_at,updated_label").eq("house", house).maybeSingle();
  if (error) return missingTable(error) ? { state: "none", rules: [], ready: false } : { state: "error" };
  if (!data) return { state: "ok", rules: [], version: 0, updatedAt: null, updatedLabel: null, ready: true };
  return { state: "ok", rules: rulesFromRow(data.blocking), version: data.version, updatedAt: data.updated_at, updatedLabel: data.updated_label ?? null, ready: true };
}

export async function gateItems({ admin, house, items, rules: preRead = null }) {
  const live = (items || []).map((it, index) => ({ ...it, index })).filter((it) => goesPublic(it.after) && it.after.variant_of == null);
  if (!live.length) return { state: "ok", blocked: [] };
  const read = preRead || await readRules(admin, house);
  if (read.state === "error") return { state: "error", blocked: live.map((it) => ({ index: it.index, codes: [] })) };
  if (!read.rules.length) return { state: read.state, blocked: [] };
  const blocked = [];
  for (const it of live) {
    const gaps = publishBlockers(it.after, read.rules, it.before);
    if (gaps.length) blocked.push({ index: it.index, codes: blockerCodes(gaps) });
  }
  return { state: "ok", blocked };
}

export async function gateOne({ admin, house, before, after }) {
  const res = await gateItems({ admin, house, items: [{ before, after }] });
  if (res.state === "error") return { ok: false, error: PUBLISH_MESSAGES.unavailable, publishUnavailable: true };
  return res.blocked.length ? { ok: false, error: PUBLISH_MESSAGES.blocked, publishBlocked: res.blocked[0].codes } : null;
}

// The row as it will be stored: the stored row with a patch laid over it (a new product has no stored row).
export const laidOver = (before, patch) => ({ ...(before || {}), ...(patch || {}) });

// BULK publish: reads the chosen rows (in chunks) and splits them into the ones that may go live and the ones the rule stops.
//   → { ok: true, passIds, blocked: [{ id, sku, codes }], missing } | { ok: false, error }
// `missing` counts ids that no longer exist. Rows that are already live are not touched by a "publish" and always pass.
export async function gateBulkPublish({ admin, house, table, ids }) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from(table).select("*").in("id", ids.slice(i, i + 200));
    if (error) return { ok: false, error: PUBLISH_MESSAGES.unavailable };
    rows.push(...(data || []));
  }
  const todo = rows.filter((r) => r.is_active !== true);
  const res = await gateItems({ admin, house, items: todo.map((r) => ({ before: r, after: { ...r, is_active: true } })) });
  if (res.state === "error") return { ok: false, error: PUBLISH_MESSAGES.unavailable };
  const stop = new Map(res.blocked.map((b) => [todo[b.index].id, b.codes]));
  return {
    ok: true,
    passIds: ids.filter((id) => !stop.has(id)),
    blocked: [...stop].map(([id, codes]) => ({ id, sku: rows.find((r) => r.id === id)?.sku ?? null, codes })).slice(0, 100),
    blockedCount: stop.size,
    missing: ids.length - rows.length,
  };
}

// IMPORT / bulk-add: the planned rows go through the same rule. A row that would go live but does not satisfy it is still saved — as an
// INACTIVE draft (a new row gets is_active=false; an update simply does not switch the product on) — and its plan says why, so nothing is lost
// and nothing incomplete becomes public. `plan.publishBlocked` = the missing codes; `plan.publishUnavailable` when the rules cannot be read.
export async function applyRulesToPlans({ admin, house, table, plans }) {
  const todo = plans.filter((p) => (p.action === "create" || p.action === "update") && p.write && p.write.variant_of == null);
  if (!todo.length) return { state: "ok", downgraded: 0 };
  // the stored rows of the updates (an update is judged on the stored row with the patch laid over it)
  const stored = new Map();
  const ids = todo.filter((p) => p.action === "update").map((p) => p.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from(table).select("*").in("id", ids.slice(i, i + 200));
    if (error) { for (const p of todo) markUnavailable(p); return { state: "error", downgraded: todo.length }; }
    for (const r of data || []) stored.set(r.id, r);
  }
  const items = todo.map((p) => {
    const before = p.action === "update" ? stored.get(p.id) || null : null;
    return { before, after: { ...(before || {}), ...p.write } };
  });
  const res = await gateItems({ admin, house, items });
  if (res.state === "error") { for (const p of todo) { if (goesPublic(laid(p, stored))) markUnavailable(p); } return { state: "error", downgraded: todo.length }; }
  for (const b of res.blocked) {
    const p = todo[b.index];
    downgrade(p);
    p.publishBlocked = b.codes;
  }
  return { state: "ok", downgraded: res.blocked.length };
}
const laid = (p, stored) => ({ ...(p.action === "update" ? stored.get(p.id) || {} : {}), ...p.write });
function downgrade(p) {
  if (p.action === "create") p.write = { ...p.write, is_active: false };
  else { const { is_active, publish_at, ...rest } = p.write; p.write = rest; }       // the product is not switched on, and a publish date is not set
}
function markUnavailable(p) {
  if (p.action === "create") { if (p.write.is_active !== false) { downgrade(p); p.publishUnavailable = true; } }
  else if (p.write.is_active === true || p.write.publish_at) { downgrade(p); p.publishUnavailable = true; }
}
