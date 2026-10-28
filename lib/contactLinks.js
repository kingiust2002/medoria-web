// lib/contactLinks.js — the contact details of ONE house as the pages use them: the four values plus ready-made WhatsApp / Telegram links. Pure (no
// React, no I/O): server components call it with what lib/contactLive.js read, client components get the same object from useContact().
// NEXT_PUBLIC_* values are inlined by `next build`, so each is read as a literal expression.
export const DEFAULT_WA = process.env.NEXT_PUBLIC_WA_NUMBER || "992000000000";
export const DEFAULT_TG = process.env.NEXT_PUBLIC_TG_USERNAME || "medoria_tj";

// The number / user name are a parameter so the pages can use the contact details the operators edit; lib/whatsapp.js keeps the plain
// waLink / tgLink (built-in defaults) for places that have no house.
export function waLinkFor(number, message) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
export function tgLinkFor(user, message) {
  return `https://t.me/${user}?text=${encodeURIComponent(message)}`;
}

// The built-in defaults (environment values, as before the details became editable). `email` is the house's own address.
export function defaultContact(email = "") {
  return { phone: process.env.NEXT_PUBLIC_PHONE || "", whatsapp: DEFAULT_WA, telegram: DEFAULT_TG, email: email || "" };
}

export function contactApi(contact) {
  const c = { ...defaultContact(), ...(contact || {}) };
  return {
    ...c,
    PHONE: c.phone, EMAIL: c.email, WA_NUMBER: c.whatsapp, TG_USER: c.telegram,
    waLink: (message) => waLinkFor(c.whatsapp, message),
    tgLink: (message) => tgLinkFor(c.telegram, message),
  };
}
