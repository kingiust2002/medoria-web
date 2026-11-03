// lib/operator/userActionsCore.js — the work behind the "people" screen of BOTH panels. Plain module: the caller (the server-action
// files, which own the session check) passes `ctx = { admin, session, audit, panel, reauthenticate }`. Every change goes through
// accounts.js, which asks authz.checkUserChange first; this layer adds
//   * visibility (you only see and touch people of your own houses unless you are an owner),
//   * the manager's RE-AUTHENTICATION (their own password, and a second-factor code when they have one) before a sensitive change:
//     a new account, more power for someone, archive / restore, a password reset, a second-factor change or reset,
//   * the RELIABLE history rule (lib/operator/userAudit.js): an "attempt" entry first — no entry, no change — then the real outcome,
//   * the typed-list parsing and the one-time temporary password.
import { checkUserChange, decide, sensitivityOf } from "./authz.js";
import { archiveUser, createUser, getUser, listUsers, resetTwoFactor, restoreUser, revokeUserSessions, setPassword, updateUser } from "./accounts.js";
import { canSee, cleanApproval, cleanHouses, generateTempPassword, messageFor, parsePatterns, USER_MESSAGES, visibleUsers } from "./userAdmin.js";
import { normalizeUsername } from "./passwords.js";
import { SELF_MESSAGES } from "./selfSecurity.js";
import { sensitive, writeUserEntry } from "./userAudit.js";
import { codeOf, diffAccess } from "./accessCatalog.js";
import { HOUSES, isValidOperation, isValidPattern } from "./authz.js";
import { readAll } from "./listQuery.js";
import { tr } from "../panel/i18n.js";

const SELF_PASSWORD = tr("رمز عبور خودتان را از «تنظیمات» تغییر دهید (نه از این صفحه).");
const NOT_VISIBLE = USER_MESSAGES.notFound;
const REAUTH_REQUIRED = tr("برای این کار، رمز عبور خودتان را دوباره وارد کنید.");
const OWNER_ONLY_RECOVERY = tr("بازیابی ورود دومرحله‌ای فقط با مدیر اصلی است.");
const SELF_RECOVERY = tr("برای حساب خودتان این کار از این صفحه ممکن نیست؛ اگر دسترسی خودتان را از دست داده‌اید، روش اضطراری روی سرور را بخوانید (docs/OPERATOR_ACCOUNTS.md).");
const BAD_PATTERNS = tr("بعضی از مجوزهای تایپ‌شده شناخته‌شده نیستند.");
const OPEN_QUOTE_STATUSES = ["new", "contacted", "in_progress", "quoted"];
const QUOTE_TABLE = { health: "quote_requests", beauty: "beauty_quote_requests" };
const POWER_FIELDS = ["role", "houses", "allow", "deny", "approval", "status", "require2fa"];

const actorOf = (ctx) => ctx.session.user;

// The permission lists of a request. The access editor sends real arrays (`allow` / `deny`: exact permissions or patterns); the older typed
// textareas (`allowText` / `denyText`) still work. Anything that is not a list of known patterns is refused, never trimmed to something else.
const MAX_LIST = 200;
function listField(change, arrayKey, textKey) {
  if (change[arrayKey] !== undefined) {
    const list = change[arrayKey];
    if (!Array.isArray(list) || list.length > MAX_LIST) return { invalid: ["list"] };
    const clean = [...new Set(list.map((x) => (typeof x === "string" ? x.trim().toLowerCase() : "")))];
    const bad = clean.filter((x) => !isValidPattern(x));
    return bad.length ? { invalid: bad.slice(0, 20).map((x) => x || "?") } : { patterns: clean };
  }
  if (change[textKey] !== undefined) { const parsed = parsePatterns(change[textKey]); return parsed.invalid.length ? { invalid: parsed.invalid } : { patterns: parsed.patterns }; }
  return null;
}

