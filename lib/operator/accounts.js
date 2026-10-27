// lib/operator/accounts.js — the store of personal operator accounts (migration 34). Plain module (no Next imports): the
// Supabase service-role client is passed in, so the rules run in unit tests against an in-memory stand-in.
//
// What lives here: reading accounts as the shape lib/operator/authz.js understands, creating and changing them (every change goes
// through authz.checkUserChange first, is guarded by the optimistic `version`, and ends sessions when power changes), password
// verification with a constant cost, the owner bootstrap from the old env account, and which login mode the panels are in.
// Anything that cannot be read is a failure, never a permission: only a missing table means "migration 34 not applied yet".
import { checkUserChange, sessionPolicy, HOUSES } from "./authz.js";
import { DUMMY_HASH, hashPassword, normalizeUsername, passwordProblem, USERNAME_RE, verifyPasswordHash } from "./passwords.js";
import { clearSessionCache, isMissingTable } from "./security.js";
import { tr } from "../panel/i18n.js";

// Everything except the password hash and the encrypted seed, which are read only where they are needed.
export const PUBLIC_COLUMNS = "id,username,display_name,status,role,houses,allow_perms,deny_perms,approval,require_2fa,must_change_password,authz_version,version,created_by,created_at,updated_at,last_login_at,password_changed_at";
const LOGIN_COLUMNS = `${PUBLIC_COLUMNS},password_hash,totp_secret_enc,totp_last_step,recovery_hashes`;

export const ACCOUNT_MESSAGES = {
  unavailable: tr("حساب‌های کاربری در دسترس نیستند."),
  notAllowed: tr("اجازهٔ این کار را ندارید."),
  usernameTaken: tr("این نام کاربری قبلاً گرفته شده است."),
  badUsername: tr("نام کاربری باید ۳ تا ۶۴ نویسهٔ انگلیسی کوچک، عدد، نقطه، خط تیره یا زیرخط باشد."),
  badName: tr("نام نمایشی لازم است (حداکثر ۸۰ نویسه)."),
  notFound: tr("کاربر پیدا نشد."),
  conflict: tr("این کاربر در این فاصله تغییر کرده است. صفحه را دوباره باز کنید."),
  lastOwner: tr("آخرین مدیر اصلی فعال را نمی‌شود غیرفعال، مسدود یا تنزل داد."),
  failed: tr("ذخیره نشد. دوباره تلاش کنید."),
};

export function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    status: row.status,
    role: row.role,
    houses: Array.isArray(row.houses) ? row.houses : [],
    allow: row.allow_perms || [],
    deny: row.deny_perms || [],
    approval: row.approval && typeof row.approval === "object" ? row.approval : {},
    require2fa: Boolean(row.require_2fa),
    hasTotp: Boolean(row.totp_secret_enc),
    recoveryLeft: Array.isArray(row.recovery_hashes) ? row.recovery_hashes.length : 0,
    mustChangePassword: Boolean(row.must_change_password),
    authzVersion: row.authz_version,
    version: row.version,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    lastLoginAt: row.last_login_at || null,
    passwordChangedAt: row.password_changed_at || null,
  };
}

const unavailable = (error) => ({ ok: false, unavailable: true, missingTable: isMissingTable(error) });

// ── which login mode are the panels in? ──────────────────────────────────────────────────────────────────────────────────
//   "legacy"      the flag is off, or migration 34 is not applied: the old single env account per panel
//   "bootstrap"   the flag is on and there is no active owner yet: the env account may log in once and becomes the first owner
//   "users"       personal accounts only; the env credentials are retired
//   "unavailable" the flag is on but the database cannot say: refuse (never fall back to the weaker mode)
const MODE_CACHE_MS = 5000;
let modeCache = null;
export const clearModeCache = () => { modeCache = null; };

