// lib/operator/validation.js
// Small, dependency-free input sanitisers + validators for operator writes.
// Pure functions — safe to import anywhere (no secrets, no node APIs).

// URL-safe slug from a (preferably Latin) string. Non-latin chars are dropped;
// callers fall back to SKU / id when the result is empty.
export function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

// Trimmed string or null (empty → null). Optional hard length cap so a single
// oversized field can never balloon a row (DB payload / page weight guard).
export function str(v, max) {
  if (v == null) return null;
  let s = String(v).trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s === "" ? null : s;
}

// Number or null. Empty / non-numeric → null. Negative clamped to 0 when allowed.
export function num(v, { min = null } = {}) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (min != null && n < min) return min;
  return n;
}

export function bool(v) {
  return v === true || v === "true" || v === "on" || v === 1 || v === "1";
}

// Clean string array (trim, drop empties, dedupe, bounded count/item length).
export function strArray(v, { maxItems = 30, maxLen = 600 } = {}) {
  let arr = v;
  if (typeof v === "string") arr = v.split(",");
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const s = String(item).trim().slice(0, maxLen);
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    if (out.length >= maxItems) break;
  }
  return out;
}

// Normalise specs into a plain {key: value} object from key/value rows or JSON.
// Bounded (entries + key/value length) so a spec blob can't bloat the row.
const MAX_SPEC_ENTRIES = 60;
export function parseSpecs(v) {
  if (!v) return null;
  const obj = {};
  if (Array.isArray(v)) {
    for (const row of v) {
      const k = str(row?.key, 150);
      const val = str(row?.value, 1000);
      if (k) obj[k] = val ?? "";
      if (Object.keys(obj).length >= MAX_SPEC_ENTRIES) break;
    }
  } else if (typeof v === "object") {
    for (const [key, value] of Object.entries(v)) {
      const k = str(key, 150);
      if (k) obj[k] = str(value, 1000) ?? "";
      if (Object.keys(obj).length >= MAX_SPEC_ENTRIES) break;
    }
  } else {
    return null;
  }
  return Object.keys(obj).length ? obj : null;
}

// File validation for image uploads (server re-checks what the client checked).
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function safeFileName(name) {
  const base = String(name || "image").split("/").pop().split("\\").pop();
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";
  const ext = (dot > 0 ? base.slice(dot + 1) : "jpg").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 5) || "jpg";
  return `${stem}.${ext}`;
}
