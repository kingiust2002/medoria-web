"use server";
// lib/actions/quote.js — public quote/contact submission, server-side.
// Every submission must pass, in order: honeypot → server-validated math
// captcha → per-IP rate limits → field validation/caps. Next.js server
// actions already enforce a same-origin check on the request itself.
//
// Storage: the service-role key is REQUIRED, in every environment. quote_requests
// has no anon/authenticated policy and no table grant for those roles (migrations
// 09, 27, 28), so there is no anon-key fallback to fall back to.
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, clientIpFromHeaders } from "@/lib/security/rateLimit";
import { verifyCaptchaAnswer } from "@/lib/security/captcha";
import { clean } from "@/lib/security/sanitize";
import { notifyNewQuote } from "@/lib/notify/telegram";
import { recordNotifyResult } from "@/lib/notify/record";
import { resolveItems, insertRequest } from "@/lib/inquiry/save";
import { summarizeItems } from "@/lib/inquiry/items";

const LANGS = ["fa", "en", "ru", "tg"];
const CONTACTS = ["whatsapp", "telegram", "phone"];

// Generous for real B2B inquiries, hostile to flooding. Mirrored by CHECK
// constraints in migrations/09_security_hardening.sql.
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
  // quote_requests is service-role only: there is no anon/authenticated policy and no
  // table grant for those roles (migrations 27/28). So there is deliberately NO
  // fallback to the public anon key, in production or in development; a missing
  // key is a configuration error that is logged and reported as "unavailable".
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) {
    console.error("submitQuoteRequest: SUPABASE_SERVICE_ROLE_KEY is not set — quote_requests accepts server-side writes only.");
    return null;
  }
  _db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  return _db;
}

// payload: { name, phone, organization, message, quantity, preferredContact,
//            language, productId, productName, productSku,
//            website,                 ← honeypot (humans never see the field)
//            captchaToken, captchaAnswer }
// Errors are coarse machine codes; the form maps them to localized text:
//   "captcha" | "rate_limited" | "invalid" | "unavailable"
export async function submitQuoteRequest(payload = {}) {
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

    const ip = clientIpFromHeaders(await headers());
    // Burst + sustained windows per IP (durable when Upstash env is set).
    const [m, h] = await Promise.all([
      rateLimit(`quote:m:${ip}`, { limit: 5, windowMs: 60_000 }),
      rateLimit(`quote:h:${ip}`, { limit: 20, windowMs: 3_600_000 }),
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
    };

    const db = getWriteClient();
    if (!db) return { ok: false, error: "unavailable" };

    // Several products in one request: only { id, quantity } come from the browser; names and SKUs are
    // read from the database here, archived or unknown ids are dropped (lib/inquiry/items.js).
    if (payload.items != null) {
      const resolved = await resolveItems(db, "products", payload.items);
      if (resolved.error) return { ok: false, error: resolved.error };
      Object.assign(row, {
        items: resolved.items, product_id: null, product_sku: null, quantity: null,
        product_name: summarizeItems(resolved.items),
      });
    }

    const { data: saved, error } = await insertRequest(db, "quote_requests", row);
    if (error) {
      // Server-side context only — never expose DB details to the visitor.
      console.error("submitQuoteRequest insert failed:", error.code || error.message);
      return { ok: false, error: "unavailable" };
    }
    // Optional Telegram notice (off unless configured). The inquiry is already
    // saved; this never throws and is time-boxed, so it cannot fail the form.
    // `saved` is the stored row: it carries the tracking code once migration 32 is applied.
    const notice = await notifyNewQuote({ kind: "health", id: saved?.id, row: { ...row, tracking_code: saved?.tracking_code } });
    // Remember whether the notice arrived, so a failure shows in the panel and in the reminder.
    await recordNotifyResult(db, "quote_requests", saved?.id, notice);
    return { ok: true };
  } catch (err) {
    console.error("submitQuoteRequest failed:", err?.message || err);
    return { ok: false, error: "unavailable" };
  }
}
