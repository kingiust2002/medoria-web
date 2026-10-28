// lib/siteContent.js — the pure part of the site content (migration 42): what a banner / FAQ item may contain, how an operator's input is
// cleaned, which row is live, and how the public pages pick the text of their language. No I/O, no Next imports: used by the panel actions,
// the public readers and the unit tests. Texts are PLAIN TEXT (React escapes them; there is no HTML here and no way to write any).
import { checkSchedule } from "./operator/schedule.js";
import { CONTENT_MESSAGES } from "./content/messages.js";

export const CONTENT_KINDS = ["banner", "faq", "contact", "featured"];          // contact and featured need migration 51
export const FEATURED_LIMIT = 12;
export const CONTACT_FIELDS = ["phone", "whatsapp", "telegram", "email"];
export const CONTENT_LANGS = ["tg", "ru", "en", "fa"];                  // Tajik first (the house default), then Russian, English, hidden Persian
export const LANG_FALLBACK = ["tg", "en", "ru", "fa"];                  // what to show when the visitor's language has no text
export const TONES = ["info", "promo"];
export const LIMITS = { bannerText: 200, linkLabel: 40, link: 300, question: 200, answer: 1500, perHouse: 60 };

export { CONTENT_MESSAGES };

const clean = (v, max) => { const s = v == null ? "" : String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u2028\u2029]/g, "").replace(/[ \t]+\n/g, "\n").trim(); return s.length > max ? null : s; };

// "/health/en/catalog" or "https://example.com/page" — nothing else (no javascript:, no protocol-relative "//", no credentials)
export function cleanLink(value) {
  const s = value == null ? "" : String(value).trim();
  if (!s) return { ok: true, value: "" };
  if (s.length > LIMITS.link || /[\s<>"'\\\u0000-\u001F]/.test(s)) return { ok: false, error: CONTENT_MESSAGES.bad_link };
  if (s.startsWith("/") && !s.startsWith("//")) return { ok: true, value: s };
  try {
    const u = new URL(s);
    if (u.protocol === "https:" && !u.username && !u.password && u.hostname) return { ok: true, value: u.toString() };
  } catch { /* falls through */ }
  return { ok: false, error: CONTENT_MESSAGES.bad_link };
}

const textMap = (input, max) => {
  const out = {};
  for (const l of CONTENT_LANGS) {
    const s = clean(input?.[l], max);
    if (s === null) return null;
    if (s) out[l] = s;
  }
  return out;
};

// ── contact details: the values are normalised first, then judged by the same shapes migration 51 enforces ───────────────────────
const RE = { phone: /^\+[0-9]{7,15}$/, whatsapp: /^[0-9]{7,15}$/, telegram: /^[A-Za-z0-9_]{5,32}$/, email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ };
export function cleanContact(input = {}) {
  const get = (k) => (input?.[k] == null ? "" : String(input[k]).trim());
  const out = {};
  const phone = get("phone").replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (phone) { if (!RE.phone.test(phone)) return { ok: false, error: CONTENT_MESSAGES.bad_phone }; out.phone = phone; }
  const wa = get("whatsapp").replace(/[\s().+-]/g, "").replace(/^00/, "");
  if (wa) { if (!RE.whatsapp.test(wa)) return { ok: false, error: CONTENT_MESSAGES.bad_whatsapp }; out.whatsapp = wa; }
  const tg = get("telegram").replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "").replace(/^@/, "");
  if (tg) { if (!RE.telegram.test(tg)) return { ok: false, error: CONTENT_MESSAGES.bad_telegram }; out.telegram = tg; }
  const email = get("email");
  if (email) { if (email.length > 120 || !RE.email.test(email)) return { ok: false, error: CONTENT_MESSAGES.bad_email }; out.email = email; }
  if (!Object.keys(out).length) return { ok: false, error: CONTENT_MESSAGES.no_contact };
  return { ok: true, value: out };
}

// An operator's form → the columns to store. `before` (the stored row) lets an unchanged schedule pass without being judged again.
// → { ok: true, value: { data, sort_order, is_published, publish_at, unpublish_at } } | { ok: false, error }
export function cleanContent(kind, input = {}, before = null, now = Date.now()) {
  if (!CONTENT_KINDS.includes(kind)) return { ok: false, error: CONTENT_MESSAGES.bad_kind };
  let data;
  if (kind === "banner") {
    const text = textMap(input.text, LIMITS.bannerText), label = textMap(input.label, LIMITS.linkLabel);
    if (!text || !label) return { ok: false, error: CONTENT_MESSAGES.too_long };
    if (!Object.keys(text).length) return { ok: false, error: CONTENT_MESSAGES.no_text };
    const link = cleanLink(input.link);
    if (!link.ok) return link;
    const tone = TONES.includes(input.tone) ? input.tone : "info";
    data = { text, ...(Object.keys(label).length ? { label } : {}), ...(link.value ? { link: link.value } : {}), tone };
  } else if (kind === "contact") {
    const c = cleanContact(input);
    if (!c.ok) return c;
    data = c.value;
  } else if (kind === "featured") {
    const id = before?.data?.product_id ?? Number(input.product_id);           // a featured entry keeps its product; to change it, remove it and add another
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: CONTENT_MESSAGES.bad_product };
    data = { product_id: id };
  } else {
    const q = textMap(input.q, LIMITS.question), a = textMap(input.a, LIMITS.answer);
    if (!q || !a) return { ok: false, error: CONTENT_MESSAGES.too_long };
    if (!Object.keys(q).length) return { ok: false, error: CONTENT_MESSAGES.no_text };
    if (Object.keys(q).some((l) => !a[l])) return { ok: false, error: CONTENT_MESSAGES.no_answer };
    data = { q, a };
  }
  const order = input.sort_order == null || input.sort_order === "" ? 0 : Number(input.sort_order);
  if (!Number.isInteger(order) || Math.abs(order) > 100000) return { ok: false, error: CONTENT_MESSAGES.bad_order };
  const sch = checkSchedule({ publish_at: input.publish_at ?? null, unpublish_at: input.unpublish_at ?? null }, before, now);
  if (!sch.ok) return sch;
  return { ok: true, value: { data, sort_order: order, is_published: Boolean(input.is_published), ...sch.values } };
}

