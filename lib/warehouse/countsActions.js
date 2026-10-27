// lib/warehouse/countsActions.js — the work behind the stock-count and minimum-level server actions of BOTH panels. Same ctx as actionsCore:
//   ctx.require(ops) → null | refusal · ctx.evaluate(op) → { mode, refusal? } · ctx.file(spec) → the object to return
// Starting, entering and cancelling a count need `inventory.count_start`; CLOSING one posts stock adjustments, so it goes through
// `inventory.count_close` (direct, or a change request a reviewer approves — the request carries the exact differences and an approval
// whose differences have since changed fails as stale). Each difference is posted with its own idempotency key: closing twice posts once.
import { STOCK_MESSAGES } from "./core.js";
import { cleanCountedEntries, cleanLevel, COUNT_MESSAGES, countCsv, differencesOf, movementsCsv, proposalText, stockCsv, summarize, isLow } from "./countsCore.js";
import * as counts from "./countsStore.js";
import * as store from "./store.js";
import { tr } from "../panel/i18n.js";

const whoOf = (ctx) => {
  const u = ctx.session?.user;
  return { userId: u?.id ?? null, label: String(u?.username || ctx.session?.username || "operator").slice(0, 80), requestId: null };
};
async function log(ctx, action, result, ids, detail) {
  try { await ctx.audit(action, { entity: "stock", ids, result, detail }); } catch { /* the ledger and the count have the record */ }
}
const countId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const STALE_COUNT = tr("شمارش از زمان ارسال برای تأیید تغییر کرده است؛ دوباره ارسال کنید.");

// ── minimum levels ─────────────────────────────────────────────────────────────────────────────────────────────────────
export async function setMinLevel(ctx, input = {}) {
  const refusal = await ctx.require("inventory.level");
  if (refusal) return refusal;
  const c = cleanLevel(input);
  if (!c.ok) return { ok: false, error: c.error };
  let { productId } = c.value;
  if (!productId) {
    const f = await store.findProductBySku(ctx.admin, ctx.panel, c.value.sku);
    if (!f.ok) return { ok: false, error: f.error };
    productId = f.product.id;
  }
  const res = await counts.setLevel(ctx.admin, ctx.panel, { productId, minLevel: c.value.minLevel }, whoOf(ctx));
  if (!res.ok) { await log(ctx, "stock.level", "failure", [productId], { reason: res.code }); return res; }
  await log(ctx, "stock.level", "success", [productId], { min: c.value.minLevel });
  return { ok: true, removed: Boolean(res.removed) };
}

// ── counts ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function startCount(ctx, input = {}) {
  const refusal = await ctx.require("inventory.count_start");
  if (refusal) return refusal;
  const locationId = Number(input.locationId);
  if (!Number.isInteger(locationId) || locationId <= 0) return { ok: false, error: STOCK_MESSAGES.unknown_location };
  const note = String(input.note ?? "").trim();
  if (note.length > 300) return { ok: false, error: tr("توضیح حداکثر ۳۰۰ نویسه باشد.") };
  const res = await counts.startCount(ctx.admin, ctx.panel, { locationId, note }, whoOf(ctx));
  if (!res.ok) { await log(ctx, "stock.count_start", "failure", undefined, { reason: res.code, location: locationId }); return res; }
  await log(ctx, "stock.count_start", "success", [res.id], { location: locationId, lines: res.lines });
  return { ok: true, id: res.id, lines: res.lines };
}

export async function saveCounted(ctx, input = {}) {
  const refusal = await ctx.require("inventory.count_start");
  if (refusal) return refusal;
  const id = countId(input.countId);
  if (!id) return { ok: false, error: COUNT_MESSAGES.bad_count };
  const c = cleanCountedEntries(input.entries);
  if (!c.ok) return { ok: false, error: c.error };
  const res = await counts.saveCounted(ctx.admin, ctx.panel, id, c.entries, whoOf(ctx));
  if (!res.ok) { await log(ctx, "stock.count_save", "failure", undefined, { reason: res.code, count: id }); return res; }
  await log(ctx, "stock.count_save", "success", undefined, { count: id, lines: res.saved });
  return { ok: true, saved: res.saved };
}

