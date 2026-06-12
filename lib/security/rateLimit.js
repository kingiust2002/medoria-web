// lib/security/rateLimit.js
// Lightweight in-memory fixed-window rate limiter + request helpers, shared by
// the public quote action, the AI chat route and (pattern-wise) operator login.
//
// Scope: per server instance — on Vercel each warm lambda keeps its own map and
// it resets on cold start. That is intentional: it blunts bursts, bots and
// accidental loops at zero cost without an external store. For hard, durable
// global limits use Upstash/Vercel KV (documented in the hardening PR) — the
// call sites only need this module swapped.

const buckets = new Map();
const MAX_BUCKETS = 5000; // memory ceiling; pruned (then cleared) when reached

// key: any string identifying the caller+action (e.g. "quote:1.2.3.4").
// Returns { ok, retryAfterMs }. Fails OPEN by design — a limiter bug must
// never take the feature down.
export function rateLimit(key, { limit, windowMs }) {
  try {
    const now = Date.now();
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      if (buckets.size >= MAX_BUCKETS) buckets.clear();
    }
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, retryAfterMs: 0 };
    }
    b.count += 1;
    return { ok: b.count <= limit, retryAfterMs: Math.max(0, b.resetAt - now) };
  } catch {
    return { ok: true, retryAfterMs: 0 };
  }
}

// Best-effort client IP from proxy headers (Vercel sets x-forwarded-for).
// `h` is any Headers-like object with .get().
export function clientIpFromHeaders(h) {
  try {
    const xff = h.get("x-forwarded-for");
    const first = xff ? xff.split(",")[0].trim() : "";
    return first || h.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

// CSRF defence for route handlers: browsers attach Origin to cross-site POSTs;
// when present it must match the request host. (Server actions get the same
// check from Next.js itself.)
export function isSameOriginRequest(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl, bots) — handled by rate limits
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
