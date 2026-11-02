// lib/operator/preferencesPage.js — SERVER ONLY. What the panel layout and the settings page read: the person's effective preferences, or empty ones
// where none exist (no person behind the session, or the migration is not applied yet) — the panel then simply shows no shortcuts.
import "server-only";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { readPreferences } from "@/lib/operator/preferencesCore";

export async function preferencesOf(session, panel) {
  const empty = { personal: Boolean(session?.user?.id), ready: false, extras: false, startPage: null, shortcuts: [], pageSizes: { products: null, quotes: null }, dashboard: null };
  if (!session?.user?.id) return empty;
  const admin = getAdminClient();
  if (!admin) return empty;
  const r = await readPreferences(admin, session, panel);
  return r.ok ? { personal: true, ready: true, extras: r.extras, startPage: r.startPage, shortcuts: r.shortcuts, pageSizes: r.pageSizes, dashboard: r.dashboard } : empty;
}
