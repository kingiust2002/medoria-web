// lib/operator/listColumnsPage.js — SERVER ONLY. What a list PAGE hands its table: { saved } for the signed-in person (saved = their chosen keys or null for
// "defaults"), or null where choosing columns does not exist (no person behind the session — the old shared login —, or the migration is not applied).
import "server-only";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { readSavedColumns } from "@/lib/operator/listColumnsCore";

export async function columnsOf(session, panel, list) {
  if (!session?.user?.id) return null;
  const admin = getAdminClient();
  if (!admin) return null;
  const res = await readSavedColumns(admin, session, panel, list);
  return res.ok ? { saved: res.columns } : null;
}
