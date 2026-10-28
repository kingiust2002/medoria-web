// lib/operator/userSecrets.js — encryption of per-user secrets (the two-step-login seed) at rest.
// AES-256-GCM, random 96-bit nonce per value, format `v1.<nonce>.<tag>.<cipher>` (base64url). The key is the server
// secret OPERATOR_DATA_KEY (32 random bytes, base64). The database alone (a backup, a leaked dump) is not enough to
// read a seed. Plain module on node:crypto so it is unit-tested directly.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function parseDataKey(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const key = Buffer.from(raw.trim(), "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}
export const dataKeyFromEnv = () => parseDataKey(process.env.OPERATOR_DATA_KEY);

const b64u = (b) => b.toString("base64url");

export function encryptSecret(plain, key) {
  if (!key || key.length !== 32) throw new Error("no data key");
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return `v1.${b64u(nonce)}.${b64u(c.getAuthTag())}.${b64u(ct)}`;
}

// → the plain text, or null when the value is malformed, tampered with, or the key is wrong. Never throws.
export function decryptSecret(stored, key) {
  try {
    if (!key || key.length !== 32 || typeof stored !== "string") return null;
    const [v, n, t, c] = stored.split(".");
    if (v !== "v1" || !n || !t || !c) return null;
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(n, "base64url"));
    d.setAuthTag(Buffer.from(t, "base64url"));
    return Buffer.concat([d.update(Buffer.from(c, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