// ── what a row is right now (the same rule as the policy of migration 42) ─────────────────────────────────────────────────
export function contentStatus(row, now = Date.now()) {
  if (!row?.is_published) return "draft";
  if (row.publish_at && Date.parse(row.publish_at) > now) return "scheduled";
  if (row.unpublish_at && Date.parse(row.unpublish_at) <= now) return "ended";
  return "live";
}
export const isLive = (row, now = Date.now()) => contentStatus(row, now) === "live";

// ── public side ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export function pickText(map, lang) {
  if (!map || typeof map !== "object") return "";
  for (const l of [lang, ...LANG_FALLBACK]) if (typeof map[l] === "string" && map[l].trim()) return map[l];
  return "";
}

// the one banner to show: the lowest sort_order, then the newest — or null
export function pickBanner(rows, lang) {
  const list = (rows || []).filter((r) => r?.kind === "banner" && r.data?.text).sort((a, b) => (a.sort_order - b.sort_order) || (b.id - a.id));
  for (const r of list) {
    const text = pickText(r.data.text, lang);
    if (!text) continue;
    const link = cleanLink(r.data.link);
    return { id: r.id, text, href: link.ok ? link.value : "", label: pickText(r.data.label, lang), tone: TONES.includes(r.data.tone) ? r.data.tone : "info" };
  }
  return null;
}

// FAQ items in order; an item without a question or answer in the visitor's language chain is skipped
export function pickFaq(rows, lang) {
  return (rows || []).filter((r) => r?.kind === "faq" && r.data?.q && r.data?.a).sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
    .map((r) => ({ id: r.id, q: pickText(r.data.q, lang), a: pickText(r.data.a, lang) })).filter((x) => x.q && x.a).slice(0, LIMITS.perHouse);
}

// schema.org FAQPage for the items (only real, published questions)
export function faqJsonLd(items) {
  if (!items.length) return null;
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })) };
}

// ── contact details (kind "contact"): the live row's values win, every missing one keeps the built-in default ───────────────────
// defaults = { phone, whatsapp, telegram, email } (from the environment); the result always has the four keys (a default may be "").
export function pickContact(rows, defaults = {}) {
  const base = { phone: defaults.phone || "", whatsapp: defaults.whatsapp || "", telegram: defaults.telegram || "", email: defaults.email || "" };
  const row = (rows || []).filter((r) => r?.kind === "contact" && r.data && typeof r.data === "object").sort((a, b) => (b.id - a.id))[0];
  if (!row) return base;
  const c = cleanContact(row.data);                                  // judged again on the way out: a hand-edited row can only ever be a valid contact
  return c.ok ? { ...base, ...c.value } : base;
}

// ── featured products (kind "featured"): the live rows in order → product ids (the reader keeps only the ones that are active products) ─
export function pickFeaturedIds(rows, limit = FEATURED_LIMIT) {
  const seen = new Set(), out = [];
  for (const r of [...(rows || [])].filter((x) => x?.kind === "featured").sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))) {
    const id = Number(r.data?.product_id);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id); out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}
