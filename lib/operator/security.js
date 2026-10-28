// lib/operator/security.js — panel security building blocks, shared by the Health and the
// Beauty panel (every function takes the panel name, so the two never share state):
//
//   • two-step login: RFC 6238 TOTP (SHA-1, 30 s, 6 digits) + single-use recovery codes
//   • the session registry: every login gets a random session id (sid), listed and revocable;
//     logout and "revoke all" really kill a copied cookie
//   • the activity log: what was done (action, table, ids, counts), never who a person is and
//     never customer data
//
// Plain JS on node:crypto — no Next imports — so tests run it directly. The Supabase client
// (service role) is passed in. Anything that cannot be read as "the table is missing" is
// treated as a failure, never as success (fail closed); a MISSING table (migration 30 not
// applied yet) keeps the previous behaviour so deploying the code first cannot lock anyone out.
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { tr } from "../panel/i18n.js";

export const PANELS = ["health", "beauty"];
const STEP_SECONDS = 30;
const SESSION_CACHE_MS = 20_000;
const cache = new Map();        // "panel:sid" -> checked-valid-until (ms)

// ── errors ──────────────────────────────────────────────────────────────────────────
// "The table is not there" (migration 30 not applied yet) is the ONLY failure that keeps the pre-migration
// behaviour. 42P01 = Postgres "undefined table"; PGRST205 = PostgREST "table not in the schema cache".
// Everything else is a different problem and must fail closed: a database outage, a connection error
// (PGRST000/001), a schema cache that cannot be built right now (PGRST002, "Could not query the database for the
// schema cache"), a permission error, a network failure. The bare words "schema cache" are NOT enough: PGRST002
// says them too, and reading it as "missing table" skipped the session check (found 2026-10-26).
export function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (code === "42P01" || code === "PGRST205") return true;
  if (code) return false;                                  // any other code names some other problem
  // no code at all (some clients drop it): only the two messages that name a table that is not there
  const msg = String(error.message || "");
  return /relation ".*" does not exist/i.test(msg) || /could not find the table .* in the schema cache/i.test(msg);
}
const isUniqueViolation = (error) => error?.code === "23505" || /duplicate key/i.test(String(error?.message || ""));

