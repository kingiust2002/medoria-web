// lib/operator/userAudit.js — the history rule for SENSITIVE changes of people (create, role / houses / permissions / approval policy,
// status, archive, restore, password reset, second-factor reset). Same pattern as lib/operator/auditedDelete.js:
//
//   1. an ATTEMPT entry (result "attempt") is written BEFORE the change; if it cannot be written — the log table is missing, the
//      database does not answer — the change is NOT made and the manager is told why. A missing history is a refusal, never a permission;
//   2. the change runs;
//   3. the OUTCOME is a second entry with the real result: success | failure | rejected. If only the outcome entry cannot be written, the change
//      stands (it is already done and the attempt entry is on record) and the result carries `auditWarning: true` so the screen says so.
// Entries carry who (the session), to whom (targetUserId) and short plain facts (role, houses, status, field NAMES) — never a password,
// a temporary password, a seed, a recovery code or a hash: lib/operator/security.js sanitizeDetail only lets a fixed list of keys through.
import { tr } from "../panel/i18n.js";

export const USER_AUDIT_MESSAGES = {
  unavailable: tr("ثبت در تاریخچه ممکن نشد؛ برای امنیت، این تغییر انجام نشد. دوباره تلاش کنید."),
};

// → true when the entry is on record.
export async function writeUserEntry(ctx, action, result, targetUserId, detail) {
  try {
    const r = await ctx.audit(action, { entity: "operator_users", result, targetUserId, detail });
    return Boolean(r?.ok);
  } catch {
    return false;
  }
}

// run() → { ok, ... , rejected?: true, auditDetail?: {...} }. Returns run()'s result (plus auditWarning), or the refusal when no attempt could be written.
export async function sensitive(ctx, { action, targetUserId, detail }, run) {
  if (!(await writeUserEntry(ctx, action, "attempt", targetUserId, detail))) return { ok: false, error: USER_AUDIT_MESSAGES.unavailable, auditFailed: true };
  let res;
  try { res = await run(); } catch { res = { ok: false, error: "failed" }; }
  const result = res.ok ? "success" : res.rejected ? "rejected" : "failure";
  const written = await writeUserEntry(ctx, action, result, res.target || targetUserId, { ...detail, ...(res.auditDetail || {}), ...(res.ok ? {} : { reason: String(res.reason || res.error || "failed").slice(0, 40) }) });
  return written ? res : { ...res, auditWarning: true };
}
