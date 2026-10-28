"use server";
// lib/operator/auditActions.js — Health panel: export the activity log as CSV (its own permission, audit.export; the export itself is
// logged with the person who made it). The Beauty panel has its own copy.
import { getSession } from "@/lib/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { auditEvent } from "@/lib/operator/audit";
import { mayView } from "@/lib/operator/access";
import { auditCsv } from "@/lib/operator/auditView";
import { tr } from "../panel/i18n.js";

const NO_SESSION = { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };

export async function exportActivityCsv(filters) {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  const log = (action, meta = {}) => auditEvent({ admin, panel: "health", session, action, ...meta });
  if (!mayView(session, "health", "audit.export")) {
    await log("access.denied", { result: "rejected", detail: { reason: "audit.export", method: "denied" } });
    return { ok: false, error: tr("اجازهٔ انجام این کار را ندارید.") };
  }
  const res = await auditCsv(admin, { panel: "health", filters });
  if (!res.ok) return { ok: false, error: tr("ذخیره نشد. دوباره تلاش کنید.") };
  await log("audit.exported", { result: "success", detail: { format: "csv", rows: res.count } });
  return { ok: true, csv: res.csv, filename: `medoria-health-activity-${new Date().toISOString().slice(0, 10)}.csv` };
}
