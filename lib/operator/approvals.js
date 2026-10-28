// lib/operator/approvals.js — the approval queue. A person who may ask for a change but not make it (their per-operation policy says
// "needs approval") files a CHANGE REQUEST; the live data does not move until somebody else, who is allowed to review that kind of change,
// approves it. Plain module: the Supabase client and the executors are passed in, so every rule runs in unit tests.
//
// The rules (each one has a test):
//   * the live data is untouched while a request is pending;
//   * the reviewer is never the requester, must hold `<house>.approvals.view` and `<house>.<resource>.approve`, and is a different person;
//   * the request is claimed by ONE conditional update (pending → approved): two reviewers at the same moment cannot both execute it;
//   * the requester's account is re-read at execution: still active, still in the house, still allowed to ask for every operation;
//   * the change is applied only to the version it was prepared against (`base_updated_at`): a newer change is never overwritten —
//     the request fails as "stale" and the requester can resubmit it against the current record;
//   * a rejection needs a reason; the requester sees the status and the reason, and can resubmit or withdraw;
//   * nothing is deleted; every decision is one line in the activity log (by the caller).
import { canReview, decide, HOUSES, OPERATIONS } from "./authz.js";
import { getUser } from "./accounts.js";
import { isMissingTable } from "./security.js";
import { readAll, runPage } from "./listQuery.js";
import { tr } from "../panel/i18n.js";

export const APPROVAL_MESSAGES = {
  unavailable: tr("صف تأیید در دسترس نیست."),
  notAllowed: tr("اجازهٔ بررسی این درخواست را ندارید."),
  notFound: tr("درخواست پیدا نشد."),
  decided: tr("این درخواست قبلاً تعیین تکلیف شده است."),
  own: tr("درخواست خودتان را نمی‌توانید تأیید یا رد کنید."),
  reasonNeeded: tr("برای رد کردن، دلیل را بنویسید (حداقل ۳ نویسه)."),
  requesterGone: tr("درخواست‌دهنده دیگر اجازهٔ این کار را ندارد؛ درخواست اجرا نشد."),
  stale: tr("این رکورد پس از ثبت درخواست تغییر کرده است؛ تغییر اعمال نشد. درخواست‌دهنده باید دوباره ارسال کند."),
  execFailed: tr("اجرای تغییر ناموفق بود؛ چیزی تغییر نکرد."),
  unsupported: tr("این نوع تغییر هنوز از راه صف تأیید پشتیبانی نمی‌شود."),
  submitted: tr("برای تأیید ارسال شد؛ تا زمان تأیید، چیزی در سایت تغییر نمی‌کند."),
  alreadySubmitted: tr("همین درخواست قبلاً ارسال شده و منتظر تأیید است."),
  cancelledOk: tr("درخواست پس گرفته شد."),
};

const SUBJECT_MAX = 160;
const REASON_MAX = 500;
const PRODUCT_RESOURCE = "products";
export const resourceOf = (operation) => String(operation).split(".")[0];

const SELECT = "id,house,resource,operation,entity,entity_id,subject,requested_by,requested_at,request_reason,base_updated_at,before,proposed,status,reviewed_by,reviewed_at,review_reason,executed_at,exec_error,resubmitted_from";

// ── filing ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// spec: { operation, ops?, entity, entityId?, subject?, before?, proposed, baseUpdatedAt?, reason?, resubmittedFrom? }
export async function submitChange(admin, { actor, panel, spec }) {
  if (!admin) return { ok: false, error: "unavailable" };
  if (!actor || !HOUSES.includes(panel) || !(spec?.operation in OPERATIONS)) return { ok: false, error: "unsupported" };
  const ops = spec.ops?.length ? spec.ops : [spec.operation];
  // the person must be allowed to ASK for every operation of the change (a denied one is not a request, it is a refusal)
  if (ops.some((op) => decide(actor, panel, op).mode === "denied")) return { ok: false, error: "notAllowed" };
  const row = {
    house: panel, resource: resourceOf(spec.operation), operation: spec.operation, entity: String(spec.entity).slice(0, 60),
    entity_id: Number.isSafeInteger(spec.entityId) ? spec.entityId : null,
    subject: spec.subject ? String(spec.subject).slice(0, SUBJECT_MAX) : null,
    requested_by: actor.id,
    request_reason: spec.reason ? String(spec.reason).slice(0, REASON_MAX) : null,
    base_updated_at: spec.baseUpdatedAt || null,
    before: spec.before ?? null,
    proposed: { ...spec.proposed, __ops: ops },
    ...(spec.resubmittedFrom ? { resubmitted_from: spec.resubmittedFrom } : {}),
  };
  const { data, error } = await admin.from("operator_change_requests").insert(row).select(SELECT);
  if (error && (error.code === "23505" || /duplicate key/i.test(String(error.message || "")))) return { ok: true, duplicate: true };
  if (error) return { ok: false, error: isMissingTable(error) ? "unavailable" : "failed" };
  return { ok: true, request: Array.isArray(data) ? data[0] : data };
}

