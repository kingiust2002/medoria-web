// lib/security/chatPass.js
// A short-lived, HMAC-signed "chat pass" that gates the AI chat routes.
//
// Why: the chat endpoints fan out to PAID LLM APIs, so unattended bots hitting
// them (even within the per-IP rate limits) burn real money. Requiring a valid
// pass means a visitor must first solve ONE math captcha to start chatting;
// the pass then covers the rest of that session. Bots that can't solve the
// captcha never get a pass, so they can't reach the model at all.
//
// Design — stateless, nothing stored per visitor:
//   pass = base64url({ exp }) + "." + HMAC-SHA256(secret, body)
// The route only trusts a pass whose signature verifies and whose exp is in
// the future. Volume within the pass window is still bounded by the existing
// per-IP rate limits, so a single solved captcha cannot be turned into a flood.
//
// Secret: CAPTCHA_SECRET → OPERATOR_SESSION_SECRET (same chain as the captcha),
// so a pass issued by one lambda verifies on another.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TTL_MS = 45 * 60 * 1000; // one captcha solve = 45 min of chatting

let _fallbackSecret = null;
function secret() {
  const s = process.env.CAPTCHA_SECRET || process.env.OPERATOR_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (!_fallbackSecret) {
    _fallbackSecret = randomBytes(32).toString("hex");
    if (process.env.NODE_ENV === "production") {
      console.error("chatPass: no CAPTCHA_SECRET/OPERATOR_SESSION_SECRET set — using per-instance secret (passes may fail across instances)");
    }
  }
  return _fallbackSecret;
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const sign = (body) => createHmac("sha256", secret()).update(body).digest("base64url");

// → signed pass string
export function issueChatPass() {
  const body = b64u(JSON.stringify({ exp: Date.now() + TTL_MS }));
  return `${body}.${sign(body)}`;
}

// → true only for a well-formed, correctly-signed, unexpired pass.
export function verifyChatPass(pass) {
  try {
    if (typeof pass !== "string" || pass.length > 400 || !pass.includes(".")) return false;
    const [body, sig] = pass.split(".");
    if (!body || !sig || sig.length > 100) return false;

    const a = Buffer.from(sig);
    const b = Buffer.from(sign(body));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || typeof payload.exp !== "number") return false;
    return payload.exp >= Date.now();
  } catch {
    return false;
  }
}
