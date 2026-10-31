// lib/operator/approvalActionsCore.js — the work behind the approvals screen of BOTH panels (approve / reject / withdraw / resubmit and
// the view). Plain module: the action files own the session check and pass ctx = { admin, session, audit, auditEntry, panel,
// executors, prepare, revalidate }. Rules live in approvals.js; this layer adds the person (a personal, unrestricted account), the
// activity-log lines (who decided what, with before/after of the change) and the readable view.
import { actorOf } from "./access.js";
import { canResubmit } from "./approvable.js";
import { APPROVAL_MESSAGES, approveRequest, cancelRequest, listRequests, rejectRequest, resubmitRequest } from "./approvals.js";
import { tr } from "../panel/i18n.js";

const NEEDS_PERSON = tr("این بخش فقط برای حساب شخصی است.");
const msg = (error) => APPROVAL_MESSAGES[error] || APPROVAL_MESSAGES.execFailed;

function person(ctx) {
  if (!ctx.session?.user) return null;                 // the old shared login has no approvals
  return actorOf(ctx.session, ctx.panel);              // null while restricted
}
async function log(ctx, action, result, request, extra = {}) {
  try {
    await ctx.audit(action, { entity: request?.entity, ids: Number.isSafeInteger(request?.entity_id) ? [request.entity_id] : undefined, requestId: request?.id, targetUserId: request?.requested_by, result, ...extra });
  } catch { /* the decision is already taken */ }
}
const stripOps = ({ __ops, ...rest } = {}) => rest;

export async function approvalsView(ctx, { page = 1 } = {}) {
  const actor = person(ctx);
  if (!actor) return { ok: false, error: NEEDS_PERSON };
  const res = await listRequests(ctx.admin, { actor, panel: ctx.panel, page });
  if (!res.ok) return { ok: false, error: msg(res.error) };
  // names for the people involved (display names only)
  const ids = [...new Set([...res.mine, ...res.toReview].flatMap((r) => [r.requested_by, r.reviewed_by]).filter(Boolean))];
  let names = {};
  if (ids.length) {
    const { data } = await ctx.admin.from("operator_users").select("id,display_name").in("id", ids);
    names = Object.fromEntries((data || []).map((u) => [u.id, u.display_name]));
  }
  const shape = (r) => ({
    id: r.id, operation: r.operation, subject: r.subject, entityId: r.entity_id, status: r.status, requestedAt: r.requested_at, reviewedAt: r.reviewed_at,
    requestedBy: names[r.requested_by] || "", reviewedBy: r.reviewed_by ? names[r.reviewed_by] || "" : "", reviewReason: r.review_reason || "", execError: r.exec_error || "",
    reason: r.request_reason || "", before: r.before || {}, proposed: stripOps(r.proposed), resubmitted: Boolean(r.resubmitted_from), canResubmit: canResubmit(r.operation),
  });
  return { ok: true, mine: res.mine.map(shape), toReview: res.toReview.map(shape), minePaging: { page: res.page, pageCount: res.pageCount, total: res.mineTotal, size: res.size } };
}

export async function approve(ctx, id) {
  const actor = person(ctx);
  if (!actor) return { ok: false, error: NEEDS_PERSON };
  const res = await approveRequest(ctx.admin, { reviewer: actor, panel: ctx.panel, id, executors: ctx.executors });
  if (!res.ok) {
    if (res.request) await log(ctx, "approval.approved", "failure", res.request, { detail: { reason: String(res.detail || res.error).slice(0, 40) } });
    else if (res.error === "notAllowed" || res.error === "own") await log(ctx, "approval.approved", "rejected", undefined, { detail: { reason: res.error } });
    return { ok: false, error: msg(res.error), stale: res.error === "stale" };
  }
  await log(ctx, "approval.approved", "success", res.request, { before: res.request.before, after: stripOps(res.request.proposed), detail: { reason: res.request.operation } });
  if (ctx.revalidate) ctx.revalidate();
  return { ok: true };
}

export async function reject(ctx, id, reason) {
  const actor = person(ctx);
  if (!actor) return { ok: false, error: NEEDS_PERSON };
  const res = await rejectRequest(ctx.admin, { reviewer: actor, panel: ctx.panel, id, reason });
  if (!res.ok) {
    if (res.error === "notAllowed" || res.error === "own") await log(ctx, "approval.rejected", "rejected", undefined, { detail: { reason: res.error } });
    return { ok: false, error: msg(res.error) };
  }
  await log(ctx, "approval.rejected", "success", res.request, { detail: { reason: res.request.operation } });
  return { ok: true };
}

export async function cancel(ctx, id) {
  const actor = person(ctx);
  if (!actor) return { ok: false, error: NEEDS_PERSON };
  const res = await cancelRequest(ctx.admin, { actor, panel: ctx.panel, id });
  if (!res.ok) return { ok: false, error: msg(res.error) };
  await log(ctx, "approval.cancelled", "success", { id });
  return { ok: true, message: APPROVAL_MESSAGES.cancelledOk };
}

export async function resubmit(ctx, id) {
  const actor = person(ctx);
  if (!actor) return { ok: false, error: NEEDS_PERSON };
  const res = await resubmitRequest(ctx.admin, { actor, panel: ctx.panel, id, prepare: ctx.prepare });
  if (!res.ok) return { ok: false, error: msg(res.error) };
  if (res.duplicate) return { ok: true, duplicate: true, message: APPROVAL_MESSAGES.alreadySubmitted };
  await log(ctx, "approval.requested", "success", res.request, { detail: { reason: res.request.operation } });
  return { ok: true, message: APPROVAL_MESSAGES.submitted };
}
