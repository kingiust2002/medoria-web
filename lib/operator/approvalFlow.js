// lib/operator/approvalFlow.js — what an ACTION does when the person's policy says "this needs approval": file the change request,
// tell the person plainly, write one line to the activity log. Plain module (the audit writer and the client are passed in).
import { APPROVAL_MESSAGES, submitChange } from "./approvals.js";

// ctx = { admin, session, audit, panel }; spec as in approvals.submitChange. → the object the action returns to the screen.
export async function fileForApproval(ctx, spec) {
  const actor = ctx.session?.user;
  if (!actor) return { ok: false, error: APPROVAL_MESSAGES.unsupported };         // the old shared login never needs approval
  const res = await submitChange(ctx.admin, { actor, panel: ctx.panel, spec });
  const log = async (result, detail) => { try { await ctx.audit("approval.requested", { entity: spec.entity, ids: Number.isSafeInteger(spec.entityId) ? [spec.entityId] : undefined, result, detail }); } catch { /* decided already */ } };
  if (res.ok && res.duplicate) return { ok: true, pending: true, duplicate: true, message: APPROVAL_MESSAGES.alreadySubmitted };
  if (res.ok) {
    await log("success", { reason: spec.operation });
    return { ok: true, pending: true, requestId: res.request.id, message: APPROVAL_MESSAGES.submitted };
  }
  await log("failure", { reason: spec.operation });
  return { ok: false, error: APPROVAL_MESSAGES[res.error] || APPROVAL_MESSAGES.unavailable };
}