// ── reading ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const MINE_PAGE_SIZE = 25;

// EVERY pending request this person may decide (read in chunks; the old read stopped at 200 BEFORE filtering by who may decide, so a long
// queue hid requests and the badge counted fewer than there were). → { ok, toReview } | { ok: false, error }
export async function pendingForReview(admin, { actor, panel }) {
  if (!admin) return { ok: false, error: "unavailable" };
  const pending = await readAll((from, to) => admin.from("operator_change_requests").select(SELECT).eq("house", panel).eq("status", "pending").neq("requested_by", actor.id)
    .order("requested_at", { ascending: true }).order("id", { ascending: true }).range(from, to));
  if (!pending.ok) return { ok: false, error: isMissingTable(pending.error) ? "unavailable" : "failed" };
  return { ok: true, toReview: pending.rows.filter((r) => canReview(actor, r.requested_by, panel, r.resource)) };
}

// → { mine: [one page of the requests of this person, newest first], mineTotal, page, pageCount, toReview: [every pending one this person may decide] }
export async function listRequests(admin, { actor, panel, page = 1, size = MINE_PAGE_SIZE }) {
  if (!admin) return { ok: false, error: "unavailable" };
  const mine = await runPage((from, to) => admin.from("operator_change_requests").select(SELECT, { count: "exact" }).eq("requested_by", actor.id).eq("house", panel)
    .order("requested_at", { ascending: false }).order("id", { ascending: false }).range(from, to), { page, size });
  if (!mine.ok) return { ok: false, error: isMissingTable(mine.error) ? "unavailable" : "failed" };
  const pending = await pendingForReview(admin, { actor, panel });
  if (!pending.ok) return pending;
  return { ok: true, mine: mine.rows, mineTotal: mine.total, page: mine.page, pageCount: mine.pageCount, size, toReview: pending.toReview };
}

export async function countToReview(admin, { actor, panel }) {
  const r = await pendingForReview(admin, { actor, panel });
  return r.ok ? r.toReview.length : 0;
}

async function loadRequest(admin, id) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "notFound" };
  const { data, error } = await admin.from("operator_change_requests").select(SELECT).eq("id", id).limit(1);
  if (error) return { ok: false, error: isMissingTable(error) ? "unavailable" : "failed" };
  return data?.[0] ? { ok: true, request: data[0] } : { ok: false, error: "notFound" };
}

// ── the requester withdraws ──────────────────────────────────────────────────────────────────────────────────────────────
export async function cancelRequest(admin, { actor, panel, id }) {
  const got = await loadRequest(admin, id);
  if (!got.ok) return got;
  const r = got.request;
  if (r.requested_by !== actor.id || r.house !== panel) return { ok: false, error: "notFound" };
  if (r.status !== "pending") return { ok: false, error: "decided" };
  const { data, error } = await admin.from("operator_change_requests").update({ status: "cancelled" }).eq("id", id).eq("status", "pending").select("id");
  if (error) return { ok: false, error: "failed" };
  return data?.length ? { ok: true } : { ok: false, error: "decided" };
}

// ── the reviewer rejects ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function rejectRequest(admin, { reviewer, panel, id, reason }) {
  const text = String(reason ?? "").trim().slice(0, REASON_MAX);
  if (text.length < 3) return { ok: false, error: "reasonNeeded" };
  const got = await loadRequest(admin, id);
  if (!got.ok) return got;
  const r = got.request;
  if (r.house !== panel) return { ok: false, error: "notFound" };
  if (r.requested_by === reviewer.id) return { ok: false, error: "own" };
  if (!canReview(reviewer, r.requested_by, panel, r.resource)) return { ok: false, error: "notAllowed" };
  if (r.status !== "pending") return { ok: false, error: "decided" };
  const { data, error } = await admin.from("operator_change_requests")
    .update({ status: "rejected", reviewed_by: reviewer.id, reviewed_at: new Date().toISOString(), review_reason: text })
    .eq("id", id).eq("status", "pending").select("id");
  if (error) return { ok: false, error: "failed" };
  return data?.length ? { ok: true, request: r } : { ok: false, error: "decided" };
}

