// lib/beauty/operator/auth.js — SERVER ONLY
// Credential verification + session helpers for the BEAUTY operator panel.
// Identical security design to lib/operator/auth.js, but reads the
// BEAUTY_OPERATOR_* environment variables and the Beauty session cookie, so
// panel access is fully separate from Health's (the Beauty panel can be
// handed to a different person without granting Health access).
import "server-only";
import { cookies } from "next/headers";
import { createHash, scryptSync, timingSafeEqual, randomBytes } from "node:crypto";
import { BOP_COOKIE, verifySession, sessionTtlMs } from "@/lib/beauty/operator/session";

// Real credentials are far shorter; this only keeps pathological payloads
// away from scrypt.
const MAX_CRED_LENGTH = 256;

// ── Configuration presence (fail-safe) ───────────────────────────────────────
export function hasSessionSecret() {
  const s = process.env.BEAUTY_OPERATOR_SESSION_SECRET;
  return Boolean(s && s.length >= 16);
}
export function hasPasswordHash() {
  const h = process.env.BEAUTY_OPERATOR_PASSWORD_HASH;
  return Boolean(h && h.startsWith("scrypt:"));
}
export function hasUsername() {
  const u = process.env.BEAUTY_OPERATOR_USERNAME;
  return Boolean(u && u.trim().length >= 1);
}
export function isBeautyOperatorConfigured() {
  return hasSessionSecret() && hasPasswordHash() && hasUsername();
}

// ── Password (scrypt) ─────────────────────────────────────────────────────────
// Stored format:  scrypt:<saltHex>:<keyHex>  (scripts/hash-operator-password.mjs)
export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(String(password), salt, 32);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export function verifyPassword(password) {
  const stored = process.env.BEAUTY_OPERATOR_PASSWORD_HASH || "";
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, keyHex] = parts;
  try {
    const derived = scryptSync(String(password), Buffer.from(saltHex, "hex"), 32);
    const expected = Buffer.from(keyHex, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// Constant-time string equality; hashing first removes the equal-length
// requirement of timingSafeEqual (length differences would otherwise leak).
function safeEqual(a, b) {
  const da = createHash("sha256").update(String(a)).digest();
  const db = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(da, db);
}

// Verify the full credential pair. Both checks always run, so response timing
// never reveals whether the username alone was correct.
export function verifyCredentials(username, password) {
  if (typeof username !== "string" || typeof password !== "string") return false;
  if (!username || !password) return false;
  if (username.length > MAX_CRED_LENGTH || password.length > MAX_CRED_LENGTH) return false;
  const expectedUser = (process.env.BEAUTY_OPERATOR_USERNAME || "").trim();
  const userOk = expectedUser.length > 0 && safeEqual(username.trim(), expectedUser);
  const passOk = verifyPassword(password);
  return userOk && passOk;
}

// Short fingerprint of the configured credentials, embedded in every session
// token. Rotating either env var invalidates all previously issued sessions.
export function credentialsVersion() {
  return createHash("sha256")
    .update(`${process.env.BEAUTY_OPERATOR_USERNAME || ""}\u0000${process.env.BEAUTY_OPERATOR_PASSWORD_HASH || ""}`)
    .digest("hex")
    .slice(0, 16);
}

// ── Session cookie options ────────────────────────────────────────────────────
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(sessionTtlMs() / 1000),
  };
}

// Read + verify the current Beauty session from the request cookies.
export async function getSession() {
  const token = cookies().get(BOP_COOKIE)?.value;
  const payload = await verifySession(token);
  if (!payload) return null;
  if (payload.ver !== credentialsVersion()) return null; // credentials rotated
  return payload;
}

// CSRF defence-in-depth for the auth route handlers: browsers always attach an
// Origin header to POST requests; when present it must match the request host.
export function isSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients don't send Origin
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false; // malformed or the literal "null" origin
  }
}
