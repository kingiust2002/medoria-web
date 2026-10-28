// lib/operator/documentsCore.js — the work behind the product-document actions of BOTH panels (N8). The action files own the session and pass
// ctx = { admin, session, panel, audit, require, evaluate, file } (the warehouse context).
// Rights: add a document (always as a DRAFT) → documents.create · change its title / kind / language / date / order, or hide it → documents.edit ·
// make it public → documents.publish (may need approval) · delete it → documents.delete (may need approval). A document belongs to a product of the
// SAME house (never to a variant); a file is checked before it is stored in the house's public bucket; the row and the file go together.
import { createHash } from "node:crypto";
import { DOC_BUCKETS, DOC_LIMITS, DOC_MESSAGES, DOC_PRODUCT_TABLES, DOC_TABLES, cleanDocumentInput, documentPath, isPdfFile, scanPdf } from "./documents.js";

const COLS = "id,product_id,kind,title,lang,valid_until,file_path,file_size,is_published,sort_order,version,created_at,updated_at,updated_label";
const missingTable = (e) => e && (e.code === "42P01" || e.code === "PGRST205" || /relation .* does not exist|could not find the table/i.test(String(e.message || "")));
const intId = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const whoOf = (ctx) => {
  const u = ctx.session?.user;
  return { id: u?.id ?? null, label: String(u?.username || ctx.session?.username || "operator").slice(0, 80) };
};
async function log(ctx, action, result, ids, detail) {
  try { await ctx.audit(action, { entity: DOC_TABLES[ctx.panel], ids, result, detail }); } catch { /* the row itself records who changed it last */ }
}

// ── reads (the page has already checked the right to see products) ────────────────────────────────────────────────────────
export async function listDocuments(admin, house, productId) {
  const pid = intId(productId);
  if (!admin || !pid) return { ok: true, rows: [] };
  const { data, error } = await admin.from(DOC_TABLES[house]).select(COLS).eq("product_id", pid).order("sort_order", { ascending: true }).order("id", { ascending: true }).limit(DOC_LIMITS.maxPerProduct + 5);
  if (error) return missingTable(error) ? { ok: true, unavailable: true, rows: [] } : { ok: false, error: DOC_MESSAGES.generic };
  return { ok: true, rows: data || [] };
}

async function loadRow(ctx, id) {
  const n = intId(id);
  if (!n) return { error: DOC_MESSAGES.unknown };
  const { data, error } = await ctx.admin.from(DOC_TABLES[ctx.panel]).select(COLS).eq("id", n).maybeSingle();
  if (error) return { error: missingTable(error) ? DOC_MESSAGES.unavailable : DOC_MESSAGES.generic };
  return data ? { row: data } : { error: DOC_MESSAGES.unknown };
}

async function removeFile(ctx, path) {
  try { await ctx.admin.storage.from(DOC_BUCKETS[ctx.panel]).remove([path]); } catch { /* an orphan file is harmless: nothing points at it */ }
}

