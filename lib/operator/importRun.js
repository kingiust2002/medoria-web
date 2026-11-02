// lib/operator/importRun.js — the work of ONE import / bulk-add batch against the catalogue of a house, shared by both houses' engines (importEngine.js).
// Plain module: the database client and the translator are passed in, so the same code is unit-tested against a real database function set.
//
// What it guarantees (independent review 2026-10-29, R5 R6 R7):
//   R5  nothing is written unless `options.authorize(ops)` says so. `ops` is the UNION of what the planned rows really change — products.create for a new
//       row, products.content for an edit, products.price / products.publish / products.archive / products.stock_flag when the stored value really changes,
//       categories.create for an automatic category. The import operation alone never authorises a price or a publication. No `authorize` = refusal (fail closed).
//   R6  an update is written only against the version it was planned on (updated_at, microsecond exact); a row changed meanwhile — or since the reviewer saw it
//       (options.bases) — is reported as an error and NOT overwritten. Every changed product gets a history entry (before / after, who, which request).
//   R7  a text filled in by the automatic translator is marked "auto" in translation_meta; a text typed in the file replaces an "auto" mark; the translator
//       never overwrites a text that is already there.
import { normalizeRow, planBatch, summarizePlans, MAX_ROWS_PER_CALL, MAX_NEW_CATEGORIES } from "./importCore.js";
import { readAll } from "./listQuery.js";
import { applyRulesToPlans } from "./publishGate.js";
import { productOps, diffRow } from "./approvalExecutors.js";
import { recordVersion } from "./productVersions.js";
import { cleanTranslationMeta, sameTranslationMeta, META_FIELDS } from "./translationMeta.js";
import { tr } from "../panel/i18n.js";

const friendlyBase = (error, { sku, slug, columns, missingTable }) => {
  const msg = String(error?.message || error || "");
  if (sku.test(msg) || (error?.code === "23505" && /sku/i.test(msg))) return tr("این کد محصول (SKU) همین حالا توسط ردیف/محصول دیگری ثبت شد.");
  if (slug.test(msg) || (error?.code === "23505" && /slug/i.test(msg))) return tr("این اسلاگ همین حالا گرفته شد.");
  if (error?.code === "23505" || /duplicate key/i.test(msg)) return tr("مقدار تکراری است (slug یا SKU).");
  if (missingTable && (error?.code === "42P01" || /relation .* does not exist/i.test(msg))) return tr("جدول‌های Beauty وجود ندارند — مایگریشن ۱۰ را اجرا کنید.");
  if (error?.code === "42703" || error?.code === "PGRST204" || /column .* does not exist/i.test(msg)) return columns;
  if (error?.code === "23514") return tr("مقدار خلاف قید پایگاه داده است.");
  return tr("ذخیره ناموفق بود.");
};

export const IMPORT_HOUSES = {
  health: {
    table: "products", categories: "categories", readFailed: () => tr("خواندن داده‌های موجود از پایگاه داده ناموفق بود."),
    friendly: (e) => friendlyBase(e, { sku: /products_sku_unique_idx/i, slug: /products_slug_unique_idx/i, columns: tr("ستون موردنیاز وجود ندارد — مایگریشن‌های ۰۴ تا ۰۷ را اجرا کنید."), missingTable: false }),
  },
  beauty: {
    table: "beauty_products", categories: "beauty_categories", readFailed: () => tr("خواندن داده‌های موجود از پایگاه داده ناموفق بود (مایگریشن ۱۰ اجرا شده؟)."),
    friendly: (e) => friendlyBase(e, { sku: /beauty_products_sku_unique_idx/i, slug: /beauty_products_slug_unique_idx/i, columns: tr("ستون موردنیاز وجود ندارد — مایگریشن ۱۰ را اجرا کنید."), missingTable: true }),
  },
};

export const IMPORT_RUN_MESSAGES = {
  noAuthorizer: tr("بررسی دسترسی انجام نشد؛ چیزی نوشته نشد."),
  needsApproval: tr("این فایل تغییری دارد که برای شما نیازمند تأیید است (مثلاً قیمت یا انتشار)؛ آن را برای تأیید ارسال کنید. چیزی نوشته نشد."),
  denied: tr("این فایل تغییری دارد که اجازهٔ آن را ندارید (قیمت، انتشار، ساخت دسته…)؛ چیزی نوشته نشد."),
  stale: tr("این محصول پس از بررسی تغییر کرده است؛ ردیف نوشته نشد تا تغییر دیگران از بین نرود."),
  gone: tr("این محصول دیگر وجود ندارد؛ ردیف نوشته نشد."),
};

