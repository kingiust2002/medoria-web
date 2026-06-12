// lib/security/captcha.js
// Lightweight server-validated math captcha ("human check") for public forms.
//
// Design — stateless signed challenges, nothing stored per visitor:
//   challenge token = base64url(payload) + "." + HMAC-SHA256(secret, payload)
//   payload = { h: sha256(answer + "." + nonce), n: nonce, exp }
// The plaintext answer never leaves the server; the client only sees the
// question text. Verification recomputes the hash from the submitted answer,
// so editing client code cannot skip or forge the check — the server action
// rejects any submission without a valid (token, answer) pair.
//
// Secret: CAPTCHA_SECRET, falling back to OPERATOR_SESSION_SECRET (already a
// required production env). Without either, a per-process random secret keeps
// dev working but is flagged because tokens would not verify across lambdas.
//
// Replay: a solved token is remembered (in-memory, per instance) until expiry
// so one solution cannot be replayed in a loop. Cross-instance replay within
// the TTL is accepted residual risk — the per-IP rate limits cap its value.
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
// Relative import (not "@/" alias) so node --test can load this module directly.
import { normalizeDigits } from "./sanitize.js";

const TTL_MS = 10 * 60 * 1000; // a visitor gets 10 minutes to submit the form
const MAX_USED = 5000;

let _fallbackSecret = null;
function secret() {
  const s = process.env.CAPTCHA_SECRET || process.env.OPERATOR_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (!_fallbackSecret) {
    _fallbackSecret = randomBytes(32).toString("hex");
    if (process.env.NODE_ENV === "production") {
      console.error("captcha: no CAPTCHA_SECRET/OPERATOR_SESSION_SECRET set — using per-instance secret (tokens may fail across instances)");
    }
  }
  return _fallbackSecret;
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const hashAnswer = (answer, nonce) =>
  createHash("sha256").update(`${answer}.${nonce}`).digest("hex");
const sign = (body) => createHmac("sha256", secret()).update(body).digest("base64url");

// → { token, question }  e.g. question "7 + 5 = ?"
export function createCaptchaChallenge() {
  const a = 2 + (randomBytes(1)[0] % 8);          // 2..9
  const b = 2 + (randomBytes(1)[0] % 8);          // 2..9
  const plus = randomBytes(1)[0] % 2 === 0;
  const [x, y] = plus || a >= b ? [a, b] : [b, a]; // subtraction never negative
  const answer = plus ? x + y : x - y;
  const nonce = randomBytes(8).toString("hex");
  const body = b64u(JSON.stringify({ h: hashAnswer(answer, nonce), n: nonce, exp: Date.now() + TTL_MS }));
  return { token: `${body}.${sign(body)}`, question: `${x} ${plus ? "+" : "−"} ${y} = ?` };
}

// Solved tokens (sig → exp), pruned on size pressure.
const used = new Map();
function markUsed(sig, exp) {
  if (used.size >= MAX_USED) {
    const now = Date.now();
    for (const [k, e] of used) if (e <= now) used.delete(k);
    if (used.size >= MAX_USED) used.clear();
  }
  used.set(sig, exp);
}

// → { ok:true } | { ok:false, reason: "invalid"|"expired"|"replayed" }
export function verifyCaptchaAnswer(token, answer) {
  try {
    if (typeof token !== "string" || token.length > 600 || !token.includes(".")) {
      return { ok: false, reason: "invalid" };
    }
    const [body, sig] = token.split(".");
    if (!body || !sig || sig.length > 100) return { ok: false, reason: "invalid" };

    const expected = sign(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || typeof payload.exp !== "number" || typeof payload.h !== "string" || typeof payload.n !== "string") {
      return { ok: false, reason: "invalid" };
    }
    if (payload.exp < Date.now()) return { ok: false, reason: "expired" };

    const norm = normalizeDigits(String(answer ?? "")).trim().slice(0, 10);
    if (!/^-?\d+$/.test(norm)) return { ok: false, reason: "invalid" };
    const ah = Buffer.from(hashAnswer(Number(norm), payload.n));
    const eh = Buffer.from(payload.h);
    if (ah.length !== eh.length || !timingSafeEqual(ah, eh)) return { ok: false, reason: "invalid" };

    if (used.has(sig)) return { ok: false, reason: "replayed" };
    markUsed(sig, payload.exp); // consume only on success — wrong math stays retryable
    return { ok: true };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
