// lib/contact.js — public contact e-mail addresses, one per house.
//
// Health and Beauty each show their own address on their own pages; the
// gateway shows the neutral parent address. NEXT_PUBLIC_EMAIL stays as the
// fallback for any of the three that is not set, so an existing deployment
// that only defines NEXT_PUBLIC_EMAIL keeps showing it everywhere.
//
// NEXT_PUBLIC_* values are inlined by `next build`, so each must be read as a
// literal `process.env.NEXT_PUBLIC_X` expression (no dynamic lookup).
const FALLBACK = process.env.NEXT_PUBLIC_EMAIL || "";

export const EMAIL_HEALTH = process.env.NEXT_PUBLIC_EMAIL_HEALTH || FALLBACK;
export const EMAIL_BEAUTY = process.env.NEXT_PUBLIC_EMAIL_BEAUTY || FALLBACK;
export const EMAIL_GENERAL = process.env.NEXT_PUBLIC_EMAIL_INFO || FALLBACK;

// A mailto: link with an optional subject and body. Empty address -> "" so the
// caller can simply hide the button.
export function mailtoLink(address, { subject, body } = {}) {
  if (!address) return "";
  const q = [];
  if (subject) q.push(`subject=${encodeURIComponent(subject)}`);
  if (body) q.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${address}${q.length ? `?${q.join("&")}` : ""}`;
}
