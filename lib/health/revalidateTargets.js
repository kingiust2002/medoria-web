// lib/health/revalidateTargets.js
// Which Medoria Health public routes must be refreshed after the catalog changes.
// Pure (no imports) so a unit test can load it and so there is exactly ONE place
// that knows the route shapes.
//
// Why this exists: Health lives under /health/{lang}/..., but the operator
// actions used to revalidate the OLD locale-first paths (/{lang}/catalog/...,
// which only redirect now). Those calls purged nothing, so price, stock, spec and
// archive changes stayed invisible on product pages. Keep every path here under
// /health/.

export function healthRevalidationTargets(locales, slug) {
  const out = [];
  for (const l of locales) {
    out.push({ path: `/health/${l}` }); // home: featured products
    out.push({ path: `/health/${l}/catalog` });
    out.push({ path: `/health/${l}/categories` });
    if (slug) out.push({ path: `/health/${l}/catalog/${slug}` });
  }
  // ALWAYS also refresh every product page: the slug may have changed, a product
  // may have just been archived, and related-product lists mention other pages.
  out.push({ path: "/health/[lang]/catalog/[slug]", type: "page" });
  // The sitemap lists active products only.
  out.push({ path: "/sitemap.xml" });
  return out;
}