const CHUNK = 200;

// → { ok: true, map } | { ok: false }  — the stored rows of the updates (a plain select stops at the API's row limit, so in chunks)
async function loadStored(admin, table, ids) {
  const map = new Map();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await admin.from(table).select("*").in("id", ids.slice(i, i + CHUNK));
    if (error) return { ok: false };
    for (const r of data || []) map.set(r.id, r);
  }
  return { ok: true, map };
}

// The operations ONE planned row needs — the same names, and the same rule, as the single-product screens use (updateProduct / createProduct).
export function opsOfPlan(plan, before) {
  if (plan.action === "create") {
    const w = plan.write || {};
    const ops = ["products.create"];
    if (w.is_active === true || w.publish_at) ops.push("products.publish");
    if (w.unpublish_at) ops.push("products.archive");
    return ops;
  }
  if (plan.action !== "update") return [];
  const write = plan.write || {};
  const { changed } = diffRow(before || {}, write);
  if (!Object.keys(changed).length) return [];               // nothing really changes: nothing to ask for
  return ["products.content", ...productOps(before, write)];
}

// The union over a whole batch (+ the automatic categories). Sorted, no repeats.
export function opsOfBatch(plans, storedMap, categoriesToCreate = []) {
  const set = new Set();
  for (const p of plans) for (const op of opsOfPlan(p, storedMap.get(p.id))) set.add(op);
  if (categoriesToCreate.length) set.add("categories.create");
  return [...set].sort();
}

// a text typed in the file replaces an automatic one: its mark goes. Returns the new meta, or undefined when nothing changes.
export function reconcileMeta(before, write) {
  const old = cleanTranslationMeta(before?.translation_meta);
  const next = { ...old };
  for (const k of META_FIELDS) if (k in write && next[k] === "auto" && String(write[k] ?? "").trim() !== String(before?.[k] ?? "").trim()) delete next[k];
  const clean = cleanTranslationMeta(next);
  return sameTranslationMeta(old, clean) ? undefined : clean;
}

const isMissingColumn = (e) => e && (e.code === "42703" || e.code === "PGRST204" || /column .*translation_meta/i.test(String(e.message || "")));

