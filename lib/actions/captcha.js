"use server";
// lib/actions/captcha.js — issues math-captcha challenges for public forms.
// Rate-limited per IP so challenge minting itself cannot be farmed; answers
// are verified inside submitQuoteRequest (lib/actions/quote.js), server-side.
import { headers } from "next/headers";
import { rateLimit, clientIpFromHeaders } from "@/lib/security/rateLimit";
import { createCaptchaChallenge } from "@/lib/security/captcha";

export async function newCaptchaChallenge() {
  try {
    const ip = clientIpFromHeaders(headers());
    const rl = await rateLimit(`captcha:${ip}`, { limit: 30, windowMs: 60_000 });
    if (!rl.ok) return { ok: false, error: "rate_limited" };
    const { token, question } = createCaptchaChallenge();
    return { ok: true, token, question };
  } catch (err) {
    console.error("newCaptchaChallenge failed:", err?.message || err);
    return { ok: false, error: "unavailable" };
  }
}
