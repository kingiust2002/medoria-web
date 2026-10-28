"use server";
// lib/operator/actions.js — operator panel mutations.
// Every action: (1) verifies the session, (2) uses the service-role client
// (server-only), (3) validates/sanitises input, (4) returns a friendly result.
// Pre-migration safe: writes that hit a missing new column retry without it.
import { recordVersion } from "@/lib/operator/productVersions";
import { restoreVersion, conflictInfo, whoOf } from "@/lib/operator/productRestoreCore";
import * as followUp from "@/lib/operator/quoteFollowUpCore";
import { userResolver } from "@/lib/operator/quoteFollowUpCore";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { getSession } from "@/lib/operator/auth";
import { requireAll, evaluateAll } from "@/lib/operator/access";
import { fileForApproval } from "@/lib/operator/approvalFlow";
import { diffRow, productOps } from "@/lib/operator/approvalExecutors";
import { gate } from "@/lib/operator/gate";
import { auditEvent, makeAudit } from "@/lib/operator/audit";
import { deleteQuoteGuarded, deleteQuotesGuarded, setQuotesStatusGuarded } from "@/lib/operator/quoteDelete";
import { assignQuoteGuarded } from "@/lib/operator/quoteOps";
import { deleteProductGuarded, parseProductId, parseProductIds, confirmationMatches, PRODUCT_DELETE_MESSAGES } from "@/lib/operator/productDelete";
import { revalidateHealthPublic } from "@/lib/health/revalidate";
import { translateProductFieldsWithCloudflare } from "@/lib/translation/cloudflare";
import {
  slugify, str, num, bool, strArray, parseSpecs,
  MAX_IMAGE_BYTES, ALLOWED_IMAGE_TYPES, safeFileName, safeUrlRef, sniffImageType,
} from "@/lib/operator/validation";

import { QUOTE_STATUSES } from "@/lib/operator/constants";
import { getT } from "@/lib/panel/server";
import { tr } from "../panel/i18n.js";
const PRODUCT_NEW_COLS = ["is_active", "tags", "seo_title", "seo_description"];
const CATEGORY_NEW_COLS = ["is_active", "is_featured"];
const QUOTE_NEW_COLS = ["internal_notes", "source_url"];

// ── helpers ───────────────────────────────────────────────────────────────────
async function authed(operation, { approvable = false } = {}) {
  const session = await getSession();
  if (!session) return { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  // `audit` writes one line to the activity log (what was done, never who or customer data).
  const ctx = { ok: true, admin, session, audit: (action, meta = {}) => auditEvent({ admin, panel: "health", session, action, ...meta }) };
  // the person must be allowed this operation NOW (account, house, role, permissions; default closed). `ctx.require(ops)` asks for more.
  ctx.require = (ops) => requireAll({ session, panel: "health", operations: [].concat(ops), audit: (...args) => ctx.audit(...args) });
  // for the actions that can FILE A CHANGE REQUEST: "direct" | "approval" | "denied" (denied is logged and carries the refusal)
  ctx.evaluate = (ops) => evaluateAll({ session, panel: "health", operations: [].concat(ops), audit: (...args) => ctx.audit(...args) });
  ctx.file = (spec) => fileForApproval({ admin, session, audit: (...args) => ctx.audit(...args), panel: "health" }, spec);
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
  if (error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(msg))
    return tr("ستون موردنیاز در پایگاه داده موجود نیست. مایگریشن‌های ۰۴ و ۰۵ را در Supabase اجرا کنید.");
  if (error.code === "23514") return tr("این وضعیت در پایگاه داده هنوز مجاز نیست. برای «آرشیو» مایگریشن ۲۹ (و برای «اسپم» مایگریشن ۰۵) را در Supabase اجرا کنید.");
  if (error.code === "23505" || /duplicate key/i.test(msg)) return tr("مقدار تکراری است (slug یا SKU قبلاً ثبت شده).");
  return tr("ذخیره ناموفق بود. دوباره تلاش کنید.");
}

// Refresh every Health public route that shows catalog data (home, catalog, every
// product page, sitemap). The route list lives in lib/health/revalidateTargets.js;
// the old locale-first paths (/{lang}/catalog/...) purged nothing.
function revalidatePublic(slug) {
  revalidateHealthPublic({ slug });
}

// Insert/update with a one-shot retry that strips columns added by later
// migrations, so the panel still works before 04/05 are applied.
async function writeRow(admin, table, row, id, newCols, guard = null) {
  // `guard`: the updated_at the person saw; the update then applies only to exactly that version (zero rows = somebody saved first)
  const run = (r) =>
    id ? (guard ? admin.from(table).update(r).eq("id", id).eq("updated_at", guard).select().maybeSingle() : admin.from(table).update(r).eq("id", id).select().single())
       : admin.from(table).insert(r).select().single();
  let res = await run(row);
  if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) {
    const stripped = { ...row };
    for (const c of newCols) delete stripped[c];
    res = await run(stripped);
  }
  return res;
}

