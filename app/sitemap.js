// app/sitemap.js — dynamic sitemap (medoria.tj, en/ru/tg only; no Farsi, no
// admin/api/internal). Emits the gateway plus the vertical-first Medoria Health
// URLs (/health/{lang}/…). Medoria Beauty is intentionally omitted while it is a
// noindex placeholder; it joins the sitemap when its real landing ships.
import { SITE_URL, SEO_LOCALES } from "@/lib/seo";
import { CATEGORIES } from "@/lib/i18n";
import { getProducts } from "@/lib/supabase";

const HEALTH = "/health";

const STATIC = [
  { path: "", changeFrequency: "daily", priority: 0.9 },
  { path: "/catalog", changeFrequency: "daily", priority: 0.9 },
  { path: "/categories", changeFrequency: "weekly", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
];

const langMap = (path) =>
  Object.fromEntries(SEO_LOCALES.map((l) => [l, `${SITE_URL}${HEALTH}/${l}${path}`]));

export default async function sitemap() {
  const now = new Date();
  const out = [];

  // Gateway — language-neutral hub, top priority.
  out.push({ url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 });

  for (const l of SEO_LOCALES) {
    for (const s of STATIC) {
      out.push({
        url: `${SITE_URL}${HEALTH}/${l}${s.path}`,
        lastModified: now,
        changeFrequency: s.changeFrequency,
        priority: s.priority,
        alternates: { languages: langMap(s.path) },
      });
    }
    for (const c of CATEGORIES) {
      const path = `/catalog?category=${c.slug}`;
      out.push({
        url: `${SITE_URL}${HEALTH}/${l}${path}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: { languages: langMap(path) },
      });
    }
  }

  let products = [];
  try { products = await getProducts(); } catch { /* build-safe: omit products if DB unreachable */ }
  for (const p of products || []) {
    const slug = p.slug || p.id;
    if (!slug) continue;
    const path = `/catalog/${slug}`;
    const lm = p.updated_at || p.created_at ? new Date(p.updated_at || p.created_at) : now;
    for (const l of SEO_LOCALES) {
      out.push({
        url: `${SITE_URL}${HEALTH}/${l}${path}`,
        lastModified: lm,
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: { languages: langMap(path) },
      });
    }
  }

  return out;
}
