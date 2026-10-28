// lib/operator/categoryDelete.js — the one place that deletes a category (Health and Beauty), shared by the direct action of each panel AND by
// the executor of an approved request. Plain module: the admin client, the audit writer and the cache purge are passed in.
//
// Two steps so a request can be filed on a PLAN and carried out later:
//   planCategoryDelete  reads the category, its sub-categories and the products attached to it, and checks every rule (read only);
//   runCategoryDelete   writes the ATTEMPT to the activity log (a missing log is a refusal), moves the products to the chosen category,
//                       deletes the category, writes the OUTCOME. Products are never deleted.
// An approved request is carried out by planning AGAIN and refusing ("stale") when the category is no longer what the request saw.
import { requireAttempt, makeOutcome } from "./auditedDelete.js";
import { tr } from "../panel/i18n.js";

const CFG = {
  health: { table: "categories", products: "products", bySlug: true, children: true },
  beauty: { table: "beauty_categories", products: "beauty_products", bySlug: false, children: false },
};

export const CATEGORY_DELETE_MESSAGES = {
  badId: tr("شناسه دسته نامعتبر است."),
  notFound: tr("دسته پیدا نشد."),
  hasChildren: tr("این دسته زیرمجموعه دارد. ابتدا زیرمجموعه‌ها را جابه‌جا یا حذف کنید."),
  sameTarget: tr("مقصد انتقال نمی‌تواند خود دسته باشد."),
  noTarget: tr("دسته مقصد پیدا نشد."),
  moveFailedHealth: tr("انتقال محصولات ناموفق بود؛ دسته حذف نشد."),
  moveFailedBeauty: tr("انتقال محصولات ناموفق بود — دسته حذف نشد."),
  deleteFailed: tr("حذف دسته ناموفق بود."),
  readFailed: tr("خواندن اطلاعات دسته ناموفق بود. دوباره تلاش کنید."),
};

// the message that asks for a destination category (the number is filled in; the panel translates it by pattern)
const needsMoveMessage = (house, count) => (house === "health" ? tr("این دسته {count} محصول دارد. دسته مقصد را انتخاب کنید.", { count }) : tr("این دسته {count} محصول دارد. اول مقصد انتقال را انتخاب کنید.", { count }));

export async function planCategoryDelete({ admin, house, id, moveToId }) {
  const c = CFG[house];
  if (!c) return { ok: false, error: CATEGORY_DELETE_MESSAGES.readFailed };
  if (!id) return { ok: false, error: CATEGORY_DELETE_MESSAGES.badId };
  const cat = await admin.from(c.table).select("id,slug").eq("id", id).maybeSingle();
  if (cat.error) return { ok: false, error: CATEGORY_DELETE_MESSAGES.readFailed };
  if (!cat.data) return { ok: false, error: CATEGORY_DELETE_MESSAGES.notFound };
  if (c.children) {
    const kids = await admin.from(c.table).select("id", { count: "exact", head: true }).eq("parent_id", id);
    if (kids.error) return { ok: false, error: CATEGORY_DELETE_MESSAGES.readFailed };
    if ((kids.count || 0) > 0) return { ok: false, error: CATEGORY_DELETE_MESSAGES.hasChildren };
  }
  const reads = [admin.from(c.products).select("id").eq("category_id", id)];
  if (c.bySlug) reads.push(admin.from(c.products).select("id").eq("category", cat.data.slug));
  const found = await Promise.all(reads);
  if (found.some((r) => r.error)) return { ok: false, error: CATEGORY_DELETE_MESSAGES.readFailed };
  const productIds = [...new Set(found.flatMap((r) => r.data || []).map((r) => r.id))];

  let target = null;
  if (productIds.length) {
    if (!moveToId) return { ok: false, needsMove: true, count: productIds.length, error: needsMoveMessage(house, productIds.length) };
    if (String(moveToId) === String(id)) return { ok: false, error: CATEGORY_DELETE_MESSAGES.sameTarget };
    const t = await admin.from(c.table).select("id,slug").eq("id", moveToId).maybeSingle();
    if (t.error) return { ok: false, error: CATEGORY_DELETE_MESSAGES.readFailed };
    if (!t.data) return { ok: false, error: CATEGORY_DELETE_MESSAGES.noTarget };
    target = t.data;
  }
  return { ok: true, plan: { id, slug: cat.data.slug, productIds, count: productIds.length, target } };
}

// Carries a plan out. `audit` is the entry writer of lib/operator/audit.js (one call per entry); `revalidate` purges the public pages.
export async function runCategoryDelete({ admin, house, plan, audit, revalidate }) {
  const c = CFG[house];
  const refused = await requireAttempt(audit, { action: "category.delete_attempt", entity: c.table, ids: [plan.id], detail: { moved: plan.count } });
  if (refused) return refused;
  const outcome = makeOutcome(audit, { kind: "category", entity: c.table, ids: [plan.id], detail: { moved: plan.count } });
  if (plan.target) {
    const moved = await admin.from(c.products).update({ category_id: plan.target.id, category: plan.target.slug }).in("id", plan.productIds);
    if (moved.error) { await outcome.failed("move_failed"); return { ok: false, error: house === "health" ? CATEGORY_DELETE_MESSAGES.moveFailedHealth : CATEGORY_DELETE_MESSAGES.moveFailedBeauty }; }
  }
  const del = await admin.from(c.table).delete().eq("id", plan.id);
  if (del.error) { await outcome.failed("db_error"); return { ok: false, error: CATEGORY_DELETE_MESSAGES.deleteFailed, dbError: del.error }; }
  await outcome.succeeded();
  try { revalidate?.(); } catch { /* the cache purge is best effort */ }
  return { ok: true, moved: plan.count };
}

// What an approved request does: plan again; the request is stale when the category is gone, or has another number of products, or another
// slug, than the one the reviewer read.
export async function executeApprovedCategoryDelete({ admin, house, request, audit, revalidate }) {
  const moveTo = request.proposed?.moveToId ?? null;
  const planned = await planCategoryDelete({ admin, house, id: request.entity_id, moveToId: moveTo });
  if (!planned.ok) return { ok: false, error: planned.error === CATEGORY_DELETE_MESSAGES.notFound ? "notFound" : planned.needsMove || planned.error === CATEGORY_DELETE_MESSAGES.hasChildren || planned.error === CATEGORY_DELETE_MESSAGES.noTarget || planned.error === CATEGORY_DELETE_MESSAGES.sameTarget ? "stale" : "failed" };
  const seen = request.before || {};
  if ((seen.slug != null && seen.slug !== planned.plan.slug) || (seen.products != null && Number(seen.products) !== planned.plan.count)) return { ok: false, error: "stale" };
  const res = await runCategoryDelete({ admin, house, plan: planned.plan, audit, revalidate });
  return res.ok ? { ok: true } : { ok: false, error: "failed" };
}
