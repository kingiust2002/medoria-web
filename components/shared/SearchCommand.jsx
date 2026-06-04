// components/shared/SearchCommand.jsx — global instant-search (⌘K) overlay.
// Categories match instantly (static); products are fetched once on first open.
"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { getProducts, imageUrl } from "@/lib/supabase";
import { CATEGORIES, getCategoryName } from "@/lib/i18n";
import Icon from "./Icon";

const L = {
  fa: { products: "محصولات", categories: "دسته‌ها", none: "محصولی یافت نشد.", ph: "جستجوی محصول یا دسته…" },
  ru: { products: "Товары", categories: "Категории", none: "Ничего не найдено.", ph: "Поиск товара или категории…" },
  tg: { products: "Маҳсулот", categories: "Категорияҳо", none: "Чизе ёфт нашуд.", ph: "Ҷустуҷӯи мол ё категория…" },
  en: { products: "Products", categories: "Categories", none: "No products found.", ph: "Search products or categories…" },
};

export default function SearchCommand({ lang, open, onClose }) {
  const t = L[lang] || L.en;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [products, setProducts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (!loaded) getProducts().then((p) => { setProducts(p || []); setLoaded(true); }).catch(() => setLoaded(true));
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(id); window.removeEventListener("keydown", onKey); };
  }, [open, loaded, onClose]);

  const query = q.trim().toLowerCase();
  const cats = query
    ? CATEGORIES.filter((c) => getCategoryName(c.slug, lang).toLowerCase().includes(query)).slice(0, 4)
    : CATEGORIES.slice(0, 6);
  const prods = useMemo(() => {
    if (!query) return [];
    return products
      .filter((p) => [p.name_fa, p.name_en, p.name_ru, p.name_tg, p.sku, p.brand].filter(Boolean).some((v) => String(v).toLowerCase().includes(query)))
      .slice(0, 6);
  }, [products, query]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const go = (href) => { onClose(); setQ(""); router.push(href); };
  const nameOf = (p) => p[`name_${lang}`] || p.name_en || "";

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div dir={lang === "fa" ? "rtl" : "ltr"} className="relative w-full max-w-xl rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden animate-fade-up">
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <Icon name="search" size={18} className="text-ink-faint shrink-0" />
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) go(`/${lang}/catalog?q=${encodeURIComponent(q.trim())}`); }}
            placeholder={t.ph} className="flex-1 h-14 bg-transparent outline-none text-ink text-[15px] placeholder:text-ink-faint"
          />
          <kbd className="hidden sm:block text-[10px] text-ink-faint border border-line rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div className="max-h-[56vh] overflow-y-auto p-2">
          {cats.length > 0 && (
            <>
              <div className="text-[10px] font-bold uppercase tracking-wide text-ink-faint px-3 pt-2 pb-1">{t.categories}</div>
              {cats.map((c) => (
                <button key={c.slug} onClick={() => go(`/${lang}/catalog?category=${c.slug}`)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-violet/5 text-start transition-colors">
                  <span className="w-8 h-8 rounded-lg bg-brand-violet/10 text-brand-violet grid place-items-center shrink-0"><Icon name={c.icon} size={16} /></span>
                  <span className="text-[13px] font-medium text-ink">{getCategoryName(c.slug, lang)}</span>
                </button>
              ))}
            </>
          )}
          {query && (
            <>
              <div className="text-[10px] font-bold uppercase tracking-wide text-ink-faint px-3 pt-3 pb-1">{t.products}</div>
              {prods.length === 0 && loaded && <div className="px-3 py-3 text-[13px] text-ink-muted">{t.none}</div>}
              {prods.map((p) => (
                <button key={p.id} onClick={() => go(`/${lang}/catalog/${p.slug || p.id}`)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-violet/5 text-start transition-colors">
                  <span className="w-9 h-9 rounded-lg img-ph overflow-hidden grid place-items-center text-ink-faint shrink-0">
                    {p.image_url ? <img src={imageUrl(p.image_url)} alt="" className="w-full h-full object-cover" /> : <Icon name="package" size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink truncate">{nameOf(p)}</span>
                    {p.sku && <span className="block text-[11px] text-ink-muted truncate tabular">{p.sku}</span>}
                  </span>
                  <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={13} className="text-ink-faint shrink-0" />
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
