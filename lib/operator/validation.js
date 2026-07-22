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

// Accept ONLY an http(s) URL or a bare storage path (no scheme). Blocks
// javascript:, data:, vbscript: and protocol-relative "//host" values from ever
// being stored in a field that later renders into an href/src on the public
// site. Mirrors the import path so manual and bulk entry are equally safe.
// Returns the cleaned value, or null when it isn't a safe reference.
export function safeUrlRef(v, max = 600) {
  const s = str(v, max);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try { new URL(s); return s; } catch { return null; }
  }
  // Storage path: dot/word/dash segments joined by single "/", no leading slash
  // (blocks "//host" and "/abs"), no ".." traversal.
  if (s.startsWith("/") || s.includes("..")) return null;
  return /^[\w.-]+(\/[\w.-]+)*$/.test(s) ? s : null;
}

// Server-side magic-byte sniff for the allowed image types. `bytes` is a
// Uint8Array/Buffer of (at least) the file's first ~16 bytes. Returns the true
// MIME type or null — NEVER trust the client-declared Content-Type, which the
// browser lets the uploader set to anything.
export function sniffImageType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const b = bytes;
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  const ascii = (i, n) => {
    let out = "";
    for (let j = i; j < i + n; j++) out += String.fromCharCode(b[j]);
    return out;
  };
  // WEBP: "RIFF"????"WEBP"
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  // AVIF: "????ftyp" + an AVIF-family brand
  if (ascii(4, 4) === "ftyp" && ["avif", "avis", "av01", "mif1", "miaf"].includes(ascii(8, 4)))
    return "image/avif";
  return null;
}
