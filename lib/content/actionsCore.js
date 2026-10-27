// lib/content/actionsCore.js — the work behind the site-content server actions of BOTH panels (banner and FAQ of one house). The action files
// own the session check and pass ctx = { admin, session, panel, audit, require, revalidate }:
//   ctx.require(ops) → null | refusal        (an operation that "needs approval" is a refusal here: content has no approval executor yet)
//   ctx.revalidate() → purge the public pages of this house (best effort)
// Rights: create → content.create · edit → content.edit · making it live or hiding it (is_published) → content.publish · the two dates →
// content.schedule · delete → content.publish. A save asks for exactly the operations of the fields it changes. Optimistic lock: `version`.
import { CONTENT_KINDS, CONTENT_MESSAGES, LIMITS, cleanContent } from "../siteContent.js";
import { sameInstant } from "../operator/schedule.js";

const COLS = "id,house,kind,data,sort_order,is_published,publish_at,unpublish_at,version,created_at,updated_at,updated_label";
const whoOf = (ctx) => {
  const u = ctx.session?.user;
  return { id: u?.id ?? null, label: String(u?.username || ctx.session?.username || "operator").slice(0, 80) };
};
const fail = (error) => (error?.code === "42P01" || error?.code === "PGRST205" ? { ok: false, error: CONTENT_MESSAGES.unavailable } : { ok: false, error: CONTENT_MESSAGES.generic });
async function log(ctx, action, result, ids, detail) {
  try { await ctx.audit(action, { entity: "content", ids, result, detail }); } catch { /* the row itself records who edited last */ }
}
const rowId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// ── reads (the page has already checked content.view) ────────────────────────────────────────────────────────────────────
export async function listContent(admin, house) {
  const { data, error } = await admin.from("site_content").select(COLS).eq("house", house).order("kind", { ascending: true }).order("sort_order", { ascending: true }).order("id", { ascending: true }).limit(LIMITS.perHouse * 2 + 10);
  return error ? fail(error) : { ok: true, rows: data || [] };
}

// ── writes ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function createContent(ctx, kind, input = {}) {
  if (!CONTENT_KINDS.includes(kind)) return { ok: false, error: CONTENT_MESSAGES.bad_kind };
  const c = cleanContent(kind, input);
  if (!c.ok) return c;
  const ops = ["content.create"];
  if (c.value.is_published) ops.push("content.publish");
  if (c.value.publish_at || c.value.unpublish_at) ops.push("content.schedule");
  const refusal = await ctx.require(ops);
  if (refusal) return refusal;
  const count = await ctx.admin.from("site_content").select("id", { count: "exact", head: true }).eq("house", ctx.panel).eq("kind", kind);
  if (count.error) return fail(count.error);
  if ((count.count ?? 0) >= LIMITS.perHouse) return { ok: false, error: CONTENT_MESSAGES.too_many };
  const who = whoOf(ctx);
  const { data, error } = await ctx.admin.from("site_content").insert({ house: ctx.panel, kind, ...c.value, created_by: who.id, updated_by: who.id, updated_label: who.label }).select(COLS).single();
  if (error) { await log(ctx, "content.create", "failure", undefined, { kind }); return fail(error); }
  await log(ctx, "content.create", "success", [data.id], { kind });
  ctx.revalidate?.();
  return { ok: true, row: data };
}

export async function updateContent(ctx, id, input = {}, expectedVersion) {
  const n = rowId(id), ver = Number(expectedVersion);
  const base = await ctx.require("content.edit");       // before anything is read: nobody probes ids without the right
  if (base) return base;
  if (!n || !Number.isInteger(ver)) return { ok: false, error: CONTENT_MESSAGES.unknown };
  const cur = await ctx.admin.from("site_content").select(COLS).eq("id", n).eq("house", ctx.panel).maybeSingle();
  if (cur.error) return fail(cur.error);
  if (!cur.data) return { ok: false, error: CONTENT_MESSAGES.unknown };
  const before = cur.data;
  const c = cleanContent(before.kind, input, before);
  if (!c.ok) return c;
  // the operations of what actually changes
  const ops = [];
  if (c.value.is_published !== before.is_published) ops.push("content.publish");
  if (!sameInstant(c.value.publish_at ?? null, before.publish_at) || !sameInstant(c.value.unpublish_at ?? null, before.unpublish_at)) ops.push("content.schedule");
  const refusal = ops.length ? await ctx.require(ops) : null;
  if (refusal) return refusal;
  const who = whoOf(ctx);
  const patch = { ...c.value, updated_by: who.id, updated_label: who.label };
  if (!("publish_at" in patch)) patch.publish_at = before.publish_at ?? null;
  if (!("unpublish_at" in patch)) patch.unpublish_at = before.unpublish_at ?? null;
  const { data, error } = await ctx.admin.from("site_content").update(patch).eq("id", n).eq("house", ctx.panel).eq("version", ver).select(COLS);
  if (error) { await log(ctx, "content.update", "failure", [n], { kind: before.kind }); return fail(error); }
  if (!data?.length) return { ok: false, stale: true, error: CONTENT_MESSAGES.stale };
  const fields = Object.keys(c.value).filter((k) => JSON.stringify(c.value[k] ?? null) !== JSON.stringify(before[k] ?? null));
  await log(ctx, "content.update", "success", [n], { kind: before.kind, fields });
  ctx.revalidate?.();
  return { ok: true, row: data[0] };
}

export async function deleteContent(ctx, id, expectedVersion) {
  const refusal = await ctx.require("content.delete");
  if (refusal) return refusal;
  const n = rowId(id), ver = Number(expectedVersion);
  if (!n || !Number.isInteger(ver)) return { ok: false, error: CONTENT_MESSAGES.unknown };
  const { data, error } = await ctx.admin.from("site_content").delete().eq("id", n).eq("house", ctx.panel).eq("version", ver).select("id,kind");
  if (error) { await log(ctx, "content.delete", "failure", [n]); return fail(error); }
  if (!data?.length) return { ok: false, stale: true, error: CONTENT_MESSAGES.stale };
  await log(ctx, "content.delete", "success", [n], { kind: data[0].kind });
  ctx.revalidate?.();
  return { ok: true };
}