// ── the reviewer approves — and the change is applied ────────────────────────────────────────────────────────────────────
// executors: { [operation]: async ({ admin, request, reviewer }) => { ok:true } | { ok:false, error:"stale"|"notFound"|"failed"|string } }
export async function approveRequest(admin, { reviewer, panel, id, executors, now = () => new Date() }) {
  const got = await loadRequest(admin, id);
  if (!got.ok) return got;
  const r = got.request;
  if (r.house !== panel) return { ok: false, error: "notFound" };
  if (r.requested_by === reviewer.id) return { ok: false, error: "own" };
  if (!canReview(reviewer, r.requested_by, panel, r.resource)) return { ok: false, error: "notAllowed" };
  if (r.status !== "pending") return { ok: false, error: "decided" };
  const exec = executors?.[r.operation];
  if (!exec) return { ok: false, error: "unsupported" };

  // the requester as he is NOW: active, in the house, and still allowed to ask for every operation of the change
  const who = await getUser(admin, r.requested_by);
  if (!who.ok) return { ok: false, error: "unavailable" };
  const ops = Array.isArray(r.proposed?.__ops) && r.proposed.__ops.length ? r.proposed.__ops : [r.operation];
  const stillAllowed = who.user && who.user.status === "active" && who.user.houses.includes(panel) && ops.every((op) => decide(who.user, panel, op).mode !== "denied");
  if (!stillAllowed) {
    await admin.from("operator_change_requests").update({ status: "superseded" }).eq("id", id).eq("status", "pending");
    return { ok: false, error: "requesterGone", request: r };
  }

  // one winner: the conditional update claims the request
  const stamp = now().toISOString();
  const claim = await admin.from("operator_change_requests")
    .update({ status: "approved", reviewed_by: reviewer.id, reviewed_at: stamp }).eq("id", id).eq("status", "pending").select("id");
  if (claim.error) return { ok: false, error: "failed" };
  if (!claim.data?.length) return { ok: false, error: "decided" };

  let result;
  try { result = await exec({ admin, request: r, reviewer }); } catch { result = { ok: false, error: "failed" }; }
  if (!result?.ok) {
    const code = String(result?.error || "failed").slice(0, 200);
    await admin.from("operator_change_requests").update({ status: "failed", exec_error: code }).eq("id", id).eq("status", "approved");
    return { ok: false, error: code === "stale" ? "stale" : "execFailed", request: r, detail: code };
  }
  await admin.from("operator_change_requests").update({ executed_at: now().toISOString() }).eq("id", id).eq("status", "approved").is("executed_at", null);
  return { ok: true, request: r, result };
}

// ── the requester asks again after a rejection / a stale failure ────────────────────────────────────────────────────────
// `prepare(request)` re-reads the record and returns { before, baseUpdatedAt } (or { error }): the same proposal, fresh basis.
export async function resubmitRequest(admin, { actor, panel, id, prepare }) {
  const got = await loadRequest(admin, id);
  if (!got.ok) return got;
  const r = got.request;
  if (r.requested_by !== actor.id || r.house !== panel) return { ok: false, error: "notFound" };
  if (!["rejected", "failed", "superseded", "cancelled"].includes(r.status)) return { ok: false, error: "decided" };
  const fresh = await prepare(r);
  if (!fresh || fresh.error) return { ok: false, error: fresh?.error || "failed" };
  const { __ops, ...proposed } = r.proposed || {};
  return submitChange(admin, { actor, panel, spec: {
    operation: r.operation, ops: __ops, entity: r.entity, entityId: r.entity_id, subject: r.subject, before: fresh.before, proposed,
    baseUpdatedAt: fresh.baseUpdatedAt, reason: r.request_reason, resubmittedFrom: r.id,
  } });
}

export function approvalMessage(result) {
  if (!result || result.ok) return null;
  return APPROVAL_MESSAGES[result.error] || APPROVAL_MESSAGES.execFailed;
}
export { PRODUCT_RESOURCE };
