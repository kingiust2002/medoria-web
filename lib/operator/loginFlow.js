// lib/operator/loginFlow.js — SERVER ONLY. The login and logout flow of BOTH operator panels, written
// once so the two cannot drift apart. Each panel's route file passes its own configuration (cookie,
// credential checks, environment variable names); nothing is shared between the panels at run time
// (separate cookies, secrets, second factors, session and log rows).
//
// Login: same-origin check → 250 ms delay → configured? → rate limit → username + password →
// (second factor, if the panel has one) → a registered session → signed cookie.
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rateLimit } from "@/lib/security/rateLimit";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { SESSION_SECRET_ENV, requestIp } from "@/lib/operator/audit";
import { hashRecovery, matchTotp, newSessionId, parseRecoveryHashes, registerSession, revokeSession, verifySecondFactor, writeAudit } from "@/lib/operator/security";
import { acceptTotpStep, bootstrapOwner, markLogin, consumeRecoveryCode, usersMode, verifyLogin } from "@/lib/operator/accounts";
import { dataKeyFromEnv, decryptSecret, encryptSecret } from "@/lib/operator/userSecrets";
import { usersEnabled } from "@/lib/operator/sessionGate";
import { tr } from "../panel/i18n.js";

const GENERIC_FAIL = tr("نام کاربری یا رمز عبور نادرست است.");
const NEED_CODE = tr("کد دومرحله‌ای را وارد کنید.");
const BAD_CODE = tr("کد وارد‌شده نادرست یا قبلاً استفاده‌شده است.");
const LOCKED_OUT = tr("تلاش‌های ناموفق زیاد است. چند دقیقه بعد دوباره امتحان کنید.");
const UNAVAILABLE = tr("سرویس در دسترس نیست.");
const BOOTSTRAP_NEEDS_KEY = tr("برای تبدیل حساب فعلی به مدیر اصلی، کلید OPERATOR_DATA_KEY روی سرور لازم است (راز دومرحله‌ای بدون آن نگهداری نمی‌شود).");
const BOOTSTRAP_USERNAME = tr("نام کاربری فعلی برای حساب شخصی مناسب نیست؛ OPERATOR_BOOTSTRAP_USERNAME را روی سرور تنظیم کنید.");
const LOGOUT_FAILED = tr("خروج کامل انجام نشد: نشست روی سرور باطل نشد. دوباره تلاش کنید؛ تا آن زمان این مرورگر همچنان وارد است.");