// An approval policy is { health: [op…], beauty: [op…] } with only known houses and known operations. Anything else is refused as a whole:
// cleanApproval() would quietly DROP what it does not know, and a policy must never become something else than what was sent.
function approvalShapeOk(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  return Object.entries(input).every(([house, ops]) => HOUSES.includes(house) && Array.isArray(ops) && ops.length <= 100 && ops.every((op) => isValidOperation(op)));
}
const BAD_APPROVAL = USER_MESSAGES.authz.bad_approval;

// What changes in words, for the history: short codes only ("health_products_price"), at most 30 per list.
function accessDetail(before, after) {
  const d = diffAccess(before, after);
  const detail = {};
  if (d.added.length) detail.perms_added = d.added.map(codeOf).slice(0, 30);
  if (d.removed.length) detail.perms_removed = d.removed.map(codeOf).slice(0, 30);
  if (d.modes.length) detail.modes_changed = d.modes.map((m) => `${m.house}_${m.op.replace(".", "_")}`).slice(0, 30);
  return detail;
}

// A refusal that needs no "attempt" entry (nothing was changed and nothing is about to be): written best-effort, as `rejected`.
async function logRejected(ctx, action, targetUserId, detail) {
  await writeUserEntry(ctx, action, "rejected", targetUserId, detail);
}

// stable text of a value for "did it change?" (order of lists and keys does not matter)
const norm = (v) => JSON.stringify(sortDeep(v));
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
  return v;
}

// ── the manager proves who they are, again ────────────────────────────────────────────────────────────────────────────────────────
// reauth: { password, code }. Null = proven; otherwise the refusal to return. Nothing is read, planned or written before this passes for a
// sensitive change, and a wrong answer is itself written to the history (best effort: the refusal stands either way).
async function confirmManager(ctx, reauth, targetUserId, why) {
  const needCode = Boolean(actorOf(ctx).hasTotp);
  if (typeof ctx.reauthenticate !== "function") return { ok: false, error: REAUTH_REQUIRED, reauth: true, needCode };     // no way to check → no way in
  if (!reauth || typeof reauth.password !== "string" || !reauth.password) return { ok: false, error: REAUTH_REQUIRED, reauth: true, needCode };
  let r;
  try { r = await ctx.reauthenticate({ password: reauth.password, code: reauth.code }); } catch { r = { ok: false, error: "unavailable" }; }
  if (r?.ok) {
    // the proof takes a human's time: the manager must still be the same, active manager afterwards (nobody changed their power or closed their account meanwhile)
    const fresh = await getUser(ctx.admin, actorOf(ctx).id);
    const me = actorOf(ctx);
    if (!fresh.ok || !fresh.user || fresh.user.status !== "active" || fresh.user.authzVersion !== me.authzVersion) return { ok: false, error: USER_MESSAGES.conflict, conflict: true };
    return null;
  }
  await logRejected(ctx, "user.reauth_failed", targetUserId, { reason: String(r?.error || "failed").slice(0, 40), method: why });
  return { ok: false, error: SELF_MESSAGES[r?.error] || SELF_MESSAGES.failed, reauth: true, needCode: needCode || r?.error === "needCode" };
}

export async function listPeople(ctx) {
  const all = await listUsers(ctx.admin);
  if (!all.ok) return { ok: false, error: USER_MESSAGES.unavailable };
  return { ok: true, users: visibleUsers(actorOf(ctx), all.users) };
}