// ── base32 / TOTP ───────────────────────────────────────────────────────────────────
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[\s=-]/g, "");
  if (!/^[A-Z2-7]+$/.test(clean)) throw new Error("not a base32 string");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function hotp(key, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const stepOf = (nowMs) => Math.floor(nowMs / 1000 / STEP_SECONDS);
export const totpAt = (secretB32, step) => hotp(base32Decode(secretB32), step);

const safeEq = (a, b) => {
  const x = createHash("sha256").update(String(a)).digest();
  const y = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(x, y);
};

// The time step whose code equals `code` (within ±window steps of now), or null.
export function matchTotp({ secret, code, nowMs = Date.now(), window = 1 }) {
  const c = String(code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  let key;
  try { key = base32Decode(secret); } catch { return null; }
  const now = stepOf(nowMs);
  let hit = null;
  for (let s = now - window; s <= now + window; s++) {
    if (safeEq(hotp(key, s), c)) hit = s;   // no early exit: constant work
  }
  return hit;
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function otpauthUri({ secret, account, issuer }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

// ── recovery codes ──────────────────────────────────────────────────────────────────
const RC_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // no 0/O/1/I/L

export const normalizeRecovery = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashRecovery = (code) => createHash("sha256").update(normalizeRecovery(code)).digest("hex");

export function generateRecoveryCodes(n = 8) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const bytes = randomBytes(12);
    let raw = "";
    for (const b of bytes) raw += RC_ALPHABET[b % RC_ALPHABET.length];
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    out.push({ code, hash: hashRecovery(code) });
  }
  return out;
}

export const parseRecoveryHashes = (s) => String(s ?? "").split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{64}$/.test(x));

// ── privacy-preserving network hint ─────────────────────────────────────────────────
// A short keyed hash of the client IP: tells "same place / different place" in the log and the
// session list without storing the address itself.
export const ipHash = (ip, secret) => createHmac("sha256", String(secret || "no-secret")).update(String(ip || "unknown")).digest("hex").slice(0, 12);

export const newSessionId = () => randomBytes(12).toString("hex");

// ── second factor ───────────────────────────────────────────────────────────────────
// Returns { ok:true, method } or { ok:false, reason } where reason is one of
// "bad_code" | "replay" | "recovery_used" | "recovery_unavailable".
export async function verifySecondFactor({ admin, panel, secret, recoveryHashes = [], code, recovery, nowMs = Date.now() }) {
  if (recovery) {
    const hash = hashRecovery(recovery);
    if (!recoveryHashes.includes(hash)) return { ok: false, reason: "bad_code" };
    if (!admin) return { ok: false, reason: "recovery_unavailable" };
    const { error } = await admin.from("operator_recovery_used").insert({ panel, code_hash: hash });
    if (!error) return { ok: true, method: "recovery" };
    if (isUniqueViolation(error)) return { ok: false, reason: "recovery_used" };
    return { ok: false, reason: "recovery_unavailable" };      // cannot prove single use → refuse
  }

  const step = matchTotp({ secret, code, nowMs });
  if (step === null) return { ok: false, reason: "bad_code" };
  if (!admin) return { ok: true, method: "totp" };              // no database: no replay memory possible

  // replay protection: a time step is accepted once. Missing table = no memory (accepted, like before).
  const ins = await admin.from("operator_totp_state").insert({ panel, last_step: 0 });
  if (ins.error && isMissingTable(ins.error)) return { ok: true, method: "totp" };
  if (ins.error && !isUniqueViolation(ins.error)) return { ok: false, reason: "bad_code" };   // fail closed
  const { data, error } = await admin.from("operator_totp_state")
    .update({ last_step: step, updated_at: new Date(nowMs).toISOString() })
    .eq("panel", panel).lt("last_step", step).select("panel");
  if (error) return { ok: false, reason: "bad_code" };
  if (!data || data.length === 0) return { ok: false, reason: "replay" };
  return { ok: true, method: "totp" };
}

// ── session registry ────────────────────────────────────────────────────────────────
export const clearSessionCache = () => cache.clear();

export async function registerSession(admin, { panel, sid, ttlMs, ip, secret, userId, nowMs = Date.now() }) {
  if (!admin) return { ok: true, unavailable: true };
  const { error } = await admin.from("operator_sessions").insert({
    sid, panel, expires_at: new Date(nowMs + ttlMs).toISOString(), ip_hash: ipHash(ip, secret),
    ...(userId ? { user_id: userId } : {}),      // only with personal accounts (migration 34); the old single-account login omits it
  });
  if (error && isMissingTable(error)) return { ok: true, unavailable: true };
  if (error) return { ok: false };
  // housekeeping: forget sessions that ended a week ago (best effort)
  admin.from("operator_sessions").delete().eq("panel", panel).lt("expires_at", new Date(nowMs - 7 * 864e5).toISOString()).then(() => {}, () => {});
  return { ok: true };
}

// "valid" | "invalid" | "unavailable" (no database / registry table missing → legacy behaviour)
export async function sessionStatus(admin, { panel, sid, nowMs = Date.now() }) {
  if (!admin) return "unavailable";
  if (!sid || typeof sid !== "string" || !/^[0-9a-f]{24}$/.test(sid)) {
    // a token from before the registry has no sid: invalid once the registry exists
    const probe = await admin.from("operator_sessions").select("sid").limit(1);
    return probe.error && isMissingTable(probe.error) ? "unavailable" : "invalid";
  }
  const key = `${panel}:${sid}`;
  if ((cache.get(key) || 0) > nowMs) return "valid";
  const { data, error } = await admin.from("operator_sessions").select("sid,revoked_at,expires_at").eq("panel", panel).eq("sid", sid).limit(1);
  if (error) return isMissingTable(error) ? "unavailable" : "invalid";
  const row = data?.[0];
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= nowMs) { cache.delete(key); return "invalid"; }
  cache.set(key, nowMs + SESSION_CACHE_MS);
  return "valid";
}

export async function revokeSession(admin, { panel, sid, nowMs = Date.now() }) {
  cache.delete(`${panel}:${sid}`);
  if (!admin || !sid) return { ok: true, count: 0 };
  const { data, error } = await admin.from("operator_sessions").update({ revoked_at: new Date(nowMs).toISOString() })
    .eq("panel", panel).eq("sid", sid).is("revoked_at", null).select("sid");
  return { ok: !error || isMissingTable(error), count: data?.length || 0 };
}

// Revoke every active session of THIS panel (optionally keeping one). Never touches the other panel.
export async function revokeSessions(admin, { panel, exceptSid, nowMs = Date.now() }) {
  for (const k of [...cache.keys()]) if (k.startsWith(`${panel}:`)) cache.delete(k);
  if (!admin) return { ok: true, count: 0 };
  let q = admin.from("operator_sessions").update({ revoked_at: new Date(nowMs).toISOString() })
    .eq("panel", panel).is("revoked_at", null).gt("expires_at", new Date(nowMs).toISOString());
  if (exceptSid) q = q.neq("sid", exceptSid);
  const { data, error } = await q.select("sid");
  return { ok: !error || isMissingTable(error), count: data?.length || 0 };
}

