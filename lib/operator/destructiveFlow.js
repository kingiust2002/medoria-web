// lib/operator/destructiveFlow.js — what an ACTION does for the destructive operations that can go through the approval queue: plan, then either
// file a request (the person's policy says "needs approval") or carry the deletion out at once. Shared by the Health and the Beauty actions
// (and by every screen that can delete the same thing), so the rule is written once. Plain module.
//   a  = the ctx of lib/operator/actions.js `authed(op, { approvable: true })`: { ok, admin, session, auditEntry, needsApproval, file }
import { planCategoryDelete, runCategoryDelete } from "./categoryDelete.js";
import { planBrandDelete, runBrandDelete, snapshotQuotes, quoteDeleteSpec } from "./destructiveApproval.js";
import { deleteQuoteGuarded, deleteQuotesGuarded, parseQuoteId, parseQuoteIds } from "./quoteDelete.js";

const TABLES = { health: { categories: "categories", quotes: "quote_requests" }, beauty: { categories: "beauty_categories", quotes: "beauty_quote_requests" } };

export async function categoryDeleteFlow({ a, house, id, moveToId, revalidate, mapDbError }) {
  const planned = await planCategoryDelete({ admin: a.admin, house, id, moveToId });
  if (!planned.ok) return planned;                                  // { ok:false, error, needsMove?, count? } — same answers as before
  if (a.needsApproval) {
    return a.file({
      operation: "categories.delete", ops: ["categories.delete"], entity: TABLES[house].categories, entityId: Number.isSafeInteger(Number(id)) ? Number(id) : null,
      subject: planned.plan.slug, before: { slug: planned.plan.slug, products: planned.plan.count }, proposed: { moveToId: planned.plan.target ? planned.plan.target.id : null },
      baseUpdatedAt: null,
    });
  }
  const res = await runCategoryDelete({ admin: a.admin, house, plan: planned.plan, audit: a.auditEntry, revalidate });
  if (!res.ok && res.dbError && mapDbError) return { ok: false, error: mapDbError(res.dbError) };
  return res;
}

export async function brandDeleteFlow({ a, id, revalidate, mapDbError }) {
  const planned = await planBrandDelete({ admin: a.admin, id });
  if (!planned.ok) return planned;
  if (a.needsApproval) {
    return a.file({
      operation: "brands.delete", ops: ["brands.delete"], entity: "beauty_brands", entityId: Number.isSafeInteger(Number(id)) ? Number(id) : null,
      subject: planned.plan.name || planned.plan.slug, before: { slug: planned.plan.slug, name: planned.plan.name }, proposed: {}, baseUpdatedAt: null,
    });
  }
  return runBrandDelete({ admin: a.admin, plan: planned.plan, audit: a.auditEntry, revalidate, mapError: mapDbError });
}

// one or several customer requests (the screens call it for a single request too)
export async function quotesDeleteFlow({ a, house, ids, single = false, getSession, getAdminClient, audit }) {
  const table = TABLES[house].quotes;
  if (a.needsApproval) {
    const snap = await snapshotQuotes({ admin: a.admin, house, ids: single ? [ids] : ids });
    if (!snap.ok) return snap.notFound ? { ok: false, notFound: true, error: snap.error } : { ok: false, error: snap.error };
    return a.file(quoteDeleteSpec({ rows: snap.rows }));
  }
  if (single) return deleteQuoteGuarded({ getSession, getAdminClient, table, id: ids, audit });
  return deleteQuotesGuarded({ getSession, getAdminClient, table, ids, audit });
}
export { parseQuoteId, parseQuoteIds };
