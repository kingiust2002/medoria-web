// components/catalog/CompareDrawer.jsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useCompare } from "@/lib/compare";
import { supabase, imageUrl } from "@/lib/supabase";
import { getTranslations } from "@/lib/i18n";
import { priceLabel, isOnRequest } from "@/lib/price";
import Icon from "@/components/shared/Icon";

export default function CompareDrawer({ lang }) {
  const t = getTranslations(lang);
  const { ids, count, remove, clear, max } = useCompare();
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (ids.length === 0) { setProducts([]); return; }
    supabase
      .from("products")
      .select("id,name_ru,name_tg,name_en,name_fa,price,unit,image_url")
      .in("id", ids)
      .then(({ data }) => setProducts(data || []));
  }, [ids]);

  if (count === 0) return null;

  return (
    <>
      {/* Floating tab */}
      <div
        className={[
          "fixed left-1/2 -translate-x-1/2 z-[55] transition-all",
          open ? "bottom-0" : "bottom-16 md:bottom-6",
        ].join(" ")}
      >
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="bg-brand-gradient text-white shadow-brand rounded-full ps-2 pe-4 py-2 flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform"
          >
            <div className="flex -space-x-1.5">
              {products.slice(0, 3).map((p) => (
                <div key={p.id} className="w-7 h-7 rounded-full bg-white border-2 border-white overflow-hidden">
                  {p.image_url ? (
                    <img src={imageUrl(p.image_url)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-tint-blue flex items-center justify-center text-primary">
                      <Icon name="package" size={13} />
                    </div>
                  )}
                </div>
              ))}
              {count > 3 && (
                <div className="w-7 h-7 rounded-full bg-white text-primary font-bold text-[10px] flex items-center justify-center border-2 border-white">
                  +{count - 3}
                </div>
              )}
            </div>
            <span className="text-[12px] font-bold whitespace-nowrap">
              {t.compare.drawerText(count)}
            </span>
            <Icon name="arrow" size={13} className="-rotate-90" />
          </button>
        )}
      </div>

      {/* Drawer */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-[50]" />
          <div className="fixed bottom-0 inset-x-0 z-[56] bg-surface rounded-t-3xl border-t border-line shadow-hover p-4 md:p-6 max-h-[80vh] overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg md:text-xl font-bold text-ink">{t.compare.title}</h3>
                  <p className="text-[11px] text-ink-faint">{count}/{max} · {t.compare.subtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={clear} className="text-[11px] text-ink-muted hover:text-warn font-medium">
                    {t.compare.clear}
                  </button>
                  <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-full bg-canvas-soft hover:bg-line text-ink-muted flex items-center justify-center transition-colors">
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
                {products.map((p) => {
                  const name = p[`name_${lang}`] || p.name_en;
                  return (
                    <div key={p.id} className="card p-2.5 flex items-center gap-2.5 relative">
                      <div className="w-10 h-10 rounded-lg img-ph overflow-hidden shrink-0">
                        {p.image_url ? (
                          <img src={imageUrl(p.image_url)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-brand-violet"><Icon name="package" size={16} /></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-ink truncate">{name}</div>
                        <div className="text-[10px] text-ink-faint tabular">{isOnRequest(p) ? priceLabel(p, lang) : `$${p.price}/${p.unit}`}</div>
                      </div>
                      <button onClick={() => remove(p.id)} className="text-ink-faint hover:text-warn w-6 h-6 flex items-center justify-center shrink-0">
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  );
                })}
                {Array.from({ length: max - products.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="border-2 border-dashed border-line rounded-2xl p-2.5 flex items-center justify-center min-h-[60px]">
                    <span className="text-[10px] text-ink-faint">+ {t.product.addToCompare}</span>
                  </div>
                ))}
              </div>

              <Link href={`/${lang}/compare`} onClick={() => setOpen(false)} className="btn-primary size-lg w-full">
                {t.compare.title} ({count})
                <Icon name="arrow" size={15} />
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