// Main entry. rawRows: plain objects keyed by IMPORT_COLUMN_KEYS.
// options: { mode, dryRun, autoCreateCategories, autoTranslate, strict, startRow,
//            authorize(ops) → { ok } | { ok:false, kind:"approval"|"denied", ops },      required to write anything
//            bases: { [productId]: updated_at }   the versions a reviewer saw (an approved import)
//            recordAs: { userId, label, requestId, kind }   who the history names }
// → { ok, dryRun, results, counts, createdCategories, authorization, bases } | { ok: false, error, needsApproval?, denied?, ops? }
export async function runProductBatch({ admin, house, rawRows, options = {}, translate = null }) {
  const cfg = IMPORT_HOUSES[house];
  if (!cfg || !admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  const rows = Array.isArray(rawRows) ? rawRows.slice(0, MAX_ROWS_PER_CALL) : [];
  if (!rows.length) return { ok: false, error: tr("ردیفی ارسال نشده است.") };
  if (!options.dryRun && typeof options.authorize !== "function") return { ok: false, error: IMPORT_RUN_MESSAGES.noAuthorizer };        // fail closed: no caller can forget the check

  const startRow = Number.isFinite(options.startRow) ? options.startRow : 1;
  const normRows = rows.map((r, i) => normalizeRow(r && typeof r === "object" ? r : {}, startRow + i));

  let ctx;
  try { ctx = await loadContext(admin, cfg); } catch { return { ok: false, error: cfg.readFailed() }; }

  const { plans, categoriesToCreate } = planBatch(normRows, { mode: options.mode, autoCreateCategories: !!options.autoCreateCategories, ...ctx });
  // Guardrail: cap how many categories one import can auto-create, so a crafted file can't flood the catalog with junk categories.
  if (categoriesToCreate.length > MAX_NEW_CATEGORIES) {
    return { ok: false, error: tr("این فایل {count} دستهٔ جدید می‌سازد (حداکثر {max}). دسته‌ها را دستی بسازید یا فایل را کوچک‌تر کنید.", { count: categoriesToCreate.length, max: MAX_NEW_CATEGORIES }) };
  }
  // The publish rule (N6): a row that would go live but is incomplete is saved as an inactive draft, and its result says what is missing.
  await applyRulesToPlans({ admin, house, table: cfg.table, plans });

  if (options.strict && plans.some((p) => p.action === "error")) {
    return { ok: true, dryRun: true, aborted: true, results: serializePlans(plans), counts: summarizePlans(plans), createdCategories: [], error: tr("حالت سخت‌گیرانه: به‌خاطر وجود ردیف خطادار هیچ ردیفی ذخیره نشد.") };
  }

  // what the rows really change → the operations the person must hold (judged on the writes AFTER the publish rule has downgraded what it must)
  const updateIds = plans.filter((p) => p.action === "update").map((p) => p.id);
  const stored = await loadStored(admin, cfg.table, updateIds);
  if (!stored.ok) return { ok: false, error: cfg.readFailed() };
  const ops = opsOfBatch(plans, stored.map, categoriesToCreate);
  const verdict = typeof options.authorize === "function" ? await options.authorize(ops) : null;
  const authorization = verdict ? { ok: Boolean(verdict.ok), kind: verdict.kind || null, ops, opsNeeded: verdict.ops || [] } : { ok: true, kind: null, ops, opsNeeded: [] };

  if (options.dryRun) {
    // the version of every product an update would change: an approval pins these (a row changed since is refused when it is applied)
    const bases = {};
    for (const p of plans) if (p.action === "update" && stored.map.get(p.id)?.updated_at) bases[p.id] = stored.map.get(p.id).updated_at;
    return { ok: true, dryRun: true, results: serializePlans(plans), counts: summarizePlans(plans), createdCategories: categoriesToCreate.map((c) => c.slug), authorization, bases };
  }
  if (!verdict?.ok) {
    const kind = verdict?.kind === "approval" ? "approval" : "denied";
    return { ok: false, error: kind === "approval" ? IMPORT_RUN_MESSAGES.needsApproval : IMPORT_RUN_MESSAGES.denied, ...(kind === "approval" ? { needsApproval: true } : { denied: true }), ops: verdict?.ops || ops };
  }

  // ── commit ──────────────────────────────────────────────────────────────────
  // 1) auto-create missing categories first (so rows can reference their ids)
  const createdCategories = [];
  const catIdBySlug = new Map();
  for (const cat of categoriesToCreate) {
    const { data, error } = await admin.from(cfg.categories).insert({ slug: cat.slug, name_en: cat.name_en, is_active: true, sort_order: 99 }).select("id,slug").single();
    if (error) {
      const { data: ex } = await admin.from(cfg.categories).select("id,slug").eq("slug", cat.slug).single();     // race / re-run: it may exist now
      if (ex) catIdBySlug.set(cat.slug, ex.id);
    } else {
      catIdBySlug.set(data.slug, data.id);
      createdCategories.push(data.slug);
    }
  }

  // 1b) auto-translate empty languages of NEW products; every filled text is marked "auto" (R7)
  if (options.autoTranslate && translate) {
    const createWrites = plans.filter((p) => p.action === "create" && p.write).map((p) => p.write);
    await translate(createWrites);
  }

  const as = options.recordAs || {};
  const who = { userId: as.userId ?? null, label: as.label || null };
  let versionsLost = 0;

  // 2) execute row plans sequentially (chunk sizes keep this serverless-safe)
  const results = [];
  for (const plan of plans) {
    const base = { rowNum: plan.rowNum, messages: [...plan.messages], warnings: [...plan.warnings], ...(plan.publishBlocked ? { publishBlocked: plan.publishBlocked } : {}), ...(plan.publishUnavailable ? { publishUnavailable: true } : {}) };
    if (plan.action === "error" || plan.action === "skip") { results.push({ ...base, status: plan.action }); continue; }

    const write = { ...plan.write };
    if (write.category && write.category_id == null) {
      const id = catIdBySlug.get(write.category) ?? ctx.categoriesBySlug.get(write.category)?.id ?? null;
      if (id == null) { results.push({ ...base, status: "error", messages: [...base.messages, tr("ساخت دسته «{category}» ناموفق بود.", { category: write.category })] }); continue; }
      write.category_id = id;
    }

    if (plan.action === "create") {
      let res = await admin.from(cfg.table).insert(write).select("id,slug").single();
      if (res.error && "translation_meta" in write && isMissingColumn(res.error)) {            // migration 40 not applied: the texts are saved, the marks cannot be
        const { translation_meta, ...rest } = write;
        res = await admin.from(cfg.table).insert(rest).select("id,slug").single();
      }
      if (res.error) { results.push({ ...base, status: "error", messages: [...base.messages, cfg.friendly(res.error)] }); continue; }
      results.push({ ...base, status: "create", id: res.data?.id, slug: res.data?.slug });
      const v = await recordVersion(admin, house, { productId: res.data?.id, kind: "create", before: {}, after: pickFields(write), who, requestId: as.requestId ?? null });
      if (!v.ok && !v.skipped) versionsLost += 1;
      continue;
    }

    // update: against the version it was planned on, and (for an approved import) the version the reviewer saw
    const before = stored.map.get(plan.id);
    if (!before) { results.push({ ...base, status: "error", messages: [...base.messages, IMPORT_RUN_MESSAGES.gone] }); continue; }
    const pinned = options.bases && options.bases[plan.id];
    if (pinned && String(pinned) !== String(before.updated_at)) { results.push({ ...base, status: "error", stale: true, id: plan.id, messages: [...base.messages, IMPORT_RUN_MESSAGES.stale] }); continue; }
    const meta = reconcileMeta(before, write);
    if (meta !== undefined && "translation_meta" in before) write.translation_meta = meta;
    const { changed, old } = diffRow(before, write);
    if (!Object.keys(changed).length) { results.push({ ...base, status: "skip", messages: [...base.messages] }); continue; }          // identical to what is stored: nothing to write
    const { data, error } = await admin.from(cfg.table).update(write).eq("id", plan.id).eq("updated_at", before.updated_at).select("id");
    if (error) { results.push({ ...base, status: "error", messages: [...base.messages, cfg.friendly(error)] }); continue; }
    if (!data?.length) { results.push({ ...base, status: "error", stale: true, id: plan.id, messages: [...base.messages, IMPORT_RUN_MESSAGES.stale] }); continue; }
    results.push({ ...base, status: "update", id: plan.id });
    const v = await recordVersion(admin, house, { productId: plan.id, kind: as.kind === "approval" ? "approval" : "update", before: old, after: changed, who, requestId: as.requestId ?? null });
    if (!v.ok && !v.skipped) versionsLost += 1;
  }

  const counts = { total: results.length, create: 0, update: 0, skip: 0, error: 0, warnings: 0, stale: 0 };
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    if (r.stale) counts.stale += 1;
    if (r.warnings?.length) counts.warnings += 1;
  }
  return { ok: true, dryRun: false, results, counts, createdCategories, authorization, versionsLost };
}

