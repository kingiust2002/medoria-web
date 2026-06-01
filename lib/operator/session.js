// lib/operator/session.js
// Stateless, signed session token for the operator panel (HMAC-SHA256).
//
// Runs in BOTH the Edge middleware and the Node server, so it uses only Web
// primitives (crypto.subtle, TextEncoder, btoa/atob) — never node:crypto or
// next/headers. No secret is read at import time; everything is lazy.
//
// IMPORTANT: this module must never be imported by a Client Component. It is
// imported by middleware.js, route handlers, and server-only modules only.

export const OP_COOKIE = "medoria_operator";

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
  const s = process.env.OPERATOR_SESSION_SECRET;
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
  const h = Number(process.env.OPERATOR_SESSION_TTL_HOURS || 8);
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