// input: { username, displayName, role, houses, allowText, denyText, approval, require2fa }, reauth: { password, code }
export async function createPerson(ctx, input = {}, reauth) {
  if (input.approval !== undefined && !approvalShapeOk(input.approval)) return { ok: false, error: BAD_APPROVAL };
  const allow = listField(input, "allow", "allowText") || { patterns: [] }, deny = listField(input, "deny", "denyText") || { patterns: [] };
  if (allow.invalid || deny.invalid) return { ok: false, error: BAD_PATTERNS, invalid: [...(allow.invalid || []), ...(deny.invalid || [])] };
  const draft = {
    role: input.role, houses: cleanHouses(input.houses), allow: allow.patterns, deny: deny.patterns, approval: cleanApproval(input.approval), status: "active",
  };
  // the rules first, without side effects: a request that would be refused anyway must not cost a second-factor code
  const all = await listUsers(ctx.admin);
  if (!all.ok) return { ok: false, error: USER_MESSAGES.unavailable };
  const verdict = checkUserChange({ actor: actorOf(ctx), target: null, change: draft, users: all.users });
  if (!verdict.ok) {
    await logRejected(ctx, "user.create", undefined, { reason: (verdict.errors[0] || "failed").slice(0, 40), role: String(input.role || "").slice(0, 30) });
    return { ok: false, error: messageFor({ error: "notAllowed", codes: verdict.errors }) };
  }
  const refusal = await confirmManager(ctx, reauth, undefined, "create");
  if (refusal) return refusal;

  const tempPassword = generateTempPassword();
  const res = await sensitive(ctx, { action: "user.create", targetUserId: undefined, detail: { role: draft.role, houses: draft.houses, ...accessDetail({ role: "viewer", houses: [], allow: [], deny: [], approval: {} }, draft) } }, async () => {
    const made = await createUser(ctx.admin, {
      actor: actorOf(ctx),
      input: { username: input.username, displayName: input.displayName, password: tempPassword, ...draft, require2fa: input.require2fa !== false },
    });
    if (!made.ok) return { ok: false, rejected: made.error === "notAllowed", reason: made.codes?.[0] || made.error, error: messageFor(made) };
    return { ok: true, user: made.user, auditDetail: { role: made.user.role, houses: made.user.houses }, target: made.user.id };
  });
  if (!res.ok) return { ok: false, error: res.error, auditFailed: res.auditFailed };
  return { ok: true, user: res.user, tempPassword, auditWarning: res.auditWarning };       // shown once, then only its hash exists
}

// change: any of { displayName, role, houses, status, require2fa, allowText, denyText, approval }
export async function updatePerson(ctx, id, change = {}, expectedVersion, reauth) {
  const target = await visibleTarget(ctx, id);
  if (!target.ok) return target;
  const before = target.user;
  if (before.status === "archived") return { ok: false, error: USER_MESSAGES.archived };
  if (change.approval !== undefined && !approvalShapeOk(change.approval)) return { ok: false, error: BAD_APPROVAL };
  const wanted = {};
  if (change.displayName !== undefined) wanted.displayName = change.displayName;
  if (change.role !== undefined) wanted.role = change.role;
  if (change.houses !== undefined) wanted.houses = cleanHouses(change.houses);
  if (change.status !== undefined) wanted.status = change.status;
  if (change.require2fa !== undefined) wanted.require2fa = Boolean(change.require2fa);
  if (change.approval !== undefined) wanted.approval = cleanApproval(change.approval);
  for (const [arrayKey, textKey, field] of [["allow", "allowText", "allow"], ["deny", "denyText", "deny"]]) {
    const got = listField(change, arrayKey, textKey);
    if (!got) continue;
    if (got.invalid) return { ok: false, error: BAD_PATTERNS, invalid: got.invalid };
    wanted[field] = got.patterns;
  }
  if (wanted.status === "archived") return { ok: false, error: USER_MESSAGES.useArchive };
  // only what really differs is sent (and judged): an untouched form field must not look like a change of power
  const patch = {};
  for (const [k, v] of Object.entries(wanted)) if (norm(v) !== norm(before[k])) patch[k] = v;
  if (!Object.keys(patch).length) return { ok: true, user: before, sessionsEnded: false, sessionsRevoked: true, unchanged: true };

  const all = await listUsers(ctx.admin);
  if (!all.ok) return { ok: false, error: USER_MESSAGES.unavailable };
  const verdict = checkUserChange({ actor: actorOf(ctx), target: before, change: patch, users: all.users });
  const fields = Object.keys(patch);
  if (!verdict.ok) {
    await logRejected(ctx, "user.update", id, { reason: (verdict.errors[0] || "failed").slice(0, 40), fields });
    return { ok: false, error: messageFor({ error: verdict.errors.includes("last_owner") ? "lastOwner" : "notAllowed", codes: verdict.errors }) };
  }
  const reasons = sensitivityOf(before, { ...before, ...patch });
  if (reasons.length) {
    const refusal = await confirmManager(ctx, reauth, id, reasons[0]);
    if (refusal) return refusal;
  }
  const action = patch.status && patch.status !== before.status ? "user.status" : "user.update";
  const run = async () => {
    const res = await updateUser(ctx.admin, { actor: actorOf(ctx), id, change: patch, expectedVersion: expectedVersion ?? before.version });   // bound to the state that was checked
    if (!res.ok) return { ok: false, rejected: res.error === "notAllowed" || res.error === "lastOwner", reason: res.codes?.[0] || res.error, error: messageFor(res), conflict: res.error === "conflict" };
    return { ok: true, user: res.user, sessionsEnded: res.sessions === "end_all", sessionsRevoked: res.sessionsRevoked !== false, auditDetail: { kept: res.sessions === "end_all" ? "ended" : "same" } };
  };
  const detail = { fields, status: patch.status, from_status: patch.status ? before.status : undefined, role: patch.role, houses: patch.houses, ...accessDetail(before, { ...before, ...patch }) };
  const touchesPower = POWER_FIELDS.some((k) => patch[k] !== undefined);
  // a change of role / houses / permissions / approval policy / status / second-factor rule has a dependable trace or does not happen;
  // a new display name alone is not a change of power and is logged as before (best effort)
  const res = touchesPower ? await sensitive(ctx, { action, targetUserId: id, detail }, run) : await bestEffort(ctx, { action, targetUserId: id, detail }, run);
  if (!res.ok) return { ok: false, error: res.error, conflict: res.conflict, auditFailed: res.auditFailed };
  return { ok: true, user: res.user, sessionsEnded: res.sessionsEnded, sessionsRevoked: res.sessionsRevoked, auditWarning: res.auditWarning };
}

