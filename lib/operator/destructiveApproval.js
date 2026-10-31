// lib/operator/destructiveApproval.js — the destructive operations that can go through the approval queue besides product deletion:
// deleting a category, a brand, customer requests. For each: a PLAN read before the request is filed (what exactly would be deleted, and
// the version of it the asker saw), and an EXECUTOR run after a reviewer approves (it looks again and refuses — "stale" — when the thing
// is not what the request saw). Plain module: the client, the audit writer and the cache purge are passed in.
import { planCategoryDelete, runCategoryDelete, executeApprovedCategoryDelete } from "./categoryDelete.js";
import { requireAttempt, makeOutcome } from "./auditedDelete.js";
import { deleteQuotesGuarded, parseQuoteIds } from "./quoteDelete.js";
import { tr } from "../panel/i18n.js";

const QUOTE_TABLE = { health: "quote_requests", beauty: "beauty_quote_requests" };

export const DESTRUCTIVE_MESSAGES = {
  brandNotFound: tr("برند پیدا نشد."),
  brandReadFailed: tr("خواندن برند ناموفق بود. دوباره تلاش کنید."),
  brandBadId: tr("شناسه برند نامعتبر است."),
  quotesReadFailed: tr("خواندن درخواست‌ها ناموفق بود. دوباره تلاش کنید."),
  quotesNone: tr("هیچ‌کدام از این درخواست‌ها دیگر وجود ندارد."),
};

// ── brands (Beauty only; deleting a brand row never touches products, their text `brand` stays) ──────────────────────────────
export async function planBrandDelete({ admin, id }) {
  if (!id) return { ok: false, error: DESTRUCTIVE_MESSAGES.brandBadId };
  const b = await admin.from("beauty_brands").select("id,slug,name").eq("id", id).maybeSingle();
  if (b.error) return { ok: false, error: DESTRUCTIVE_MESSAGES.brandReadFailed };
  if (!b.data) return { ok: false, error: DESTRUCTIVE_MESSAGES.brandNotFound };
  return { ok: true, plan: { id: b.data.id, slug: b.data.slug, name: b.data.name } };
}
export async function runBrandDelete({ admin, plan, audit, revalidate, mapError = (e) => e?.message }) {
  const refused = await requireAttempt(audit, { action: "brand.delete_attempt", entity: "beauty_brands", ids: [plan.id] });
  if (refused) return refused;
  const outcome = makeOutcome(audit, { kind: "brand", entity: "beauty_brands", ids: [plan.id] });
  const del = await admin.from("beauty_brands").delete().eq("id", plan.id);
  if (del.error) { await outcome.failed("db_error"); return { ok: false, error: mapError(del.error), dbError: del.error }; }
  await outcome.succeeded();
  try { revalidate?.(); } catch { /* best effort */ }
  return { ok: true };
}
export async function executeApprovedBrandDelete({ admin, request, audit, revalidate }) {
  const planned = await planBrandDelete({ admin, id: request.entity_id });
  if (!planned.ok) return { ok: false, error: planned.error === DESTRUCTIVE_MESSAGES.brandNotFound ? "notFound" : "failed" };
  const seen = request.before || {};
  if ((seen.slug != null && seen.slug !== planned.plan.slug) || (seen.name != null && seen.name !== planned.plan.name)) return { ok: false, error: "stale" };
  const res = await runBrandDelete({ admin, plan: planned.plan, audit, revalidate });
  return res.ok ? { ok: true } : { ok: false, error: "failed" };
}

