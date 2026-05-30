// components/product/RecentlyViewed.jsx
// Horizontal strip of products from localStorage history. Live-updates on the
// `medoria:recently-viewed` event. Renders nothing when empty.
"use client";
import { useEffect, useState } from "react";
import { getTranslations } from "@/lib/i18n";
import { getRecentlyViewedIds } from "@/lib/recentlyViewed";
import { getProductBySlug } from "@/lib/supabase";
import ProductCard from "@/components/catalog/ProductCard";

export default function RecentlyViewed({ lang, excludeId }) {
  const t = getTranslations(lang);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const ids = getRecentlyViewedIds().filter((id) => id !== Number(excludeId));
      if (ids.length === 0) { setProducts([]); return; }
      const rows = await Promise.all(ids.map((id) => getProductBySlug(String(id))));
      if (!cancelled) setProducts(rows.filter(Boolean).slice(0, 4));
    }
    load();
    const onUpdate = () => load();
    window.addEventListener("medoria:recently-viewed", onUpdate);
    return () => { cancelled = true; window.removeEventListener("medoria:recently-viewed", onUpdate); };
  }, [excludeId]);

  if (products.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="section-h mb-6">{t.product.recentlyViewed}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {products.map((p) => <ProductCard key={p.id} product={p} lang={lang} compact />)}
      </div>
    </section>
  );
}
