// app/api/operator/login/route.js
// Operator login: verifies username + password, sets a signed HttpOnly cookie.
// Lives under /api so middleware never locale-rewrites or auth-gates it.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OP_COOKIE, signSession } from "@/lib/operator/session";
import {
  verifyCredentials,
  isOperatorConfigured,
  sessionCookieOptions,
  credentialsVersion,
  isSameOrigin,
} from "@/lib/operator/auth";
import { rateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

// Generic on purpose: never reveal which field was wrong.
const GENERIC_FAIL = "نام کاربری یا رمز عبور نادرست است.";
const LOCKED_OUT = "تلاش‌های ناموفق زیاد است. چند دقیقه بعد دوباره امتحان کنید.";
const UNAVAILABLE = "سرویس در دسترس نیست.";

// Prefer the platform-set x-real-ip (Vercel overwrites it with the true client
// IP) over the left-most x-forwarded-for token, which a client can prepend to
// rotate the rate-limit key. Falls back to XFF only when x-real-ip is absent.
function clientIp(req) {
  const real = req.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0].trim() : "") || "local";
}

export async function POST(req) {
  // Uniform delay blunts brute force and smooths timing differences.
  await new Promise((r) => setTimeout(r, 250));

  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 403 });
  }

  // Fail-safe: if the panel isn't fully configured, deny generically.
  if (!isOperatorConfigured()) {
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  }

  // Durable, cross-instance brute-force throttle (Upstash-backed when
  // UPSTASH_REDIS_REST_* is set; per-instance memory otherwise). Keyed by IP
  // only — no username key, so a third party can't lock the real operator out.
  // Counting every attempt also caps the scrypt CPU cost per source.
  const ip = clientIp(req);
  const [burst, sustained] = await Promise.all([
    rateLimit(`oplogin:b:${ip}`, { limit: 8, windowMs: 60_000 }),
    rateLimit(`oplogin:s:${ip}`, { limit: 20, windowMs: 10 * 60_000 }),
  ]);
  if (!burst.ok || !sustained.ok) {
    return NextResponse.json({ error: LOCKED_OUT }, { status: 429 });
  }

  let body = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!verifyCredentials(username, password)) {
    return NextResponse.json({ error: GENERIC_FAIL }, { status: 401 });
  }

  const token = await signSession({ role: "admin", ver: credentialsVersion() });
  if (!token) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });

  cookies().set(OP_COOKIE, token, sessionCookieOptions());
  return NextResponse.json({ ok: true });
}
