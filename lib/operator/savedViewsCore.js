// lib/operator/savedViewsCore.js — saved list views of ONE person in ONE house (N9). The action files own the session; they pass
// ctx = { admin, session, panel, audit } (the warehouse context). A view is the person's own: every read and delete is bound to
// user_id + house + list, so nobody sees or removes another person's view (the old shared login has no person, so it keeps none).
// The right needed is the one to SEE that list ("products.view" / "quotes.view"); a view changes nothing in the data.
import { mayView } from "./access.js";
import { cleanViewName, cleanViewParams, isViewList, VIEW_LIMITS, VIEW_MESSAGES } from "./savedViews.js";
import { tr } from "../panel/i18n.js";

const DENIED = tr("اجازهٔ دیدن این فهرست را ندارید.");
const REL = { products: "products.view", quotes: "quotes.view" };
const missing = (e) => e && (["42P01", "PGRST205", "PGRST204"].includes(e.code) || /operator_saved_views|schema cache|does not exist/i.test(String(e.message || "")));

const userOf = (ctx) => ctx.session?.user?.id ?? null;

export async function readSavedViews(admin, session, panel, list) {
  const uid = session?.user?.id;
  if (!uid || !isViewList(list) || !mayView(session, panel, REL[list])) return { ok: true, views: [] };
  const { data, error } = await admin.from("operator_saved_views").select("id,name,params,created_at").eq("user_id", uid).eq("house", panel).eq("list", list).order("created_at", { ascending: true }).limit(VIEW_LIMITS.perList);
  if (error) return { ok: false, views: [], needsMigration: Boolean(missing(error)) };
  return { ok: true, views: (data || []).map((v) => ({ id: v.id, name: v.name, params: cleanViewParams(list, v.params) })) };
}

export async function saveView(ctx, list, name, params) {
  if (!isViewList(list)) return { ok: false, error: VIEW_MESSAGES.generic };
  if (!mayView(ctx.session, ctx.panel, REL[list])) return { ok: false, denied: true, error: DENIED };
  const uid = userOf(ctx);
  if (!uid) return { ok: false, error: VIEW_MESSAGES.needsAccount };
  const clean = cleanViewName(name);
  if (!clean) return { ok: false, error: VIEW_MESSAGES.badName };
  const filters = cleanViewParams(list, params);
  if (!Object.keys(filters).length) return { ok: false, error: VIEW_MESSAGES.emptyFilters };
  const { data, error } = await ctx.admin.from("operator_saved_views").insert({ user_id: uid, house: ctx.panel, list, name: clean, params: filters }).select("id,name,params").single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: VIEW_MESSAGES.nameTaken };
    if (/too_many/.test(String(error.message || ""))) return { ok: false, error: VIEW_MESSAGES.tooMany };
    return { ok: false, error: missing(error) ? VIEW_MESSAGES.needsMigration : VIEW_MESSAGES.generic };
  }
  return { ok: true, view: { id: data.id, name: data.name, params: cleanViewParams(list, data.params) } };
}

export async function deleteView(ctx, list, id) {
  if (!isViewList(list)) return { ok: false, error: VIEW_MESSAGES.generic };
  const uid = userOf(ctx);
  if (!uid) return { ok: false, error: VIEW_MESSAGES.needsAccount };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: VIEW_MESSAGES.notFound };
  const { data, error } = await ctx.admin.from("operator_saved_views").delete().eq("id", id).eq("user_id", uid).eq("house", ctx.panel).eq("list", list).select("id");
  if (error) return { ok: false, error: missing(error) ? VIEW_MESSAGES.needsMigration : VIEW_MESSAGES.generic };
  if (!data?.length) return { ok: false, error: VIEW_MESSAGES.notFound };
  return { ok: true };
}
