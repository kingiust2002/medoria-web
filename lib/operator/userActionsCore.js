// lib/operator/userActionsCore.js — the work behind the "people" screen of BOTH panels. Plain module: the caller (the server-action
// files, which own the session check) passes `ctx = { admin, session, audit, panel }`. Every change goes through accounts.js, which
// asks authz.checkUserChange first; this layer adds visibility (you only see and touch people of your own houses unless you are an
// owner), the typed-list parsing, the one-time temporary password, and the activity-log line (who, to whom, what result).
import { checkUserChange } from "./authz.js";
import { createUser, getUser, listUsers, revokeUserSessions, setPassword, updateUser } from "./accounts.js";
import { canSee, cleanApproval, cleanHouses, generateTempPassword, messageFor, parsePatterns, USER_MESSAGES, visibleUsers } from "./userAdmin.js";
import { normalizeUsername } from "./passwords.js";
import { tr } from "../panel/i18n.js";

const SELF_PASSWORD = tr("رمز عبور خودتان را از «تنظیمات» تغییر دهید (نه از این صفحه).");
const NOT_VISIBLE = USER_MESSAGES.notFound;

const actorOf = (ctx) => ctx.session.user;

// One activity-log line for an account action. `result`: success | failure | rejected.
async function log(ctx, action, result, targetUserId, detail) {
  try { await ctx.audit(action, { entity: "operator_users", result, targetUserId, detail }); } catch { /* the outcome is already decided */ }
}

export async function listPeople(ctx) {
  const all = await listUsers(ctx.admin);
  if (!all.ok) return { ok: false, error: USER_MESSAGES.unavailable };
  return { ok: true, users: visibleUsers(actorOf(ctx), all.users) };
}

// input: { username, displayName, role, houses, allowText, denyText, approval, require2fa }
export async function createPerson(ctx, input = {}) {
  const allow = parsePatterns(input.allowText), deny = parsePatterns(input.denyText);
  if (allow.invalid.length || deny.invalid.length) return { ok: false, error: tr("بعضی از مجوزهای تایپ‌شده شناخته‌شده نیستند."), invalid: [...allow.invalid, ...deny.invalid] };
  const tempPassword = generateTempPassword();
  const res = await createUser(ctx.admin, {
    actor: actorOf(ctx),
    input: {
      username: input.username, displayName: input.displayName, password: tempPassword, role: input.role, houses: cleanHouses(input.houses),
      allow: allow.patterns, deny: deny.patterns, approval: cleanApproval(input.approval), require2fa: input.require2fa !== false,
    },
  });
  if (!res.ok) {
    await log(ctx, "user.create", res.error === "notAllowed" ? "rejected" : "failure", undefined, { reason: (res.codes?.[0] || res.error || "failed").slice(0, 40), role: input.role });
    return { ok: false, error: messageFor(res) };
  }
  await log(ctx, "user.create", "success", res.user.id, { role: res.user.role, houses: res.user.houses });
  return { ok: true, user: res.user, tempPassword };       // shown once, then only its hash exists
}

// change: any of { displayName, role, houses, status, require2fa, allowText, denyText, approval }
export async function updatePerson(ctx, id, change = {}, expectedVersion) {
  const target = await visibleTarget(ctx, id);
  if (!target.ok) return target;
  const patch = {};
  if (change.displayName !== undefined) patch.displayName = change.displayName;
  if (change.role !== undefined) patch.role = change.role;
  if (change.houses !== undefined) patch.houses = cleanHouses(change.houses);
  if (change.status !== undefined) patch.status = change.status;
  if (change.require2fa !== undefined) patch.require2fa = Boolean(change.require2fa);
  if (change.approval !== undefined) patch.approval = cleanApproval(change.approval);
  for (const [key, field] of [["allowText", "allow"], ["denyText", "deny"]]) {
    if (change[key] === undefined) continue;
    const parsed = parsePatterns(change[key]);
    if (parsed.invalid.length) return { ok: false, error: tr("بعضی از مجوزهای تایپ‌شده شناخته‌شده نیستند."), invalid: parsed.invalid };
    patch[field] = parsed.patterns;
  }
  const res = await updateUser(ctx.admin, { actor: actorOf(ctx), id, change: patch, expectedVersion });
  if (!res.ok) {
    await log(ctx, "user.update", res.error === "notAllowed" || res.error === "lastOwner" ? "rejected" : "failure", id, { reason: (res.codes?.[0] || res.error || "failed").slice(0, 40), fields: Object.keys(patch) });
    return { ok: false, error: messageFor(res), conflict: res.error === "conflict" };
  }
  if (!res.unchanged) await log(ctx, change.status && change.status !== target.user.status ? "user.status" : "user.update", "success", id, { fields: Object.keys(patch), status: patch.status, role: patch.role, kept: res.sessions === "end_all" ? "ended" : undefined });
  return { ok: true, user: res.user, sessionsEnded: res.sessions === "end_all", sessionsRevoked: res.sessionsRevoked !== false };
}

// A new temporary password for somebody else; every session of theirs ends and they must change it at the next login.
export async function resetPersonPassword(ctx, id) {
  const actor = actorOf(ctx);
  if (id === actor.id) return { ok: false, error: SELF_PASSWORD };
  const target = await visibleTarget(ctx, id);
  if (!target.ok) return target;
  // the same rules as any change to that person (an owner's password is an owner's business; houses; …)
  const all = await listUsers(ctx.admin);
  const verdict = checkUserChange({ actor, target: target.user, change: {}, users: all.users || [] });
  if (!verdict.ok) {
    await log(ctx, "user.password_reset", "rejected", id, { reason: verdict.errors[0] });
    return { ok: false, error: messageFor({ error: "notAllowed", codes: verdict.errors }) };
  }
  const tempPassword = generateTempPassword();
  const res = await setPassword(ctx.admin, { userId: id, password: tempPassword, forceChange: true });
  if (!res.ok) {
    await log(ctx, "user.password_reset", "failure", id, { reason: res.error });
    return { ok: false, error: messageFor(res) };
  }
  await log(ctx, "user.password_reset", "success", id, { kept: "ended" });
  return { ok: true, tempPassword, sessionsRevoked: res.sessionsRevoked !== false };
}

export async function endPersonSessions(ctx, id) {
  const target = await visibleTarget(ctx, id);
  if (!target.ok) return target;
  const all = await listUsers(ctx.admin);
  const verdict = checkUserChange({ actor: actorOf(ctx), target: target.user, change: {}, users: all.users || [] });
  if (!verdict.ok && id !== actorOf(ctx).id) {
    await log(ctx, "user.sessions_ended", "rejected", id, { reason: verdict.errors[0] });
    return { ok: false, error: messageFor({ error: "notAllowed", codes: verdict.errors }) };
  }
  const res = await revokeUserSessions(ctx.admin, id);
  if (!res.ok) { await log(ctx, "user.sessions_ended", "failure", id, {}); return { ok: false, error: USER_MESSAGES.failed }; }
  await log(ctx, "user.sessions_ended", "success", id, { rows: res.count });
  return { ok: true, count: res.count };
}

async function visibleTarget(ctx, id) {
  const got = await getUser(ctx.admin, id);
  if (!got.ok) return { ok: false, error: USER_MESSAGES.unavailable };
  if (!got.user || !canSee(actorOf(ctx), got.user)) return { ok: false, error: NOT_VISIBLE };    // never reveals that the person exists
  return { ok: true, user: got.user };
}

export { normalizeUsername };