// cfg = { panel, cookieName, role, env:{ totp, recovery }, limiterPrefix, auth:{ verifyCredentials,
//         isConfigured, sessionCookieOptions, credentialsVersion, isSameOrigin }, session:{ signSession, verifySession, sessionTtlMs } }
export async function handleLogin(req, cfg) {
  const { panel, auth, session } = cfg;
  await new Promise((r) => setTimeout(r, 250));                        // uniform delay

  if (!auth.isSameOrigin(req)) return NextResponse.json({ error: tr("درخواست نامعتبر است.") }, { status: 403 });

  // Which login is in force: the old env account ("legacy"), the env account that is about to become the first owner
  // ("bootstrap"), or personal accounts ("users"). A database that cannot answer refuses (never the weaker mode).
  const mode = await usersMode(getAdminClient(), { enabled: usersEnabled() });
  if (mode === "unavailable") return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  if (mode !== "users" && !auth.isConfigured()) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });   // fail-safe

  // Brute-force throttle: by IP only (a stranger cannot lock the real operator out); every attempt
  // counts, which also caps the scrypt CPU cost per source.
  const ip = await requestIp() || "local";
  const [burst, sustained] = await Promise.all([
    rateLimit(`${cfg.limiterPrefix}:b:${ip}`, { limit: 8, windowMs: 60_000 }),
    rateLimit(`${cfg.limiterPrefix}:s:${ip}`, { limit: 20, windowMs: 10 * 60_000 }),
  ]);
  if (!burst.ok || !sustained.ok) return NextResponse.json({ error: LOCKED_OUT }, { status: 429 });

  let body = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const recovery = typeof body?.recovery === "string" ? body.recovery : "";

  const admin = getAdminClient();
  const secret = process.env[SESSION_SECRET_ENV[panel]];
  const log = (action, detail) => writeAudit(admin, { panel, action, detail, ip, secret });

  if (mode === "users") return handleUserLogin({ cfg, admin, ip, secret, username, password, code, recovery });

  if (!auth.verifyCredentials(username, password)) {
    await log("auth.login_failed", { reason: "password" });
    return NextResponse.json({ error: GENERIC_FAIL }, { status: 401 });
  }

  // second factor (only when the panel has one configured)
  let method = "password";
  const totpSecret = process.env[cfg.env.totp] || "";
  if (totpSecret) {
    if (!code && !recovery) return NextResponse.json({ error: NEED_CODE, needCode: true }, { status: 401 });
    // a stranger who already knows the password still cannot guess codes without limit
    const guard = await rateLimit(`${cfg.limiterPrefix}:2fa`, { limit: 10, windowMs: 15 * 60_000 });
    if (!guard.ok) return NextResponse.json({ error: LOCKED_OUT, needCode: true }, { status: 429 });
    const second = await verifySecondFactor({
      admin, panel, secret: totpSecret, recoveryHashes: parseRecoveryHashes(process.env[cfg.env.recovery]),
      code, recovery,
    });
    if (!second.ok) {
      await log("auth.login_failed", { reason: second.reason });
      return NextResponse.json({ error: BAD_CODE, needCode: true }, { status: 401 });
    }
    method = second.method === "recovery" ? "recovery" : "password+totp";
  }

  // The very first personal-account login: the env account that has just proved itself becomes the first owner, and from then
  // on only personal accounts log in. Refused (nothing changes) when it cannot be done safely.
  let owner = null;
  if (mode === "bootstrap") {
    const key = dataKeyFromEnv();
    const made = await bootstrapOwner(admin, {
      username: process.env.OPERATOR_BOOTSTRAP_USERNAME || process.env[cfg.env.username] || "",
      passwordHash: process.env[cfg.env.passwordHash] || "",
      totpSecret: totpSecret || null,
      recoveryHashes: parseRecoveryHashes(process.env[cfg.env.recovery]),
      encrypt: key ? (plain) => encryptSecret(plain, key) : null,
    });
    if (!made.ok) {
      await log("auth.bootstrap_failed", { reason: made.error });
      return NextResponse.json({ error: made.error === "dataKeyMissing" ? BOOTSTRAP_NEEDS_KEY : made.error === "badUsername" ? BOOTSTRAP_USERNAME : UNAVAILABLE }, { status: 503 });
    }
    owner = made.user;
    await writeAudit(admin, { panel, action: "auth.bootstrap_owner", ip, secret, userId: owner.id, result: "success" });
  }

  const sid = newSessionId();
  const reg = await registerSession(admin, { panel, sid, ttlMs: session.sessionTtlMs(), ip, secret, userId: owner?.id });
  if (!reg.ok) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });   // cannot record the session → no login

  const token = await session.signSession(owner
    ? { role: cfg.role, uid: owner.id, av: owner.authzVersion, sid }
    : { role: cfg.role, ver: auth.credentialsVersion(), sid });
  if (!token) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  (await cookies()).set(cfg.cookieName, token, auth.sessionCookieOptions());

  await writeAudit(admin, { panel, action: "auth.login", detail: { method }, sid, ip, secret, userId: owner?.id, result: owner ? "success" : undefined });
  if (method === "recovery") await writeAudit(admin, { panel, action: "auth.recovery_code_used", sid, ip, secret, userId: owner?.id });
  if (owner) await markLogin(admin, owner.id);
  return NextResponse.json({ ok: true, ...(method === "recovery" ? { recoveryUsed: true } : {}) });
}

