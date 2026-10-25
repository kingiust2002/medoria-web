// lib/security/rateLimit.js
// Fixed-window rate limiter behind a tiny store adapter, + request helpers.
// Used by the public quote action, the captcha issuer and the AI chat route.
//
// Stores (chosen once at startup, no new dependencies):
//   • memory  — default. Per server instance, resets on restart. Free,
//     instant, good enough to blunt bots/bursts/loops. Production runs ONE app
//     container, so "per instance" is global there (docs/SECURITY_DECISIONS.md).
//   • upstash — durable, global. Activated automatically when BOTH
//     UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set (Upstash
//     Redis REST API via plain fetch — no SDK). INCR + PEXPIRE NX per window.
//
// Every path FAILS OPEN by design: a limiter/store outage must never take the
// public forms or chat down. The API is async so durable stores are drop-in.

const MAX_BUCKETS = 5000; // memory-store ceiling; expired buckets are pruned first, then the oldest quarter goes
const buckets = new Map(); // insertion order = window start order (a re-opened window is re-inserted)

function memoryHit(key, limit, windowMs) {
  const now = Date.now();
  if (buckets.size >= MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size >= MAX_BUCKETS) {
      // Still full of live windows (a flood of distinct keys): drop the OLDEST quarter, not everything,
      // so a flood cannot reset the counters of the callers who are not part of it.
      let drop = MAX_BUCKETS >> 2;
      for (const k of buckets.keys()) { if (drop-- <= 0) break; buckets.delete(k); }
    }
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.delete(key);
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

// Best-effort client IP from proxy headers. `h` is any Headers-like object with .get().
//
// Order matters: the key of every rate limit is this value.
//   1. x-real-ip: production Caddy sets it from the TCP peer address
//      (`header_up X-Real-IP {remote_host}` in deploy/Caddyfile), overwriting
//      whatever the client sent, so a visitor cannot choose it.
//   2. the left-most x-forwarded-for token: only a fallback for setups without
//      that header. A client can PREPEND entries to this header, so it must never
//      outrank x-real-ip (the operator login routes already prefer x-real-ip).
//   3. "unknown".
export function clientIpFromHeaders(h) {
  try {
    const real = h.get("x-real-ip");
    if (real && real.trim()) return normalizeClientIp(real.trim());
    const xff = h.get("x-forwarded-for");
    const first = xff ? xff.split(",")[0].trim() : "";
    return first ? normalizeClientIp(first) : "unknown";
  } catch {
    return "unknown";
  }
}

// The unit a limit counts. IPv4: the address. IPv4-mapped IPv6 (::ffff:1.2.3.4): that IPv4 address.
// Other IPv6: the /64 prefix: one subscriber normally holds a whole /64 and can use any address in it,
// so a per-address limit would be no limit at all.
export function normalizeClientIp(ip) {
  const v = String(ip || "").trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const mapped = v.match(/^(?:(?:0{1,4}:){5}|::)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];
  if (!v.includes(":")) return v || "unknown";
  const [head, tail = ""] = v.split("::");
  const a = head ? head.split(":") : [];
  const b = v.includes("::") ? (tail ? tail.split(":") : []) : [];
  if (!v.includes("::") && a.length !== 8) return v;                 // not an address we understand: keep as is
  const groups = v.includes("::") ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return v;
  return `v6:${groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":")}`;
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