// a product that was not in the snapshot (found on the shelf): typed as a SKU, expected 0
export async function addCountLine(ctx, input = {}) {
  const refusal = await ctx.require("inventory.count_start");
  if (refusal) return refusal;
  const id = countId(input.countId);
  const sku = typeof input.sku === "string" ? input.sku.trim() : "";
  if (!id) return { ok: false, error: COUNT_MESSAGES.bad_count };
  if (!sku || sku.length > 80) return { ok: false, error: STOCK_MESSAGES.bad_product };
  const q = cleanCountedEntries([{ productId: 1, counted: input.counted }]);
  if (!q.ok) return { ok: false, error: q.error };
  const f = await store.findProductBySku(ctx.admin, ctx.panel, sku);
  if (!f.ok) return { ok: false, error: f.error };
  const res = await counts.addLine(ctx.admin, ctx.panel, id, f.product, q.entries[0].counted, whoOf(ctx));
  if (!res.ok) return res;
  await log(ctx, "stock.count_save", "success", [f.product.id], { count: id, added: true });
  return { ok: true, productId: f.product.id };
}

export async function cancelCount(ctx, input = {}) {
  const refusal = await ctx.require("inventory.count_start");
  if (refusal) return refusal;
  const id = countId(input.countId);
  if (!id) return { ok: false, error: COUNT_MESSAGES.bad_count };
  const res = await counts.finish(ctx.admin, ctx.panel, id, "cancelled", {}, whoOf(ctx));
  await log(ctx, "stock.count_cancel", res.ok ? "success" : "failure", undefined, { count: id, ...(res.ok ? {} : { reason: res.code }) });
  return res.ok ? { ok: true } : res;
}

// Applies a count: one adjustment per difference, then the count is closed. SAFE TO REPEAT: a difference that is already posted is a
// replay of the same key; if any difference cannot be posted the count stays open and says which. `expected` (optional) is the list
// of differences an approval was filed for — if the count says something else now, nothing is posted.
export async function applyCount(admin, house, id, who, { expected = null, requestId = null } = {}) {
  const got = await counts.getCount(admin, house, id);
  if (!got.ok) return got;
  if (got.count.status !== "open") return { ok: false, code: "count_closed", error: COUNT_MESSAGES.count_closed };
  const diffs = differencesOf(id, got.lines);
  if (expected && JSON.stringify(diffs.map((d) => [d.productId, d.delta])) !== JSON.stringify(expected)) return { ok: false, code: "stale", error: STALE_COUNT };
  if (!summarize(got.lines).counted) return { ok: false, code: "nothing_counted", error: COUNT_MESSAGES.nothing_counted };
  const failed = [];
  for (const d of diffs) {
    const res = await store.post(admin, house, { key: d.key, kind: "adjust", productId: d.productId, locationId: got.count.location_id, toLocationId: null, qty: d.delta, reason: `Stock count #${id}`, reference: `count-${id}`, reservationId: null }, { ...who, requestId });
    if (!res.ok) failed.push({ sku: d.sku, error: res.error, ...(res.params ? { params: res.params } : {}) });
  }
  if (failed.length) return { ok: false, code: "some_failed", error: COUNT_MESSAGES.some_failed, failed };
  const done = await counts.finish(admin, house, id, "closed", { differences: diffs.length }, who);
  return done.ok ? { ok: true, differences: diffs.length } : done;
}

