// lib/beauty/operator/importEngine.js — SERVER ONLY
// Executes product batches (bulk add + Excel/CSV import) for the BEAUTY
// catalog. Identical flow to lib/operator/importEngine.js — the planning core
// (lib/operator/importCore.js) is pure and shared verbatim — only the target
// tables differ: beauty_products / beauty_categories / beauty_import_logs.
import "server-only";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import {
  normalizeRow, planBatch, summarizePlans, MAX_ROWS_PER_CALL, MAX_NEW_CATEGORIES,
} from "@/lib/operator/importCore";

// Friendly error text for per-row write failures.
function friendlyRowError(error) {
  const msg = String(error?.message || error || "");
  if (/beauty_products_sku_unique_idx/i.test(msg) || (error?.code === "23505" && /sku/i.test(msg)))
    return "این کد محصول (SKU) همین حالا توسط ردیف/محصول دیگری ثبت شد.";
  if (/beauty_products_slug_unique_idx/i.test(msg) || (error?.code === "23505" && /slug/i.test(msg)))
    return "این اسلاگ همین حالا گرفته شد.";
  if (error?.code === "23505" || /duplicate key/i.test(msg)) return "مقدار تکراری است (slug یا SKU).";
  if (error?.code === "42P01" || /relation .* does not exist/i.test(msg))
    return "جدول‌های Beauty وجود ندارند — مایگریشن ۱۰ را اجرا کنید.";
  if (error?.code === "42703" || error?.code === "PGRST204" || /column .* does not exist/i.test(msg))
    return "ستون موردنیاز وجود ندارد — مایگریشن ۱۰ را اجرا کنید.";
  if (error?.code === "23514") return "مقدار خلاف قید پایگاه داده است.";
  return "ذخیره ناموفق بود.";
}

// Load existing (id, sku, slug) for matching + slug suffixing, and categories.
async function loadContext(admin) {
  const [prodRes, catRes] = await Promise.all([
    admin.from("beauty_products").select("id,sku,slug"),
    admin.from("beauty_categories").select("id,slug,is_active"),
  ]);
  if (prodRes.error) throw new Error("READ_PRODUCTS_FAILED");
  if (catRes.error) throw new Error("READ_CATEGORIES_FAILED");

  const existingBySku = new Map();
  const existingBySlug = new Map();
  const takenSlugs = new Set();
  for (const p of prodRes.data || []) {
    if (p.sku) existingBySku.set(String(p.sku).toLowerCase(), { id: p.id, slug: p.slug });
    if (p.slug) { existingBySlug.set(p.slug, { id: p.id }); takenSlugs.add(p.slug); }
  }
  const categoriesBySlug = new Map();
  for (const c of catRes.data || []) {
    if (c.slug) categoriesBySlug.set(String(c.slug).toLowerCase(), { id: c.id, slug: c.slug });
  }
  return { existingBySku, existingBySlug, takenSlugs, categoriesBySlug };
}

