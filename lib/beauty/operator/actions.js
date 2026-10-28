"use server";
// lib/beauty/operator/actions.js — BEAUTY operator panel mutations.
// Same discipline as lib/operator/actions.js: every action (1) verifies the
// BEAUTY session, (2) uses the service-role client (server-only), (3)
// validates/sanitises input, (4) returns a friendly result. Only beauty_*
// tables and the beauty-product-images bucket are ever touched — the Health
// catalog is out of reach by construction.
import { cleanTranslationMeta, sameTranslationMeta } from "@/lib/operator/translationMeta";
import { checkSchedule, scheduleChanges } from "@/lib/operator/schedule";
import { deleteMedia, isAllowedFile, usageMap, MEDIA_MESSAGES } from "@/lib/operator/mediaLibrary";
import { revalidateBeautyPublic as revalidatePublic } from "@/lib/beauty/revalidate";
import { readBrandRoster } from "@/lib/operator/listReaders";
import { recordVersion } from "@/lib/operator/productVersions";
import { buildProductRow } from "@/lib/operator/productRow";
import { saveVariantCore } from "@/lib/operator/variantActions";
import { VARIANT_MESSAGES } from "@/lib/operator/variants";
import { restoreVersion, conflictInfo, whoOf } from "@/lib/operator/productRestoreCore";
import * as followUp from "@/lib/operator/quoteFollowUpCore";
import { userResolver } from "@/lib/operator/quoteFollowUpCore";
import { revalidatePath, revalidateTag } from "next/cache";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { getSession } from "@/lib/beauty/operator/auth";
import { requireAll, evaluateAll } from "@/lib/operator/access";
import { fileForApproval } from "@/lib/operator/approvalFlow";
import { diffRow, productOps } from "@/lib/operator/approvalExecutors";
import { gate } from "@/lib/operator/gate";
import { auditEvent, makeAudit } from "@/lib/operator/audit";
import { requireAttempt, makeOutcome } from "@/lib/operator/auditedDelete";
import { setQuotesStatusGuarded } from "@/lib/operator/quoteDelete";
import { categoryDeleteFlow, brandDeleteFlow, quotesDeleteFlow } from "@/lib/operator/destructiveFlow";
import { assignQuoteGuarded } from "@/lib/operator/quoteOps";
import { deleteProductGuarded, parseProductId, parseProductIds, confirmationMatches, PRODUCT_DELETE_MESSAGES } from "@/lib/operator/productDelete";
import { LOCALES } from "@/lib/i18n";
import { translateProductFieldsWithCloudflare } from "@/lib/translation/cloudflare";
import {
  slugify, str, num, bool, strArray, parseSpecs,
  MAX_IMAGE_BYTES, ALLOWED_IMAGE_TYPES, safeFileName, safeUrlRef, sniffImageType,
} from "@/lib/operator/validation";

import { QUOTE_STATUSES } from "@/lib/operator/constants";
import { getT } from "@/lib/panel/server";
import { tr } from "../../panel/i18n.js";   // one list for both panels (archived needs migration 29)
const WORLD_SLUGS = ["skincare", "makeup", "tools"];

