// lib/operator/auth.js — SERVER ONLY
// Password hashing/verification (scrypt) + session cookie helpers.
// Uses node:crypto and next/headers, so it must only run on the Node server
// (route handlers, server actions, server components) — never in middleware
// (Edge) and never in a Client Component.
import "server-only";
import { cookies } from "next/headers";
import { scryptSync, timingSafeEqual, randomBytes } from "node:crypto";
import { OP_COOKIE, verifySession, sessionTtlMs } from "@/lib/operator/session";

// ── Configuration presence (fail-safe) ───────────────────────────────────────
export function hasSessionSecret() {
  const s = process.env.OPERATOR_SESSION_SECRET;
  return Boolean(s && s.length >= 16);
}
export function hasPasswordHash() {
  const h = process.env.OPERATOR_PASSWORD_HASH;
  return Boolean(h && h.startsWith("scrypt:"));
}
export function isOperatorConfigured() {
  return hasSessionSecret() && hasPasswordHash();
}

// ── Password (scrypt) ─────────────────────────────────────────────────────────
// Stored format:  scrypt:<saltHex>:<keyHex>
export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(String(password), salt, 32);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export function verifyPassword(password) {
  const stored = process.env.OPERATOR_PASSWORD_HASH || "";
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

// Read + verify the current session from the request cookies.
export async function getSession() {
  const token = cookies().get(OP_COOKIE)?.value;
  return verifySession(token);
}