export async function closeCount(ctx, input = {}) {
  const id = countId(input.countId);
  if (!id) return { ok: false, error: COUNT_MESSAGES.bad_count };
  const ev = await ctx.evaluate("inventory.count_close");
  if (ev.mode === "denied") return ev.refusal;
  const who = whoOf(ctx);
  if (ev.mode === "approval") {
    const got = await counts.getCount(ctx.admin, ctx.panel, id);
    if (!got.ok) return got;
    if (got.count.status !== "open") return { ok: false, error: COUNT_MESSAGES.count_closed };
    const diffs = differencesOf(id, got.lines);
    if (!summarize(got.lines).counted) return { ok: false, error: COUNT_MESSAGES.nothing_counted };
    const reason = String(input.reason ?? "").trim().slice(0, 300) || null;
    return ctx.file({
      operation: "inventory.count_close", entity: "stock_count", entityId: id, subject: `#${id}`,
      before: null, proposed: { differences: diffs.length, summary: proposalText(diffs), _count_id: id, _diffs: diffs.map((d) => [d.productId, d.delta]) }, reason,
    });
  }
  const res = await applyCount(ctx.admin, ctx.panel, id, who);
  if (!res.ok) { await log(ctx, "stock.count_close", "failure", undefined, { reason: res.code, count: id }); return { ok: false, error: res.error, ...(res.failed ? { failed: res.failed } : {}) }; }
  await log(ctx, "stock.count_close", "success", undefined, { count: id, differences: res.differences });
  return { ok: true, differences: res.differences };
}

// how an approved count closing is applied (approvals executors, merged with the other warehouse ones)
export function makeCountExecutors({ panel }) {
  return {
    "inventory.count_close": async ({ admin, request }) => {
      const p = request.proposed || {};
      const id = countId(p._count_id);
      if (!id) return { ok: false, error: "notFound" };
      const res = await applyCount(admin, panel, id, { userId: request.requested_by, label: "approved-request" }, { expected: Array.isArray(p._diffs) ? p._diffs : null, requestId: request.id });
      return res.ok ? { ok: true } : { ok: false, error: res.code === "stale" || res.code === "count_closed" ? "stale" : res.code || "failed" };
    },
  };
}

// ── reports (permission: inventory.export) ────────────────────────────────────────────────────────────────────────────────
const stamp = () => new Date().toISOString().slice(0, 10);
const exportGate = (ctx) => ctx.require("inventory.export");
export async function exportStockCsv(ctx, input = {}) {
  const refusal = await exportGate(ctx);
  if (refusal) return refusal;
  const loc = Number(input.locationId) > 0 ? Number(input.locationId) : null;
  const res = await counts.stockRows(ctx.admin, ctx.panel, { locationId: loc });
  if (!res.ok) return res;
  const rows = res.rows.map((r) => ({ ...r, low: isLow(r.quantity, r.minLevel) }));
  await log(ctx, "stock.export", "success", undefined, { kind: "stock", rows: rows.length });
  return { ok: true, csv: stockCsv(rows), filename: `stock-${ctx.panel}-${stamp()}.csv`, truncated: res.truncated };
}
export async function exportMovementsCsv(ctx, input = {}) {
  const refusal = await exportGate(ctx);
  if (refusal) return refusal;
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const from = day.test(input.from || "") ? `${input.from}T00:00:00.000Z` : null, to = day.test(input.to || "") ? `${input.to}T23:59:59.999Z` : null;
  const res = await counts.movementRows(ctx.admin, ctx.panel, { from, to });
  if (!res.ok) return res;
  await log(ctx, "stock.export", "success", undefined, { kind: "movements", rows: res.rows.length });
  return { ok: true, csv: movementsCsv(res.rows), filename: `stock-movements-${ctx.panel}-${stamp()}.csv`, truncated: res.truncated };
}
export async function exportCountCsv(ctx, input = {}) {
  const refusal = await exportGate(ctx);
  if (refusal) return refusal;
  const id = countId(input.countId);
  if (!id) return { ok: false, error: COUNT_MESSAGES.bad_count };
  const got = await counts.getCount(ctx.admin, ctx.panel, id);
  if (!got.ok) return got;
  await log(ctx, "stock.export", "success", undefined, { kind: "count", count: id, rows: got.lines.length });
  return { ok: true, csv: countCsv(got.lines), filename: `stock-count-${id}.csv` };
}
