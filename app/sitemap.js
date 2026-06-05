// app/sitemap.js — dynamic sitemap (medoria.tj, en/ru/tg only; no Farsi, no
// admin/api/internal). Static pages + category landing pages + all products.
import { SITE_URL, SEO_LOCALES } from "@/lib/seo";
import { CATEGORIES } from "@/lib/i18n";
import { getProducts } from "@/lib/supabase";

const STATIC = [
  { path: "", changeFrequency: "daily", priority: 1.0 },
  { path: "/catalog", changeFrequency: "daily", priority: 0.9 },
  { path: "/categories", changeFrequency: "weekly", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
];

const langMap = (path) =>
  Object.fromEntries(SEO_LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`]));

export default async function sitemap() {
  const now = new Date();
  const out = [];

  for (const l of SEO_LOCALES) {
    for (const s of STATIC) {
      out.push({
        url: `${SITE_URL}/${l}${s.path}`,
        lastModified: now,
        changeFrequency: s.changeFrequency,
        priority: s.priority,
        alternates: { languages: langMap(s.path) },
      });
    }
    for (const c of CATEGORIES) {
      const path = `/catalog?category=${c.slug}`;
      out.push({
        url: `${SITE_URL}/${l}${path}`,
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
        url: `${SITE_URL}/${l}${path}`,
        lastModified: lm,
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: { languages: langMap(path) },
      });
    }
  }

  return out;
}
