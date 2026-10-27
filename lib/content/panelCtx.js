// lib/content/panelCtx.js — SERVER ONLY. The context the site-content actions of one panel run in: the warehouse context (verified session,
// service client, activity log, permission helpers — they are the same for every internal area) plus the purge of the public pages.
import "server-only";
import { warehouseCtx } from "@/lib/warehouse/panelCtx";
import { revalidateSiteContent } from "@/lib/siteContentRevalidate";

export async function contentCtx(panel, getSession) {
  const a = await warehouseCtx(panel, getSession);
  return a.ok ? { ok: true, ctx: { ...a.ctx, revalidate: () => revalidateSiteContent(panel) } } : a;
}
