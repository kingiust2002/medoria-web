"use server";
// lib/beauty/actions/quote.js — public Beauty quote/partnership submission.
// Identical security discipline to lib/actions/quote.js (honeypot → server
// captcha → per-IP rate limits → validation/caps), but writes to the
// SEPARATE beauty_quote_requests table. Next.js server actions already
// enforce a same-origin check on the request itself.
//
// Storage: PRODUCTION requires the service-role key — no anon fallback once
// deployed (migration 10 gives beauty_quote_requests no anon insert policy,
// so a fallback would only produce confusing RLS errors). Dev may fall back.
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, clientIpFromHeaders } from "@/lib/security/rateLimit";
import { verifyCaptchaAnswer } from "@/lib/security/captcha";
import { clean } from "@/lib/security/sanitize";

const LANGS = ["fa", "en", "ru", "tg"];
const CONTACTS = ["whatsapp", "telegram", "phone"];

// Generous for real B2B inquiries, hostile to flooding. Mirrored by the CHECK
// constraints in migrations/10_beauty_catalog.sql.
const MAX = {
  name: 150,
  phone: 40,
  organization: 160,
  message: 2500,
  productName: 300,
  productSku: 120,
};

let _db = null;
function getWriteClient() {
  if (_db) return _db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service && process.env.NODE_ENV === "production") {
    console.error("submitBeautyQuoteRequest: SUPABASE_SERVICE_ROLE_KEY not set in production — refusing anon-key fallback for protected writes.");
    return null;
  }
  const key = service || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) return null;
  _db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _db;
}

// payload: { name, phone, organization, message, quantity, preferredContact,
//            language, productId, productName, productSku, sourceUrl,
//            website,                 ← honeypot (humans never see the field)
//            captchaToken, captchaAnswer }
// Errors are coarse machine codes; the form maps them to localized text:
//   "captcha" | "rate_limited" | "invalid" | "unavailable"
export async function submitBeautyQuoteRequest(payload = {}) {
  try {
    const name = clean(payload.name, MAX.name);
    if (!name) return { ok: false, error: "invalid" };

    // Honeypot tripped → pretend success, store nothing.
    if (typeof payload.website === "string" && payload.website.trim() !== "") {
      return { ok: true };
    }

    // Human check — non-bypassable: no valid solved token, no write.
    const captcha = verifyCaptchaAnswer(payload.captchaToken, payload.captchaAnswer);
    if (!captcha.ok) return { ok: false, error: "captcha" };

    const ip = clientIpFromHeaders(headers());
    // Burst + sustained windows per IP (durable when Upstash env is set).
    // Namespaced "bquote" so it doesn't share a bucket with Health quotes.
    const [m, h] = await Promise.all([
      rateLimit(`bquote:m:${ip}`, { limit: 5, windowMs: 60_000 }),
      rateLimit(`bquote:h:${ip}`, { limit: 20, windowMs: 3_600_000 }),
    ]);
    if (!m.ok || !h.ok) return { ok: false, error: "rate_limited" };

    const quantityNum = Number(payload.quantity);
    const quantity =
      Number.isFinite(quantityNum) && quantityNum >= 1
        ? Math.min(Math.round(quantityNum), 1_000_000)
        : null;

    const productIdNum = Number(payload.productId);
    const productId =
      Number.isInteger(productIdNum) && productIdNum > 0 ? productIdNum : null;

    const row = {
      name,
      phone: clean(payload.phone, MAX.phone),
      organization: clean(payload.organization, MAX.organization),
      product_id: productId,
      product_name: clean(payload.productName, MAX.productName),
      product_sku: clean(payload.productSku, MAX.productSku),
      quantity,
      message: clean(payload.message, MAX.message),
      preferred_contact: CONTACTS.includes(payload.preferredContact)
        ? payload.preferredContact
        : "whatsapp",
      language: LANGS.includes(payload.language) ? payload.language : null,
      source_url: clean(payload.sourceUrl, 600),
    };

    const db = getWriteClient();
    if (!db) return { ok: false, error: "unavailable" };

    const { error } = await db.from("beauty_quote_requests").insert(row);
    if (error) {
      // Server-side context only — never expose DB details to the visitor.
      console.error("submitBeautyQuoteRequest insert failed:", error.code || error.message);
      return { ok: false, error: "unavailable" };
    }
    return { ok: true };
  } catch (err) {
    console.error("submitBeautyQuoteRequest failed:", err?.message || err);
    return { ok: false, error: "unavailable" };
  }
}