async function bestEffort(ctx, { action, targetUserId, detail }, run) {
  const res = await run();
  await writeUserEntry(ctx, action, res.ok ? "success" : res.rejected ? "rejected" : "failure", targetUserId, res.ok ? detail : { ...detail, reason: String(res.reason || "failed").slice(0, 40) });
  return res;
}

// ── archive and restore ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Archive: the person has left. Re-authentication, an "attempt" entry, then accounts.archiveUser (which refuses yourself and the last
// active owner, and ends every session). Their old responsibilities are NOT touched here: the manager moves them on purpose
// (`transferResponsibilities`), which is why the screen shows the count first.
export async function archivePerson(ctx, id, expectedVersion, reauth) {
  const target = await visibleTarget(ctx, id);
  if (!target.ok) return target;
  if (target.user.status === "archived") return { ok: false, error: USER_MESSAGES.archived };
  const all = await listUsers(ctx.admin);
  if (!all.ok) return { ok: false, error: USER_MESSAGES.unavailable };
  const verdict = checkUserChange({ actor: actorOf(ctx), target: target.user, change: { status: "archived" }, users: all.users });
  if (!verdict.ok) {
    await logRejected(ctx, "user.archive", id, { reason: (verdict.errors[0] || "failed").slice(0, 40), from_status: target.user.status });
    return { ok: false, error: messageFor({ error: verdict.errors.includes("last_owner") ? "lastOwner" : "notAllowed", codes: verdict.errors }) };
  }
  const refusal = await confirmManager(ctx, reauth, id, "archive");
  if (refusal) return refusal;
  const res = await sensitive(ctx, { action: "user.archive", targetUserId: id, detail: { from_status: target.user.status, role: target.user.role } }, async () => {
    const done = await archiveUser(ctx.admin, { actor: actorOf(ctx), id, expectedVersion: expectedVersion ?? target.user.version });
    if (!done.ok) return { ok: false, rejected: done.error === "notAllowed" || done.error === "lastOwner", reason: done.codes?.[0] || done.error, error: messageFor(done), conflict: done.error === "conflict" };
    return { ok: true, user: done.user, sessionsRevoked: done.sessionsRevoked !== false, auditDetail: { kept: "ended" } };
  });
  if (!res.ok) return { ok: false, error: res.error, conflict: res.conflict, auditFailed: res.auditFailed };
  return { ok: true, user: res.user, sessionsRevoked: res.sessionsRevoked, auditWarning: res.auditWarning };
}

