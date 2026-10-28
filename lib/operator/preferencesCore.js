// lib/operator/preferencesCore.js — read and save the signed-in person's panel preferences for ONE house (N10). The action files own the session;
// they pass ctx = { admin, session, panel }. The person always comes from the verified session (never from the browser), and the shared legacy login
// has no person, so it keeps no preferences. No right is needed beyond being signed in: a preference only chooses among addresses the person may
// already open, and changes no data of the house.
import { cleanPreferences, effectivePreferences, PREF_MESSAGES } from "./preferences.js";

const missing = (e) => e && (["42P01", "PGRST205", "PGRST204"].includes(e.code) || /operator_preferences|schema cache|does not exist/i.test(String(e.message || "")));

// → { ok: true, startPage, shortcuts } (empty when there is no row or no person) | { ok: false, needsMigration? }
export async function readPreferences(admin, session, panel) {
  const uid = session?.user?.id;
  if (!uid) return { ok: true, startPage: null, shortcuts: [], personal: false };
  const { data, error } = await admin.from("operator_preferences").select("start_page,shortcuts").eq("user_id", uid).eq("house", panel).maybeSingle();
  if (error) return { ok: false, needsMigration: Boolean(missing(error)) };
  return { ok: true, personal: true, ...effectivePreferences(session, panel, data) };
}

export async function savePreferences(ctx, raw) {
  const uid = ctx.session?.user?.id;
  if (!uid) return { ok: false, error: PREF_MESSAGES.needsAccount };
  const clean = cleanPreferences(ctx.session, ctx.panel, raw);
  if (!clean.ok) return clean;
  const row = { user_id: uid, house: ctx.panel, start_page: clean.prefs.start_page, shortcuts: clean.prefs.shortcuts };
  const { error } = await ctx.admin.from("operator_preferences").upsert(row, { onConflict: "user_id,house" });
  if (error) return { ok: false, error: missing(error) ? PREF_MESSAGES.needsMigration : PREF_MESSAGES.generic };
  return { ok: true, startPage: clean.prefs.start_page, shortcuts: clean.prefs.shortcuts };
}
