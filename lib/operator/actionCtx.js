// lib/operator/actionCtx.js — SERVER ONLY. The context an action works with, for the actions that sit in files that have no `authed()` of
// their own (the category tree, the import screens): the session's checks, the activity-log writers and — for an operation that can be
// sent for approval — the decision and the filing of the request. Same behaviour as `authed()` in lib/operator/actions.js.
import "server-only";
import { auditEvent } from "@/lib/operator/audit";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { evaluateAll, requireAll } from "@/lib/operator/access";
import { fileForApproval } from "@/lib/operator/approvalFlow";
import { tr } from "../panel/i18n.js";

const NO_SESSION = { ok: false, error: tr("نشست معتبر نیست. دوباره وارد شوید.") };

// → ctx | a refusal object. `getSession` is the panel's own session reader; `operation` is checked at once (default closed).
export async function buildActionCtx({ panel, getSession, operation, approvable = false }) {
  const session = await getSession();
  if (!session) return NO_SESSION;
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).") };
  const ctx = { ok: true, admin, session, audit: (action, meta = {}) => auditEvent({ admin, panel, session, action, ...meta }), auditEntry: (entry) => auditEvent({ admin, panel, session, ...entry }) };
  ctx.require = (ops) => requireAll({ session, panel, operations: [].concat(ops), audit: (...args) => ctx.audit(...args) });
  ctx.evaluate = (ops) => evaluateAll({ session, panel, operations: [].concat(ops), audit: (...args) => ctx.audit(...args) });
  ctx.file = (spec) => fileForApproval({ admin, session, audit: (...args) => ctx.audit(...args), panel }, spec);
  if (operation) {
    if (approvable) {
      const ev = await ctx.evaluate(operation);
      if (ev.mode === "denied") return ev.refusal;
      ctx.needsApproval = ev.mode === "approval";
    } else {
      const refusal = await ctx.require(operation);
      if (refusal) return refusal;
    }
  }
  return ctx;
}