// Restore: `change` is what the manager reviewed (role / houses / allowText / denyText / approval / require2fa), the same shape as an update.
export async function restorePerson(ctx, id, change = {}, expectedVersion, reauth) {
  const target = await visibleTarget(ctx, id);
  if (!target.ok) return target;
  if (target.user.status !== "archived") return { ok: false, error: USER_MESSAGES.notArchived };
  if (change.approval !== undefined && !approvalShapeOk(change.approval)) return { ok: false, error: BAD_APPROVAL };
  const wanted = {};
  if (change.role !== undefined) wanted.role = change.role;
  if (change.houses !== undefined) wanted.houses = cleanHouses(change.houses);
  if (change.require2fa !== undefined) wanted.require2fa = Boolean(change.require2fa);
  if (change.approval !== undefined) wanted.approval = cleanApproval(change.approval);
  for (const [arrayKey, textKey, field] of [["allow", "allowText", "allow"], ["deny", "denyText", "deny"]]) {
    const got = listField(change, arrayKey, textKey);
    if (!got) continue;
    if (got.invalid) return { ok: false, error: BAD_PATTERNS, invalid: got.invalid };
    wanted[field] = got.patterns;
  }
  const all = await listUsers(ctx.admin);
  if (!all.ok) return { ok: false, error: USER_MESSAGES.unavailable };
  const verdict = checkUserChange({ actor: actorOf(ctx), target: target.user, change: { ...wanted, status: "active" }, users: all.users });
  if (!verdict.ok) {
    await logRejected(ctx, "user.restore", id, { reason: (verdict.errors[0] || "failed").slice(0, 40) });
    return { ok: false, error: messageFor({ error: "notAllowed", codes: verdict.errors }) };
  }
  const refusal = await confirmManager(ctx, reauth, id, "restore");
  if (refusal) return refusal;
  const res = await sensitive(ctx, { action: "user.restore", targetUserId: id, detail: { from_status: "archived", status: "active", role: wanted.role ?? target.user.role, houses: wanted.houses ?? target.user.houses, ...accessDetail(target.user, { ...target.user, ...wanted }) } }, async () => {
    const done = await restoreUser(ctx.admin, { actor: actorOf(ctx), id, expectedVersion: expectedVersion ?? target.user.version, change: wanted });
    if (!done.ok) return { ok: false, rejected: done.error === "notAllowed", reason: done.codes?.[0] || done.error, error: messageFor(done), conflict: done.error === "conflict" };
    return { ok: true, user: done.user, sessionsRevoked: done.sessionsRevoked !== false, auditDetail: { fields: Object.keys(wanted) } };
  });
  if (!res.ok) return { ok: false, error: res.error, conflict: res.conflict, auditFailed: res.auditFailed };
  return { ok: true, user: res.user, sessionsRevoked: res.sessionsRevoked, auditWarning: res.auditWarning };
}

// ── responsibilities of a person who leaves ───────────────────────────────────────────────────────────────────────────────────────
// What is still in their hands in THIS house: open customer requests assigned to them. (Pending approvals of an archived requester are not
// "moved": approvals.approveRequest re-reads the requester at the moment of approval and refuses an account that is not active.)
export async function responsibilitiesOf(ctx, id) {
  const target = await visibleTarget(ctx, id);
  if (!target.ok) return target;
  const table = QUOTE_TABLE[ctx.panel];
  if (!table) return { ok: false, error: USER_MESSAGES.failed };
  // an EXACT count (a head count, not a capped read): the manager decides on this number
  const { count, error } = await ctx.admin.from(table).select("id", { count: "exact", head: true }).eq("assigned_user_id", id).in("status", OPEN_QUOTE_STATUSES);
  if (error) return { ok: true, quotes: null };                         // before migration 37 there is no real assignee to count; "cannot count" is shown as such
  return { ok: true, quotes: count ?? 0 };
}