// ── add (formData: file, title, kind, lang, valid_until) ──────────────────────────────────────────────────────────────────
export async function addDocument(ctx, productId, formData) {
  const refusal = await ctx.require("documents.create");
  if (refusal) return refusal;
  const pid = intId(productId);
  if (!pid) return { ok: false, error: DOC_MESSAGES.noProduct };
  const get = (k) => formData?.get?.(k);
  const meta = cleanDocumentInput({ title: get("title"), kind: get("kind"), lang: get("lang") ?? "", valid_until: get("valid_until") ?? "" });
  if (!meta.ok) return meta;
  const file = get("file");
  if (!file || typeof file === "string") return { ok: false, error: DOC_MESSAGES.none };
  if (!isPdfFile(file)) return { ok: false, error: DOC_MESSAGES.notPdf };
  if (file.size > DOC_LIMITS.maxBytes) return { ok: false, error: DOC_MESSAGES.tooBig };

  const table = DOC_TABLES[ctx.panel];
  const product = await ctx.admin.from(DOC_PRODUCT_TABLES[ctx.panel]).select("*").eq("id", pid).maybeSingle();
  if (product.error || !product.data || product.data.variant_of != null) return { ok: false, error: DOC_MESSAGES.noProduct };
  const existing = await ctx.admin.from(table).select("id,sha256").eq("product_id", pid).limit(DOC_LIMITS.maxPerProduct + 1);
  if (existing.error) return { ok: false, error: missingTable(existing.error) ? DOC_MESSAGES.unavailable : DOC_MESSAGES.generic };
  if ((existing.data || []).length >= DOC_LIMITS.maxPerProduct) return { ok: false, error: DOC_MESSAGES.tooMany };

  const buffer = Buffer.from(await file.arrayBuffer());
  const scan = scanPdf(buffer);
  if (!scan.ok) return scan;
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if ((existing.data || []).some((d) => d.sha256 === sha256)) return { ok: false, error: DOC_MESSAGES.duplicate };

  const path = documentPath(file.name);
  const up = await ctx.admin.storage.from(DOC_BUCKETS[ctx.panel]).upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (up.error) return { ok: false, error: DOC_MESSAGES.uploadFailed };
  const who = whoOf(ctx);
  const ins = await ctx.admin.from(table).insert({ product_id: pid, ...meta.value, file_path: path, file_size: buffer.length, sha256, is_published: false, created_by: who.id, updated_label: who.label }).select(COLS).single();
  if (ins.error || !ins.data) {
    await removeFile(ctx, path);                                           // the file and the row go together
    await log(ctx, "document.create", "failure", undefined, { product: pid });
    if (ins.error?.code === "23505") return { ok: false, error: DOC_MESSAGES.duplicate };
    return { ok: false, error: missingTable(ins.error) ? DOC_MESSAGES.unavailable : DOC_MESSAGES.generic };
  }
  await log(ctx, "document.create", "success", [ins.data.id], { product: pid, kind: meta.value.kind });
  return { ok: true, document: ins.data, compressed: scan.compressed };
}

// ── change the words of a document ────────────────────────────────────────────────────────────────────────────────────────
export async function updateDocument(ctx, id, input, expectedVersion) {
  const refusal = await ctx.require("documents.edit");
  if (refusal) return refusal;
  const got = await loadRow(ctx, id);
  if (got.error) return { ok: false, error: got.error };
  const ver = Number(expectedVersion);
  if (!Number.isInteger(ver) || got.row.version !== ver) return { ok: false, error: DOC_MESSAGES.conflict, conflict: true };
  const clean = cleanDocumentInput(input, { partial: true });
  if (!clean.ok) return clean;
  if (!Object.keys(clean.value).length) return { ok: true, document: got.row };
  const who = whoOf(ctx);
  const res = await ctx.admin.from(DOC_TABLES[ctx.panel]).update({ ...clean.value, updated_label: who.label }).eq("id", got.row.id).eq("version", ver).select(COLS);
  if (res.error) return { ok: false, error: DOC_MESSAGES.generic };
  if (!res.data?.length) return { ok: false, error: DOC_MESSAGES.conflict, conflict: true };
  await log(ctx, "document.update", "success", [got.row.id], { fields: Object.keys(clean.value) });
  ctx.revalidate?.();
  return { ok: true, document: res.data[0] };
}

