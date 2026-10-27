// lib/operator/selfSecurity.js — a person looks after their OWN sign-in: password, two-step login, recovery codes. Plain module (the
// database client and the data key are passed in). Every sensitive step asks for the current password again (and a two-step code
// when one is set up), because a stolen open session must not be enough to take over an account.
//
//   * changing the password ends all OTHER sessions of the person (this one stays) and clears the "must change" flag;
//   * two-step setup is two steps: start (password) → a pending secret travels to the browser as an opaque, encrypted, expiring
//     blob; confirm (blob + a code from the phone) → only then is the secret stored (encrypted) and recovery codes issued once;
//   * recovery codes are shown once; only their hashes are kept;
//   * disabling two-step is refused while an administrator requires it.
import { acceptTotpStep, revokeUserSessions } from "./accounts.js";
import { hashPassword, passwordProblem, verifyPasswordHash } from "./passwords.js";
import { decryptSecret, encryptSecret } from "./userSecrets.js";
import { generateRecoveryCodes, generateTotpSecret, matchTotp, otpauthUri } from "./security.js";
import { tr } from "../panel/i18n.js";

export const SELF_MESSAGES = {
  unavailable: tr("این بخش در دسترس نیست."),
  legacy: tr("این امکان فقط برای حساب شخصی است؛ ورود قدیمی مشترک آن را ندارد."),
  wrongPassword: tr("رمز عبور فعلی درست نیست."),
  wrongCode: tr("کد دومرحله‌ای درست نیست یا قبلاً استفاده شده است."),
  needCode: tr("کد دومرحله‌ای را وارد کنید."),
  mismatch: tr("رمز جدید و تکرار آن یکی نیست."),
  same: tr("رمز جدید باید با رمز فعلی فرق داشته باشد."),
  noKey: tr("کلید OPERATOR_DATA_KEY روی سرور تنظیم نشده است؛ ورود دومرحله‌ای قابل راه‌اندازی نیست."),
  expired: tr("زمان راه‌اندازی تمام شد. دوباره شروع کنید."),
  required: tr("مدیر اصلی ورود دومرحله‌ای را برای شما الزامی کرده است؛ نمی‌توانید آن را خاموش کنید."),
  notSetUp: tr("ورود دومرحله‌ای برای شما راه‌اندازی نشده است."),
  alreadyOn: tr("ورود دومرحله‌ای از قبل روشن است."),
  failed: tr("ذخیره نشد. دوباره تلاش کنید."),
  tooMany: tr("تلاش‌های ناموفق زیاد است. چند دقیقه بعد دوباره امتحان کنید."),
};
const PENDING_MS = 10 * 60_000;

async function loadSecrets(admin, userId) {
  const { data, error } = await admin.from("operator_users").select("id,username,display_name,password_hash,totp_secret_enc,totp_last_step,require_2fa,version").eq("id", userId).limit(1);
  if (error || !data?.[0]) return null;
  return data[0];
}

// Current password (and the current two-step code when the person has one). → { ok:true, row } | { ok:false, error }.
export async function reauthenticate(admin, { userId, password, code, key, nowMs = Date.now() }) {
  const row = await loadSecrets(admin, userId);
  if (!row) return { ok: false, error: "unavailable" };
  if (!verifyPasswordHash(String(password ?? ""), row.password_hash)) return { ok: false, error: "wrongPassword" };
  if (row.totp_secret_enc) {
    if (!code) return { ok: false, error: "needCode" };
    const seed = decryptSecret(row.totp_secret_enc, key);
    if (!seed) return { ok: false, error: "unavailable" };
    const step = matchTotp({ secret: seed, code, nowMs });
    if (step === null || step <= Number(row.totp_last_step || 0)) return { ok: false, error: "wrongCode" };
    const accepted = await acceptTotpStep(admin, { userId, step });
    if (!accepted.ok) return { ok: false, error: "wrongCode" };
  }
  return { ok: true, row };
}

