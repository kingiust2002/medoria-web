// lib/operator/accountSecurityCore.js — the work behind "my password / my two-step login" for BOTH panels. Plain module: the action
// files (which own the session check) pass ctx = { admin, session, audit, key, limit }. `limit()` says whether this person may try
// another re-authentication right now (a stolen open session must not be able to guess the password).
import { changeOwnPassword, confirmTwoStep, disableTwoStep, newRecoveryCodes, SELF_MESSAGES, startTwoStep } from "./selfSecurity.js";
import { USER_MESSAGES } from "./userAdmin.js";
import { invalidateSessionUser } from "./accounts.js";

const user = (ctx) => ctx.session.user;

function message(res) {
  if (res.error === "password") return USER_MESSAGES.password[res.problem] || USER_MESSAGES.password.bad_type;
  return SELF_MESSAGES[res.error] || SELF_MESSAGES.failed;
}
async function log(ctx, action, result, detail) {
  try { await ctx.audit(action, { entity: "operator_users", result, targetUserId: user(ctx).id, detail }); } catch { /* decided already */ }
}
async function guarded(ctx, action, run) {
  if (!user(ctx)) return { ok: false, error: SELF_MESSAGES.legacy };
  if (!(await ctx.limit())) { await log(ctx, action, "rejected", { reason: "rate_limited" }); return { ok: false, error: SELF_MESSAGES.tooMany }; }
  const res = await run();
  invalidateSessionUser(user(ctx).id);
  if (!res.ok) {
    await log(ctx, action, res.error === "failed" || res.error === "unavailable" ? "failure" : "rejected", { reason: String(res.error || "failed").slice(0, 40) });
    return { ok: false, error: message(res), needCode: res.error === "needCode" };
  }
  await log(ctx, action, "success", res.sessionsEnded != null ? { rows: res.sessionsEnded } : {});
  return res;
}

export const changeMyPassword = (ctx, input = {}) => guarded(ctx, "account.password_changed", () => changeOwnPassword(ctx.admin, {
  user: user(ctx), sid: ctx.session.sid, current: String(input.current ?? ""), next: String(input.next ?? ""), repeat: String(input.repeat ?? ""), code: input.code, key: ctx.key,
}));
export const startMyTwoStep = (ctx, input = {}) => guarded(ctx, "account.2fa_started", () => startTwoStep(ctx.admin, { user: user(ctx), current: String(input.current ?? ""), key: ctx.key }));
export const confirmMyTwoStep = (ctx, input = {}) => guarded(ctx, "account.2fa_enabled", () => confirmTwoStep(ctx.admin, { user: user(ctx), blob: String(input.blob ?? ""), code: String(input.code ?? ""), key: ctx.key }));
export const disableMyTwoStep = (ctx, input = {}) => guarded(ctx, "account.2fa_disabled", () => disableTwoStep(ctx.admin, { user: user(ctx), current: String(input.current ?? ""), code: input.code, key: ctx.key }));
export const newMyRecoveryCodes = (ctx, input = {}) => guarded(ctx, "account.recovery_codes_renewed", () => newRecoveryCodes(ctx.admin, { user: user(ctx), current: String(input.current ?? ""), code: input.code, key: ctx.key }));
