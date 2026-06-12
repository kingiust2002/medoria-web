"use server";
// lib/actions/quote.js — public quote/contact submission, server-side.
// Replaces the old direct-from-browser Supabase insert so every submission is
// validated, length-capped and rate-limited BEFORE it reaches the database.
// Next.js server actions already enforce a same-origin check on the request.
//
// Storage path: service-role client when configured (works after the
// quote_requests public-insert policy is dropped — migration 09), otherwise
// the anon client (pre-migration compatibility).
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, clientIpFromHeaders } from "@/lib/security/rateLimit";

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

// Trim, strip control characters (keep newlines/tabs in free text), cap length.
function clean(v, max) {
  if (v == null) return null;
  const s = String(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
  return s === "" ? null : s;
}

let _db = null;
function getWriteClient() {
  if (_db) return _db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) return null;
  _db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _db;
}

// payload: { name, phone, organization, message, quantity, preferredContact,
//            language, productId, productName, productSku, website }
// `website` is a honeypot — humans never see the field, bots fill it.
// Returns { ok } / { ok:false, error } with intentionally generic errors.
export async function submitQuoteRequest(payload = {}) {
  try {
    const name = clean(payload.name, MAX.name);
    if (!name) return { ok: false, error: "invalid" };

    // Honeypot tripped → pretend success, store nothing.
    if (typeof payload.website === "string" && payload.website.trim() !== "") {
      return { ok: true };
    }

    const ip = clientIpFromHeaders(headers());
    // Burst + sustained windows; both per IP, in-memory per instance.
    if (
      !rateLimit(`quote:m:${ip}`, { limit: 5, windowMs: 60_000 }).ok ||
      !rateLimit(`quote:h:${ip}`, { limit: 20, windowMs: 3_600_000 }).ok
    ) {
      return { ok: false, error: "rate_limited" };
    }

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

    const { error } = await db.from("quote_requests").insert(row);
    if (error) {
      // Server-side context only — never expose DB details to the visitor.
      console.error("submitQuoteRequest insert failed:", error.code || error.message);
      return { ok: false, error: "unavailable" };
    }
    return { ok: true };
  } catch (err) {
    console.error("submitQuoteRequest failed:", err?.message || err);
    return { ok: false, error: "unavailable" };
  }
}
