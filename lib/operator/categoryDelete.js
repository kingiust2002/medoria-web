// lib/operator/categoryDelete.js — the one place that deletes a category (Health and Beauty), shared by the direct action of each panel AND by
// the executor of an approved request. Plain module: the admin client, the audit writer and the cache purge are passed in.
//
// Two steps so a request can be filed on a PLAN and carried out later:
//   planCategoryDelete  reads the category, its sub-categories and its members and checks every rule (read only). The members are counted
//                       and fingerprinted INSIDE the database (operator_category_basis): no API row cap can hide a product;
//   runCategoryDelete   writes the ATTEMPT to the activity log (a missing log is a refusal), then asks the database to move the members
//                       and delete the category in ONE transaction that first re-checks the basis the plan (or the reviewer) saw
//                       (operator_delete_category_checked, migration 53). Products are never deleted. A changed category, a different
//                       set of products with the same count, a product attached meanwhile: nothing happens, the outcome says "stale".
// An approved request is carried out with the basis stored in the request itself — never with a fresh read — so what is deleted is exactly
// what the reviewer saw. Without migration 53 the deletion is refused (fail closed).
import { requireAttempt, makeOutcome } from "./auditedDelete.js";
import { tr } from "../panel/i18n.js";

const CFG = {
  health: { table: "categories" },
  beauty: { table: "beauty_categories" },
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
  changed: tr("دسته یا محصولات آن پس از بررسی تغییر کرده‌اند؛ چیزی حذف نشد. دوباره بررسی کنید."),
  needsMigration: tr("این حذف به مایگریشن ۵۳ نیاز دارد که هنوز اجرا نشده است؛ برای امنیت، چیزی حذف نشد."),
};

// the message that asks for a destination category (the number is filled in; the panel translates it by pattern)
const needsMoveMessage = (house, count) => (house === "health" ? tr("این دسته {count} محصول دارد. دسته مقصد را انتخاب کنید.", { count }) : tr("این دسته {count} محصول دارد. اول مقصد انتقال را انتخاب کنید.", { count }));

// the database function is missing (migration 53 not applied): PostgREST says PGRST202, PostgreSQL 42883
export const isMissingFunction = (error) => Boolean(error) && (error.code === "PGRST202" || error.code === "42883" || /could not find the function|does not exist/i.test(String(error.message || "")));

export async function planCategoryDelete({ admin, house, id, moveToId }) {
  const c = CFG[house];
  if (!c) return { ok: false, error: CATEGORY_DELETE_MESSAGES.readFailed };
  if (!id) return { ok: false, error: CATEGORY_DELETE_MESSAGES.badId };
  const b = await admin.rpc("operator_category_basis", { p_house: house, p_id: id });
  if (b.error) return { ok: false, error: isMissingFunction(b.error) ? CATEGORY_DELETE_MESSAGES.needsMigration : CATEGORY_DELETE_MESSAGES.readFailed };
  const basis = b.data;
  if (!basis || basis.found !== true) return { ok: false, error: CATEGORY_DELETE_MESSAGES.notFound };
  if (Number(basis.children) > 0) return { ok: false, error: CATEGORY_DELETE_MESSAGES.hasChildren };
  const count = Number(basis.members) || 0;

  let target = null;
  if (count) {
    if (!moveToId) return { ok: false, needsMove: true, count, error: needsMoveMessage(house, count) };
    if (String(moveToId) === String(id)) return { ok: false, error: CATEGORY_DELETE_MESSAGES.sameTarget };
    const t = await admin.from(c.table).select("id,slug").eq("id", moveToId).maybeSingle();
    if (t.error) return { ok: false, error: CATEGORY_DELETE_MESSAGES.readFailed };
    if (!t.data) return { ok: false, error: CATEGORY_DELETE_MESSAGES.noTarget };
    target = t.data;
  }
  return { ok: true, plan: { id, slug: basis.slug, count, target, basis: { slug: basis.slug, row_hash: basis.row_hash, members_hash: basis.members_hash, members: count } } };
}

// How a database refusal reads for the caller. "stale" means the data is no longer what was reviewed.
const REASONS = {
  stale: { kind: "stale", message: CATEGORY_DELETE_MESSAGES.changed },
  no_basis: { kind: "stale", message: CATEGORY_DELETE_MESSAGES.changed },
  needs_move: { kind: "stale", message: CATEGORY_DELETE_MESSAGES.changed },
  has_children: { kind: "stale", message: CATEGORY_DELETE_MESSAGES.hasChildren },
  no_target: { kind: "stale", message: CATEGORY_DELETE_MESSAGES.noTarget },
  same_target: { kind: "stale", message: CATEGORY_DELETE_MESSAGES.sameTarget },
  not_found: { kind: "notFound", message: CATEGORY_DELETE_MESSAGES.notFound },
};

// Carries a plan out. `audit` is the entry writer of lib/operator/audit.js (one call per entry); `revalidate` purges the public pages.
export async function runCategoryDelete({ admin, house, plan, audit, revalidate }) {
  const c = CFG[house];
  const refused = await requireAttempt(audit, { action: "category.delete_attempt", entity: c.table, ids: [plan.id], detail: { moved: plan.count } });
  if (refused) return refused;
  const outcome = makeOutcome(audit, { kind: "category", entity: c.table, ids: [plan.id], detail: { moved: plan.count } });
  const res = await admin.rpc("operator_delete_category_checked", { p_house: house, p_id: plan.id, p_move_to: plan.target ? plan.target.id : null, p_basis: plan.basis ?? null });
  if (res.error) {
    const missing = isMissingFunction(res.error);
    await outcome.failed(missing ? "migration_missing" : "db_error");
    return { ok: false, error: missing ? CATEGORY_DELETE_MESSAGES.needsMigration : house === "health" ? CATEGORY_DELETE_MESSAGES.moveFailedHealth : CATEGORY_DELETE_MESSAGES.moveFailedBeauty, dbError: missing ? undefined : res.error };
  }
  if (!res.data?.ok) {
    const why = REASONS[res.data?.reason] || { kind: "failed", message: CATEGORY_DELETE_MESSAGES.deleteFailed };
    await outcome.failed(String(res.data?.reason || "failed"));
    return { ok: false, [why.kind]: true, error: why.message };
  }
  await outcome.succeeded({ moved: Number(res.data.moved) || 0 });
  try { revalidate?.(); } catch { /* the cache purge is best effort */ }
  return { ok: true, moved: Number(res.data.moved) || 0 };
}

// What an approved request does: it carries out EXACTLY the basis stored in the request. A request filed before migration 53 has none,
// and is refused as stale (ask again). The database re-checks the category, the destination and every member under lock.
export async function executeApprovedCategoryDelete({ admin, house, request, audit, revalidate }) {
  const basis = request.proposed?._basis;
  if (!basis || typeof basis !== "object") return { ok: false, error: "stale" };
  const moveTo = request.proposed?.moveToId ?? null;
  const plan = { id: request.entity_id, slug: basis.slug, count: Number(basis.members) || 0, target: moveTo ? { id: moveTo } : null, basis };
  const res = await runCategoryDelete({ admin, house, plan, audit, revalidate });
  if (res.ok) return { ok: true };
  return { ok: false, error: res.notFound ? "notFound" : res.stale ? "stale" : "failed" };
}
