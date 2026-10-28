"use server";
// lib/operator/approvalActions.js — Health panel: the approval queue (view / approve / reject / withdraw / resubmit). Session first, then
// the shared work in approvalActionsCore.js, which asks the rules of approvals.js (reviewer allowed for that kind of change, not the
// requester, requester still allowed, the record still the version the request was prepared against). The Beauty panel has its own copy.
import { getSession } from "@/lib/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { auditEvent } from "@/lib/operator/audit";
import { makeProductExecutors } from "@/lib/operator/approvalExecutors";
import { makeWarehouseExecutors } from "@/lib/warehouse/actionsCore";
import { makeCountExecutors } from "@/lib/warehouse/countsActions";
import { makeMediaExecutors } from "@/lib/operator/mediaLibrary";
import { makeDocumentExecutors } from "@/lib/operator/documentsCore";
import { makeDestructiveExecutors, makeDestructivePrepare } from "@/lib/operator/destructiveApproval";
import { prepareFor } from "@/lib/operator/approvable";
import { makeProductPrepare } from "@/lib/operator/approvalPrepare";
import { revalidateHealthPublic } from "@/lib/health/revalidate";
import * as core from "@/lib/operator/approvalActionsCore";
import { tr } from "../panel/i18n.js";

const NO_SESSION = { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };

async function ctxFor() {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  const audit = (action, meta = {}) => auditEvent({ admin, panel: "health", session, action, ...meta });
  const auditEntry = (entry) => auditEvent({ admin, panel: "health", session, ...entry });
  return { ok: true, ctx: {
    admin, session, audit, panel: "health",
    executors: { ...makeProductExecutors({ panel: "health", session, audit: auditEntry }), ...makeWarehouseExecutors({ panel: "health" }), ...makeCountExecutors({ panel: "health" }), ...makeMediaExecutors({ panel: "health" }), ...makeDocumentExecutors({ panel: "health" }), ...makeDestructiveExecutors({ panel: "health", session, audit: auditEntry, revalidate: () => revalidateHealthPublic() }) },
    prepare: prepareFor({ product: makeProductPrepare({ panel: "health", admin }), destructive: makeDestructivePrepare({ panel: "health", admin }) }),        // see lib/operator/approvable.js: what can be asked again
    revalidate: () => revalidateHealthPublic(),
  } };
}

export async function approveRequestAction(id) {
  const a = await ctxFor();
  return a.ok ? core.approve(a.ctx, id) : a;
}
export async function rejectRequestAction(id, reason) {
  const a = await ctxFor();
  return a.ok ? core.reject(a.ctx, id, reason) : a;
}
export async function cancelRequestAction(id) {
  const a = await ctxFor();
  return a.ok ? core.cancel(a.ctx, id) : a;
}
export async function resubmitRequestAction(id) {
  const a = await ctxFor();
  return a.ok ? core.resubmit(a.ctx, id) : a;
}
