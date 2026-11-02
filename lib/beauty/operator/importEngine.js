// lib/beauty/operator/importEngine.js — SERVER ONLY
// Executes product batches (bulk add + Excel/CSV import) for the BEAUTY catalogue against Supabase. The work itself — planning, the check of every
// operation the rows really need, the per-row version basis, the history, the marks on generated translations — is the shared plain module
// lib/operator/importRun.js (unit-tested); this file only supplies the server-only pieces (the service client, the translator, the import history table).
// Never imported by client code — actions in importActions.js wrap it.
import "server-only";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { fillTranslationsForWrites } from "@/lib/operator/importTranslate";
import { runProductBatch } from "@/lib/operator/importRun";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { tr } from "../../panel/i18n.js";

// Main entry. rawRows: array of plain objects keyed by IMPORT_COLUMN_KEYS.
// options: { mode, dryRun, autoCreateCategories, autoTranslate, strict, startRow, authorize, bases, recordAs } (see importRun.js)
// Returns { ok, results, counts, createdCategories, authorization } or { ok:false, error, needsApproval?, denied? }.
export async function processProductBatch(rawRows, options = {}) {
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  return runProductBatch({ admin, house: "beauty", rawRows, options, translate: fillTranslationsForWrites });
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
  await requireBeautySession("products.create");
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