// ── customer requests ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The snapshot a request is filed on: for every id, the version of the row (updated_at) and its internal tracking code. No names, phones or
// messages: the approval screen and the queue table carry only the codes.
export async function snapshotQuotes({ admin, house, ids }) {
  const parsed = parseQuoteIds(ids);
  if (parsed.error) return { ok: false, error: parsed.error };
  const { data, error } = await admin.from(QUOTE_TABLE[house]).select("id,updated_at,tracking_code").in("id", parsed.ids);
  if (error) return { ok: false, error: DESTRUCTIVE_MESSAGES.quotesReadFailed };
  if (!data?.length) return { ok: false, notFound: true, error: DESTRUCTIVE_MESSAGES.quotesNone };
  const rows = [...data].sort((a, b) => a.id - b.id);
  return { ok: true, rows, missing: parsed.ids.length - rows.length };
}
export function quoteDeleteSpec({ rows }) {
  const codes = rows.map((r) => r.tracking_code || `#${r.id}`);
  return {
    operation: "quotes.delete", ops: ["quotes.delete"], entity: "quote_requests", entityId: rows.length === 1 ? rows[0].id : null,
    subject: codes.slice(0, 3).join(", ") + (codes.length > 3 ? ` +${codes.length - 3}` : ""),
    before: { count: rows.length, codes: codes.slice(0, 10) },
    proposed: { _ids: rows.map((r) => r.id), _versions: Object.fromEntries(rows.map((r) => [r.id, r.updated_at ?? null])) },       // _-prefixed: the executor's arguments, not shown as a field
    baseUpdatedAt: null,
  };
}
// all or nothing: if even one request was changed, answered or removed since the request was filed, NOTHING is deleted
export async function executeApprovedQuoteDelete({ admin, house, request, session, audit }) {
  const ids = Array.isArray(request.proposed?._ids) ? request.proposed._ids : [];
  const versions = request.proposed?._versions || {};
  const now = await snapshotQuotes({ admin, house, ids });
  if (!now.ok) return { ok: false, error: now.notFound ? "notFound" : "failed" };
  if (now.rows.length !== ids.length) return { ok: false, error: "stale" };
  if (now.rows.some((r) => (versions[r.id] ?? null) !== (r.updated_at ?? null))) return { ok: false, error: "stale" };
  const res = await deleteQuotesGuarded({ getSession: async () => session, getAdminClient: () => admin, table: QUOTE_TABLE[house], ids, audit });
  return res.ok ? { ok: true } : { ok: false, error: res.notFound ? "notFound" : "failed" };
}

// ── the executors of one house ───────────────────────────────────────────────────────────────────────────────────────────────
// `audit` is the entry writer (lib/operator/audit.js) of the REVIEWER's session: the history names who carried the deletion out.
export function makeDestructiveExecutors({ panel, session, audit, revalidate }) {
  const out = {
    "categories.delete": ({ admin, request }) => executeApprovedCategoryDelete({ admin, house: panel, request, audit, revalidate }),
    "quotes.delete": ({ admin, request }) => executeApprovedQuoteDelete({ admin, house: panel, request, session, audit }),
  };
  if (panel === "beauty") out["brands.delete"] = ({ admin, request }) => executeApprovedBrandDelete({ admin, request, audit, revalidate });
  return out;
}

// "ask again" after a rejection or a stale failure: the same proposal against what the data looks like NOW
export function makeDestructivePrepare({ panel, admin }) {
  return async function prepare(request) {
    if (request.operation === "categories.delete") {
      const planned = await planCategoryDelete({ admin, house: panel, id: request.entity_id, moveToId: request.proposed?.moveToId ?? null });
      if (!planned.ok) return { error: planned.needsMove ? "stale" : planned.error === undefined ? "failed" : "notFound" };
      return { before: { slug: planned.plan.slug, products: planned.plan.count }, baseUpdatedAt: null };
    }
    if (request.operation === "brands.delete") {
      const planned = await planBrandDelete({ admin, id: request.entity_id });
      return planned.ok ? { before: { slug: planned.plan.slug, name: planned.plan.name }, baseUpdatedAt: null } : { error: "notFound" };
    }
    if (request.operation === "quotes.delete") {
      const now = await snapshotQuotes({ admin, house: panel, ids: request.proposed?._ids });
      if (!now.ok) return { error: now.notFound ? "notFound" : "failed" };
      // the new basis travels in `before`; the versions the executor compares are refreshed in the request itself by the caller
      return { before: { count: now.rows.length, codes: now.rows.map((r) => r.tracking_code || `#${r.id}`).slice(0, 10) }, baseUpdatedAt: null, proposedPatch: { _versions: Object.fromEntries(now.rows.map((r) => [r.id, r.updated_at ?? null])), _ids: now.rows.map((r) => r.id) } };
    }
    return { error: "unsupported" };
  };
}
export { planCategoryDelete, runCategoryDelete };
