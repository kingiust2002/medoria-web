"use server";
// lib/beauty/operator/panelSearchActions.js — Beauty panel: the quick search ("/" or Ctrl+K). Session first (this panel's own); each kind of result is searched only if the person may
// see that kind of data (the same permissions as the pages). Reads only; nothing is logged.
import { getSession } from "@/lib/beauty/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { mayView, mayGlobal } from "@/lib/operator/access";
import { searchPanel as run } from "@/lib/operator/panelSearch";
import { tr } from "../../panel/i18n.js";

async function ctxFor() {
  const session = await getSession();
  if (!session) return { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  return { ok: true, admin, session };
}

export async function searchPanel(q) {
  const a = await ctxFor();
  if (!a.ok) return a;
  const { session } = a;
  const access = {
    products: mayView(session, "beauty", "products.view"), quotes: mayView(session, "beauty", "quotes.view"), categories: mayView(session, "beauty", "categories.view"),
    brands: mayView(session, "beauty", "brands.view"), users: mayGlobal(session, "beauty", "users.view"),
  };
  return run({ admin: a.admin, panel: "beauty", access, q: String(q ?? "").slice(0, 80) });
}