export async function listSessions(admin, { panel, userId, nowMs = Date.now(), limit = 20 }) {
  if (!admin) return [];
  let q = admin.from("operator_sessions").select("sid,created_at,expires_at,revoked_at,ip_hash")
    .eq("panel", panel).gt("expires_at", new Date(nowMs).toISOString()).is("revoked_at", null);
  if (userId) q = q.eq("user_id", userId);           // a personal account sees only its OWN sessions, never a colleague's
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  return error ? [] : (data || []);
}

// ── activity log ────────────────────────────────────────────────────────────────────
// Only these keys, only short plain values. A value that looks like personal data (an e-mail, a
// phone-like digit run) is dropped even under an allowed key.
const DETAIL_KEYS = new Set(["status", "from_status", "fields", "price", "price_from", "price_to", "method", "reason", "format", "rows", "created", "updated", "skipped", "is_active", "moved", "kept", "sku", "role", "houses", "qty", "location", "to", "movement", "reservation", "code", "version", "count", "lines", "differences", "min", "added", "kind"]);
export function sanitizeDetail(detail) {
  if (!detail || typeof detail !== "object") return null;
  const out = {};
  const okText = (v) => typeof v === "string" && v.length <= 60 && /^[\w .:+/\-]*$/.test(v) && !/\d{7,}/.test(v);
  for (const [k, v] of Object.entries(detail)) {
    if (!DETAIL_KEYS.has(k)) continue;
    if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (okText(v)) out[k] = v;
    else if (Array.isArray(v)) { const a = v.filter((x) => typeof x === "string" && /^[a-z_]{1,40}$/.test(x)).slice(0, 30); if (a.length) out[k] = a; }
  }
  return Object.keys(out).length ? out : null;
}

const cleanIds = (ids) => (Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 200) : null);