async function ensureUniqueSlug(admin, base, excludeId) {
  const baseSlug = base || `product-${Date.now()}`;
  let candidate = baseSlug;
  for (let i = 2; i < 60; i++) {
    const { data } = await admin.from("products").select("id").eq("slug", candidate).limit(1);
    const taken = (data || []).some((r) => r.id !== excludeId);
    if (!taken) return candidate;
    candidate = `${baseSlug}-${i}`;
  }
  return `${baseSlug}-${Date.now()}`;
}

// Field length caps for manual entry — same spirit as the CSV import CAPS, so
// no path into the DB accepts unbounded payloads.
function buildProductRow(input) {
  const nameEn = str(input.name_en, 200);
  let base = slugify(input.slug || nameEn || "");
  if (!base) base = slugify(str(input.sku, 100) || "");
  return {
    name_en: nameEn,
    name_ru: str(input.name_ru, 200),
    name_tg: str(input.name_tg, 200),
    name_fa: str(input.name_fa, 200),
    description_en: str(input.description_en, 4000),
    description_ru: str(input.description_ru, 4000),
    description_tg: str(input.description_tg, 4000),
    description_fa: str(input.description_fa, 4000),
    slug: base,
    sku: str(input.sku, 100),
    brand: str(input.brand, 120),
    category: str(input.category, 80),
    category_id: num(input.category_id),
    price: bool(input.priceOnRequest) ? null : num(input.price, { min: 0 }),
    unit: str(input.unit, 120),
    min_order_qty: num(input.min_order_qty, { min: 1 }) ?? 1,
    in_stock: bool(input.in_stock),
    badge: str(input.badge, 20),
    is_featured: bool(input.is_featured),
    is_active: input.is_active === undefined ? true : bool(input.is_active),
    image_url: safeUrlRef(input.image_url),
    gallery_urls: strArray(input.gallery_urls, { maxItems: 12, maxLen: 600 }).map((u) => safeUrlRef(u)).filter(Boolean),
    specs: parseSpecs(input.specs),
    brochure_url: safeUrlRef(input.brochure_url),
    tags: strArray(input.tags, { maxItems: 30, maxLen: 60 }),
    seo_title: str(input.seo_title, 200),
    seo_description: str(input.seo_description, 500),
  };
}

