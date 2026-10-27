"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { getSession } from "@/lib/operator/auth";
import { requireAll } from "@/lib/operator/access";
import { auditEvent } from "@/lib/operator/audit";
import { requireAttempt, makeOutcome } from "@/lib/operator/auditedDelete";
import { LOCALES } from "@/lib/i18n";
import { bool, num, slugify, str } from "@/lib/operator/validation";
import { tr } from "../panel/i18n.js";

async function authed(operation) {
  const session = await getSession();
  if (!session) return { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است.") };
  const audit = (action, meta = {}) => auditEvent({ admin, panel: "health", session, action, ...meta });
  const ctx = { ok: true, admin, session, audit, auditEntry: (entry) => auditEvent({ admin, panel: "health", session, ...entry }) };
  // the person must be allowed this operation NOW (account, house, role, permissions; default closed). `ctx.require(ops)` asks for more.
  ctx.require = (ops) => requireAll({ session, panel: "health", operations: [].concat(ops), audit: (...args) => ctx.audit(...args) });
  if (operation) {
    const refusal = await ctx.require(operation);
    if (refusal) return refusal;
  }
  return ctx;
}

function friendly(error) {
  const message = String(error?.message || error || "");
  if (error?.code === "42703" || error?.code === "PGRST204" || /parent_id|level/i.test(message)) {
    return tr("ساختار درختی دسته‌ها هنوز در پایگاه داده ایجاد نشده است. مایگریشن‌های ۲۰ تا ۲۲ را به‌ترتیب اجرا کنید.");
  }
  if (error?.code === "23505" || /duplicate key/i.test(message)) return tr("این اسلاگ قبلاً استفاده شده است.");
  if (error?.code === "23503") return tr("این دسته هنوز زیرمجموعه دارد و قابل حذف نیست.");
  return tr("عملیات ذخیره‌سازی ناموفق بود.");
}

function revalidatePublic() {
  try {
    for (const lang of LOCALES) {
      revalidatePath(`/health/${lang}`);
      revalidatePath(`/health/${lang}/categories`);
      revalidatePath(`/health/${lang}/categories/[slug]`, "page");
      revalidatePath(`/health/${lang}/catalog`);
    }
  } catch {}
}

function baseRow(input) {
  return {
    name_fa: str(input.name_fa, 200),
    name_en: str(input.name_en, 200),
    name_ru: str(input.name_ru, 200),
    name_tg: str(input.name_tg, 200),
    icon: str(input.icon, 60),
    sort_order: num(input.sort_order, { min: 0 }) ?? 0,
    is_active: input.is_active === undefined ? true : bool(input.is_active),
    is_featured: bool(input.is_featured),
  };
}

async function resolveParent(admin, parentId) {
  if (parentId == null || parentId === "") return { parent_id: null, level: 1 };
  const { data: parent, error } = await admin.from("categories").select("id,level").eq("id", parentId).single();
  if (error || !parent) return { error: tr("دسته والد پیدا نشد.") };
  const parentLevel = Number(parent.level || 1);
  if (parentLevel >= 3) return { error: tr("بیشتر از سه سطح دسته‌بندی مجاز نیست.") };
  return { parent_id: parent.id, level: parentLevel + 1 };
}

export async function createHealthCategory(input = {}) {
  const a = await authed("categories.create");
  if (!a.ok) return a;
  const slug = slugify(input.slug);
  const row = baseRow(input);
  if (!slug) return { ok: false, error: tr("اسلاگ لاتین دسته لازم است.") };
  if (!row.name_fa && !row.name_en) return { ok: false, error: tr("حداقل نام فارسی یا انگلیسی لازم است.") };
  const relation = await resolveParent(a.admin, input.parent_id);
  if (relation.error) return { ok: false, error: relation.error };

  const { data, error } = await a.admin.from("categories").insert({ ...row, slug, ...relation }).select().single();
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("category.create", { entity: "categories", ids: [data?.id] });
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function updateHealthCategory(id, input = {}) {
  const a = await authed("categories.edit");
  if (!a.ok) return a;
  if (!id) return { ok: false, error: tr("شناسه دسته نامعتبر است.") };
  const row = baseRow(input);
  if (!row.name_fa && !row.name_en) return { ok: false, error: tr("حداقل نام فارسی یا انگلیسی لازم است.") };
  const { error } = await a.admin.from("categories").update(row).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("category.update", { entity: "categories", ids: [id] });
  return { ok: true };
}

export async function setHealthCategoryFlags(id, patch = {}) {
  const flagOps = [...(patch.is_active !== undefined ? ["categories.archive"] : []), ...(patch.is_featured !== undefined ? ["categories.edit"] : [])];
  const a = await authed(flagOps.length ? flagOps : "categories.edit");
  if (!a.ok) return a;
  if (!id) return { ok: false, error: tr("شناسه دسته نامعتبر است.") };
  const allowed = {};
  if (patch.is_active !== undefined) allowed.is_active = bool(patch.is_active);
  if (patch.is_featured !== undefined) allowed.is_featured = bool(patch.is_featured);
  if (!Object.keys(allowed).length) return { ok: false, error: tr("تغییری انتخاب نشده است.") };
  const { error } = await a.admin.from("categories").update(allowed).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("category.flags", { entity: "categories", ids: [id], detail: { fields: Object.keys(allowed) } });
  return { ok: true };
}

export async function setHealthCategorySubtreeActive(id, active) {
  const a = await authed("categories.archive");
  if (!a.ok) return a;
  if (!id) return { ok: false, error: tr("شناسه دسته نامعتبر است.") };
  const { data: rows, error: readError } = await a.admin.from("categories").select("id,parent_id");
  if (readError) return { ok: false, error: friendly(readError) };

  const children = new Map();
  for (const row of rows || []) {
    const key = row.parent_id == null ? null : String(row.parent_id);
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(row.id);
  }

  const ids = [];
  const stack = [id];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    const key = String(current);
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(current);
    for (const childId of children.get(key) || []) stack.push(childId);
  }

  const { error } = await a.admin.from("categories").update({ is_active: bool(active) }).in("id", ids);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("category.flags", { entity: "categories", ids, detail: { is_active: bool(active) } });
  return { ok: true, count: ids.length };
}

export async function deleteHealthCategorySafe(id, moveToId) {
  const a = await authed("categories.delete");
  if (!a.ok) return a;
  if (!id) return { ok: false, error: tr("شناسه دسته نامعتبر است.") };

  const { data: category, error: categoryError } = await a.admin.from("categories").select("id,slug").eq("id", id).single();
  if (categoryError || !category) return { ok: false, error: tr("دسته پیدا نشد.") };

  const { count: childCount, error: childError } = await a.admin
    .from("categories").select("id", { count: "exact", head: true }).eq("parent_id", id);
  if (childError) return { ok: false, error: friendly(childError) };
  if ((childCount || 0) > 0) return { ok: false, error: tr("این دسته زیرمجموعه دارد. ابتدا زیرمجموعه‌ها را جابه‌جا یا حذف کنید.") };

  const [byId, bySlug] = await Promise.all([
    a.admin.from("products").select("id").eq("category_id", id),
    a.admin.from("products").select("id").eq("category", category.slug),
  ]);
  const productIds = [...new Set([...(byId.data || []), ...(bySlug.data || [])].map((row) => row.id))];

  let target = null;
  if (productIds.length) {
    if (!moveToId) return { ok: false, needsMove: true, count: productIds.length, error: tr("این دسته {count} محصول دارد. دسته مقصد را انتخاب کنید.", { count: productIds.length }) };
    if (String(moveToId) === String(id)) return { ok: false, error: tr("مقصد انتقال نمی‌تواند خود دسته باشد.") };
    const { data, error: targetError } = await a.admin.from("categories").select("id,slug").eq("id", moveToId).single();
    if (targetError || !data) return { ok: false, error: tr("دسته مقصد پیدا نشد.") };
    target = data;
  }

  // the attempt is on record BEFORE anything is moved or deleted (a missing log table is a refusal)
  const refused = await requireAttempt(a.auditEntry, { action: "category.delete_attempt", entity: "categories", ids: [id], detail: { moved: productIds.length } });
  if (refused) return refused;
  const outcome = makeOutcome(a.auditEntry, { kind: "category", entity: "categories", ids: [id], detail: { moved: productIds.length } });

  if (target) {
    const { error: moveError } = await a.admin.from("products")
      .update({ category_id: target.id, category: target.slug }).in("id", productIds);
    if (moveError) { await outcome.failed("move_failed"); return { ok: false, error: tr("انتقال محصولات ناموفق بود؛ دسته حذف نشد.") }; }
  }
  const { error: deleteError } = await a.admin.from("categories").delete().eq("id", id);
  if (deleteError) { await outcome.failed("db_error"); return { ok: false, error: friendly(deleteError) }; }
  await outcome.succeeded();
  revalidatePublic();
  return { ok: true, moved: productIds.length };
}
