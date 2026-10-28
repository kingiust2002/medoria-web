// lib/operator/importSubmit.js — filing an import for approval (N12). A person whose policy says "needs approval" for products.import can read the
// file, see the dry-run and the template as usual; only the WRITE is different: instead of committing chunk by chunk, the validated file travels as ONE
// request, and the rows are planned and written when somebody approves it (lib/operator/importApproved.js). Plain module (the engine is passed in).
import { IMPORT_COLUMN_KEYS, MAX_ROWS_PER_CALL, MAX_ROWS_PER_FILE, IMPORT_MODES } from "./importCore.js";
import { tr } from "../panel/i18n.js";

export const IMPORT_SUBMIT_MESSAGES = {
  direct: tr("ورود مستقیم برای شما مجاز است؛ از دکمهٔ ورود استفاده کنید."),
  noRows: tr("ردیفی برای ارسال نیست."),
  tooMany: tr("حداکثر {max} ردیف در هر فایل."),
  nothing: tr("هیچ ردیفی برای ساخت یا بروزرسانی نیست؛ چیزی برای تأیید ارسال نشد."),
  strict: tr("حالت سخت‌گیرانه: اول خطاها را رفع کنید."),
  tooBig: tr("حجم داده‌ها برای یک درخواست بیش از حد است."),
};
const MAX_BYTES = 1_500_000;

// Only the template's own columns, as plain bounded text (the same things the engine's own normalisation would keep).
export function cleanImportRows(rows) {
  if (!Array.isArray(rows)) return null;
  return rows.map((r) => {
    const out = {};
    for (const k of IMPORT_COLUMN_KEYS) {
      const v = r && typeof r === "object" ? r[k] : undefined;
      if (v === undefined || v === null || v === "") continue;
      out[k] = String(v).slice(0, 5000);
    }
    return out;
  });
}

// a = the action context ({ needsApproval, file }); engine = { processProductBatch }. → the object the action returns to the screen
export async function submitImport(a, { rows, options = {}, fileName = null }, engine) {
  if (!a.needsApproval) return { ok: false, error: IMPORT_SUBMIT_MESSAGES.direct };
  const clean = cleanImportRows(rows);
  if (!clean || !clean.length) return { ok: false, error: IMPORT_SUBMIT_MESSAGES.noRows };
  if (clean.length > MAX_ROWS_PER_FILE) return { ok: false, error: IMPORT_SUBMIT_MESSAGES.tooMany.replace("{max}", String(MAX_ROWS_PER_FILE)) };
  const opts = {
    mode: IMPORT_MODES.includes(options?.mode) ? options.mode : "add", autoCreateCategories: !!options?.autoCreateCategories,
    autoTranslate: !!options?.autoTranslate, strict: !!options?.strict,
  };
  if (JSON.stringify({ clean, opts }).length > MAX_BYTES) return { ok: false, error: IMPORT_SUBMIT_MESSAGES.tooBig };
  // the dry run, now, on the server: it writes nothing, and says what the file would do today
  const counts = { total: 0, create: 0, update: 0, skip: 0, error: 0 };
  for (let i = 0; i < clean.length; i += MAX_ROWS_PER_CALL) {
    const res = await engine.processProductBatch(clean.slice(i, i + MAX_ROWS_PER_CALL), { ...opts, dryRun: true, startRow: 1 });
    if (!res?.ok) return { ok: false, error: res?.error || IMPORT_SUBMIT_MESSAGES.nothing };
    for (const k of Object.keys(counts)) counts[k] += Number(res.counts?.[k]) || 0;
  }
  if (counts.create + counts.update === 0) return { ok: false, error: IMPORT_SUBMIT_MESSAGES.nothing };
  if (opts.strict && counts.error > 0) return { ok: false, error: IMPORT_SUBMIT_MESSAGES.strict };
  const name = typeof fileName === "string" ? fileName.replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 120) : null;
  return a.file({
    operation: "products.import", ops: ["products.import"], entity: "products", subject: `import · ${name || "csv"} · ${clean.length}`,
    before: { counts, fileName: name, mode: opts.mode },
    proposed: { rows: clean, options: opts, fileName: name },
  });
}
