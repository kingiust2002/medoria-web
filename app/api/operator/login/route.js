// app/api/operator/login/route.js
// Operator login: verifies the password, sets a signed HttpOnly session cookie.
// Lives under /api so middleware never locale-rewrites or auth-gates it.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OP_COOKIE, signSession } from "@/lib/operator/session";
import { verifyPassword, isOperatorConfigured, sessionCookieOptions } from "@/lib/operator/auth";

export const runtime = "nodejs";

// Simple in-memory rate limit (per server instance). Resets on redeploy.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0] : "").trim() || req.headers.get("x-real-ip") || "local";
}
function isRateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.resetAt < now) { attempts.set(ip, { count: 0, resetAt: now + WINDOW_MS }); return false; }
  return rec.count >= MAX_ATTEMPTS;
}
function recordFailure(ip) { const rec = attempts.get(ip); if (rec) rec.count += 1; }

export async function POST(req) {
  const ip = clientIp(req);

  // Constant-ish delay to blunt brute-force + timing analysis.
  await new Promise((r) => setTimeout(r, 250));

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "تلاش‌های زیاد. چند دقیقه بعد دوباره امتحان کنید." }, { status: 429 });
  }

  // Fail-safe: if the panel isn't configured (no secret / no hash), deny generically.
  if (!isOperatorConfigured()) {
    return NextResponse.json({ error: "سرویس در دسترس نیست." }, { status: 503 });
  }

  let body = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const password = body?.password;

  if (!password || !verifyPassword(password)) {
    recordFailure(ip);
    return NextResponse.json({ error: "رمز عبور نادرست است." }, { status: 401 });
  }

  const token = await signSession({ role: "admin" });
  if (!token) return NextResponse.json({ error: "سرویس در دسترس نیست." }, { status: 503 });

  attempts.delete(ip);
  cookies().set(OP_COOKIE, token, sessionCookieOptions());
  return NextResponse.json({ ok: true });
}
