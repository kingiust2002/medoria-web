// lib/warehouse/panelCtx.js — SERVER ONLY. The context the warehouse actions of one panel run in: the verified session, the service
// client, the activity-log writer and the permission helpers. The two "use server" files (Health, Beauty) call this with their own
// session reader; nothing else imports it.
import "server-only";
import { auditEvent } from "@/lib/operator/audit";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { evaluateAll, requireAll } from "@/lib/operator/access";
import { fileForApproval } from "@/lib/operator/approvalFlow";
import { tr } from "../panel/i18n.js";

export async function warehouseCtx(panel, getSession) {
  const session = await getSession();
  if (!session) return { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  const audit = (action, meta = {}) => auditEvent({ admin, panel, session, action, ...meta });
  return {
    ok: true, ctx: {
      admin, session, panel, audit,
      require: (ops) => requireAll({ session, panel, operations: [].concat(ops), audit }),
      evaluate: (ops) => evaluateAll({ session, panel, operations: [].concat(ops), audit }),
      file: (spec) => fileForApproval({ admin, session, audit, panel }, spec),
    },
  };
}