// ── helpers ───────────────────────────────────────────────────────────────────
async function authed(operation, { approvable = false } = {}) {
  const session = await getSession();
  if (!session) return { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  // `audit` writes one line to the activity log (what was done, never who or customer data);
  // `auditEntry` is for deletions (lib/operator/auditedDelete.js): the attempt must be written BEFORE, a missing log table refuses.
  const audit = (action, meta = {}) => auditEvent({ admin, panel: "beauty", session, action, ...meta });
  const ctx = { ok: true, admin, session, audit, auditEntry: (entry) => auditEvent({ admin, panel: "beauty", session, ...entry }) };
  // the person must be allowed this operation NOW (account, house, role, permissions; default closed). `ctx.require(ops)` asks for more.
  ctx.require = (ops) => requireAll({ session, panel: "beauty", operations: [].concat(ops), audit: (...args) => ctx.audit(...args) });
  // for the actions that can FILE A CHANGE REQUEST: "direct" | "approval" | "denied" (denied is logged and carries the refusal)
  ctx.evaluate = (ops) => evaluateAll({ session, panel: "beauty", operations: [].concat(ops), audit: (...args) => ctx.audit(...args) });
  ctx.file = (spec) => fileForApproval({ admin, session, audit: (...args) => ctx.audit(...args), panel: "beauty" }, spec);
  if (operation) {
    if (approvable) {
      const ev = await ctx.evaluate(operation);
      if (ev.mode === "denied") return ev.refusal;
      ctx.needsApproval = ev.mode === "approval";
    } else {
      const refusal = await ctx.require(operation);        // "needs approval" is a refusal for actions that cannot file a request
      if (refusal) return refusal;
    }
  }
  return ctx;
}

function friendly(error) {
  if (!error) return tr("خطای ناشناخته.");
  const msg = String(error.message || error);
  if (error.code === "42P01" || /relation .* does not exist/i.test(msg))
    return tr("جدول‌های Beauty هنوز ساخته نشده‌اند. مایگریشن ۱۰ را در Supabase اجرا کنید.");
  if (error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(msg))
    return tr("ستون موردنیاز در پایگاه داده موجود نیست. مایگریشن ۱۰ را در Supabase اجرا کنید.");
  if (error.code === "23505" || /duplicate key/i.test(msg)) return tr("مقدار تکراری است (slug یا SKU قبلاً ثبت شده).");
  if (error.code === "23514") return tr("این وضعیت در پایگاه داده هنوز مجاز نیست. برای «آرشیو» مایگریشن ۲۹ را در Supabase اجرا کنید.");
  return tr("ذخیره ناموفق بود. دوباره تلاش کنید.");
}

async function ensureUniqueSlug(admin, base, excludeId) {
  const baseSlug = base || `product-${Date.now()}`;
  let candidate = baseSlug;
  for (let i = 2; i < 60; i++) {
    const { data } = await admin.from("beauty_products").select("id").eq("slug", candidate).limit(1);
    const taken = (data || []).some((r) => r.id !== excludeId);
    if (!taken) return candidate;
    candidate = `${baseSlug}-${i}`;
  }
  return `${baseSlug}-${Date.now()}`;
}


// ── Products ────────────────────────────────────────────────────────────────
export async function createProduct(input) {
  const a = await authed("products.create", { approvable: true });
  if (!a.ok) return a;
  const row = buildProductRow(input);
  // an automatic publish / archive date is checked and normalised; it is written only when there is one
  const sch = checkSchedule(input, null);
  if (!sch.ok) return { ok: false, error: sch.error };
  Object.assign(row, scheduleChanges(sch.values, null));
  if ("translation_meta" in (input || {}) && Object.keys(cleanTranslationMeta(input.translation_meta)).length) row.translation_meta = cleanTranslationMeta(input.translation_meta);
  let needsApproval = Boolean(a.needsApproval);
  // a new product that is live at once (or will be) is a publication: whoever may only create drafts must save it as inactive
  if (row.is_active || row.publish_at || row.unpublish_at) {
    const ev = await a.evaluate([...(row.is_active || row.publish_at ? ["products.publish"] : []), ...(row.unpublish_at ? ["products.archive"] : [])]);
    if (ev.mode === "denied") return ev.refusal;
    if (ev.mode === "approval") needsApproval = true;
  }
  if (!row.name_en && !row.name_fa) return { ok: false, error: tr("حداقل نام انگلیسی یا فارسی محصول لازم است.") };
  row.slug = await ensureUniqueSlug(a.admin, row.slug, null);
  if (needsApproval) {
    // nothing is created now: the request carries the whole new product, a reviewer decides
    return a.file({ operation: "products.create", ops: ["products.create", ...(row.is_active || row.publish_at ? ["products.publish"] : []), ...(row.unpublish_at ? ["products.archive"] : [])], entity: "beauty_products", subject: row.sku || row.name_en || row.name_fa, proposed: row });
  }
  const { data, error } = await a.admin.from("beauty_products").insert(row).select().single();
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic(data?.slug);
  await a.audit("product.create", { entity: "beauty_products", ids: [data?.id] });
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function updateProduct(id, input) {
  const a = await authed("products.content", { approvable: true });
  if (!a.ok) return a;
  id = parseProductId(id);
  if (id === null) return { ok: false, error: tr("شناسه محصول نامعتبر است.") };
  const row = buildProductRow(input);
  if (!row.name_en && !row.name_fa) return { ok: false, error: tr("حداقل نام انگلیسی یا فارسی محصول لازم است.") };
  // the edit may also change the price or the visibility: each is its own operation, asked only when the value really changes
  const { data: before } = await a.admin.from("beauty_products").select("*").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: tr("محصول یافت نشد.") };
  // optimistic lock: the screen says which version of the product it was showing; somebody else saved since → nothing is written
  const expected = input?.__expectedUpdatedAt;
  if (expected && String(before.updated_at) !== String(expected)) return conflictInfo(a.admin, "beauty", id, before);
  const sch = checkSchedule(input, before);
  if (!sch.ok) return { ok: false, error: sch.error };
  Object.assign(row, scheduleChanges(sch.values, before));
  // which texts are still the translator's (written only when it changes, so saving works before migration 40)
  if ("translation_meta" in (input || {}) && !sameTranslationMeta(input.translation_meta, before.translation_meta)) row.translation_meta = cleanTranslationMeta(input.translation_meta);
  const extra = [...productOps(before, row)];
  let needsApproval = Boolean(a.needsApproval);
  if (extra.length) {
    const ev = await a.evaluate(extra);
    if (ev.mode === "denied") return ev.refusal;
    if (ev.mode === "approval") needsApproval = true;
  }
  row.slug = await ensureUniqueSlug(a.admin, row.slug, id);
  if (needsApproval) {
    // the live product is untouched; the request carries ONLY the fields that really change, with their old values
    const { changed, old } = diffRow(before, row);
    if (!Object.keys(changed).length) return { ok: true, id, slug: before.slug };
    return a.file({ operation: "products.content", ops: ["products.content", ...extra], entity: "beauty_products", entityId: id, subject: before.sku || before.name_en || before.name_fa, before: old, proposed: changed, baseUpdatedAt: before.updated_at });
  }
  // `expected`: the update applies only to the version the person saw (zero rows = somebody saved first)
  const { data, error } = expected
    ? await a.admin.from("beauty_products").update(row).eq("id", id).eq("updated_at", before.updated_at).select().maybeSingle()
    : await a.admin.from("beauty_products").update(row).eq("id", id).select().single();
  if (error) return { ok: false, error: friendly(error) };
  if (!data) return conflictInfo(a.admin, "beauty", id, (await a.admin.from("beauty_products").select("updated_at").eq("id", id).maybeSingle()).data || before);
  revalidatePublic(data?.slug);
  const { changed, old: was } = diffRow(before, row);          // the history keeps what really changed, before and after
  await recordVersion(a.admin, "beauty", { productId: id, kind: "update", before: was, after: changed, who: whoOf(a.session) });
  await a.audit("product.update", { entity: "beauty_products", ids: [id], result: "success", before: was, after: changed, detail: { fields: Object.keys(changed) } });
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function setProductActive(id, active) {
  const a = await authed(active ? "products.publish" : "products.archive", { approvable: true });
  if (!a.ok) return a;
  id = parseProductId(id);
  if (id === null) return { ok: false, error: tr("شناسه محصول نامعتبر است.") };
  if (a.needsApproval) {
    const { data: cur } = await a.admin.from("beauty_products").select("id,sku,name_en,name_fa,is_active,updated_at").eq("id", id).maybeSingle();
    if (!cur) return { ok: false, error: tr("محصول یافت نشد.") };
    const op = active ? "products.publish" : "products.archive";
    return a.file({ operation: op, ops: [op], entity: "beauty_products", entityId: id, subject: cur.sku || cur.name_en || cur.name_fa, before: { is_active: cur.is_active }, proposed: { is_active: bool(active) }, baseUpdatedAt: cur.updated_at });
  }
  const { data: was } = await a.admin.from("beauty_products").select("is_active").eq("id", id).maybeSingle();
  const { error } = await a.admin.from("beauty_products").update({ is_active: bool(active) }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  if (was && Boolean(was.is_active) !== bool(active)) await recordVersion(a.admin, "beauty", { productId: id, kind: "quick", before: { is_active: was.is_active }, after: { is_active: bool(active) }, who: whoOf(a.session) });
  await a.audit("product.active", { entity: "beauty_products", ids: [id], detail: { is_active: bool(active) } });
  return { ok: true };
}

// ── Variants (migration 44): a variant is a product row that points at its parent; same rights and same approval path as a product ──
export async function saveVariant(parentId, variantId, input) {
  const a = await authed(variantId ? "products.content" : "products.create", { approvable: true });
  if (!a.ok) return a;
  return saveVariantCore(a, { house: "beauty", table: "beauty_products", parentId, variantId: variantId ?? null, input: input || {}, revalidate: (slug) => revalidatePublic(slug), uniqueSlug: (base, exclude) => ensureUniqueSlug(a.admin, base, exclude) });
}

// Revert one recorded change of a product (the old values go back as a NEW change). Same rules as an edit: price / visibility need their own rights.
export async function restoreProductVersion(id, versionId, expectedUpdatedAt) {
  const a = await authed("products.restore_version", { approvable: true });
  if (!a.ok) return a;
  const pid = parseProductId(id);
  if (pid === null) return { ok: false, error: tr("شناسه محصول نامعتبر است.") };
  return restoreVersion(a, { panel: "beauty", table: "beauty_products", productId: pid, versionId, expectedUpdatedAt, revalidate: (slug) => revalidatePublic(slug) });
}

// Permanent delete of an ARCHIVED product, after typing its SKU; every rule is enforced in productDelete.js.
export async function deleteProduct(id, confirmation) {
  const a = await authed("products.delete", { approvable: true });
  if (!a.ok) return a;
  if (a.needsApproval) {
    // the same checks as the real delete, now (so a request that could never succeed is not filed); the reviewer's approval runs them again
    const pid = parseProductId(id);
    if (pid === null) return { ok: false, error: PRODUCT_DELETE_MESSAGES.badId };
    const { data: cur } = await a.admin.from("beauty_products").select("id,sku,name_en,name_fa,is_active,updated_at").eq("id", pid).maybeSingle();
    if (!cur) return { ok: false, notFound: true, error: PRODUCT_DELETE_MESSAGES.notFound };
    if (cur.is_active !== false) return { ok: false, error: PRODUCT_DELETE_MESSAGES.notArchived };
    if (!confirmationMatches(confirmation, cur)) return { ok: false, error: PRODUCT_DELETE_MESSAGES.wrongConfirmation };
    return a.file({ operation: "products.delete", ops: ["products.delete"], entity: "beauty_products", entityId: pid, subject: cur.sku || cur.name_en || cur.name_fa, before: { sku: cur.sku, is_active: false }, proposed: { confirmation: String(confirmation).slice(0, 200) }, baseUpdatedAt: cur.updated_at });
  }
  const res = await deleteProductGuarded({
    getSession, getAdminClient, table: "beauty_products", id, confirmation,
    audit: makeAudit("beauty", getSession, getAdminClient),
  });
  if (res.ok) revalidatePublic(res.slug);
  return res;
}

export async function duplicateProduct(id) {
  const a = await authed("products.create", { approvable: true });
  if (!a.ok) return a;
  id = parseProductId(id);
  if (id === null) return { ok: false, error: tr("شناسه محصول نامعتبر است.") };
  const { data: src, error: e1 } = await a.admin.from("beauty_products").select("*").eq("id", id).single();
  if (e1 || !src) return { ok: false, error: tr("محصول یافت نشد.") };
  if (src.variant_of != null) return { ok: false, error: VARIANT_MESSAGES.duplicateVariant };
  const copy = { ...src };
  delete copy.id; delete copy.created_at; delete copy.updated_at; delete copy.views;
  const t = await getT();
  const copySuffix = t("(کپی)");   // in the language of the person who duplicates
  copy.is_active = false; // duplicates start hidden until reviewed
  if (copy.sku) copy.sku = `${copy.sku}-COPY`;
  for (const k of ["name_en", "name_fa", "name_ru", "name_tg"]) if (copy[k]) copy[k] = `${copy[k]} ${copySuffix}`;
  copy.slug = await ensureUniqueSlug(a.admin, slugify(`${src.slug || src.sku || "product"}-copy`), null);
  if (a.needsApproval) {
    // a copy is a NEW product: it is created when somebody approves it (it starts hidden either way)
    return a.file({ operation: "products.create", ops: ["products.create"], entity: "beauty_products", entityId: null, subject: copy.sku || copy.name_en || copy.name_fa, before: null, proposed: copy, baseUpdatedAt: null });
  }
  const { data, error } = await a.admin.from("beauty_products").insert(copy).select().single();
  if (error) return { ok: false, error: friendly(error) };
  await a.audit("product.duplicate", { entity: "beauty_products", ids: [data?.id] });
  return { ok: true, id: data?.id };
}

// Which operations a quick edit / bulk edit asks for, by the fields it touches.
function quickOps(patch = {}) {
  const ops = [];
  if ("in_stock" in patch) ops.push("products.stock_flag");
  if ("is_featured" in patch || "brand" in patch) ops.push("products.content");
  if ("price" in patch) ops.push("products.price");
  if ("is_active" in patch) ops.push(bool(patch.is_active) ? "products.publish" : "products.archive");
  return ops.length ? ops : ["products.content"];
}
function bulkOps(patch = {}) {
  const ops = ["products.bulk"];
  if ("is_active" in patch) ops.push(bool(patch.is_active) ? "products.publish" : "products.archive");
  if (patch.requestPrice) ops.push("products.price");
  if (patch.category_id !== undefined || patch.brand !== undefined) ops.push("products.content");
  return ops;
}

// Inline quick-edit from the product list (single field patches).
export async function quickUpdateProduct(id, patch = {}) {
  const a = await authed(quickOps(patch), { approvable: true });
  if (!a.ok) return a;
  id = parseProductId(id);
  if (id === null) return { ok: false, error: tr("شناسه نامعتبر است.") };
  const allowed = {};
  if ("in_stock" in patch)    allowed.in_stock = bool(patch.in_stock);
  if ("is_featured" in patch) allowed.is_featured = bool(patch.is_featured);
  if ("is_active" in patch)   allowed.is_active = bool(patch.is_active);
  if ("price" in patch)       allowed.price = patch.price === null ? null : num(patch.price, { min: 0 });
  if ("brand" in patch)       allowed.brand = patch.brand === null ? null : str(patch.brand, 120);
  if (!Object.keys(allowed).length) return { ok: false, error: tr("تغییری اعمال نشد.") };
  const { data: was } = await a.admin.from("beauty_products").select("*").eq("id", id).maybeSingle();
  if (a.needsApproval) {
    // the live product is untouched; the request carries only what really changes, prepared against this version of the product
    if (!was) return { ok: false, error: tr("محصول یافت نشد.") };
    const { changed, old } = diffRow(was, allowed);
    if (!Object.keys(changed).length) return { ok: true };
    const ops = quickOps(patch);
    return a.file({ operation: ops[0], ops, entity: "beauty_products", entityId: id, subject: was.sku || was.name_en || was.name_fa, before: old, proposed: changed, baseUpdatedAt: was.updated_at });
  }
  const { error } = await a.admin.from("beauty_products").update(allowed).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  if (was) { const { changed, old } = diffRow(was, allowed); await recordVersion(a.admin, "beauty", { productId: id, kind: "quick", before: old, after: changed, who: whoOf(a.session) }); }
  await a.audit("product.quick", { entity: "beauty_products", ids: [id], detail: { fields: Object.keys(allowed), ...("price" in allowed ? { price: allowed.price === null ? "request" : allowed.price } : {}) } });
  return { ok: true };
}

// Bulk actions on multiple products at once.
export async function bulkUpdateProducts(ids, patch = {}) {
  const a = await authed(bulkOps(patch));
  if (!a.ok) return a;
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: tr("هیچ محصولی انتخاب نشده است.") };
  const list = parseProductIds(ids);
  if (!list) return { ok: false, error: tr("فهرست محصولات نامعتبر است (حداکثر ۵۰۰ شناسه معتبر).") };
  const allowed = {};
  if ("is_active" in patch) allowed.is_active = bool(patch.is_active);
  if (patch.requestPrice)   allowed.price = null;
  if (patch.category_id !== undefined) {
    allowed.category_id = num(patch.category_id);
    allowed.category = str(patch.category);
  }
  if (patch.brand !== undefined) allowed.brand = patch.brand === null ? null : str(patch.brand, 120);
  if (!Object.keys(allowed).length) return { ok: false, error: tr("عملیاتی انتخاب نشده است.") };
  const { error } = await a.admin.from("beauty_products").update(allowed).in("id", list);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("product.bulk", { entity: "beauty_products", ids: list, detail: { fields: Object.keys(allowed) } });
  return { ok: true, count: list.length };
}

// ── Categories ────────────────────────────────────────────────────────────────
function buildCategoryRow(input) {
  const row = {
    slug: slugify(input.slug),
    world: WORLD_SLUGS.includes(input.world) ? input.world : null,
    name_fa: str(input.name_fa, 200),
    name_en: str(input.name_en, 200),
    name_ru: str(input.name_ru, 200),
    name_tg: str(input.name_tg, 200),
    description_fa: str(input.description_fa, 2000),
    description_en: str(input.description_en, 2000),
    icon: str(input.icon, 60),
    image_url: safeUrlRef(input.image_url),
    sort_order: num(input.sort_order, { min: 0 }) ?? 0,
    is_active: input.is_active === undefined ? true : bool(input.is_active),
    is_featured: bool(input.is_featured),
  };
  // Tree columns (migration 12) — only touched when the caller supplies them,
  // so pre-tree callers (and pre-migration DBs) are unaffected.
  if (input.parent_id !== undefined) row.parent_id = input.parent_id == null ? null : Number(input.parent_id);
  if (input.level !== undefined) row.level = num(input.level, { min: 1 }) ?? 1;
  return row;
}

// Toggle a category AND its whole subtree active/inactive in one write — lets
// the owner hide an entire department or group from the panel with one click.
export async function setCategorySubtreeActive(id, is_active) {
  const a = await authed("categories.archive");
  if (!a.ok) return a;
  if (!id) return { ok: false, error: tr("شناسه دسته نامعتبر است.") };
  const { data: all, error: readErr } = await a.admin.from("beauty_categories").select("id,parent_id");
  if (readErr) return { ok: false, error: friendly(readErr) };
  const kids = new Map();
  for (const c of all || []) {
    if (!kids.has(c.parent_id)) kids.set(c.parent_id, []);
    kids.get(c.parent_id).push(c.id);
  }
  const ids = [];
  const stack = [Number(id)];
  while (stack.length) {
    const cur = stack.pop();
    ids.push(cur);
    for (const k of kids.get(cur) || []) stack.push(k);
  }
  const { error } = await a.admin.from("beauty_categories").update({ is_active: bool(is_active) }).in("id", ids);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("category.flags", { entity: "beauty_categories", ids, detail: { is_active: bool(is_active) } });
  return { ok: true, count: ids.length };
}

export async function createCategory(input) {
  const a = await authed("categories.create");
  if (!a.ok) return a;
  const row = buildCategoryRow(input);
  if (!row.slug) return { ok: false, error: tr("slug دسته لازم است (حروف لاتین).") };
  if (!row.name_fa && !row.name_en) return { ok: false, error: tr("حداقل نام فارسی یا انگلیسی دسته لازم است.") };
  const { data, error } = await a.admin.from("beauty_categories").insert(row).select().single();
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("category.create", { entity: "beauty_categories", ids: [data?.id] });
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function updateCategory(id, input) {
  const a = await authed("categories.edit");
  if (!a.ok) return a;
  if (!id) return { ok: false, error: tr("شناسه دسته نامعتبر است.") };
  const row = buildCategoryRow(input);
  delete row.slug; // slug is the natural/public key — don't rewrite it on edit
  const { error } = await a.admin.from("beauty_categories").update(row).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("category.update", { entity: "beauty_categories", ids: [id] });
  return { ok: true };
}

export async function setCategoryFlags(id, { is_active, is_featured }) {
  const flagOps = [...(is_active !== undefined ? ["categories.archive"] : []), ...(is_featured !== undefined ? ["categories.edit"] : [])];
  const a = await authed(flagOps.length ? flagOps : "categories.edit");
  if (!a.ok) return a;
  const patch = {};
  if (is_active !== undefined) patch.is_active = bool(is_active);
  if (is_featured !== undefined) patch.is_featured = bool(is_featured);
  const { error } = await a.admin.from("beauty_categories").update(patch).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("category.flags", { entity: "beauty_categories", ids: [id] });
  return { ok: true };
}

// Safe category delete: refuses while products are attached unless a target
// category is given; then moves products and deletes. Never deletes products.
export async function deleteCategorySafe(id, moveToId) {
  const a = await authed("categories.delete", { approvable: true });
  if (!a.ok) return a;
  return categoryDeleteFlow({ a, house: "beauty", id, moveToId, revalidate: revalidatePublic });
}

// ── Brands ("Maisons" directory) ──────────────────────────────────────────────
// A brand row carries the OFFICIAL logo the operator uploads — the app never
// scrapes or fabricates brand marks. Brand ↔ products is the text join
// (beauty_products.brand == beauty_brands.name); brand names are not translated.
function buildBrandRow(input) {
  return {
    slug: slugify(input.slug),
    name: str(input.name, 120),
    tagline_fa: str(input.tagline_fa, 300),
    tagline_en: str(input.tagline_en, 300),
    tagline_ru: str(input.tagline_ru, 300),
    tagline_tg: str(input.tagline_tg, 300),
    logo_url: safeUrlRef(input.logo_url),
    website: safeUrlRef(input.website),
    sort_order: num(input.sort_order, { min: 0 }) ?? 0,
    is_active: input.is_active === undefined ? true : bool(input.is_active),
    is_featured: bool(input.is_featured),
  };
}

export async function createBrand(input) {
  const a = await authed("brands.create");
  if (!a.ok) return a;
  const row = buildBrandRow(input);
  if (!row.name) return { ok: false, error: tr("نام برند لازم است.") };
  if (!row.slug) row.slug = slugify(row.name) || `brand-${Date.now()}`;
  const { data, error } = await a.admin.from("beauty_brands").insert(row).select().single();
  if (error) return { ok: false, error: friendlyBrand(error) };
  revalidatePublic();
  await a.audit("brand.create", { entity: "beauty_brands", ids: [data?.id] });
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function updateBrand(id, input) {
  const a = await authed("brands.edit");
  if (!a.ok) return a;
  if (!id) return { ok: false, error: tr("شناسه برند نامعتبر است.") };
  const row = buildBrandRow(input);
  delete row.slug; // slug is the public key — fixed after creation
  if (!row.name) return { ok: false, error: tr("نام برند لازم است.") };
  const { error } = await a.admin.from("beauty_brands").update(row).eq("id", id);
  if (error) return { ok: false, error: friendlyBrand(error) };
  revalidatePublic();
  await a.audit("brand.update", { entity: "beauty_brands", ids: [id] });
  return { ok: true };
}

export async function setBrandFlags(id, { is_active, is_featured }) {
  const flagOps = [...(is_active !== undefined ? ["brands.archive"] : []), ...(is_featured !== undefined ? ["brands.edit"] : [])];
  const a = await authed(flagOps.length ? flagOps : "brands.edit");
  if (!a.ok) return a;
  const patch = {};
  if (is_active !== undefined) patch.is_active = bool(is_active);
  if (is_featured !== undefined) patch.is_featured = bool(is_featured);
  const { error } = await a.admin.from("beauty_brands").update(patch).eq("id", id);
  if (error) return { ok: false, error: friendlyBrand(error) };
  revalidatePublic();
  await a.audit("brand.flags", { entity: "beauty_brands", ids: [id] });
  return { ok: true };
}

export async function deleteBrand(id) {
  const a = await authed("brands.delete", { approvable: true });
  if (!a.ok) return a;
  // Deleting a brand row never touches products (their text `brand` stays).
  return brandDeleteFlow({ a, id, revalidate: revalidatePublic, mapDbError: friendlyBrand });
}

function friendlyBrand(error) {
  const msg = String(error?.message || error);
  if (error?.code === "42P01" || /relation .* does not exist/i.test(msg))
    return tr("جدول برندها هنوز ساخته نشده است. مایگریشن ۱۱ را در Supabase اجرا کنید.");
  if (error?.code === "23505" || /duplicate key/i.test(msg)) return tr("این slug قبلاً ثبت شده است.");
  return friendly(error);
}

// Official brand logo upload — Beauty's own logo bucket, service role, magic-byte
// sniffed (same discipline as product images). The operator supplies the real,
// licensed logo file; nothing here generates or fetches a mark.
export async function uploadBrandLogo(formData) {
  const a = await authed("brands.edit");
  if (!a.ok) return a;
  const file = formData?.get?.("file");
  if (!file || typeof file === "string") return { ok: false, error: tr("فایلی انتخاب نشده است.") };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: tr("حجم لوگو بیش از ۵ مگابایت است.") };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return { ok: false, error: tr("فقط تصویر JPG/PNG/WEBP/AVIF مجاز است.") };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffImageType(head);
  if (!sniffed) return { ok: false, error: tr("محتوای فایل یک تصویر معتبر نیست.") };
  const path = `logos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
  const { error } = await a.admin.storage
    .from("beauty-brand-logos")
    .upload(path, file, { contentType: sniffed, upsert: false });
  if (error) {
    const msg = /bucket/i.test(String(error.message)) ? tr("باکت beauty-brand-logos وجود ندارد. مایگریشن ۱۱ را اجرا کنید.") : tr("آپلود ناموفق بود.");
    return { ok: false, error: msg };
  }
  const { data } = a.admin.storage.from("beauty-brand-logos").getPublicUrl(path);
  return { ok: true, path, url: data.publicUrl };
}

// Category tile image (department / group / subgroup). Reuses the existing
// beauty-product-images bucket under a categories/ path; the stored path goes
// into beauty_categories.image_url and resolves via beautyImageUrl().
export async function uploadCategoryImage(formData) {
  const a = await authed("categories.edit");
  if (!a.ok) return a;
  const file = formData?.get?.("file");
  if (!file || typeof file === "string") return { ok: false, error: tr("فایلی انتخاب نشده است.") };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: tr("حجم تصویر بیش از ۵ مگابایت است.") };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return { ok: false, error: tr("فقط تصویر JPG/PNG/WEBP/AVIF مجاز است.") };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffImageType(head);
  if (!sniffed) return { ok: false, error: tr("محتوای فایل یک تصویر معتبر نیست.") };
  const path = `categories/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
  const { error } = await a.admin.storage
    .from("beauty-product-images")
    .upload(path, file, { contentType: sniffed, upsert: false });
  if (error) return { ok: false, error: tr("آپلود ناموفق بود.") };
  const { data } = a.admin.storage.from("beauty-product-images").getPublicUrl(path);
  return { ok: true, path, url: data.publicUrl };
}

// ── Quote requests ──────────────────────────────────────────────────────────
export async function updateQuoteStatus(id, status) {
  const a = await authed("quotes.status");
  if (!a.ok) return a;
  if (!QUOTE_STATUSES.includes(status)) return { ok: false, error: tr("وضعیت نامعتبر است.") };
  const { error } = await a.admin.from("beauty_quote_requests").update({ status }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  await a.audit("quote.status", { entity: "beauty_quote_requests", ids: [Number(id)], detail: { status } });
  return { ok: true };
}

export async function updateQuoteNotes(id, notes) {
  const a = await authed("quotes.status");
  if (!a.ok) return a;
  const { error } = await a.admin
    .from("beauty_quote_requests")
    .update({ internal_notes: str(notes, 4000) })
    .eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  await a.audit("quote.notes", { entity: "beauty_quote_requests", ids: [Number(id)] });
  return { ok: true };
}

// Who looks after a request (a typed label; the panel login is shared, so it is not an identity).
export async function assignQuote(id, assignee) {
  const a = await authed("quotes.assign");
  if (!a.ok) return a;
  return assignQuoteGuarded({ getSession, getAdminClient, table: "beauty_quote_requests", id, assignee, audit: makeAudit("beauty", getSession, getAdminClient), resolveUser: userResolver("beauty") });
}

// The day somebody promised to follow up (a date, not a time); empty clears it.
export async function setQuoteFollowUp(id, date) {
  const a = await authed("quotes.status");
  if (!a.ok) return a;
  return followUp.setFollowUp({ admin: a.admin, table: "beauty_quote_requests", kind: "beauty", audit: makeAudit("beauty", getSession, getAdminClient) }, id, date);
}

// Send the Telegram notice of a request again (only when the first one failed).
export async function retryQuoteNotice(id) {
  const a = await authed("quotes.status");
  if (!a.ok) return a;
  return followUp.retryNotice({ admin: a.admin, table: "beauty_quote_requests", kind: "beauty", audit: makeAudit("beauty", getSession, getAdminClient) }, id);
}

// CSV of the customer requests of the last 7 / 30 / 90 days. Customer data: behind its own permission.
export async function exportQuotesCsv(days) {
  const a = await authed("quotes.export");
  if (!a.ok) return a;
  return followUp.exportQuotes({ admin: a.admin, table: "beauty_quote_requests", kind: "beauty", audit: makeAudit("beauty", getSession, getAdminClient) }, { days });
}

// Hard delete of one customer request. The shared helper checks the session
// first; this panel passes its own session check and its own table only.
export async function deleteQuote(id) {
  const a = await authed("quotes.delete", { approvable: true });
  if (!a.ok) return a;
  return quotesDeleteFlow({ a, house: "beauty", ids: id, single: true, getSession, getAdminClient, audit: makeAudit("beauty", getSession, getAdminClient) });
}

// Bulk actions from the tick-selection: same guard order, same own-table-only rule.
export async function deleteQuotes(ids) {
  const a = await authed("quotes.delete", { approvable: true });
  if (!a.ok) return a;
  return quotesDeleteFlow({ a, house: "beauty", ids, getSession, getAdminClient, audit: makeAudit("beauty", getSession, getAdminClient) });
}

export async function updateQuotesStatus(ids, status) {
  const a = await authed("quotes.status");
  if (!a.ok) return a;
  return setQuotesStatusGuarded({ getSession, getAdminClient, table: "beauty_quote_requests", ids, status, audit: makeAudit("beauty", getSession, getAdminClient) });
}

// ── Image upload (server-side; service role; Beauty's own bucket) ────────────
// Remove an image nothing uses (the library checks usage again; a person whose policy says "approve" files a request instead).
export async function deleteMediaFile(input = {}) {
  const a = await authed("media.delete", { approvable: true });
  if (!a.ok) return a;
  const { bucket, path } = input || {};
  if (!isAllowedFile("beauty", bucket, path)) return { ok: false, error: MEDIA_MESSAGES.badFile };
  if (a.needsApproval) {
    // the same "still unused?" check now, so a request that could never succeed is not filed; the reviewer's approval checks again
    const used = await usageMap(a.admin, "beauty");
    if (!used.ok) return { ok: false, error: MEDIA_MESSAGES.unavailable };
    if ((used.map.get(`${bucket}/${path}`) || []).length) return { ok: false, inUse: true, error: MEDIA_MESSAGES.inUse };
    return a.file({ operation: "media.delete", ops: ["media.delete"], entity: "media", subject: path.slice(0, 120), before: { file: path }, proposed: { _bucket: bucket, _path: path } });
  }
  const res = await deleteMedia(a.admin, "beauty", { bucket, path });
  if (res.ok) await a.audit("media.delete", { entity: bucket, count: 1, detail: { code: path.split("/")[0] } });
  return res.ok ? res : { ok: false, error: res.error, inUse: Boolean(res.inUse) };
}

export async function uploadProductImage(formData) {
  const a = await authed("media.upload");
  if (!a.ok) return a;
  const file = formData?.get?.("file");
  if (!file || typeof file === "string") return { ok: false, error: tr("فایلی انتخاب نشده است.") };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: tr("حجم تصویر بیش از ۵ مگابایت است.") };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return { ok: false, error: tr("فقط تصویر JPG/PNG/WEBP/AVIF مجاز است.") };
  // Authoritative check: sniff the real magic bytes and derive the stored
  // Content-Type from them — never trust the client-declared file.type.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffImageType(head);
  if (!sniffed) return { ok: false, error: tr("محتوای فایل یک تصویر معتبر نیست.") };
  const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
  const { error } = await a.admin.storage
    .from("beauty-product-images")
    .upload(path, file, { contentType: sniffed, upsert: false });
  if (error) {
    const msg = /bucket/i.test(String(error.message)) ? tr("باکت beauty-product-images وجود ندارد. مایگریشن ۱۰ را اجرا کنید.") : tr("آپلود ناموفق بود.");
    return { ok: false, error: msg };
  }
  const { data } = a.admin.storage.from("beauty-product-images").getPublicUrl(path);
  return { ok: true, path, url: data.publicUrl };
}

// ── Auto-translation (Cloudflare Workers AI; credentials stay server-side) ──
export async function translateProductFields(input = {}) {
  const session = await getSession();

  if (!session) {
    return {
      ok: false,
      error: tr("نشست نامعتبر است. دوباره وارد شوید."),
    };
  }
  const refused = await gate(session, "beauty", "products.content");
  if (refused) return refused;

  return translateProductFieldsWithCloudflare(input);
}


// The products of one brand and a search over the others, from the database (the brand screen no longer loads the whole catalogue).
export async function listBrandRoster(brandName, query = "") {
  const a = await authed("products.content");           // the roster is for attaching / unlinking products
  if (!a.ok) return a;
  const res = await readBrandRoster(a.admin, brandName, query);
  return res.ok ? res : { ok: false, error: tr("فهرست خوانده نشد. دوباره تلاش کنید.") };
}
