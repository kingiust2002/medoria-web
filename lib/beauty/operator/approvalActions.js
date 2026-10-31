"use server";
// lib/beauty/operator/approvalActions.js — Beauty panel: the approval queue (approve / reject / withdraw / resubmit). Session first, then
// the shared work in approvalActionsCore.js. The Health panel has its own copy (its own session, its own house).
import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/beauty/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { auditEvent } from "@/lib/operator/audit";
import { makeProductExecutors } from "@/lib/operator/approvalExecutors";
import { makeWarehouseExecutors } from "@/lib/warehouse/actionsCore";
import { makeCountExecutors } from "@/lib/warehouse/countsActions";
import { makeMediaExecutors } from "@/lib/operator/mediaLibrary";
import { makeDestructiveExecutors, makeDestructivePrepare } from "@/lib/operator/destructiveApproval";
import { prepareFor } from "@/lib/operator/approvable";
import { makeProductPrepare } from "@/lib/operator/approvalPrepare";
import * as core from "@/lib/operator/approvalActionsCore";
import { LOCALES } from "@/lib/i18n";
import { tr } from "../../panel/i18n.js";

const NO_SESSION = { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };

function revalidateBeauty() {
  try {
    revalidateTag("beauty-categories");
    revalidateTag("beauty-brands");
    for (const l of LOCALES) { revalidatePath(`/beauty/${l}`); revalidatePath(`/beauty/${l}/catalog`); revalidatePath(`/beauty/${l}/worlds`); revalidatePath(`/beauty/${l}/brands`); }
    revalidatePath("/beauty/[lang]/catalog/[slug]", "page");
  } catch { /* dynamic routes — no-op */ }
}

async function ctxFor() {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  const audit = (action, meta = {}) => auditEvent({ admin, panel: "beauty", session, action, ...meta });
  const auditEntry = (entry) => auditEvent({ admin, panel: "beauty", session, ...entry });
  return { ok: true, ctx: {
    admin, session, audit, panel: "beauty",
    executors: { ...makeProductExecutors({ panel: "beauty", session, audit: auditEntry }), ...makeWarehouseExecutors({ panel: "beauty" }), ...makeCountExecutors({ panel: "beauty" }), ...makeMediaExecutors({ panel: "beauty" }), ...makeDestructiveExecutors({ panel: "beauty", session, audit: auditEntry, revalidate: revalidateBeauty }) },
    prepare: prepareFor({ product: makeProductPrepare({ panel: "beauty", admin }), destructive: makeDestructivePrepare({ panel: "beauty", admin }) }),        // see lib/operator/approvable.js: what can be asked again
    revalidate: revalidateBeauty,
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