// Returns { ok } | { ok:false, unavailable:true } (table missing) | { ok:false }. Never throws.
const AUDIT_RESULTS = new Set(["attempt", "success", "failure", "rejected"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The changed fields of a product / content change, for the people who may read the log (never customer data: only the keys of a
// catalogue record, short plain values, at most ~2 KB in all). Anything else is dropped.
export function sanitizeChange(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out = {};
  for (const [k, v] of Object.entries(obj).slice(0, 40)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(k) || /phone|email|password|secret|token|message|address|customer/.test(k)) continue;
    if (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 300);
    else if (Array.isArray(v)) out[k] = v.filter((x) => ["string", "number", "boolean"].includes(typeof x)).slice(0, 30).map((x) => (typeof x === "string" ? x.slice(0, 200) : x));
    else if (typeof v === "object") out[k] = JSON.stringify(v).slice(0, 300);
  }
  const text = JSON.stringify(out);
  if (!Object.keys(out).length) return null;
  return text.length <= 2200 ? out : null;
}

export async function writeAudit(admin, { panel, action, entity, ids, count, detail, sid, ip, secret, userId, targetUserId, result, requestId, before, after }) {
  if (!admin) return { ok: false, unavailable: true };
  try {
    const row = {
      panel, action: String(action).slice(0, 60), entity: entity ? String(entity).slice(0, 60) : null,
      entity_ids: cleanIds(ids), count: Number.isInteger(count) ? count : (cleanIds(ids)?.length ?? null),
      detail: sanitizeDetail(detail), session_id: sid && /^[0-9a-f]{24}$/.test(sid) ? sid : null, ip_hash: ip ? ipHash(ip, secret) : null,
    };
    // who / with what outcome / which request: columns of migration 34, sent only when there is something to say, so the log keeps
    // working (as before) on a database that does not have them yet
    if (typeof userId === "string" && UUID.test(userId)) row.user_id = userId;
    if (typeof targetUserId === "string" && UUID.test(targetUserId)) row.target_user_id = targetUserId;
    if (AUDIT_RESULTS.has(result)) row.result = result;
    if (typeof requestId === "string" && requestId) row.request_id = requestId.slice(0, 64);
    const b = sanitizeChange(before), a = sanitizeChange(after);              // migration 35 columns, sent only when there is something to say
    if (b) row.before = b;
    if (a) row.after = a;
    const { error } = await admin.from("operator_audit_log").insert(row);
    if (!error) return { ok: true };
    return isMissingTable(error) ? { ok: false, unavailable: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function listAudit(admin, { panel, limit = 200 }) {
  if (!admin) return [];
  const { data, error } = await admin.from("operator_audit_log").select("*").eq("panel", panel).order("id", { ascending: false }).limit(limit);
  return error ? [] : (data || []);
}

// Persian labels for the activity page (the codes are the contract; the labels are display only).
export const AUDIT_LABELS = {
  "media.delete": tr("حذف تصویر"),
  "product.restore": tr("برگرداندن یک تغییر محصول"),
  "stock.receive": tr("ورود کالا به انبار"), "stock.issue": tr("خروج کالا از انبار"), "stock.transfer": tr("انتقال بین انبارها"), "stock.adjust": tr("اصلاح موجودی"),
  "stock.reverse": tr("برگشت حرکت انبار"), "stock.reserve": tr("رزرو موجودی"), "stock.release": tr("آزادسازی رزرو"),
  "stock.location_create": tr("ساخت انبار"), "stock.location_update": tr("ویرایش انبار"),
  "stock.count_start": tr("شروع شمارش انبار"), "stock.count_save": tr("ثبت مقدار شمارش‌شده"), "stock.count_cancel": tr("لغو شمارش انبار"), "stock.count_close": tr("بستن شمارش انبار"),
  "stock.level": tr("تغییر حداقل موجودی"), "stock.export": tr("خروجی گزارش انبار"),
  "auth.login": tr("ورود"), "auth.login_failed": tr("تلاش ناموفق برای ورود"), "auth.logout": tr("خروج"),
  "auth.recovery_code_used": tr("استفاده از کد بازیابی"), "access.denied": tr("درخواست ردشده (دسترسی نداشت)"), "account.password_changed": tr("تغییر رمز عبور خود"), "account.2fa_started": tr("شروع راه‌اندازی ورود دومرحله‌ای"), "account.2fa_enabled": tr("روشن شدن ورود دومرحله‌ای"), "account.2fa_disabled": tr("خاموش شدن ورود دومرحله‌ای"), "account.recovery_codes_renewed": tr("کدهای بازیابی تازه"), "audit.exported": tr("خروجی CSV از تاریخچه"), "approval.requested": tr("درخواست تأیید"), "approval.approved": tr("تأیید و اجرای تغییر"), "approval.rejected": tr("رد درخواست تأیید"), "approval.cancelled": tr("پس گرفتن درخواست تأیید"), "user.create": tr("ساخت کاربر"), "user.update": tr("ویرایش کاربر"), "user.status": tr("تغییر وضعیت کاربر"), "user.password_reset": tr("رمز موقت برای کاربر"), "user.sessions_ended": tr("بستن نشست‌های کاربر"), "auth.bootstrap_owner": tr("تبدیل حساب فعلی به مدیر اصلی"), "auth.bootstrap_failed": tr("تبدیل حساب فعلی به مدیر اصلی ناموفق بود"), "auth.sessions_revoked": tr("ابطال نشست‌ها"),
  "quote.delete": tr("حذف درخواست"), "quote.delete_attempt": tr("درخواست حذف درخواست مشتری"), "quote.delete_failed": tr("حذف درخواست مشتری ناموفق بود"), "category.delete_attempt": tr("درخواست حذف دسته"), "category.delete_failed": tr("حذف دسته ناموفق بود"), "brand.delete_attempt": tr("درخواست حذف برند"), "brand.delete_failed": tr("حذف برند ناموفق بود"), "quote.status": tr("تغییر وضعیت درخواست"), "quote.notes": tr("ویرایش یادداشت درخواست"),
  "product.create": tr("ساخت محصول"), "product.update": tr("ویرایش محصول"), "product.active": tr("فعال/آرشیو محصول"), "product.delete_attempt": tr("درخواست حذف دائمی محصول"), "product.delete": tr("حذف دائمی محصول"), "product.delete_failed": tr("حذف دائمی محصول ناموفق بود"),
  "product.quick": tr("ویرایش سریع محصول"), "product.bulk": tr("ویرایش گروهی محصولات"), "product.duplicate": tr("تکثیر محصول"),
  "product.import": tr("ورود فایل محصولات"), "category.create": tr("ساخت دسته"), "category.update": tr("ویرایش دسته"),
  "category.flags": tr("تغییر وضعیت دسته"), "category.delete": tr("حذف دسته"), "brand.create": tr("ساخت برند"),
  "brand.update": tr("ویرایش برند"), "brand.flags": tr("تغییر وضعیت برند"), "brand.delete": tr("حذف برند"),
};