// ── publish / hide ────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function setDocumentPublished(ctx, id, publish, expectedVersion) {
  const want = Boolean(publish);
  const got = await (async () => {
    const refusal = want ? null : await ctx.require("documents.edit");      // hiding is a safe change; making public is judged below
    return refusal ? { refusal } : loadRow(ctx, id);
  })();
  if (got.refusal) return got.refusal;
  if (got.error) return { ok: false, error: got.error };
  const row = got.row;
  const ver = Number(expectedVersion);
  if (!Number.isInteger(ver) || row.version !== ver) return { ok: false, error: DOC_MESSAGES.conflict, conflict: true };
  if (Boolean(row.is_published) === want) return { ok: true, document: row };
  if (want) {
    const ev = await ctx.evaluate("documents.publish");
    if (ev.mode === "denied") return ev.refusal;
    if (ev.mode === "approval") {
      return ctx.file({ operation: "documents.publish", ops: ["documents.publish"], entity: DOC_TABLES[ctx.panel], entityId: row.id, subject: row.title, before: { is_published: false }, proposed: { is_published: true }, baseUpdatedAt: row.updated_at });
    }
  }
  const who = whoOf(ctx);
  const res = await ctx.admin.from(DOC_TABLES[ctx.panel]).update({ is_published: want, updated_label: who.label }).eq("id", row.id).eq("version", ver).select(COLS);
  if (res.error) return { ok: false, error: DOC_MESSAGES.generic };
  if (!res.data?.length) return { ok: false, error: DOC_MESSAGES.conflict, conflict: true };
  await log(ctx, want ? "document.publish" : "document.unpublish", "success", [row.id], { product: row.product_id });
  ctx.revalidate?.();
  return { ok: true, document: res.data[0] };
}

// ── delete ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// the row first (conditional on the version), then the file; used by the direct path and by the approval executor
async function deleteRowAndFile(admin, panel, row, condition) {
  let q = admin.from(DOC_TABLES[panel]).delete().eq("id", row.id);
  q = condition(q);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "stale" };
  try { await admin.storage.from(DOC_BUCKETS[panel]).remove([row.file_path]); } catch { /* an orphan file is harmless */ }
  return { ok: true };
}

export async function deleteDocument(ctx, id, expectedVersion) {
  const ev = await ctx.evaluate("documents.delete");
  if (ev.mode === "denied") return ev.refusal;
  const got = await loadRow(ctx, id);
  if (got.error) return { ok: false, error: got.error };
  const row = got.row;
  const ver = Number(expectedVersion);
  if (!Number.isInteger(ver) || row.version !== ver) return { ok: false, error: DOC_MESSAGES.conflict, conflict: true };
  if (ev.mode === "approval") {
    return ctx.file({ operation: "documents.delete", ops: ["documents.delete"], entity: DOC_TABLES[ctx.panel], entityId: row.id, subject: row.title, before: { title: row.title, kind: row.kind }, proposed: { delete: true }, baseUpdatedAt: row.updated_at });
  }
  await log(ctx, "document.delete_attempt", "success", [row.id], { product: row.product_id });
  const res = await deleteRowAndFile(ctx.admin, ctx.panel, row, (q) => q.eq("version", ver));
  if (!res.ok) {
    await log(ctx, "document.delete_failed", "failure", [row.id], { product: row.product_id });
    return { ok: false, error: res.error === "stale" ? DOC_MESSAGES.conflict : DOC_MESSAGES.generic, conflict: res.error === "stale" };
  }
  await log(ctx, "document.delete", "success", [row.id], { product: row.product_id });
  ctx.revalidate?.();
  return { ok: true };
}

// ── what an APPROVED request does (same checks, now) ──────────────────────────────────────────────────────────────────────
export function makeDocumentExecutors({ panel }) {
  const table = DOC_TABLES[panel];
  return {
    "documents.publish": async ({ admin, request }) => {
      if (!request.base_updated_at) return { ok: false, error: "stale" };
      const { data, error } = await admin.from(table).update({ is_published: true }).eq("id", request.entity_id).eq("updated_at", request.base_updated_at).select("id");
      if (error) return { ok: false, error: "failed" };
      if (data?.length) return { ok: true };
      const exists = await admin.from(table).select("id").eq("id", request.entity_id).limit(1);
      return { ok: false, error: !exists.error && exists.data?.length ? "stale" : exists.error ? "failed" : "notFound" };
    },
    "documents.delete": async ({ admin, request }) => {
      if (!request.base_updated_at) return { ok: false, error: "stale" };
      const { data: row, error } = await admin.from(table).select(COLS).eq("id", request.entity_id).maybeSingle();
      if (error) return { ok: false, error: "failed" };
      if (!row) return { ok: false, error: "notFound" };
      const res = await deleteRowAndFile(admin, panel, row, (q) => q.eq("updated_at", request.base_updated_at));
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
  };
}