// Personal-account login (mode "users"): username + password (constant cost, one generic failure), then the person's own second
// factor when they have one. A person who must use a second factor but has not set one up is refused for now.
async function handleUserLogin({ cfg, admin, ip, secret, username, password, code, recovery }) {
  const { panel, session } = cfg;
  const verified = await verifyLogin(admin, { username, password, panel });
  if (verified.unavailable) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  if (!verified.ok) {
    await writeAudit(admin, { panel, action: "auth.login_failed", detail: { reason: verified.reason }, ip, secret, userId: verified.userId, result: "failure" });
    return NextResponse.json({ error: GENERIC_FAIL }, { status: 401 });
  }
  const user = verified.user;
  const fail = (reason) => writeAudit(admin, { panel, action: "auth.login_failed", detail: { reason }, ip, secret, userId: user.id, result: "failure" });

  let method = "password";
  if (verified.secret.totpEnc) {
    if (!code && !recovery) return NextResponse.json({ error: NEED_CODE, needCode: true }, { status: 401 });
    const guard = await rateLimit(`${cfg.limiterPrefix}:2fa:${user.id}`, { limit: 10, windowMs: 15 * 60_000 });
    if (!guard.ok) return NextResponse.json({ error: LOCKED_OUT, needCode: true }, { status: 429 });
    let accepted;
    if (recovery) {
      accepted = await consumeRecoveryCode(admin, { userId: user.id, hash: hashRecovery(recovery), hashes: verified.secret.recoveryHashes });
      if (accepted.ok) method = "recovery";
    } else {
      const seed = decryptSecret(verified.secret.totpEnc, dataKeyFromEnv());
      if (!seed) {
        await fail("seed_unreadable");
        return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
      }
      const step = matchTotp({ secret: seed, code });
      accepted = step === null ? { ok: false, reason: "bad_code" }
        : step <= verified.secret.lastStep ? { ok: false, reason: "replay" }
        : await acceptTotpStep(admin, { userId: user.id, step });
      if (accepted.ok) method = "password+totp";
    }
    if (!accepted.ok) {
      await fail(accepted.reason);
      return NextResponse.json({ error: BAD_CODE, needCode: true }, { status: 401 });
    }
  }
  // A person whose two-step login is required but not set up yet, or whose password is a temporary one, DOES get a session — a
  // restricted one: lib/operator/access.js lets it open nothing but their own security screen until that is done.

  const sid = newSessionId();
  const reg = await registerSession(admin, { panel, sid, ttlMs: session.sessionTtlMs(), ip, secret, userId: user.id });
  if (!reg.ok || reg.unavailable) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  const token = await session.signSession({ role: cfg.role, uid: user.id, av: user.authzVersion, sid });
  if (!token) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  (await cookies()).set(cfg.cookieName, token, cfg.auth.sessionCookieOptions());

  await writeAudit(admin, { panel, action: "auth.login", detail: { method }, sid, ip, secret, userId: user.id, result: "success" });
  if (method === "recovery") await writeAudit(admin, { panel, action: "auth.recovery_code_used", sid, ip, secret, userId: user.id });
  await markLogin(admin, user.id);
  return NextResponse.json({
    ok: true, ...(method === "recovery" ? { recoveryUsed: true } : {}),
    ...(user.mustChangePassword ? { mustChangePassword: true } : {}), ...(user.require2fa && !verified.secret.totpEnc ? { mustSetUpTwoStep: true } : {}),
  });
}

export async function handleLogout(req, cfg) {
  const { panel, auth, session } = cfg;
  if (!auth.isSameOrigin(req)) return NextResponse.json({ error: tr("درخواست نامعتبر است.") }, { status: 403 });

  const jar = await cookies();
  const payload = await session.verifySession(jar.get(cfg.cookieName)?.value);
  if (payload?.role === cfg.role && payload.sid) {
    // the signed cookie alone is no longer enough: its session is ended on the server too,
    // so a copy of the cookie stops working at logout
    const admin = getAdminClient();
    const ip = await requestIp();
    const secret = process.env[SESSION_SECRET_ENV[panel]];
    const revoked = await revokeSession(admin, { panel, sid: payload.sid });
    if (!revoked.ok) {
      // The server could not end the session. Clearing the browser cookie now would report a logout that did not
      // happen (a copy of the cookie would keep working) AND destroy the only handle for a retry. So: say so, keep
      // the cookie, and let the user try again.
      await writeAudit(admin, { panel, action: "auth.logout_failed", detail: { reason: "revoke_failed" }, sid: payload.sid, ip, secret, userId: payload.uid });
      return NextResponse.json({ ok: false, error: LOGOUT_FAILED }, { status: 503 });
    }
    await writeAudit(admin, { panel, action: "auth.logout", sid: payload.sid, ip, secret, userId: payload.uid });
  }
  jar.set(cfg.cookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
