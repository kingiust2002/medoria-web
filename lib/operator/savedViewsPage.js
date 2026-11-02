// lib/operator/savedViewsPage.js — SERVER ONLY. What a list PAGE hands its table: the signed-in person's saved views, or null where views do not
// exist (no person behind the session — the old shared login —, or the migration is not applied yet), in which case the table shows nothing.
import "server-only";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { readSavedViews } from "@/lib/operator/savedViewsCore";

export async function savedViewsOf(session, panel, list) {
  if (!session?.user?.id) return null;
  const admin = getAdminClient();
  if (!admin) return null;
  const res = await readSavedViews(admin, session, panel, list);
  return res.ok ? res.views : null;
}
