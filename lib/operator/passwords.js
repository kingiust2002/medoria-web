// lib/operator/passwords.js — password hashing and the password policy for personal operator accounts.
// Plain module on node:crypto (no Next imports): unit-tested directly. The hash format is the one the panels already
// use (`scrypt:<N>:<r>:<p>:<saltHex>:<keyHex>`, scripts/hash-operator-password.mjs), so an env hash can become an account.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const MAX_PASSWORD_LENGTH = 256;
export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(String(password), salt, 32, SCRYPT);
  return `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}:${salt.toString("hex")}:${key.toString("hex")}`;
}

// A hash that never matches anything: verifying against it costs the same as a real check, so an unknown username
// and a wrong password take the same time.
export const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

export function parseHash(stored) {
  const parts = String(stored || "").split(":");
  if (parts[0] !== "scrypt") return null;
  if (parts.length === 3) return { N: 16384, r: 8, p: 1, saltHex: parts[1], keyHex: parts[2] };        // legacy Node defaults
  if (parts.length !== 6) return null;
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![N, r, p].every(Number.isInteger) || N < 2 || N > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return null;
  return { N, r, p, saltHex: parts[4], keyHex: parts[5] };
}

export function verifyPasswordHash(password, stored) {
  if (typeof password !== "string" || !password || password.length > MAX_PASSWORD_LENGTH) return false;
  const h = parseHash(stored);
  if (!h || !/^[0-9a-f]+$/i.test(h.saltHex) || !/^[0-9a-f]+$/i.test(h.keyHex)) return false;
  try {
    const expected = Buffer.from(h.keyHex, "hex");
    const derived = scryptSync(password, Buffer.from(h.saltHex, "hex"), expected.length, { N: h.N, r: h.r, p: h.p, maxmem: 256 * 1024 * 1024 });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

const COMMON = new Set(["password1234", "123456789012", "qwertyuiop12", "medoria12345", "administrator", "changeme1234", "iloveyou1234"]);

// → null when acceptable, else a stable code (the UI translates it).
export function passwordProblem(password, { username = "", displayName = "" } = {}) {
  if (typeof password !== "string") return "bad_type";
  if (password.length < MIN_PASSWORD_LENGTH) return "too_short";
  if (password.length > MAX_PASSWORD_LENGTH) return "too_long";
  const low = password.toLowerCase();
  if (COMMON.has(low)) return "too_common";
  if (username && low.includes(String(username).toLowerCase())) return "contains_username";
  if (displayName && displayName.length >= 4 && low.includes(displayName.toLowerCase())) return "contains_name";
  if (new Set(low).size < 5) return "too_uniform";
  if (!/[a-z؀-ۿЀ-ӿ]/i.test(password) || !/[0-9]/.test(password)) {
    if (password.length < 16) return "needs_letter_and_digit";   // a long passphrase is allowed without a digit
  }
  return null;
}

export const normalizeUsername = (s) => String(s ?? "").trim().toLowerCase();
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;
