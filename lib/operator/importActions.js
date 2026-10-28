"use server";
// lib/operator/importActions.js — server actions for bulk add / Excel-CSV
// import / category maintenance / CSV export. Every action verifies the
// operator session first; writes use the server-only engine + service role.
import { gate } from "@/lib/operator/gate";
import { getSession } from "@/lib/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { auditEvent } from "@/lib/operator/audit";
import { buildActionCtx } from "@/lib/operator/actionCtx";
import { categoryDeleteFlow } from "@/lib/operator/destructiveFlow";
import { processProductBatch, recordImportLog } from "@/lib/operator/importEngine";
import { IMPORT_COLUMNS, MAX_ROWS_PER_CALL, MAX_ROWS_PER_FILE } from "@/lib/operator/importCore";
import { toCsv } from "@/lib/operator/csv";
import { revalidateHealthPublic } from "@/lib/health/revalidate";
import { readAll } from "@/lib/operator/listQuery";
import { tr } from "../panel/i18n.js";

const NO_SESSION = { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB — generous for a 500-row workbook

// Parse an uploaded .xlsx/.xls workbook on the SERVER and hand back plain rows
// ({ headers, rows }) — identical shape to the CSV reader — so both file types
// flow into the same dry-run/commit pipeline. SheetJS never reaches the client;
// the file is read in memory and discarded (never stored).
export async function parseSpreadsheet(formData) {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const refused = await gate(session, "health", "products.import");
  if (refused) return refused;
  const file = formData?.get?.("file");
  if (!file || typeof file.arrayBuffer !== "function")
    return { ok: false, error: tr("فایلی دریافت نشد.") };
  if (file.size > MAX_UPLOAD_BYTES)
    return { ok: false, error: tr("حجم فایل بیش از حد است (حداکثر ۸ مگابایت).") };
  const { parseWorkbookBuffer } = await import("@/lib/operator/spreadsheetServer");
  const buf = await file.arrayBuffer();
  return parseWorkbookBuffer(buf, { maxRows: MAX_ROWS_PER_FILE });
}

// Imports touch many products at once: refresh every Health public route that
// shows catalog data (see lib/health/revalidateTargets.js).
function revalidatePublic() {
  revalidateHealthPublic();
}

function sanitizeOptions(options) {
  return {
    mode: ["add", "update", "upsert"].includes(options?.mode) ? options.mode : "add",
    autoCreateCategories: !!options?.autoCreateCategories,
    autoTranslate: !!options?.autoTranslate,
    strict: !!options?.strict,
    startRow: Number.isFinite(Number(options?.startRow)) ? Number(options.startRow) : 1,
  };
}

// Build the colour-coded .xlsx template on the server (ExcelJS is server-only).
// Returns { ok, base64, filename } — the wizard turns it into a download.
export async function downloadTemplateXlsx() {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const refused = await gate(session, "health", "products.import");
  if (refused) return refused;
  const { buildTemplateWorkbook } = await import("@/lib/operator/templateWorkbook");
  const { base64, filename } = await buildTemplateWorkbook({ brand: "Medoria" });
  return { ok: true, base64, filename };
}

// Dry-run: validate + plan, write nothing. rows ≤ MAX_ROWS_PER_CALL per call;
// the client chunks larger files and merges results.
export async function dryRunProductRows(rows, options) {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const refused = await gate(session, "health", "products.import");
  if (refused) return refused;
  if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_CALL)
    return { ok: false, error: tr("حداکثر {max} ردیف در هر درخواست.", { max: MAX_ROWS_PER_CALL }) };
  return processProductBatch(rows, { ...sanitizeOptions(options), dryRun: true });
}

// Commit: server re-validates and re-plans from the raw rows — the preview the
// operator saw is never trusted as-is.
export async function commitProductRows(rows, options) {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const refused = await gate(session, "health", "products.import");
  if (refused) return refused;
  if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_CALL)
    return { ok: false, error: tr("حداکثر {max} ردیف در هر درخواست.", { max: MAX_ROWS_PER_CALL }) };
  return processProductBatch(rows, { ...sanitizeOptions(options), dryRun: false });
}

