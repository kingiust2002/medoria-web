// lib/security/sanitize.js
// Pure text sanitizers shared by public-input paths (quote action, captcha).
// No Next.js / node-API imports, so unit tests can load this directly.

// Trim, strip control characters (keeps \n \r \t for free text), cap length.
// Returns null for empty results so callers can store SQL NULL.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function clean(v, max) {
  if (v == null) return null;
  const s = String(v).replace(CONTROL_CHARS, "").trim().slice(0, max);
  return s === "" ? null : s;
}

// Normalize Persian (۰-۹) and Arabic (٠-٩) digits to ASCII so numeric answers
// typed with a Farsi/Tajik keyboard validate correctly.
export function normalizeDigits(s) {
  return String(s ?? "").replace(/[۰-۹٠-٩]/g, (d) => {
    const fa = "۰۱۲۳۴۵۶۷۸۹".indexOf(d);
    return String(fa >= 0 ? fa : "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  });
}
