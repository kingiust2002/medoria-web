"use server";
// lib/beauty/operator/importActions.js — server actions for the Beauty
// panel's bulk add / Excel-CSV import / CSV export. Every action verifies
// the BEAUTY operator session first; writes use the beauty import engine
// (service role, beauty_* tables only).
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/beauty/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { processProductBatch, recordImportLog } from "@/lib/beauty/operator/importEngine";
import { IMPORT_COLUMNS, MAX_ROWS_PER_CALL, MAX_ROWS_PER_FILE } from "@/lib/operator/importCore";
import { toCsv } from "@/lib/operator/csv";
import { LOCALES } from "@/lib/i18n";

const NO_SESSION = { ok: false, error: "نشست معتبر نیست. دوباره وارد شوید." };
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB — generous for a 500-row workbook

// Parse an uploaded .xlsx/.xls workbook on the SERVER and hand back plain rows
// ({ headers, rows }) — identical shape to the CSV reader — so both file types
// flow into the same dry-run/commit pipeline. SheetJS never reaches the client;
// the file is read in memory and discarded (never stored). Beauty-session gated.
export async function parseSpreadsheet(formData) {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const file = formData?.get?.("file");
  if (!file || typeof file.arrayBuffer !== "function")
    return { ok: false, error: "فایلی دریافت نشد." };
  if (file.size > MAX_UPLOAD_BYTES)
    return { ok: false, error: "حجم فایل بیش از حد است (حداکثر ۸ مگابایت)." };
  const { parseWorkbookBuffer } = await import("@/lib/operator/spreadsheetServer");
  const buf = await file.arrayBuffer();
  return parseWorkbookBuffer(buf, { maxRows: MAX_ROWS_PER_FILE });
}

function revalidatePublic() {
  try {
    for (const l of LOCALES) {
      revalidatePath(`/beauty/${l}`);
      revalidatePath(`/beauty/${l}/catalog`);
      revalidatePath(`/beauty/${l}/worlds`);
    }
    revalidatePath("/beauty/[lang]/catalog/[slug]", "page");
  } catch { /* dynamic routes — no-op */ }
}

function sanitizeOptions(options) {
  return {
    mode: ["add", "update", "upsert"].includes(options?.mode) ? options.mode : "add",
    autoCreateCategories: !!options?.autoCreateCategories,
    strict: !!options?.strict,
    startRow: Number.isFinite(Number(options?.startRow)) ? Number(options.startRow) : 1,
  };
}

// Dry-run: validate + plan, write nothing.
export async function dryRunProductRows(rows, options) {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_CALL)
    return { ok: false, error: `حداکثر ${MAX_ROWS_PER_CALL} ردیف در هر درخواست.` };
  return processProductBatch(rows, { ...sanitizeOptions(options), dryRun: true });
}

// Commit: server re-validates and re-plans from the raw rows.
export async function commitProductRows(rows, options) {
  const session = await getSession();
  if (!session) return NO_SESSION;
  if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_CALL)
    return { ok: false, error: `حداکثر ${MAX_ROWS_PER_CALL} ردیف در هر درخواست.` };
  return processProductBatch(rows, { ...sanitizeOptions(options), dryRun: false });
}

// Called once after the last commit chunk: refresh public pages + write history.
export async function finalizeProductBatch(log = {}) {
  const session = await getSession();
  if (!session) return NO_SESSION;
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
  return { ok: true };
}

// Lightweight duplicate pre-check for the bulk grid (warning only — the DB
// unique index is the real backstop).
export async function checkSkusExist(skus) {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const list = (Array.isArray(skus) ? skus : [])
    .map((s) => String(s || "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 100);
  if (!list.length) return { ok: true, existing: [] };
  const admin = getAdminClient();
  if (!admin) return { ok: true, existing: [] };
  const { data } = await admin.from("beauty_products").select("sku").not("sku", "is", null);
  const have = new Set((data || []).map((p) => String(p.sku).toLowerCase()));
  return { ok: true, existing: list.filter((s) => have.has(s)) };
}

// Export the whole Beauty catalog as an Excel-compatible CSV (template columns).
export async function exportProductsCsv() {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: "کلید سرویس Supabase تنظیم نشده است." };
  const { data, error } = await admin.from("beauty_products").select("*").order("id", { ascending: true });
  if (error) return { ok: false, error: "خواندن محصولات ناموفق بود." };

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
