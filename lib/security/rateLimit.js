// lib/security/rateLimit.js
// Fixed-window rate limiter behind a tiny store adapter, + request helpers.
// Used by the public quote action, the captcha issuer and the AI chat route.
//
// Stores (chosen once at startup, no new dependencies):
//   • memory  — default. Per server instance, resets on cold start. Free,
//     instant, good enough to blunt bots/bursts/loops.
//   • upstash — durable, global. Activated automatically when BOTH
//     UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set (Upstash
//     Redis REST API via plain fetch — no SDK). INCR + PEXPIRE NX per window.
//
// Every path FAILS OPEN by design: a limiter/store outage must never take the
// public forms or chat down. The API is async so durable stores are drop-in.

const MAX_BUCKETS = 5000; // memory-store ceiling; pruned (then cleared) when hit
const buckets = new Map();

function memoryHit(key, limit, windowMs) {
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
}

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

async function upstashHit(cfg, key, limit, windowMs) {
  // Atomic enough for fixed windows: INCR creates/bumps the counter and
  // PEXPIRE ... NX sets the TTL only on the window's first hit.
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", `rl:${key}`],
      ["PEXPIRE", `rl:${key}`, String(windowMs), "NX"],
      ["PTTL", `rl:${key}`],
    ]),
    signal: AbortSignal.timeout(1500), // a slow store must not stall the form
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const out = await res.json();
  const count = Number(out?.[0]?.result);
  const ttl = Number(out?.[2]?.result);
  if (!Number.isFinite(count)) throw new Error("upstash bad response");
  return { ok: count <= limit, retryAfterMs: ttl > 0 ? ttl : windowMs };
}

// key: string identifying caller+action (e.g. "quote:m:1.2.3.4").
// Returns { ok, retryAfterMs }.
export async function rateLimit(key, { limit, windowMs }) {
  try {
    const cfg = upstashConfig();
    if (cfg) {
      try {
        return await upstashHit(cfg, key, limit, windowMs);
      } catch (err) {
        // Durable store unreachable → degrade to per-instance limiting.
        console.error("rateLimit upstash fallback:", err?.message || err);
        return memoryHit(key, limit, windowMs);
      }
    }
    return memoryHit(key, limit, windowMs);
  } catch {
    return { ok: true, retryAfterMs: 0 }; // fail open, never take the feature down
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
