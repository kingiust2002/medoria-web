// app/api/beauty-operator/login/route.js
// Beauty operator login: verifies the BEAUTY credential pair, sets a signed
// HttpOnly cookie (its own name + secret — independent from Health's panel).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { BOP_COOKIE, signSession } from "@/lib/beauty/operator/session";
import {
  verifyCredentials,
  isBeautyOperatorConfigured,
  sessionCookieOptions,
  credentialsVersion,
  isSameOrigin,
} from "@/lib/beauty/operator/auth";

export const runtime = "nodejs";

// Best-effort brute-force protection. In-memory, per server instance.
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_TRACKED = 500;

// Generic on purpose: never reveal which field was wrong.
const GENERIC_FAIL = "نام کاربری یا رمز عبور نادرست است.";
const LOCKED_OUT = "تلاش‌های ناموفق زیاد است. چند دقیقه بعد دوباره امتحان کنید.";
const UNAVAILABLE = "سرویس در دسترس نیست.";

function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0] : "").trim() || req.headers.get("x-real-ip") || "local";
}

function isLimited(key) {
  const rec = attempts.get(key);
  return Boolean(rec && rec.resetAt >= Date.now() && rec.count >= MAX_ATTEMPTS);
}

function recordFailure(key) {
  const now = Date.now();
  if (attempts.size >= MAX_TRACKED) {
    for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
  }
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else rec.count += 1;
}

export async function POST(req) {
  // Uniform delay blunts brute force and smooths timing differences.
  await new Promise((r) => setTimeout(r, 250));

  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 403 });
  }

  // Fail-safe: if the panel isn't fully configured, deny generically.
  if (!isBeautyOperatorConfigured()) {
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  }

  let body = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  // Throttle by client IP and by attempted username.
  const keys = [`ip:${clientIp(req)}`];
  if (username) keys.push(`user:${username.toLowerCase().slice(0, 64)}`);

  if (keys.some(isLimited)) {
    return NextResponse.json({ error: LOCKED_OUT }, { status: 429 });
  }

  if (!verifyCredentials(username, password)) {
    keys.forEach(recordFailure);
    return NextResponse.json({ error: GENERIC_FAIL }, { status: 401 });
  }

  const token = await signSession({ role: "beauty-admin", ver: credentialsVersion() });
  if (!token) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });

  keys.forEach((k) => attempts.delete(k));
  cookies().set(BOP_COOKIE, token, sessionCookieOptions());
  return NextResponse.json({ ok: true });
}