const TRANSFER_TARGET = tr("گیرنده باید یک کاربر فعال همین بخش باشد.");
const TRANSFER_DENIED = tr("اجازهٔ واگذاری درخواست‌ها را ندارید.");
const CHUNK = 200;

// Moves the OPEN customer requests of one person to another active person of this house. Closed and archived requests keep the name they had.
// Works in chunks of ids (a plain read or update returns at most 1,000 rows); the result is the exact number moved, and a failure part-way says so.
export async function transferResponsibilities(ctx, fromId, toId) {
  const actor = actorOf(ctx);
  const from = await visibleTarget(ctx, fromId);
  if (!from.ok) return from;
  const to = await visibleTarget(ctx, toId);
  if (!to.ok) return { ok: false, error: TRANSFER_TARGET };
  if (fromId === toId || to.user.status !== "active" || !to.user.houses.includes(ctx.panel)) return { ok: false, error: TRANSFER_TARGET };
  if (decide(actor, ctx.panel, "quotes.assign").mode !== "direct") { await logRejected(ctx, "user.responsibilities_transferred", fromId, { reason: "quotes.assign" }); return { ok: false, error: TRANSFER_DENIED }; }
  const table = QUOTE_TABLE[ctx.panel];
  const res = await sensitive(ctx, { action: "user.responsibilities_transferred", targetUserId: fromId, detail: { to: to.user.username } }, async () => {
    const ids = await readAll((a, b) => ctx.admin.from(table).select("id").eq("assigned_user_id", fromId).in("status", OPEN_QUOTE_STATUSES).order("id", { ascending: true }).range(a, b));
    if (!ids.ok) return { ok: false, reason: "failed", error: USER_MESSAGES.failed };
    let moved = 0;
    for (let i = 0; i < ids.rows.length; i += CHUNK) {
      const chunk = ids.rows.slice(i, i + CHUNK).map((r) => r.id);
      // still the same person's, still open: a request that changed meanwhile is simply not touched
      const { data, error } = await ctx.admin.from(table).update({ assigned_to: to.user.displayName, assigned_user_id: toId }).eq("assigned_user_id", fromId).in("status", OPEN_QUOTE_STATUSES).in("id", chunk).select("id");
      if (error) return { ok: false, reason: "failed", error: USER_MESSAGES.failed, partial: moved, auditDetail: { moved } };
      moved += data?.length || 0;
    }
    return { ok: true, count: moved, auditDetail: { moved } };
  });
  if (!res.ok) return { ok: false, error: res.error, partial: res.partial, auditFailed: res.auditFailed };
  return { ok: true, count: res.count, auditWarning: res.auditWarning };
}

// ── password and second-factor recovery ───────────────────────────────────────────────────────────────────────────────────────────
// A new temporary password for somebody else; every session of theirs ends and they must change it at the next login.
export async function resetPersonPassword(ctx, id, reauth) {
  const actor = actorOf(ctx);
  if (id === actor.id) return { ok: false, error: SELF_PASSWORD };
  const target = await visibleTarget(ctx, id);
  if (!target.ok) return target;
  // the same rules as any change to that person (an owner's password is an owner's business; houses; an archived account first needs a restore)
  const all = await listUsers(ctx.admin);
  const verdict = checkUserChange({ actor, target: target.user, change: {}, users: all.users || [] });
  if (!verdict.ok) {
    await logRejected(ctx, "user.password_reset", id, { reason: verdict.errors[0] });
    return { ok: false, error: messageFor({ error: "notAllowed", codes: verdict.errors }) };
  }
  const refusal = await confirmManager(ctx, reauth, id, "password_reset");
  if (refusal) return refusal;
  const tempPassword = generateTempPassword();
  const res = await sensitive(ctx, { action: "user.password_reset", targetUserId: id, detail: {} }, async () => {
    const done = await setPassword(ctx.admin, { userId: id, password: tempPassword, forceChange: true, expectedVersion: target.user.version });
    if (!done.ok) return { ok: false, reason: done.error, error: messageFor(done), conflict: done.error === "conflict" };
    return { ok: true, sessionsRevoked: done.sessionsRevoked !== false, auditDetail: { kept: "ended" } };
  });
  if (!res.ok) return { ok: false, error: res.error, conflict: res.conflict, auditFailed: res.auditFailed };
  return { ok: true, tempPassword, sessionsRevoked: res.sessionsRevoked, auditWarning: res.auditWarning };
}

