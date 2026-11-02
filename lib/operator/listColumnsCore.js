// lib/operator/listColumnsCore.js — the columns of ONE person in ONE house (N9, round 3). The action files own the session; they pass ctx = { admin,
// session, panel } (the warehouse context). Every read and write is bound to user_id + house + list, so nobody sees or changes another person's choice
// (the old shared login has no person, so it keeps none). The right needed is the one to SEE that list; choosing columns changes no data.
import { mayView } from "./access.js";
import { cleanColumns, isColumnList, COLUMN_MESSAGES } from "./listColumns.js";

const REL = { products: "products.view", quotes: "quotes.view" };
const missing = (e) => e && (["42P01", "PGRST205", "PGRST204"].includes(e.code) || /operator_table_columns|schema cache|does not exist/i.test(String(e.message || "")));

// → { ok, columns: [...] | null }  (null = no choice stored); ok:false when the table cannot be read (migration missing / database trouble)
export async function readSavedColumns(admin, session, panel, list) {
  const uid = session?.user?.id;
  if (!uid || !isColumnList(list) || !mayView(session, panel, REL[list])) return { ok: true, columns: null };
  const { data, error } = await admin.from("operator_table_columns").select("columns").eq("user_id", uid).eq("house", panel).eq("list", list).maybeSingle();
  if (error) return { ok: false, columns: null, needsMigration: Boolean(missing(error)) };
  return { ok: true, columns: cleanColumns(list, data?.columns) };
}

export async function saveColumns(ctx, list, columns) {
  if (!isColumnList(list)) return { ok: false, error: COLUMN_MESSAGES.generic };
  if (!mayView(ctx.session, ctx.panel, REL[list])) return { ok: false, denied: true, error: COLUMN_MESSAGES.denied };
  const uid = ctx.session?.user?.id;
  if (!uid) return { ok: false, error: COLUMN_MESSAGES.needsAccount };
  const clean = cleanColumns(list, columns);
  if (!clean) return { ok: false, error: COLUMN_MESSAGES.none };
  const { error } = await ctx.admin.from("operator_table_columns").upsert({ user_id: uid, house: ctx.panel, list, columns: clean }, { onConflict: "user_id,house,list" });
  if (error) return { ok: false, error: missing(error) ? COLUMN_MESSAGES.needsMigration : COLUMN_MESSAGES.generic };
  return { ok: true, columns: clean };
}

// back to the defaults
export async function resetColumns(ctx, list) {
  if (!isColumnList(list)) return { ok: false, error: COLUMN_MESSAGES.generic };
  const uid = ctx.session?.user?.id;
  if (!uid) return { ok: false, error: COLUMN_MESSAGES.needsAccount };
  const { error } = await ctx.admin.from("operator_table_columns").delete().eq("user_id", uid).eq("house", ctx.panel).eq("list", list);
  if (error) return { ok: false, error: missing(error) ? COLUMN_MESSAGES.needsMigration : COLUMN_MESSAGES.generic };
  return { ok: true, columns: null };
}
