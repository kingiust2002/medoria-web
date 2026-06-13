// app/[lang]/wishlist/page.jsx — saved products (localStorage, no account).
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useWishlist } from "@/lib/wishlist";
import { supabase } from "@/lib/supabase";
import { getTranslations } from "@/lib/i18n";
import ProductCard from "@/components/catalog/ProductCard";
import Breadcrumb from "@/components/shared/Breadcrumb";
import Icon from "@/components/shared/Icon";

export const dynamic = "force-dynamic";

const COPY = {
  fa: { title: "علاقه‌مندی‌ها", sub: "محصولات ذخیره‌شدهٔ شما", empty: "هنوز چیزی ذخیره نکرده‌اید.", emptySub: "روی ستارهٔ هر محصول بزنید تا این‌جا ذخیره شود.", go: "رفتن به کاتالوگ", clear: "پاک‌کردن همه" },
  ru: { title: "Избранное", sub: "Сохранённые товары", empty: "Пока ничего не сохранено.", emptySub: "Нажмите на звёздочку товара, чтобы сохранить его здесь.", go: "В каталог", clear: "Очистить" },
  tg: { title: "Дӯстдошта", sub: "Маҳсулоти захирашуда", empty: "Ҳоло чизе захира нашудааст.", emptySub: "Барои захира ситораи маҳсулотро пахш кунед.", go: "Ба каталог", clear: "Тоза кардан" },
  en: { title: "Wishlist", sub: "Your saved products", empty: "Nothing saved yet.", emptySub: "Tap the star on any product to save it here.", go: "Browse catalog", clear: "Clear all" },
};

export default function WishlistPage({ params }) {
  const { lang } = params;
  const t = getTranslations(lang);
  const c = COPY[lang] || COPY.en;
  const { ids, clear } = useWishlist();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ids.length) { setProducts([]); setLoading(false); return; }
    setLoading(true);
    supabase.from("products").select("*").in("id", ids).then(({ data }) => {
      const ordered = ids.map((id) => data?.find((p) => p.id === id)).filter(Boolean);
      setProducts(ordered);
      setLoading(false);
    });
  }, [ids]);

  return (
    <div className="bg-canvas-soft min-h-screen">
      <div className="relative overflow-hidden bg-canvas-soft border-b border-line">
        <div className="container-x py-10 md:py-14">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[{ label: t.common.home, href: `/health/${lang}` }, { label: c.title }]} />
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="section-h-lg mb-1">{c.title}</h1>
              <p className="text-ink-muted text-sm">{c.sub}{ids.length ? ` · ${ids.length}` : ""}</p>
            </div>
            {ids.length > 0 && (
              <button onClick={clear} className="btn-ghost size-md text-warn border-warn/20 hover:border-warn/40">{c.clear}</button>
            )}
          </div>
        </div>
      </div>

      <div className="container-x py-10 md:py-14">
        {(!loading && products.length === 0) ? (
          <div className="text-center py-16 max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-accent-gold/10 text-accent-gold grid place-items-center mb-4"><Icon name="star" size={32} /></div>
            <h2 className="font-display text-2xl font-bold text-ink mb-2">{c.empty}</h2>
            <p className="text-ink-muted mb-6">{c.emptySub}</p>
            <Link href={`/health/${lang}/catalog`} className="btn-primary size-lg">{c.go}</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {products.map((p) => <ProductCard key={p.id} product={p} lang={lang} />)}
          </div>
        )}
      </div>
    </div>
  );
}