// Main entry. rawRows: array of plain objects keyed by IMPORT_COLUMN_KEYS.
// options: { mode, dryRun, autoCreateCategories, strict, startRow }
export async function processProductBatch(rawRows, options = {}) {
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: "کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY)." };

  const rows = Array.isArray(rawRows) ? rawRows.slice(0, MAX_ROWS_PER_CALL) : [];
  if (!rows.length) return { ok: false, error: "ردیفی ارسال نشده است." };

  const startRow = Number.isFinite(options.startRow) ? options.startRow : 1;
  const normRows = rows.map((r, i) => normalizeRow(r && typeof r === "object" ? r : {}, startRow + i));

  let ctx;
  try {
    ctx = await loadContext(admin);
  } catch {
    return { ok: false, error: "خواندن داده‌های موجود از پایگاه داده ناموفق بود (مایگریشن ۱۰ اجرا شده؟)." };
  }

  const { plans, categoriesToCreate } = planBatch(normRows, {
    mode: options.mode,
    autoCreateCategories: !!options.autoCreateCategories,
    ...ctx,
  });

  // Guardrail: cap how many categories one import can auto-create, so a crafted
  // file can't flood the catalog with hundreds of junk categories.
  if (categoriesToCreate.length > MAX_NEW_CATEGORIES) {
    return {
      ok: false,
      error: `این فایل ${categoriesToCreate.length} دستهٔ جدید می‌سازد (حداکثر ${MAX_NEW_CATEGORIES}). دسته‌ها را دستی بسازید یا فایل را کوچک‌تر کنید.`,
    };
  }

  // Strict mode: any planning error aborts the whole batch before any write.
  if (options.strict && plans.some((p) => p.action === "error")) {
    return {
      ok: true, dryRun: true, aborted: true,
      results: serializePlans(plans),
      counts: summarizePlans(plans),
      createdCategories: [],
      error: "حالت سخت‌گیرانه: به‌خاطر وجود ردیف خطادار هیچ ردیفی ذخیره نشد.",
    };
  }

  if (options.dryRun) {
    return {
      ok: true, dryRun: true,
      results: serializePlans(plans),
      counts: summarizePlans(plans),
      createdCategories: categoriesToCreate.map((c) => c.slug),
    };
  }

  // ── commit ──────────────────────────────────────────────────────────────────
  // 1) auto-create missing categories first (so rows can reference their ids).
  //    Auto-created categories land world-less; assign a world later in the
  //    categories page so they appear inside the right public world.
  const createdCategories = [];
  const catIdBySlug = new Map();
  for (const cat of categoriesToCreate) {
    const { data, error } = await admin
      .from("beauty_categories")
      .insert({ slug: cat.slug, name_en: cat.name_en, is_active: true, sort_order: 99 })
      .select("id,slug")
      .single();
    if (error) {
      // Race / re-run: it may exist now — fetch it instead of failing rows.
      const { data: ex } = await admin.from("beauty_categories").select("id,slug").eq("slug", cat.slug).single();
      if (ex) catIdBySlug.set(cat.slug, ex.id);
    } else {
      catIdBySlug.set(data.slug, data.id);
      createdCategories.push(data.slug);
    }
  }

  // 2) execute row plans sequentially (chunk sizes keep this Hobby-safe)
  const results = [];
  for (const plan of plans) {
    const base = { rowNum: plan.rowNum, messages: [...plan.messages], warnings: [...plan.warnings] };
    if (plan.action === "error" || plan.action === "skip") {
      results.push({ ...base, status: plan.action });
      continue;
    }

    const write = { ...plan.write };
    if (write.category && write.category_id == null) {
      const id = catIdBySlug.get(write.category) ?? ctx.categoriesBySlug.get(write.category)?.id ?? null;
      if (id == null) {
        results.push({ ...base, status: "error", messages: [...base.messages, `ساخت دسته «${write.category}» ناموفق بود.`] });
        continue;
      }
      write.category_id = id;
    }

    if (plan.action === "create") {
      const { data, error } = await admin.from("beauty_products").insert(write).select("id,slug").single();
      if (error) results.push({ ...base, status: "error", messages: [...base.messages, friendlyRowError(error)] });
      else results.push({ ...base, status: "create", id: data?.id, slug: data?.slug });
    } else {
      const { error } = await admin.from("beauty_products").update(write).eq("id", plan.id);
      if (error) results.push({ ...base, status: "error", messages: [...base.messages, friendlyRowError(error)] });
      else results.push({ ...base, status: "update", id: plan.id });
    }
  }

  const counts = { total: results.length, create: 0, update: 0, skip: 0, error: 0, warnings: 0 };
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    if (r.warnings?.length) counts.warnings += 1;
  }

  return { ok: true, dryRun: false, results, counts, createdCategories };
}

function serializePlans(plans) {
  return plans.map((p) => ({
    rowNum: p.rowNum,
    status: p.action,
    id: p.id,
    slug: p.slug,
    messages: p.messages,
    warnings: p.warnings,
  }));
}

// Best-effort import history. Missing table → no-op.
export async function recordImportLog(entry) {
  const admin = getAdminClient();
  if (!admin) return;
  try {
    await admin.from("beauty_import_logs").insert({
      source: entry.source || "csv",
      file_name: entry.fileName || null,
      mode: entry.mode || null,
      total_rows: entry.total || 0,
      created_count: entry.create || 0,
      updated_count: entry.update || 0,
      skipped_count: entry.skip || 0,
      error_count: entry.error || 0,
      categories_created: entry.categoriesCreated || 0,
      summary: entry.summary ? String(entry.summary).slice(0, 2000) : null,
    });
  } catch { /* table may not exist yet — history is optional */ }
}

export async function getImportLogs(limit = 10) {
  const admin = getAdminClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("beauty_import_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return []; // table missing → feature hidden
  return data || [];
}