// ── Products ────────────────────────────────────────────────────────────────
export async function createProduct(input) {
  const a = await authed("products.create", { approvable: true });
  if (!a.ok) return a;
  const row = buildProductRow(input);
  let needsApproval = Boolean(a.needsApproval);
  // a new product that is live at once is a publication: whoever may only create drafts must save it as inactive
  if (row.is_active) {
    const ev = await a.evaluate("products.publish");
    if (ev.mode === "denied") return ev.refusal;
    if (ev.mode === "approval") needsApproval = true;
  }
  if (!row.name_en && !row.name_fa) return { ok: false, error: tr("حداقل نام انگلیسی یا فارسی محصول لازم است.") };
  row.slug = await ensureUniqueSlug(a.admin, row.slug, null);
  if (needsApproval) {
    // nothing is created now: the request carries the whole new product, a reviewer decides
    return a.file({ operation: "products.create", ops: ["products.create", ...(row.is_active ? ["products.publish"] : [])], entity: "products", subject: row.sku || row.name_en || row.name_fa, proposed: row });
  }
  const { data, error } = await writeRow(a.admin, "products", row, null, PRODUCT_NEW_COLS);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic(data?.slug);
  await a.audit("product.create", { entity: "products", ids: [data?.id] });
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
  const { data: before } = await a.admin.from("products").select("*").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: tr("محصول یافت نشد.") };
  // optimistic lock: the screen says which version of the product it was showing; somebody else saved since → nothing is written
  const expected = input?.__expectedUpdatedAt;
  if (expected && String(before.updated_at) !== String(expected)) return conflictInfo(a.admin, "health", id, before);
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
    return a.file({ operation: "products.content", ops: ["products.content", ...extra], entity: "products", entityId: id, subject: before.sku || before.name_en || before.name_fa, before: old, proposed: changed, baseUpdatedAt: before.updated_at });
  }
  const { data, error } = await writeRow(a.admin, "products", row, id, PRODUCT_NEW_COLS, expected ? before.updated_at : null);
  if (error) return { ok: false, error: friendly(error) };
  if (!data) return conflictInfo(a.admin, "health", id, (await a.admin.from("products").select("updated_at").eq("id", id).maybeSingle()).data || before);   // saved by somebody else between our read and our write
  revalidatePublic(data?.slug);
  const { changed, old: was } = diffRow(before, row);          // the history keeps what really changed, before and after
  await recordVersion(a.admin, "health", { productId: id, kind: "update", before: was, after: changed, who: whoOf(a.session) });
  await a.audit("product.update", { entity: "products", ids: [id], result: "success", before: was, after: changed, detail: { fields: Object.keys(changed) } });
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function setProductActive(id, active) {
  const a = await authed(active ? "products.publish" : "products.archive", { approvable: true });
  if (!a.ok) return a;
  id = parseProductId(id);
  if (id === null) return { ok: false, error: tr("شناسه محصول نامعتبر است.") };
  if (a.needsApproval) {
    const { data: cur } = await a.admin.from("products").select("id,sku,name_en,name_fa,is_active,updated_at").eq("id", id).maybeSingle();
    if (!cur) return { ok: false, error: tr("محصول یافت نشد.") };
    const op = active ? "products.publish" : "products.archive";
    return a.file({ operation: op, ops: [op], entity: "products", entityId: id, subject: cur.sku || cur.name_en || cur.name_fa, before: { is_active: cur.is_active }, proposed: { is_active: bool(active) }, baseUpdatedAt: cur.updated_at });
  }
  const { data: was } = await a.admin.from("products").select("is_active").eq("id", id).maybeSingle();
  const { error } = await a.admin.from("products").update({ is_active: bool(active) }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  if (was && Boolean(was.is_active) !== bool(active)) await recordVersion(a.admin, "health", { productId: id, kind: "quick", before: { is_active: was.is_active }, after: { is_active: bool(active) }, who: whoOf(a.session) });
  await a.audit("product.active", { entity: "products", ids: [id], detail: { is_active: bool(active) } });
  return { ok: true };
}

// Revert one recorded change of a product (the old values go back as a NEW change). Same rules as an edit: price / visibility need their own rights.
export async function restoreProductVersion(id, versionId, expectedUpdatedAt) {
  const a = await authed("products.restore_version", { approvable: true });
  if (!a.ok) return a;
  const pid = parseProductId(id);
  if (pid === null) return { ok: false, error: tr("شناسه محصول نامعتبر است.") };
  return restoreVersion(a, { panel: "health", table: "products", productId: pid, versionId, expectedUpdatedAt, revalidate: (slug) => revalidatePublic(slug) });
}

// Permanent delete of an ARCHIVED product, after typing its SKU; every rule is enforced in productDelete.js.
export async function deleteProduct(id, confirmation) {
  const a = await authed("products.delete", { approvable: true });
  if (!a.ok) return a;
  if (a.needsApproval) {
    // the same checks as the real delete, now (so a request that could never succeed is not filed); the reviewer's approval runs them again
    const pid = parseProductId(id);
    if (pid === null) return { ok: false, error: PRODUCT_DELETE_MESSAGES.badId };
    const { data: cur } = await a.admin.from("products").select("id,sku,name_en,name_fa,is_active,updated_at").eq("id", pid).maybeSingle();
    if (!cur) return { ok: false, notFound: true, error: PRODUCT_DELETE_MESSAGES.notFound };
    if (cur.is_active !== false) return { ok: false, error: PRODUCT_DELETE_MESSAGES.notArchived };
    if (!confirmationMatches(confirmation, cur)) return { ok: false, error: PRODUCT_DELETE_MESSAGES.wrongConfirmation };
    return a.file({ operation: "products.delete", ops: ["products.delete"], entity: "products", entityId: pid, subject: cur.sku || cur.name_en || cur.name_fa, before: { sku: cur.sku, is_active: false }, proposed: { confirmation: String(confirmation).slice(0, 200) }, baseUpdatedAt: cur.updated_at });
  }
  const res = await deleteProductGuarded({
    getSession, getAdminClient, table: "products", id, confirmation,
    audit: makeAudit("health", getSession, getAdminClient),
  });
  if (res.ok) revalidatePublic(res.slug);
  return res;
}

export async function duplicateProduct(id) {
  const a = await authed("products.create");
  if (!a.ok) return a;
  id = parseProductId(id);
  if (id === null) return { ok: false, error: tr("شناسه محصول نامعتبر است.") };
  const { data: src, error: e1 } = await a.admin.from("products").select("*").eq("id", id).single();
  if (e1 || !src) return { ok: false, error: tr("محصول یافت نشد.") };
  const copy = { ...src };
  delete copy.id; delete copy.created_at; delete copy.updated_at; delete copy.views;
  const t = await getT();
  const copySuffix = t("(کپی)");   // in the language of the person who duplicates
  copy.is_active = false; // duplicates start hidden until reviewed
  if (copy.sku) copy.sku = `${copy.sku}-COPY`;
  for (const k of ["name_en", "name_fa", "name_ru", "name_tg"]) if (copy[k]) copy[k] = `${copy[k]} ${copySuffix}`;
  copy.slug = await ensureUniqueSlug(a.admin, slugify(`${src.slug || src.sku || "product"}-copy`), null);
  const { data, error } = await writeRow(a.admin, "products", copy, null, PRODUCT_NEW_COLS);
  if (error) return { ok: false, error: friendly(error) };
  await a.audit("product.duplicate", { entity: "products", ids: [data?.id] });
  return { ok: true, id: data?.id };
}

// Which operations a quick edit / bulk edit asks for, by the fields it touches (unknown fields are ignored by the action itself).
function quickOps(patch = {}) {
  const ops = [];
  if ("in_stock" in patch) ops.push("products.stock_flag");
  if ("is_featured" in patch) ops.push("products.content");
  if ("price" in patch) ops.push("products.price");
  if ("is_active" in patch) ops.push(bool(patch.is_active) ? "products.publish" : "products.archive");
  return ops.length ? ops : ["products.content"];
}
function bulkOps(patch = {}) {
  const ops = ["products.bulk"];
  if ("is_active" in patch) ops.push(bool(patch.is_active) ? "products.publish" : "products.archive");
  if (patch.requestPrice) ops.push("products.price");
  if (patch.category_id !== undefined) ops.push("products.content");
  return ops;
}

// Inline quick-edit from the product list (single field patches).
export async function quickUpdateProduct(id, patch = {}) {
  const a = await authed(quickOps(patch));
  if (!a.ok) return a;
  id = parseProductId(id);
  if (id === null) return { ok: false, error: tr("شناسه نامعتبر است.") };
  const allowed = {};
  if ("in_stock" in patch)    allowed.in_stock = bool(patch.in_stock);
  if ("is_featured" in patch) allowed.is_featured = bool(patch.is_featured);
  if ("is_active" in patch)   allowed.is_active = bool(patch.is_active);
  if ("price" in patch)       allowed.price = patch.price === null ? null : num(patch.price, { min: 0 });
  if (!Object.keys(allowed).length) return { ok: false, error: tr("تغییری اعمال نشد.") };
  const { data: was } = await a.admin.from("products").select(Object.keys(allowed).join(",")).eq("id", id).maybeSingle();
  const { error } = await a.admin.from("products").update(allowed).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  if (was) { const { changed, old } = diffRow(was, allowed); await recordVersion(a.admin, "health", { productId: id, kind: "quick", before: old, after: changed, who: whoOf(a.session) }); }
  await a.audit("product.quick", { entity: "products", ids: [id], detail: { fields: Object.keys(allowed), ...("price" in allowed ? { price: allowed.price === null ? "request" : allowed.price } : {}) } });
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
  if (!Object.keys(allowed).length) return { ok: false, error: tr("عملیاتی انتخاب نشده است.") };
  const { error } = await a.admin.from("products").update(allowed).in("id", list);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("product.bulk", { entity: "products", ids: list, detail: { fields: Object.keys(allowed) } });
  return { ok: true, count: list.length };
}

// ── Categories ────────────────────────────────────────────────────────────────
function buildCategoryRow(input) {
  return {
    slug: slugify(input.slug),
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
}

export async function createCategory(input) {
  const a = await authed("categories.create");
  if (!a.ok) return a;
  const row = buildCategoryRow(input);
  if (!row.slug) return { ok: false, error: tr("slug دسته لازم است (حروف لاتین).") };
  if (!row.name_fa && !row.name_en) return { ok: false, error: tr("حداقل نام فارسی یا انگلیسی دسته لازم است.") };
  const { data, error } = await writeRow(a.admin, "categories", row, null, CATEGORY_NEW_COLS);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("category.create", { entity: "categories", ids: [data?.id] });
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function updateCategory(id, input) {
  const a = await authed("categories.edit");
  if (!a.ok) return a;
  if (!id) return { ok: false, error: tr("شناسه دسته نامعتبر است.") };
  const row = buildCategoryRow(input);
  delete row.slug; // slug is the natural/public key — don't rewrite it on edit
  const { error } = await writeRow(a.admin, "categories", row, id, CATEGORY_NEW_COLS);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("category.update", { entity: "categories", ids: [id] });
  return { ok: true };
}

export async function setCategoryFlags(id, { is_active, is_featured }) {
  const flagOps = [...(is_active !== undefined ? ["categories.archive"] : []), ...(is_featured !== undefined ? ["categories.edit"] : [])];
  const a = await authed(flagOps.length ? flagOps : "categories.edit");
  if (!a.ok) return a;
  const patch = {};
  if (is_active !== undefined) patch.is_active = bool(is_active);
  if (is_featured !== undefined) patch.is_featured = bool(is_featured);
  const { error } = await a.admin.from("categories").update(patch).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  await a.audit("category.flags", { entity: "categories", ids: [id], detail: { fields: Object.keys(patch) } });
  return { ok: true };
}

// ── Quote requests ──────────────────────────────────────────────────────────
export async function updateQuoteStatus(id, status) {
  const a = await authed("quotes.status");
  if (!a.ok) return a;
  if (!QUOTE_STATUSES.includes(status)) return { ok: false, error: tr("وضعیت نامعتبر است.") };
  const { error } = await a.admin.from("quote_requests").update({ status }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  await a.audit("quote.status", { entity: "quote_requests", ids: [Number(id)], detail: { status } });
  return { ok: true };
}

export async function updateQuoteNotes(id, notes) {
  const a = await authed("quotes.status");
  if (!a.ok) return a;
  const { error } = await a.admin
    .from("quote_requests")
    .update({ internal_notes: str(notes, 4000) })
    .eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  await a.audit("quote.notes", { entity: "quote_requests", ids: [Number(id)] });
  return { ok: true };
}

// Who looks after a request (a typed label; the panel login is shared, so it is not an identity).
export async function assignQuote(id, assignee) {
  const a = await authed("quotes.assign");
  if (!a.ok) return a;
  return assignQuoteGuarded({ getSession, getAdminClient, table: "quote_requests", id, assignee, audit: makeAudit("health", getSession, getAdminClient), resolveUser: userResolver("health") });
}

// The day somebody promised to follow up (a date, not a time); empty clears it.
export async function setQuoteFollowUp(id, date) {
  const a = await authed("quotes.status");
  if (!a.ok) return a;
  return followUp.setFollowUp({ admin: a.admin, table: "quote_requests", kind: "health", audit: makeAudit("health", getSession, getAdminClient) }, id, date);
}

// Send the Telegram notice of a request again (only when the first one failed).
export async function retryQuoteNotice(id) {
  const a = await authed("quotes.status");
  if (!a.ok) return a;
  return followUp.retryNotice({ admin: a.admin, table: "quote_requests", kind: "health", audit: makeAudit("health", getSession, getAdminClient) }, id);
}

// CSV of the customer requests of the last 7 / 30 / 90 days. Customer data: behind its own permission.
export async function exportQuotesCsv(days) {
  const a = await authed("quotes.export");
  if (!a.ok) return a;
  return followUp.exportQuotes({ admin: a.admin, table: "quote_requests", kind: "health", audit: makeAudit("health", getSession, getAdminClient) }, { days });
}

// Hard delete of one customer request. The shared helper checks the session
// first; this panel passes its own session check and its own table only.
export async function deleteQuote(id) {
  const a = await authed("quotes.delete");
  if (!a.ok) return a;
  return deleteQuoteGuarded({ getSession, getAdminClient, table: "quote_requests", id, audit: makeAudit("health", getSession, getAdminClient) });
}

// Bulk actions from the tick-selection: same guard order, same own-table-only rule.
export async function deleteQuotes(ids) {
  const a = await authed("quotes.delete");
  if (!a.ok) return a;
  return deleteQuotesGuarded({ getSession, getAdminClient, table: "quote_requests", ids, audit: makeAudit("health", getSession, getAdminClient) });
}

export async function updateQuotesStatus(ids, status) {
  const a = await authed("quotes.status");
  if (!a.ok) return a;
  return setQuotesStatusGuarded({ getSession, getAdminClient, table: "quote_requests", ids, status, audit: makeAudit("health", getSession, getAdminClient) });
}

// ── Image upload (server-side; service role) ──────────────────────────────────
export async function uploadProductImage(formData) {
  const a = await authed("media.upload");
  if (!a.ok) return a;
  const file = formData?.get?.("file");
  if (!file || typeof file === "string") return { ok: false, error: tr("فایلی انتخاب نشده است.") };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: tr("حجم تصویر بیش از ۵ مگابایت است.") };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return { ok: false, error: tr("فقط تصویر JPG/PNG/WEBP/AVIF مجاز است.") };
  // Authoritative check: sniff the real magic bytes and derive the stored
  // Content-Type from them — never trust the client-declared file.type, which
  // could label a non-image (e.g. HTML) as an image in a public bucket.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffImageType(head);
  if (!sniffed) return { ok: false, error: tr("محتوای فایل یک تصویر معتبر نیست.") };
  const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
  const { error } = await a.admin.storage
    .from("product-images")
    .upload(path, file, { contentType: sniffed, upsert: false });
  if (error) {
    const msg = /bucket/i.test(String(error.message)) ? tr("باکت product-images وجود ندارد. مایگریشن ۰۶ را اجرا کنید.") : tr("آپلود ناموفق بود.");
    return { ok: false, error: msg };
  }
  const { data } = a.admin.storage.from("product-images").getPublicUrl(path);
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
  const refused = await gate(session, "health", "products.content");
  if (refused) return refused;

  return translateProductFieldsWithCloudflare(input);
}

