// lib/operator/auditedDelete.js — the history rule for every irreversible action of the panels.
//
//   1. an ATTEMPT entry (`<thing>.delete_attempt`) must be written BEFORE the action; if it cannot be written the action is
//      refused. That includes a log table that does not exist (migration 30 not applied) and a missing audit function:
//      a missing history is a refusal, never a permission;
//   2. the action runs;
//   3. the OUTCOME is a different entry: `<thing>.delete` only when something really was removed, `<thing>.delete_failed`
//      (with a short reason) when not. A failed delete can never read as a successful one.
// Plain module (no Next imports): unit-tested directly; used by products, quotes, categories and brands.

export const AUDIT_DELETE_MESSAGES = {
  failed: "ثبت در تاریخچه ممکن نشد؛ برای امنیت، حذف انجام نشد. دوباره تلاش کنید.",
  unavailable: "تاریخچهٔ فعالیت در دسترس نیست (مایگریشن ۳۰ اجرا نشده یا پایگاه داده پاسخ نمی‌دهد)؛ برای امنیت، حذف انجام نشد.",
};

// One audit entry. Never throws. `audit(entry)` is the panel-bound writer (lib/operator/audit.js makeAudit / auditEvent).
export async function writeEntry(audit, entry) {
  if (typeof audit !== "function") return { ok: false, unavailable: true };
  try {
    const r = await audit(entry);
    return { ok: Boolean(r?.ok), unavailable: Boolean(r?.unavailable) };
  } catch {
    return { ok: false };
  }
}

// null = the attempt is on record, go ahead; otherwise the refusal to return to the caller.
export async function requireAttempt(audit, entry) {
  const r = await writeEntry(audit, entry);
  if (r.ok) return null;
  return { ok: false, error: r.unavailable ? AUDIT_DELETE_MESSAGES.unavailable : AUDIT_DELETE_MESSAGES.failed };
}

// The outcome entries of one action: `<kind>.delete` / `<kind>.delete_failed`.
export function makeOutcome(audit, { kind, entity, ids, detail }) {
  return {
    succeeded: (extra) => writeEntry(audit, { action: `${kind}.delete`, entity, ids, detail: { ...detail, ...extra } }),
    failed: (reason, extra) => writeEntry(audit, { action: `${kind}.delete_failed`, entity, ids, detail: { ...detail, ...extra, reason } }),
  };
}