// Called once after the last commit chunk: refresh public pages + write history.
export async function finalizeProductBatch(log = {}) {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const refused = await gate(session, "health", "products.import");
  if (refused) return refused;
  revalidatePublic();
  await recordImportLog({
    source: typeof log.source === "string" ? log.source.slice(0, 20) : "csv",
    fileName: typeof log.fileName === "string" ? log.fileName.slice(0, 200) : null,
    mode: typeof log.mode === "string" ? log.mode.slice(0, 20) : null,
    total: Number(log.total) || 0,
    create: Number(log.create) || 0,
    update: Number(log.update) || 0,
    skip: Number(log.skip) || 0,
    error: Number(log.error) || 0,
    categoriesCreated: Number(log.categoriesCreated) || 0,
    summary: typeof log.summary === "string" ? log.summary : null,
  });
  await auditEvent({ admin: getAdminClient(), panel: "health", session, action: "product.import", entity: "products",
    detail: { format: typeof log.source === "string" ? log.source.slice(0, 20) : "csv", rows: Number(log.total) || 0, created: Number(log.create) || 0, updated: Number(log.update) || 0, skipped: Number(log.skip) || 0 } });
  return { ok: true };
}

// Lightweight duplicate pre-check for the bulk grid (warning only — the DB
// unique index is the real backstop).
export async function checkSkusExist(skus) {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const refused = await gate(session, "health", "products.import");
  if (refused) return refused;
  const list = (Array.isArray(skus) ? skus : [])
    .map((s) => String(s || "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 100);
  if (!list.length) return { ok: true, existing: [] };
  const admin = getAdminClient();
  if (!admin) return { ok: true, existing: [] };
  // every SKU of the house (read in chunks: a plain select stops at the API's 1,000 rows, so a duplicate beyond them would not be seen)
  const all = await readAll((from, to) => admin.from("products").select("sku").not("sku", "is", null).order("id", { ascending: true }).range(from, to));
  if (!all.ok) return { ok: false, error: tr("خواندن محصولات ناموفق بود.") };
  const have = new Set(all.rows.map((p) => String(p.sku).toLowerCase()));
  return { ok: true, existing: list.filter((s) => have.has(s)) };
}

// Export the whole catalog as an Excel-compatible CSV (template columns).
export async function exportProductsCsv() {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const refused = await gate(session, "health", "products.export");
  if (refused) return refused;
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است.") };
  // the WHOLE catalogue, in chunks: a plain select stops at the API's 1,000 rows and the file would silently miss products
  const got = await readAll((from, to) => admin.from("products").select("*").order("id", { ascending: true }).range(from, to));
  if (!got.ok) return { ok: false, error: tr("خواندن محصولات ناموفق بود.") };
  const data = got.rows;

  const yn = (b) => (b ? "yes" : "no");
  const rows = (data || []).map((p) => ({
    name_fa: p.name_fa || "", name_en: p.name_en || "",
    sku: p.sku || "", category_slug: p.category || "", brand: p.brand || "",
    price: p.price != null ? String(p.price) : "",
    price_on_request: yn(p.price == null),
    unit: p.unit || "", min_order_qty: p.min_order_qty != null ? String(p.min_order_qty) : "",
    in_stock: yn(p.in_stock), is_active: yn(p.is_active !== false), is_featured: yn(!!p.is_featured),
    badge: p.badge || "", image_url: p.image_url || "", slug: p.slug || "",
    name_ru: p.name_ru || "", name_tg: p.name_tg || "",
    description_fa: p.description_fa || "", description_en: p.description_en || "",
    description_ru: p.description_ru || "", description_tg: p.description_tg || "",
    tags: Array.isArray(p.tags) ? p.tags.join("|") : "",
    gallery_urls: Array.isArray(p.gallery_urls) ? p.gallery_urls.join("|") : "",
    specs: p.specs && typeof p.specs === "object"
      ? Object.entries(p.specs).map(([k, v]) => `${k}:${v ?? ""}`).join("|") : "",
    seo_title: p.seo_title || "", seo_description: p.seo_description || "",
    brochure_url: p.brochure_url || "",
  }));
  const headers = IMPORT_COLUMNS.map((c) => c.key);
  return { ok: true, csv: toCsv(headers, rows), count: rows.length };
}

// Safe category delete: refuses while products are attached unless a target
// category is given; then moves products (both category_id AND legacy slug)
// and deletes. Never deletes products.
export async function deleteCategorySafe(id, moveToId) {
  const a = await buildActionCtx({ panel: "health", getSession, operation: "categories.delete", approvable: true });
  if (!a.ok) return a;
  return categoryDeleteFlow({ a, house: "health", id, moveToId, revalidate: revalidateHealthPublic });
}
