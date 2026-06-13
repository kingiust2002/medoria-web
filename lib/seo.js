// lib/seo.js — central SEO config: canonical domain, public locales, hreflang.
// Farsi (fa) is intentionally excluded from public SEO (noindex + not in sitemap/
// hreflang) while its routes keep working. The canonical domain comes from
// NEXT_PUBLIC_SITE_URL with a safe production fallback (never vercel.app).

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://medoria.tj").replace(/\/+$/, "");

// Locales that are public for SEO. Order = hreflang order.
export const SEO_LOCALES = ["en", "ru", "tg"];
// x-default target (language selection fallback).
export const SEO_DEFAULT_LOCALE = "en";

// Build Metadata.alternates (canonical + hreflang) for a path without the locale
// prefix, e.g. "" (home), "/catalog", "/catalog/some-slug".
// `vertical` ("health" | "beauty") prefixes the canonical + hreflang so the
// vertical-first routes (/health/{lang}/…, /beauty/{lang}/…) stay self-canonical.
export function buildAlternates(lang, path = "", vertical = "health") {
  const base = `/${vertical}`;
  const languages = {};
  for (const l of SEO_LOCALES) languages[l] = `${base}/${l}${path}`;
  languages["x-default"] = `${base}/${SEO_DEFAULT_LOCALE}${path}`;
  return { canonical: `${base}/${lang}${path}`, languages };
}

// Robots directive per locale — Farsi is noindexed (kept crawlable so the
// noindex is actually seen), everything else indexable.
export function robotsFor(lang) {
  return lang === "fa"
    ? { index: false, follow: true }
    : { index: true, follow: true };
}

// Branded OG image URL (served by /api/og), optionally titled.
export function ogImage(title) {
  return title ? `/api/og?title=${encodeURIComponent(title)}` : "/api/og";
}

// Serialize JSON-LD for <script dangerouslySetInnerHTML>. JSON.stringify does
// NOT escape "<", so a stored "</script>" inside any product/category field
// would terminate the tag and inject markup (stored XSS). < closes that.
export function safeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// Per-locale keyword sets (natural, B2B — no stuffing). Farsi minimal (noindexed).
export const SEO_KEYWORDS = {
  en: ["medical supplies Tajikistan", "medical consumables supplier Tajikistan", "hospital supplies Dushanbe", "wholesale medical supplies", "B2B medical equipment and consumables"],
  ru: ["медицинские расходные материалы Таджикистан", "поставщик медицинских товаров Душанбе", "медицинские товары оптом", "расходные материалы для больниц", "медицинское снабжение Таджикистан"],
  tg: ["молҳои тиббӣ Тоҷикистон", "маводи масрафии тиббӣ", "таъминкунандаи таҷҳизоти тиббӣ", "молҳои тиббӣ дар Душанбе", "маводи тиббӣ барои беморхонаҳо"],
  fa: ["تجهیزات پزشکی تاجیکستان", "مواد مصرفی پزشکی"],
};
