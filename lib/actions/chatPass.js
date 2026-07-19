"use server";
// lib/actions/chatPass.js — exchanges a solved math captcha for a short-lived
// chat pass. Called once by the assistant widget before the first message; the
// returned pass is then sent with every /api/chat (or /api/beauty-chat) POST.
// Rate-limited per IP so pass minting itself cannot be farmed.
import { headers } from "next/headers";
import { rateLimit, clientIpFromHeaders } from "@/lib/security/rateLimit";
import { verifyCaptchaAnswer } from "@/lib/security/captcha";
import { issueChatPass } from "@/lib/security/chatPass";

// payload: { captchaToken, captchaAnswer }
// → { ok:true, pass } | { ok:false, error: "captcha"|"rate_limited"|"unavailable" }
export async function requestChatPass(payload = {}) {
  try {
    const ip = clientIpFromHeaders(headers());
    // Tighter than the form captcha mint — a human needs only a few tries.
    const rl = await rateLimit(`chatpass:${ip}`, { limit: 12, windowMs: 60_000 });
    if (!rl.ok) return { ok: false, error: "rate_limited" };

    const captcha = verifyCaptchaAnswer(payload.captchaToken, payload.captchaAnswer);
    if (!captcha.ok) return { ok: false, error: "captcha" };

    return { ok: true, pass: issueChatPass() };
  } catch (err) {
    console.error("requestChatPass failed:", err?.message || err);
    return { ok: false, error: "unavailable" };
  }
}