const pickFields = (write) => Object.fromEntries(Object.entries(write).filter(([k]) => !["translation_meta"].includes(k)));

async function loadContext(admin, cfg) {
  const read = (cols) => readAll((from, to) => admin.from(cfg.table).select(cols).order("id", { ascending: true }).range(from, to));          // EVERY product, in chunks: a plain select stops at the API's 1,000 rows and an import would then create duplicates
  const [withVariants, catRes] = await Promise.all([read("id,sku,slug,variant_of"), admin.from(cfg.categories).select("id,slug,is_active")]);
  const prodRes = withVariants.ok ? withVariants : await read("id,sku,slug");
  if (!prodRes.ok) throw new Error("READ_PRODUCTS_FAILED");
  if (catRes.error) throw new Error("READ_CATEGORIES_FAILED");
  const existingBySku = new Map(), existingBySlug = new Map(), takenSlugs = new Set();
  for (const p of prodRes.rows) {
    if (p.sku) existingBySku.set(String(p.sku).toLowerCase(), { id: p.id, slug: p.slug, variant: p.variant_of != null });
    if (p.slug) { existingBySlug.set(p.slug, { id: p.id, variant: p.variant_of != null }); takenSlugs.add(p.slug); }
  }
  const categoriesBySlug = new Map();
  for (const c of catRes.data || []) if (c.slug) categoriesBySlug.set(String(c.slug).toLowerCase(), { id: c.id, slug: c.slug });
  return { existingBySku, existingBySlug, takenSlugs, categoriesBySlug };
}

function serializePlans(plans) {
  return plans.map((p) => ({
    rowNum: p.rowNum, status: p.action, id: p.id, slug: p.slug, messages: p.messages, warnings: p.warnings,
    ...(p.publishBlocked ? { publishBlocked: p.publishBlocked } : {}), ...(p.publishUnavailable ? { publishUnavailable: true } : {}),
  }));
}