export async function usersMode(admin, { enabled, nowMs = Date.now() }) {
  if (!enabled) return "legacy";
  if (modeCache && modeCache.until > nowMs) return modeCache.mode;
  if (!admin) return "unavailable";
  const { data, error } = await admin.from("operator_users").select("id").eq("role", "owner").eq("status", "active").limit(1);
  let mode;
  if (error) mode = isMissingTable(error) ? "legacy" : "unavailable";
  else mode = data?.length ? "users" : "bootstrap";
  if (mode === "users") modeCache = { mode, until: nowMs + MODE_CACHE_MS };   // only the settled mode is remembered; a doubt or a first-run state is always re-checked
  return mode;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── reading ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function listUsers(admin) {
  if (!admin) return { ok: false, unavailable: true };
  const { data, error } = await admin.from("operator_users").select(PUBLIC_COLUMNS).order("created_at", { ascending: true });
  if (error) return unavailable(error);
  return { ok: true, users: (data || []).map(rowToUser) };
}

export async function getUser(admin, id) {
  if (!admin) return { ok: false, unavailable: true };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { ok: true, user: null };
  const { data, error } = await admin.from("operator_users").select(PUBLIC_COLUMNS).eq("id", id).limit(1);
  if (error) return unavailable(error);
  return { ok: true, user: rowToUser(data?.[0]) };
}

// ── password check with a constant cost ─────────────────────────────────────────────────────────────────────────────────
// The hash of an unknown name is verified too, so "no such user" and "wrong password" take the same time and answer alike.
// reason (for the activity log only, never shown): password | inactive | house.
export async function verifyLogin(admin, { username, password, panel }) {
  if (!admin) return { ok: false, unavailable: true };
  const name = normalizeUsername(username);
  const { data, error } = await admin.from("operator_users").select(LOGIN_COLUMNS).eq("username", USERNAME_RE.test(name) ? name : "").limit(1);
  if (error) return unavailable(error);
  const row = data?.[0] || null;
  const passwordOk = verifyPasswordHash(String(password ?? ""), row?.password_hash || DUMMY_HASH);
  if (!row || !passwordOk) return { ok: false, reason: "password" };
  if (row.status !== "active") return { ok: false, reason: "inactive", userId: row.id };
  if (!Array.isArray(row.houses) || !row.houses.includes(panel)) return { ok: false, reason: "house", userId: row.id };
  return { ok: true, user: rowToUser(row), secret: { totpEnc: row.totp_secret_enc || null, lastStep: Number(row.totp_last_step || 0), recoveryHashes: row.recovery_hashes || [] } };
}

// ── creating and changing ───────────────────────────────────────────────────────────────────────────────────────────────
const DB_FIELDS = { role: "role", houses: "houses", allow: "allow_perms", deny: "deny_perms", approval: "approval", status: "status", displayName: "display_name", require2fa: "require_2fa" };

function dbError(error) {
  if (!error) return null;
  if (error.code === "23505") return "usernameTaken";
  if (/last active owner/i.test(String(error.message || ""))) return "lastOwner";
  return "failed";
}

export async function createUser(admin, { actor, input }) {
  const all = await listUsers(admin);
  if (!all.ok) return { ok: false, error: "unavailable" };
  const username = normalizeUsername(input?.username);
  if (!USERNAME_RE.test(username)) return { ok: false, error: "badUsername" };
  const displayName = String(input?.displayName ?? "").trim();
  if (!displayName || displayName.length > 80) return { ok: false, error: "badName" };
  const problem = passwordProblem(input?.password, { username, displayName });
  if (problem) return { ok: false, error: "password", problem };

  const change = {
    role: input.role, houses: input.houses, allow: input.allow || [], deny: input.deny || [], approval: input.approval || {}, status: "active",
  };
  const verdict = checkUserChange({ actor, target: null, change, users: all.users });
  if (!verdict.ok) return { ok: false, error: "notAllowed", codes: verdict.errors };

  const row = {
    username, display_name: displayName, password_hash: hashPassword(input.password), status: "active", role: change.role, houses: change.houses,
    allow_perms: change.allow, deny_perms: change.deny, approval: change.approval, require_2fa: input.require2fa !== false,
    must_change_password: true, created_by: actor.id,
  };
  const { data, error } = await admin.from("operator_users").insert(row).select(PUBLIC_COLUMNS);
  if (error) return { ok: false, error: dbError(error) };
  return { ok: true, user: rowToUser(Array.isArray(data) ? data[0] : data) };
}

// change: any of { role, houses, allow, deny, approval, status, displayName, require2fa }.
// expectedVersion is the `version` the administrator's form was loaded with: an older one means somebody else changed the
// account in between, and nothing is written.
export async function updateUser(admin, { actor, id, change, expectedVersion }) {
  const all = await listUsers(admin);
  if (!all.ok) return { ok: false, error: "unavailable" };
  const target = all.users.find((u) => u.id === id);
  if (!target) return { ok: false, error: "notFound" };
  if (expectedVersion !== undefined && target.version !== expectedVersion) return { ok: false, error: "conflict" };

  if (change.displayName !== undefined) {
    const n = String(change.displayName).trim();
    if (!n || n.length > 80) return { ok: false, error: "badName" };
    change = { ...change, displayName: n };
  }
  const verdict = checkUserChange({ actor, target, change, users: all.users });
  if (!verdict.ok) return { ok: false, error: verdict.errors.includes("last_owner") ? "lastOwner" : "notAllowed", codes: verdict.errors };

  const after = { ...target, ...change };
  const policy = sessionPolicy(target, after);
  const patch = {};
  for (const [k, col] of Object.entries(DB_FIELDS)) if (change[k] !== undefined) patch[col] = change[k];
  if (!Object.keys(patch).length) return { ok: true, user: target, sessions: "none", unchanged: true };
  if (policy === "end_all") patch.authz_version = (target.authzVersion || 1) + 1;

  const { data, error } = await admin.from("operator_users").update(patch).eq("id", id).eq("version", target.version).select(PUBLIC_COLUMNS);
  if (error) return { ok: false, error: dbError(error) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "conflict" };
  invalidateSessionUser(id);
  let revoked = { ok: true };
  if (policy === "end_all") revoked = await revokeUserSessions(admin, id);
  // a failure to end the sessions must not look like success: the old authz_version already stops them (getSession compares it),
  // but the caller is told, so the administrator can retry.
  return { ok: true, user: rowToUser(row), sessions: policy, sessionsRevoked: revoked.ok };
}

// Ends every session of one person, in both panels (idempotent). Also drops the in-process "recently valid" memory.
export async function revokeUserSessions(admin, userId, { exceptSid, nowMs = Date.now() } = {}) {
  clearSessionCache();
  invalidateSessionUser(userId);
  if (!admin) return { ok: false };
  let q = admin.from("operator_sessions").update({ revoked_at: new Date(nowMs).toISOString() }).eq("user_id", userId).is("revoked_at", null);
  if (exceptSid) q = q.neq("sid", exceptSid);
  const { error } = await q.select("sid");
  return { ok: !error };
}

// Administrator sets another person's password (they must change it at the next login); the person changing their own password
// goes through `changeOwnPassword` in the account-security actions (S2d). Either way every other session ends.
export async function setPassword(admin, { userId, password, forceChange, exceptSid }) {
  const got = await getUser(admin, userId);
  if (!got.ok) return { ok: false, error: "unavailable" };
  if (!got.user) return { ok: false, error: "notFound" };
  const problem = passwordProblem(password, { username: got.user.username, displayName: got.user.displayName });
  if (problem) return { ok: false, error: "password", problem };
  const { data, error } = await admin.from("operator_users").update({
    password_hash: hashPassword(password), password_changed_at: new Date().toISOString(), must_change_password: Boolean(forceChange),
    authz_version: (got.user.authzVersion || 1) + 1,
  }).eq("id", userId).eq("version", got.user.version).select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (!data?.length) return { ok: false, error: "conflict" };
  const revoked = await revokeUserSessions(admin, userId, { exceptSid });
  return { ok: true, sessionsRevoked: revoked.ok };
}

export async function markLogin(admin, userId, nowMs = Date.now()) {
  if (!admin) return;
  await admin.from("operator_users").update({ last_login_at: new Date(nowMs).toISOString() }).eq("id", userId).then(() => {}, () => {});
}

// ── the owner bootstrap ─────────────────────────────────────────────────────────────────────────────────────────────────
// Called after the old env account has just been verified (username + password [+ second factor]) while there is no active owner.
// The env account becomes the first owner of BOTH houses, keeping its password hash and — when the panel had a second factor —
// its seed, encrypted with the data key. If the seed cannot be kept (no data key) the bootstrap is refused: it must never
// quietly weaken the account.
export async function bootstrapOwner(admin, { username, passwordHash, displayName, totpSecret, recoveryHashes = [], encrypt }) {
  if (!admin) return { ok: false, error: "unavailable" };
  const name = normalizeUsername(username);
  if (!USERNAME_RE.test(name)) return { ok: false, error: "badUsername" };
  let totpEnc = null;
  if (totpSecret) {
    try { totpEnc = encrypt ? encrypt(totpSecret) : null; } catch { totpEnc = null; }
    if (!totpEnc) return { ok: false, error: "dataKeyMissing" };
  }
  const row = {
    username: name, display_name: String(displayName || name).trim().slice(0, 80) || name, password_hash: passwordHash,
    status: "active", role: "owner", houses: [...HOUSES], allow_perms: [], deny_perms: [], approval: {},
    require_2fa: Boolean(totpEnc), totp_secret_enc: totpEnc, recovery_hashes: recoveryHashes.slice(0, 20), must_change_password: false,
  };
  const { data, error } = await admin.from("operator_users").insert(row).select(PUBLIC_COLUMNS);
  clearModeCache();
  if (error && error.code === "23505") {
    const again = await admin.from("operator_users").select(PUBLIC_COLUMNS).eq("username", name).limit(1);
    const existing = again.data?.[0];
    return existing ? { ok: true, user: rowToUser(existing), existed: true } : { ok: false, error: "failed" };
  }
  if (error) return { ok: false, error: isMissingTable(error) ? "unavailable" : "failed" };
  return { ok: true, user: rowToUser(Array.isArray(data) ? data[0] : data) };
}

// ── second factor of a person ───────────────────────────────────────────────────────────────────────────────────────────
// One time step is accepted once per person: the step is moved forward with a conditional update that only one request can win.
export async function acceptTotpStep(admin, { userId, step }) {
  const { data, error } = await admin.from("operator_users").update({ totp_last_step: step }).eq("id", userId).lt("totp_last_step", step).select("id");
  if (error) return { ok: false, reason: "unavailable" };
  return data?.length ? { ok: true } : { ok: false, reason: "replay" };
}

// A recovery code works once: it is removed from the person's list by a conditional update on the list they were read with.
export async function consumeRecoveryCode(admin, { userId, hash, hashes }) {
  if (!hashes.includes(hash)) return { ok: false, reason: "bad_code" };
  const next = hashes.filter((h) => h !== hash);
  const { data, error } = await admin.from("operator_users").update({ recovery_hashes: next }).eq("id", userId).contains("recovery_hashes", [hash]).select("id");
  if (error) return { ok: false, reason: "unavailable" };
  return data?.length ? { ok: true } : { ok: false, reason: "recovery_used" };
}

// ── the person behind a signed session ──────────────────────────────────────────────────────────────────────────────────
// A cookie is only a claim. This turns it into the CURRENT state of the account: active, in this house, and still at the
// authz_version the session was issued with (any change of role/houses/permissions/password bumps it and ends the session).
const USER_CACHE_MS = 2000;
const userCache = new Map();
export const invalidateSessionUser = (id) => { if (id) userCache.delete(id); else userCache.clear(); };

export async function resolveSessionUser(admin, { panel, uid, av, nowMs = Date.now() }) {
  if (!admin || typeof uid !== "string") return { ok: false, user: null, unavailable: !admin };
  const hit = userCache.get(uid);
  let user;
  if (hit && hit.until > nowMs) user = hit.user;
  else {
    const got = await getUser(admin, uid);
    if (!got.ok) return { ok: false, user: null, unavailable: true };
    user = got.user;
    userCache.set(uid, { user, until: nowMs + USER_CACHE_MS });
  }
  if (!user || user.status !== "active" || !user.houses.includes(panel) || user.authzVersion !== av) return { ok: true, user: null };
  return { ok: true, user };
}