export async function changeOwnPassword(admin, { user, sid, current, next, repeat, code, key }) {
  if (next !== repeat) return { ok: false, error: "mismatch" };
  if (next === current) return { ok: false, error: "same" };
  const problem = passwordProblem(next, { username: user.username, displayName: user.displayName });
  if (problem) return { ok: false, error: "password", problem };
  const auth = await reauthenticate(admin, { userId: user.id, password: current, code, key });
  if (!auth.ok) return auth;
  const { data, error } = await admin.from("operator_users").update({
    password_hash: hashPassword(next), password_changed_at: new Date().toISOString(), must_change_password: false,
  }).eq("id", user.id).select("id");
  if (error || !data?.length) return { ok: false, error: "failed" };
  const ended = await revokeUserSessions(admin, user.id, { exceptSid: sid });     // every OTHER session ends
  return { ok: true, sessionsEnded: ended.count || 0, sessionsRevoked: ended.ok };
}

export async function startTwoStep(admin, { user, current, key, nowMs = Date.now() }) {
  if (!key) return { ok: false, error: "noKey" };
  if (user.hasTotp) return { ok: false, error: "alreadyOn" };
  const auth = await reauthenticate(admin, { userId: user.id, password: current, key, nowMs });
  if (!auth.ok) return auth;
  const secret = generateTotpSecret();
  const blob = encryptSecret(JSON.stringify({ s: secret, u: user.id, e: nowMs + PENDING_MS }), key);
  return { ok: true, secret, secretGroups: secret.match(/.{1,4}/g).join(" "), otpauth: otpauthUri({ secret, account: user.username, issuer: "Medoria" }), blob };
}

export async function confirmTwoStep(admin, { user, blob, code, key, nowMs = Date.now() }) {
  if (!key) return { ok: false, error: "noKey" };
  let pending = null;
  try { pending = JSON.parse(decryptSecret(blob, key) || "null"); } catch { pending = null; }
  if (!pending || pending.u !== user.id) return { ok: false, error: "expired" };
  if (!(pending.e > nowMs)) return { ok: false, error: "expired" };
  const step = matchTotp({ secret: pending.s, code, nowMs });
  if (step === null) return { ok: false, error: "wrongCode" };
  const codes = generateRecoveryCodes(10);
  const { data, error } = await admin.from("operator_users").update({
    totp_secret_enc: encryptSecret(pending.s, key), recovery_hashes: codes.map((c) => c.hash), totp_last_step: step,
  }).eq("id", user.id).is("totp_secret_enc", null).select("id");
  if (error) return { ok: false, error: "failed" };
  if (!data?.length) return { ok: false, error: "alreadyOn" };
  return { ok: true, recoveryCodes: codes.map((c) => c.code) };       // shown once
}

export async function disableTwoStep(admin, { user, current, code, key }) {
  if (!user.hasTotp) return { ok: false, error: "notSetUp" };
  if (user.require2fa) return { ok: false, error: "required" };
  const auth = await reauthenticate(admin, { userId: user.id, password: current, code, key });
  if (!auth.ok) return auth;
  const { data, error } = await admin.from("operator_users").update({ totp_secret_enc: null, recovery_hashes: [], totp_last_step: 0 }).eq("id", user.id).select("id");
  if (error || !data?.length) return { ok: false, error: "failed" };
  return { ok: true };
}

export async function newRecoveryCodes(admin, { user, current, code, key }) {
  if (!user.hasTotp) return { ok: false, error: "notSetUp" };
  const auth = await reauthenticate(admin, { userId: user.id, password: current, code, key });
  if (!auth.ok) return auth;
  const codes = generateRecoveryCodes(10);
  const { data, error } = await admin.from("operator_users").update({ recovery_hashes: codes.map((c) => c.hash) }).eq("id", user.id).select("id");
  if (error || !data?.length) return { ok: false, error: "failed" };
  return { ok: true, recoveryCodes: codes.map((c) => c.code) };
}

export function selfMessage(result) {
  if (!result || result.ok) return null;
  if (result.error === "password") return null;   // the caller maps the policy problem with the user-admin messages
  return SELF_MESSAGES[result.error] || SELF_MESSAGES.failed;
}
