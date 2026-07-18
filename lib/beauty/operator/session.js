// lib/beauty/operator/session.js
// Stateless, signed session token for the BEAUTY operator panel — same
// HMAC-SHA256 design as lib/operator/session.js but with its own cookie and
// its own secret, so the two panels' sessions are cryptographically
// independent (a Health session can never open the Beauty panel or vice
// versa, and rotating one secret does not log the other panel out).
//
// Web primitives only (crypto.subtle) — safe for Edge and Node. Never import
// from a Client Component.

export const BOP_COOKIE = "medoria_beauty_operator";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlFromBytes(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getSecret() {
  const s = process.env.BEAUTY_OPERATOR_SESSION_SECRET;
  return s && s.length >= 16 ? s : null;
}

async function importKey(usages) {
  const secret = getSecret();
  if (!secret) return null;
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

export function sessionTtlMs() {
  const h = Number(process.env.BEAUTY_OPERATOR_SESSION_TTL_HOURS || 8);
  return (Number.isFinite(h) && h > 0 ? h : 8) * 3600 * 1000;
}

// Sign a payload → "body.sig" token. Returns null if no secret is configured.
export async function signSession(payload = {}) {
  const key = await importKey(["sign"]);
  if (!key) return null;
  const now = Date.now();
  const body = { ...payload, iat: now, exp: now + sessionTtlMs() };
  const data = b64urlFromBytes(enc.encode(JSON.stringify(body)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return `${data}.${b64urlFromBytes(sig)}`;
}

// Verify a token → payload object, or null (bad signature / expired / no secret).
export async function verifySession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const key = await importKey(["verify"]);
  if (!key) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      bytesFromB64url(sig),
      enc.encode(data)
    );
    if (!valid) return null;
    const payload = JSON.parse(dec.decode(bytesFromB64url(data)));
    if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
