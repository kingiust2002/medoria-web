// lib/operator/destructiveApproval.js — the destructive operations that can go through the approval queue besides product deletion:
// deleting a category, a brand, customer requests. For each: a PLAN read before the request is filed (what exactly would be deleted, and
// the version of it the asker saw), and an EXECUTOR run after a reviewer approves (it looks again and refuses — "stale" — when the thing
// is not what the request saw). Plain module: the client, the audit writer and the cache purge are passed in.
import { planCategoryDelete, runCategoryDelete, executeApprovedCategoryDelete, isMissingFunction, CATEGORY_DELETE_MESSAGES } from "./categoryDelete.js";
import { requireAttempt, makeOutcome } from "./auditedDelete.js";
import { parseQuoteIds } from "./quoteDelete.js";
import { tr } from "../panel/i18n.js";

const QUOTE_TABLE = { health: "quote_requests", beauty: "beauty_quote_requests" };

export const DESTRUCTIVE_MESSAGES = {
  brandNotFound: tr("برند پیدا نشد."),
  brandReadFailed: tr("خواندن برند ناموفق بود. دوباره تلاش کنید."),
  brandBadId: tr("شناسه برند نامعتبر است."),
  quotesReadFailed: tr("خواندن درخواست‌ها ناموفق بود. دوباره تلاش کنید."),
  quotesNone: tr("هیچ‌کدام از این درخواست‌ها دیگر وجود ندارد."),
  brandChanged: tr("برند پس از بررسی تغییر کرده است؛ چیزی حذف نشد. دوباره بررسی کنید."),
  quotesFailed: tr("حذف ناموفق بود. دوباره تلاش کنید."),
};

// ── brands (Beauty only; deleting a brand row never touches products, their text `brand` stays) ──────────────────────────────
// The basis is the hash of the WHOLE brand row (operator_brand_basis): a changed logo, name or any other field is a different brand.
export async function planBrandDelete({ admin, id }) {
  if (!id) return { ok: false, error: DESTRUCTIVE_MESSAGES.brandBadId };
  const b = await admin.rpc("operator_brand_basis", { p_id: id });
  if (b.error) return { ok: false, error: isMissingFunction(b.error) ? CATEGORY_DELETE_MESSAGES.needsMigration : DESTRUCTIVE_MESSAGES.brandReadFailed };
  if (!b.data || b.data.found !== true) return { ok: false, error: DESTRUCTIVE_MESSAGES.brandNotFound };
  return { ok: true, plan: { id: Number(id), slug: b.data.slug, name: b.data.name, basis: { row_hash: b.data.row_hash } } };
}
export async function runBrandDelete({ admin, plan, audit, revalidate, mapError = (e) => e?.message }) {
  const refused = await requireAttempt(audit, { action: "brand.delete_attempt", entity: "beauty_brands", ids: [plan.id] });
  if (refused) return refused;
  const outcome = makeOutcome(audit, { kind: "brand", entity: "beauty_brands", ids: [plan.id] });
  const res = await admin.rpc("operator_delete_brand_checked", { p_id: plan.id, p_basis: plan.basis ?? null });
  if (res.error) {
    const missing = isMissingFunction(res.error);
    await outcome.failed(missing ? "migration_missing" : "db_error");
    return { ok: false, error: missing ? CATEGORY_DELETE_MESSAGES.needsMigration : mapError(res.error), dbError: missing ? undefined : res.error };
  }
  if (!res.data?.ok) {
    const reason = String(res.data?.reason || "failed");
    await outcome.failed(reason);
    if (reason === "not_found") return { ok: false, notFound: true, error: DESTRUCTIVE_MESSAGES.brandNotFound };
    return { ok: false, stale: true, error: DESTRUCTIVE_MESSAGES.brandChanged };
  }
  await outcome.succeeded();
  try { revalidate?.(); } catch { /* best effort */ }
  return { ok: true };
}
// carries out EXACTLY the basis stored in the request; a request without one (filed before migration 53) is stale
export async function executeApprovedBrandDelete({ admin, request, audit, revalidate }) {
  const basis = request.proposed?._basis;
  if (!basis || typeof basis !== "object" || !basis.row_hash) return { ok: false, error: "stale" };
  const res = await runBrandDelete({ admin, plan: { id: Number(request.entity_id), basis: { row_hash: basis.row_hash } }, audit, revalidate });
  return res.ok ? { ok: true } : { ok: false, error: res.notFound ? "notFound" : res.stale ? "stale" : "failed" };
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
// All or nothing, decided INSIDE the database: operator_delete_quotes_checked locks every row, compares each updated_at (as a
// timestamptz, microseconds included) with the version in the request, and deletes none of them unless all are still exactly as
// reviewed. The history rule is kept: the attempt is written first (a missing log is a refusal), the outcome after.
export async function executeApprovedQuoteDelete({ admin, house, request, session, audit }) {
  if (!session) return { ok: false, error: "failed" };
  const parsed = parseQuoteIds(Array.isArray(request.proposed?._ids) ? request.proposed._ids : []);
  if (parsed.error) return { ok: false, error: "failed" };
  const versions = request.proposed?._versions;
  if (!versions || typeof versions !== "object") return { ok: false, error: "stale" };
  const table = QUOTE_TABLE[house];
  if (!table) return { ok: false, error: "failed" };
  const refused = await requireAttempt(audit, { action: "quote.delete_attempt", entity: table, ids: parsed.ids });
  if (refused) return { ok: false, error: "failed" };
  const outcome = makeOutcome(audit, { kind: "quote", entity: table, ids: parsed.ids });
  const res = await admin.rpc("operator_delete_quotes_checked", { p_house: house, p_ids: parsed.ids, p_versions: versions });
  if (res.error) { await outcome.failed(isMissingFunction(res.error) ? "migration_missing" : "db_error"); return { ok: false, error: "failed" }; }
  if (!res.data?.ok) { await outcome.failed(String(res.data?.reason || "failed")); return { ok: false, error: res.data?.reason === "stale" ? "stale" : "failed" }; }
  await makeOutcome(audit, { kind: "quote", entity: table, ids: res.data.deleted || parsed.ids }).succeeded();
  return { ok: true };
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
      return { before: { slug: planned.plan.slug, products: planned.plan.count }, baseUpdatedAt: null, proposedPatch: { _basis: planned.plan.basis } };
    }
    if (request.operation === "brands.delete") {
      const planned = await planBrandDelete({ admin, id: request.entity_id });
      return planned.ok ? { before: { slug: planned.plan.slug, name: planned.plan.name }, baseUpdatedAt: null, proposedPatch: { _basis: planned.plan.basis } } : { error: "notFound" };
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
