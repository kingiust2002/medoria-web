// app/sitemap.js — dynamic sitemap for Medoria Health.
// Includes the public category tree so every active department, group and leaf
// remains discoverable even though the visible quick-access UI is compact.
import { SITE_URL, SEO_LOCALES } from "@/lib/seo";
import { CATEGORIES } from "@/lib/i18n";
import { getCategories, getProducts } from "@/lib/supabase";
import { buildHealthCategoryTree, flattenHealthCategoryTree } from "@/lib/health/categories";

const HEALTH = "/health";

const STATIC = [
  { path: "", changeFrequency: "daily", priority: 0.9 },
  { path: "/catalog", changeFrequency: "daily", priority: 0.9 },
  { path: "/categories", changeFrequency: "weekly", priority: 0.85 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
];

const langMap = (path) =>
  Object.fromEntries(SEO_LOCALES.map((l) => [l, `${SITE_URL}${HEALTH}/${l}${path}`]));

function categoryPath(node) {
  return node.children?.length
    ? `/categories/${node.slug}`
    : `/catalog?category=${node.slug}`;
}

function categoryPriority(depth) {
  if (depth === 0) return 0.8;
  if (depth === 1) return 0.72;
  return 0.64;
}

export default async function sitemap() {
  const now = new Date();
  const out = [];

  out.push({ url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 });

  let categoryEntries = [];
  try {
    const rows = await getCategories();
    const tree = buildHealthCategoryTree(rows, { activeOnly: true });
    categoryEntries = flattenHealthCategoryTree(tree);
  } catch {
    // Build-safe fallback for environments where the database is unavailable.
    categoryEntries = CATEGORIES.map((node) => ({ node: { ...node, children: [] }, depth: 2 }));
  }

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

    for (const { node, depth } of categoryEntries) {
      if (!node?.slug) continue;
      const path = categoryPath(node);
      out.push({
        url: `${SITE_URL}${HEALTH}/${l}${path}`,
        lastModified: node.updated_at ? new Date(node.updated_at) : now,
        changeFrequency: "weekly",
        priority: categoryPriority(depth),
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