// Somebody lost the phone AND the recovery codes. Only an OWNER can do this, only after proving themself again, never for themself.
// The result is not a shortcut: the old seed and every recovery code are gone, a new temporary password replaces the old one, all sessions end,
// and the person's next sign-in opens only the security screen until they have enrolled a NEW second factor.
export async function resetPersonTwoFactor(ctx, id, reauth) {
  const actor = actorOf(ctx);
  if (actor.role !== "owner") { await logRejected(ctx, "user.twofa_reset", id, { reason: "owner_only" }); return { ok: false, error: OWNER_ONLY_RECOVERY }; }
  if (id === actor.id) return { ok: false, error: SELF_RECOVERY };
  const target = await visibleTarget(ctx, id);
  if (!target.ok) return target;
  const all = await listUsers(ctx.admin);
  const verdict = checkUserChange({ actor, target: target.user, change: {}, users: all.users || [] });
  if (!verdict.ok) {
    await logRejected(ctx, "user.twofa_reset", id, { reason: verdict.errors[0] });
    return { ok: false, error: messageFor({ error: "notAllowed", codes: verdict.errors }) };
  }
  const refusal = await confirmManager(ctx, reauth, id, "twofa_reset");
  if (refusal) return refusal;
  const tempPassword = generateTempPassword();
  const res = await sensitive(ctx, { action: "user.twofa_reset", targetUserId: id, detail: {} }, async () => {
    const done = await resetTwoFactor(ctx.admin, { id, password: tempPassword, expectedVersion: target.user.version });
    if (!done.ok) return { ok: false, reason: done.error, error: messageFor(done), conflict: done.error === "conflict" };
    return { ok: true, sessionsRevoked: done.sessionsRevoked !== false, auditDetail: { kept: "ended" } };
  });
  if (!res.ok) return { ok: false, error: res.error, conflict: res.conflict, auditFailed: res.auditFailed };
  return { ok: true, tempPassword, sessionsRevoked: res.sessionsRevoked, auditWarning: res.auditWarning };
}

// Ending sessions only takes power away, so it needs no second proof and is never blocked by a log outage (in an emergency the door must close).
// The entry is still written, best effort.
export async function endPersonSessions(ctx, id) {
  const target = await visibleTarget(ctx, id);
  if (!target.ok) return target;
  const all = await listUsers(ctx.admin);
  const verdict = checkUserChange({ actor: actorOf(ctx), target: target.user, change: {}, users: all.users || [] });
  if (!verdict.ok && id !== actorOf(ctx).id && target.user.status !== "archived") {
    await logRejected(ctx, "user.sessions_ended", id, { reason: verdict.errors[0] });
    return { ok: false, error: messageFor({ error: "notAllowed", codes: verdict.errors }) };
  }
  // closing a door is easy, but only on the account that was checked: look once more right before acting
  const again = await getUser(ctx.admin, id);
  if (!again.ok || !again.user || again.user.version !== target.user.version) { await logRejected(ctx, "user.sessions_ended", id, { reason: "conflict" }); return { ok: false, error: USER_MESSAGES.conflict, conflict: true }; }
  const res = await revokeUserSessions(ctx.admin, id);
  if (!res.ok) { await writeUserEntry(ctx, "user.sessions_ended", "failure", id, {}); return { ok: false, error: USER_MESSAGES.failed }; }
  await writeUserEntry(ctx, "user.sessions_ended", "success", id, { rows: res.count });
  return { ok: true, count: res.count };
}

async function visibleTarget(ctx, id) {
  const got = await getUser(ctx.admin, id);
  if (!got.ok) return { ok: false, error: USER_MESSAGES.unavailable };
  if (!got.user || !canSee(actorOf(ctx), got.user)) return { ok: false, error: NOT_VISIBLE };    // never reveals that the person exists
  return { ok: true, user: got.user };
}

export { normalizeUsername };
